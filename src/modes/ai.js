// AI opponent. One engine, three honest tiers (DESIGN.md 6.6): enumerate
// geometric candidates, run the real sim with tier-scaled execution noise,
// score the leave, fall back to a safety. Never stalls: always returns a
// legal shot.
// CONTRACT (locked):
//   chooseShot(sim, rules, tier, rng) -> { aimAngle, shot:{angle,speed,spin:{x,y}} }
//   tier: 'rookie' | 'club' | 'champ'. sim is the live Sim (clone inside).
// rng is the caller's seeded RNG (mulberry32); no Math.random anywhere.
import { runToRest } from '../sim/physics.js';
import { BALL_R, HALF_L, HALF_W } from '../sim/table.js';
import { ballGroup } from '../sim/rules.js';

const R2 = 2 * BALL_R;

const TIERS = {
  // spins: vertical tip offsets tried per candidate; the sim decides which
  // avoids the scratch and leaves position (a straight follow often scratches,
  // so stun/draw must be on the menu).
  rookie: { candidates: 8, sigma: 0.012, spins: [0, 0.2], safety: false },
  club:   { candidates: 16, sigma: 0.005, spins: [-0.2, 0, 0.2], safety: false },
  champ:  { candidates: 24, sigma: 0.002, spins: [-0.25, 0, 0.25], safety: true },
};

/** Gaussian from the caller's uniform RNG (Box-Muller). */
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** True when any ball (not in skipIds) comes within 2R of the segment. */
function lineBlocked(x1, y1, x2, y2, balls, skipIds) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (const b of balls) {
    if (b.pocketed || skipIds.has(b.id)) continue;
    let t = len2 > 0 ? ((b.x - x1) * dx + (b.y - y1) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = x1 + dx * t - b.x, py = y1 + dy * t - b.y;
    if (px * px + py * py < R2 * R2) return true;
  }
  return false;
}

/** Balls of the shooter's group still on the sim (open: every non-8). */
function ownBalls(sim, rules, me, excludeId = -1) {
  if (rules.sequence) {
    // Rotation: the only "next ball" that matters is the lowest remaining.
    const ids = [...rules.remaining].filter((id) => id !== excludeId).sort((a, b) => a - b);
    if (!ids.length) return [];
    const b = sim.ball(ids[0]);
    return b && !b.pocketed ? [b] : [];
  }
  const g = rules.state.groups[me];
  return sim.balls.filter((b) => {
    if (b.pocketed || b.id === 0 || b.id === excludeId) return false;
    const bg = ballGroup(b.id);
    if (rules.state.open) return bg !== 'eight';
    return bg === g;
  });
}

function oppBalls(sim, rules, me) {
  const g = rules.state.groups[me];
  return sim.balls.filter((b) => {
    if (b.pocketed || b.id === 0) return false;
    const bg = ballGroup(b.id);
    if (rules.state.open) return bg !== 'eight';
    return bg !== g && bg !== 'eight';
  });
}

/**
 * Simulate one candidate and score it. Higher is better.
 * Returns { score, pot, pPot }.
 */
function scoreCandidate(sim, rules, legalIds, me, target, pocketIdx, angle, speed, spinY) {
  const s = sim.clone();
  s.strike({ angle, speed, spin: { x: 0, y: spinY } });
  const { events } = runToRest(s, 12);
  const potted = new Set();
  let cuePotted = false, railAfterFirst = false, firstContactId = null;
  for (const e of events) {
    if (e.type === 'pocket') {
      if (e.ball === 0) cuePotted = true; else potted.add(e.ball);
    } else if (e.type === 'contact' && (e.a === 0 || e.b === 0)) {
      const oid = e.a === 0 ? e.b : e.a;
      if (firstContactId === null) firstContactId = oid;
    } else if (e.type === 'cushion' && firstContactId !== null) {
      railAfterFirst = true;
    }
  }
  void railAfterFirst;

  let score = 0;
  const pot = potted.has(target.id);
  if (pot) score += 120;
  if (cuePotted) score -= 250;
  if (firstContactId !== null && !legalIds.includes(firstContactId)) score -= 180;
  // The game ball: a legal pot of it wins on the spot (in rotation that
  // includes an early combo into the 9); anything else is a disaster.
  const fid = rules.finalId ?? 8;
  if (potted.has(fid)) {
    const legalFinal = firstContactId !== null && legalIds.includes(firstContactId)
      && !cuePotted && (fid === 8 ? rules.onEight(me) : true);
    score += legalFinal ? 500 : -300;
  }
  if (pot) {
    // The leave: cue close to a next ball, not snookered, and the object
    // ball did not rattle out somewhere silly.
    const cue = s.cueBall();
    const next = ownBalls(s, rules, me, target.id);
    if (next.length) {
      let dnext = Infinity, nearest = null;
      for (const nb of next) {
        const d = Math.hypot(nb.x - cue.x, nb.y - cue.y);
        if (d < dnext) { dnext = d; nearest = nb; }
      }
      score -= 2.5 * dnext;                                  // position play
      if (nearest && lineBlocked(cue.x, cue.y, nearest.x, nearest.y, s.balls, new Set([0, nearest.id]))) {
        score -= 20;                                         // snookered on the next ball
      }
    }
  }
  return { score, pot };
}

