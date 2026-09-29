// Online protocol. Transport-agnostic: a transport is any object with
// `send(obj)`, `close()`, and callbacks `onmessage(obj)`, `onpeer()`, `onleave()`.
// Everything that arrives is untrusted, so every message is validated and
// clamped before the game sees it. Only the shooter's plan and a few cosmetics
// cross the wire; results are recomputed locally and checked against the host's
// snapshot (see sync.js).

export const PROTO = 1;
export const EMOTES = ['Nice shot!', 'Good game', 'Unlucky', 'Rematch?', 'Hurry up', 'Thanks'];

const JUMPS = [0, 0.28, 0.4, 0.52], MASSES = [0, 0.9, 1.1, 1.3];
const KINDS = ['eight', 'nine', 'straight', 'onepocket'];
const HALLS = ['parlor', 'hall61', 'stage', 'lastcall', 'rooftop'];
const POCKETS = ['forgiving', 'standard', 'tournament'];
const CLOTHS = ['fast', 'standard', 'slow'];

const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const nearest = (v, list) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);
const name = (s) => String(s ?? '').replace(/[^\p{L}\p{N} _\-.'!]/gu, '').trim().slice(0, 16) || 'Player';

export function cleanPlan(p) {
  if (!p || typeof p !== 'object') return null;
  let a = num(p.a, -0.5, 0.5), b = num(p.b, -0.5, 0.5);
  const m = Math.hypot(a, b);
  if (m > 0.5) { a *= 0.5 / m; b *= 0.5 / m; }
  return {
    angle: num(p.angle, -20, 20),
    speed: num(p.speed, 0.35, 9.5, 1),
    a, b,
    jump: nearest(num(p.jump, 0, 1), JUMPS),
    masse: nearest(num(p.masse, 0, 2), MASSES),
    called: Number.isInteger(p.called) ? Math.max(-1, Math.min(5, p.called)) : null,
  };
}

function cleanSnap(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.balls) || s.balls.length > 20 || !s.rules || typeof s.rules !== 'object') return null;
  const balls = [];
  for (const b of s.balls) {
    if (!b || !Number.isInteger(b.id) || b.id < 0 || b.id > 15) return null;
    balls.push({ id: b.id, x: num(b.x, -1.4, 1.4), y: num(b.y, -0.8, 0.8), pocketed: !!b.pocketed });
  }
  return { balls, rules: s.rules, stats: Array.isArray(s.stats) ? s.stats : [], shots: num(s.shots, 0, 9999) };
}

function cleanCfg(c) {
  if (!c || typeof c !== 'object') return null;
  if (!KINDS.includes(c.kind) || !HALLS.includes(c.hall)) return null;
  return {
    kind: c.kind, hall: c.hall,
    seed: Math.floor(num(c.seed, 1, 2 ** 31 - 1, 1)),
    pocket: POCKETS.includes(c.pocket) ? c.pocket : 'standard',
    cloth: CLOTHS.includes(c.cloth) ? c.cloth : 'standard',
    breaker: c.breaker === 1 ? 1 : 0,
    clock: [0, 30, 60].includes(c.clock) ? c.clock : 0,
    names: [name(c.names && c.names[0]), name(c.names && c.names[1])],
  };
}

/** Validate one inbound message. Returns a cleaned copy, or null to drop it. */
export function sanitize(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return null;
  switch (msg.t) {
    case 'hello': return { t: 'hello', v: Math.floor(num(msg.v, 0, 99)), name: name(msg.name) };
    case 'start': { const cfg = cleanCfg(msg.cfg); return cfg ? { t: 'start', cfg } : null; }
    case 'resume': { const cfg = cleanCfg(msg.cfg), snap = cleanSnap(msg.snap); return cfg && snap ? { t: 'resume', cfg, snap, n: num(msg.n, 0, 9999) } : null; }
    case 'aim': return { t: 'aim', ang: num(msg.ang, -20, 20), pw: num(msg.pw, 0, 1), sa: num(msg.sa, -0.5, 0.5), sb: num(msg.sb, -0.5, 0.5), el: Math.floor(num(msg.el, 0, 6)), c: Number.isInteger(msg.c) ? msg.c : null };
    case 'place': return { t: 'place', x: num(msg.x, -1.3, 1.3), y: num(msg.y, -0.7, 0.7) };
    case 'placed': return { t: 'placed', x: num(msg.x, -1.3, 1.3), y: num(msg.y, -0.7, 0.7) };
    case 'shot': { const plan = cleanPlan(msg.plan); return plan ? { t: 'shot', n: Math.floor(num(msg.n, 0, 9999)), plan } : null; }
    case 'sync': { const snap = cleanSnap(msg.snap); return snap ? { t: 'sync', n: Math.floor(num(msg.n, 0, 9999)), snap } : null; }
    case 'emote': return { t: 'emote', id: Math.floor(num(msg.id, 0, EMOTES.length - 1)) };
    case 'timeout': return { t: 'timeout', n: Math.floor(num(msg.n, 0, 9999)) };
    case 'rematch': case 'resign': case 'bye': return { t: msg.t };
    case 'ping': case 'pong': return { t: msg.t, id: Math.floor(num(msg.id, 0, 1e9)), ts: num(msg.ts, 0, 1e15) };
    default: return null;
  }
}

