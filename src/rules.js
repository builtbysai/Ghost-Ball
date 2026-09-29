// Referee. Pure functions: (rules state, what happened in a shot) -> next rules state.
// No DOM, no physics objects: the caller hands in the event log and which balls
// were on the table, so this is easy to test and to replay.
//
// Games: BCA/WPA-style eight-ball, WPA nine-ball, one-pocket (Minnesota Fats'
// game), a single-player run-out (the Daily Run), a free practice table and the
// trick-shot sandbox. Deferred: push-out, the three-foul rule, called pockets
// for non-8 balls.

import { FOOT_X, HEAD_X, BALL_R } from './table.js';

export const GAMES = {
  eight: { name: '8-Ball', blurb: 'Solids vs stripes, then the 8', menu: true },
  nine: { name: '9-Ball', blurb: 'Lowest ball first, pot the 9', menu: true },
  straight: { name: 'Straight Pool', blurb: 'Race to 30. Any ball, any pocket', menu: true },
  onepocket: { name: 'One-Pocket', blurb: 'Your pocket, first to 8 balls', menu: true },
  practice: { name: 'Practice', blurb: 'Free table, no rules', menu: true },
  runout: { name: 'Run-Out', blurb: 'Clear the rack, miss and it ends', menu: false },
  trick: { name: 'Trick Shot', blurb: 'One setup, one solution', menu: false },
  blitz: { name: 'Blitz', blurb: 'Sixty seconds. Pot everything.', menu: false },
};

/** Which foot-rail corner each player owns in one-pocket (pocket indices from table.js). */
export const ONE_POCKET_OWNERS = [1, 3];
export const ONE_POCKET_TARGET = 8;
export const STRAIGHT_TARGET = 30;

export function newRules(kind, opts = {}) {
  const solo = kind === 'practice' || kind === 'runout' || kind === 'trick' || kind === 'blitz';
  return {
    kind,
    turn: opts.breaker ?? 0,
    breakShot: !solo,
    ballInHand: !solo,
    kitchen: !solo,                       // cue ball must start behind the head string
    open: kind === 'eight',
    groups: [null, null],                 // 'solid' | 'stripe' per player (eight-ball)
    score: [0, 0],                        // one-pocket balls, run-out balls, straight-pool points
    consec: [0, 0],                       // straight pool: consecutive fouls
    target: kind === 'straight' ? STRAIGHT_TARGET : null,
    owned: [[], []],                      // one-pocket: ids each player has potted in their pocket
    winner: null,
    loseReason: null,
    shots: 0,
    fouls: [0, 0],
    last: null,                           // last shot result, for the HUD
  };
}

export const isSolid = (id) => id >= 1 && id <= 7;
export const isStripe = (id) => id >= 9 && id <= 15;
export const groupOf = (id) => (isSolid(id) ? 'solid' : isStripe(id) ? 'stripe' : null);
const groupBalls = (g) => (g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]);

/** Balls the shooter may legally contact first, given the table state. */
export function legalTargets(rules, onTable) {
  const objs = onTable.filter((id) => id !== 0);
  if (rules.kind === 'practice' || rules.kind === 'onepocket' || rules.kind === 'trick' || rules.kind === 'blitz' || rules.kind === 'straight') return objs;
  if (rules.kind === 'nine' || rules.kind === 'runout') return objs.length ? [Math.min(...objs)] : [];
  const g = rules.groups[rules.turn];
  if (rules.open || !g) return objs.filter((id) => id !== 8);
  const mine = objs.filter((id) => groupOf(id) === g);
  return mine.length ? mine : objs.includes(8) ? [8] : [];
}

/** True when the 8 is the shooter's next required ball (a pocket must be called). */
export function mustCall8(rules, onTable) {
  if (rules.kind !== 'eight' || rules.open) return false;
  const t = legalTargets(rules, onTable);
  return t.length === 1 && t[0] === 8;
}

function summarize(events, onTable) {
  const cue = 0;
  let firstHit = null, firstHitT = Infinity;
  for (const e of events) {
    if (e.type === 'ball' && (e.a === cue || e.b === cue)) {
      firstHit = e.a === cue ? e.b : e.a;
      firstHitT = e.t;
      break;
    }
  }
  const pocketed = events.filter((e) => e.type === 'pocket');
  const railBalls = new Set();
  let railAfterContact = false;
  for (const e of events) {
    if (e.type !== 'rail' || e.wall >= 100) continue;   // jaw knuckles are not cushions
    if (e.id !== cue) railBalls.add(e.id);
    if (e.t >= firstHitT) railAfterContact = true;
  }
  return {
    firstHit,
    pocketedIds: pocketed.map((e) => e.id),
    pocketPockets: Object.fromEntries(pocketed.map((e) => [e.id, e.pocket])),
    cueScratched: pocketed.some((e) => e.id === cue),
    objectRails: railBalls.size,
    railAfterContact,
    onTable,
  };
}

