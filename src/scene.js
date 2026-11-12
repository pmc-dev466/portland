import { QUAD_VERT, ROTOR_FRAG, SCENE_FRAG, SCENE_VERT, SPRITE_FRAG } from './shaders.js';

const MAX_CLOUDS = 7;
const MAX_PIXELS = 3.6e6; // cap the framebuffer so big hi-dpi screens stay smooth

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function program(gl, vert, frag) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u: uniforms };
}

function texture(gl, source, { premultiply = false, mipmap = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  return tex;
}

// Two-row gradient: row 0 is the sky at the painting's left edge, row 1 at its right.
function skyTexture(gl, lut) {
  const width = lut[0].length;
  const data = new Uint8Array(width * lut.length * 4);
  lut.forEach((row, j) => row.forEach(([r, g, b], i) => data.set([r, g, b, 255], (j * width + i) * 4)));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, lut.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

/**
 * WebGL renderer for the island. `images` holds decoded HTMLImageElements and
 * `meta` is assets/scene.json. Returns null when WebGL2 is unavailable.
 */
export function createScene(canvas, images, meta) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  const scenePass = program(gl, SCENE_VERT, SCENE_FRAG);
  const rotorPass = program(gl, QUAD_VERT, ROTOR_FRAG);
  const spritePass = program(gl, QUAD_VERT, SPRITE_FRAG);

  const tex = {
    base: texture(gl, images.base),
    maskA: texture(gl, images.maskA),
    maskB: texture(gl, images.maskB, { mipmap: false }),
    maskC: texture(gl, images.maskC, { mipmap: false }),
    clouds: texture(gl, images.clouds, { premultiply: true }),
    rotor: texture(gl, images.rotor, { premultiply: true }),
    pole: texture(gl, images.pole, { premultiply: true }),
    sky: skyTexture(gl, meta.skyLut),
  };

  // One buffer serves both the fullscreen pass (-1..1) and unit quads (0..1).
  const fullscreen = gl.createVertexArray();
  gl.bindVertexArray(fullscreen);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // scene.json stores the homography row-major; GLSL wants column-major.
  const h = meta.rotor.Hinv;
  const hinv = new Float32Array([h[0], h[3], h[6], h[1], h[4], h[7], h[2], h[5], h[8]]);

  const cloudRect = new Float32Array(MAX_CLOUDS * 4);
  const cloudUV = new Float32Array(MAX_CLOUDS * 4);
  const cloudFx = new Float32Array(MAX_CLOUDS * 2);

  let width = 1;
  let height = 1;
  let dpr = 1;

  function resize(w, h2) {
    width = w;
    height = h2;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    dpr = Math.min(dpr, Math.sqrt(MAX_PIXELS / (w * h2)));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h2 * dpr);
    dpr = canvas.width / w;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function setView(pass, view, light) {
    gl.useProgram(pass.prog);
    gl.uniform2f(pass.u.uViewport, width, height);
    gl.uniform1f(pass.u.uDpr, dpr);
    gl.uniform2f(pass.u.uCenter, view.x, view.y);
    gl.uniform1f(pass.u.uScale, view.scale);
    gl.uniform1f(pass.u.uNight, light.night);
    gl.uniform1f(pass.u.uDusk, light.dusk);
  }

  function bind(pass, unit, name, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(pass.u[name], unit);
  }

  /**
   * @param view   {x, y, scale}
   * @param state  {time, night, dusk, rotorAngle, clouds: [{x,y,w,h,sprite,alpha,flip}]}
   */
  function render(view, state) {
    const light = { night: state.night, dusk: state.dusk };

    gl.disable(gl.BLEND);
    setView(scenePass, view, light);
    gl.uniform1f(scenePass.u.uTime, state.time);
    gl.uniform2f(scenePass.u.uSkyRange, meta.skyLutRange[0], meta.skyLutRange[1]);
    bind(scenePass, 0, 'uBase', tex.base);
    bind(scenePass, 1, 'uMaskA', tex.maskA);
    bind(scenePass, 2, 'uMaskB', tex.maskB);
    bind(scenePass, 3, 'uMaskC', tex.maskC);
    bind(scenePass, 4, 'uSky', tex.sky);
    bind(scenePass, 5, 'uClouds', tex.clouds);
    cloudRect.fill(0);
    cloudFx.fill(0);
    state.clouds.slice(0, MAX_CLOUDS).forEach((c, i) => {
      const s = meta.clouds[c.sprite];
      cloudRect.set([c.x, c.y, c.w, c.h], i * 4);
      cloudUV.set([s.u, s.v, s.w, s.h], i * 4);
      cloudFx.set([c.alpha, c.flip ? 1 : 0], i * 2);
    });
    gl.uniform4fv(scenePass.u.uCloudRect, cloudRect);
    gl.uniform4fv(scenePass.u.uCloudUV, cloudUV);
    gl.uniform2fv(scenePass.u.uCloudFx, cloudFx);
    gl.bindVertexArray(fullscreen);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(quad);

    setView(rotorPass, view, light);
    gl.uniform4fv(rotorPass.u.uRect, meta.rotor.bounds);
    gl.uniformMatrix3fv(rotorPass.u.uHinv, false, hinv);
    gl.uniform1f(rotorPass.u.uCanon, meta.rotor.canon);
    gl.uniform1f(rotorPass.u.uAngle, state.rotorAngle);
    bind(rotorPass, 0, 'uTex', tex.rotor);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    setView(spritePass, view, light);
    gl.uniform4fv(spritePass.u.uRect, meta.pole);
    bind(spritePass, 0, 'uTex', tex.pole);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { resize, render, gl };
}
