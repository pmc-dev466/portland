// GLSL for the living scene. Everything works in "scene pixels": the coordinate
// system of the 2048x2048 source illustration, so layers line up exactly.

const VIEW_UNIFORMS = /* glsl */ `
uniform vec2 uViewport;   // css px
uniform float uDpr;
uniform vec2 uCenter;     // scene px shown at the viewport centre
uniform float uScale;     // css px per scene px
uniform float uNight;     // 0 day .. 1 night
uniform float uDusk;      // peaks mid-transition
`;

// Shared colour grade so sails, spindle and scene change light together.
const GRADE = /* glsl */ `
vec3 grade(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 night = mix(vec3(l), c, 0.62) * vec3(0.20, 0.29, 0.52);
  night = pow(night, vec3(1.06));
  vec3 day = c * mix(vec3(1.0), vec3(1.07, 0.87, 0.76), uDusk);
  return mix(day, night, uNight);
}
`;

export const SCENE_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const SCENE_FRAG = /* glsl */ `#version 300 es
precision highp float;
${VIEW_UNIFORMS}
uniform sampler2D uBase, uMaskA, uMaskB, uMaskC, uSky, uClouds;
uniform float uTime;
uniform vec2 uSkyRange;
#define CLOUDS 7
uniform vec4 uCloudRect[CLOUDS];  // x, y, w, h (scene px)
uniform vec4 uCloudUV[CLOUDS];    // atlas rect
uniform vec2 uCloudFx[CLOUDS];    // opacity, mirrored
out vec4 outColor;
${GRADE}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.7; a *= 0.5; }
  return s / 0.9375;
}
vec3 skyAt(vec2 uv) {
  float v = (uv.y - uSkyRange.x) / (uSkyRange.y - uSkyRange.x);
  return texture(uSky, vec2(v, 0.25 + 0.5 * clamp(uv.x, 0.0, 1.0))).rgb;
}
vec3 baseAt(vec2 p) { return texture(uBase, clamp(p / 2048.0, 0.0006, 0.9994)).rgb; }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 p = uCenter + (frag - 0.5 * uViewport) / uScale;
  vec2 uv = p / 2048.0;
  vec2 cuv = clamp(uv, 0.0006, 0.9994);
  float t = uTime;

  // The painting fades into a matching sky gradient beyond its edges.
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float inside = smoothstep(0.0, 0.085, edge + (noise(p * 0.006) - 0.5) * 0.05);
  float inImage = step(0.0, edge);

  vec4 mA = texture(uMaskA, cuv) * inImage;
  vec4 mB = texture(uMaskB, cuv) * inImage;
  float nearSolid = texture(uMaskC, cuv).r * inImage;
  float solid = mA.r, sway = mA.g, stream = mA.b;
  float fall = mB.r, emissive = mB.g, halo = mB.b;

  // --- displacement field: billowing clouds + wind in the foliage -----------
  vec2 d = vec2(0.0);
  vec2 billow = vec2(fbm(p * 0.0034 + vec2(t * 0.030, t * 0.011)),
                     fbm(p * 0.0034 + vec2(7.3 - t * 0.021, 3.1 + t * 0.027))) - 0.5;
  vec2 puff = vec2(noise(p * 0.013 + vec2(t * 0.09, 0.0)), noise(p * 0.013 + vec2(4.0, t * 0.08))) - 0.5;
  d += (billow * 26.0 + puff * 5.0) * (1.0 - nearSolid);

  float gust = 0.5 + 0.5 * sin(p.x * 0.0042 - t * 0.85 + 1.6 * sin(t * 0.23));
  gust *= gust;
  vec2 rustle = vec2(noise(p * 0.035 + vec2(t * 1.3, 0.0)), noise(p * 0.035 + vec2(9.0, t * 1.1))) - 0.5;
  vec2 bend = vec2(sin(t * 1.25 + p.y * 0.011 + p.x * 0.006), 0.3 * cos(t * 1.05 + p.x * 0.012));
  d += (bend * (1.6 + 4.2 * gust) + rustle * (2.0 + 3.0 * gust)) * sway;

  vec3 col = baseAt(p + d);

  // --- water: looping flow along the stream and down the fall ---------------
  float water = max(stream, fall);
  if (water > 0.004) {
    float k = fall / (stream + fall + 1e-4);
    vec2 dir = normalize(mix(vec2(0.52, 0.85), vec2(0.04, 1.0), k));
    float len = mix(30.0, 64.0, k) * water;
    float ph = fract(t * mix(0.30, 0.52, k));
    vec3 c1 = baseAt(p - dir * len * (ph - 0.5));
    vec3 c2 = baseAt(p - dir * len * (fract(ph + 0.5) - 0.5));
    vec3 w = mix(c1, c2, abs(2.0 * ph - 1.0));
    float streak = noise(vec2(p.x * 0.09 + p.y * 0.01, p.y * 0.016 - t * 1.5));
    w += vec3(0.9, 0.97, 1.0) * smoothstep(0.60, 0.92, streak) * 0.20 * fall;
    float glint = noise(p * 0.11 + vec2(t * 0.9, -t * 1.6));
    w += vec3(1.0) * smoothstep(0.80, 0.97, glint) * 0.16 * stream;
    col = mix(col, w, water);
  }

  vec3 sky = skyAt(uv);
  col = mix(sky, col, inside);
  solid *= inside;

  // --- drifting clouds: pass behind the island and behind the big cumulus ---
  float cloudiness = clamp((col.r - sky.r) / max(0.94 - sky.r, 0.05), 0.0, 1.0);
  float open = (1.0 - solid) * (1.0 - 0.92 * smoothstep(0.12, 0.55, cloudiness));
  for (int i = 0; i < CLOUDS; i++) {
    vec4 r = uCloudRect[i];
    vec2 q = (p - r.xy) / r.zw;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
      if (uCloudFx[i].y > 0.5) q.x = 1.0 - q.x;
      vec4 c = texture(uClouds, uCloudUV[i].xy + clamp(q, 0.004, 0.996) * uCloudUV[i].zw);
      float kk = uCloudFx[i].x * open;
      col = col * (1.0 - c.a * kk) + c.rgb * kk;
    }
  }

  // --- light: cloud shadows gliding over the island, low mist ---------------
  float shade = fbm(p * 0.0015 + vec2(-t * 0.022, t * 0.004));
  col *= 1.0 - 0.17 * smoothstep(0.50, 0.74, shade) * solid * (1.0 - 0.6 * uNight);
  float sunny = smoothstep(0.52, 0.30, shade) * solid * (1.0 - uNight);
  col += vec3(0.045, 0.032, 0.008) * sunny;

  float mist = fbm(vec2(p.x * 0.0015 - t * 0.014, p.y * 0.0042 + t * 0.005));
  float band = smoothstep(1180.0, 1520.0, p.y) * (1.0 - smoothstep(1800.0, 2100.0, p.y));
  col = mix(col, vec3(0.975, 0.955, 0.965), smoothstep(0.50, 0.82, mist) * band * 0.30);

  // --- day / night ----------------------------------------------------------
  vec3 g = grade(col);
  float clearSky = (1.0 - solid) * (1.0 - smoothstep(0.10, 0.45, cloudiness));
  g = mix(g, g * vec3(0.50, 0.58, 0.80), uNight * clearSky);

  if (uNight > 0.001) {
    vec2 cell = floor(p / 15.0);
    float h = hash(cell);
    vec2 sp = (cell + 0.2 + 0.6 * vec2(hash(cell + 3.1), hash(cell + 7.7))) * 15.0;
    float star = step(0.972, h) * smoothstep(2.2 / max(uScale, 0.4), 0.0, length(p - sp));
    star *= 0.55 + 0.45 * sin(t * (1.0 + 3.0 * hash(cell + 1.3)) + h * 40.0);
    g += vec3(0.95, 0.97, 1.0) * star * clearSky * uNight * (1.0 - smoothstep(1000.0, 1750.0, p.y));

    vec2 mp = p - vec2(1655.0, 285.0);
    float disc = smoothstep(47.0, 44.5, length(mp)) * smoothstep(40.0, 44.0, length(mp - vec2(19.0, -11.0)));
    float glow = exp(-length(mp) / 170.0);
    float veil = (1.0 - solid) * (1.0 - 0.85 * smoothstep(0.12, 0.5, cloudiness));
    g += (vec3(1.0, 0.97, 0.86) * disc + vec3(0.30, 0.42, 0.75) * glow * 0.32) * veil * uNight;

    float flicker = 0.93 + 0.07 * sin(t * 6.3 + sin(t * 2.1) * 2.0);
    g += vec3(1.0, 0.60, 0.22) * halo * 0.62 * flicker * uNight;
    g = mix(g, vec3(1.0, 0.84, 0.52), emissive * uNight * 0.95);
  }

  g += (hash(frag + fract(t)) - 0.5) / 255.0;   // dither the smooth sky
  outColor = vec4(g, 1.0);
}
`;

