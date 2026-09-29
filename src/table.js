// Table geometry in SI units. Origin at table center, +x along the long axis,
// +y "up" the page (the renderer flips y for the canvas). The playing surface
// is bounded by the cushion nose lines: 100 x 50 in, the WPA 9-foot regulation.

export const BALL_R = 0.028575;          // 2.25 in ball
export const TABLE_L = 2.54;             // 100 in
export const TABLE_W = 1.27;             // 50 in
export const HALF_L = TABLE_L / 2;
export const HALF_W = TABLE_W / 2;
export const HEAD_X = -TABLE_L / 4;      // head string / head spot
export const FOOT_X = TABLE_L / 4;       // foot spot (rack apex)

const IN = 0.0254;

// Pocket difficulty scales the mouth width. 1 is regulation.
export const POCKET_PRESETS = { forgiving: 1.16, standard: 1.06, tournament: 0.97 };

/**
 * Build the cushion segments, jaw knuckles and pocket capture circles.
 * walls:    { ax, ay, bx, by, nx, ny }  normal points into the table
 * knuckles: { x, y, r }                 rounded cushion tips at pocket mouths
 * pockets:  { x, y, r, mx, my, kind }   capture circle, mouth center, 'corner'|'side'
 */
export function buildTable(pocketScale = POCKET_PRESETS.standard) {
  const cornerMouth = 4.56 * IN * pocketScale;
  const sideMouth = 5.06 * IN * pocketScale;
  const ac = cornerMouth / Math.SQRT2;   // corner mouth chord is cut at 45 degrees
  const sm = sideMouth / 2;
  const rk = 0.009;                      // rounded cushion tip radius

  const walls = [];
  const knuckles = [];
  const pockets = [];

  const seg = (ax, ay, bx, by, nx, ny) => walls.push({ ax, ay, bx, by, nx, ny });
  // long rails (top y=+HALF_W faces down, bottom faces up), split by the side pockets
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
    const ox = sx / Math.SQRT2, oy = sy / Math.SQRT2;
    pockets.push({ x: mx + ox * dC, y: my + oy * dC, r: rC, mx, my, kind: 'corner' });
  }
  const dS = 0.052, rS = 0.062;
  for (const sy of [1, -1]) {
    pockets.push({ x: 0, y: sy * (HALF_W + dS), r: rS, mx: 0, my: sy * HALF_W, kind: 'side' });
  }
  return { walls, knuckles, pockets, ballR: BALL_R, halfL: HALF_L, halfW: HALF_W, pocketScale };
}

// ---- racks -------------------------------------------------------------

// Tiny seeded PRNG (mulberry32) so a rack is reproducible from a number.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const GAP = 0.00022; // real racks leave sub-millimetre gaps, so breaks are never identical

// Returns [{id, x, y}] for object balls 1..N. The cue ball is id 0.
export function rackPositions(kind, seed = 1) {
  const rand = rng(seed);
  const D = BALL_R * 2 + GAP;
  const rowDx = Math.sqrt(3) / 2 * D;
  const jitter = () => (rand() - 0.5) * 0.00012;
  const place = (row, i) => ({
    x: FOOT_X + row * rowDx + jitter(),
    y: (i - row / 2) * D + jitter(),
  });

  if (kind === 'nine') {
    // diamond rows of 1,2,3,2,1. 1 at the apex, 9 in the middle, the rest shuffled.
    const rowsY = [[0], [-0.5, 0.5], [-1, 0, 1], [-0.5, 0.5], [0]];
    const ids = shuffle([2, 3, 4, 5, 6, 7, 8], rand);
    const out = [];
    let k = 0;
    rowsY.forEach((ys, row) => ys.forEach((yy, i) => {
      let id;
      if (row === 0) id = 1;
      else if (row === 2 && i === 1) id = 9;
      else id = ids[k++];
      out.push({ id, x: FOOT_X + row * rowDx + jitter(), y: yy * D + jitter() });
    }));
    return out;
  }

  // eight-ball triangle: 8 in the middle of row 3, back corners one solid + one stripe
  const solids = shuffle([1, 2, 3, 4, 5, 6, 7], rand);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], rand);
  const rest = shuffle([...solids.slice(1), ...stripes.slice(1)], rand);
  const cornerA = solids[0], cornerB = stripes[0];
  const backLeftIsSolid = rand() < 0.5;
  const rows = [];
  let idx = 0;
  const next = () => rest[idx++];
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      let id;
      if (row === 4 && i === 0) id = backLeftIsSolid ? cornerA : cornerB;
      else if (row === 4 && i === 4) id = backLeftIsSolid ? cornerB : cornerA;
      else if (row === 2 && i === 1) id = 8;
      else id = next();
      rows.push({ id, ...place(row, i) });
    }
  }
  return rows;
}

/** Can the cue ball be placed here? Inside the cushions, clear of other balls, and behind the head string in the kitchen. */
export function validCuePlacement(x, y, others, kitchen, halfL = HALF_L, halfW = HALF_W) {
  const m = BALL_R + 0.002;
  if (Math.abs(x) > halfL - m || Math.abs(y) > halfW - m) return false;
  if (kitchen && x > HEAD_X) return false;
  for (const o of others) {
    if (o.pocketed || o.id === 0) continue;
    if (Math.hypot(o.x - x, o.y - y) < BALL_R * 2 + 0.0008) return false;
  }
  return true;
}
