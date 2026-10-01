// Sim determinism + physics sanity. Owned by the sim workstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, STEP, runToRest, R, MASS } from '../src/sim/physics.js';
import { mulberry32 } from '../src/sim/rng.js';
import { previewShot } from '../src/sim/preview.js';

const INERTIA = 0.4 * MASS * R * R;

function energy(s) {
  let e = 0;
  for (const b of s.balls) {
    if (b.pocketed) continue;
    e += 0.5 * MASS * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    e += 0.5 * INERTIA * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
  }
  return e;
}

/** Cue ball plus a 15-ball triangle, apex at the foot spot. */
function rackedSim() {
  const s = new Sim();
  s.addBall(0, -0.9, 0);
  const D = 2 * R + 0.00022;
  const rowDx = (Math.sqrt(3) / 2) * D;
  let id = 1;
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      s.addBall(id++, 0.635 + row * rowDx, (i - row / 2) * D);
    }
  }
  return s;
}

function twoBall(cueX, objX = 0) {
  const s = new Sim();
  s.addBall(0, cueX, 0);
  s.addBall(1, objX, 0);
  return s;
}

/** Step until the first cue-involved contact; return post-contact speeds. */
function untilContact(s, maxSteps = 4000) {
  for (let i = 0; i < maxSteps; i++) {
    const evs = s.step();
    for (const e of evs) {
      if (e.type === 'contact' && (e.a === 0 || e.b === 0)) {
        const c = s.cueBall(), o = s.ball(1);
        return {
          cueV: Math.hypot(c.vx, c.vy),
          objV: Math.hypot(o.vx, o.vy),
          cueVx: c.vx, cueVy: c.vy,
        };
      }
    }
  }
  return null;
}

