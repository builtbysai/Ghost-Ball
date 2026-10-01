// Aim-guide preview: clones the sim, strikes, runs to first contact + a
// short tail. The guide is the sim's own outcome, never a guess.
// CONTRACT (locked):
//   previewShot(sim, {angle,speed,spin}, { isLegalFirst(id)->bool, speed? })
//     -> { cuePath:[[x,y]...], contact:{x,y,ballId}|null, ghost:{x,y}|null,
//          objPath:[[x,y]...], cueAfter:[[x,y]...], targetPocket:index|null,
//          firstContactId:id|null }
import { Sim, STEP } from './physics.js';
import { BALL_R } from './table.js';

const R2 = 2 * BALL_R;
const TAIL_SECONDS = 0.25;
const PRE_SECONDS = 10;      // cap on the pre-contact search
const CONE = 0.38;           // ~22 deg: pocket acceptance cone for targetPocket

/**
 * @param {Sim} sim the live sim; cloned internally, never mutated
 * @param {{angle,speed,spin}} shot
 * @param {{isLegalFirst(id)->bool, speed?}} opts speed overrides shot.speed.
 *   isLegalFirst is accepted per contract; the wrong-first warning is the
 *   caller's job (it checks !isLegalFirst(firstContactId)) — the preview
 *   returns firstContactId regardless.
 */
export function previewShot(sim, shot, opts = {}) {
  const isLegalFirst = opts.isLegalFirst || (() => true);
  const s = sim.clone();
  const speed = opts.speed ?? shot.speed;
  s.strike({ angle: shot.angle, speed, spin: shot.spin || { x: 0, y: 0 } });

  // Run to the cue ball's first contact with another ball, sampling its path.
  const cue = s.cueBall();
  const cuePath = [[cue.x, cue.y]];
  let contact = null, ghost = null, firstContactId = null;
  let t = 0;
  while (t < PRE_SECONDS && !contact && !s.rest()) {
    const evs = s.step(STEP);
    t += STEP;
    const cb = s.cueBall();
    cuePath.push([cb.x, cb.y]);
    for (const e of evs) {
      if (e.type === 'contact' && (e.a === 0 || e.b === 0)) {
        const oid = e.a === 0 ? e.b : e.a;
        const ob = s.ball(oid);
        if (!ob) break;
        firstContactId = oid;
        const dx = ob.x - cb.x, dy = ob.y - cb.y;
        const d = Math.hypot(dx, dy) || 1e-9;
        const nx = dx / d, ny = dy / d;   // line of centers at contact
        contact = { x: cb.x, y: cb.y, ballId: oid };
        ghost = { x: ob.x - nx * R2, y: ob.y - ny * R2 };
        break;
      }
    }
  }

  // Tail: 0.25 s of the object ball's path and the cue ball's path after contact.
  const objPath = [], cueAfter = [];
  if (contact) {
    const n = Math.round(TAIL_SECONDS / STEP);
    for (let i = 0; i < n; i++) {
      s.step(STEP);
      const cb = s.cueBall();
      cueAfter.push([cb.x, cb.y]);
      const ob = s.ball(firstContactId);
      if (ob && !ob.pocketed) objPath.push([ob.x, ob.y]);
      else break;
    }
  }

  // The object ball's travel direction just after contact.
  let travel = null;
  if (objPath.length >= 2) {
    const a = objPath[0];
    const b = objPath[Math.min(5, objPath.length - 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > 1e-7) travel = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  }

  // targetPocket: the pocket whose mouth center is nearest the object ball's
  // travel line, within a cone; null when nothing lines up.
  let targetPocket = null;
  if (travel && contact) {
    const [tx, ty] = travel;
    let best = Infinity;
    for (let i = 0; i < s.table.pockets.length; i++) {
      const p = s.table.pockets[i];
      const vx = p.mx - contact.x, vy = p.my - contact.y;
      const vd = Math.hypot(vx, vy);
      if (vd < 1e-9) continue;
      const dot = (tx * vx + ty * vy) / vd;
      if (dot <= 0) continue;                       // pocket is behind
      const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (ang < CONE && ang < best) { best = ang; targetPocket = i; }
    }
  }

  return { cuePath, contact, ghost, objPath, cueAfter, targetPocket, firstContactId };
}