/** One end of a connection. */
export class OnlineLink {
  constructor(transport, { role, name: myName = 'Player', now = () => Date.now(), maxPerSecond = 120 } = {}) {
    this.tr = transport;
    this.role = role;                       // 'host' | 'guest'
    this.name = name(myName);
    this.peerName = 'Player';
    this.on = {};                           // handlers by message type, plus peerJoin / peerLeave / rtt
    this.now = now;
    this.rtt = -1;
    this.connected = false;
    this.maxPerSecond = maxPerSecond;
    this.bucket = { t: 0, n: 0 };
    this.pingId = 0;
    transport.onmessage = (m) => this.receive(m);
    transport.onpeer = () => { this.connected = true; this.send({ t: 'hello', v: PROTO, name: this.name }); this.emit('peerJoin'); };
    transport.onleave = () => { this.connected = false; this.emit('peerLeave'); };
  }

  emit(type, msg) { const h = this.on[type]; if (h) h(msg, this); }

  send(msg) { try { this.tr.send(msg); } catch { /* the link is down; the leave handler reports it */ } }

  receive(raw) {
    const t = this.now();
    if (t - this.bucket.t > 1000) this.bucket = { t, n: 0 };
    if (++this.bucket.n > this.maxPerSecond) return;              // a flood is dropped, not processed
    const msg = sanitize(raw);
    if (!msg) return;
    if (msg.t === 'hello') { this.peerName = msg.name; this.connected = true; }
    if (msg.t === 'ping') { this.send({ t: 'pong', id: msg.id, ts: msg.ts }); return; }
    if (msg.t === 'pong') { this.rtt = Math.max(0, this.now() - msg.ts); this.emit('rtt', this.rtt); return; }
    this.emit(msg.t, msg);
  }

  ping() { this.send({ t: 'ping', id: ++this.pingId, ts: this.now() }); }
  close() { try { this.send({ t: 'bye' }); this.tr.close(); } catch { /* already closed */ } }
}

/** Two linked in-memory transports for tests. Delivery is asynchronous, like a real network. */
export function loopbackPair() {
  const mk = () => ({ onmessage: null, onpeer: null, onleave: null, other: null, closed: false });
  const a = mk(), b = mk();
  a.other = b; b.other = a;
  for (const t of [a, b]) {
    t.send = (obj) => { const copy = JSON.parse(JSON.stringify(obj)); queueMicrotask(() => { if (!t.other.closed && t.other.onmessage) t.other.onmessage(copy); }); };
    t.close = () => { t.closed = true; queueMicrotask(() => { if (t.other.onleave) t.other.onleave(); }); };
  }
  const connect = () => { queueMicrotask(() => { if (a.onpeer) a.onpeer(); if (b.onpeer) b.onpeer(); }); };
  return { a, b, connect };
}

/** Punishment for running out the shot clock: the turn passes and the opponent gets ball in hand. */
export function applyTimeout(rules) {
  const r = { ...rules, groups: rules.groups.slice(), fouls: rules.fouls.slice(), score: rules.score.slice(), consec: (rules.consec || [0, 0]).slice() };
  const me = r.turn;
  r.fouls[me]++;
  r.turn = 1 - me;
  r.ballInHand = true;
  r.kitchen = false;
  if (r.kind === 'straight') r.score[me] -= 1;
  return r;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';     // no 0/O, 1/I/L
export function newCode(rand = Math.random) {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return c;
}
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const validCode = (s) => cleanCode(s).length === 6 && [...cleanCode(s)].every((ch) => CODE_ALPHABET.includes(ch));
