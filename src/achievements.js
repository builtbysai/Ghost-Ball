// Achievements: long-term goals that reward skill and curiosity, not grinding.
// Each is a pure test over the profile, checked after every match, trick shot
// and daily run. Earning one grants Chalk once.

import { HALLS } from './halls.js';
import { RIVALS, rivalsOf } from './circuit.js';
import { CHALLENGES, LESSONS } from './challenges.js';

const st = (p) => p.data.stats;
const hallCleared = (p, id) => rivalsOf(id).every((r, k) => (p.data.circuit[`${id}:${k}`] || 0) >= 1);
const hallPerfect = (p, id) => rivalsOf(id).every((r, k) => (p.data.circuit[`${id}:${k}`] || 0) >= 3);

export const ACHIEVEMENTS = [
  { id: 'firstWin', name: 'First Frame', desc: 'Win a match', xp: 40, test: (p) => st(p).wins >= 1 },
  { id: 'lessons', name: 'Fundamentals', desc: 'Finish all five lessons', xp: 60, test: (p) => LESSONS.every((l) => p.data.lessons[l.id]) },
  ...HALLS.map((h) => ({ id: `hall:${h.id}`, name: `${h.name}: Cleared`, desc: `Beat all three rivals at ${h.name}`, xp: 80, test: (p) => hallCleared(p, h.id) })),
  { id: 'perfectParlor', name: 'Perfect Parlor', desc: 'Three stars against every rival at The Parlor', xp: 120, test: (p) => hallPerfect(p, 'parlor') },
  { id: 'circuit', name: 'Circuit Champion', desc: 'Beat all fifteen rivals', xp: 250, test: (p) => RIVALS.every((r, i) => (p.data.circuit[`${r.hall}:${rivalsOf(r.hall).findIndex((x) => x.name === r.name)}`] || 0) >= 1) },
  { id: 'bank10', name: 'Bank Robber', desc: 'Sink ten bank shots', xp: 60, test: (p) => st(p).banks >= 10 },
  { id: 'kick5', name: 'Kick Drum', desc: 'Sink five kick shots', xp: 60, test: (p) => st(p).kicks >= 5 },
  { id: 'combo5', name: 'Chain Reaction', desc: 'Sink five combinations', xp: 60, test: (p) => st(p).combos >= 5 },
  { id: 'jump5', name: 'Airborne', desc: 'Land five jump shots', xp: 80, test: (p) => st(p).jumps >= 5 },
  { id: 'run5', name: 'On a Roll', desc: 'Run five balls in a row', xp: 60, test: (p) => st(p).bestRun >= 5 },
  { id: 'run8', name: 'Table Runner', desc: 'Run eight balls in a row', xp: 120, test: (p) => st(p).bestRun >= 8 },
  { id: 'golden', name: 'Golden Break', desc: 'Sink the 9 on the break', xp: 150, test: (p) => st(p).golden >= 1 },
  { id: 'tricks', name: 'Trick Artist', desc: 'Solve every trick shot', xp: 120, test: (p) => CHALLENGES.every((c) => p.data.challenges[c.id]) },
  { id: 'threeStars', name: 'Showman', desc: 'Earn three stars on ten trick shots', xp: 100, test: (p) => Object.values(p.data.challenges).filter((s) => s >= 3).length >= 10 },
  { id: 'daily', name: 'Clean Sweep', desc: 'Clear a Daily Run rack', xp: 100, test: (p) => st(p).dailyClears >= 1 },
  { id: 'blitz1', name: 'Quick Hands', desc: 'Score 1,500 in Blitz', xp: 80, test: (p) => p.data.blitz.best >= 1500 },
  { id: 'blitz2', name: 'Lightning', desc: 'Score 3,500 in Blitz', xp: 160, test: (p) => p.data.blitz.best >= 3500 },
  { id: 'streak3', name: 'Regular', desc: 'Play the Daily Run three days running', xp: 60, test: (p) => p.data.daily.streak >= 3 },
  { id: 'level10', name: 'Chalked Up', desc: 'Reach Chalk level 10', xp: 100, test: (p) => p.level() >= 10 },
];

/** Award anything newly earned; returns the list (and saves). Grants no XP itself: the caller adds it. */
export function checkAchievements(profile) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.data.achievements[a.id]) continue;
    if (a.test(profile)) { profile.data.achievements[a.id] = Date.now(); fresh.push(a); }
  }
  if (fresh.length) profile.save();
  return fresh;
}
