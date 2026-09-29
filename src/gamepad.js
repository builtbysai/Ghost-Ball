// Gamepad layer. Polled once per frame (the Gamepad API has no reliable events
// for state), turned into a small, device-independent state: aim stick, cue
// stick, spin stick, and edge-triggered buttons. Uses the "standard" mapping.
//
//   Left stick   aim (left/right turns the cue); LT or L3 slows it for fine aim
//   Right stick  the cue: pull down to draw back, push up to strike
//   RB + right   moves the spin dot instead of drawing the cue
//   A fire / confirm  B cancel / back  X cycle jump  Y replay  LB centre spin
//   D-pad        menus; in play up/down = power, left/right = fine aim
//   Start        pause

export const DEADZONE = 0.16;
const NAMES = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, back: 8, start: 9, L3: 10, up: 12, down: 13, left: 14, right: 15 };

/** Remove the deadzone and re-scale so the response starts at zero, not at the zone edge. */
export function deadzone(v, dz = DEADZONE) {
  const a = Math.abs(v || 0);
  return a < dz ? 0 : Math.sign(v) * ((a - dz) / (1 - dz));
}

export class PadInput {
  constructor(getPads = () => (navigator.getGamepads ? navigator.getGamepads() : [])) {
    this.getPads = getPads;
    this.prev = {};
    this.index = -1;
  }

  pad() {
    const pads = Array.from(this.getPads() || []).filter((p) => p && p.connected !== false && p.axes && p.buttons);
    if (!pads.length) { this.index = -1; return null; }
    return pads.find((p) => p.index === this.index) || pads[0];
  }

  /** Returns null with no pad, otherwise the current state. */
  poll() {
    const p = this.pad();
    if (!p) return null;
    this.index = p.index;
    const down = {}, edge = {};
    const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    for (const [n, i] of Object.entries(NAMES)) { down[n] = btn(i); edge[n] = down[n] && !this.prev[n]; }
    this.prev = down;
    const lt = p.buttons[6] ? p.buttons[6].value : 0;
    return {
      id: p.id,
      lx: deadzone(p.axes[0]), ly: deadzone(p.axes[1]),
      rx: deadzone(p.axes[2]), ry: deadzone(p.axes[3]),
      fine: lt > 0.3 || down.L3,
      down, edge,
      any: Object.values(down).some(Boolean) || Math.abs(p.axes[0]) > 0.4 || Math.abs(p.axes[1]) > 0.4 || Math.abs(p.axes[2]) > 0.4 || Math.abs(p.axes[3]) > 0.4,
    };
  }

  /** Best-effort rumble; harmless where unsupported. */
  rumble(strong = 0.5, weak = 0.3, ms = 80) {
    const p = this.pad();
    const act = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
    if (!act) return;
    try {
      if (act.playEffect) act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong });
      else if (act.pulse) act.pulse(strong, ms);
    } catch { /* unsupported */ }
  }
}

/** Angular turn rate (rad/s) for a stick deflection: quadratic, so small pushes are precise. */
export function aimRate(x, fine, sens = 1) {
  return -Math.sign(x) * x * x * 2.4 * sens * (fine ? 0.18 : 1);
}
