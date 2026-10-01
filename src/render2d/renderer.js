// 2D top-down renderer (canvas). CONTRACT (locked):
//   class Render2D:
//     constructor(canvas)
//     setHall(hall)  (felt/rail identity)
//     resize(cssW, cssH, dpr)
//     view() -> { cx, cy, scale, portrait } table meters -> px mapping
//        (portrait: long axis vertical on narrow screens)
//     draw(frame)
//       frame: { balls:[{id,x,y,z,pocketed,q}], guide:null|preview,
//                cue:null|{angle, pullPx, spin}, place:null|{x,y,valid},
//                marks: [] (pocket indices to pulse), time }
//   Balls visibly roll: orientation from q drives shading/stripe/number.
//
// Mapping (documented):
//   landscape (cssW >= cssH): table +x -> screen right, table +y -> screen
//     UP (screen y flipped). Long axis horizontal.
//   portrait (cssW < cssH): the table rotates long-axis vertical: table +x
//     -> screen DOWN, table +y -> screen RIGHT.
// scale is CSS px per meter; toPx returns CSS px. The context carries a dpr
// transform, so all drawing code uses CSS px and stays sharp.
import { BALL_R, TABLE_L, TABLE_W, HALF_L, HALF_W, HEAD_X, buildTable } from '../sim/table.js';
import { TOKENS } from '../state/tokens.js';
import { drawBall } from './balls.js';
import { drawGuide } from './guide.js';
import { makeTableLayer } from './table-layer.js';

const GUTTER_PX = 12;   // DESIGN.md screen gutter (mobile)
const OUTER_PAD_M = 0.24; // rails included in the fit: TABLE + 0.24
const CUE_LEN_M = 1.45;
const CUE_REST_GAP_M = 0.012;

function pocketPositions() {
  try {
    const t = buildTable();
    if (t && Array.isArray(t.pockets) && t.pockets.length === 6) return t.pockets;
  } catch { /* sim stub not ready: nominal geometry */ }
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push({ x: sx * HALF_L, y: sy * HALF_W, r: 0.058 });
  for (const sy of [-1, 1]) out.push({ x: 0, y: sy * HALF_W, r: 0.062 });
  return out;
}

