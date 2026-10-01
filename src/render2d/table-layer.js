// Cached table drawing (felt, rails, pockets, diamonds) per hall + size.
// CONTRACT: makeTableLayer(hall, wPx, hPx, view) -> offscreen canvas
// hall: { felt:{base,light,dark,rubber}, rail, wall, accent }
// view: { cx, cy, scale (CSS px per meter), portrait, dpr, toPx }
// The canvas is wPx*dpr x hPx*dpr device pixels; its context is pre-set to
// a dpr transform so all drawing below uses CSS px via view.toPx, exactly
// like the per-frame painters. Drawn once per (hall, size): the renderer
// caches the result and only rebuilds on resize/hall change.
import { buildTable, HALF_L, HALF_W, HEAD_X, TABLE_L, TABLE_W } from '../sim/table.js';

const RAIL_M = 0.065;   // wood rail width beyond the cushion, each side (cushion 0.055 + rail 0.065 = 0.12/side = the 0.24 the renderer fits)
const CUSHION_M = 0.055; // cushion band width around the playing surface

function pocketPositions() {
  try {
    const t = buildTable();
    if (t && Array.isArray(t.pockets) && t.pockets.length === 6) return t.pockets;
  } catch { /* sim stub not ready: fall back to nominal geometry */ }
  const cs = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) cs.push({ x: sx * HALF_L, y: sy * HALF_W, kind: 'corner' });
  for (const sy of [-1, 1]) cs.push({ x: 0, y: sy * HALF_W, kind: 'side' });
  return cs;
}

// Small tileable monochrome noise, drawn once and reused as a pattern.
let _noiseTile = null;
function noiseTile() {
  if (_noiseTile) return _noiseTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + Math.floor(Math.random() * 80);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _noiseTile = c;
  return c;
}

