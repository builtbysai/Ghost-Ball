// Audio workstream tests: engine lifecycle state machine, synthesized
// one-shots, and page-lifecycle binding -- all against a fake
// AudioContext, so no real audio device is needed.
// Covers the automated probe from DESIGN.md section 7 / section 9 gate 5:
//   gesture -> ensure() -> running; hidden -> suspended + master 0;
//   pagehide -> closed, sources stopped, nothing connected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio/engine.js';
import { clack, thump, pocketDrop, cueStrike, uiTap } from '../src/audio/sfx.js';
import { installLifecycle } from '../src/audio/lifecycle.js';

// -- fakes ---------------------------------------------------------------

class FakeParam {
  constructor(value = 0) { this.value = value; this._calls = []; }
  setValueAtTime(v) { this._calls.push(['set', v]); this.value = v; }
  linearRampToValueAtTime(v) { this._calls.push(['lin', v]); this.value = v; }
  exponentialRampToValueAtTime(v) { this._calls.push(['exp', v]); this.value = v; }
  setTargetAtTime(v) { this._calls.push(['tgt', v]); this.value = v; }
  cancelScheduledValues() {}
}

class FakeNode {
  constructor(ctx, kind) {
    this.context = ctx;
    this.kind = kind;
    this.connections = new Set();
    this.inputs = new Set();
    this.disconnected = false;
  }
  connect(dest) {
    this.connections.add(dest);
    if (dest && dest.inputs) dest.inputs.add(this);
    return dest;
  }
  disconnect() {
    this.disconnected = true;
    for (const dest of this.connections) {
      if (dest && dest.inputs) dest.inputs.delete(this);
    }
    this.connections.clear();
  }
}

class FakeGain extends FakeNode {
  constructor(ctx) { super(ctx, 'gain'); this.gain = new FakeParam(1); }
}

class FakeBufferSource extends FakeNode {
  constructor(ctx) {
    super(ctx, 'source');
    this.buffer = null;
    this.loop = false;
    this.started = false;
    this.startCalls = [];
    this.stopped = false;
    this.onended = null;
  }
  start(when, offset) { this.started = true; this.startCalls.push([when, offset]); }
  stop() { this.stopped = true; }
}

class FakeOscillator extends FakeBufferSource {
  constructor(ctx) {
    super(ctx, 'osc');
    this.type = 'sine';
    this.frequency = new FakeParam(440);
  }
}

class FakeBiquad extends FakeNode {
  constructor(ctx) {
    super(ctx, 'filter');
    this.type = 'lowpass';
    this.frequency = new FakeParam(350);
    this.Q = new FakeParam(1);
  }
}

class FakeDelay extends FakeNode {
  constructor(ctx) { super(ctx, 'delay'); this.delayTime = new FakeParam(0); }
}

class FakePanner extends FakeNode {
  constructor(ctx) { super(ctx, 'panner'); this.pan = new FakeParam(0); }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new FakeNode(this, 'destination');
    this.suspendCalls = 0;
    this.resumeCalls = 0;
    this.closeCalls = 0;
    this.gains = [];
    this.sources = [];
    this.oscs = [];
    this.filters = [];
  }
  createGain() { const g = new FakeGain(this); this.gains.push(g); return g; }
  createBuffer(ch, length, sr) {
    const data = new Float32Array(length);
    return {
      numberOfChannels: ch, length, sampleRate: sr,
      getChannelData: () => data,
    };
  }
  createBufferSource() { const s = new FakeBufferSource(this); this.sources.push(s); return s; }
  createOscillator() { const o = new FakeOscillator(this); this.oscs.push(o); return o; }
  createBiquadFilter() { const f = new FakeBiquad(this); this.filters.push(f); return f; }
  createDelay() { return new FakeDelay(this); }
  createStereoPanner() { return new FakePanner(this); }
  suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
}

// Fake event target for lifecycle tests: records listener add/remove
// and can dispatch named events.
class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.hidden = false;
    this.added = [];
    this.removed = [];
  }
  addEventListener(type, fn) {
    this.added.push(type);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.removed.push(type);
    const set = this.listeners.get(type);
    if (set) set.delete(fn);
  }
  dispatch(type, event = {}) {
    const set = this.listeners.get(type);
    if (set) for (const fn of [...set]) fn({ type, ...event });
  }
  listenerCount(type) { return (this.listeners.get(type) || new Set()).size; }
}

function makeEngine() {
  const made = [];
  const engine = new AudioEngine({
    createContext: () => {
      const ctx = new FakeAudioContext();
      made.push(ctx);
      return ctx;
    },
  });
  return { engine, made };
}

// -- engine: state machine -------------------------------------------------

test('no context exists before ensure()', () => {
  const { engine, made } = makeEngine();
  assert.equal(made.length, 0);
  assert.equal(engine.state, 'none');
  assert.equal(engine.ctx, null);
  assert.equal(engine.bus('sfx'), null);
  assert.equal(engine.bus('music'), null);
  assert.equal(engine.ok(), false);
});

