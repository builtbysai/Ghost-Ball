import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, dailySeed, dayDiff, dailyScore } from '../src/profile.js';
import { RIVALS, hallOpen, nextRival, scoreMatch, rivalsOf } from '../src/circuit.js';
import { CUES, xpForLevel, levelForXp } from '../src/gear.js';
import { HALLS } from '../src/halls.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('Chalk levels up, reports what unlocked, and persists', () => {
  const store = memory();
  const p = createProfile(store);
  assert.equal(p.level(), 1);
  const r = p.addXp(xpForLevel(2));
  assert.deepEqual(r.ups, [2]);
  assert.ok(r.unlocked.some((i) => i.kind === 'cue' && i.id === 'maple'), 'level 2 should unlock the Maple Sprint cue');
  assert.equal(createProfile(store).level(), 2, 'progress did not persist');
  assert.equal(levelForXp(xpForLevel(6)), 6);
});

test('gear locked behind a level cannot be equipped early', () => {
  const p = createProfile(memory());
  const crown = CUES.find((c) => c.id === 'crown');
  assert.equal(p.equip('cue', crown.id), false);
  p.addXp(xpForLevel(crown.level));
  assert.equal(p.equip('cue', crown.id), true);
  assert.equal(p.data.equipped.cue, 'crown');
});

test('the Circuit opens hall by hall and offers the next unbeaten rival', () => {
  const p = createProfile(memory());
  assert.equal(hallOpen(p, HALLS[0].id), true);
  assert.equal(hallOpen(p, HALLS[1].id), false);
  assert.equal(nextRival(p).name, 'Pip');
  rivalsOf('parlor').forEach((r, k) => p.setStars(`circuit`, `parlor:${k}`, 1));
  assert.equal(hallOpen(p, HALLS[1].id), true);
  assert.equal(nextRival(p).name, 'Slim');
  assert.equal(RIVALS.length, HALLS.length * 3);
});

test('stars: a loss earns none, a win earns one plus one per goal met', () => {
  const rival = RIVALS[0];
  const m = { kind: 'eight', rules: { groups: ['solid', 'stripe'], score: [0, 0] }, stats: [{ fouls: 0, bestRun: 3, banks: 0, kicks: 0, combos: 0, draws: 0, pots: 5 }, { pots: 2 }], sim: { balls: [] } };
  assert.equal(scoreMatch(rival, m, false).stars, 0);
  assert.equal(scoreMatch(rival, m, true).stars, 3);
  m.stats[0].fouls = 2;
  assert.equal(scoreMatch(rival, m, true).stars, 2);
});

test('the Daily Run is the same rack for everyone on a date, and the streak counts consecutive days only', () => {
  assert.equal(dailySeed('2026-09-28'), dailySeed('2026-09-28'));
  assert.notEqual(dailySeed('2026-09-28'), dailySeed('2026-09-29'));
  assert.equal(dayDiff('2026-09-28', '2026-09-29'), 1);
  const p = createProfile(memory());
  assert.equal(p.recordDaily('2026-09-28', 400).streak, 1);
  assert.equal(p.recordDaily('2026-09-28', 900).streak, 1);
  assert.equal(p.recordDaily('2026-09-29', 100).streak, 2);
  assert.equal(p.recordDaily('2026-10-02', 100).streak, 1, 'a gap should reset the streak');
  assert.equal(p.data.daily.best, 900);
  assert.equal(dailyScore({ pots: 9, xp: 40 }, true), 9 * 100 + 40 + 500);
});

import { dailyLayout } from '../src/daily.js';
test('the Daily Run layout is identical for everyone on a date, keeps the 9 up, and leaves a real run', () => {
  const a = dailyLayout(dailySeed('2026-09-28')), b = dailyLayout(dailySeed('2026-09-28')), c = dailyLayout(dailySeed('2026-09-29'));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.balls.some((x) => x.id === 9));
  assert.ok(a.balls.length >= 5);
});

import { ACHIEVEMENTS, checkAchievements } from '../src/achievements.js';
test('achievements unlock exactly once, from real progress, and survive a reload', () => {
  const store = memory();
  const p = createProfile(store);
  assert.deepEqual(checkAchievements(p), []);
  p.recordMatch({ pots: 5, banks: 3, kicks: 0, combos: 0, fouls: 0, bestRun: 5, jumps: 0, golden: 0 }, true);
  const first = checkAchievements(p).map((a) => a.id).sort();
  assert.deepEqual(first, ['firstWin', 'run5']);
  assert.deepEqual(checkAchievements(p), [], 'an achievement must not fire twice');
  for (let i = 0; i < 3; i++) p.recordMatch({ pots: 1, banks: 3, kicks: 0, combos: 0, fouls: 0, bestRun: 1, jumps: 0, golden: 0 }, false);
  assert.ok(checkAchievements(p).some((a) => a.id === 'bank10'));
  assert.ok(createProfile(store).data.achievements.bank10, 'unlocks did not persist');
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'duplicate achievement ids');
});

test('a profile saved by an older version gains new fields instead of breaking', () => {
  const store = memory();
  store.setItem('pool.profile.v2', JSON.stringify({ xp: 300, stats: { matches: 4, wins: 2, pots: 10, banks: 1, kicks: 0, combos: 0, bestRun: 3, fouls: 1 } }));
  const p = createProfile(store);
  assert.equal(p.data.stats.jumps, 0);
  assert.equal(p.data.stats.matches, 4);
  assert.deepEqual(p.data.achievements, {});
  p.recordMatch({ pots: 2, banks: 0, kicks: 0, combos: 0, fouls: 0, bestRun: 2 }, true);
  assert.ok(Number.isFinite(p.data.stats.jumps), 'jump counter became NaN');
});