test('determinism: same strikes incl. spin, shuffled interleaved steps -> identical snapshots', () => {
  const a = rackedSim(), b = rackedSim();
  const shot = { angle: 0.05, speed: 8, spin: { x: 0.2, y: -0.1 } };
  a.strike(shot);
  b.strike(shot);
  const rng = mulberry32(42);
  for (let i = 0; i < 400; i++) {
    if (rng() < 0.5) { a.step(); b.step(); } else { b.step(); a.step(); }
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('determinism: runToRest from the same seed lands identically', () => {
  const mk = () => {
    const s = rackedSim();
    s.strike({ angle: -0.03, speed: 9.5, spin: { x: -0.15, y: 0.3 } });
    return s;
  };
  const a = mk(), c = mk();
  runToRest(a);
  runToRest(c);
  assert.deepEqual(a.snapshot(), c.snapshot());
});

test('stun shot: straight stop shot, cue speed < 5% of object speed after contact', () => {
  const s = twoBall(-0.25);
  s.strike({ angle: 0, speed: 2.5, spin: { x: 0, y: 0 } });
  const r = untilContact(s);
  assert.ok(r, 'contact happened');
  assert.ok(r.cueV < 0.05 * r.objV, `cue ${r.cueV.toFixed(4)} vs obj ${r.objV.toFixed(4)}`);
});

test('follow: top spin carries the cue ball forward through the object ball', () => {
  const s = twoBall(-0.6);
  s.strike({ angle: 0, speed: 3, spin: { x: 0, y: 0.4 } });
  const r = untilContact(s);
  assert.ok(r, 'contact happened');
  for (let i = 0; i < 40; i++) s.step();
  const c = s.cueBall();
  assert.ok(c.vx > 0.2, `cue still moving forward after follow, vx=${c.vx.toFixed(3)}`);
});

test('draw: backspin brings the cue ball back after contact', () => {
  const s = twoBall(-0.35);
  s.strike({ angle: 0, speed: 3, spin: { x: 0, y: -0.4 } });
  const r = untilContact(s);
  assert.ok(r, 'contact happened');
  for (let i = 0; i < 40; i++) s.step();
  const c = s.cueBall();
  assert.ok(c.vx < -0.2, `cue drew back, vx=${c.vx.toFixed(3)}`);
});

test('30-degree rule: stun cut at 30 deg -> cue deflects 90 +/- 6 deg', () => {
  const s = new Sim();
  const cut = Math.PI / 6;
  const nx = Math.cos(cut), ny = Math.sin(cut);   // line of centers at contact
  const gx = -nx * 2 * R, gy = -ny * 2 * R;       // ghost-ball position
  s.addBall(0, gx - 0.18, gy);                    // cue ball, short of the slide distance
  s.addBall(1, 0, 0);
  s.strike({ angle: 0, speed: 2.5, spin: { x: 0, y: 0 } });
  const r = untilContact(s);
  assert.ok(r, 'contact happened');
  const c = s.cueBall();
  const cv = Math.hypot(c.vx, c.vy);
  assert.ok(cv > 0.1, 'cue ball has post-contact speed');
  const cosA = (c.vx * nx + c.vy * ny) / cv;
  const defl = (Math.acos(Math.min(1, Math.max(-1, cosA))) * 180) / Math.PI;
  assert.ok(Math.abs(defl - 90) < 6, `cue deflection ${defl.toFixed(2)} deg, want 90 +/- 6`);
});

test('energy never increases across a busy rack sim', () => {
  const s = rackedSim();
  s.strike({ angle: 0.02, speed: 9.5, spin: { x: 0.1, y: 0.2 } });
  let prev = energy(s);
  for (let i = 0; i < 600; i++) {
    s.step();
    const e = energy(s);
    assert.ok(e <= prev * (1 + 1e-9) + 1e-12, `energy rose: ${prev} -> ${e} at step ${i}`);
    prev = e;
  }
});

test('ball count conserved through a break', () => {
  const s = rackedSim();
  s.strike({ angle: 0, speed: 9.5, spin: { x: 0, y: 0 } });
  runToRest(s);
  const active = s.balls.filter((b) => !b.pocketed).length;
  const potted = s.balls.filter((b) => b.pocketed).length;
  assert.equal(active + potted, 16);
});

test('snapshot round-trip: load -> equal, then still equal after stepping', () => {
  const s = rackedSim();
  s.strike({ angle: 0.1, speed: 5, spin: { x: 0.2, y: 0.2 } });
  for (let i = 0; i < 50; i++) s.step();
  const snap = s.snapshot();
  const s2 = new Sim();
  s2.loadSnapshot(snap);
  assert.deepEqual(s2.snapshot(), snap);
  for (let i = 0; i < 50; i++) { s.step(); s2.step(); }
  assert.deepEqual(s.snapshot(), s2.snapshot());
});

test('sim.balls is the live store: mutation visible, clone independent', () => {
  const s = rackedSim();
  assert.equal(s.balls.length, 16);
  const c = s.clone();
  c.balls.length = 0;
  assert.equal(s.balls.length, 16);
  assert.equal(c.balls.length, 0);
  s.balls.length = 0;
  assert.equal(s.balls.length, 0);
});

test('previewShot: straight shot finds contact, ghost, and the pocket', () => {
  const s = new Sim();
  const p = s.table.pockets[1]; // (+x,+y) corner
  s.addBall(0, p.mx - 0.8, p.my);
  s.addBall(1, p.mx - 0.25, p.my);
  const pv = previewShot(s, { angle: 0, speed: 2, spin: { x: 0, y: 0 } }, {});
  assert.equal(pv.firstContactId, 1);
  assert.ok(pv.contact && pv.ghost, 'contact and ghost present');
  assert.ok(pv.cuePath.length > 2, 'cue path sampled');
  assert.ok(pv.objPath.length > 0, 'object-ball tail sampled');
  assert.equal(pv.targetPocket, 1);
  // the live sim was not mutated by the preview
  assert.equal(s.cueBall().vx, 0);
  assert.equal(s.ball(1).x, p.mx - 0.25);
});

test('strike caps speed at maxSpeed and applies squirt', () => {
  const s = twoBall(-0.5);
  const eff = s.strike({ angle: 0, speed: 99, spin: { x: 0, y: 0 } });
  const c = s.cueBall();
  assert.ok(Math.hypot(c.vx, c.vy) <= 9.5 + 1e-9);
  assert.equal(eff, 0);
  const s2 = twoBall(-0.5);
  const eff2 = s2.strike({ angle: 0, speed: 3, spin: { x: 0.5, y: 0 } });
  assert.ok(Math.abs(eff2 - 0.045 * 0.5) < 1e-12, `squirt deflected to ${eff2}`);
});
