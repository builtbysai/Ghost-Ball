// The stroke: how a cue stroke becomes a shot, shared by the mouse, the touch
// power strip and the gamepad's right stick.
//
// Input is one number over time: how far the cue has been drawn back along the
// aim line (meters, positive = back). Two ways to shoot, distinguished only by
// how the gesture ends, so nobody has to pick a mode:
//   * Stroke: draw back, then push forward. The shot fires when the tip returns
//     to the ball, at the speed of the push (Pure Pool style).
//   * Release: draw back and let go without pushing. The shot fires from the
//     draw distance (the classic pull-to-power).
// A minimum draw "arms" the cue so a stray click never fires a shot.

export const MAX_SPEED = 9.5;
export const speedFromPower = (p) => 0.35 + 8.9 * Math.pow(Math.min(1, Math.max(0, p)), 1.8);
export const powerFromSpeed = (v) => Math.pow(Math.min(1, Math.max(0, (v - 0.35) / 8.9)), 1 / 1.8);

const DEFAULTS = {
  maxPull: 0.62,      // draw distance that means full power when releasing
  arm: 0.07,          // must draw back this far before anything can fire
  contact: 0.02,      // the tip is "at the ball" inside this distance
  startSpeed: 0.25,   // forward speed (m/s) that turns a draw into a stroke (slow, soft pushes count)
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
    this.samples = [];
    this.peak = 0;
    this.armed = false;
    this.forward = false;
    this.done = false;
  }

  /** Forward speed (m/s) over the recent window; positive when the cue is coming toward the ball. */
  speed(now) {
    const w = this.o.window, S = this.samples;
    if (S.length < 2) return 0;
    const last = S[S.length - 1];
    if (now - last.t > w * 1.5) return 0;          // the hand has stopped: old motion does not count
    let ref = S[0];
    for (let i = S.length - 1; i >= 0; i--) { ref = S[i]; if (now - S[i].t >= w) break; }
    const dt = last.t - ref.t;
    return dt > 1e-4 ? (ref.s - last.s) / dt : 0;
  }

  /**
   * Feed one sample. Returns { pull: 0..1, armed, forward, fire?: power 0..1 }.
   * `fire` appears exactly once, when a push reaches the ball.
   */
  push(s, t) {
    if (this.done) return { pull: 0, armed: this.armed, forward: this.forward };
    const o = this.o;
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

  /** The gesture ended. Returns { fire: power } or { cancel: true }. */
  release(s, t) {
    if (this.done) return { cancel: true };
    this.done = true;
    if (!this.armed) return { cancel: true };
    const v = this.speed(t);
    if (v > this.o.releaseSpeed) return { fire: powerFromSpeed(Math.min(MAX_SPEED, Math.max(0.35, v * this.o.gain))) };
    const p = clamp01(s / this.o.maxPull);
    return p < 0.04 ? { cancel: true } : { fire: p };
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
