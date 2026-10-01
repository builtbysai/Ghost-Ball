// Exhibition: AI vs AI on any canvas, used as the menu attract. Owns its
// own lightweight rAF; the controller interface here is start/stop/resize.
// createAttract(canvas, { hall, left='club', right='rookie', pace=1 })
import { Sim, STEP } from '../sim/physics.js';
import { BALL_R, HALF_L, HALF_W, HEAD_X, FOOT_X } from '../sim/table.js';
import { Rules8 } from '../sim/rules.js';
import { chooseShot } from './ai.js';
import { Render2D } from '../render2d/renderer.js';

export function createAttract(canvas, opts = {}) {
  const hall = opts.hall;
  const tiers = [opts.left || 'club', opts.right || 'rookie'];
  const pace = opts.pace || 1;
  const sim = new Sim({ pocketScale: 1.06, trackOrient: true });
  const rules = new Rules8();
  let seed = 20260930;
  const rng = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let renderer = null, raf = 0, last = 0, running = false;
  let turn = 0, think = 0.5, rolling = false, accum = 0;
  let aiAngle = 0, targetAngle = 0;
  let firstContact = null, potted = [], cueDown = false, railHit = false;

  function rack() {
    sim.balls.length = 0;
    const order = [1];
    const rest = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    // keep the 8 in the middle
    const eightAt = rest.indexOf(8); rest.splice(eightAt, 1); rest.splice(4, 0, 8);
    order.push(...rest);
    const dx = Math.sqrt(3) * (2 * BALL_R + 0.0002);
    const dy = 2 * BALL_R + 0.0002;
    let n = 0;
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k <= row; k++) sim.addBall(order[n++], FOOT_X + row * dx, (k - row / 2) * dy);
    }
    sim.addBall(0, HEAD_X, 0);
    rules.startRack();
    turn = 0; rolling = false; think = 0.5; aiAngle = 0;
  }

  function tick(ts) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    if (rolling) {
      accum += dt * pace * 1.4;
      let used = 0;
      while (used < accum) {
        const evs = sim.step(STEP); used += STEP;
        for (const ev of evs) {
          if (ev.type === 'contact' && firstContact == null && (ev.a === 0 || ev.b === 0)) firstContact = ev.a === 0 ? ev.b : ev.a;
          if (ev.type === 'cushion' && firstContact != null) railHit = true;
          if (ev.type === 'pocket') {
            railHit = true;
            if (ev.ball === 0) cueDown = true; else potted.push(ev.ball);
          }
        }
        if (sim.rest()) { accum = 0; settle(); break; }
      }
      accum -= used;
    } else {
      think -= dt;
      const k = 1 - Math.exp(-dt * 5);
      aiAngle += shortest(aiAngle, targetAngle) * k;
      if (think <= 0) {
        think = 0.7; // watchability beat between shots
        try {
          const plan = chooseShot(sim, rules, tiers[turn], rng);
          targetAngle = plan.aimAngle;
          if (Math.abs(shortest(aiAngle, targetAngle)) < 0.03) {
            aiAngle = plan.aimAngle;
            sim.strike(plan.shot);
            firstContact = null; potted = []; cueDown = false; railHit = false;
            rolling = true; accum = 0;
          }
        } catch {
          sim.strike({ angle: aiAngle, speed: 2.5, spin: { x: 0, y: 0 } });
          firstContact = null; potted = []; cueDown = false; railHit = false;
          rolling = true; accum = 0;
        }
      }
    }
    const view = renderer.view();
    renderer.draw({
      balls: sim.balls,
      guide: null,
      marks: [],
      time: ts,
      cue: null, // no stick on the menu attract: the table stays calm under the column
      place: null,
    });
  }

  function settle() {
    rolling = false;
    const out = rules.settle({
      firstContactId: firstContact, potted, cuePotted: cueDown,
      railAfterContact: railHit, wasBreak: false,
    });
    if (out.gameOver) { rack(); return; }
    const respotId = out.respotId ?? (out.respot8 ? 8 : null);
    if (respotId != null) {
      const b = sim.ball(respotId);
      if (b) { b.pocketed = false; b.x = FOOT_X; b.y = 0; b.vx = b.vy = b.wx = b.wy = b.wz = 0; }
    }
    turn = out.nextTurn;
    if (out.ballInHand) {
      const cue = sim.ball(0);
      if (cue) {
        cue.pocketed = false; cue.vx = cue.vy = cue.wx = cue.wy = cue.wz = 0;
        outer: for (let gx = -8; gx <= 8; gx++) for (let gy = -4; gy <= 4; gy++) {
          const x = gx * 0.1, y = gy * 0.1;
          if (Math.abs(x) > HALF_L - 0.1 || Math.abs(y) > HALF_W - 0.1) continue;
          if (!sim.balls.some((bb) => !bb.pocketed && bb.id !== 0 && Math.hypot(bb.x - x, bb.y - y) < 0.09)) {
            cue.x = x; cue.y = y; break outer;
          }
        }
      }
    }
    think = 0.6;
  }

  function shortest(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  return {
    start() {
      renderer = new Render2D(canvas);
      renderer.setHall(hall);
      this.resize();
      rack();
      running = true; last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() {
      if (!renderer) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(50, rect.width), h = Math.max(50, rect.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      renderer.resize(w, h, dpr);
    },
  };
}
