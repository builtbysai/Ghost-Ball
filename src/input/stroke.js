// The stroke: how a cue stroke becomes a shot. Shared by mouse, touch
// gauge and gamepad. CONTRACT (locked; semantics per DESIGN.md + CONTROLS):
//   MAX_SPEED (m/s), speedFromPower(p), powerFromSpeed(v)
//   class Stroke:
//     constructor(opts?) opts { maxPull, arm, contact, startSpeed,
//        releaseSpeed, window, gain }
//     reset()
//     push(sample, t)  sample = draw distance in METERS (positive = back)
//       -> { pull:0..1, armed, forward, fire?:power 0..1 }
//     release(sample, t) -> { fire:power } | { cancel:true }
//   A click (no arm) never fires. Push forward fires when the tip returns
//   to the ball, power from forward speed. Release without a push fires
//   from the draw distance.
//
// Two ways to shoot, distinguished only by how the gesture ends:
//   * Stroke: draw back, then push forward. Fires when the tip returns to
//     the ball, at powerFromSpeed(forwardSpeed * gain).
//   * Release: draw back and let go without pushing. Fires from the draw
//     fraction (draw / maxPull), unless the draw is under 4% (a cancel).
// A stalled sample stream (no fresh motion inside the window) reads speed
// 0, so holding a draw and letting go later is a soft release, not a
// phantom stroke.

export const MAX_SPEED = 9.5;

const clamp01 = (v) => {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

/** Cue-ball speed (m/s) for a 0..1 power. Range: 0.35 (lag) .. 9.25. */
export const speedFromPower = (p) => 0.35 + 8.9 * Math.pow(clamp01(p), 1.8);

/** Inverse of speedFromPower: 0..1 power for a cue-ball speed (m/s). */
export const powerFromSpeed = (v) => {
  if (!Number.isFinite(v)) return 0;
  return Math.pow(clamp01((v - 0.35) / 8.9), 1 / 1.8);
};

const DEFAULTS = {
  maxPull: 0.62,      // draw distance that means full power when releasing
  arm: 0.07,          // must draw back this far before anything can fire
  contact: 0.02,      // the tip is "at the ball" inside this distance
  startSpeed: 0.25,   // forward speed (m/s) that turns a draw into a stroke
  releaseSpeed: 0.6,  // still moving forward this fast at release: it is a stroke
  window: 0.07,       // seconds of history used for velocity
  gain: 1.5,          // cue speed per unit of pointer speed
};

export class Stroke {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.reset();
  }

  reset() {
    this.samples = [];   // [{ s, t }] draw distance in meters over time
    this.peak = 0;       // deepest draw seen this gesture
    this.armed = false;  // draw passed the arm threshold
    this.forward = false; // a real forward push has started
    this.done = false;   // fired or released; further input is inert
  }

  /**
   * Forward speed (m/s) over the recent window; positive when the cue is
   * coming toward the ball. A stalled stream (no sample newer than
   * window*1.5) reads 0: old motion never counts as current speed.
   */
  speed(now) {
    const w = this.o.window;
    const S = this.samples;
    if (S.length < 2) return 0;
    const last = S[S.length - 1];
    if (!Number.isFinite(now) || now - last.t > w * 1.5) return 0;
    let ref = S[0];
    for (let i = S.length - 1; i >= 0; i--) {
      ref = S[i];
      if (now - S[i].t >= w) break;
    }
    const dt = last.t - ref.t;
    return dt > 1e-4 ? (ref.s - last.s) / dt : 0;
  }

  /**
   * Feed one sample: draw distance in meters (positive = back), t in
   * seconds. Returns { pull:0..1, armed, forward, fire?:power 0..1 }.
   * `fire` appears exactly once, when a push reaches the ball.
   */
  push(s, t) {
    if (this.done) return { pull: 0, armed: this.armed, forward: this.forward };
    const o = this.o;
    if (!Number.isFinite(s)) s = 0;
    if (!Number.isFinite(t)) t = this.samples.length ? this.samples[this.samples.length - 1].t : 0;
    this.samples.push({ s, t });
    while (this.samples.length > 2 && t - this.samples[1].t > o.window * 2) this.samples.shift();
    if (s > this.peak) this.peak = s;
    if (!this.armed && s >= o.arm) this.armed = true;
    const v = this.speed(t);
    if (this.armed && !this.forward && v > o.startSpeed && s < this.peak - 0.02) this.forward = true;
    const out = { pull: clamp01(s / o.maxPull), armed: this.armed, forward: this.forward };
    if (this.armed && this.forward && s <= o.contact) {
      this.done = true;
      out.fire = powerFromSpeed(Math.min(MAX_SPEED, Math.max(0.35, v * o.gain)));
    }
    return out;
  }

  /**
   * The gesture ended at draw distance `s` (meters), time `t` (seconds).
   * Returns { fire:power 0..1 } or { cancel:true }.
   * A fast forward motion at release counts as a stroke (power from
   * speed); a settled draw fires from draw/maxPull; under 4% cancels.
   */
  release(s, t) {
    if (this.done) return { cancel: true };
    this.done = true;
    if (!this.armed) return { cancel: true };
    const v = this.speed(Number.isFinite(t) ? t : 0);
    if (v > this.o.releaseSpeed) {
      return { fire: powerFromSpeed(Math.min(MAX_SPEED, Math.max(0.35, v * this.o.gain))) };
    }
    const p = clamp01((Number.isFinite(s) ? s : 0) / this.o.maxPull);
    return p < 0.04 ? { cancel: true } : { fire: p };
  }
}
