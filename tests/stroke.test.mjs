// Stroke unit tests: the cue-stroke state machine shared by mouse, touch
// gauge and gamepad. Run with: node --test tests/stroke.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Stroke, speedFromPower, powerFromSpeed, MAX_SPEED } from '../src/input/stroke.js';

// Drive a stroke through [drawMeters, tSeconds] samples; optionally release
// at [s, t]. Returns the fired power or null (cancelled / never fired).
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

// Straight-line sample path from `from` to `to` over [t0, t0+dur].
const line = (from, to, t0, dur, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => [from + (to - from) * (i / n), t0 + dur * (i / n)]);

test('power and speed mappings round-trip', () => {
  for (const p of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(powerFromSpeed(speedFromPower(p)) - p) < 1e-9, `round-trip failed at p=${p}`);
  }
});

test('power clamps to 0..1 at the edges', () => {
  assert.equal(speedFromPower(-1), speedFromPower(0));
  assert.equal(speedFromPower(2), speedFromPower(1));
  assert.equal(powerFromSpeed(0), 0);
  assert.equal(powerFromSpeed(MAX_SPEED + 100), 1);
  assert.equal(powerFromSpeed(-5), 0);
  assert.equal(powerFromSpeed(NaN), 0);
  assert.equal(speedFromPower(NaN), 0.35);
});

test('a click (tiny sample, release) cancels and never fires', () => {
  const st = new Stroke();
  const out = st.push(0.01, 0);
  assert.equal(out.fire, undefined);
  assert.equal(out.armed, false);
  assert.deepEqual(st.release(0.01, 0.05), { cancel: true });
  assert.equal(run([[0, 0], [0.01, 0.05]], [0.01, 0.06]), null);
});

test('a draw under the arm threshold never fires, even on release', () => {
  assert.equal(run(line(0, 0.05, 0, 0.3), [0.05, 0.31]), null, 'below the 0.07 m arm distance');
});

test('a draw under 4% of maxPull cancels on release', () => {
  // Armed (0.07 m) but released back under 4% of 0.62 m = 0.0248 m.
  const st = new Stroke();
  for (const [s, t] of line(0, 0.08, 0, 0.2)) st.push(s, t);
  assert.deepEqual(st.release(0.02, 0.25), { cancel: true });
});

test('pull-and-release fires at draw power', () => {
  const half = run(line(0, 0.31, 0, 0.6), [0.31, 0.62]);
  const full = run(line(0, 0.62, 0, 0.9), [0.62, 0.95]);
  assert.ok(half != null && Math.abs(half - 0.5) < 0.02, `half draw gave ${half}`);
  assert.ok(full != null && Math.abs(full - 1) < 0.02, `full draw gave ${full}`);
});

test('pull-push fires at contact with power monotonic in push speed', () => {
  const draw = line(0, 0.4, 0, 0.5);
  const slow = run([...draw, ...line(0.4, 0.0, 0.7, 0.55)]); // ~0.7 m/s
  const fast = run([...draw, ...line(0.4, 0.0, 0.7, 0.12)]); // ~3.3 m/s
  assert.ok(slow != null && fast != null, 'both strokes should fire at contact');
  assert.ok(fast > slow + 0.2, `faster push must be harder: fast=${fast} slow=${slow}`);
  assert.ok(slow >= 0 && slow <= 1 && fast >= 0 && fast <= 1, 'power stays in 0..1');
});

test('drawing back never fires by itself, however fast', () => {
  const st = new Stroke();
  for (const [s, t] of line(0, 0.6, 0, 0.05, 20)) assert.equal(st.push(s, t).fire, undefined);
});

test('stale samples (time gaps) do not fire and read speed 0', () => {
  const st = new Stroke();
  for (const [s, t] of line(0, 0.3, 0, 0.3)) st.push(s, t);
  assert.equal(st.speed(5.0), 0, 'a stalled stream reads speed 0');
  const out = st.push(0.3, 5.0); // same draw, seconds later: no motion
  assert.equal(out.fire, undefined, 'no fresh motion, no fire');
  assert.equal(st.speed(5.0), 0);
});

test('holding a draw then releasing late is a soft distance release, not a stroke', () => {
  const st = new Stroke();
  for (const [s, t] of [...line(0, 0.5, 0, 0.5), ...line(0.5, 0.3, 0.55, 0.06)]) st.push(s, t);
  const r = st.release(0.3, 1.2); // 0.6 s after motion stopped
  assert.ok(r.fire != null && Math.abs(r.fire - 0.3 / 0.62) < 0.02,
    `expected a distance release, got ${JSON.stringify(r)}`);
});

test('releasing while still moving forward counts as a stroke', () => {
  const st = new Stroke();
  for (const [s, t] of [...line(0, 0.5, 0, 0.5), ...line(0.5, 0.25, 0.55, 0.08)]) st.push(s, t);
  const r = st.release(0.25, 0.63);
  assert.ok(r.fire != null && r.fire > 0.6, `expected a hard shot, got ${JSON.stringify(r)}`);
});

test('a stroke fires exactly once; release after a fired push cancels', () => {
  const st = new Stroke();
  let fires = 0;
  for (const [s, t] of [...line(0, 0.4, 0, 0.4), ...line(0.4, -0.05, 0.5, 0.1)]) {
    if (st.push(s, t).fire != null) fires++;
  }
  assert.equal(fires, 1);
  assert.deepEqual(st.release(0, 1), { cancel: true });
});

test('a slow, careful push back to the ball still fires, softly', () => {
  const soft = run([...line(0, 0.4, 0, 0.5), ...line(0.4, 0.0, 0.6, 1.0)]);
  assert.ok(soft != null, 'a slow push should still fire');
  assert.ok(soft < 0.25, `expected a soft shot, got ${soft}`);
});

test('small hand jitter while drawing back does not fire or arm a stroke', () => {
  const st = new Stroke();
  let fired = false;
  const path = [[0, 0], [0.1, 0.05], [0.09, 0.07], [0.12, 0.1], [0.11, 0.12], [0.2, 0.2], [0.19, 0.22], [0.3, 0.3]];
  for (const [s, t] of path) if (st.push(s, t).fire != null) fired = true;
  assert.equal(fired, false);
});

test('push() reports pull fraction, armed and forward flags', () => {
  const st = new Stroke();
  let out = st.push(0.31, 0);
  assert.equal(out.armed, true);
  assert.ok(Math.abs(out.pull - 0.5) < 1e-9);
  assert.equal(out.forward, false);
  out = st.push(0.31, 10); // stale re-push: still armed, not forward
  assert.equal(out.forward, false);
});

test('reset() lets the same Stroke take a new gesture', () => {
  const st = new Stroke();
  for (const [s, t] of line(0, 0.4, 0, 0.4)) st.push(s, t);
  st.release(0.4, 0.45);
  st.reset();
  assert.equal(st.push(0.01, 1).armed, false);
  assert.deepEqual(st.release(0.01, 1.05), { cancel: true });
});

test('non-finite samples are treated as zero, never as fire', () => {
  const st = new Stroke();
  const out = st.push(NaN, NaN);
  assert.equal(out.fire, undefined);
  assert.deepEqual(st.release(NaN, NaN), { cancel: true });
});
