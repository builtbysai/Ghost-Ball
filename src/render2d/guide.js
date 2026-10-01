// Guide drawing from sim preview data (sim/preview.js computes; this draws):
// tapered cue line, brass ghost circle, short object path, tangent stub,
// tracked-pocket pulse, wrong-group mark. Assist levels full|line|none are
// chosen by the caller passing a trimmed preview.
// CONTRACT: drawGuide(ctx, preview, view, { accent })
// preview (sim contract): { cuePath:[[x,y]...], contact:{x,y,ballId}|null,
//   ghost:{x,y}|null, objPath:[[x,y]...], cueAfter:[[x,y]...],
//   targetPocket:index|null, firstContactId:id|null }
// Extended fields honored when present: mode ('full'|'line'|'none',
//   default 'full'), now / timeMs (ms clock for the pocket pulse),
//   pockets ([{x,y}...] indexed by targetPocket), wrongFirst (bool).
// mode 'none' draws nothing (callers pass null anyway).
import { BALL_R } from '../sim/table.js';
import { TOKENS } from '../state/tokens.js';

const pts = (view, path) => path.map(([x, y]) => view.toPx(x, y));

function taperedLine(ctx, x1, y1, x2, y2, w1, w2, style) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || !Number.isFinite(len)) return;
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  ctx.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
  ctx.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2);
  ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

function polyline(ctx, list, style, width) {
  if (!list || list.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(list[0][0], list[0][1]);
  for (let i = 1; i < list.length; i++) ctx.lineTo(list[i][0], list[i][1]);
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function arrowhead(ctx, tip, from, size, style) {
  const dx = tip[0] - from[0], dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || !Number.isFinite(len)) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - ux * size + nx * size * 0.55, tip[1] - uy * size + ny * size * 0.55);
  ctx.lineTo(tip[0] - ux * size - nx * size * 0.55, tip[1] - uy * size - ny * size * 0.55);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

export function drawGuide(ctx, preview, view, opts = {}) {
  if (!ctx || !preview || !view || typeof view.toPx !== 'function') return;
  const mode = opts.mode || 'full';
  if (mode === 'none') return;
  const accent = opts.accent || TOKENS.brass;
  const now = Number.isFinite(opts.now) ? opts.now
    : Number.isFinite(preview.timeMs) ? preview.timeMs
    : (typeof performance !== 'undefined' ? performance.now() : 0);
  const r = BALL_R * view.scale;
  if (!Number.isFinite(r) || r <= 0) return;

  const cuePath = Array.isArray(preview.cuePath) ? preview.cuePath : [];
  const ghost = preview.ghost;
  const objPath = Array.isArray(preview.objPath) ? preview.objPath : [];
  const cueAfter = Array.isArray(preview.cueAfter) ? preview.cueAfter : [];

  // ---- tapered cue line: cue ball -> ghost --------------------------------
  if (cuePath.length >= 1 && ghost && Number.isFinite(ghost.x) && Number.isFinite(ghost.y)) {
    const [sx, sy] = view.toPx(cuePath[0][0], cuePath[0][1]);
    const [gx, gy] = view.toPx(ghost.x, ghost.y);
    // Start the line at the cue ball's edge, not its center.
    const dx = gx - sx, dy = gy - sy;
    const len = Math.hypot(dx, dy);
    let x1 = sx, y1 = sy;
    if (len > r && Number.isFinite(len)) { x1 = sx + (dx / len) * r; y1 = sy + (dy / len) * r; }
    taperedLine(ctx, x1, y1, gx, gy, Math.max(2, r * 0.28), 1, 'rgba(242,234,217,0.85)');
  }

  // ---- ghost ball: brass ring + center dot ---------------------------------
  if (ghost && Number.isFinite(ghost.x) && Number.isFinite(ghost.y)) {
    const [gx, gy] = view.toPx(ghost.x, ghost.y);
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(gx, gy, Math.max(1, r * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
  }

  // ---- object path (short, with arrowhead) ---------------------------------
  let shown = objPath;
  if (mode === 'line' && objPath.length > 2) {
    shown = objPath.slice(0, Math.max(2, Math.ceil(objPath.length * 0.4)));
  }
  if (shown.length >= 2 && mode !== 'none') {
    const list = pts(view, shown);
    polyline(ctx, list, 'rgba(242,234,217,0.9)', Math.max(1.5, r * 0.12));
    arrowhead(ctx, list[list.length - 1], list[list.length - 2], Math.max(5, r * 0.5), 'rgba(242,234,217,0.9)');
  }

  if (mode === 'line') return; // line mode: cue line + ghost + trimmed path only

  // ---- cue-after stub (thinner, dimmer) ------------------------------------
  if (cueAfter.length >= 2) {
    polyline(ctx, pts(view, cueAfter), 'rgba(184,171,144,0.65)', Math.max(1, r * 0.07));
  }

  // ---- tracked pocket pulse --------------------------------------------------
  const pockets = opts.pockets || preview.pockets || [];
  const ti = preview.targetPocket;
  if (Number.isInteger(ti) && pockets[ti] && Number.isFinite(pockets[ti].x)) {
    const [pxx, pyy] = view.toPx(pockets[ti].x, pockets[ti].y);
    const pulse = 1 + 0.13 * Math.sin(now / 280);
    ctx.beginPath(); ctx.arc(pxx, pyy, r * 1.15 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = accent; ctx.lineWidth = Math.max(2, r * 0.12); ctx.stroke();
  }

  // ---- wrong-first mark: fault-red ring + cross on the contact ball ---------
  const wrong = preview.wrongFirst === true || preview.legalFirst === false;
  const contact = preview.contact;
  if (wrong && contact && Number.isFinite(contact.x) && Number.isFinite(contact.y)) {
    const [cx, cy] = view.toPx(contact.x, contact.y);
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = TOKENS.fault; ctx.lineWidth = Math.max(2, r * 0.14); ctx.stroke();
    const k = r * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k);
    ctx.strokeStyle = TOKENS.fault; ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.lineCap = 'round'; ctx.stroke();
  }
}