export function makeTableLayer(hall, wPx, hPx, view) {
  if (typeof document === 'undefined') return null;
  if (!hall || !view || typeof view.toPx !== 'function') return null;
  const dpr = Number.isFinite(view.dpr) && view.dpr > 0 ? view.dpr : 1;
  const W = Math.max(1, Math.round(wPx * dpr));
  const H = Math.max(1, Math.round(hPx * dpr));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px from here on

  const felt = hall.felt || {};
  const feltBase = felt.base || '#2e6b4f';
  const feltLight = felt.light || '#3c9569';
  const feltDark = felt.dark || '#144733';
  const rubber = felt.rubber || '#1f5f43';
  const railCol = hall.rail || '#2c1d12';
  const wallCol = hall.wall || '#14161c';
  const toPx = view.toPx;

  // ---- room wall ------------------------------------------------------
  ctx.fillStyle = wallCol;
  ctx.fillRect(0, 0, wPx, hPx);

  // Table-space rects, mapped to screen corners via toPx.
  const rectCorners = (hw, hh) => {
    const [x1, y1] = toPx(-hw, -hh);
    const [x2, y2] = toPx(hw, hh);
    return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
  };
  const [ox, oy, ow, oh] = rectCorners(HALF_L + CUSHION_M + RAIL_M, HALF_W + CUSHION_M + RAIL_M);
  const [fx, fy, fw, fh] = rectCorners(HALF_L, HALF_W);

  // ---- wood surround ---------------------------------------------------
  ctx.fillStyle = railCol;
  ctx.fillRect(ox, oy, ow, oh);
  // Grain streaks: long thin lines along the table's long axis, low alpha.
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, ow, oh); ctx.clip();
  const longHorizontal = ow >= oh;
  ctx.globalAlpha = 0.10;
  ctx.lineWidth = 1;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const t = rnd();
    ctx.strokeStyle = rnd() > 0.5 ? '#000000' : '#ffffff';
    ctx.globalAlpha = 0.04 + rnd() * 0.07;
    ctx.beginPath();
    if (longHorizontal) {
      const y = oy + t * oh;
      ctx.moveTo(ox, y);
      ctx.bezierCurveTo(ox + ow * 0.3, y + (rnd() - 0.5) * 6, ox + ow * 0.7, y + (rnd() - 0.5) * 6, ox + ow, y);
    } else {
      const x = ox + t * ow;
      ctx.moveTo(x, oy);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 6, oy + oh * 0.3, x + (rnd() - 0.5) * 6, oy + oh * 0.7, x, oy + oh);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  // Brass hairline where wood meets cushion.
  const [bx, by, bw, bh] = rectCorners(HALF_L + CUSHION_M, HALF_W + CUSHION_M);
  ctx.strokeStyle = 'rgba(201,150,60,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, bw, bh);

  // ---- cushion bevels ---------------------------------------------------
  ctx.fillStyle = rubber;
  ctx.fillRect(bx, by, bw, bh);
  // Bevel: light on the nose (inner edge), dark at the wood (outer edge).
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);

  // ---- felt field -------------------------------------------------------
  ctx.fillStyle = feltBase;
  ctx.fillRect(fx, fy, fw, fh);
  // Cloth noise, low alpha, tileable.
  ctx.save();
  ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = ctx.createPattern(noiseTile(), 'repeat');
  ctx.fillRect(fx, fy, fw, fh);
  ctx.globalAlpha = 1;
  // Lamp pools: soft ellipses of lighter felt, like hanging lamps.
  for (const t of [0.25, 0.5, 0.75]) {
    const [lx, ly] = toPx((t - 0.5) * TABLE_L, 0);
    const rx = fw * 0.22, ry = fh * 0.42;
    const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(rx, ry));
    grad.addColorStop(0, feltLight);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(lx, ly); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.translate(-lx, -ly);
    ctx.fillRect(lx - rx, ly - ry, rx * 2, ry * 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // Vignette: the cloth falls off toward the cushions.
  const [ccx, ccy] = toPx(0, 0);
  const vg = ctx.createRadialGradient(ccx, ccy, Math.min(fw, fh) * 0.35, ccx, ccy, Math.max(fw, fh) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, feltDark);
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = vg;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.globalAlpha = 1;
  // Head string, faint.
  const [hx1, hy1] = toPx(HEAD_X, -HALF_W);
  const [hx2, hy2] = toPx(HEAD_X, HALF_W);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx1, hy1); ctx.lineTo(hx2, hy2); ctx.stroke();
  ctx.restore();

  // ---- pocket wells ------------------------------------------------------
  for (const p of pocketPositions()) {
    const [pxx, pyy] = toPx(p.x, p.y);
    const pr = (p.r || 0.058) * view.scale;
    const well = ctx.createRadialGradient(pxx, pyy, 0, pxx, pyy, pr);
    well.addColorStop(0, '#000000');
    well.addColorStop(0.72, '#0a0806');
    well.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = well;
    ctx.beginPath(); ctx.arc(pxx, pyy, pr, 0, Math.PI * 2); ctx.fill();
    // Leather rim catch-light.
    ctx.beginPath(); ctx.arc(pxx, pyy, pr * 0.98, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201,150,60,0.35)';
    ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---- brass diamond sights ----------------------------------------------
  // Three per long rail segment, one per short rail, skipping pockets.
  ctx.fillStyle = '#c9963c';
  const diamond = (x, y, s) => {
    const [dx, dy] = toPx(x, y);
    ctx.save();
    ctx.translate(dx, dy); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  };
  const ds = Math.max(3, view.scale * 0.008);
  const railOff = HALF_W + CUSHION_M + RAIL_M / 2;
  for (const sx of [-0.75, -0.375, 0.375, 0.75]) {
    diamond(sx * TABLE_L, railOff, ds);
    diamond(sx * TABLE_L, -railOff, ds);
  }
  const railOffX = HALF_L + CUSHION_M + RAIL_M / 2;
  for (const sy of [-0.5, 0, 0.5]) {
    if (sy === 0) continue; // side pocket mouth
    diamond(railOffX, sy * TABLE_W, ds);
    diamond(-railOffX, sy * TABLE_W, ds);
  }

  return cv;
}
