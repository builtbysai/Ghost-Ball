// The five halls. Each is a place from pool's history rather than an art
// movement: felt, rails, lamp, wall art and UI accent all come from the place.
// Physics is identical in every hall; only look and sound change.

const TAU = Math.PI * 2;

function glow(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function cone(ctx, x, top, w0, w1, bottom, rgb, a) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w0 / 2, top); ctx.lineTo(x + w0 / 2, top); ctx.lineTo(x + w1 / 2, bottom); ctx.lineTo(x - w1 / 2, bottom); ctx.closePath();
  ctx.fill();
}

export const DISPLAY_FONT = '"Bahnschrift","DIN Condensed","Avenir Next Condensed","Arial Narrow",system-ui,sans-serif';

export const HALLS = [
  {
    id: 'parlor', name: 'The Parlor', year: '1893', tagline: 'Gas-lit club. Walnut, bone and sage baize.',
    cloth: { base: '#4d7c55', light: '#6a9c70', dark: '#2a4a33', rubber: '#3b6444', nap: 'rgba(255,255,240,0.04)' },
    rail: { kind: 'wood', a: '#5b3a25', b: '#372114', grain: 'rgba(20,8,2,0.38)', hi: 'rgba(255,205,150,0.18)', trim: '#d8c79a' },
    plate: '#8d7c5b', plateDark: '#3d352a', sight: '#efe4c8',
    lamp: { rgb: '255,222,170', a: 0.22, r: 1.5 }, spot: 0.5,
    accent: '#ffb347', accent2: '#d8c79a',
    ui: { bg: '#110d09', panel: '#1a140e', ink: '#f3e9d2', sub: '#a99a7c', line: '#3a2e21' },
    sound: { root: 196, scale: [0, 2, 4, 7, 9], room: 0.24, bright: 0.85, tone: 380 },
    paint(ctx, W, H) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#23301f'); g.addColorStop(1, '#0c110a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // damask quatrefoils
      ctx.strokeStyle = 'rgba(160,190,140,0.09)'; ctx.lineWidth = 2;
      for (let y = 20; y < H; y += 84) for (let x = ((y / 84) % 2) * 42; x < W + 90; x += 84) {
        ctx.beginPath();
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.moveTo(x, y); ctx.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 11, 0, TAU); }
        ctx.stroke();
      }
      // wainscot
      ctx.fillStyle = 'rgba(40,24,14,0.85)'; ctx.fillRect(0, H * 0.74, W, H * 0.26);
      ctx.strokeStyle = 'rgba(216,199,154,0.14)'; ctx.lineWidth = 2;
      for (let x = 30; x < W; x += 150) ctx.strokeRect(x, H * 0.77, 120, H * 0.19);
      ctx.fillStyle = 'rgba(216,199,154,0.18)'; ctx.fillRect(0, H * 0.74, W, 3);
      // framed picture and sconces
      ctx.fillStyle = 'rgba(20,12,6,0.9)'; ctx.fillRect(W * 0.5 - 90, H * 0.04, 180, 98);
      ctx.strokeStyle = 'rgba(216,199,154,0.5)'; ctx.lineWidth = 4; ctx.strokeRect(W * 0.5 - 90, H * 0.04, 180, 98);
      for (const sx of [0.09, 0.91]) { glow(ctx, W * sx, H * 0.26, 200, '255,190,110', 0.30); ctx.fillStyle = '#e9c98a'; ctx.beginPath(); ctx.arc(W * sx, H * 0.26, 6, 0, TAU); ctx.fill(); }
      glow(ctx, W / 2, H * 0.5, Math.max(W, H) * 0.6, '255,214,150', 0.16);
    },
  },
  {
    id: 'hall61', name: 'Hall 1961', year: '1961', tagline: 'Smoke, one lamp, and money on the table.',
    cloth: { base: '#2c7654', light: '#3c9569', dark: '#144733', rubber: '#1f5f43', nap: 'rgba(255,255,255,0.035)' },
    rail: { kind: 'wood', a: '#6a5545', b: '#3d3129', grain: 'rgba(15,10,6,0.35)', hi: 'rgba(255,240,220,0.15)', trim: '#cfd4d8' },
    plate: '#c4c9cd', plateDark: '#4b5054', sight: '#e3e8ec',
    lamp: { rgb: '255,236,196', a: 0.3, r: 1.35 }, spot: 0.5,
    accent: '#6fd3c0', accent2: '#cfd4d8',
    ui: { bg: '#0b1011', panel: '#121a1b', ink: '#e8f1ef', sub: '#8ea8a3', line: '#22312f' },
    sound: { root: 174.6, scale: [0, 3, 5, 7, 10], room: 0.3, bright: 0.75, tone: 300 },
    paint(ctx, W, H) {
      ctx.fillStyle = '#12100e'; ctx.fillRect(0, 0, W, H);
      // wood-panel wall
      for (let x = 0; x < W; x += 46) {
        ctx.fillStyle = (x / 46) % 2 ? 'rgba(60,40,26,0.55)' : 'rgba(46,30,20,0.55)';
        ctx.fillRect(x, 0, 46, H * 0.86);
      }
      // cue rack on the left
      ctx.strokeStyle = 'rgba(210,190,150,0.28)'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(W * 0.02 + i * 14, H * 0.12); ctx.lineTo(W * 0.02 + i * 14 + 6, H * 0.62); ctx.stroke(); }
      ctx.fillStyle = 'rgba(30,20,12,0.9)'; ctx.fillRect(W * 0.01, H * 0.44, 96, 10);
      // floor
      const s = 34;
      for (let x = 0; x < W; x += s) for (let y = H * 0.86; y < H; y += s) {
        ctx.fillStyle = ((x / s + Math.floor((y - H * 0.86) / s)) % 2) ? '#1c1a17' : '#0d0c0b';
        ctx.fillRect(x, y, s, s);
      }
      // the lamp cone and drifting smoke
      cone(ctx, W / 2, 0, W * 0.12, W * 0.62, H, '255,232,180', 0.2);
      const rnd = seeded(61);
      for (let i = 0; i < 22; i++) glow(ctx, W * (0.2 + rnd() * 0.6), H * (0.05 + rnd() * 0.8), 90 + rnd() * 140, '230,225,210', 0.035);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'stage', name: 'The Stage', year: 'Now', tagline: 'Tournament blue under the lights.',
    cloth: { base: '#1d5fad', light: '#3079d0', dark: '#0c336d', rubber: '#154f95', nap: 'rgba(210,230,255,0.04)' },
    rail: { kind: 'glass', a: '#191b21', b: '#090a0d', grain: 'rgba(255,255,255,0.025)', hi: 'rgba(140,190,255,0.28)', trim: '#5ab0ff' },
    plate: '#2d3038', plateDark: '#0c0d10', sight: '#f2f6fb',
    lamp: { rgb: '220,235,255', a: 0.3, r: 1.6 }, spot: 0.55, led: true,
    accent: '#4da3ff', accent2: '#ffffff',
    ui: { bg: '#05070b', panel: '#0c1017', ink: '#ecf3ff', sub: '#8093b0', line: '#1b2534' },
    sound: { root: 146.8, scale: [0, 2, 5, 7, 9], room: 0.42, bright: 1.1, tone: 240 },
    paint(ctx, W, H) {
      ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, W, H);
      // crowd: rim-lit heads in soft rows
      const rnd = seeded(9);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 46; i++) {
        const x = (i + rnd() * 0.6) * (W / 44), y = H * 0.9 + row * 22 + rnd() * 6;
        ctx.fillStyle = `rgba(${18 + row * 6},${22 + row * 6},${34 + row * 8},0.95)`;
        ctx.beginPath(); ctx.arc(x, y, 15 + rnd() * 4, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(90,176,255,0.10)'; ctx.beginPath(); ctx.arc(x, y - 6, 12, Math.PI * 1.15, Math.PI * 1.85); ctx.fill();
      }
      for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(80,110,160,0.5)'; ctx.fillRect(rnd() * W, rnd() * H * 0.12, 2, 2); }
      // spotlights
      for (const x of [0.16, 0.5, 0.84]) cone(ctx, W * x, 0, W * 0.03, W * 0.32, H * 0.95, '160,200,255', 0.16);
      glow(ctx, W / 2, H * 0.52, Math.max(W, H) * 0.55, '120,170,255', 0.14);
      // LED floor strip
      const g = ctx.createLinearGradient(0, H * 0.965, 0, H);
      g.addColorStop(0, 'rgba(90,176,255,0.55)'); g.addColorStop(1, 'rgba(90,176,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.965, W, H * 0.035);
    },
  },
  {
    id: 'lastcall', name: 'Last Call', year: '1984', tagline: 'Corner bar. Neon, a jukebox, one more game.',
    cloth: { base: '#4b515c', light: '#666e7b', dark: '#292d34', rubber: '#3a3f48', nap: 'rgba(255,255,255,0.03)' },
    rail: { kind: 'formica', a: '#a12c31', b: '#6a1a1f', grain: 'rgba(0,0,0,0.2)', hi: 'rgba(255,220,220,0.2)', trim: '#dfe3e8' },
    plate: '#c9cdd2', plateDark: '#40444b', sight: '#f6f6f2',
    lamp: { rgb: '255,205,170', a: 0.24, r: 1.4 }, spot: 0.5,
    accent: '#ff5a4d', accent2: '#ffc266',
    ui: { bg: '#0e0a0b', panel: '#181112', ink: '#fbeeea', sub: '#b39692', line: '#3a2224' },
    sound: { root: 130.8, scale: [0, 3, 5, 7, 10], room: 0.34, bright: 0.95, tone: 330 },
    paint(ctx, W, H) {
      ctx.fillStyle = '#150d0e'; ctx.fillRect(0, 0, W, H);
      // brick
      const bw = 64, bh = 26;
      for (let y = 0, r = 0; y < H; y += bh, r++) for (let x = -(r % 2) * bw / 2; x < W; x += bw) {
        const t = ((x * 7 + y * 13) % 17) / 17;
        ctx.fillStyle = `rgba(${90 + t * 26},${34 + t * 10},${30 + t * 8},0.55)`;
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
      // neon: script sign, open sign, arrow
      const neon = (fn, rgb, blur) => { ctx.save(); ctx.shadowColor = `rgb(${rgb})`; ctx.shadowBlur = blur; fn(); ctx.restore(); };
      neon(() => {
        ctx.font = `italic 800 ${Math.round(H * 0.075)}px ${DISPLAY_FONT}`; ctx.fillStyle = '#ff6a5c'; ctx.textAlign = 'left';
        ctx.fillText('LAST CALL', W * 0.045, H * 0.13);
        ctx.strokeStyle = '#ffd0c8'; ctx.lineWidth = 1.5; ctx.strokeText('LAST CALL', W * 0.045, H * 0.13);
      }, '255,90,77', 26);
      neon(() => {
        ctx.font = `700 ${Math.round(H * 0.03)}px ${DISPLAY_FONT}`; ctx.fillStyle = '#7fd0ff'; ctx.textAlign = 'right';
        ctx.fillText('OPEN', W * 0.965, H * 0.09);
        ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 2; ctx.strokeRect(W * 0.965 - 82, H * 0.055, 92, H * 0.056);
      }, '127,208,255', 18);
      neon(() => {
        ctx.strokeStyle = '#ffc266'; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(W * 0.955, H * 0.5); ctx.lineTo(W * 0.985, H * 0.5); ctx.moveTo(W * 0.975, H * 0.47); ctx.lineTo(W * 0.985, H * 0.5); ctx.lineTo(W * 0.975, H * 0.53); ctx.stroke();
      }, '255,194,102', 16);
      glow(ctx, W * 0.14, H * 0.12, 340, '255,80,70', 0.20);
      glow(ctx, W * 0.93, H * 0.09, 260, '110,190,255', 0.14);
      // jukebox glow bottom-left
      ctx.fillStyle = 'rgba(30,20,20,0.95)';
      ctx.beginPath(); ctx.moveTo(W * 0.02, H); ctx.lineTo(W * 0.02, H * 0.78); ctx.quadraticCurveTo(W * 0.065, H * 0.7, W * 0.11, H * 0.78); ctx.lineTo(W * 0.11, H); ctx.fill();
      glow(ctx, W * 0.065, H * 0.84, 150, '255,150,60', 0.28);
      glow(ctx, W / 2, H * 0.5, Math.max(W, H) * 0.6, '255,200,160', 0.10);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'rooftop', name: 'The Rooftop', year: 'Dusk', tagline: 'String lights, a warm skyline, a long evening.',
    cloth: { base: '#5e9583', light: '#7cb5a0', dark: '#376655', rubber: '#4c8070', nap: 'rgba(255,255,255,0.045)' },
    rail: { kind: 'wood', a: '#c8b08a', b: '#9e8560', grain: 'rgba(70,50,25,0.25)', hi: 'rgba(255,250,230,0.3)', trim: '#2f8f8a' },
    plate: '#3d5a56', plateDark: '#1b2c2a', sight: '#3b382f',
    lamp: { rgb: '255,196,150', a: 0.2, r: 1.6 }, spot: 0.6,
    accent: '#ff8f6b', accent2: '#ffd7a8',
    ui: { bg: '#0c1114', panel: '#131b20', ink: '#f5efe6', sub: '#93a3a6', line: '#243139' },
    sound: { root: 220, scale: [0, 2, 4, 6, 9], room: 0.14, bright: 1.15, tone: 500 },
    paint(ctx, W, H) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1d2444'); g.addColorStop(0.55, '#7a4a5a'); g.addColorStop(0.85, '#f08a5d'); g.addColorStop(1, '#ffc38a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const rnd = seeded(5);
      for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`; ctx.fillRect(rnd() * W, rnd() * H * 0.4, 1.5, 1.5); }
      // skyline
      ctx.fillStyle = '#1a1620';
      let x = 0;
      while (x < W) { const bw = 40 + rnd() * 70, bh = H * (0.12 + rnd() * 0.22); ctx.fillRect(x, H - bh, bw, bh); for (let k = 0; k < 9; k++) if (rnd() < 0.5) { ctx.fillStyle = 'rgba(255,214,140,0.8)'; ctx.fillRect(x + 6 + rnd() * (bw - 14), H - bh + 8 + rnd() * (bh - 16), 3, 4); ctx.fillStyle = '#1a1620'; } x += bw + 2; }
      // planters and string lights
      ctx.fillStyle = 'rgba(12,30,26,0.9)';
      ctx.fillRect(0, H * 0.92, W, H * 0.08);
      for (let i = 0; i < 24; i++) { ctx.fillStyle = 'rgba(40,110,80,0.6)'; ctx.beginPath(); ctx.arc((i + 0.5) * W / 24, H * 0.92, 20 + rnd() * 12, Math.PI, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(20,20,20,0.7)'; ctx.lineWidth = 2;
      for (const y0 of [0.05, 0.11]) {
        ctx.beginPath(); ctx.moveTo(0, H * y0);
        for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(W * (i - 0.5) / 8, H * (y0 + 0.05), W * i / 8, H * y0);
        ctx.stroke();
        for (let i = 0; i < 40; i++) {
          const t = i / 40, px = t * W, seg = (px / (W / 8)) % 1, py = H * y0 + Math.sin(seg * Math.PI) * H * 0.05;
          glow(ctx, px, py, 26, '255,210,140', 0.5);
          ctx.fillStyle = '#fff3cf'; ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill();
        }
      }
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,6,16,0.5)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
  },
];

export const HALL_BY_ID = Object.fromEntries(HALLS.map((h) => [h.id, h]));
