// Gamepad: left stick aims, right stick is the cue (pull down, push up),
// buttons cover pause / confirm / spin. Polled once per frame; the
// Gamepad API has no reliable state events.
// CONTRACT: class GamepadInput:
//   poll() -> { aimDelta, strokeSample|null, buttons:{fire?,pause,spin} }
//   connected() -> bool
//
// Mapping (standard pad):
//   axis 0 (left X)  aim: deadzone 0.15, quadratic response, scaled to
//                    radians per frame (negative = stick right turns aim
//                    clockwise in table space, matching screen feel)
//   axis 3 (right Y) the cue: pull DOWN positive -> strokeSample meters
//                    = deflected * 0.62 (Stroke maxPull). While deflected,
//                    the owner feeds each sample into Stroke.push().
//                    strokeReleased goes true on the poll where the stick
//                    springs back from a pull toward center/push: the owner
//                    then calls Stroke.release(lastSample, now) unless the
//                    push already fired at contact.
//   button 9 (start) pause, button 0 (A) fire/confirm, button 1 (B) spin.
// Button values are levels; edge detection is the owner's job. `connected`
// is also echoed on the poll result for convenience.

const DEADZONE = 0.15;
const STICK_MAX_PULL_M = 0.62;  // right-stick full deflection = full draw
const AIM_RAD_PER_FRAME = 0.045; // at full left-stick deflection
const PULL_RELEASE_ARM = 0.1;    // stick was pulled this far...
const PULL_RELEASE_REST = 0.02;  // ...and is now back inside this: released

const deadzone = (v, dz = DEADZONE) => {
  const a = Math.abs(v || 0);
  if (!Number.isFinite(v) || a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
};

export class GamepadInput {
  /**
   * @param {() => ArrayLike} [getPads] injectable pad source (tests);
   *   defaults to navigator.getGamepads, safe where navigator is absent.
   */
  constructor(getPads = null) {
    this.getPads = getPads || (() => {
      try {
        return (typeof navigator !== 'undefined' && navigator.getGamepads)
          ? navigator.getGamepads() : [];
      } catch { return []; }
    });
    this._prevPull = 0;
  }

  _pad() {
    let pads = [];
    try { pads = Array.from(this.getPads() || []); } catch { pads = []; }
    return pads.find((p) => p && p.connected !== false && Array.isArray(p.axes) && Array.isArray(p.buttons)) || null;
  }

  connected() {
    return this._pad() !== null;
  }

  poll() {
    const idle = {
      aimDelta: 0, strokeSample: null, strokeReleased: false,
      buttons: { fire: false, pause: false, spin: false }, connected: false,
    };
    const p = this._pad();
    if (!p) { this._prevPull = 0; return idle; }

    const ax = (i) => (Number.isFinite(p.axes[i]) ? p.axes[i] : 0);
    const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);

    // Left stick X: quadratic, so small pushes aim precisely.
    const lx = deadzone(ax(0));
    const aimDelta = -Math.sign(lx) * lx * lx * AIM_RAD_PER_FRAME;

    // Right stick Y: down is positive on the standard mapping; pulling
    // down draws the cue back.
    const pull = deadzone(ax(3));
    const strokeSample = pull > 0 ? pull * STICK_MAX_PULL_M : null;
    const strokeReleased = this._prevPull > PULL_RELEASE_ARM && pull <= PULL_RELEASE_REST;
    this._prevPull = pull;

    return {
      aimDelta,
      strokeSample,
      strokeReleased,
      buttons: { fire: btn(0), pause: btn(9), spin: btn(1) },
      connected: true,
    };
  }
}
