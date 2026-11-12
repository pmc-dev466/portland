// Small living things drawn over the scene on a 2D canvas: gulls, drifting
// leaves and (at night) fireflies. All positions are in scene pixels.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

const GULLS = [
  // Loops start at the spots where the painted gulls were.
  { cx: 1250, cy: 300, rx: 330, ry: 70, speed: 0.105, phase: 0.98, size: 62, dir: 1 },
  { cx: 1690, cy: 560, rx: 290, ry: 95, speed: 0.082, phase: 3.95, size: 54, dir: -1 },
  { cx: 700, cy: 330, rx: 620, ry: 120, speed: 0.046, phase: 2.2, size: 30, dir: 1 },
];

const LEAF_SOURCES = [
  { x: 960, y: 820, r: 60, colors: ['#f08a3c', '#e8632c', '#f6a94f'], weight: 3 },
  { x: 870, y: 935, r: 30, colors: ['#ee6a3a', '#f08a3c'], weight: 1 },
  { x: 1455, y: 790, r: 120, colors: ['#8fbf4d', '#b5cf5a', '#6fa63e'], weight: 2 },
  { x: 1140, y: 1340, r: 40, colors: ['#f08a3c', '#e8632c'], weight: 1 },
];

// Rough outline of the meadow, used to scatter fireflies.
const MEADOW = [[780, 1060], [1040, 950], [1480, 965], [1640, 1120], [1280, 1230], [980, 1290]];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function gullPosition(g, time) {
  const a = time * g.speed * g.dir + g.phase;
  return {
    x: g.cx + g.rx * Math.sin(a),
    y: g.cy + g.ry * Math.sin(2 * a + g.phase) * 0.6 + 14 * Math.sin(time * 0.7 + g.phase),
  };
}

function drawGull(ctx, g, time, alpha) {
  const here = gullPosition(g, time);
  const ahead = gullPosition(g, time + 0.25);
  const vx = ahead.x - here.x;
  const vy = ahead.y - here.y;
  const facing = vx >= 0 ? 1 : -1;
  const climb = Math.atan2(vy, Math.abs(vx));

  // A few wingbeats, then a glide.
  const cycle = (time * 0.21 + g.phase) % 1;
  const effort = Math.min(1, Math.max(0, (0.55 - cycle) * 8)) * Math.min(1, cycle * 12);
  const beat = Math.sin(time * 8.2 + g.phase * 3);
  const lift = (0.16 + 0.5 * beat * effort + 0.05 * Math.sin(time * 1.3)) * g.size;
  const span = g.size * (0.92 - 0.1 * Math.abs(beat) * effort);

  ctx.save();
  ctx.translate(here.x, here.y);
  ctx.scale(facing, 1);
  ctx.rotate(climb * 0.6);
  ctx.globalAlpha = alpha;

  const wing = (side, shade) => {
    // side: -1 far wing, 1 near wing (drawn slightly longer for a 3/4 view)
    const s = side > 0 ? 1 : 0.86;
    const tipX = -0.12 * g.size * side + span * 0.1;
    const tipY = -lift * s - span * 0.5 * side * 0.22;
    const reach = span * s;
    ctx.beginPath();
    ctx.moveTo(g.size * 0.16, 0);
    ctx.quadraticCurveTo(g.size * 0.1 + tipX * 0.2, -lift * 0.75 - reach * 0.16, tipX - side * reach * 0.02, tipY - reach * 0.42);
    ctx.quadraticCurveTo(-g.size * 0.08, -lift * 0.35 - reach * 0.08, -g.size * 0.14, g.size * 0.02);
    ctx.closePath();
    ctx.fillStyle = shade;
    ctx.fill();
  };

  ctx.shadowColor = 'rgba(255,255,255,0.55)';
  ctx.shadowBlur = g.size * 0.08;
  wing(-1, '#dfe8f2');
  // body + tail
  ctx.beginPath();
  ctx.moveTo(g.size * 0.36, -g.size * 0.01);
  ctx.quadraticCurveTo(g.size * 0.12, -g.size * 0.1, -g.size * 0.2, -g.size * 0.02);
  ctx.lineTo(-g.size * 0.4, g.size * 0.03);
  ctx.quadraticCurveTo(-g.size * 0.05, g.size * 0.11, g.size * 0.36, -g.size * 0.01);
  ctx.fillStyle = '#f7f9fc';
  ctx.fill();
  wing(1, '#ffffff');
  ctx.restore();
}