// Textured quad placed in scene space (spindle overlay).
export const QUAD_VERT = /* glsl */ `#version 300 es
${VIEW_UNIFORMS}
uniform vec4 uRect;   // x0, y0, x1, y1 in scene px
in vec2 aPos;         // 0..1
out vec2 vUV;
out vec2 vScene;
void main() {
  vUV = aPos;
  vScene = mix(uRect.xy, uRect.zw, aPos);
  vec2 s = (vScene - uCenter) * uScale / (0.5 * uViewport);
  gl_Position = vec4(s.x, -s.y, 0.0, 1.0);
}
`;

export const SPRITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
${VIEW_UNIFORMS}
uniform sampler2D uTex;
in vec2 vUV;
in vec2 vScene;
out vec4 outColor;
${GRADE}
void main() {
  vec4 c = texture(uTex, vUV);                    // premultiplied
  vec3 rgb = c.a > 0.001 ? c.rgb / c.a : vec3(0.0);
  outColor = vec4(grade(rgb) * c.a, c.a);
}
`;

// Sails: the texture is a frontal view of the rotor. Each fragment is taken back
// through the perspective of the painting, then spun in the rotor's own plane.
export const ROTOR_FRAG = /* glsl */ `#version 300 es
precision highp float;
${VIEW_UNIFORMS}
uniform sampler2D uTex;
uniform mat3 uHinv;      // scene px -> canonical rotor px
uniform float uCanon;
uniform float uAngle;
in vec2 vUV;
in vec2 vScene;
out vec4 outColor;
${GRADE}
void main() {
  vec3 h = uHinv * vec3(vScene, 1.0);
  vec2 q = h.xy / h.z - 0.5 * (uCanon - 1.0);
  float cs = cos(uAngle), sn = sin(uAngle);
  q = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y);
  vec2 uv = (q + 0.5 * uCanon) / uCanon;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 c = texture(uTex, uv);
  vec3 rgb = c.a > 0.001 ? c.rgb / c.a : vec3(0.0);
  outColor = vec4(grade(rgb) * c.a, c.a);
}
`;
