import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, R, MASS } from '../src/physics.js';
import { rackPositions, HALF_L, HALF_W } from '../src/table.js';

const deg = (r) => r * 180 / Math.PI;
const untilEvent = (sim, type, max = 40000) => {
  for (let i = 0; i < max && !sim.events.some(e => e.type === type); i++) sim.step(sim.nextDt());
  assert.ok(sim.events.some(e => e.type === type), `expected a ${type} event`);
};

// Object ball at origin, cue ball 8 cm behind on a line that produces the given cut.
function cutShot(cutDeg, speed, a = 0, b = 0) {
  const th = cutDeg * Math.PI / 180;
  const sim = new Sim();
  sim.addBall(1, 0, 0);
  sim.addBall(0, -2 * R * Math.cos(th) - 0.02, -2 * R * Math.sin(th));
  sim.strike(0, 0, speed, a, b);
  untilEvent(sim, 'ball');
  sim.advance(sim.time + 0.004);
  return sim;
}

test('follow carries the cue ball forward and draw pulls it back after a close head-on hit', () => {
  const play = (b) => {
    const sim = new Sim();
    sim.addBall(0, -0.08, 0); sim.addBall(1, 0, 0);
    sim.strike(0, 0, 2, 0, b);
    sim.runToRest();
    return sim.ball(0).x;
  };
  const follow = play(0.4), draw = play(-0.4);
  assert.ok(follow > 0.1, `follow ended at ${follow}`);
  assert.ok(draw < -0.5, `draw ended at ${draw}`);
});

test('tip height 0.4R launches the cue ball already rolling (no slide)', () => {
  const sim = new Sim();
  sim.addBall(0, -1, 0);
  sim.strike(0, 0, 1.5, 0, 0.4);
  sim.advance(0.05);
  const c = sim.ball(0);
  assert.ok(Math.abs(c.vx - R * c.wy) < 1e-3);
});

test('cut shots: object ball throws toward the cue direction and stun cue ball leaves near 90 degrees', () => {
  for (const cut of [20, 30, 40]) {
    const sim = cutShot(cut, 2.5);
    const o = sim.ball(1), c = sim.ball(0);
    const objDir = deg(Math.atan2(o.vy, o.vx));
    assert.ok(objDir < cut && objDir > cut - 5, `${cut} deg cut sent the object ball at ${objDir}`);
    const cueDir = deg(Math.atan2(c.vy, c.vx));
    // tangent line is (cut - 90); a stun ball is within ~15 degrees of it
    assert.ok(Math.abs(cueDir - (cut - 90)) < 16, `cue left at ${cueDir} for a ${cut} cut`);
  }
});

test('a long cushion bank flattens with running english and deepens with reverse english', () => {
  const out = (a) => {
    const sim = new Sim();
    sim.addBall(0, 0, 0);
    sim.strike(0, Math.PI / 4, 3, a, 0);
    untilEvent(sim, 'rail');
    sim.advance(sim.time + 0.03);
    const c = sim.ball(0);
    return Math.abs(deg(Math.atan2(c.vy, c.vx)));
  };
  const running = out(0.4), none = out(0), reverse = out(-0.4);
  assert.ok(running < none - 3, `running ${running} vs none ${none}`);
  assert.ok(reverse >= none - 1.5, `reverse ${reverse} vs none ${none}`);
});

test('a full break is deterministic, never gains energy, and keeps balls on the table', () => {
  const build = () => {
    const sim = new Sim();
    sim.addBall(0, -0.6, 0.01);
    for (const r of rackPositions('eight', 7)) sim.addBall(r.id, r.x, r.y);
    sim.strike(0, 0, 9, 0, 0);
    return sim;
  };
  const energy = (s) => s.balls.filter(b => !b.pocketed).reduce((sum, b) =>
    sum + 0.5 * MASS * (b.vx ** 2 + b.vy ** 2) + 0.2 * MASS * R * R * (b.wx ** 2 + b.wy ** 2 + b.wz ** 2), 0);
  const a = build(), b = build();
  let prev = energy(a), worstRise = 0;
  while (a.isMoving() && a.time < 40) {
    a.step(a.nextDt());
    const e = energy(a);
    worstRise = Math.max(worstRise, e - prev);
    prev = e;
  }
  b.runToRest(40);
  assert.ok(worstRise < 1e-9, `energy rose by ${worstRise} J in one step`);
  for (const ball of a.balls) {
    const o = b.ball(ball.id);
    assert.equal(ball.pocketed, o.pocketed);
    if (!ball.pocketed) {
      assert.ok(Math.abs(ball.x) <= HALF_L && Math.abs(ball.y) <= HALF_W, `ball ${ball.id} left the table`);
      assert.ok(Math.abs(ball.x - o.x) < 1e-6 && Math.abs(ball.y - o.y) < 1e-6);
    }
  }
});

test('a ball fired at the middle of a pocket drops; one aimed just clear of the mouth does not', () => {
  const shoot = (x, y, tx, ty) => {
    const sim = new Sim();
    sim.addBall(0, x, y);
    sim.strike(0, Math.atan2(ty - y, tx - x), 2.5, 0, 0.4);
    sim.runToRest();
    return sim.ball(0).pocketed;
  };
  assert.equal(shoot(0.9, 0.35, HALF_L, HALF_W), true, 'corner pocket');
  assert.equal(shoot(0.5, -0.4, 0, HALF_W), true, 'side pocket');
  assert.equal(shoot(0.5, -0.4, 0.14, HALF_W), false, 'rail beside the side pocket');
});

test('a jumped cue ball clears a blocker that a flat shot would hit, lands, and keeps rolling', () => {
  const run = (jump) => {
    const sim = new Sim();
    sim.addBall(0, -0.9, 0); sim.addBall(8, -0.35, 0); sim.addBall(6, 0.4, 0);
    sim.strike(0, 0, 4.5, 0, 0.1, jump);
    let apex = 0;
    while (sim.isMoving() && sim.time < 40) { sim.step(sim.nextDt()); apex = Math.max(apex, sim.ball(0).z); if (sim.events.some((e) => e.type === 'land')) break; }
    const touchedBlocker = sim.events.some((e) => e.type === 'ball' && (e.a === 8 || e.b === 8));
    return { sim, apex, touchedBlocker };
  };
  const flat = run(0);
  assert.equal(flat.apex, 0);
  assert.equal(flat.touchedBlocker, true, 'a flat shot should hit the blocker');
  const jumped = run(0.4);
  assert.ok(jumped.apex > 0.1, `apex ${jumped.apex}`);
  assert.equal(jumped.touchedBlocker, false, 'the jumped ball should pass over the blocker');
  jumped.sim.runToRest(30);
  const c = jumped.sim.ball(0);
  assert.equal(c.z, 0);
  assert.equal(c.vz, 0);
  assert.ok(jumped.sim.events.some((e) => e.type === 'land' && e.id === 0), 'it should land with an event');
});
