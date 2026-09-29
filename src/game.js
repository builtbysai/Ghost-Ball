// Headless match controller: owns the simulation, the referee and the running
// stats, so the UI, the AI and the tests all drive exactly the same game.

import { Sim } from './physics.js';
import { buildTable, rackPositions, HEAD_X, HALF_L, POCKET_PRESETS, rng } from './table.js';
import { newRules, resolveShot, respotPosition, mustCall8 } from './rules.js';
import { analyzeShot, runTag } from './shotinfo.js';

export const CLOTH = {
  fast: { muRoll: 0.008 },
  standard: {},
  slow: { muRoll: 0.015, muSlide: 0.24 },
};

const blankStats = () => ({ shots: 0, pots: 0, fouls: 0, run: 0, bestRun: 0, banks: 0, kicks: 0, combos: 0, draws: 0, jumps: 0, golden: 0, xp: 0, tags: [] });

/**
 * opts.setup (trick shots): { cue: {x,y}, balls: [{id,x,y}] } replaces the rack.
 */
export function newMatch({ kind = 'eight', seed = 1, pocket = 'standard', cloth = 'standard', breaker = 0, trackOrient = false, setup = null } = {}) {
  const table = buildTable(POCKET_PRESETS[pocket] ?? POCKET_PRESETS.standard);
  const sim = new Sim({ table, trackOrient, params: CLOTH[cloth] || {} });
  const m = { kind, seed, table, sim, setup, rules: newRules(kind, { breaker }), pending: null, log: [], stats: [blankStats(), blankStats()] };
  rerack(m);
  return m;
}

export function rerack(m) {
  const { sim } = m;
  sim.balls = [];
  sim.time = 0; sim.events = [];
  if (m.setup) {
    sim.addBall(0, m.setup.cue.x, m.setup.cue.y);
    for (const b of m.setup.balls) sim.addBall(b.id, b.x, b.y);
  } else {
    sim.addBall(0, HEAD_X, 0);
    const layout = m.kind === 'nine' || m.kind === 'runout' ? 'nine' : 'eight';
    for (const r of rackPositions(layout, m.seed)) sim.addBall(r.id, r.x, r.y);
  }
  // racked balls sit with their numbers roughly facing up, each at its own angle
  const rand = rng(m.seed * 31 + 7);
  for (const b of sim.balls) b.q = b.id === 0 ? randomQuat(rand) : numberUpQuat(rand);
}

// body +x (the number disc) toward the viewer, tilted a little, random spin about the vertical
function numberUpQuat(rand) {
  const tilt = (rand() - 0.5) * 0.9, tiltAxis = rand() * Math.PI * 2, roll = rand() * Math.PI * 2;
  const qy = [Math.cos(-Math.PI / 4), 0, Math.sin(-Math.PI / 4), 0];       // -90 degrees about y: x -> z
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  const qz = [Math.cos(roll / 2), 0, 0, Math.sin(roll / 2)];
  const ax = Math.cos(tiltAxis), ay = Math.sin(tiltAxis), st = Math.sin(tilt / 2);
  const qt = [Math.cos(tilt / 2), ax * st, ay * st, 0];
  return mul(qt, mul(qz, qy));
}
function randomQuat(rand) {
  const u1 = rand(), u2 = rand() * Math.PI * 2, u3 = rand() * Math.PI * 2;
  return [Math.sqrt(1 - u1) * Math.sin(u2), Math.sqrt(1 - u1) * Math.cos(u2), Math.sqrt(u1) * Math.sin(u3), Math.sqrt(u1) * Math.cos(u3)];
}

export const onTableIds = (m) => m.sim.balls.filter((b) => !b.pocketed).map((b) => b.id);

/** Put the cue ball down (ball in hand). */
export function placeCue(m, x, y) {
  const cue = m.sim.ball(0);
  cue.x = x; cue.y = y; cue.pocketed = false; cue.pocket = -1;
  cue.vx = cue.vy = cue.wx = cue.wy = cue.wz = 0;
}

/** Fire the cue. Records the pre-shot table so the referee can judge afterwards. */
export function beginShot(m, plan) {
  const { sim } = m;
  m.pending = {
    onTableBefore: onTableIds(m),
    called: plan.called ?? (mustCall8(m.rules, onTableIds(m)) ? -1 : null),
    positions: sim.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })),
    wasBreak: m.rules.breakShot,
    shooter: m.rules.turn,
    plan: { a: plan.a || 0, b: plan.b || 0, jump: plan.jump || 0 },
  };
  sim.events = [];
  sim.shotStart = sim.time;          // the live loop's safety timeout is relative to this, never to the match clock
  return sim.strike(0, plan.angle, plan.speed, plan.a || 0, plan.b || 0, plan.jump || 0);
}

/** Judge the finished shot, respot balls, update stats, and hand back the result. */
export function endShot(m) {
  const { sim } = m;
  sim.settle();
  const { onTableBefore, called, positions, wasBreak, shooter, plan } = m.pending;
  const { rules, result } = resolveShot(m.rules, { events: sim.events, onTableBefore, calledPocket: called });
  m.rules = rules;
  for (const id of result.respot) {
    const b = sim.ball(id);
    const spot = respotPosition(sim.balls.filter((o) => !o.pocketed && o.id !== id), HALF_L);
    b.pocketed = false; b.pocket = -1; b.x = spot.x; b.y = spot.y; b.vx = b.vy = 0;
  }
  const cue = sim.ball(0);
  const cueAfter = { x: cue.x, y: cue.y, pocketed: cue.pocketed };
  if (cue.pocketed) placeCue(m, HEAD_X, 0);          // parked until the incoming player places it

  // stats and callouts for the shooter
  const st = m.stats[shooter % 2];
  st.shots++;
  const goodPots = result.foul ? 0 : result.pocketed.filter((id) => !result.respot.includes(id)).length;
  st.pots += goodPots;
  if (result.foul) { st.fouls++; st.run = 0; }
  else if (goodPots > 0) { st.run += goodPots; st.bestRun = Math.max(st.bestRun, st.run); }
  else st.run = 0;
  const tags = analyzeShot({ events: sim.events, before: positions, cueAfter, result, breakShot: wasBreak, kind: m.kind, plan });
  const rt = !result.foul && goodPots > 0 ? runTag(st.run) : null;
  if (rt) tags.push(rt);
  for (const t of tags) {
    st.tags.push(t.id); st.xp += t.xp;
    if (t.id === 'BANK') st.banks++; else if (t.id === 'KICK') st.kicks++; else if (t.id === 'COMBO') st.combos++; else if (t.id === 'DRAW') st.draws++; else if (t.id === 'JUMP') st.jumps++; else if (t.id === 'GOLDEN') st.golden++;
  }
  st.xp += goodPots * 5;
  result.tags = tags;
  result.shooter = shooter;
  m.pending = null;
  m.log.push(result);
  return result;
}

/** Run a planned shot to completion instantly (AI vs AI, tests). */
export function playShotNow(m, plan) {
  if (plan.place) placeCue(m, plan.place.x, plan.place.y);
  beginShot(m, plan);
  m.sim.runToRest(45);
  return endShot(m);
}
