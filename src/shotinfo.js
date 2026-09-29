// Shot analysis: turns a finished shot's event log into the callouts a player
// earns ("BANK", "KICK", "COMBO", "DRAW"...). Pure and deterministic, so it is
// testable and drives both the on-screen callouts and the Chalk (XP) awards.

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * events: the sim's event log for the shot
 * before: [{id,x,y,pocketed}] positions before the strike
 * cueAfter: {x,y,pocketed} final cue-ball state
 * result: the referee's result for the shot
 * plan: the shot as played ({a,b}); draw and follow need real tip-height spin
 * Returns [{ id, label, xp }]
 */
export function analyzeShot({ events, before, cueAfter, result, breakShot = false, kind = 'eight', plan = null }) {
  const tags = [];
  if (!result || result.foul) return tags;
  const pos = new Map(before.map((b) => [b.id, b]));
  const cueStart = pos.get(0);
  const potted = events.filter((e) => e.type === 'pocket' && e.id !== 0);

  // jump: the cue ball left the slate and came down past a ball that sat in its path
  if (plan && plan.jump > 0 && cueStart) {
    const land = events.find((e) => e.type === 'land' && e.id === 0);
    if (land) {
      const dx = land.x - cueStart.x, dy = land.y - cueStart.y, l2 = dx * dx + dy * dy || 1;
      const over = before.some((b) => {
        if (b.id === 0 || b.pocketed) return false;
        const t = Math.max(0, Math.min(1, ((b.x - cueStart.x) * dx + (b.y - cueStart.y) * dy) / l2));
        return t > 0.05 && t < 0.98 && dist(b.x, b.y, cueStart.x + dx * t, cueStart.y + dy * t) < 0.06;
      });
      const hitBefore = events.find((e) => e.type === 'ball' && (e.a === 0 || e.b === 0));
      if (over && (!hitBefore || hitBefore.t > land.t - 0.02)) tags.push({ id: 'JUMP', label: 'Jump shot', xp: 30 });
    }
  }
  if (!potted.length) return tags;
  if (plan && plan.masse > 0) tags.push({ id: 'MASSE', label: 'Mass\u00e9', xp: 30 });

  let firstContact = null;
  for (const e of events) {
    if (e.type === 'ball' && (e.a === 0 || e.b === 0)) { firstContact = e; break; }
  }
  if (!firstContact) return tags;
  const firstId = firstContact.a === 0 ? firstContact.b : firstContact.a;

  if (breakShot) {
    if (kind === 'nine' && potted.some((e) => e.id === 9)) tags.push({ id: 'GOLDEN', label: 'Golden break', xp: 100 });
    else if (potted.length >= 3) tags.push({ id: 'BIGBREAK', label: `Big break, ${potted.length} down`, xp: 25 });
    return tags;
  }

  // kick: the cue ball touched a cushion before it touched any ball
  const cueRailFirst = events.some((e) => e.type === 'rail' && e.id === 0 && e.wall < 100 && e.t < firstContact.t);
  if (cueRailFirst) tags.push({ id: 'KICK', label: 'Kick shot', xp: 20 });

  // bank: a potted ball hit a cushion after it was struck and before it dropped
  for (const p of potted) {
    const struck = events.find((e) => e.type === 'ball' && (e.a === p.id || e.b === p.id));
    const t0 = struck ? struck.t : 0;
    if (events.some((e) => e.type === 'rail' && e.id === p.id && e.wall < 100 && e.t >= t0 && e.t <= p.t)) {
      tags.push({ id: 'BANK', label: 'Bank shot', xp: 15 });
      break;
    }
  }

  // combo: a potted ball was driven in by another object ball
  const combo = potted.some((p) => p.id !== firstId && events.some((e) => e.type === 'ball' && e.a !== 0 && e.b !== 0 && (e.a === p.id || e.b === p.id)));
  if (combo) tags.push({ id: 'COMBO', label: 'Combination', xp: 15 });

  if (potted.length >= 2 && !combo) tags.push({ id: 'DOUBLE', label: potted.length === 2 ? 'Double' : `${potted.length} in one shot`, xp: 10 * potted.length });

  // long pot: a long way to the object ball, and a long way for it to fall
  const obj = pos.get(firstId);
  if (obj && cueStart && dist(cueStart.x, cueStart.y, obj.x, obj.y) > 1.5 && potted.some((p) => p.id === firstId)) {
    tags.push({ id: 'LONG', label: 'Long pot', xp: 10 });
  }

  // draw / follow: how far the cue ball travelled along the shot line after contact
  if (cueAfter && !cueAfter.pocketed) {
    const dx = firstContact.x - cueStart.x, dy = firstContact.y - cueStart.y, dl = Math.hypot(dx, dy) || 1;
    const along = ((cueAfter.x - firstContact.x) * dx + (cueAfter.y - firstContact.y) * dy) / dl;
    const b = plan ? plan.b || 0 : 0;
    if (along < -0.55 && b <= -0.15) tags.push({ id: 'DRAW', label: `Draw ${Math.abs(along).toFixed(1)} m`, xp: 10 });
    else if (along > 1.1 && b >= 0.15) tags.push({ id: 'FOLLOW', label: `Follow ${along.toFixed(1)} m`, xp: 5 });
  }
  return tags;
}

/** Callout label for a run of consecutive pots. */
export function runTag(run) {
  if (run < 3) return null;
  return { id: 'RUN', label: `Run of ${run}`, xp: run * 4 };
}
