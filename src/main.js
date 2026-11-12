import { PROFILE, SECTIONS } from './content.js';
import { createLife } from './life.js';
import { createScene } from './scene.js';

const ASSETS = {
  base: 'assets/base.webp',
  maskA: 'assets/maskA.png',
  maskB: 'assets/maskB.png',
  maskC: 'assets/maskC.png',
  clouds: 'assets/clouds.webp',
  rotor: 'assets/rotor.png',
  pole: 'assets/pole.png',
};

const HOME = { x: 1075, y: 985 };           // scene point centred when nothing is open
const HOME_FRAME = { w: 1500, h: 1800 };    // scene area that must always fit on screen
const CLOUD_SPAN = [-2000, 4100];           // drifting clouds wrap inside this range

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const pad = (n) => String(n).padStart(2, '0');
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function loadImage(src, onDone) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { onDone(); resolve(img); };
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

async function loadAssets(onProgress) {
  const entries = Object.entries(ASSETS);
  let done = 0;
  const tick = () => onProgress(++done / (entries.length + 1));
  const metaPromise = fetch('assets/scene.json').then((r) => {
    if (!r.ok) throw new Error('scene.json');
    tick();
    return r.json();
  });
  const loaded = await Promise.all(entries.map(([, src]) => loadImage(src, tick)));
  const images = Object.fromEntries(entries.map(([key], i) => [key, loaded[i]]));
  return { images, meta: await metaPromise };
}

// ------------------------------------------------------------------- panel UI
function renderBody(container, blocks) {
  container.replaceChildren();
  for (const block of blocks) {
    if (block.type === 'p') container.append(el('p', null, block.text));
    if (block.type === 'h') container.append(el('h3', 'panel__sub', block.text));
    if (block.type === 'facts') {
      const list = el('dl', 'facts');
      for (const [value, label] of block.items) {
        const item = el('div', 'facts__item');
        item.append(el('dt', null, value), el('dd', null, label));
        list.append(item);
      }
      container.append(list);
    }
    if (block.type === 'timeline') {
      const list = el('ol', 'timeline');
      for (const job of block.items) {
        const item = el('li', 'timeline__item');
        item.append(el('p', 'timeline__when', job.when), el('h3', 'timeline__role', job.role), el('p', 'timeline__where', job.where));
        if (job.points.length) {
          const points = el('ul', 'timeline__points');
          job.points.forEach((p) => points.append(el('li', null, p)));
          item.append(points);
        }
        list.append(item);
      }
      container.append(list);
    }
    if (block.type === 'groups') {
      for (const [name, tags] of block.items) {
        const group = el('section', 'stack');
        group.append(el('h3', 'stack__name', name));
        const row = el('ul', 'stack__tags');
        tags.forEach((t) => row.append(el('li', null, t)));
        group.append(row);
        container.append(group);
      }
    }
    if (block.type === 'contact') {
      const list = el('ul', 'contact');
      const link = (label, text, href, external) => {
        const item = el('li');
        const a = el('a', 'contact__link');
        a.href = href;
        if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.append(el('span', 'contact__label', label), el('span', 'contact__value', text));
        item.append(a);
        list.append(item);
      };
      link('Correo', PROFILE.email, `mailto:${PROFILE.email}`);
      link('Web', PROFILE.site, `https://${PROFILE.site}`, true);
      link('Currículum', 'Descargar PDF', encodeURI(PROFILE.cv), true);
      container.append(list, el('p', 'contact__note', 'Cádiz, España · Disponible para cambiar de ubicación.'));
    }
  }
}