/** Heuristic pot probability for the safety decision. */
function potProb(cut, distObj, distCue) {
  return clamp(1 - cut / 1.0 - distObj / 3.0 - distCue / 4.0, 0, 1);
}

/**
 * Kick fallback: aim at the nearest legal ball via one cushion, reflecting
 * the target across the rail to get a true kick line.
 */
function kickShot(sim, rules, me, rng, sigma) {
  const cue = sim.cueBall();
  const legalIds = rules.legalFirstIds();
  const targets = legalIds.map((id) => sim.ball(id)).filter((b) => b && !b.pocketed);
  if (!targets.length || !cue || cue.pocketed) {
    return { aimAngle: 0, shot: { angle: 0, speed: 1, spin: { x: 0, y: 0 } } };
  }
  let target = targets[0], bd = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - cue.x, t.y - cue.y);
    if (d < bd) { bd = d; target = t; }
  }
  // Four rails as mirror lines; pick the rail whose midpoint is nearest the cue.
  const rails = [
    { mx: 0, my: HALF_W, refl: (x, y) => [x, 2 * HALF_W - y] },
    { mx: 0, my: -HALF_W, refl: (x, y) => [x, -2 * HALF_W - y] },
    { mx: HALF_L, my: 0, refl: (x, y) => [2 * HALF_L - x, y] },
    { mx: -HALF_L, my: 0, refl: (x, y) => [-2 * HALF_L - x, y] },
  ];
  rails.sort((a, b) =>
    Math.hypot(a.mx - cue.x, a.my - cue.y) - Math.hypot(b.mx - cue.x, b.my - cue.y));
  const [tx, ty] = rails[0].refl(target.x, target.y);
  const base = Math.atan2(ty - cue.y, tx - cue.x);
  const angle = base + gauss(rng) * sigma;
  const speed = clamp(3.0 * (1 + gauss(rng) * sigma), 0.5, 9.5);
  return { aimAngle: angle, shot: { angle, speed, spin: { x: 0, y: 0.1 } } };
}

/** Champion safety: hit own ball, send the cue to a rail far from opponent targets. */
function safetyShot(sim, rules, me, rng, sigma) {
  const cue = sim.cueBall();
  const legalIds = rules.legalFirstIds();
  const targets = legalIds.map((id) => sim.ball(id)).filter((b) => b && !b.pocketed);
  if (!targets.length) return kickShot(sim, rules, me, rng, sigma);
  const opps = oppBalls(sim, rules, me);
  const rails = [
    { refl: (x, y) => [x, 2 * HALF_W - y] },
    { refl: (x, y) => [x, -2 * HALF_W - y] },
    { refl: (x, y) => [2 * HALF_L - x, y] },
    { refl: (x, y) => [-2 * HALF_L - x, y] },
  ];
  let best = null;
  for (const t of targets.slice(0, 6)) {
    for (const r of rails) {
      const [tx, ty] = r.refl(t.x, t.y);
      const angle = Math.atan2(ty - cue.y, tx - cue.x);
      const s = sim.clone();
      s.strike({ angle, speed: 3.2, spin: { x: 0, y: 0.1 } });
      const { events } = runToRest(s, 12);
      let hit = false, rail = false, scratch = false;
      for (const e of events) {
        if (e.type === 'contact' && (e.a === 0 || e.b === 0)) {
          const oid = e.a === 0 ? e.b : e.a;
          if (oid === t.id) hit = true;
        } else if (e.type === 'cushion') rail = true;
        else if (e.type === 'pocket' && e.ball === 0) scratch = true;
      }
      const cb = s.cueBall();
      let far = 0.5;
      for (const o of opps) far = Math.max(far, Math.hypot(o.x - cb.x, o.y - cb.y));
      const score = (hit ? 60 : 0) + (rail ? 25 : 0) + far * 12 - (scratch ? 250 : 0);
      if (!best || score > best.score) best = { score, angle, t };
    }
  }
  if (!best) return kickShot(sim, rules, me, rng, sigma);
  const angle = best.angle + gauss(rng) * sigma;
  const speed = clamp(3.2 * (1 + gauss(rng) * sigma), 0.5, 9.5);
  return { aimAngle: angle, shot: { angle, speed, spin: { x: 0, y: 0.1 } } };
}

