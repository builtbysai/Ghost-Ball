// Synthesized pool sounds, driven by sim events. No samples.
// CONTRACT (locked): functions take (engine, opts):
//   clack(engine, { speed, pan })   ball-ball tick, pitch from impact speed
//   thump(engine, { speed, pan })   cushion
//   pocketDrop(engine, { pan })     pocket drop + rattle
//   cueStrike(engine, { power })    cue tip tick
//   uiTap(engine)                   quiet UI tick
// All are no-ops when engine.ok() is false (muted / not running).
// uiTap is the one exception: it only requires the context to be
// running, so UI feedback survives even at zero effects volume.
//
// Every shot creates its nodes per call and disconnects them onended,
// so nothing lingers on the sfx bus. Everything is wrapped so a shot
// can never throw into game code.

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

function sfxReady(engine) {
  try {
    return !!(
      engine && typeof engine.ok === 'function' && engine.ok() &&
      engine.ctx && engine.noiseBuffer && engine.bus('sfx')
    );
  } catch { return false; }
}

function busCtx(engine) {
  try {
    const bus = engine.bus('sfx');
    return bus ? bus.context : null;
  } catch { return null; }
}

// Stereo pan when the context supports it; null means "connect raw".
function makePanner(ctx, pan) {
  const p = clamp(pan, -1, 1, 0);
  if (!p) return null;
  try {
    if (typeof ctx.createStereoPanner === 'function') {
      const node = ctx.createStereoPanner();
      node.pan.value = p;
      return node;
    }
  } catch { /* pan unavailable */ }
  return null;
}

function now(ctx) {
  try { return ctx.currentTime || 0; } catch { return 0; }
}

// Deterministic offset into the shared noise buffer so repeated
// shots do not start on the exact same phase.
function noiseOffset(ctx, salt) {
  try {
    const len = 1.5;
    return ((ctx.currentTime || 0) * 0.37 + salt) % (len * 0.6);
  } catch { return 0; }
}

function setAt(param, value, t) {
  if (!param) return;
  try {
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, t);
    else param.value = value;
  } catch { /* ignore */ }
}

function decayTo(param, t) {
  if (!param) return;
  try {
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(0.0001, t);
    }
  } catch { /* ignore */ }
}

// Build a noise branch against the shared noise buffer.
function connectNoise(engine, bus, { dur, type, freq, q = 1, gain = 0.5, pan = 0, at = 0, salt = 0 }) {
  const ctx = engine.ctx || busCtx(engine);
  const t0 = now(ctx) + at;
  const src = ctx.createBufferSource();
  src.buffer = engine.noiseBuffer;
  src.start(t0, noiseOffset(ctx, salt));
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  if (q && typeof filter.Q !== 'undefined') filter.Q.value = q;
  const amp = ctx.createGain();
  setAt(amp.gain, gain, t0);
  decayTo(amp.gain, t0 + dur);
  const panner = makePanner(ctx, pan);
  const nodes = [src, filter, amp];
  if (panner) nodes.push(panner);
  src.connect(filter);
  filter.connect(amp);
  if (panner) { amp.connect(panner); panner.connect(bus); }
  else { amp.connect(bus); }
  src.onended = () => {
    for (const n of nodes) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  };
  return src;
}

// A plain sine/triangle tick with an exponential decay envelope.
function oscTick(engine, bus, { freq, dur, gain = 0.5, type = 'sine', pan = 0, at = 0 }) {
  const ctx = engine.ctx || busCtx(engine);
  const t0 = now(ctx) + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const amp = ctx.createGain();
  setAt(amp.gain, gain, t0);
  decayTo(amp.gain, t0 + dur);
  const panner = makePanner(ctx, pan);
  const nodes = [osc, amp];
  if (panner) nodes.push(panner);
  osc.connect(amp);
  if (panner) { amp.connect(panner); panner.connect(bus); }
  else { amp.connect(bus); }
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  osc.onended = () => {
    for (const n of nodes) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  };
  return osc;
}

