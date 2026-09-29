// Trick-shot challenges. Each is a hand-built setup with an objective and a
// known solution. The tests replay every solution through the real engine, so a
// challenge can never ship unsolvable. Stars: 3 for first try, 2 within three
// tries, 1 for any solve.

import { newMatch, beginShot, endShot } from './game.js';

/**
 * objective:
 *   pot: ids that must all drop (default: any listed)   potAtLeast: N balls of any id
 *   require: a callout id from shotinfo (BANK, KICK, COMBO, DOUBLE, LONG, DRAW, FOLLOW)
 *   zone: { x, y, r } the cue ball must finish inside
 *   pocket: pocket index the listed ball must drop in
 *   noTouch: ids the cue ball must not touch
 *   minSpeed: the plan must be at least this fast (m/s)
 *   backspin / topspin: the plan must use draw (b <= -0.15) or follow (b >= 0.15)
 *   spinMin: the plan must use at least this much side spin (tip offset in radii)
 */
export const CHALLENGES = [
  { id: 'c01', name: 'First Light', blurb: 'A simple cut. Get your eye in.', setup: { cue: { x: -0.7, y: -0.1 }, balls: [{ id: 1, x: 0.6, y: 0.2 }] }, objective: { pot: [1] }, solution: { angle: 0.2068, speed: 1.2, a: 0, b: 0 } },
  { id: 'c02', name: 'Thin Ice', blurb: 'Slice it thin into the corner.', setup: { cue: { x: -0.5, y: -0.4 }, balls: [{ id: 2, x: 0.3, y: -0.35 }] }, objective: { pot: [2], pocket: 3 }, solution: { angle: 0.0904, speed: 1.2, a: 0, b: 0 } },
  { id: 'c03', name: 'Off the Rail', blurb: 'Only a bank will find this pocket.', setup: { cue: { x: -0.6, y: 0.3 }, balls: [{ id: 3, x: 0.5, y: -0.3 }] }, objective: { pot: [3], require: 'BANK' }, solution: { angle: -0.5033, speed: 1.2, a: 0, b: 0 } },
  { id: 'c04', name: 'Kick It', blurb: 'The eight blocks the straight line. Go around.', setup: { cue: { x: -0.9, y: 0 }, balls: [{ id: 8, x: -0.5, y: 0 }, { id: 4, x: 0.5, y: 0.35 }] }, objective: { pot: [4], require: 'KICK' }, solution: { angle: 0.6807, speed: 2.4, a: 0, b: 0 } },
  { id: 'c05', name: 'Two-Step', blurb: 'Drive one ball into the other.', setup: { cue: { x: -0.5, y: -0.1 }, balls: [{ id: 5, x: 0.4, y: 0 }, { id: 6, x: 0.85, y: 0.3 }] }, objective: { pot: [6], require: 'COMBO' }, solution: { angle: 0.0785, speed: 3.2, a: 0, b: 0 } },
  { id: 'c06', name: 'Screw It', blurb: 'Pot it and pull the cue ball home.', setup: { cue: { x: 0.1, y: -0.1 }, balls: [{ id: 7, x: 0.75, y: 0.3 }] }, objective: { pot: [7], backspin: true, zone: { x: 0.3, y: -0.05, r: 0.28 } }, solution: { angle: 0.5477, speed: 3.2, a: 0, b: -0.3 } },
  { id: 'c07', name: 'Follow Me', blurb: 'Pot it and roll on through.', setup: { cue: { x: -0.95, y: -0.25 }, balls: [{ id: 9, x: -0.15, y: 0.3 }] }, objective: { pot: [9], topspin: true, zone: { x: 0.5, y: 0.1, r: 0.5 } }, solution: { angle: 0.6303, speed: 1.2, a: 0, b: 0.3 } },
  { id: 'c08', name: 'Double Trouble', blurb: 'Two balls, one shot, one pocket.', setup: { cue: { x: -0.4, y: 0.2 }, balls: [{ id: 10, x: 0.9, y: 0.45 }, { id: 11, x: 0.9, y: 0.36 }] }, objective: { pot: [10, 11] }, solution: { angle: 0.2065, speed: 5.5, a: 0, b: 0 } },
  { id: 'c09', name: 'Cluster Buster', blurb: 'Crack the cluster and drop two.', setup: { cue: { x: -0.7, y: 0 }, balls: [{ id: 1, x: 0.3, y: 0 }, { id: 2, x: 0.3 + 0.0574, y: 0.0331 }, { id: 3, x: 0.3 + 0.0574, y: -0.0331 }, { id: 4, x: 0.3 + 0.1148, y: 0 }] }, objective: { potAtLeast: 2 }, solution: { angle: -0.0047, speed: 2.4, a: 0, b: 0 } },
  { id: 'c10', name: 'Long Way Home', blurb: 'The whole table between you and the ball.', setup: { cue: { x: -1.1, y: -0.3 }, balls: [{ id: 12, x: 0.8, y: 0.25 }] }, objective: { pot: [12], require: 'LONG' }, solution: { angle: 0.2698, speed: 1.2, a: 0, b: 0 } },
  { id: 'c11', name: 'Side Door', blurb: 'The side pocket is the only way in.', setup: { cue: { x: -0.5, y: 0.35 }, balls: [{ id: 13, x: 0.15, y: -0.3 }] }, objective: { pot: [13], pocket: 5 }, solution: { angle: -0.7254, speed: 2.4, a: 0, b: 0 } },
  { id: 'c12', name: 'Spin Doctor', blurb: 'Use English so the cue ball lands in the ring.', setup: { cue: { x: -0.8, y: -0.4 }, balls: [{ id: 14, x: 0.2, y: -0.3 }] }, objective: { pot: [14], spinMin: 0.15, zone: { x: 0.6, y: 0.35, r: 0.3 } }, solution: { angle: 0.0524, speed: 5.5, a: 0.3, b: 0 } },
  { id: 'c13', name: 'Over the Wall', blurb: 'Set the JUMP level, then leap the eight and pot the 6.', setup: { cue: { x: -0.2, y: -0.5 }, balls: [{ id: 8, x: 0.33, y: -0.09 }, { id: 6, x: 0.9, y: 0.35 }] }, objective: { pot: [6], require: 'JUMP', noTouch: [8] }, solution: { angle: 0.6283, speed: 4.2, a: 0, b: 0, jump: 0.28 } },
  { id: 'c14', name: 'Skip the Pack', blurb: 'Jump the blocker and drive the 11 to the corner.', setup: { cue: { x: -0.33, y: 0.31 }, balls: [{ id: 9, x: 0.18, y: 0.005 }, { id: 11, x: 0.7, y: -0.3 }] }, objective: { pot: [11], require: 'JUMP', noTouch: [9] }, solution: { angle: -0.555, speed: 4.2, a: 0, b: 0, jump: 0.28 } },
  { id: 'c15', name: 'Around the Corner', blurb: 'Set a MASSE level, hit off-centre, and curve around the eight to pot the 3.', setup: { cue: { x: -0.7, y: -0.05 }, balls: [{ id: 8, x: -0.2, y: 0.096 }, { id: 3, x: 0.5, y: 0.3 }] }, objective: { pot: [3], require: 'MASSE', noTouch: [8] }, solution: { angle: 0.9425, speed: 3.6, a: 0.15, b: 0, masse: 0.9 } },
  { id: 'c16', name: 'The Hook', blurb: 'Bend the cue ball around the blocker into the 12.', setup: { cue: { x: -0.6, y: 0.25 }, balls: [{ id: 9, x: 0.0, y: 0.041 }, { id: 12, x: 0.55, y: -0.15 }] }, objective: { pot: [12], require: 'MASSE', noTouch: [9] }, solution: { angle: 0.8116, speed: 4.6, a: 0.15, b: 0, masse: 0.9 } },
];

