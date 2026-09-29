// State snapshots for online play. Both players simulate every shot from the
// same seed and inputs, but browsers do not agree on the last bits of Math.sin,
// Math.exp and friends, so long chains of collisions can drift apart. After every
// shot the host sends an authoritative snapshot; the guest compares and adopts it
// if they differ. The same snapshot lets a player who dropped out rejoin mid-game.

const MM = 0.001;

/** JSON-safe copy of everything the rules and the table need to continue. */
export function snapshot(m) {
  const rules = { ...m.rules, last: null };
  return {
    rules: JSON.parse(JSON.stringify(rules)),
    balls: m.sim.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })),
    stats: JSON.parse(JSON.stringify(m.stats)),
    shots: m.rules.shots,
  };
}

/** Overwrite a match with a snapshot (balls at rest, rules and stats replaced). */
export function restore(m, snap) {
  for (const s of snap.balls) {
    const b = m.sim.ball(s.id);
    if (!b) continue;
    b.x = s.x; b.y = s.y; b.pocketed = !!s.pocketed; b.pocket = s.pocketed ? Math.max(0, b.pocket) : -1;
    b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0; b.z = 0;
  }
  m.rules = JSON.parse(JSON.stringify(snap.rules));
  m.stats = JSON.parse(JSON.stringify(snap.stats));
}

/**
 * How far apart is this match from a snapshot? Returns { dist, balls, rules }:
 * the largest ball position error in meters, how many balls disagree about being
 * on the table, and whether the fields that decide whose turn it is match.
 */
export function divergence(m, snap) {
  let dist = 0, balls = 0;
  for (const s of snap.balls) {
    const b = m.sim.ball(s.id);
    if (!b) { balls++; continue; }
    if (!!b.pocketed !== !!s.pocketed) { balls++; continue; }
    if (!s.pocketed) dist = Math.max(dist, Math.hypot(b.x - s.x, b.y - s.y));
  }
  const a = m.rules, r = snap.rules;
  const rules = a.turn === r.turn && a.winner === r.winner && !!a.ballInHand === !!r.ballInHand
    && JSON.stringify(a.score) === JSON.stringify(r.score) && JSON.stringify(a.groups) === JSON.stringify(r.groups);
  return { dist, balls, rules };
}

/** Close enough that nobody could tell: under 2 mm, same balls down, same turn. */
export const inSync = (d) => d.balls === 0 && d.rules && d.dist < 2 * MM;

/** A short string both sides can compare in a bug report. */
export function digest(m) {
  let h = 2166136261;
  const feed = (n) => { h ^= n | 0; h = Math.imul(h, 16777619) >>> 0; };
  for (const b of m.sim.balls) { feed(b.id); feed(b.pocketed ? 1 : 0); if (!b.pocketed) { feed(Math.round(b.x / MM)); feed(Math.round(b.y / MM)); } }
  feed(m.rules.turn); feed(m.rules.shots);
  return h.toString(16).padStart(8, '0');
}
