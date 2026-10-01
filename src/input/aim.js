// Aim math: pointer positions and fine-aim deltas -> aim angle around the
// cue ball. Lever rule: the farther the pointer from the cue ball, the
// finer the angular change per pixel (the angle is read straight from the
// cue ball to the pointer, so distance gives fineness naturally).
// CONTRACT: angleFromPoint(cue:{x,y}, pt:{x,y}) -> radians
//           fineDelta(angle, deltaPx, scale?) -> radians
// Table space is used throughout (origin center, +x long axis, +y toward
// the top rail). Any screen y-flip is the caller's job (toTable), not
// this module's.

const TAU = Math.PI * 2;

/** Aim angle (radians, table space) from the cue ball toward a point. */
export const angleFromPoint = (cue, pt) => {
  const dx = Number(pt?.x) - Number(cue?.x);
  const dy = Number(pt?.y) - Number(cue?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  return Math.atan2(dy, dx); // atan2(0,0) === 0: pointer on the ball keeps aim
};

const FINE_SENSITIVITY = 0.0009; // rad per px at scale 1
const FINE_MAX_DELTA = 0.01;     // rad clamp per call: one call never jumps

const wrapPi = (a) => {
  if (!Number.isFinite(a)) return 0;
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

/**
 * Nudge an aim angle by a horizontal pixel drag.
 * @param {number} angle current aim, radians
 * @param {number} deltaPx horizontal drag, px (right = positive)
 * @param {number} [scale=1] sensitivity multiplier (e.g. handedness/Setting)
 * @returns {number} new aim angle, radians, wrapped to (-PI, PI]
 */
export const fineDelta = (angle, deltaPx, scale = 1) => {
  if (!Number.isFinite(angle)) angle = 0;
  if (!Number.isFinite(deltaPx)) deltaPx = 0;
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  let d = deltaPx * FINE_SENSITIVITY * scale;
  if (d > FINE_MAX_DELTA) d = FINE_MAX_DELTA;
  else if (d < -FINE_MAX_DELTA) d = -FINE_MAX_DELTA;
  return wrapPi(angle + d);
};