// Guided lessons: same machinery as the trick shots, with coaching text shown on every attempt.
export const LESSONS = [
  { id: 'l1', lesson: true, name: 'Aim and shoot', blurb: 'Line up the shot and pot the ball.', coach: 'Move to aim at the ball. Press, drag back and release to shoot.', setup: { cue: { x: 0.1, y: -0.05 }, balls: [{ id: 1, x: 0.618, y: 0.253 }] }, objective: { pot: [1], pocket: 1 }, solution: { angle: 0.5213, speed: 1.2, a: 0, b: 0 } },
  { id: 'l2', lesson: true, name: 'Power', blurb: 'A long shot needs real power.', coach: 'Soft shots stop short. Pull back about halfway on the strip.', setup: { cue: { x: -1.0, y: -0.1 }, balls: [{ id: 2, x: 0.55, y: 0.15 }] }, objective: { pot: [2], pocket: 1, minSpeed: 2.6 }, solution: { angle: 0.1439, speed: 3.2, a: 0, b: 0 } },
  { id: 'l3', lesson: true, name: 'Cutting a ball', blurb: 'Aim at the ghost ring, not the ball.', coach: 'The white ring is where the cue ball must be at contact. Aim so it lands there.', setup: { cue: { x: -0.5, y: -0.4 }, balls: [{ id: 3, x: 0.35, y: -0.15 }] }, objective: { pot: [3], pocket: 3 }, solution: { angle: 0.3341, speed: 1.8, a: 0, b: 0 } },
  { id: 'l4', lesson: true, name: 'Draw', blurb: 'Hit low and the cue ball comes back.', coach: 'Drag the red dot to the bottom of the ball for backspin, then shoot.', setup: { cue: { x: 0.1, y: -0.1 }, balls: [{ id: 4, x: 0.75, y: 0.3 }] }, objective: { pot: [4], backspin: true, zone: { x: 0.3, y: -0.05, r: 0.28 } }, solution: { angle: 0.5477, speed: 3.2, a: 0, b: -0.3 } },
  { id: 'l5', lesson: true, name: 'English', blurb: 'Side spin changes the rebound.', coach: 'Drag the red dot to the side. The guide shows how the ball now behaves.', setup: { cue: { x: -0.8, y: -0.4 }, balls: [{ id: 5, x: 0.2, y: -0.3 }] }, objective: { pot: [5], spinMin: 0.15, zone: { x: 0.6, y: 0.35, r: 0.3 } }, solution: { angle: 0.0524, speed: 5.5, a: 0.3, b: 0 } },
];
export const ALL_CHALLENGES = [...LESSONS, ...CHALLENGES];
export const findChallenge = (id) => ALL_CHALLENGES.find((c) => c.id === id);

