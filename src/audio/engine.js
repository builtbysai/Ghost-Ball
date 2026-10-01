// Audio engine with a hard lifecycle (DESIGN.md section 7):
//   - AudioContext created ONLY inside ensure(), called from a gesture.
//   - suspend() on hidden; teardown() closes the context and disconnects
//     every node; nothing survives the page.
// CONTRACT (locked): class AudioEngine:
//   constructor({ createContext }?)  // injectable for tests
//   ensure() -> bool  (creates ctx + graph on first gesture; resumes)
//   get state()  'closed' | 'running' | 'suspended' | 'none'
//   setLevels({ sfx, music, muted })
//   suspend(), resume(), teardown()
//   bus(name) -> GainNode|null ('sfx' | 'music')
//   ok() -> bool (running and not muted)
//
// Internal state machine:
//   'none' (no ctx yet) -> ensure() builds ctx + graph -> ctx.state
//   ('running' | 'suspended') -> teardown() -> 'closed'.
//   ensure() after teardown builds a FRESH context, so a page re-shown
//   from the bfcache can start audio again on the next gesture.
//
// Graph: master -> destination; 'sfx' bus -> master; 'music' bus ->
// master. A simple "room" (two feedback delays at low wet) hangs off
// the sfx bus. The ambient room tone is a looping noise source through
// a lowpass into the music bus, started in ensure() and stopped in
// teardown() -- a node, never a timer, so nothing survives teardown.
// The noise buffer is synthesized from a seeded LCG (no Math.random),
// so the engine is deterministic and safe to build in tests.
//
// No method ever throws: autoplay-policy rejections and partial
// graph failures are swallowed so audio can never break game code.

const clamp01 = (v, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
};

// Set an AudioParam without assuming the full scheduling API exists
// (real contexts have it; minimal fakes may only carry .value).
function setParam(param, value, ctx, tau = 0.02) {
  if (!param) return;
  try {
    if (ctx && typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(value, ctx.currentTime || 0, tau);
    } else {
      param.value = value;
    }
  } catch { /* never throw into game code */ }
}

// Ramp an AudioParam to a value quickly, degrading to a plain set.
function rampParam(param, value, ctx, seconds = 0.05) {
  if (!param) return;
  try {
    const now = ctx ? (ctx.currentTime || 0) : 0;
    if (typeof param.setValueAtTime === 'function' &&
        typeof param.linearRampToValueAtTime === 'function') {
      param.setValueAtTime(
        typeof param.value === 'number' ? param.value : value, now);
      param.linearRampToValueAtTime(value, now + seconds);
    } else if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(value, now, seconds / 3);
    } else {
      param.value = value;
    }
  } catch { /* never throw into game code */ }
}

// Call a promise-returning context method, swallowing rejections
// (autoplay policy must leave audio off, never crash the game).
function swallow(result) {
  try {
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch { /* ignore */ }
}

function defaultCreateContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  return new AC();
}

export class AudioEngine {
  constructor({ createContext } = {}) {
    this._createContext = typeof createContext === 'function'
      ? createContext
      : defaultCreateContext;
    this._ctx = null;          // AudioContext|null
    this._closed = false;      // true after teardown(), until next ensure()
    this._master = null;       // GainNode -> destination
    this._buses = { sfx: null, music: null };
    this._delays = [];         // [{ delay, feedback, wet }]
    this._tone = null;         // { source, filter } ambient room tone
    this._noiseBuffer = null;  // 1.5s seeded white noise
    this._levels = { sfx: 1, music: 1, muted: false };
    // Maintained by lifecycle.js: was audio running when the page hid?
    this.wasRunning = false;
  }

  // Current context, or null before ensure()/after teardown(). Exposed
  // so sfx.js can create nodes; not part of the locked method contract.
  get ctx() { return this._ctx; }

  // Shared 1.5s noise buffer (seeded LCG), or null before ensure().
  get noiseBuffer() { return this._noiseBuffer; }

  get state() {
    if (!this._ctx) return this._closed ? 'closed' : 'none';
    const s = this._ctx.state;
    return (s === 'running' || s === 'suspended' || s === 'closed')
      ? s
      : 'none';
  }

  // True only when sound can actually be heard: context running,
  // not muted, and the effects level is above zero. play() gates on
  // this, so mute is a hard no-op rather than a silent node.
  ok() {
    try {
      return this.state === 'running' &&
        !this._levels.muted &&
        this._levels.sfx > 0;
    } catch { return false; }
  }

  bus(name) {
    if (name === 'sfx' || name === 'music') return this._buses[name];
    return null;
  }

