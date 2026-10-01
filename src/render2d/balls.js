// Ball painter: sprite cache keyed by (id, size); orientation shading from
// the ball quaternion so spin and roll are visible.
// CONTRACT: drawBall(ctx, ball, view, cache), ballColors(id)
// view = { toPx(x,y)->[px,py] (CSS px), scale (CSS px per meter), portrait }
// ball = { id, x, y, z, pocketed, q:[w,x,y,z] } (sim frame shape)
//
// Orientation: q rotates body->world. We rotate the ball's local +x axis by
// q, project to the table plane, and use that 2D angle for the stripe band;
// the number disc is offset by the projected local +y, so both visibly move
// as the physics integrates q. Screen-space angles are derived through
// view.toPx, so portrait/landscape mappings stay correct automatically.
// Number discs are cached per (id, pxRadius bucket); no shadowBlur is used
// anywhere in the per-frame path.
import { BALL_R } from '../sim/table.js';

// Classic set. 9-15 are the striped versions of 1-7's colors.
export const BALL_COLORS = {
  0: '#f7f3e8',
  1: '#f6c945', 2: '#2456c8', 3: '#e23b2e', 4: '#5b2d90',
  5: '#f07d1e', 6: '#1e7a46', 7: '#8e2f23', 8: '#1b1b1e',
  9: '#f6c945', 10: '#2456c8', 11: '#e23b2e', 12: '#5b2d90',
  13: '#f07d1e', 14: '#1e7a46', 15: '#8e2f23',
};

/** { base, stripe, label } for a ball id. Unknown ids read as the 8 ball. */
export function ballColors(id) {
  const n = Number.isFinite(id) ? id : 8;
  const key = Object.prototype.hasOwnProperty.call(BALL_COLORS, n) ? n : 8;
  return {
    base: BALL_COLORS[key],
    stripe: key >= 9,
    label: key >= 1 && key <= 15 ? String(key) : '',
  };
}

const _defaultDiscCache = new Map();

/** Rotate local vector (1,0,0) by q=[w,x,y,z] (body->world); return {x, y} of the world vector. */
function rotateVec(q, vx, vy, vz) {
  const [w, x, y, z] = q;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
  const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
  const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
  return {
    x: m00 * vx + m01 * vy + m02 * vz,
    y: m10 * vx + m11 * vy + m12 * vz,
    z: m20 * vx + m21 * vy + m22 * vz,
  };
}

const validQ = (q) =>
  Array.isArray(q) && q.length === 4 && q.every(Number.isFinite) ? q : [1, 0, 0, 0];

/** Cached white number disc with numeral, keyed `${id}:${bucket}`.
 *  Returns null where document is unavailable; callers draw inline then. */
function discSprite(id, bucket, cache) {
  const key = `${id}:${bucket}`;
  let c = cache.get(key);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  const label = ballColors(id).label;
  // bucket = ball DIAMETER px; the number disc is ~half that diameter.
  const r = Math.max(2, Math.round(bucket * 0.28));
  c = document.createElement('canvas');
  c.width = c.height = r * 2 + 2;
  const g = c.getContext('2d');
  const cx = r + 1, cy = r + 1;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = '#f8f5ec'; g.fill();
  g.lineWidth = Math.max(1, r * 0.08);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
  if (label) {
    g.fillStyle = '#1d1a16';
    g.font = `700 ${label.length > 1 ? r * 0.95 : r * 1.1}px Barlow, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, cx, cy + r * 0.06);
  }
  cache.set(key, c);
  if (cache.size > 240) { // bounded: drop the oldest entry
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  return c;
}

export function drawBall(ctx, ball, view, cache) {
  if (!ctx || !ball || !view) return;
  const toPx = view.toPx;
  const scale = view.scale;
  if (typeof toPx !== 'function' || !Number.isFinite(scale) || scale <= 0) return;
  const r = BALL_R * scale;
  if (!Number.isFinite(r) || r < 0.5) return;

  const [cx, cy] = toPx(ball.x, ball.y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  const { base, stripe, label } = ballColors(ball.id);
  const q = validQ(ball.q);

  // Contact shadow (plain ellipse; never shadowBlur in the frame path).
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(cx + r * 0.14, cy + r * 0.2, r * 1.0, r * 0.92, 0, 0, Math.PI * 2);
  else ctx.arc(cx + r * 0.14, cy + r * 0.2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // Base sphere.
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = stripe ? '#f7f3e8' : base;
  ctx.fill();

  // Stripe band for 9-15, rotated by the ball's projected orientation.
  if (stripe) {
    const px = rotateVec(q, 1, 0, 0); // local +x in world
    const e = 0.02;
    const [ax, ay] = toPx(ball.x + px.x * e, ball.y + px.y * e);
    const ang = Math.atan2(ay - cy, ax - cx);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = base;
    ctx.fillRect(-r, -r * 0.52, r * 2, r * 1.04);
    ctx.restore();
    // Re-stroke the rim so the band never bleeds past the edge.
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
  }

  // Number disc, offset by the projected local +y so roll is visible.
  // (Cue ball gets a marker dot instead, so its spin reads too.)
  const discCache = cache instanceof Map ? cache : _defaultDiscCache;
  if (label) {
    const py = rotateVec(q, 0, 1, 0);
    const off = r * 0.22;
    const [dx, dy] = toPx(ball.x + py.x * (off / scale), ball.y + py.y * (off / scale));
    const bucket = Math.max(4, Math.round(r * 2));
    const spr = discSprite(ball.id, bucket, discCache);
    if (spr) {
      ctx.drawImage(spr, dx - spr.width / 2, dy - spr.height / 2);
    } else {
      // No document (worker/SSR): draw the disc inline, uncached.
      const dr = r * 0.52;
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fillStyle = '#f8f5ec'; ctx.fill();
      ctx.fillStyle = '#1d1a16';
      ctx.font = `700 ${label.length > 1 ? dr * 0.95 : dr * 1.1}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, dx, dy + dr * 0.06);
    }
  } else if (ball.id === 0) {
    const py = rotateVec(q, 0, 1, 0);
    const off = r * 0.45;
    const [dx, dy] = toPx(ball.x + py.x * (off / scale), ball.y + py.y * (off / scale));
    ctx.beginPath(); ctx.arc(dx, dy, Math.max(1, r * 0.11), 0, Math.PI * 2);
    ctx.fillStyle = '#b3402e'; ctx.fill();
  }

  // Fixed pendant-lamp lighting: specular toward top-left, shade at bottom.
  ctx.beginPath(); ctx.arc(cx - r * 0.34, cy - r * 0.38, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(cx, cy + r * 0.52, r * 0.72, r * 0.34, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy + r * 0.52, r * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fill();
}
