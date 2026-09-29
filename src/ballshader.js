// Software sphere shader. Each ball carries a full 3D orientation (quaternion),
// so stripes, number discs and the cue ball's marker dots visibly roll, slide
// and spin. Rendered per pixel into a small canvas; cached while a ball is at rest.

let BALL_COLORS = ['#f6f2e8', '#f4c430', '#1c4fb0', '#d3342a', '#4b2a80', '#f07d1a', '#1e8040', '#7d1f2b', '#17150f'];
export function setPalette(colors) { BALL_COLORS = colors.slice(); }

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

export const colorOf = (id) => BALL_COLORS[id === 0 ? 0 : id <= 8 ? id : id - 8];
const isStripe = (id) => id >= 9;

// numeral glyphs sampled inside the number disc
const GLYPH = 48;
const glyphs = new Map();
function glyphFor(id) {
  if (glyphs.has(id)) return glyphs.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = GLYPH;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, GLYPH, GLYPH);
  g.fillStyle = '#111';
  g.font = `700 ${id > 9 ? 25 : 30}px Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(id), GLYPH / 2, GLYPH / 2 + 2);
  const data = g.getImageData(0, 0, GLYPH, GLYPH).data;
  const lum = new Uint8Array(GLYPH * GLYPH);
  for (let i = 0; i < lum.length; i++) lum[i] = data[i * 4];
  glyphs.set(id, lum);
  return lum;
}

const DISC = 0.44;   // angular radius of the number disc (radians), from a real 2.25 in set
const SIN_D = Math.sin(DISC);

// light and reflection setup (fixed in screen space, like a pendant lamp above the table)
const L = norm([-0.45, 0.6, 0.66]);
function norm(v) { const m = Math.hypot(...v); return v.map((x) => x / m); }

export class BallSprite {
  constructor(id, px) {
    this.id = id;
    this.size = px;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = px;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(px, px);
    this.key = '';
    this.base = hex(colorOf(id));
    this.glyph = id > 0 ? glyphFor(id) : null;
    // per-pixel constants that do not depend on orientation
    const n = px * px;
    this.nx = new Float32Array(n); this.ny = new Float32Array(n); this.nz = new Float32Array(n);
    this.cov = new Float32Array(n); this.lit = new Float32Array(n);
    this.spec = new Float32Array(n);
    const r = px / 2;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const i = y * px + x;
      let dx = (x + 0.5 - r) / r, dy = -(y + 0.5 - r) / r;
      const dRaw = Math.hypot(dx, dy);
      this.cov[i] = Math.max(0, Math.min(1, (1 - dRaw) * r + 0.5));
      if (this.cov[i] <= 0) continue;
      if (dRaw > 0.998) { dx = dx / dRaw * 0.998; dy = dy / dRaw * 0.998; }
      const d2 = dx * dx + dy * dy;
      const nz = Math.sqrt(1 - d2);
      this.nx[i] = dx; this.ny[i] = dy; this.nz[i] = nz;
      const diff = Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
      const h = norm([L[0], L[1], L[2] + 1]);
      const spec = Math.pow(Math.max(0, dx * h[0] + dy * h[1] + nz * h[2]), 95);
      const rx = 2 * nz * dx, ry = 2 * nz * dy, rz = 2 * nz * nz - 1;
      const sky = Math.max(0, ry) * 0.16 + Math.pow(Math.max(0, rx * -0.5 + ry * 0.7 + rz * 0.5), 26) * 0.18;
      const rim = Math.pow(1 - nz, 2.2);
      this.lit[i] = 0.36 + diff * 0.64 - rim * 0.34;
      this.spec[i] = spec * 0.95 + sky;
    }
  }

  /** q = body-to-world quaternion [w,x,y,z]; rot = view rotation (radians) of world about the screen. */
  render(q, rot) {
    const key = `${q[0].toFixed(3)},${q[1].toFixed(3)},${q[2].toFixed(3)},${q[3].toFixed(3)},${rot}`;
    if (key === this.key) return this.canvas;
    this.key = key;
    const [w, x, y, z] = q;
    // body = conj(q) applied to a world direction
    const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - z * w), m02 = 2 * (x * z + y * w);
    const m10 = 2 * (x * y + z * w), m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - x * w);
    const m20 = 2 * (x * z - y * w), m21 = 2 * (y * z + x * w), m22 = 1 - 2 * (x * x + y * y);
    // body = M^T * world
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const data = this.img.data;
    const px = this.size, id = this.id, base = this.base, stripe = isStripe(id), cue = id === 0;
    for (let i = 0; i < px * px; i++) {
      const nz = this.nz[i];
      const o = i * 4;
      if (this.cov[i] <= 0) { data[o + 3] = 0; continue; }
      // screen normal -> world direction (undo the view rotation)
      const sx = this.nx[i], sy = this.ny[i];
      const wx = sx * cr + sy * sr, wy = -sx * sr + sy * cr, wz = nz;
      const bx = m00 * wx + m10 * wy + m20 * wz;
      const by = m01 * wx + m11 * wy + m21 * wz;
      const bz = m02 * wx + m12 * wy + m22 * wz;
      let r = base[0], g = base[1], b = base[2];
      if (cue) {
        // six small marker dots on the axes so any spin is readable
        const dot = Math.max(Math.abs(bx), Math.abs(by), Math.abs(bz));
        if (dot > 0.985) { const t = Math.min(1, (dot - 0.985) / 0.006); r += (200 - r) * t * 0.85; g += (60 - g) * t * 0.85; b += (70 - b) * t * 0.85; }
      } else {
        const white = [246, 242, 232];
        if (stripe) {
          // colored band around the equator (axis = body z); white elsewhere
          const edge = Math.min(1, Math.max(0, (0.5 - Math.abs(bz)) * 26));
          r = white[0] + (base[0] - white[0]) * edge; g = white[1] + (base[1] - white[1]) * edge; b = white[2] + (base[2] - white[2]) * edge;
        }
        // number discs at +-x on the equator
        const ax = Math.abs(bx);
        if (ax > Math.cos(DISC + 0.03)) {
          const ang = Math.acos(Math.min(1, ax));
          const disc = Math.min(1, Math.max(0, (DISC - ang) * 40));
          if (disc > 0) {
            const s = bx > 0 ? 1 : -1;
            const u = (by * s) / SIN_D, v = bz / SIN_D;          // -1..1 in the disc
            const gx = Math.floor((u * 0.5 + 0.5) * GLYPH), gy = Math.floor((-v * 0.5 + 0.5) * GLYPH);
            let ink = 1;
            if (gx >= 0 && gx < GLYPH && gy >= 0 && gy < GLYPH) ink = this.glyph[gy * GLYPH + gx] / 255;
            const wr = 250 * ink + 18 * (1 - ink), wg = 248 * ink + 18 * (1 - ink), wb = 240 * ink + 18 * (1 - ink);
            r += (wr - r) * disc; g += (wg - g) * disc; b += (wb - b) * disc;
          }
        }
      }
      const lit = this.lit[i], sp = this.spec[i] * 255;
      data[o] = Math.min(255, r * lit + sp);
      data[o + 1] = Math.min(255, g * lit + sp);
      data[o + 2] = Math.min(255, b * lit + sp);
      data[o + 3] = this.cov[i] * 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}
