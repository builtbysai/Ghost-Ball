// Settings: versioned localStorage. Applied live, no save button.
const KEY = 'gb.settings.v1';
export const SETTINGS_DEFAULTS = {
  view: '2d',          // '2d' | '3d'
  camera: 'elevated',  // 3D camera preset: 'elevated' | 'overhead'
  guide: 'full',       // 'full' | 'line' | 'none'
  hand: 'right',       // 'right' | 'left' (swaps power / fine-aim edges)
  sfxVol: 0.8,         // 0..1
  musicVol: 0.4,       // 0..1
  muted: false,
  hall: 'parlor',
  opp: 'club',         // menu selection: 'rookie' | 'club' | 'champ' | 'two'
  game: '8ball',
};
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...SETTINGS_DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