test('ensure() creates exactly one context on repeat calls', () => {
  const { engine, made } = makeEngine();
  assert.equal(engine.ensure(), true);
  assert.equal(engine.ensure(), true);
  assert.equal(engine.ensure(), true);
  assert.equal(made.length, 1);
  assert.equal(engine.state, 'running');
});

test('graph shape: master -> destination, buses -> master, tone loop started', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  const ctx = made[0];
  const masters = [...ctx.destination.inputs];
  assert.equal(masters.length, 1, 'exactly one node feeds destination');
  const master = masters[0];
  assert.ok(master instanceof FakeGain);
  const intoMaster = [...master.inputs];
  const sfx = engine.bus('sfx');
  const music = engine.bus('music');
  assert.ok(intoMaster.includes(sfx), 'sfx bus feeds master');
  assert.ok(intoMaster.includes(music), 'music bus feeds master');
  const toneSources = ctx.sources.filter((s) => s.loop);
  assert.equal(toneSources.length, 1, 'one looping room-tone source');
  assert.ok(toneSources[0].started, 'tone loop started at ensure');
});

test('setLevels muted -> ok() false; sfx no-ops are safe', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.setLevels({ sfx: 0.8, music: 0.4, muted: true });
  assert.equal(engine.ok(), false);
  const ctx = made[0];
  const before = ctx.sources.length;
  // Muted: these must be hard no-ops, never throw.
  clack(engine, { speed: 1 });
  thump(engine, { speed: 1 });
  pocketDrop(engine, {});
  cueStrike(engine, { power: 1 });
  assert.equal(ctx.sources.length, before, 'no shot sources while muted');
  engine.setLevels({ muted: false });
  assert.equal(engine.ok(), true);
});

test('ok() false when sfx level is zero', () => {
  const { engine } = makeEngine();
  engine.ensure();
  engine.setLevels({ sfx: 0 });
  assert.equal(engine.ok(), false);
  engine.setLevels({ sfx: 0.8 });
  assert.equal(engine.ok(), true);
});

test('suspend(): master ramps to 0 and context suspends', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.suspend();
  const ctx = made[0];
  assert.equal(ctx.suspendCalls, 1);
  assert.equal(engine.state, 'suspended');
  const master = [...ctx.destination.inputs][0];
  assert.equal(master.gain.value, 0, 'master gain at zero after suspend');
});

test('resume(): only resumes a suspended, live context', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.resume(); // running already: no-op
  assert.equal(made[0].resumeCalls, 0);
  engine.suspend();
  engine.resume();
  assert.equal(made[0].resumeCalls, 1);
  assert.equal(engine.state, 'running');
});

test('teardown(): sources stopped, nodes disconnected, context closed', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  const ctx = made[0];
  engine.teardown();
  assert.equal(ctx.closeCalls, 1);
  for (const s of ctx.sources) {
    if (s.loop) assert.equal(s.stopped, true, 'tone loop stopped');
  }
  assert.equal(engine.state, 'closed');
  assert.equal(engine.bus('sfx'), null);
  assert.equal(engine.ok(), false);
});

test('ensure() after teardown builds a FRESH context', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.teardown();
  assert.equal(engine.state, 'closed');
  assert.equal(engine.ensure(), true);
  assert.equal(made.length, 2, 'fresh context built');
  assert.notEqual(made[0], made[1]);
  assert.equal(engine.state, 'running');
  const tone = made[1].sources.filter((s) => s.loop);
  assert.equal(tone.length, 1, 'tone loop restarted on fresh context');
});

test('levels survive teardown and apply to the fresh context', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.setLevels({ sfx: 0.25, music: 0.1, muted: true });
  engine.teardown();
  engine.ensure();
  assert.equal(engine.bus('sfx').gain.value, 0.25);
  assert.equal(engine.bus('music').gain.value, 0.1);
  assert.equal(engine.ok(), false, 'muted still gates ok()');
});

test('methods safe in any order, any number of times', () => {
  const { engine } = makeEngine();
  // All of these run before any context exists: must not throw.
  engine.suspend();
  engine.resume();
  engine.teardown();
  engine.setLevels({ sfx: 0.5 });
  assert.equal(engine.state, 'closed', 'teardown with no ctx -> closed');
  engine.teardown();
  engine.teardown();
  engine.ensure();
  engine.ensure();
  engine.suspend();
  engine.suspend();
  engine.resume();
  engine.teardown();
  engine.resume(); // torn down: no-op
  assert.equal(engine.state, 'closed');
});

// -- sfx ------------------------------------------------------------------

test('one-shots create nodes and pan when running', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.setLevels({ sfx: 0.8, music: 0.4 });
  const ctx = made[0];
  const before = ctx.sources.length;
  clack(engine, { speed: 2, pan: 0.5 });
  thump(engine, { speed: 1, pan: -0.5 });
  pocketDrop(engine, { pan: 0 });
  cueStrike(engine, { power: 0.7 });
  assert.ok(ctx.sources.length > before, 'shots create sources');
  const filters = ctx.filters;
  assert.ok(filters.some((f) => f.type === 'bandpass'), 'bandpass in clack');
  assert.ok(filters.some((f) => f.type === 'lowpass'), 'lowpass in thump');
  assert.ok(filters.some((f) => f.type === 'highpass'), 'highpass in cueStrike');
});

