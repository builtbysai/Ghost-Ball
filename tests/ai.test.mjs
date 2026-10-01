// AI shot choice. Owned by the sim workstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, runToRest } from '../src/sim/physics.js';
import { Rules8 } from '../src/sim/rules.js';
import { chooseShot } from '../src/modes/ai.js';
import { mulberry32 } from '../src/sim/rng.js';

/** Dead-straight pot: cue, ball 1, and corner pocket 1 on one line. */
function straightLayout() {
  const s = new Sim();
  const p = s.table.pockets[1]; // (+x, +y) corner
  s.addBall(0, p.mx - 0.8, p.my);
  s.addBall(1, p.mx - 0.25, p.my);
  return s;
}

/** Cue is blocked from ball 1 by ball 2; only a kick can reach it. */
function snookeredLayout() {
  const s = new Sim();
  s.addBall(0, -0.9, 0);
  s.addBall(1, 0.9, 0);
  s.addBall(2, 0.3, 0);
  return s;
}

test('club pots a straight open-table ball through the real Sim', () => {
  const s = straightLayout();
  const rules = new Rules8();
  rules.startRack(0);
  const rng = mulberry32(7);
  const { aimAngle, shot } = chooseShot(s, rules, 'club', rng);
  assert.ok(Number.isFinite(aimAngle), 'aimAngle finite');
  assert.ok(shot.speed > 0 && shot.speed <= 9.5, `speed ${shot.speed}`);
  assert.equal(shot.angle, aimAngle, 'aimAngle is the executed angle');
  const s2 = s.clone();
  s2.strike(shot);
  runToRest(s2);
  assert.ok(s2.ball(1).pocketed, 'ball 1 potted by the AI shot');
});

test('snookered layout still returns a finite legal kick attempt', () => {
  const s = snookeredLayout();
  const rules = new Rules8();
  rules.startRack(0);
  const rng = mulberry32(11);
  for (const tier of ['rookie', 'club', 'champ']) {
    const { aimAngle, shot } = chooseShot(s, rules, tier, mulberry32(11));
    assert.ok(Number.isFinite(aimAngle), `${tier}: aimAngle finite`);
    assert.ok(Number.isFinite(shot.angle) && Number.isFinite(shot.speed), `${tier}: shot finite`);
    assert.ok(shot.speed > 0 && shot.speed <= 9.5, `${tier}: speed sane`);
    assert.ok(Number.isFinite(shot.spin.x) && Number.isFinite(shot.spin.y), `${tier}: spin finite`);
  }
  void rng;
});

test('seeded rng -> identical choice twice', () => {
  const s = straightLayout();
  const rules = new Rules8();
  rules.startRack(0);
  const a = chooseShot(s, rules, 'champ', mulberry32(99));
  const b = chooseShot(s, rules, 'champ', mulberry32(99));
  assert.deepEqual(a, b);
});

test('tier noise: rookie aims noisier than champ', () => {
  // Same layout, same seed stream shape: rookie's executed angle should
  // deviate more from the geometric line than champ's, on average.
  const s = straightLayout();
  const rules = new Rules8();
  rules.startRack(0);
  let rookieDev = 0, champDev = 0;
  const N = 6;
  for (let i = 0; i < N; i++) {
    const rr = chooseShot(s, rules, 'rookie', mulberry32(1000 + i));
    const cc = chooseShot(s, rules, 'champ', mulberry32(1000 + i));
    rookieDev += Math.abs(rr.aimAngle - 0);
    champDev += Math.abs(cc.aimAngle - 0);
  }
  assert.ok(rookieDev > champDev, `rookie ${rookieDev.toFixed(4)} > champ ${champDev.toFixed(4)}`);
});

test('champ still pots the straight ball (noise is small)', () => {
  const s = straightLayout();
  const rules = new Rules8();
  rules.startRack(0);
  const { shot } = chooseShot(s, rules, 'champ', mulberry32(5));
  const s2 = s.clone();
  s2.strike(shot);
  runToRest(s2);
  assert.ok(s2.ball(1).pocketed, 'champ pots the straight ball');
});