  // Create the context + graph on first call (invoke from a user
  // gesture); later calls reuse it, resuming if suspended. Returns
  // true when a live (non-closed) context exists after the call.
  ensure() {
    try {
      if (this._ctx && this._ctx.state !== 'closed') {
        if (this._ctx.state === 'suspended') this.resume();
        return true;
      }
      if (this._ctx) this._dropGraph(); // stale closed ctx: rebuild fresh
      const ctx = this._createContext();
      if (!ctx) return false;
      this._ctx = ctx;
      this._closed = false;
      this._buildGraph(ctx);
      this._applyLevels();
      if (ctx.state === 'suspended') this.resume();
      return true;
    } catch {
      // Graph construction failed halfway: leave no partial state.
      const failedCtx = this._ctx;
      try { this._dropGraph(); } catch { /* ignore */ }
      if (failedCtx) {
        try { swallow(failedCtx.close()); } catch { /* ignore */ }
      }
      this._closed = false; // stay 'none' so a later gesture can retry
      return false;
    }
  }

  setLevels({ sfx, music, muted } = {}) {
    if (sfx !== undefined) this._levels.sfx = clamp01(sfx, this._levels.sfx);
    if (music !== undefined) {
      this._levels.music = clamp01(music, this._levels.music);
    }
    if (muted !== undefined) this._levels.muted = !!muted;
    this._applyLevels();
  }

  // Ramp master to zero, then suspend. Safe in any state.
  suspend() {
    const ctx = this._ctx;
    if (!ctx || this._closed || ctx.state === 'closed') return;
    rampParam(this._master && this._master.gain, 0, ctx, 0.05);
    try { swallow(ctx.suspend()); } catch { /* ignore */ }
  }

  // Resume only a suspended, non-torn-down context. A rejected
  // resume() (autoplay policy) leaves audio off and never throws.
  resume() {
    const ctx = this._ctx;
    if (!ctx || this._closed) return;
    if (ctx.state !== 'suspended') return;
    // Restore master/bus levels the suspend() ramp zeroed.
    this._applyLevels();
    try { swallow(ctx.resume()); } catch { /* ignore */ }
  }

  // Stop every started source, disconnect the whole graph, and close
  // the context. Nothing can outlive the page after this call.
  teardown() {
    const ctx = this._ctx;
    // Stop the ambient tone loop (the only persistent source).
    if (this._tone) {
      try { this._tone.source.stop(); } catch { /* ignore */ }
      try { this._tone.source.disconnect(); } catch { /* ignore */ }
      try { this._tone.filter.disconnect(); } catch { /* ignore */ }
      this._tone = null;
    }
    for (const d of this._delays) {
      try { d.delay.disconnect(); } catch { /* ignore */ }
      try { d.feedback.disconnect(); } catch { /* ignore */ }
      try { d.wet.disconnect(); } catch { /* ignore */ }
    }
    this._delays = [];
    for (const name of ['sfx', 'music']) {
      try {
        if (this._buses[name]) this._buses[name].disconnect();
      } catch { /* ignore */ }
      this._buses[name] = null;
    }
    try { if (this._master) this._master.disconnect(); } catch { /* ignore */ }
    this._master = null;
    this._noiseBuffer = null;
    this._ctx = null;
    this._closed = true;
    this.wasRunning = false;
    if (ctx) {
      try { swallow(ctx.close()); } catch { /* ignore */ }
    }
  }

  // -- internals -------------------------------------------------------

  _buildGraph(ctx) {
    this._noiseBuffer = this._makeNoiseBuffer(ctx);

    this._master = ctx.createGain();
    this._master.connect(ctx.destination);

    this._buses.sfx = ctx.createGain();
    this._buses.sfx.connect(this._master);
    this._buses.music = ctx.createGain();
    this._buses.music.connect(this._master);

    // Simple room: two feedback delays tapped off the sfx bus,
    // wet returns into the sfx bus at low level.
    this._delays = [0.07, 0.113].map((seconds) => {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = seconds;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.25;
      const wet = ctx.createGain();
      wet.gain.value = 0.07;
      this._buses.sfx.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(this._buses.sfx);
      return { delay, feedback, wet };
    });

    // Ambient room tone: looping noise -> lowpass -> music bus.
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    source.connect(filter);
    filter.connect(this._buses.music);
    source.start();
    this._tone = { source, filter };
  }

  _makeNoiseBuffer(ctx) {
    const seconds = 1.5;
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Seeded LCG (Numerical Recipes constants): deterministic fill,
    // no Math.random anywhere in the audio path.
    let seed = 0x2f6e2b1d;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  _applyLevels() {
    const ctx = this._ctx;
    if (!ctx) return;
    const { sfx, music, muted } = this._levels;
    // Mute is a hard gate at the master. suspend() separately ramps
    // the master to zero; resume() re-applies these levels first.
    setParam(this._master && this._master.gain, muted ? 0 : 1, ctx);
    setParam(this._buses.sfx && this._buses.sfx.gain, sfx, ctx);
    setParam(this._buses.music && this._buses.music.gain, music, ctx);
  }

  // Forget graph node references without touching the context
  // (used when a stale closed context is replaced by a fresh one).
  _dropGraph() {
    this._tone = null;
    this._delays = [];
    this._buses = { sfx: null, music: null };
    this._master = null;
    this._noiseBuffer = null;
    this._ctx = null;
  }
}
