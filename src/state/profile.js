// Player profile: minimal career stats, versioned key.
const KEY = 'gb.profile.v1';
export const PROFILE_DEFAULTS = {
  matches: 0, wins: 0, pots: 0, bestRun: 0, exhibitions: 0,
};
export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...PROFILE_DEFAULTS };
    return { ...PROFILE_DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...PROFILE_DEFAULTS }; }
}
export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
export function resetProfile() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return { ...PROFILE_DEFAULTS };
}