function spawnLeaf() {
  const total = LEAF_SOURCES.reduce((n, s) => n + s.weight, 0);
  let pick = Math.random() * total;
  const src = LEAF_SOURCES.find((s) => (pick -= s.weight) < 0) || LEAF_SOURCES[0];
  const a = rand(0, TAU);
  const r = Math.sqrt(Math.random()) * src.r;
  return {
    x: src.x + Math.cos(a) * r,
    y: src.y + Math.sin(a) * r * 0.7,
    vx: rand(22, 52),
    vy: rand(14, 30),
    spin: rand(-3, 3),
    rot: rand(0, TAU),
    flutter: rand(0, TAU),
    size: rand(3.2, 5.6),
    color: src.colors[(Math.random() * src.colors.length) | 0],
    age: 0,
    life: rand(5, 9),
  };
}

export function createLife(canvas) {
  const ctx = canvas.getContext('2d');
  const leaves = [];
  let nextLeaf = 1.5;
  let width = 1;
  let height = 1;
  let dpr = 1;

  const fireflies = [];
  while (fireflies.length < 22) {
    const x = rand(760, 1660);
    const y = rand(940, 1300);
    if (inPolygon(x, y, MEADOW)) fireflies.push({ x, y, phase: rand(0, TAU), speed: rand(0.25, 0.6), r: rand(14, 34) });
  }

  function resize(w, h, ratio) {
    width = w;
    height = h;
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function update(dt, time) {
    nextLeaf -= dt;
    if (nextLeaf <= 0 && leaves.length < 16) {
      leaves.push(spawnLeaf());
      nextLeaf = rand(0.5, 1.8);
    }
    const gust = 0.75 + 0.5 * Math.sin(time * 0.85) ** 2;
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.age += dt;
      l.x += (l.vx * gust + Math.sin(time * 2 + l.flutter) * 12) * dt;
      l.y += (l.vy + Math.cos(time * 2.6 + l.flutter) * 14) * dt;
      l.rot += l.spin * dt;
      if (l.age > l.life) leaves.splice(i, 1);
    }
  }

  function draw(view, time, night) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = dpr * view.scale;
    ctx.setTransform(k, 0, 0, k, dpr * (width / 2 - view.x * view.scale), dpr * (height / 2 - view.y * view.scale));

    const dim = 1 - 0.55 * night;
    for (const l of leaves) {
      const fade = Math.min(1, l.age * 2) * Math.min(1, (l.life - l.age) * 1.2);
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(time * 3 + l.flutter)));
      ctx.globalAlpha = fade * dim;
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, l.size, l.size * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    const awake = 1 - Math.min(1, night * 1.6); // gulls roost at dusk
    if (awake > 0.01) for (const g of GULLS) drawGull(ctx, g, time, awake);

    if (night > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of fireflies) {
        const x = f.x + Math.sin(time * f.speed + f.phase) * f.r + Math.sin(time * f.speed * 2.3) * 8;
        const y = f.y + Math.cos(time * f.speed * 0.8 + f.phase) * f.r * 0.5 - 12;
        const pulse = Math.max(0, Math.sin(time * 1.4 + f.phase * 5)) ** 2;
        const a = night * (0.25 + 0.75 * pulse);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 13);
        glow.addColorStop(0, `rgba(255, 240, 150, ${a})`);
        glow.addColorStop(0.25, `rgba(240, 220, 90, ${a * 0.45})`);
        glow.addColorStop(1, 'rgba(240, 220, 90, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 13, y - 13, 26, 26);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  return { resize, update, draw };
}