test('one-shot onended disconnects its branch nodes', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  const ctx = made[0];
  const before = ctx.sources.length;
  clack(engine, { speed: 1 });
  const shotSources = ctx.sources.slice(before);
  assert.ok(shotSources.length >= 1);
  for (const s of shotSources) {
    assert.equal(typeof s.onended, 'function', 'onended wired');
    s.onended();
    assert.equal(s.disconnected, true, 'source disconnected on end');
  }
});

test('uiTap only requires running; plays even at sfx 0', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.setLevels({ sfx: 0 }); // ok() false, but running
  const ctx = made[0];
  const before = ctx.oscs.length;
  uiTap(engine);
  assert.equal(ctx.oscs.length, before + 1, 'uiTap plays while running');
  engine.suspend();
  uiTap(engine); // suspended: no-op, no throw
});

test('shots never throw on degenerate input', () => {
  const { engine } = makeEngine();
  engine.ensure();
  clack(engine);
  clack(engine, { speed: 'fast', pan: Infinity });
  clack(engine, null);
  thump(engine, {});
  pocketDrop(engine);
  cueStrike(engine, { power: -3 });
  uiTap(engine);
  assert.ok(true, 'no throw');
});

// -- lifecycle -------------------------------------------------------------

test('lifecycle: hidden -> suspend, visible -> resume, pagehide -> teardown', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  const target = new FakeTarget();
  const uninstall = installLifecycle(engine, target);

  target.hidden = true;
  target.dispatch('visibilitychange');
  assert.equal(made[0].suspendCalls, 1, 'hidden suspends');
  assert.equal(engine.state, 'suspended');

  target.hidden = false;
  target.dispatch('visibilitychange');
  assert.equal(made[0].resumeCalls, 1, 'visible resumes');
  assert.equal(engine.state, 'running');

  target.dispatch('pagehide');
  assert.equal(made[0].closeCalls, 1, 'pagehide closes context');
  assert.equal(engine.state, 'closed');
  uninstall();
});

test('lifecycle: no resume on visible if audio was not running at hide', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.suspend(); // suspended before the page hid
  const target = new FakeTarget();
  const uninstall = installLifecycle(engine, target);
  target.hidden = true;
  target.dispatch('visibilitychange');
  target.hidden = false;
  target.dispatch('visibilitychange');
  assert.equal(made[0].resumeCalls, 0, 'no resume when not running at hide');
  uninstall();
});

test('lifecycle: pageshow persisted with closed engine is a no-op', () => {
  const { engine, made } = makeEngine();
  engine.ensure();
  engine.teardown();
  const target = new FakeTarget();
  const uninstall = installLifecycle(engine, target);
  target.dispatch('pageshow', { persisted: true });
  assert.equal(made.length, 1, 'no fresh context grabbed on pageshow');
  assert.equal(engine.state, 'closed');
  assert.equal(engine.ensure(), true, 'restarts on next gesture ensure()');
  assert.equal(made.length, 2);
  uninstall();
});

test('lifecycle: uninstall removes all listeners', () => {
  const { engine } = makeEngine();
  const target = new FakeTarget();
  const uninstall = installLifecycle(engine, target);
  assert.ok(target.listenerCount('visibilitychange') === 1);
  assert.ok(target.listenerCount('pagehide') === 1);
  assert.ok(target.listenerCount('pageshow') === 1);
  uninstall();
  assert.equal(target.listenerCount('visibilitychange'), 0);
  assert.equal(target.listenerCount('pagehide'), 0);
  assert.equal(target.listenerCount('pageshow'), 0);
  assert.deepEqual(
    target.removed.sort(),
    ['pagehide', 'pageshow', 'visibilitychange'].sort(),
    'removed counts per type',
  );
  uninstall(); // idempotent
  assert.ok(true, 'no throw');
});

test('lifecycle: full probe sequence via dispatched fake events', () => {
  const { engine, made } = makeEngine();
  const target = new FakeTarget();
  installLifecycle(engine, target);
  // "click to init": gesture ensure.
  assert.equal(engine.ensure(), true);
  assert.equal(engine.state, 'running');
  // hidden: suspended + master gain 0.
  target.hidden = true;
  target.dispatch('visibilitychange');
  assert.equal(engine.state, 'suspended');
  const master = [...made[0].destination.inputs][0];
  assert.equal(master.gain.value, 0);
  // pagehide: closed, tone stopped.
  target.dispatch('pagehide');
  assert.equal(made[0].closeCalls, 1);
  assert.equal(engine.state, 'closed');
  assert.ok(made[0].sources.every((s) => !s.loop || s.stopped));
});

test('lifecycle with no target is a harmless no-op', () => {
  const { engine } = makeEngine();
  const uninstall = installLifecycle(engine, null);
  assert.equal(typeof uninstall, 'function');
  uninstall();
});
