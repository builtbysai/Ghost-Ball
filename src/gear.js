// Cosmetic gear. Everything here is earned by leveling up; nothing is sold and
// nothing affects physics. `level` is the Chalk level that unlocks the item.

export const CUES = [
  { id: 'ash', name: 'House Ash', level: 1, shaft: '#ead7a8', butt: '#3b2b21', wrap: '#4a78b8', ring: '#cfd4d8' },
  { id: 'maple', name: 'Maple Sprint', level: 2, shaft: '#f5e8c4', butt: '#cf9a62', wrap: '#1d1d1f', ring: '#f0f0f0' },
  { id: 'ebony', name: 'Ebony Stripe', level: 4, shaft: '#dfcc9c', butt: '#151515', wrap: '#c9ccd1', ring: '#c9ccd1' },
  { id: 'copper', name: 'Copper Wrap', level: 6, shaft: '#f0dcb0', butt: '#4b2a1c', wrap: '#c8743a', ring: '#e4a46a' },
  { id: 'ghost', name: 'Ghost Blue', level: 9, shaft: '#e2efff', butt: '#2a5aa6', wrap: '#8fd3ff', ring: '#dff3ff' },
  { id: 'crown', name: 'Gold Crown', level: 13, shaft: '#f6e9c8', butt: '#171717', wrap: '#e2b64a', ring: '#f0cf78' },
];

export const CHALKS = [
  { id: 'blue', name: 'Tournament Blue', level: 1, color: '#3f86d8' },
  { id: 'green', name: 'Baize Green', level: 3, color: '#3fae6a' },
  { id: 'red', name: 'Hustler Red', level: 5, color: '#d9483b' },
  { id: 'gold', name: 'Champion Gold', level: 8, color: '#e2b64a' },
  { id: 'white', name: 'Bone White', level: 11, color: '#f1efe8' },
];

// index 0 = cue ball, 1..8 = the eight colors (9..15 reuse 1..7 as stripes)
export const BALLSETS = [
  { id: 'classic', name: 'Classic', level: 1, colors: ['#f6f2e8', '#f4c430', '#1c4fb0', '#d3342a', '#4b2a80', '#f07d1a', '#1e8040', '#7d1f2b', '#17150f'], white: '#f6f2e8' },
  { id: 'vintage', name: 'Ivory Vintage', level: 3, colors: ['#efe4c8', '#d9b24a', '#3b5f96', '#b44a3a', '#5d456f', '#c9793a', '#4f7a58', '#6e3a34', '#1d1a16'], white: '#efe4c8' },
  { id: 'candy', name: 'Candy Shop', level: 7, colors: ['#fbf7ee', '#ffd23f', '#3a86ff', '#ff4d6d', '#8e5cff', '#ff8a3d', '#2ec27e', '#a83259', '#1a1a22'], white: '#fbf7ee' },
];

export const byId = (list, id) => list.find((x) => x.id === id) || list[0];

// Chalk levels: a gentle curve where each level costs a little more than the last.
export function xpForLevel(level) { return level <= 1 ? 0 : (level - 1) * 100 + (level - 1) * (level - 2) * 10; }
export function levelForXp(xp) { let l = 1; while (xpForLevel(l + 1) <= xp) l++; return l; }
