// Canvas renderer. World units are meters, +y up; the view maps them to CSS
// pixels (rotated 90 degrees on portrait screens). The table and hall are
// painted once into a cached layer; balls, cue, guides and effects are drawn
// every frame. A small camera (zoom about a focus point plus a recoil offset)
// drives the juice: aim push-in, strike kick, final-ball slow-mo focus.

import { R } from './physics.js';
import { HALF_L, HALF_W, HEAD_X, FOOT_X } from './table.js';
import { BallSprite, setPalette } from './ballshader.js';

const TAU = Math.PI * 2;
const CW = 0.052;          // visible cushion rubber
const RW = 0.118;          // wooden rail outside the cushion
const OUT_X = HALF_L + CW + RW, OUT_Y = HALF_W + CW + RW;

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    // alpha:false lets the browser skip compositing; desynchronized asks for lower presentation latency (a hint: support varies)
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.view = { cx: 0, cy: 0, s: 400, rot: 0 };
    this.cam = { z: 1, fx: 0, fy: 0, kx: 0, ky: 0 };   // zoom about (fx,fy) in world meters; recoil in css px
    this.layer = document.createElement('canvas');
    this.hall = null; this.table = null;
    this.gear = { cue: { shaft: '#ead7a8', butt: '#3b2b21', wrap: '#4a78b8', ring: '#cfd4d8' }, chalk: '#3f86d8' };
    this.sprites = new Map();
    this.spriteSize = 0;
    this.margins = { top: 92, bottom: 24, side: 16 };
    this.motes = Array.from({ length: 34 }, (_, i) => { const r = seeded(i + 3); return { x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 1.2, p: r() * TAU, sp: 0.02 + r() * 0.04, a: 0.05 + r() * 0.12, s: 0.003 + r() * 0.004 }; });
    this.menuMode = false;   // the menu shrinks the table and pushes it right so the UI has room
    this.tableFrac = 1;
    this.offsetX = 0;
  }

  setHall(hall) { this.hall = hall; this.paintLayer(); }
  setTable(table) { this.table = table; this.paintLayer(); }
  setGear(g) { this.gear = { ...this.gear, ...g }; }
  setBallSet(set) { setPalette(set.colors); this.sprites.clear(); }

  setLayout({ menu }) {
    this.menuMode = !!menu;
    if (this.w) this.resize(this.w, this.h, this.dpr);
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.tableFrac = this.menuMode ? 0.62 : 1;
    this.offsetX = this.menuMode ? w * 0.19 : 0;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.layer.width = this.canvas.width; this.layer.height = this.canvas.height;
    const short = h < 520;
    const narrow = w <= 760;
    const m = this.margins = narrow ? { top: 176, bottom: 20, side: 12 } : short ? { top: 58, bottom: 8, side: 84 } : { top: 92, bottom: 24, side: 16 };
    const portrait = h > w * 1.08;
    const availW = (w - m.side * 2) * (portrait ? 1 : this.tableFrac), availH = h - m.top - m.bottom;
    const tw = portrait ? OUT_Y * 2 : OUT_X * 2, th = portrait ? OUT_X * 2 : OUT_Y * 2;
    const s = Math.min(availW / tw, availH / th) * (portrait && this.tableFrac < 1 ? 0.8 : 1);
    this.view = { cx: w / 2 + (portrait ? 0 : this.offsetX), cy: m.top + availH / 2, s, rot: portrait ? Math.PI / 2 : 0 };
    this.portrait = portrait;
    const px = Math.max(16, Math.ceil(2 * R * s * dpr * 1.12) + 2);
    if (px !== this.spriteSize) { this.spriteSize = px; this.sprites.clear(); }
    this.paintLayer();
  }

  // ---- coordinates (camera aware) -------------------------------------------
  toScreen(x, y) {
    const { cx, cy, s, rot } = this.view, k = this.cam;
    const cxw = k.fx * (1 - 1 / k.z), cyw = k.fy * (1 - 1 / k.z);
    const px = (x - cxw) * s * k.z, py = -(y - cyw) * s * k.z;
    const c = Math.cos(rot), sn = Math.sin(rot);
    return { x: cx + px * c - py * sn + k.kx, y: cy + px * sn + py * c + k.ky };
  }
  toWorld(sx, sy) {
    const { cx, cy, s, rot } = this.view, k = this.cam;
    const dx = sx - cx - k.kx, dy = sy - cy - k.ky;
    const c = Math.cos(-rot), sn = Math.sin(-rot);
    const cxw = k.fx * (1 - 1 / k.z), cyw = k.fy * (1 - 1 / k.z);
    return { x: (dx * c - dy * sn) / (s * k.z) + cxw, y: -(dx * sn + dy * c) / (s * k.z) + cyw };
  }
  worldTransform(ctx) {
    const { cx, cy, s, rot } = this.view, k = this.cam, d = this.dpr;
    const cxw = k.fx * (1 - 1 / k.z), cyw = k.fy * (1 - 1 / k.z);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.translate(cx + k.kx, cy + k.ky);
    ctx.rotate(rot);
    ctx.scale(s * k.z, -s * k.z);
    ctx.translate(-cxw, -cyw);
  }
  // where a world point lands with the camera at rest (used to place the cached layer)
  toScreenAt1(x, y) {
    const { cx, cy, s, rot } = this.view;
    const px = x * s, py = -y * s;
    const c = Math.cos(rot), sn = Math.sin(rot);
    return { x: cx + px * c - py * sn, y: cy + px * sn + py * c };
  }

  // ---- static layer ------------------------------------------------------------
  paintLayer() {
    if (!this.hall || !this.table || !this.w) return;
    const ctx = this.layer.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.hall.paint(ctx, this.w, this.h);
    const { cx, cy, s, rot } = this.view, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(s, -s);
    this.paintTable(ctx, this.hall, this.table);
  }

  paintTable(ctx, hall, table) {
    const rand = seeded(7);
    const cl = hall.cloth, rl = hall.rail;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 0.28; ctx.shadowOffsetY = -0.06;
    rrect(ctx, -OUT_X, -OUT_Y, OUT_X * 2, OUT_Y * 2, 0.12); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();

    // ---- rail body
    const g = ctx.createLinearGradient(0, OUT_Y, 0, -OUT_Y);
    g.addColorStop(0, rl.a); g.addColorStop(0.5, rl.b); g.addColorStop(1, rl.a);
    rrect(ctx, -OUT_X, -OUT_Y, OUT_X * 2, OUT_Y * 2, 0.12); ctx.fillStyle = g; ctx.fill();
    ctx.save();
    rrect(ctx, -OUT_X, -OUT_Y, OUT_X * 2, OUT_Y * 2, 0.12); ctx.clip();
    if (rl.kind === 'wood') {
      ctx.strokeStyle = rl.grain; ctx.lineWidth = 0.0016;
      for (let i = 0; i < 280; i++) {
        const y = -OUT_Y + rand() * OUT_Y * 2, x0 = -OUT_X + rand() * OUT_X * 1.6, len = 0.3 + rand() * 1.6;
        ctx.globalAlpha = 0.3 + rand() * 0.7;
        ctx.beginPath(); ctx.moveTo(x0, y);
        ctx.bezierCurveTo(x0 + len * 0.3, y + (rand() - 0.5) * 0.012, x0 + len * 0.7, y + (rand() - 0.5) * 0.012, x0 + len, y + (rand() - 0.5) * 0.008);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (rl.kind === 'formica') {
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
        const r = 0.0012 + rand() * 0.003;
        ctx.beginPath(); ctx.arc(-OUT_X + rand() * OUT_X * 2, -OUT_Y + rand() * OUT_Y * 2, r, 0, TAU); ctx.fill();
      }
    }
    const hi = ctx.createLinearGradient(0, OUT_Y, 0, OUT_Y - 0.16);
    hi.addColorStop(0, rl.hi); hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi; ctx.fillRect(-OUT_X, OUT_Y - 0.16, OUT_X * 2, 0.16);
    ctx.restore();
    ctx.save();
    if (hall.led) { ctx.shadowColor = rl.trim; ctx.shadowBlur = 0.05; }
    ctx.strokeStyle = rl.trim; ctx.lineWidth = hall.led ? 0.006 : 0.004; ctx.globalAlpha = hall.led ? 0.95 : 0.75;
    rrect(ctx, -OUT_X + 0.02, -OUT_Y + 0.02, (OUT_X - 0.02) * 2, (OUT_Y - 0.02) * 2, 0.1); ctx.stroke();
    ctx.restore();

    // ---- cushions
    for (const w of table.walls) {
      const ex = w.bx - w.ax, ey = w.by - w.ay, len = Math.hypot(ex, ey);
      const tx = ex / len, ty = ey / len, ox = -w.nx, oy = -w.ny;
      const ca = 0.12, cb = 0.12;
      const a2x = w.ax + ox * CW + tx * CW * ca, a2y = w.ay + oy * CW + ty * CW * ca;
      const b2x = w.bx + ox * CW - tx * CW * cb, b2y = w.by + oy * CW - ty * CW * cb;
      const grad = ctx.createLinearGradient(w.ax, w.ay, w.ax + ox * CW, w.ay + oy * CW);
      grad.addColorStop(0, cl.light); grad.addColorStop(0.25, cl.rubber); grad.addColorStop(1, cl.dark);
      ctx.beginPath(); ctx.moveTo(w.ax, w.ay); ctx.lineTo(w.bx, w.by); ctx.lineTo(b2x, b2y); ctx.lineTo(a2x, a2y); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
    }

    // ---- cloth
    const cg = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1.55);
    cg.addColorStop(0, cl.light); cg.addColorStop(0.55, cl.base); cg.addColorStop(1, cl.dark);
    ctx.fillStyle = cg; ctx.fillRect(-HALF_L, -HALF_W, HALF_L * 2, HALF_W * 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(-HALF_L, -HALF_W, HALF_L * 2, HALF_W * 2); ctx.clip();
    ctx.fillStyle = cl.nap;
    for (let i = 0; i < 9000; i++) ctx.fillRect(-HALF_L + rand() * HALF_L * 2, -HALF_W + rand() * HALF_W * 2, 0.0025 + rand() * 0.006, 0.0007);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 6000; i++) ctx.fillRect(-HALF_L + rand() * HALF_L * 2, -HALF_W + rand() * HALF_W * 2, 0.002 + rand() * 0.005, 0.0006);
    for (const [x0, y0, x1, y1, gx, gy] of [[-HALF_L, HALF_W, HALF_L, HALF_W, 0, -1], [-HALF_L, -HALF_W, HALF_L, -HALF_W, 0, 1], [-HALF_L, -HALF_W, -HALF_L, HALF_W, 1, 0], [HALF_L, -HALF_W, HALF_L, HALF_W, -1, 0]]) {
      const sh = ctx.createLinearGradient(x0, y0, x0 + gx * 0.05, y0 + gy * 0.05);
      sh.addColorStop(0, 'rgba(0,0,0,0.32)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + gx * 0.05, y1 + gy * 0.05); ctx.lineTo(x0 + gx * 0.05, y0 + gy * 0.05); ctx.closePath(); ctx.fill();
    }
    const lp = hall.lamp;
    const lg = ctx.createRadialGradient(0, 0.05, 0.05, 0, 0.05, lp.r);
    lg.addColorStop(0, `rgba(${lp.rgb},${lp.a})`); lg.addColorStop(0.6, `rgba(${lp.rgb},${lp.a * 0.2})`); lg.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = lg; ctx.fillRect(-HALF_L, -HALF_W, HALF_L * 2, HALF_W * 2);
    ctx.globalAlpha = hall.spot;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.0025;
    ctx.beginPath(); ctx.moveTo(HEAD_X, -HALF_W); ctx.lineTo(HEAD_X, HALF_W); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const x of [HEAD_X, 0, FOOT_X]) { ctx.beginPath(); ctx.arc(x, 0, 0.0055, 0, TAU); ctx.fill(); }
    ctx.restore();

    // ---- pockets
    const wallsEnds = table.walls.flatMap((w) => [[w.ax, w.ay], [w.bx, w.by]]);
    for (const p of table.pockets) {
      const dx = p.x - p.mx, dy = p.y - p.my, dl = Math.hypot(dx, dy);
      const ux = dx / dl, uy = dy / dl;
      const off = p.kind === 'corner' ? 0.066 : 0.068;
      const cx = p.mx + ux * off, cy = p.my + uy * off;
      const r = p.kind === 'corner' ? 0.074 : 0.076;
      const tips = wallsEnds.filter(([x, y]) => Math.hypot(x - p.mx, y - p.my) < (p.kind === 'corner' ? 0.075 : 0.085)).slice(0, 2);
      ctx.beginPath(); ctx.arc(cx, cy, r + 0.011, 0, TAU);
      const pg = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
      pg.addColorStop(0, hall.plate); pg.addColorStop(0.5, hall.plateDark); pg.addColorStop(1, hall.plate);
      ctx.fillStyle = pg; ctx.fill();
      ctx.fillStyle = '#050403';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      if (tips.length === 2) { ctx.beginPath(); ctx.moveTo(tips[0][0], tips[0][1]); ctx.lineTo(tips[1][0], tips[1][1]); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill(); }
      const hg = ctx.createRadialGradient(cx, cy, 0.005, cx, cy, r);
      hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(60,45,35,0.55)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
    for (const k of table.knuckles) {
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r * 1.05, 0, TAU);
      ctx.fillStyle = cl.rubber; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.002; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 0.0025;
    for (const w of table.walls) { ctx.beginPath(); ctx.moveTo(w.ax, w.ay); ctx.lineTo(w.bx, w.by); ctx.stroke(); }

    // ---- diamond sights
    ctx.fillStyle = hall.sight;
    const dm = (x, y) => { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.globalAlpha = 0.92; ctx.fillRect(-0.0085, -0.0085, 0.017, 0.017); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.fillRect(-0.0085, -0.0085, 0.006, 0.017); ctx.restore(); ctx.fillStyle = hall.sight; };
    const railMid = HALF_W + CW + RW / 2, railMidX = HALF_L + CW + RW / 2;
    for (let k = 1; k < 8; k++) if (k !== 4) { const x = -HALF_L + k * HALF_L / 4; dm(x, railMid); dm(x, -railMid); }
    for (let k = 1; k < 4; k++) { const y = -HALF_W + k * HALF_W / 2; dm(railMidX, y); dm(-railMidX, y); }
  }

  sprite(id) {
    let s = this.sprites.get(id);
    if (!s) { s = new BallSprite(id, this.spriteSize); this.sprites.set(id, s); }
    return s;
  }

  // ---- frame ---------------------------------------------------------------------
  draw(f) {
    const ctx = this.ctx;
    if (!this.hall || !this.w) return;
    const z = this.cam.z, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // the cached layer follows the camera: zoom about the focus, plus recoil
    const fsp = this.toScreenAt1(this.cam.fx, this.cam.fy);
    ctx.translate((fsp.x + this.cam.kx) * d, (fsp.y + this.cam.ky) * d);
    ctx.scale(z, z);
    ctx.translate(-fsp.x * d, -fsp.y * d);
    ctx.drawImage(this.layer, 0, 0);

    this.worldTransform(ctx);
    this.drawMotes(ctx, f.time);
    if (f.marks) this.drawMarks(ctx, f.marks, f.time);
    if (f.guide && f.showGuide) this.drawGuide(ctx, f.guide, f.assist);
    if (f.placeGhost) this.drawPlaceZone(ctx, f.placeGhost);
    if (f.call) this.drawCall(ctx, f.call, f.time);

    const list = f.balls.filter((b) => !b.pocketed && !(f.hideCue && b.id === 0));
    list.sort((p, q) => (p.z || 0) - (q.z || 0));
    for (const b of list) this.drawShadow(ctx, b.x, b.y, 1, b.z || 0);
    for (const sk of f.sinking || []) this.drawShadow(ctx, sk.x, sk.y, Math.max(0, 1 - sk.t * 2));
    if (f.tension > 0.02 && f.cueBall) this.drawTension(ctx, f.cueBall, f.tension);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const thv = -this.view.rot;
    for (const sk of f.sinking || []) {
      const p = this.toScreen(sk.x, sk.y);
      const fade = Math.max(0, 1 - sk.t * 1.5), size = this.spriteSize * z * (1 - sk.t * 0.5);
      ctx.globalAlpha = fade;
      ctx.drawImage(this.sprite(sk.id).render(sk.q, thv), p.x * d - size / 2, p.y * d - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    for (const b of list) {
      const p = this.toScreen(b.x, b.y);
      const size = this.spriteSize * z * (1 + (b.z || 0) * 5);
      ctx.drawImage(this.sprite(b.id).render(b.q, thv), p.x * d - size / 2, p.y * d - size / 2, size, size);
    }
    if (f.placeGhost) {
      const p = this.toScreen(f.placeGhost.x, f.placeGhost.y);
      const size = this.spriteSize * z;
      ctx.globalAlpha = f.placeGhost.valid ? 0.85 : 0.4;
      ctx.drawImage(this.sprite(0).render(f.cueQ || [1, 0, 0, 0], thv), p.x * d - size / 2, p.y * d - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    this.worldTransform(ctx);
    if (f.cue && f.cue.visible) this.drawCue(ctx, f.cue);
    for (const e of f.effects || []) this.drawEffect(ctx, e);
    if (f.loupe) this.drawLoupe(f.loupe);
  }

  /** A magnifier held clear of the finger, showing where the cue ball meets the object ball. */
  drawLoupe(l) {
    const ctx = this.ctx, d = this.dpr, r = 62, zoom = 2.4, sr = r / zoom;
    const t = this.toScreen(l.target.x, l.target.y);
    let cx = l.pt.x, cy = l.pt.y - r * 2 - 30;
    if (cy < r + 8) cy = l.pt.y + r * 2 + 30;
    cx = Math.max(r + 8, Math.min(this.w - r - 8, cx)); cy = Math.max(r + 8, Math.min(this.h - r - 8, cy));
    // copy the region under the lens first, so the lens never reads pixels it has just painted over
    const size = Math.max(8, Math.round(2 * sr * d));
    if (!this.loupeBuf) this.loupeBuf = document.createElement('canvas');
    const buf = this.loupeBuf; buf.width = size; buf.height = size;
    buf.getContext('2d').drawImage(this.canvas, Math.round((t.x - sr) * d), Math.round((t.y - sr) * d), size, size, 0, 0, size, size);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx * d, cy * d, r * d, 0, TAU); ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(buf, 0, 0, size, size, (cx - r) * d, (cy - r) * d, 2 * r * d, 2 * r * d);
    ctx.restore();
    ctx.lineWidth = 3 * d; ctx.strokeStyle = this.hall.accent;
    ctx.beginPath(); ctx.arc(cx * d, cy * d, r * d, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1 * d; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo((cx - 9) * d, cy * d); ctx.lineTo((cx + 9) * d, cy * d); ctx.moveTo(cx * d, (cy - 9) * d); ctx.lineTo(cx * d, (cy + 9) * d); ctx.stroke();
  }

  drawMotes(ctx, t) {
    if (!t) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const x = m.x + Math.sin(t * m.sp + m.p) * 0.18, y = m.y + Math.cos(t * m.sp * 0.8 + m.p) * 0.12;
      if (Math.abs(x) > HALF_L || Math.abs(y) > HALF_W) continue;
      ctx.fillStyle = `rgba(${this.hall.lamp.rgb},${m.a * (0.6 + 0.4 * Math.sin(t * 0.9 + m.p))})`;
      ctx.beginPath(); ctx.arc(x, y, m.s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawMarks(ctx, marks, t) {
    for (const m of marks) {
      const pulse = m.pulse ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
      ctx.save();
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r + pulse * 0.006, 0, TAU);
      ctx.lineWidth = m.w || 0.006; ctx.strokeStyle = m.color; ctx.globalAlpha = m.alpha ?? 0.9;
      if (m.dash) ctx.setLineDash([0.012, 0.010]);
      ctx.stroke();
      if (m.fill) { ctx.globalAlpha = m.fill; ctx.fillStyle = m.color; ctx.fill(); }
      ctx.restore();
    }
  }

  drawTension(ctx, b, k) {
    ctx.save();
    ctx.lineWidth = 0.003 + k * 0.004;
    ctx.strokeStyle = this.hall.accent; ctx.globalAlpha = 0.25 + k * 0.6;
    ctx.beginPath(); ctx.arc(b.x, b.y, R * (1.45 + 0.35 * k), -Math.PI / 2 + 0.2, -Math.PI / 2 + 0.2 + TAU * k);
    ctx.stroke();
    ctx.restore();
  }

  drawShadow(ctx, x, y, a, z = 0) {
    if (a <= 0) return;
    // a raised ball throws its shadow farther from itself and fainter
    const sx = x + 0.009 + z * 0.9, sy = y - 0.013 - z * 1.2, fade = Math.max(0.5, 1 - z * 2);
    const g = ctx.createRadialGradient(sx, sy, R * 0.3, sx, sy, R * 1.5);
    g.addColorStop(0, `rgba(0,0,0,${0.42 * a * fade})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R * 1.5, 0, TAU); ctx.fill();
    if (z > 0.004) return;
    const g2 = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * 1.08);
    g2.addColorStop(0, `rgba(0,0,0,${0.5 * a})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, R * 1.08, 0, TAU); ctx.fill();
  }

  drawGuide(ctx, g, assist) {
    const acc = this.hall.accent;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = (pts, w, color, dash, alpha = 1) => {
      if (!pts || pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineWidth = w; ctx.strokeStyle = color; ctx.globalAlpha = alpha;
      ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    };
    path(g.cuePath, 0.0036, '#ffffff', [0.02, 0.014], 0.85);
    if (g.ghost) {
      ctx.beginPath(); ctx.arc(g.ghost.x, g.ghost.y, R, 0, TAU);
      ctx.lineWidth = 0.003; ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
      if (g.objPath) path(g.objPath, 0.0042, acc, null, 0.95);
    }
    if (assist === 'full') path(g.cueAfter, 0.003, '#ffffff', [0.012, 0.012], 0.55);
    ctx.restore();
  }

  drawPlaceZone(ctx, pg) {
    if (!pg.kitchen) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(-HALF_L, -HALF_W, HEAD_X + HALF_L, HALF_W * 2);
    ctx.setLineDash([0.02, 0.016]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.004;
    ctx.beginPath(); ctx.moveTo(HEAD_X, -HALF_W); ctx.lineTo(HEAD_X, HALF_W); ctx.stroke();
    ctx.restore();
  }

  drawCall(ctx, call, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    for (const i of call.pockets) {
      const p = this.table.pockets[i];
      const sel = call.selected === i;
      ctx.save();
      ctx.beginPath(); ctx.arc(p.mx + (p.x - p.mx) * 0.9, p.my + (p.y - p.my) * 0.9, 0.06 + pulse * 0.008, 0, TAU);
      ctx.lineWidth = sel ? 0.012 : 0.006; ctx.strokeStyle = sel ? '#ffffff' : this.hall.accent;
      ctx.globalAlpha = sel ? 1 : 0.55 + pulse * 0.3;
      ctx.stroke();
      if (sel) { ctx.globalAlpha = 0.3; ctx.fillStyle = this.hall.accent; ctx.fill(); }
      ctx.restore();
    }
  }

  drawCue(ctx, c) {
    const rc = this.gear.cue;
    const len = 1.48, tipW = 0.0068, jointW = 0.0085, buttW = 0.0165;
    ctx.save();
    ctx.translate(c.tipX, c.tipY);
    ctx.rotate(c.angle);
    const lift = c.lift || 0;
    if (lift > 0) ctx.scale(1 - lift * 0.2, 1 + lift * 0.12);   // a raised cue is foreshortened and closer to the eye
    const seg = (x0, x1, w0, w1) => { ctx.beginPath(); ctx.moveTo(-x0, w0); ctx.lineTo(-x1, w1); ctx.lineTo(-x1, -w1); ctx.lineTo(-x0, -w0); ctx.closePath(); };
    ctx.save(); ctx.translate(0.014 + lift * 0.05, -0.02 - lift * 0.07); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    seg(0.0, len, tipW, buttW); ctx.fill(); ctx.restore();
    const cyl = (w, top, mid, bot) => { const g = ctx.createLinearGradient(0, w, 0, -w); g.addColorStop(0, top); g.addColorStop(0.45, mid); g.addColorStop(1, bot); return g; };
    ctx.fillStyle = c.tipFlash ? '#ffffff' : this.gear.chalk; seg(0, 0.008, tipW * 0.95, tipW); ctx.fill();
    ctx.fillStyle = '#efe9da'; seg(0.008, 0.03, tipW, tipW * 1.02); ctx.fill();
    ctx.fillStyle = cyl(jointW, '#ffffff', rc.shaft, '#8c7a55'); seg(0.03, 0.72, tipW * 1.02, jointW); ctx.fill();
    ctx.fillStyle = rc.ring; seg(0.72, 0.735, jointW * 1.02, jointW * 1.02); ctx.fill();
    ctx.fillStyle = cyl(buttW, '#5a4a44', rc.butt, '#050303'); seg(0.735, len, jointW, buttW); ctx.fill();
    const w0 = jointW + (0.93 - 0.735) / (len - 0.735) * (buttW - jointW), w1 = jointW + (1.16 - 0.735) / (len - 0.735) * (buttW - jointW);
    ctx.fillStyle = rc.wrap; ctx.globalAlpha = 0.9; seg(0.93, 1.16, w0, w1); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = rc.ring; seg(1.16, 1.17, buttW * 0.93, buttW * 0.94); ctx.fill();
    // power readout on the shaft: a bright stripe grows toward the butt
    if (c.power > 0.02) {
      const e = 0.05 + c.power * 0.62;
      ctx.fillStyle = this.hall.accent; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(-0.05, tipW * 0.6); ctx.lineTo(-e, jointW * 0.6); ctx.lineTo(-e, -jointW * 0.6); ctx.lineTo(-0.05, -tipW * 0.6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawEffect(ctx, e) {
    const k = Math.min(1, e.t / e.dur);
    const ease = 1 - (1 - k) * (1 - k);
    if (e.type === 'chalk') {
      ctx.save(); ctx.globalAlpha = (1 - k) * 0.4; ctx.fillStyle = this.gear.chalk;
      for (const p of e.parts) { ctx.beginPath(); ctx.arc(e.x + p.dx * ease, e.y + p.dy * ease, 0.004 + k * 0.008, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (e.type === 'ring') {
      ctx.save(); ctx.globalAlpha = (1 - k) * 0.6 * e.s; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.003 + 0.004 * (1 - k);
      ctx.beginPath(); ctx.arc(e.x, e.y, R * (0.4 + ease * 1.9), 0, TAU); ctx.stroke(); ctx.restore();
    } else if (e.type === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = e.color || '#fff'; ctx.lineWidth = 0.0035 * (1 - k);
      for (const p of e.parts) {
        const d0 = p.v * ease, d1 = p.v * Math.max(0, ease - 0.25);
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.moveTo(e.x + Math.cos(p.a) * d1, e.y + Math.sin(p.a) * d1); ctx.lineTo(e.x + Math.cos(p.a) * d0, e.y + Math.sin(p.a) * d0); ctx.stroke();
      }
      ctx.restore();
    } else if (e.type === 'pflash') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r = 0.05 + ease * 0.09;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.55 * (1 - k)})`); g.addColorStop(0.5, this.rgba(this.hall.accent, 0.35 * (1 - k))); g.addColorStop(1, this.rgba(this.hall.accent, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}
