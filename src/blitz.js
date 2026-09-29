// Blitz: sixty seconds on a fresh rack. Pot as much as you can. Scoring rules
// are here, pure and testable; main.js owns the clock and the table.
//
//   100 points a ball, times a streak multiplier (x1 up to x5 as consecutive
//   shots pot). More than one ball in a shot adds 50 each for the extras.
//   A miss resets the streak. A scratch costs 300 points and 3 seconds.
//   Clearing the rack pays 500 and adds 8 seconds, and a new rack appears.

export const BLITZ_TIME = 60;
export const CLEAR_BONUS = 500;
export const CLEAR_TIME = 8;
export const SCRATCH_POINTS = 300;
export const SCRATCH_TIME = 3;

export const newBlitz = () => ({ t: BLITZ_TIME, score: 0, streak: 0, balls: 0, racks: 0, bestStreak: 0, ending: false });

export const multiplier = (streak) => 1 + Math.min(4, Math.floor(streak / 2));

/** Apply one finished shot to the state. Returns { points, mult, label }. */
export function scoreShot(state, result) {
  if (result.scratch) {
    const lost = Math.min(state.score, SCRATCH_POINTS);
    state.score -= lost; state.streak = 0; state.t = Math.max(0, state.t - SCRATCH_TIME);
    return { points: -lost, mult: 1, label: 'Scratch' };
  }
  const pots = result.pocketed.filter((id) => id !== 0).length;
  if (!pots) { state.streak = 0; return { points: 0, mult: 1, label: '' }; }
  state.streak++;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  const mult = multiplier(state.streak);
  const points = pots * 100 * mult + (pots - 1) * 50;
  state.score += points; state.balls += pots;
  return { points, mult, label: mult > 1 ? `Streak x${mult}` : '' };
}

/** The table was cleared: pay the bonus and hand back the time. */
export function clearRack(state) {
  state.score += CLEAR_BONUS; state.t += CLEAR_TIME; state.racks++;
  return CLEAR_BONUS;
}

export const blitzXp = (score) => 20 + Math.floor(score / 50);
