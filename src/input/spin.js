// Spin (english) state: strike point on the cue ball, in ball radii.
// CONTRACT: class SpinControl:
//   value { x, y } in radii, each clamped to +/-0.5 (miscue cap)
//   set(x, y), center(), fromPad(dxPx, dyPx, radiusPx)
//
// Convention: +x is right, +y is up (follow/topspin). Callers whose pad
// uses screen pixels (y down) flip dy before calling fromPad.

const SPIN_MAX = 0.5; // radii: the miscue cap

const clampSpin = (v) => {
  if (!Number.isFinite(v)) return 0;
  return v < -SPIN_MAX ? -SPIN_MAX : v > SPIN_MAX ? SPIN_MAX : v;
};

export class SpinControl {
  constructor(x = 0, y = 0) {
    // Single source of truth; x/y getters read through it.
    this.value = { x: clampSpin(x), y: clampSpin(y) };
  }

  get x() { return this.value.x; }
  get y() { return this.value.y; }

  /** Set the strike point in radii; each axis clamped to +/-0.5. */
  set(x, y) {
    this.value.x = clampSpin(x);
    this.value.y = clampSpin(y);
    return this.value;
  }

  /** Back to center ball. */
  center() {
    this.value.x = 0;
    this.value.y = 0;
    return this.value;
  }

  /**
   * Map a drag on the round spin pad to radii. The pad's pixel radius is
   * one ball radius, so the offset fraction IS the radii offset, clamped
   * to the miscue cap. (dx, dy) are px from the pad center.
   */
  fromPad(dxPx, dyPx, radiusPx) {
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) return { ...this.value };
    return this.set(dxPx / radiusPx, dyPx / radiusPx);
  }
}