export const stars = (attempts) => (attempts <= 1 ? 3 : attempts <= 3 ? 2 : 1);

/** Did this shot solve the challenge? Uses the finished match after endShot. */
export function evaluate(ch, m, plan = null) {
  const result = m.log[m.log.length - 1];
  const o = ch.objective;
  const sim = m.sim;
  const events = sim.events;
  const pocketedAll = events.filter((e) => e.type === 'pocket');
  if (result.scratch) return { solved: false, why: 'The cue ball dropped' };
  const potted = pocketedAll.map((e) => e.id).filter((id) => id !== 0);
  if (o.pot) {
    for (const id of o.pot) if (!potted.includes(id)) return { solved: false, why: `The ${id} did not drop` };
    if (o.pocket != null) {
      const e = pocketedAll.find((p) => p.id === o.pot[0]);
      if (!e || e.pocket !== o.pocket) return { solved: false, why: 'Right ball, wrong pocket' };
    }
    const extra = potted.filter((id) => !o.pot.includes(id));
    if (extra.length && !o.allowExtra) return { solved: false, why: 'Another ball dropped too' };
  }
  if (o.noTouch) {
    for (const id of o.noTouch) if (events.some((e) => e.type === 'ball' && (e.a === id || e.b === id) && (e.a === 0 || e.b === 0))) return { solved: false, why: `You touched the ${id}. Go over it` };
  }
  if (o.potAtLeast != null && potted.length < o.potAtLeast) return { solved: false, why: `${potted.length} of ${o.potAtLeast} dropped` };
  if (o.require) {
    const tags = (result.tags || []).map((t) => t.id);
    const ok = tags.includes(o.require) || (o.require === 'DOUBLE' && potted.length >= 2);
    if (!ok) return { solved: false, why: { BANK: 'That needs a bank shot', KICK: 'The cue ball has to hit a cushion first', COMBO: 'Drive one ball into the other', LONG: 'Take the long way', JUMP: 'Jump over the blocker', MASSE: 'Curve it with a mass\u00e9', DRAW: 'Draw the cue ball back', FOLLOW: 'Follow through' }[o.require] || 'Not quite' };
  }
  if (o.minSpeed && plan && plan.speed < o.minSpeed) return { solved: false, why: 'Too soft. It needs more power' };
  if (o.backspin && plan && plan.b > -0.15) return { solved: false, why: 'Draw the cue ball: hit it low' };
  if (o.topspin && plan && plan.b < 0.15) return { solved: false, why: 'Follow through: hit the cue ball high' };
  if (o.spinMin && plan && Math.abs(plan.a) < o.spinMin) return { solved: false, why: 'Use side spin (English) on this one' };
  if (o.zone) {
    const c = sim.ball(0);
    if (Math.hypot(c.x - o.zone.x, c.y - o.zone.y) > o.zone.r) return { solved: false, why: 'The cue ball missed the ring' };
  }
  return { solved: true, why: '' };
}

/** Play a shot on a fresh copy of the challenge and report whether it solves it. */
export function tryShot(ch, plan, opts = {}) {
  const m = newMatch({ kind: 'trick', seed: 1, setup: ch.setup, ...opts });
  beginShot(m, plan);
  m.sim.runToRest(45);
  endShot(m);
  return { ...evaluate(ch, m, plan), m };
}
