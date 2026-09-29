import test from 'node:test';
import assert from 'node:assert/strict';
import { Stroke, speedFromPower, powerFromSpeed } from '../src/stroke.js';

// drive a stroke through a path of [distance drawn back, time] samples
function run(path, releaseAt = null) {
  const st = new Stroke();
  let fired = null;
  for (const [s, t] of path) {
    const out = st.push(s, t);
    if (out.fire != null) { fired = out.fire; break; }
  }
  if (fired == null && releaseAt) {
    const r = st.release(releaseAt[0], releaseAt[1]);
    fired = r.fire ?? null;
  }
  return fired;
}
const line = (from, to, t0, dur, n = 12) => Array.from({ length: n + 1 }, (_, i) => [from + (to - from) * (i / n), t0 + dur * (i / n)]);

test('power and speed mappings are inverses', () => {
  for (const p of [0.05, 0.3, 0.6, 1]) assert.ok(Math.abs(powerFromSpeed(speedFromPower(p)) - p) < 1e-9);
});

test('releasing after a slow draw fires from the draw distance', () => {
  const half = run(line(0, 0.31, 0, 0.6), [0.31, 0.62]);
  const full = run(line(0, 0.62, 0, 0.9), [0.62, 0.95]);
  assert.ok(Math.abs(half - 0.5) < 0.02, `half draw gave ${half}`);
  assert.ok(Math.abs(full - 1) < 0.02, `full draw gave ${full}`);
});

test('a push forward fires when the tip reaches the ball, and a faster push is a harder shot', () => {
  const draw = line(0, 0.4, 0, 0.5);
  const slow = run([...draw, ...line(0.4, 0.0, 0.7, 0.55)]);       // ~0.7 m/s
  const fast = run([...draw, ...line(0.4, 0.0, 0.7, 0.12)]);       // ~3.3 m/s
  assert.ok(slow != null && fast != null, 'both strokes should fire');
  assert.ok(fast > slow + 0.25, `fast ${fast} vs slow ${slow}`);
});

test('a stray click or a tiny draw never fires', () => {
  assert.equal(run([[0, 0], [0.01, 0.05]], [0.01, 0.06]), null);
  assert.equal(run(line(0, 0.05, 0, 0.3), [0.05, 0.31]), null, 'below the arming distance');
});

test('drawing back never fires by itself, however fast', () => {
  const st = new Stroke();
  for (const [s, t] of line(0, 0.6, 0, 0.05, 20)) assert.equal(st.push(s, t).fire, undefined);
});

test('releasing while still moving forward counts as a stroke rather than a slow release', () => {
  const draw = line(0, 0.5, 0, 0.5);
  const push = line(0.5, 0.25, 0.55, 0.08);                          // fast, ends mid-way
  const st = new Stroke();
  for (const [s, t] of [...draw, ...push]) st.push(s, t);
  const r = st.release(0.25, 0.63);
  assert.ok(r.fire != null && r.fire > 0.6, `expected a hard shot, got ${JSON.stringify(r)}`);
});

test('a stroke fires once', () => {
  const st = new Stroke();
  let fires = 0;
  for (const [s, t] of [...line(0, 0.4, 0, 0.4), ...line(0.4, -0.05, 0.5, 0.1)]) if (st.push(s, t).fire != null) fires++;
  assert.equal(fires, 1);
  assert.deepEqual(st.release(0, 1), { cancel: true });
});

test('pausing before letting go means a soft release, not a stroke', () => {
  const st = new Stroke();
  for (const [s, t] of [...line(0, 0.5, 0, 0.5), ...line(0.5, 0.3, 0.55, 0.06)]) st.push(s, t);   // fast push, then the hand stops
  const r = st.release(0.3, 1.2);                                                                    // 0.6 s later
  assert.ok(r.fire != null && Math.abs(r.fire - 0.3 / 0.62) < 0.02, `expected a distance release, got ${JSON.stringify(r)}`);
});

test('a slow, careful push back to the ball fires a soft shot instead of being ignored', () => {
  const soft = run([...line(0, 0.4, 0, 0.5), ...line(0.4, 0.0, 0.6, 1.0)]);
  assert.ok(soft != null, 'a slow push should still fire');
  assert.ok(soft < 0.25, `expected a soft shot, got ${soft}`);
});

test('small hand jitter while drawing back does not fire', () => {
  const st = new Stroke();
  let fired = false;
  const path = [[0, 0], [0.1, 0.05], [0.09, 0.07], [0.12, 0.1], [0.11, 0.12], [0.2, 0.2], [0.19, 0.22], [0.3, 0.3]];
  for (const [s, t] of path) if (st.push(s, t).fire != null) fired = true;
  assert.equal(fired, false);
});
