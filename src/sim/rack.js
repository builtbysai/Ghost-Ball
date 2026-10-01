// Rack layouts for both games. Pure geometry: clears the sim and places
// object balls on the foot spot grid, then the cue ball on the head spot.
//   8-ball: triangle, 1 at the apex, 8 in the center, back corners split
//           solid/stripe, the rest shuffled.
//   9-ball: diamond (1-2-3-2-1), 1 at the apex, 9 in the center, the rest
//           shuffled.
// rngFn is the caller's seeded RNG; no Math.random here.
import { BALL_R, HEAD_X, FOOT_X } from './table.js';

const RACK_EPS = 0.0002; // gap between racked balls (m)
const DX = Math.sqrt(3) * (2 * BALL_R + RACK_EPS);
const DY = 2 * BALL_R + RACK_EPS;

function shuffle(a, rngFn) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rngFn() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rackOrder8(rngFn) {
  const solids = shuffle([2, 3, 4, 5, 6, 7], rngFn);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], rngFn);
  const o = [1];
  const corners = rngFn() < 0.5 ? [solids.pop(), stripes.pop()] : [stripes.pop(), solids.pop()];
  const pool = shuffle([...solids, ...stripes], rngFn);
  // row layout: [0],[1,2],[3,4,5],[6,7,8,9],[10,11,12,13,14]
  o.push(pool.pop(), pool.pop());                        // row 2
  o.push(pool.pop(), 8, pool.pop());                      // row 3 (8 centered)
  o.push(pool.pop(), pool.pop(), pool.pop(), pool.pop()); // row 4
  o.push(corners[0], pool.pop(), pool.pop(), pool.pop(), corners[1]);
  return o;
}

export function rackOrder9(rngFn) {
  // Slots in placement order: apex, row2 x2, row3 x3 (9 centered), row4 x2, tail.
  const rest = shuffle([2, 3, 4, 5, 6, 7, 8], rngFn);
  return [1, rest[0], rest[1], rest[2], 9, rest[3], rest[4], rest[5], rest[6]];
}

// (row, k) slots for the 9-ball diamond on the same grid as the triangle.
const SLOTS9 = [
  [0, 0],
  [1, 0], [1, 1],
  [2, 0], [2, 1], [2, 2],
  [3, 1], [3, 2],
  [4, 2],
];

export function placeRack(sim, game, rngFn) {
  sim.balls.length = 0;
  if (game === '9ball') {
    const order = rackOrder9(rngFn);
    SLOTS9.forEach(([row, k], i) => {
      sim.addBall(order[i], FOOT_X + row * DX, (k - row / 2) * DY);
    });
  } else {
    const order = rackOrder8(rngFn);
    let n = 0;
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k <= row; k++) {
        sim.addBall(order[n++], FOOT_X + row * DX, (k - row / 2) * DY);
      }
    }
  }
  sim.addBall(0, HEAD_X, 0);
}