/**
 * Judge one shot.
 * shot: { events, onTableBefore: number[], calledPocket?: number|null }
 * Returns { rules, result } where result = { foul, reasons[], pocketed[], respot[], text, sub, continueTurn }.
 */
export function resolveShot(rules, shot) {
  const r = { ...rules, groups: rules.groups.slice(), fouls: rules.fouls.slice(), score: rules.score.slice(), consec: (rules.consec || [0, 0]).slice(), owned: rules.owned.map((o) => o.slice()) };
  const me = r.turn, opp = 1 - me;
  const s = summarize(shot.events, shot.onTableBefore);
  const before = shot.onTableBefore;
  const potted = s.pocketedIds.filter((id) => id !== 0);
  const respot = [];
  const reasons = [];
  let foul = false;
  const addFoul = (why) => { foul = true; reasons.push(why); };
  const wasBreak = r.breakShot;
  let continueTurn = false;
  let text = '', sub = '';
  let lose = null;
  r.shots++;

  if (r.kind === 'practice' || r.kind === 'trick' || r.kind === 'blitz') {
    r.ballInHand = false;
    r.kitchen = false;
    r.breakShot = false;
    const scratch = s.cueScratched;
    const result = { foul: scratch, reasons: scratch ? ['Cue ball pocketed'] : [], pocketed: potted, respot, text: scratch ? 'Scratch' : '', sub: '', continueTurn: true, scratch, firstHit: s.firstHit, objectRails: s.objectRails };
    r.last = result;
    return { rules: r, result };
  }

  const targets = legalTargets(rules, before);

  // ---- shared fouls -------------------------------------------------------
  if (s.cueScratched) addFoul('Cue ball pocketed');
  if (s.firstHit === null) {
    addFoul('Cue ball hit nothing');
  } else if (r.kind === 'nine' || r.kind === 'runout') {
    if (!targets.includes(s.firstHit)) addFoul(`Hit the ${s.firstHit} before the ${targets[0]}`);
  } else if (r.kind === 'eight' && !targets.includes(s.firstHit)) {
    const g = rules.groups[me];
    if (rules.open || !g) addFoul('Hit the 8-ball first');
    else if (targets[0] === 8) addFoul('Must hit the 8-ball first');
    else addFoul(`Must hit a ${g === 'solid' ? 'solid' : 'stripe'} first`);
  }
  const brokeLegally = s.objectRails >= 4 || potted.length > 0;
  if (wasBreak && r.kind === 'straight') {
    if (!(potted.length > 0 || s.objectRails >= 2)) addFoul('The break needs two balls to a rail');
  } else if (wasBreak && (r.kind === 'eight' || r.kind === 'nine')) {
    if (!brokeLegally) addFoul('Fewer than four balls reached a rail');
  } else if (s.firstHit !== null && !potted.length && !s.railAfterContact) {
    addFoul('No ball reached a rail');
  }

  // ---- eight-ball ---------------------------------------------------------
  if (r.kind === 'eight') {
    const eightPotted = potted.includes(8);
    const others = potted.filter((id) => id !== 8);
    const g = rules.groups[me];
    const remainingAfter = (grp) => before.filter((id) => groupOf(id) === grp && !potted.includes(id));

    if (eightPotted && wasBreak) {
      respot.push(8);
    } else if (eightPotted) {
      const cleared = g && remainingAfter(g).length === 0;
      const called = shot.calledPocket;
      const pocketOk = called == null ? true : s.pocketPockets[8] === called;
      if (!cleared) { lose = 'Sank the 8-ball early'; }
      else if (foul) { lose = 'Fouled while sinking the 8-ball'; }
      else if (others.length) { lose = 'Sank the 8 together with another ball'; }
      else if (!pocketOk) { lose = 'Sank the 8-ball in the wrong pocket'; }
      else { r.winner = me; text = 'Won the frame'; sub = 'Sank the 8-ball'; }
      if (lose) { r.winner = opp; r.loseReason = lose; text = 'Lost the frame'; sub = lose; }
    }

    if (!r.winner) {
      if (r.open && !wasBreak && !foul && others.length) {
        const first = groupOf(others[0]);
        r.groups[me] = first;
        r.groups[opp] = first === 'solid' ? 'stripe' : 'solid';
        r.open = false;
        text = r.groups[me] === 'solid' ? 'You are solids' : 'You are stripes';
      }
      if (wasBreak && s.cueScratched) r.open = true;
      const mine = r.groups[me];
      const ownPotted = r.open ? others.length > 0 : others.some((id) => groupOf(id) === mine);
      const legalBreak = wasBreak && (s.objectRails >= 4 || others.length > 0) && !foul;
      continueTurn = !foul && (ownPotted || (wasBreak && legalBreak && (others.length > 0 || eightPotted)));
    }
  }

  // ---- nine-ball ----------------------------------------------------------
  if (r.kind === 'nine') {
    const ninePotted = potted.includes(9);
    if (ninePotted && !foul) {
      r.winner = me; text = 'Sank the 9-ball'; sub = wasBreak ? 'On the break' : '';
    } else if (ninePotted && foul) {
      respot.push(9);
    }
    if (!r.winner) continueTurn = !foul && potted.length > 0;
  }

  // ---- run-out: nine-ball rules, alone, and the first miss ends it -----------
  if (r.kind === 'runout') {
    const cleared = potted.includes(9) && !foul;
    r.score[0] += foul ? 0 : potted.length;
    if (cleared) { r.winner = 0; text = 'Rack cleared'; sub = 'All nine down'; }
    else if (foul || potted.length === 0) {
      r.winner = 0; r.loseReason = foul ? reasons[0] : 'Missed';
      text = 'Run over'; sub = r.loseReason;
    } else continueTurn = true;
    if (potted.includes(9) && foul) respot.push(9);
  }

  // ---- straight pool (open): a point a ball, fouls cost points, the rack refills when one ball is left ----
  let rerack = false;
  if (r.kind === 'straight') {
    if (foul) {
      r.score[me] -= wasBreak ? 2 : 1;
      r.consec[me]++;
      if (r.consec[me] >= 3) { r.score[me] -= 15; r.consec[me] = 0; sub = 'Three fouls in a row: 15 points off'; }
    } else {
      r.consec[me] = 0;
      r.score[me] += potted.length;
    }
    if (r.score[me] >= r.target) { r.winner = me; text = `${r.target} points`; }
    else {
      continueTurn = !foul && potted.length > 0;
      const left = before.filter((id) => id !== 0 && !potted.includes(id)).length;
      if (left <= 1) rerack = true;
      if (continueTurn) text = `${r.score[me]} of ${r.target}`;
    }
  }

  // ---- one-pocket -----------------------------------------------------------
  if (r.kind === 'onepocket') {
    const mineP = ONE_POCKET_OWNERS[me], theirsP = ONE_POCKET_OWNERS[opp];
    let ownDown = 0;
    for (const id of potted) {
      const pk = s.pocketPockets[id];
      if (pk === mineP) { if (!foul) { r.score[me]++; r.owned[me].push(id); ownDown++; } else respot.push(id); }
      else if (pk === theirsP) { r.score[opp]++; r.owned[opp].push(id); }
      else respot.push(id);            // a ball in the wrong pocket goes back on the table
    }
    if (foul) {
      // the fouler gives a ball back to the table
      const back = r.owned[me].pop();
      if (back != null) { r.score[me]--; respot.push(back); }
    }
    if (r.score[me] >= ONE_POCKET_TARGET) { r.winner = me; text = 'Eight balls in your pocket'; }
    else if (r.score[opp] >= ONE_POCKET_TARGET) { r.winner = opp; text = 'Opponent reached eight'; }
    else continueTurn = !foul && ownDown > 0;
    if (!r.winner && !foul && ownDown > 0) text = `${r.score[me]} of ${ONE_POCKET_TARGET}`;
  }

  // ---- turn / ball in hand ------------------------------------------------
  if (r.kind === 'runout') {
    r.ballInHand = false; r.kitchen = false; r.breakShot = false;
    const result = { foul, reasons, pocketed: potted, respot, text, sub, continueTurn, lose, scratch: s.cueScratched, firstHit: s.firstHit, objectRails: s.objectRails };
    r.last = result;
    return { rules: r, result };
  }
  if (r.winner != null) {
    r.ballInHand = false;
    continueTurn = false;
  } else if (foul) {
    r.fouls[me]++;
    r.turn = opp;
    r.ballInHand = true;
    r.kitchen = wasBreak && s.cueScratched;
    text = 'Foul';
    sub = reasons[0];
  } else if (continueTurn) {
    r.ballInHand = false;
    r.kitchen = false;
    if (!text) text = wasBreak ? 'Good break' : 'Pocketed';
  } else {
    r.turn = opp;
    r.ballInHand = false;
    r.kitchen = false;
  }
  r.breakShot = false;

  const result = { foul, reasons, pocketed: potted, respot, text, sub, continueTurn, lose, scratch: s.cueScratched, firstHit: s.firstHit, objectRails: s.objectRails, rerack };
  r.last = result;
  return { rules: r, result };
}

/** Where a respotted ball goes: the foot spot, else up the long string toward the foot rail. */
export function respotPosition(occupied, halfL) {
  const free = (x) => occupied.every((o) => Math.hypot(o.x - x, o.y) >= BALL_R * 2 + 1e-4);
  for (let x = FOOT_X; x < halfL - BALL_R * 1.5; x += 0.004) if (free(x)) return { x, y: 0 };
  for (let x = FOOT_X; x > HEAD_X; x -= 0.004) if (free(x)) return { x, y: 0 };
  return { x: FOOT_X, y: 0 };
}

export function ballsRemaining(rules, onTable, player) {
  if (rules.kind !== 'eight') return null;
  const g = rules.groups[player];
  if (!g) return null;
  return groupBalls(g).filter((id) => onTable.includes(id));
}
