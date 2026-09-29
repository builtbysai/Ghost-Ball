// Player profile: Chalk (XP), level, unlocked gear, Circuit and challenge
// progress, Daily Run best and streak. Everything is earned by playing; nothing
// is sold, randomized or timed. Storage is injected so this is testable.

import { CUES, CHALKS, BALLSETS, levelForXp, xpForLevel } from './gear.js';

const KEY = 'pool.profile.v2';

const blank = () => ({
  xp: 0,
  equipped: { cue: 'ash', chalk: 'blue', ballset: 'classic' },
  stats: { matches: 0, wins: 0, pots: 0, banks: 0, kicks: 0, combos: 0, jumps: 0, masses: 0, golden: 0, dailyClears: 0, bestRun: 0, fouls: 0 },
  achievements: {},     // id -> timestamp
  blitz: { best: 0, plays: 0 },
  circuit: {},          // 'parlor:0' -> stars (1..3)
  challenges: {},       // 'c01' -> stars
  lessons: {},          // 'l1' -> 1 when done
  daily: { last: null, streak: 0, best: 0, bestDate: null, todayBest: 0, todayDate: null },
  seen: {},             // coach marks and one-time hints
});

export function createProfile(storage = null) {
  let data = blank();
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw), fresh = blank();
      // fill in anything added since this profile was saved, one level deep
      data = { ...fresh, ...saved };
      for (const k of ['stats', 'daily', 'equipped', 'blitz']) data[k] = { ...fresh[k], ...(saved[k] || {}) };
      for (const k of ['circuit', 'challenges', 'lessons', 'achievements', 'seen']) data[k] = saved[k] || {};
    }
  } catch { /* corrupt or unavailable: start fresh */ }

  const save = () => { try { storage && storage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ } };
  const level = () => levelForXp(data.xp);

  const unlockedItems = (lvl) => [
    ...CUES.filter((c) => c.level <= lvl).map((c) => ({ kind: 'cue', ...c })),
    ...CHALKS.filter((c) => c.level <= lvl).map((c) => ({ kind: 'chalk', ...c })),
    ...BALLSETS.filter((c) => c.level <= lvl).map((c) => ({ kind: 'ballset', ...c })),
  ];

  return {
    data,
    save,
    level,
    /** Progress inside the current level: { level, into, need, frac } */
    progress() {
      const l = level(), lo = xpForLevel(l), hi = xpForLevel(l + 1);
      return { level: l, into: data.xp - lo, need: hi - lo, frac: (data.xp - lo) / (hi - lo) };
    },
    /** Add Chalk; reports level-ups and what they unlocked. */
    addXp(n) {
      const before = level();
      data.xp += Math.max(0, Math.round(n));
      const after = level();
      const ups = [];
      for (let l = before + 1; l <= after; l++) ups.push(l);
      const fresh = unlockedItems(after).filter((i) => i.level > before);
      save();
      return { before, after, ups, unlocked: fresh, gained: Math.round(n) };
    },
    unlockedItems,
    isUnlocked(item) { return item.level <= level(); },
    equip(kind, id) {
      const list = kind === 'cue' ? CUES : kind === 'chalk' ? CHALKS : BALLSETS;
      const it = list.find((x) => x.id === id);
      if (!it || it.level > level()) return false;
      data.equipped[kind === 'ballset' ? 'ballset' : kind] = id;
      save();
      return true;
    },
    /** Count a finished match. */
    recordMatch(stat, won) {
      data.stats.matches++; if (won) data.stats.wins++;
      this.addStats(stat);
    },
    /** Add shot stats without counting a match (trick shots, daily runs). */
    addStats(stat) {
      const s = data.stats;
      s.pots += stat.pots; s.banks += stat.banks; s.kicks += stat.kicks; s.combos += stat.combos; s.fouls += stat.fouls;
      s.jumps += stat.jumps || 0; s.masses += stat.masses || 0; s.golden += stat.golden || 0;
      s.bestRun = Math.max(s.bestRun, stat.bestRun);
      save();
    },
    setStars(bucket, key, stars) {
      const cur = data[bucket][key] || 0;
      if (stars > cur) { data[bucket][key] = stars; save(); return true; }
      return false;
    },
    totalStars(bucket) { return Object.values(data[bucket]).reduce((a, b) => a + b, 0); },
    /** Daily Run bookkeeping. date is 'YYYY-MM-DD' in local time. Returns { streak, newBest, todayBest }. */
    recordDaily(date, score) {
      const d = data.daily;
      if (d.last !== date) {
        d.streak = d.last && dayDiff(d.last, date) === 1 ? d.streak + 1 : 1;
        d.last = date;
        d.todayBest = 0; d.todayDate = date;
      }
      if (score > d.todayBest) d.todayBest = score;
      const newBest = score > d.best;
      if (newBest) { d.best = score; d.bestDate = date; }
      save();
      return { streak: d.streak, newBest, todayBest: d.todayBest };
    },
    /** Record a finished Blitz; returns { newBest, best }. */
    recordBlitz(score) {
      const b = data.blitz; b.plays++;
      const newBest = score > b.best;
      if (newBest) b.best = score;
      save();
      return { newBest, best: b.best };
    },
    noteDailyClear() { data.stats.dailyClears++; save(); },
    markSeen(k) { if (!data.seen[k]) { data.seen[k] = true; save(); } },
    seen(k) { return !!data.seen[k]; },
  };
}

export function dayDiff(a, b) {
  const [ya, ma, da] = a.split('-').map(Number), [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function localDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Same rack for everyone on a given day. */
export function dailySeed(date) {
  let h = 2166136261;
  for (const ch of date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 1000000007;
}

/** Score a finished Daily Run: balls potted, plus callout XP, plus a bonus for clearing the rack. */
export function dailyScore(stat, cleared) {
  return stat.pots * 100 + stat.xp + (cleared ? 500 : 0);
}
