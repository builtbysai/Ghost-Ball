// Shot planner. Follows the shape of PickPocket (Smith 2007): enumerate
// geometric candidates, verify each in the real simulator under execution
// noise, score the leave, fall back to safeties when nothing looks good.
// Written as generators so the UI can time-slice it without freezing.

import { R } from './physics.js';
import { HEAD_X, HALF_L, HALF_W, FOOT_X, validCuePlacement } from './table.js';
import { legalTargets, resolveShot, mustCall8, ONE_POCKET_OWNERS } from './rules.js';

export const LEVELS = [
  { id: 0, name: 'Rookie', blurb: 'A gentle start', sigA: 0.030, sigV: 0.08, cands: 3, speeds: 1, spins: [[0, 0]], rolls: 1, leave: 0, safety: false, think: 1.1, pick: 3 },
  { id: 1, name: 'Club Pro', blurb: 'The house standard', sigA: 0.0085, sigV: 0.04, cands: 8, speeds: 2, spins: [[0, 0], [0, 0.25], [0, -0.25]], rolls: 2, leave: 0.35, safety: false, kicks: true, think: 1.4, pick: 1 },
  { id: 2, name: 'Champion', blurb: 'No mercy', sigA: 0.0018, sigV: 0.012, cands: 10, speeds: 3, spins: [[0, 0], [0, 0.3], [0, -0.3]], rolls: 2, leave: 0.6, safety: true, banks: true, kicks: true, jumps: true, think: 1.7, pick: 1 },
];

const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
// gaussian from a uniform source (Box-Muller)
const ownPocket = (rules, player) => (rules.kind === 'onepocket' ? [ONE_POCKET_OWNERS[player]] : null);
const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

/**
 * Geometric pot candidates for a cue position: cheap, no simulation.
 * With banks on, each pocket is also mirrored across the four cushions and the
 * object ball is aimed at the mirror image, which is exactly a one-cushion bank.
 */