// ------------------------------------------------------------------------ app
async function start() {
  const stage = $('stage');
  const loader = $('loader');
  const fill = $('loader-fill');

  let assets;
  try {
    assets = await loadAssets((p) => { fill.style.transform = `scaleX(${p})`; });
  } catch (err) {
    console.error(err);
    loader.querySelector('.loader__hint').textContent = 'No se pudo cargar la escena. Recarga la página.';
    return;
  }

  const scene = createScene($('scene'), assets.images, assets.meta);
  if (!scene) {
    // No WebGL2: show the untouched illustration instead of a broken canvas.
    stage.classList.add('stage--static');
    stage.style.backgroundImage = `url("${encodeURI('resources/Pmzz_isometric_low_poly_floating_island_with_windmill_bright__40437587-4a46-4781-9d3e-a67948d53904_2.png')}")`;
  }
  const life = scene ? createLife($('life')) : null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    time: 0,
    rotorAngle: 0,
    night: 0,
    nightTarget: 0,
    paused: reduceMotion.matches,
    active: -1,
    pointer: { x: 0, y: 0, sx: 0, sy: 0 },
    view: { x: HOME.x, y: HOME.y, scale: 1 },
    intro: 1,
    width: 1,
    height: 1,
  };

  const clouds = [
    { sprite: 0, y: 40, size: 0.62, speed: 9, x: -900, alpha: 0.95, flip: false },
    { sprite: 2, y: 250, size: 0.42, speed: 13, x: 1650, alpha: 0.9, flip: true },
    { sprite: 1, y: 1420, size: 0.8, speed: 7, x: 2500, alpha: 0.9, flip: false },
    { sprite: 2, y: 620, size: 0.5, speed: 10.5, x: 3050, alpha: 0.92, flip: false },
    { sprite: 0, y: 1050, size: 0.7, speed: 6, x: -1550, alpha: 0.9, flip: true },
    { sprite: 1, y: 120, size: 0.38, speed: 15, x: 3500, alpha: 0.85, flip: true },
    { sprite: 2, y: 1560, size: 0.6, speed: 8.5, x: -500, alpha: 0.85, flip: true },
  ].map((c) => {
    const s = assets.meta.clouds[c.sprite];
    const w = s.srcWidth * c.size * 1.6;
    return { ...c, w, h: w / s.aspect };
  });

  // --- pins + index ---------------------------------------------------------
  const pins = SECTIONS.map((section, i) => {
    const pin = el('button', `pin pin--${section.label}`);
    pin.type = 'button';
    pin.setAttribute('aria-label', `${section.title} — ${section.place}`);
    pin.append(el('span', 'pin__dot'));
    const tag = el('span', 'pin__tag');
    tag.append(el('span', 'pin__num', pad(i + 1)), el('span', 'pin__name', section.title));
    pin.append(tag);
    pin.addEventListener('click', () => open(i));
    $('pins').append(pin);

    const item = el('li');
    const btn = el('button', 'index__btn');
    btn.type = 'button';
    btn.append(el('span', 'index__num', pad(i + 1)), el('span', 'index__name', section.title));
    btn.addEventListener('click', () => open(i));
    item.append(btn);
    $('index-list').append(item);
    return { pin, btn };
  });

  // --- panel ----------------------------------------------------------------
  const panel = $('panel');
  let lastFocus = null;

  function open(i) {
    const section = SECTIONS[i];
    if (state.active < 0) lastFocus = document.activeElement;
    state.active = i;
    $('panel-kicker').textContent = `${pad(i + 1)} — ${section.place}`;
    $('panel-title').textContent = section.title;
    $('panel-lede').textContent = section.lede;
    renderBody($('panel-body'), section.body);
    const prev = SECTIONS[(i + SECTIONS.length - 1) % SECTIONS.length];
    const next = SECTIONS[(i + 1) % SECTIONS.length];
    $('panel-prev').textContent = `← ${prev.title}`;
    $('panel-next').textContent = `${next.title} →`;
    $('panel-scroll').scrollTop = 0;
    panel.hidden = false;
    // restart the entrance animation when stepping between sections
    panel.classList.remove('panel--in');
    void panel.offsetWidth;
    panel.classList.add('panel--in');
    document.body.classList.add('is-open');
    pins.forEach((p, n) => {
      p.pin.classList.toggle('is-active', n === i);
      p.btn.classList.toggle('is-active', n === i);
      p.btn.setAttribute('aria-current', n === i ? 'true' : 'false');
    });
    $('panel-title').focus({ preventScroll: true });
  }

  function close() {
    if (state.active < 0) return;
    state.active = -1;
    panel.classList.remove('panel--in');
    panel.hidden = true;
    document.body.classList.remove('is-open');
    pins.forEach((p) => {
      p.pin.classList.remove('is-active');
      p.btn.classList.remove('is-active');
      p.btn.removeAttribute('aria-current');
    });
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  const step = (d) => open((state.active + d + SECTIONS.length) % SECTIONS.length);
  $('panel-close').addEventListener('click', close);
  $('panel-prev').addEventListener('click', () => step(-1));
  $('panel-next').addEventListener('click', () => step(1));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (state.active >= 0 && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    }
  });
  stage.addEventListener('click', close);

  // --- light + motion toggles -------------------------------------------------
  const lightBtn = $('toggle-light');
  const motionBtn = $('toggle-motion');
  const syncButtons = () => {
    const night = state.nightTarget === 1;
    lightBtn.setAttribute('aria-pressed', String(night));
    lightBtn.querySelector('.chip-btn__text').textContent = night ? 'Día' : 'Noche';
    lightBtn.dataset.mode = night ? 'night' : 'day';
    document.body.classList.toggle('is-night', night);
    motionBtn.setAttribute('aria-pressed', String(state.paused));
    motionBtn.querySelector('.chip-btn__text').textContent = state.paused ? 'Reanudar' : 'Pausar';
    motionBtn.dataset.mode = state.paused ? 'paused' : 'playing';
  };
  lightBtn.addEventListener('click', () => { state.nightTarget = state.nightTarget ? 0 : 1; syncButtons(); });
  motionBtn.addEventListener('click', () => { state.paused = !state.paused; syncButtons(); });
  syncButtons();

  // --- camera -----------------------------------------------------------------
  const isSheet = () => window.matchMedia('(max-width: 760px)').matches;

  function targetView() {
    const fit = Math.min(state.width / HOME_FRAME.w, state.height / HOME_FRAME.h);
    if (state.active < 0) return { x: HOME.x, y: HOME.y, scale: fit };
    const section = SECTIONS[state.active];
    const scale = fit * section.zoom * (isSheet() ? 0.9 : 1);
    // keep the place visible in the area the panel leaves free
    const focus = isSheet()
      ? { x: state.width * 0.5, y: state.height * 0.17 }
      : { x: (state.width - panel.offsetWidth) * 0.5, y: state.height * 0.52 };
    return {
      x: section.anchor[0] - (focus.x - state.width / 2) / scale,
      y: section.anchor[1] - (focus.y - state.height / 2) / scale,
      scale,
    };
  }

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    if (scene) {
      scene.resize(state.width, state.height);
      life.resize(state.width, state.height, $('scene').width / state.width);
    }
  }
  window.addEventListener('resize', resize);
  resize();
  Object.assign(state.view, targetView());

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    state.pointer.x = (e.clientX / state.width) * 2 - 1;
    state.pointer.y = (e.clientY / state.height) * 2 - 1;
  });

  // --- frame loop -------------------------------------------------------------
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const motion = state.paused ? 0 : 1;

    if (motion) {
      state.time += dt;
      state.rotorAngle += dt * (0.34 + 0.2 * Math.sin(state.time * 0.23) ** 2);
      for (const c of clouds) {
        c.x += c.speed * dt;
        if (c.x > CLOUD_SPAN[1]) c.x = CLOUD_SPAN[0] - c.w;
      }
      life?.update(dt, state.time);
    }

    // light eases even while paused so the toggle always responds
    const dn = state.nightTarget - state.night;
    state.night = Math.abs(dn) < 0.002 ? state.nightTarget : state.night + dn * (1 - Math.exp(-dt * 1.6));
    const dusk = Math.sin(Math.PI * clamp01(state.night));

    const target = targetView();
    const ease = 1 - Math.exp(-dt * (reduceMotion.matches ? 60 : 3.4));
    state.view.x += (target.x - state.view.x) * ease;
    state.view.y += (target.y - state.view.y) * ease;
    state.view.scale += (target.scale - state.view.scale) * ease;

    state.intro += (0 - state.intro) * (1 - Math.exp(-dt * 1.4));
    state.pointer.sx += (state.pointer.x - state.pointer.sx) * (1 - Math.exp(-dt * 3));
    state.pointer.sy += (state.pointer.y - state.pointer.sy) * (1 - Math.exp(-dt * 3));
    const sway = reduceMotion.matches ? 0 : 1;
    const view = {
      x: state.view.x + state.pointer.sx * 14 * sway,
      y: state.view.y + state.pointer.sy * 9 * sway,
      scale: state.view.scale * (1 + 0.1 * state.intro * sway),
    };

    if (scene) {
      scene.render(view, {
        time: state.time,
        night: state.night,
        dusk,
        rotorAngle: state.rotorAngle,
        // far clouds answer the pointer less than the island: a hint of depth
        clouds: clouds.map((c) => ({ ...c, x: c.x + state.pointer.sx * 9 * sway, y: c.y + state.pointer.sy * 5 * sway })),
      });
      life.draw(view, state.time, state.night);
    }

    for (let i = 0; i < SECTIONS.length; i++) {
      const [ax, ay] = SECTIONS[i].anchor;
      const x = (ax - view.x) * view.scale + state.width / 2;
      const y = (ay - view.y) * view.scale + state.height / 2;
      pins[i].pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame((now) => {
    last = now;
    frame(now);
    document.body.classList.add('is-ready');
    loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  });
}

start();
