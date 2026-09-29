// Searches for a working solution to each trick-shot challenge using the real
// engine, and prints them ready to paste into src/challenges.js.
import { ALL_CHALLENGES as CHALLENGES, tryShot } from '../src/challenges.js';

const only = process.argv[2];
const speeds = [1.2, 1.8, 2.4, 3.2, 4.2, 5.5, 7];
const spins = [[0, 0], [0, 0.3], [0, -0.3], [0.3, 0], [-0.3, 0], [0, 0.45], [0, -0.45], [0.35, 0.2], [-0.35, 0.2], [0.35, -0.2], [-0.35, -0.2]];

for (const ch of CHALLENGES) {
  if (only && ch.id !== only) continue;
  const c = ch.setup.cue;
  let best = null;
  // aim at every ball and at a fan of angles around it, plus rail-first angles
  const angles = new Set();
  for (let d = 0; d < 360; d += 1.5) angles.add(+(d * Math.PI / 180).toFixed(4));
  for (const b of ch.setup.balls) {
    const base = Math.atan2(b.y - c.y, b.x - c.x);
    for (let k = -40; k <= 40; k++) angles.add(+(base + k * 0.004).toFixed(4));
  }
  const sorted = [...angles].sort((x, y) => x - y);
  const jumps = ch.objective.require === 'JUMP' ? [0.28, 0.4, 0.52] : [0];
  outer: for (const jump of jumps) for (const [a, b] of spins) {
    for (const v of speeds) {
      for (const ang of sorted) {
        const res = tryShot(ch, { angle: ang, speed: v, a, b, jump });
        if (res.solved) { best = { angle: ang, speed: v, a, b, jump }; break outer; }
      }
    }
  }
  console.log(best ? `${ch.id} ${ch.name}: solution ${JSON.stringify(best)}` : `${ch.id} ${ch.name}: NO SOLUTION FOUND`);
}
