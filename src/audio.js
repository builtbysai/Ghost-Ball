// Procedural pool audio. No samples: every sound is synthesized from noise and
// short decaying partials, shaped by impact speed, so a soft tap and a break
// sound like different events rather than the same clip at two volumes.

export class PoolAudio {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.masterMuted = false;
    this.room = null;
    this.rollGain = null;
    this.noiseBuf = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    // a short synthetic room: two feedback taps give the balls some air
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    this.verb = ctx.createGain(); this.verb.gain.value = 0.2;
    const d1 = ctx.createDelay(1), d2 = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    d1.delayTime.value = 0.031; d2.delayTime.value = 0.047; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.verb.connect(d1); this.verb.connect(d2); d1.connect(lp); d2.connect(lp); lp.connect(fb); fb.connect(d1); fb.connect(d2);
    lp.connect(this.sfx);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; ch[i] = (seed / 4294967296) * 2 - 1; }
    // continuous ball-on-cloth rumble
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 0.7;
    this.rollGain = ctx.createGain(); this.rollGain.gain.value = 0;
    src.connect(bp); bp.connect(this.rollGain); this.rollGain.connect(this.sfx); src.start();
    // hall room tone: a whisper of filtered noise that gives each place its own air
    const tsrc = ctx.createBufferSource(); tsrc.buffer = this.noiseBuf; tsrc.loop = true;
    this.toneFilter = ctx.createBiquadFilter(); this.toneFilter.type = 'lowpass'; this.toneFilter.frequency.value = 380; this.toneFilter.Q.value = 0.4;
    this.toneGain = ctx.createGain(); this.toneGain.gain.value = 0.018;
    tsrc.connect(this.toneFilter); this.toneFilter.connect(this.toneGain); this.toneGain.connect(this.music); tsrc.start();
    this.applyMix();
  }

  setRoom(room) {
    this.room = room;
    if (this.verb) this.verb.gain.value = room?.sound?.room ?? 0.2;
    if (this.toneFilter) this.toneFilter.frequency.setTargetAtTime(room?.sound?.tone ?? 380, this.ctx.currentTime, 0.4);
  }

  applyMix() {
    if (!this.ctx) return;
    this.master.gain.value = this.masterMuted ? 0 : 0.9;
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.music.gain.value = this.musicOn ? 0.5 : 0;
  }
  setSfx(on) { this.sfxOn = on; this.applyMix(); }
  setMusic(on) { this.musicOn = on; this.applyMix(); if (on) this.startMusic(); else this.stopMusic(); }
  setMasterMuted(m) { this.masterMuted = m; this.applyMix(); }

  get t() { return this.ctx.currentTime; }
  ok() { return this.ctx && this.ctx.state === 'running' && this.sfxOn; }

  noise(dur, ftype, freq, q, gain, when = 0, pan = 0, sendVerb = 0.3) {
    const ctx = this.ctx, t0 = this.t + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(f); f.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfx); const v = ctx.createGain(); v.gain.value = sendVerb; p.connect(v); v.connect(this.verb); }
    else g.connect(this.sfx);
    s.start(t0, Math.random() * 0.5, dur + 0.05);
  }

  tone(freq, dur, gain, when = 0, type = 'sine', pan = 0, sendVerb = 0.3, endFreq = null) {
    const ctx = this.ctx, t0 = this.t + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfx); const v = ctx.createGain(); v.gain.value = sendVerb; p.connect(v); v.connect(this.verb); }
    else g.connect(this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ---- game sounds --------------------------------------------------------
  ballHit(speed, pan = 0) {
    if (!this.ok()) return;
    const a = Math.min(1, Math.pow(speed / 4.2, 0.65)) * 0.85 + 0.05;
    const bright = this.room?.sound?.bright ?? 1;
    const f = (2300 + Math.random() * 500) * bright;
    this.noise(0.012, 'highpass', 3500, 0.7, a * 0.9, 0, pan);
    this.tone(f, 0.05 + a * 0.05, a * 0.32, 0, 'sine', pan);
    this.tone(f * 1.51, 0.03, a * 0.12, 0, 'sine', pan);
    this.tone(210 + Math.random() * 30, 0.035, a * 0.5, 0, 'sine', pan, 0.1);
  }

  cushion(speed, pan = 0) {
    if (!this.ok()) return;
    const a = Math.min(1, speed / 4.5) * 0.8 + 0.05;
    this.noise(0.09, 'lowpass', 700, 0.5, a * 0.9, 0, pan);
    this.tone(120, 0.11, a * 0.7, 0, 'sine', pan, 0.15, 70);
    this.noise(0.008, 'highpass', 2500, 0.7, a * 0.25, 0, pan);
  }

  cue(power) {
    if (!this.ok()) return;
    const a = 0.25 + power * 0.75;
    this.noise(0.006, 'highpass', 4200, 0.8, a * 0.7);
    this.tone(1650, 0.025, a * 0.25);
    this.tone(150, 0.06, a * 0.5, 0, 'sine', 0, 0.1, 90);
  }

  pocket(speed, pan = 0) {
    if (!this.ok()) return;
    const a = Math.min(1, speed / 3) * 0.5 + 0.3;
    this.tone(95, 0.16, a * 0.7, 0, 'sine', pan, 0.2, 55);
    this.noise(0.11, 'lowpass', 500, 0.6, a * 0.55, 0, pan);
    // the ball rattling down the return rail
    for (let i = 0; i < 4; i++) this.noise(0.02, 'bandpass', 900 + i * 90, 3, 0.18 - i * 0.03, 0.14 + i * 0.09 + Math.random() * 0.02, pan * 0.5, 0.1);
    this.noise(0.5, 'bandpass', 380, 1, 0.13, 0.25, pan * 0.5, 0.05);
  }

  chalk() {
    if (!this.ok()) return;
    this.noise(0.16, 'highpass', 3800, 0.9, 0.14);
    this.noise(0.09, 'bandpass', 5200, 1.5, 0.08, 0.05);
  }

  foul() {
    if (!this.ok()) return;
    this.tone(196, 0.32, 0.3, 0, 'triangle', 0, 0.2);
    this.tone(155.6, 0.42, 0.3, 0.13, 'triangle', 0, 0.2);
  }


  // ---- interface and reward sounds -------------------------------------------
  /** A bell-like callout chime. `step` walks up the hall's scale for bigger moments. */
  chime(step = 0) {
    if (!this.ok()) return;
    const snd = this.room?.sound || { root: 196, scale: [0, 2, 4, 7, 9] };
    const f = snd.root * 4 * Math.pow(2, snd.scale[Math.min(step, snd.scale.length - 1)] / 12);
    this.tone(f, 0.7, 0.18, 0, 'sine', 0, 0.6);
    this.tone(f * 2.76, 0.4, 0.06, 0, 'sine', 0, 0.6);
    this.tone(f * 1.5, 0.5, 0.08, 0.06, 'triangle', 0, 0.5);
  }
  star(i = 0) {
    if (!this.ok()) return;
    const f = 660 * Math.pow(2, [0, 4, 7][i] / 12);
    this.tone(f, 0.5, 0.22, 0, 'triangle', 0, 0.5);
    this.tone(f * 2, 0.35, 0.08, 0, 'sine', 0, 0.5);
  }
  swoosh() {
    if (!this.ok()) return;
    this.noise(0.22, 'bandpass', 900, 0.8, 0.1, 0, 0, 0.1);
    this.noise(0.16, 'highpass', 3000, 0.7, 0.05, 0.03, 0, 0.1);
  }
  xpTick(k = 0) { if (this.ok()) this.tone(900 + k * 500, 0.04, 0.08); }
  levelUp() {
    if (!this.ok()) return;
    const root = this.room?.sound?.root ?? 196;
    [0, 4, 7, 12, 16, 19].forEach((st, i) => this.tone(root * 2 * Math.pow(2, st / 12), 0.7, 0.2, i * 0.08, 'triangle', 0, 0.55));
  }

  /** The swish of the cue through the air: brighter and louder the harder the stroke. */
  stroke(power) {
    if (!this.ok()) return;
    const a = 0.05 + power * 0.22;
    this.noise(0.05 + (1 - power) * 0.05, 'bandpass', 1200 + power * 2600, 1.2, a);
    this.noise(0.09, 'highpass', 2500, 0.7, a * 0.4, 0.01);
  }

  land(speed) {
    if (!this.ok()) return;
    const a = Math.min(1, speed / 1.6) * 0.6 + 0.15;
    this.tone(150, 0.07, a * 0.5, 0, 'sine', 0, 0.15, 90);
    this.noise(0.04, 'lowpass', 900, 0.6, a * 0.5);
  }

  place() { if (this.ok()) { this.tone(880, 0.05, 0.12); this.noise(0.02, 'highpass', 3000, 1, 0.25); } }
  tick() { if (this.ok()) this.tone(1200, 0.03, 0.1); }
  select() { if (this.ok()) { this.tone(660, 0.07, 0.12); this.tone(990, 0.09, 0.09, 0.05); } }

  win() {
    if (!this.ok()) return;
    const root = this.room?.sound?.root ?? 196;
    [0, 4, 7, 12, 16].forEach((st, i) => this.tone(root * 2 * Math.pow(2, st / 12), 0.9, 0.22, i * 0.11, 'triangle', 0, 0.5));
  }

  /** Called every frame with the total speed of moving balls. */
  roll(total) {
    if (!this.rollGain) return;
    const target = this.sfxOn ? Math.min(0.11, total * 0.018) : 0;
    this.rollGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
  }

  // ---- ambience -----------------------------------------------------------
  // Slow generative bed: a soft pad chord and sparse plucks in the room's scale.
  startMusic() {
    if (!this.ctx || !this.musicOn || this.musicTimer) return;
    const tick = () => {
      if (!this.ctx || !this.musicOn) { this.musicTimer = null; return; }
      if (this.ctx.state === 'running') this.musicNote();
      this.musicTimer = setTimeout(tick, 1900 + Math.random() * 1600);
    };
    this.musicTimer = setTimeout(tick, 600);
  }
  stopMusic() { if (this.musicTimer) clearTimeout(this.musicTimer); this.musicTimer = null; }

  musicNote() {
    const snd = this.room?.sound || { root: 196, scale: [0, 2, 4, 7, 9] };
    const ctx = this.ctx, t0 = ctx.currentTime;
    const deg = snd.scale[Math.floor(Math.random() * snd.scale.length)];
    const oct = Math.random() < 0.35 ? 2 : 1;
    const f = snd.root * oct * Math.pow(2, deg / 12);
    const voice = (freq, dur, gain, type) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      o.connect(g); g.connect(lp); lp.connect(this.music);
      const v = ctx.createGain(); v.gain.value = 0.6; lp.connect(v); v.connect(this.verb);
      o.start(t0); o.stop(t0 + dur + 0.1);
    };
    voice(f, 3.2, 0.05, 'triangle');
    voice(f * 2.005, 2.0, 0.018, 'sine');
    if (this.musicStep++ % 4 === 0) { // now and then, a low pad underneath
      voice(snd.root * 0.5, 7, 0.05, 'sine');
      voice(snd.root * 0.5 * Math.pow(2, snd.scale[2] / 12), 7, 0.035, 'sine');
    }
  }
}
