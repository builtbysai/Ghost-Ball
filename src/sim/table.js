// Table geometry in SI units. Origin at table center, +x along the long
// axis, +y toward the far (top) rail. See DESIGN.md 6.1.
// CONTRACT (locked):
//   BALL_R, TABLE_L, TABLE_W, HALF_L, HALF_W, HEAD_X, FOOT_X, POCKET_PRESETS
//   buildTable(pocketScale) -> { walls:[{ax,ay,bx,by,nx,ny}],
//     knuckles:[{x,y,r}], pockets:[{x,y,r,mx,my,kind:'corner'|'side'}] }
// Pocket mouths: corner 4.56in, side 5.06in, scaled by pocketScale.
export const BALL_R = 0.028575;   // 2.25 in ball
export const TABLE_L = 2.54;      // 100 in
export const TABLE_W = 1.27;      // 50 in
export const HALF_L = TABLE_L / 2;
export const HALF_W = TABLE_W / 2;
export const HEAD_X = -TABLE_L / 4;   // head string
export const FOOT_X = TABLE_L / 4;    // foot spot (rack apex)
export const POCKET_PRESETS = { forgiving: 1.16, standard: 1.06, tournament: 0.97 };

const IN = 0.0254;

/**
 * Cushion segments, jaw knuckles and pocket capture circles.
 * walls:    { ax, ay, bx, by, nx, ny }  normal points into the table
 * knuckles: { x, y, r }                 rounded cushion tips at pocket mouths
 * pockets:  { x, y, r, mx, my, kind }   capture circle, mouth center, corner|side
 */
export function buildTable(pocketScale = POCKET_PRESETS.standard) {
  const cornerMouth = 4.56 * IN * pocketScale;
  const sideMouth = 5.06 * IN * pocketScale;
  const ac = cornerMouth / Math.SQRT2;  // corner mouth chord is cut at 45 degrees
  const sm = sideMouth / 2;
  const rk = 0.009;                     // rounded cushion tip radius

  const walls = [];
  const knuckles = [];
  const pockets = [];
  const seg = (ax, ay, bx, by, nx, ny) => walls.push({ ax, ay, bx, by, nx, ny });

  // long rails (top y=+HALF_W faces down, bottom faces up), split at side pockets
  seg(-HALF_L + ac, HALF_W, -sm, HALF_W, 0, -1);
  seg(sm, HALF_W, HALF_L - ac, HALF_W, 0, -1);
  seg(-HALF_L + ac, -HALF_W, -sm, -HALF_W, 0, 1);
  seg(sm, -HALF_W, HALF_L - ac, -HALF_W, 0, 1);
  // short rails
  seg(-HALF_L, -HALF_W + ac, -HALF_L, HALF_W - ac, 1, 0);
  seg(HALF_L, -HALF_W + ac, HALF_L, HALF_W - ac, -1, 0);

  // A knuckle is a circle tangent to the rail face at the cushion's end.
  for (const w of walls) {
    for (const [x, y] of [[w.ax, w.ay], [w.bx, w.by]]) {
      knuckles.push({ x: x - w.nx * rk, y: y - w.ny * rk, r: rk });
    }
  }

  // Pocket capture circles sit behind each mouth so anything whose center
  // crosses the mouth line between the knuckles drops.
  const dC = 0.048, rC = 0.058;
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const mx = sx * (HALF_L - ac / 2), my = sy * (HALF_W - ac / 2);
    pockets.push({
      x: mx + (sx / Math.SQRT2) * dC, y: my + (sy / Math.SQRT2) * dC,
      r: rC, mx, my, kind: 'corner',
    });
  }
  const dS = 0.052, rS = 0.062;
  for (const sy of [1, -1]) {
    pockets.push({ x: 0, y: sy * (HALF_W + dS), r: rS, mx: 0, my: sy * HALF_W, kind: 'side' });
  }
  return { walls, knuckles, pockets, ballR: BALL_R, halfL: HALF_L, halfW: HALF_W, pocketScale };
}