export function chooseShot(sim, rules, tier, rng) {
  const cfg = TIERS[tier] || TIERS.club;
  const me = rules.state.turn;
  const cue = sim.cueBall();
  const legalIds = rules.legalFirstIds();
  const targets = legalIds.map((id) => sim.ball(id)).filter((b) => b && !b.pocketed);
  if (!targets.length || !cue || cue.pocketed) {
    return { aimAngle: 0, shot: { angle: 0, speed: 1, spin: { x: 0, y: 0 } } };
  }

  // Enumerate target x pocket candidates on the ghost-ball geometry.
  const cands = [];
  const pockets = sim.table.pockets;
  for (const t of targets) {
    for (let pi = 0; pi < pockets.length; pi++) {
      const p = pockets[pi];
      const px = p.mx - t.x, py = p.my - t.y;
      const pd = Math.hypot(px, py) || 1e-9;
      const nx = px / pd, ny = py / pd;                 // object-ball travel dir
      const gx = t.x - nx * R2, gy = t.y - ny * R2;     // ghost-ball aim point
      const ax = gx - cue.x, ay = gy - cue.y;
      const ad = Math.hypot(ax, ay) || 1e-9;
      const aim = Math.atan2(ay, ax);
      const ux = ax / ad, uy = ay / ad;
      const cut = Math.acos(clamp(ux * nx + uy * ny, -1, 1));
      const diff = cut + 0.35 * pd + 0.15 * ad;         // difficulty heuristic
      cands.push({ t, pi, angle: aim, cut, distObj: pd, distCue: ad, diff });
    }
  }
  cands.sort((a, b) => a.diff - b.diff);
  const short = cands.slice(0, cfg.candidates);

  // Simulate each candidate at a few speeds (and spins for champ).
  let best = null;
  for (const c of short) {
    const base = clamp(1.1 + 1.6 * c.distObj + 0.9 * c.distCue + 1.2 * c.cut, 0.9, 7);
    for (const sm of [0.85, 1.0, 1.2]) {
      const speed = clamp(base * sm, 0.5, 9.5);
      for (const spinY of cfg.spins) {
        const { score, pot } = scoreCandidate(sim, rules, legalIds, me, c.t, c.pi, c.angle, speed, spinY);
        const total = score - 4 * c.diff;
        if (!best || total > best.score) {
          best = { score: total, pot, angle: c.angle, speed, spinY, pocket: c.pi, pPot: potProb(c.cut, c.distObj, c.distCue) };
        }
      }
    }
  }

  // Nothing pots: kick at a legal ball via a cushion (never stalls).
  if (!best || !best.pot) {
    // Champion upgrades a hopeless pot to a deliberate safety.
    if (cfg.safety && best && best.pPot < 0.22) return safetyShot(sim, rules, me, rng, cfg.sigma);
    return kickShot(sim, rules, me, rng, cfg.sigma);
  }
  if (cfg.safety && best.pPot < 0.22) return safetyShot(sim, rules, me, rng, cfg.sigma);

  // Tier execution noise; aimAngle is the executed (post-noise) angle.
  const angle = best.angle + gauss(rng) * cfg.sigma;
  const speed = clamp(best.speed * (1 + gauss(rng) * cfg.sigma), 0.3, 9.5);
  const spin = { x: 0, y: best.spinY };
  return { aimAngle: angle, shot: { angle, speed, spin }, pocket: best.pocket };
}