function safe(fn, engine, opts) {
  try { fn(engine, opts || {}); } catch { /* a shot never throws */ }
}

// Ball-ball impact: noise burst bandpassed 1800-3200Hz (30-60ms,
// brighter and longer for harder hits) plus a sine partial whose
// pitch tracks impact speed. Gain scales with speed (clamped).
export function clack(engine, opts = {}) {
  if (!sfxReady(engine)) return;
  safe((_e, o) => {
    const speed = clamp(o.speed, 0, 10, 0.5);
    const pan = clamp(o.pan, -1, 1, 0);
    const bus = _e.bus('sfx');
    const hard = clamp(speed / 3, 0, 1);
    const gain = 0.08 + 0.5 * clamp(speed, 0, 1);
    connectNoise(_e, bus, {
      dur: 0.03 + 0.03 * hard,
      type: 'bandpass',
      freq: 1800 + 1400 * hard,
      q: 1.2,
      gain,
      pan,
    });
    oscTick(_e, bus, {
      freq: 420 + speed * 60,
      dur: 0.07,
      gain: gain * 0.6,
      pan,
    });
  }, engine, opts);
}

// Cushion impact: lowpass noise at ~300Hz, 90ms.
export function thump(engine, opts = {}) {
  if (!sfxReady(engine)) return;
  safe((_e, o) => {
    const speed = clamp(o.speed, 0, 10, 0.5);
    const pan = clamp(o.pan, -1, 1, 0);
    const bus = _e.bus('sfx');
    connectNoise(_e, bus, {
      dur: 0.09,
      type: 'lowpass',
      freq: 300,
      gain: 0.1 + 0.5 * clamp(speed, 0, 1),
      pan,
    });
  }, engine, opts);
}

// Pocket: a thump, then three descending rattle ticks at
// 90/160/240ms with falling gain, plus a low 140Hz sine bloom.
export function pocketDrop(engine, opts = {}) {
  if (!sfxReady(engine)) return;
  safe((_e, o) => {
    const pan = clamp(o.pan, -1, 1, 0);
    const bus = _e.bus('sfx');
    connectNoise(_e, bus, {
      dur: 0.1, type: 'lowpass', freq: 280, gain: 0.45, pan,
    });
    const ticks = [
      { at: 0.09, gain: 0.28 },
      { at: 0.16, gain: 0.19 },
      { at: 0.24, gain: 0.12 },
    ];
    ticks.forEach((tick, i) => {
      connectNoise(_e, bus, {
        dur: 0.025, type: 'bandpass', freq: 1200, q: 2,
        gain: tick.gain, pan, at: tick.at, salt: i * 0.11,
      });
    });
    oscTick(_e, bus, { freq: 140, dur: 0.28, gain: 0.3, pan });
  }, engine, opts);
}

// Cue tip: a 12ms highpass click plus a tiny 900Hz tick.
export function cueStrike(engine, opts = {}) {
  if (!sfxReady(engine)) return;
  safe((_e, o) => {
    const power = clamp(o.power, 0, 1, 0.5);
    const pan = clamp(o.pan, -1, 1, 0);
    const bus = _e.bus('sfx');
    const gain = 0.05 + 0.35 * power;
    connectNoise(_e, bus, {
      dur: 0.012, type: 'highpass', freq: 2500, gain, pan,
    });
    oscTick(_e, bus, { freq: 900, dur: 0.03, gain: gain * 0.5, pan });
  }, engine, opts);
}

// Quiet UI tick: 1000Hz sine, 25ms. Only requires a running context.
export function uiTap(engine) {
  try {
    if (!engine || engine.state !== 'running') return;
    if (!engine.ctx || !engine.bus('sfx')) return;
    const bus = engine.bus('sfx');
    safe((_e) => {
      oscTick(_e, bus, { freq: 1000, dur: 0.025, gain: 0.06 });
    }, engine);
  } catch { /* never throw */ }
}