export class Render2D {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.ctx = null;
    if (canvas && canvas.getContext) {
      try {
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
      } catch {
        try { this.ctx = canvas.getContext('2d'); } catch { this.ctx = null; }
      }
    }
    this.hall = null;
    this._view = { cx: 0, cy: 0, scale: 100, portrait: false, dpr: 1 };
    this._cssW = 0; this._cssH = 0;
    this._layer = null;
    this._layerKey = '';
    this._ballCache = new Map();
  }

  /** felt/rail identity; invalidates the cached table layer. */
  setHall(hall) {
    this.hall = hall || null;
    this._layerKey = '';
    this._layer = null;
  }

  resize(cssW, cssH, dpr) {
    this._cssW = Math.max(1, cssW || 1);
    this._cssH = Math.max(1, cssH || 1);
    const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    if (this.canvas) {
      this.canvas.width = Math.round(this._cssW * d);
      this.canvas.height = Math.round(this._cssH * d);
    }
    const portrait = this._cssW < this._cssH;
    const outerL = TABLE_L + OUTER_PAD_M;
    const outerW = TABLE_W + OUTER_PAD_M;
    let scale;
    if (portrait) {
      // Long axis vertical: length fits the height, width fits the width.
      scale = Math.min((this._cssH - GUTTER_PX * 2) / outerL, (this._cssW - GUTTER_PX * 2) / outerW);
    } else {
      scale = Math.min((this._cssW - GUTTER_PX * 2) / outerL, (this._cssH - GUTTER_PX * 2) / outerW);
    }
    if (!Number.isFinite(scale) || scale <= 0) scale = 100;
    this._view = { cx: this._cssW / 2, cy: this._cssH / 2, scale, portrait, dpr: d };
    this._layerKey = ''; // size changed: rebuild the layer on next draw
    this._layer = null;
  }

  toPx(x, y) {
    const v = this._view;
    if (v.portrait) return [v.cx + y * v.scale, v.cy + x * v.scale];
    return [v.cx + x * v.scale, v.cy - y * v.scale];
  }

  /** Client (page) coords -> table meters, via the canvas bounding rect. */
  toTable(clientX, clientY) {
    const v = this._view;
    let px = clientX, py = clientY;
    try {
      const rect = this.canvas ? this.canvas.getBoundingClientRect() : null;
      if (rect) { px = clientX - rect.left; py = clientY - rect.top; }
    } catch { /* fall through with raw coords */ }
    if (v.portrait) return { x: (py - v.cy) / v.scale, y: (px - v.cx) / v.scale };
    return { x: (px - v.cx) / v.scale, y: (v.cy - py) / v.scale };
  }

  view() {
    const v = this._view;
    return {
      cx: v.cx, cy: v.cy, scale: v.scale, portrait: v.portrait, dpr: v.dpr,
      toPx: (x, y) => this.toPx(x, y),
      toTable: (clientX, clientY) => this.toTable(clientX, clientY),
    };
  }

  _ensureLayer() {
    const hall = this.hall || {};
    const key = `${hall.id || '?'}|${this._cssW}x${this._cssH}@${this._view.dpr}`;
    if (key !== this._layerKey) {
      this._layerKey = key;
      try {
        this._layer = makeTableLayer(hall, this._cssW, this._cssH, this.view());
      } catch { this._layer = null; }
    }
    return this._layer;
  }

  draw(frame = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this._view;
    const hall = this.hall || {};
    const wall = hall.wall || TOKENS.walnut900;
    const accent = hall.accent || TOKENS.brass;

    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    // Room clear (the layer paints the table; this covers letterbox).
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, this._cssW, this._cssH);

    const layer = this._ensureLayer();
    if (layer) ctx.drawImage(layer, 0, 0, this._cssW, this._cssH);

    const view = this.view();
    const time = Number.isFinite(frame.time) ? frame.time : 0;

    // Pocket marks: pulsing rings (called pocket, tracked pocket, ...).
    const marks = Array.isArray(frame.marks) ? frame.marks : [];
    if (marks.length) {
      const pockets = pocketPositions();
      for (const idx of marks) {
        const p = pockets[idx];
        if (!p || !Number.isFinite(p.x)) continue;
        const [pxx, pyy] = view.toPx(p.x, p.y);
        const pulse = 1 + 0.15 * Math.sin(time / 280);
        ctx.beginPath();
        ctx.arc(pxx, pyy, (p.r || 0.058) * v.scale * 0.95 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Aim guide (null when the assist level is none or balls are rolling).
    if (frame.guide) {
      try {
        drawGuide(ctx, frame.guide, view, {
          mode: frame.guideMode || 'full',
          accent,
          now: time,
          pockets: pocketPositions(),
        });
      } catch { /* guide must never break the frame */ }
    }

    // Ball-in-hand ghost: green/red ring; dashed kitchen line when the
    // legal region is the kitchen.
    const place = frame.place;
    if (place && Number.isFinite(place.x) && Number.isFinite(place.y)) {
      const [pxx, pyy] = view.toPx(place.x, place.y);
      const r = BALL_R * v.scale;
      const col = place.valid ? '#58b368' : TOKENS.fault;
      if (place.kitchen) {
        const [k1x, k1y] = view.toPx(HEAD_X, -HALF_W);
        const [k2x, k2y] = view.toPx(HEAD_X, HALF_W);
        ctx.beginPath(); ctx.moveTo(k1x, k1y); ctx.lineTo(k2x, k2y);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(pxx, pyy, r, 0, Math.PI * 2);
      ctx.fillStyle = place.valid ? 'rgba(88,179,104,0.22)' : 'rgba(210,85,63,0.22)';
      ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();
    }

    // Cue stick, drawn behind the cue ball along -aim before the balls so
    // the ball sits on top of the tip.
    if (frame.cue) this._drawCue(ctx, view, frame);

    // Balls, pocketed last (pocketed balls are skipped: no sink anim).
    const balls = Array.isArray(frame.balls) ? frame.balls : [];
    const ordered = balls.slice().sort((a, b) => (a.pocketed ? 1 : 0) - (b.pocketed ? 1 : 0));
    for (const b of ordered) {
      if (!b || b.pocketed) continue;
      try { drawBall(ctx, b, view, this._ballCache); } catch { /* one bad ball never breaks the frame */ }
    }
  }

  _drawCue(ctx, view, frame) {
    const cue = frame.cue;
    if (!cue || !Number.isFinite(cue.angle)) return;
    const balls = Array.isArray(frame.balls) ? frame.balls : [];
    const cb = balls.find((b) => b && b.id === 0 && !b.pocketed);
    if (!cb) return;
    const v = this._view;
    const r = BALL_R * v.scale;
    const ang = cue.angle;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const pullM = Number.isFinite(cue.pullPx) ? Math.max(0, cue.pullPx / v.scale) : 0;
    const gapM = CUE_REST_GAP_M + pullM;
    // Side english shifts the tip laterally (table-space perpendicular).
    const spinX = cue.spin && Number.isFinite(cue.spin.x) ? cue.spin.x : 0;
    const latM = Math.max(-0.5, Math.min(0.5, spinX)) * BALL_R * 0.8;
    const ox = -dy * latM, oy = dx * latM;

    const tipX = cb.x - dx * gapM + ox, tipY = cb.y - dy * gapM + oy;
    const buttX = cb.x - dx * (gapM + CUE_LEN_M) + ox, buttY = cb.y - dy * (gapM + CUE_LEN_M) + oy;
    const [tx, ty] = view.toPx(tipX, tipY);
    const [ux, uy] = view.toPx(buttX, buttY);
    if (![tx, ty, ux, uy].every(Number.isFinite)) return;

    // Tapered shaft as a polygon; gradient runs tip -> butt.
    const lenPx = Math.hypot(ux - tx, uy - ty);
    if (lenPx < 2) return;
    const nx = -(uy - ty) / lenPx, ny = (ux - tx) / lenPx;
    const tipW = Math.max(2.5, r * 0.3), buttW = Math.max(5, r * 0.55);
    const grad = ctx.createLinearGradient(tx, ty, ux, uy);
    grad.addColorStop(0, '#dcbd8f');
    grad.addColorStop(0.55, '#8a5f3a');
    grad.addColorStop(1, '#2e1d12');
    ctx.beginPath();
    ctx.moveTo(tx + nx * tipW / 2, ty + ny * tipW / 2);
    ctx.lineTo(ux + nx * buttW / 2, uy + ny * buttW / 2);
    ctx.lineTo(ux - nx * buttW / 2, uy - ny * buttW / 2);
    ctx.lineTo(tx - nx * tipW / 2, ty - ny * tipW / 2);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Ferrule (ivory) + tip (blue), measured back from the tip point.
    const ferrM = 0.025, tipM = 0.011;
    const seg = (fromM, toM, style) => {
      const f = fromM / CUE_LEN_M, t = toM / CUE_LEN_M;
      const x1 = tx + (ux - tx) * f, y1 = ty + (uy - ty) * f;
      const x2 = tx + (ux - tx) * t, y2 = ty + (uy - ty) * t;
      const w1 = tipW + (buttW - tipW) * f, w2 = tipW + (buttW - tipW) * t;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
      ctx.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
      ctx.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2);
      ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
      ctx.closePath();
      ctx.fillStyle = style;
      ctx.fill();
    };
    seg(0, ferrM, '#f2ead9');
    seg(0, tipM, '#4a6fa5');
  }
}