export function candidates(cue, balls, targets, table, only = null, banks = false) {
  const out = [];
  const rails = [{ axis: 'y', v: HALF_W - R }, { axis: 'y', v: -(HALF_W - R) }, { axis: 'x', v: HALF_L - R }, { axis: 'x', v: -(HALF_L - R) }];
  const clear = (ax, ay, bx, by, skip1, skip2) => {
    for (const o of balls) {
      if (o.pocketed || o.id === 0 || o.id === skip1 || o.id === skip2) continue;
      if (segDist(o.x, o.y, ax, ay, bx, by) < 2 * R * 0.99) return false;
    }
    return true;
  };
  for (const t of targets) {
    const tb = balls.find((b) => b.id === t && !b.pocketed);
    if (!tb) continue;
    table.pockets.forEach((pk, k) => {
      if (only && !only.includes(k)) return;
      const ax = pk.mx + (pk.x - pk.mx) * 0.45, ay = pk.my + (pk.y - pk.my) * 0.45;
      const variants = [{ px: ax, py: ay, bank: null }];
      if (banks) {
        for (const rl of rails) {
          // mirror the aim point across the plane the ball center travels on
          const px = rl.axis === 'x' ? 2 * rl.v - ax : ax, py = rl.axis === 'y' ? 2 * rl.v - ay : ay;
          // where the object ball would touch the cushion on the way to the mirror image
          const dx = px - tb.x, dy = py - tb.y;
          const tt = rl.axis === 'x' ? (rl.v - tb.x) / (dx || 1e-9) : (rl.v - tb.y) / (dy || 1e-9);
          if (tt <= 0.05 || tt >= 0.95) continue;
          const cx = tb.x + dx * tt, cy = tb.y + dy * tt;
          if (Math.abs(cx) > HALF_L - 0.16 || Math.abs(cy) > HALF_W - 0.1) continue;   // keep off the pocket jaws
          variants.push({ px, py, bank: { cx, cy } });
        }
      }
      for (const v of variants) {
        const [ux, uy] = norm(v.px - tb.x, v.py - tb.y);
        const gx = tb.x - ux * 2 * R, gy = tb.y - uy * 2 * R;
        const [cx, cy] = norm(gx - cue.x, gy - cue.y);
        const cosCut = cx * ux + cy * uy;
        if (cosCut < (v.bank ? 0.5 : 0.3)) continue;
        const dcg = Math.hypot(gx - cue.x, gy - cue.y);
        if (Math.abs(gx) > HALF_L - R || Math.abs(gy) > HALF_W - R) continue;
        let dta, ok;
        if (v.bank) {
          dta = Math.hypot(v.bank.cx - tb.x, v.bank.cy - tb.y) + Math.hypot(ax - v.bank.cx, ay - v.bank.cy);
          ok = clear(tb.x, tb.y, v.bank.cx, v.bank.cy, t) && clear(v.bank.cx, v.bank.cy, ax, ay, t);
        } else {
          dta = Math.hypot(ax - tb.x, ay - tb.y);
          ok = clear(tb.x, tb.y, ax, ay, t);
        }
        if (!ok || !clear(cue.x, cue.y, gx, gy, t)) continue;
        const score = cosCut * 1.1 - dcg * 0.22 - dta * 0.5 - (v.bank ? 0.55 : 0);
        out.push({ t, k, angle: Math.atan2(gy - cue.y, gx - cue.x), gx, gy, cosCut, dcg, dta, bank: !!v.bank, score });
      }
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

function baseSpeed(c) {
  const vObj = (Math.sqrt(2 * 0.11 * (c.dta + 0.45)) + 0.45) * (c.bank ? 1.4 : 1);   // a cushion takes a quarter of the speed
  return Math.min(8.5, vObj / Math.max(0.35, c.cosCut * 0.93) + 0.3 * c.dcg);
}

/** Pick the best spot for a ball in hand by scoring the geometric options from each. */
export function choosePlacement(sim, rules, table, rand, level) {
  const balls = sim.balls;
  const others = balls.filter((b) => b.id !== 0 && !b.pocketed);
  const onTable = balls.filter((b) => !b.pocketed).map((b) => b.id);
  const targets = legalTargets(rules, onTable);
  if (rules.kitchen && rules.breakShot) return { x: HEAD_X - 0.02, y: (rand() - 0.5) * 0.5 };
  const xMax = rules.kitchen ? HEAD_X : HALF_L - R - 0.01;
  let best = null;
  const tries = level.id === 0 ? 10 : 40;
  for (let i = 0; i < tries; i++) {
    const x = -HALF_L + R + 0.02 + rand() * (xMax + HALF_L - R - 0.02);
    const y = (rand() * 2 - 1) * (HALF_W - R - 0.02);
    if (!validCuePlacement(x, y, others, rules.kitchen)) continue;
    const c = candidates({ x, y }, balls, targets, table, ownPocket(rules, rules.turn));
    const s = c.length ? c[0].score + Math.min(0.3, c.length * 0.03) : -1;
    if (!best || s > best.s) best = { x, y, s };
  }
  return best || { x: HEAD_X - 0.1, y: 0 };
}

function outcome(base, rules, plan, level, rand) {
  const s = base.clone();
  const noiseA = gauss(rand) * level.sigA, noiseV = gauss(rand) * level.sigV;
  s.strike(0, plan.angle + noiseA, plan.speed * (1 + noiseV), plan.a, plan.b, plan.jump || 0, plan.masse || 0);
  s.runToRest(25);
  const onTableBefore = base.balls.filter((b) => !b.pocketed).map((b) => b.id);
  const res = resolveShot(rules, { events: s.events, onTableBefore, calledPocket: plan.called });
  return { s, rules: res.rules, result: res.result };
}

function scoreOutcome(o, table, level, me) {
  const { result, rules, s } = o;
  let v = 0;
  if (rules.winner === me) return 10;
  if (rules.winner != null) return -10;
  if (result.foul) return result.scratch ? -1.4 : -1;
  const onTable = s.balls.filter((b) => !b.pocketed).map((b) => b.id);
  const cue = s.ball(0);
  const potted = result.pocketed.length - result.respot.length;
  const leaveScore = (who) => {
    const t = legalTargets(rules, onTable);
    const c = candidates(cue, s.balls, t, table, ownPocket(rules, who));
    return c.length ? Math.min(1, Math.max(0, c[0].score + 0.4)) : 0;
  };
  if (result.continueTurn) {
    v += 0.7 + 0.25 * potted;
    if (level.leave > 0 && !cue.pocketed) v += level.leave * (leaveScore(me) - 0.3);
  } else {
    // this shot ends our turn: prefer leaving the opponent nothing
    v -= 0.25;
    if (level.leave > 0) v -= level.leave * leaveScore(rules.turn) * 0.8;
    if (potted && rules.kind === 'eight') v -= 0.15 * potted; // fed the opponent
  }
  return v;
}

/**
 * Plan a shot for the player to move. Yields between simulations.
 * Returns { angle, speed, a, b, called, place? }.
 */
export function* planShot({ sim, rules, table, level, rand }) {
  const me = rules.turn;
  const onTable = sim.balls.filter((b) => !b.pocketed).map((b) => b.id);
  let place = null;
  let base = sim;
  if (rules.ballInHand) {
    place = choosePlacement(sim, rules, table, rand, level);
    base = sim.clone();
    base.ball(0).x = place.x; base.ball(0).y = place.y; base.ball(0).pocketed = false;
  }
  const cue = base.ball(0);
  const targets = legalTargets(rules, onTable);

  // the break: straight at the apex ball, full power
  if (rules.breakShot) {
    const objs = base.balls.filter((b) => b.id !== 0 && !b.pocketed);
    const apex = rules.kind === 'nine' ? base.ball(1) : objs.slice().sort((a, b) => a.x - b.x)[0];
    const power = [6.4, 8.0, 9.2][level.id];
    return { angle: Math.atan2(apex.y - cue.y, apex.x - cue.x), speed: power, a: 0, b: level.id === 2 ? 0.12 : 0, called: null, place };
  }

  const cands = candidates(cue, base.balls, targets, table, ownPocket(rules, me), !!level.banks).slice(0, level.cands);
  const need8 = mustCall8(rules, onTable);
  const plans = [];
  for (const c of cands) {
    const sp0 = baseSpeed(c);
    const speeds = level.speeds === 1 ? [sp0 * 1.15] : level.speeds === 2 ? [sp0, sp0 * 1.4] : [sp0 * 0.9, sp0 * 1.25, sp0 * 1.7];
    for (const sp of speeds) for (const [a, b] of level.spins) {
      plans.push({ angle: c.angle, speed: Math.min(9, sp), a, b, called: need8 ? c.k : null });
    }
  }

  const scored = [];
  for (const plan of plans) {
    let tot = 0;
    for (let i = 0; i < level.rolls; i++) tot += scoreOutcome(outcome(base, rules, plan, level, rand), table, level, me);
    scored.push({ plan, v: tot / level.rolls });
    yield;
  }
  scored.sort((a, b) => b.v - a.v);

  let best = scored[0];
  // safety play: when no pot looks good, leave the opponent tough
  if (level.safety && (!best || best.v < 0.9)) {
    const safes = [];
    for (const t of targets) {
      const tb = base.balls.find((b) => b.id === t && !b.pocketed);
      if (!tb) continue;
      const [dx, dy] = norm(tb.x - cue.x, tb.y - cue.y);
      const ang0 = Math.atan2(dy, dx);
      for (const off of [-0.09, 0, 0.09]) for (const sp of [0.9, 1.4, 2.0]) {
        safes.push({ angle: ang0 + off, speed: sp, a: 0, b: sp < 1.2 ? -0.1 : 0, called: need8 ? -1 : null });
      }
    }
    const precise = { ...level, sigA: 0.001, sigV: 0.005 };
    const scoredSafe = [];
    for (const plan of safes) {
      const o = outcome(base, rules, plan, precise, rand);
      let v = o.result.foul ? -1 : -0.2;
      if (!o.result.foul) {
        const t = legalTargets(o.rules, o.s.balls.filter((b) => !b.pocketed).map((b) => b.id));
        const c = candidates(o.s.ball(0), o.s.balls, t, table, ownPocket(o.rules, o.rules.turn));
        v -= c.length ? Math.min(1, Math.max(0, c[0].score + 0.4)) : 0;
      }
      scoredSafe.push({ plan, v });
      yield;
    }
    scoredSafe.sort((a, b) => b.v - a.v);
    if (scoredSafe[0] && (!best || scoredSafe[0].v > best.v)) best = scoredSafe[0];
  }

  // snookered or nothing good: try to reach a legal ball by bouncing off a cushion first, or by jumping the blocker
  if ((level.kicks || level.jumps) && (!best || best.v <= 0.1) && targets.length) {
    const rails = [{ axis: 'y', v: HALF_W - R }, { axis: 'y', v: -(HALF_W - R) }, { axis: 'x', v: HALF_L - R }, { axis: 'x', v: -(HALF_L - R) }];
    const rescue = [];
    for (const t of targets) {
      const tb = base.balls.find((b) => b.id === t && !b.pocketed);
      if (!tb) continue;
      if (level.kicks) {
        for (const rl of rails) {
          const mx = rl.axis === 'x' ? 2 * rl.v - tb.x : tb.x, my = rl.axis === 'y' ? 2 * rl.v - tb.y : tb.y;
          const ang = Math.atan2(my - cue.y, mx - cue.x);
          for (const sp of [2.2, 3.4, 4.8]) rescue.push({ angle: ang, speed: sp, a: 0, b: 0, called: need8 ? -1 : null });
        }
      }
      if (level.jumps) {
        const ang = Math.atan2(tb.y - cue.y, tb.x - cue.x);
        for (const j of [0.28, 0.4]) for (const sp of [3.6, 4.6]) rescue.push({ angle: ang, speed: sp, a: 0, b: 0, jump: j, called: need8 ? -1 : null });
      }
    }
    const precise2 = { ...level, sigA: 0.002, sigV: 0.008 };
    for (const plan of rescue) {
      const o = outcome(base, rules, plan, precise2, rand);
      const v = scoreOutcome(o, table, level, me) - 0.15;      // a small premium on doing this the easy way
      if (!best || v > best.v) best = { plan, v };
      yield;
    }
  }

  if (level.pick > 1 && scored.length) {
    const top = scored.slice(0, level.pick);
    best = top[Math.floor(rand() * top.length)];
  }
  if (best && best.plan) return { ...best.plan, place };

  // nothing reachable: just make contact with the nearest legal ball
  let near = null;
  for (const t of targets) {
    const tb = base.balls.find((b) => b.id === t && !b.pocketed);
    if (!tb) continue;
    const d = Math.hypot(tb.x - cue.x, tb.y - cue.y);
    if (!near || d < near.d) near = { tb, d };
  }
  const tb = near ? near.tb : { x: FOOT_X, y: 0 };
  return { angle: Math.atan2(tb.y - cue.y, tb.x - cue.x), speed: 2.4, a: 0, b: 0, called: need8 ? -1 : null, place };
}

/** Drive a generator to completion synchronously (tests, tools). */
export function planNow(args) {
  const g = planShot(args);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
