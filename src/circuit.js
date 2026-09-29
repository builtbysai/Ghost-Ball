// The Circuit: a ladder through five halls, three rivals each. Beat all three to
// open the next hall. Each match has two side goals, so a win is one star and a
// clean, skilled win is three.

import { LEVELS } from './ai.js';
import { HALLS } from './halls.js';

const L = (base, over = {}) => ({ ...LEVELS[base], ...over });

export const RIVALS = [
  // The Parlor, 1893
  { hall: 'parlor', name: 'Pip', bio: 'Newest cue in the parlor. Enthusiastic.', kind: 'eight', level: L(0, { sigA: 0.038, sigV: 0.1 }), goals: ['noFoul', 'run3'] },
  { hall: 'parlor', name: 'Dorothea', bio: 'Plays nine-ball with a steady hand.', kind: 'nine', level: L(0, { sigA: 0.024, sigV: 0.07 }), goals: ['noFoul', 'bank'] },
  { hall: 'parlor', name: 'The Colonel', bio: 'Has never lost at the club. Says so often.', kind: 'eight', level: L(1, { sigA: 0.011, sigV: 0.05, leave: 0.2 }), goals: ['margin', 'kick'] },
  // Hall 1961
  { hall: 'hall61', name: 'Slim', bio: 'Slow talker, faster than he looks.', kind: 'nine', level: L(1, { sigA: 0.0095 }), goals: ['run4', 'noFoul'] },
  { hall: 'hall61', name: 'Ruthie', bio: 'Loves the long game: one pocket.', kind: 'onepocket', level: L(1, { sigA: 0.008, leave: 0.5 }), goals: ['margin', 'bank'] },
  { hall: 'hall61', name: 'Big Al', bio: 'Never leaves a shot he could hit harder.', kind: 'eight', level: L(1, { sigA: 0.006, sigV: 0.05 }), goals: ['run4', 'combo'] },
  // The Stage
  { hall: 'stage', name: 'Mika', bio: 'Tour rookie. Clinical.', kind: 'nine', level: L(2, { sigA: 0.0045, sigV: 0.03, safety: false }), goals: ['noFoul', 'run4'] },
  { hall: 'stage', name: 'Tomas', bio: 'Plays safeties like chess.', kind: 'eight', level: L(2, { sigA: 0.0035 }), goals: ['margin', 'draw'] },
  { hall: 'stage', name: 'Ines', bio: 'The Metronome. One pocket, one rhythm.', kind: 'onepocket', level: L(2, { sigA: 0.0025 }), goals: ['margin', 'kick'] },
  // Last Call
  { hall: 'lastcall', name: 'Dex', bio: 'Runs the table after midnight.', kind: 'eight', level: L(2, { sigA: 0.0022 }), goals: ['run4', 'bank'] },
  { hall: 'lastcall', name: 'Rosa', bio: 'Bought the table. Knows every roll.', kind: 'nine', level: L(2, { sigA: 0.002 }), goals: ['noFoul', 'combo'] },
  { hall: 'lastcall', name: 'Shark', bio: 'Says it is his first time playing.', kind: 'eight', level: L(2, { sigA: 0.0018 }), goals: ['margin', 'noFoul'] },
  // The Rooftop
  { hall: 'rooftop', name: 'Kai', bio: 'Reads the cloth like a map.', kind: 'nine', level: L(2, { sigA: 0.0016, sigV: 0.01 }), goals: ['run5', 'noFoul'] },
  { hall: 'rooftop', name: 'Vera', bio: 'Patience as a weapon.', kind: 'onepocket', level: L(2, { sigA: 0.0014, sigV: 0.01 }), goals: ['margin', 'bank'] },
  { hall: 'rooftop', name: 'Ace', bio: 'The one everyone came to play.', kind: 'eight', level: L(2, { sigA: 0.0011, sigV: 0.008, pick: 1 }), goals: ['margin', 'noFoul'] },
];

export const GOALS = {
  noFoul: { label: 'No fouls', test: (m) => m.stats[0].fouls === 0 },
  run3: { label: 'Run three balls', test: (m) => m.stats[0].bestRun >= 3 },
  run4: { label: 'Run four balls', test: (m) => m.stats[0].bestRun >= 4 },
  run5: { label: 'Run five balls', test: (m) => m.stats[0].bestRun >= 5 },
  bank: { label: 'Sink a bank shot', test: (m) => m.stats[0].banks >= 1 },
  kick: { label: 'Sink a kick shot', test: (m) => m.stats[0].kicks >= 1 },
  combo: { label: 'Sink a combination', test: (m) => m.stats[0].combos >= 1 },
  draw: { label: 'Draw the cue ball back', test: (m) => m.stats[0].draws >= 1 },
  margin: {
    label: 'Win by three balls',
    test: (m) => {
      if (m.kind === 'onepocket') return m.rules.score[0] - m.rules.score[1] >= 3;
      if (m.kind === 'eight') {
        const opp = m.rules.groups[1];
        if (!opp) return false;
        const left = m.sim.balls.filter((b) => !b.pocketed && (opp === 'solid' ? b.id >= 1 && b.id <= 7 : b.id >= 9)).length;
        return left >= 3;
      }
      return m.stats[0].pots >= m.stats[1].pots + 3;
    },
  },
};

export const rivalKey = (idx) => { const r = RIVALS[idx]; return `${r.hall}:${RIVALS.filter((x) => x.hall === r.hall).indexOf(r)}`; };
export const rivalsOf = (hallId) => RIVALS.map((r, i) => ({ ...r, idx: i })).filter((r) => r.hall === hallId);

/** Stars for a finished circuit match. Loss = 0. Returns { stars, goals: [{label, met}] }. */
export function scoreMatch(rival, m, playerWon) {
  const goals = rival.goals.map((g) => ({ id: g, label: GOALS[g].label, met: !!(playerWon && GOALS[g].test(m)) }));
  const stars = playerWon ? 1 + goals.filter((g) => g.met).length : 0;
  return { stars, goals };
}

/** A hall is open when the previous hall's three rivals have all been beaten. */
export function hallOpen(profile, hallId) {
  const i = HALLS.findIndex((h) => h.id === hallId);
  if (i <= 0) return true;
  const prev = HALLS[i - 1].id;
  return rivalsOf(prev).every((r, k) => (profile.data.circuit[`${prev}:${k}`] || 0) >= 1);
}

export function nextRival(profile) {
  for (const h of HALLS) {
    if (!hallOpen(profile, h.id)) break;
    const rs = rivalsOf(h.id);
    for (let k = 0; k < rs.length; k++) if (!profile.data.circuit[`${h.id}:${k}`]) return rs[k];
  }
  return null;
}

export const winXp = (stars) => 100 + stars * 25;
