// Ghost Ball: orchestration. Owns the session (quick match, Circuit rival,
// trick shot, daily run, practice), the real-time loop, input, the HUD, and
// the hooks that feed the juice, audio and progression layers.

import { Sim, R } from './physics.js';
import { HEAD_X, HALF_L, HALF_W, validCuePlacement, rng } from './table.js';
import { GAMES, legalTargets, mustCall8, groupOf, ONE_POCKET_OWNERS, ONE_POCKET_TARGET } from './rules.js';
import { newMatch, beginShot, endShot, placeCue, onTableIds, rerackKeepCue } from './game.js';
import { newBlitz, scoreShot, clearRack, multiplier, blitzXp, CLEAR_BONUS, CLEAR_TIME, SCRATCH_POINTS, SCRATCH_TIME } from './blitz.js';
import { planShot, planNow, LEVELS } from './ai.js';
import { HALLS, HALL_BY_ID } from './halls.js';
import { Renderer } from './render.js';
import { PoolAudio } from './audio.js';
import { Juice } from './juice.js';
import { colorOf } from './ballshader.js';
import { CUES, CHALKS, BALLSETS, byId } from './gear.js';
import { createProfile, localDateString, dailySeed, dailyScore } from './profile.js';
import { RIVALS, scoreMatch, winXp } from './circuit.js';
import { CHALLENGES, LESSONS, ALL_CHALLENGES, findChallenge, evaluate, stars as trickStars } from './challenges.js';
import { dailyLayout } from './daily.js';
import { checkAchievements } from './achievements.js';
import { Stroke, speedFromPower, powerFromSpeed } from './stroke.js';
import { PadInput, aimRate } from './gamepad.js';
import { createUI } from './ui.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SQUIRT = 0.045;
const isCoarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- storage, settings, profile
const safeStorage = {
  getItem(k) { try { return localStorage.getItem(k); } catch { return null; } },
  setItem(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  removeItem(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const DEFAULTS = { hall: 'parlor', kind: 'eight', opp: '1', assist: 'full', pocket: 'standard', cloth: 'standard', sound: 'on', music: 'on', shake: 'full', haptics: 'on', hand: 'right', stroke: 'med', stick: 'med' };
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(safeStorage.getItem('pool.settings2') || '{}') }; } catch { /* first run */ }
if (!HALL_BY_ID[settings.hall]) settings.hall = 'parlor';
const saveSettings = () => safeStorage.setItem('pool.settings2', JSON.stringify(settings));
const profile = createProfile(safeStorage);

// ---------------------------------------------------------------- core objects
const canvas = $('game');
const renderer = new Renderer(canvas);
const audio = new PoolAudio();
const juice = new Juice(renderer);
juice.setHost($('callouts'));

const S = {
  screen: 'menu', phase: 'menu', attract: true,
  match: null, mode: null, session: null,
  aim: { angle: 0 }, power: 0, spin: { a: 0, b: 0 }, jump: 0,
  drag: null, guide: null, guideDirty: true, guideT: 0,
  callSel: null, callAuto: null, autoCall: null,
  placeGhost: null, cueAnim: null, ai: null,
  evIdx: 0, time: 0, paused: false,
  lastShot: null, replay: null, replayEv: 0,
  shotCount: 0, keyPower: 0.5, breaker: 0,
  fineBase: null, doneTimer: 0,
  slowDone: false, decisive: [],
  trick: null, ended: false, blitz: null, blitzSec: -1,
  inputMode: 'mouse', drag: null, strip: null, padStroke: null, touchPt: null, padConnected: false,
};

const shakeScale = () => (reducedMotion() ? 0 : { off: 0, low: 0.45, full: 1 }[settings.shake] ?? 1);
const buzz = (p) => { if (settings.haptics === 'on' && navigator.vibrate && !S.attract && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate(p); } catch { /* unsupported */ } } };

// ---------------------------------------------------------------- hall and gear theming
function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function applyHall(id) {
  const hall = HALL_BY_ID[id] || HALLS[0];
  const r = document.documentElement.style;
  r.setProperty('--bg', hall.ui.bg); r.setProperty('--panel', hall.ui.panel); r.setProperty('--ink', hall.ui.ink);
  r.setProperty('--sub', hall.ui.sub); r.setProperty('--line', hall.ui.line); r.setProperty('--accent', hall.accent);
  r.setProperty('--panel2', `color-mix(in srgb, ${hall.ui.panel} 88%, #ffffff)`);
  r.setProperty('--accent-ink', lum(hall.accent) > 0.55 ? '#0a0d10' : '#ffffff');
  document.body.style.background = hall.ui.bg;
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.setAttribute('content', hall.ui.bg);
  renderer.setHall(hall);
  audio.setRoom(hall);
  S.hallId = hall.id;
}
function applyGear() {
  const eq = profile.data.equipped;
  renderer.setGear({ cue: byId(CUES, eq.cue), chalk: byId(CHALKS, eq.chalk).color });
  renderer.setBallSet(byId(BALLSETS, eq.ballset));
}

// ---------------------------------------------------------------- helpers over the match
const seatOf = () => S.mode.seats[S.match.rules.turn % S.mode.seats.length];
const humanTurn = () => !S.attract && S.mode && S.match && seatOf().human;
const onTable = () => onTableIds(S.match);
const kindName = () => (S.session && S.session.type === 'daily' ? 'Daily Run' : S.session && S.session.type === 'trick' ? 'Trick Shot' : GAMES[S.mode.kind].name);

function seatsFor(cfg) {
  if (cfg.type === 'trick' || cfg.type === 'daily' || cfg.type === 'practice' || cfg.type === 'blitz') return [{ human: true, name: 'You' }];
  if (cfg.type === 'circuit') return [{ human: true, name: 'You' }, { human: false, level: cfg.rival.level, name: cfg.rival.name }];
  if (cfg.opp === '2p') return [{ human: true, name: 'Player 1' }, { human: true, name: 'Player 2' }];
  if (cfg.opp === 'demo') return [{ human: false, level: LEVELS[2], name: LEVELS[2].name }, { human: false, level: LEVELS[1], name: LEVELS[1].name }];
  return [{ human: true, name: 'You' }, { human: false, level: LEVELS[+cfg.opp], name: LEVELS[+cfg.opp].name }];
}

// ---------------------------------------------------------------- sessions
function showPlayChrome(on) {
  ['hud'].forEach((id) => $(id).classList.toggle('hidden', !on));
  $('menuRoot').classList.toggle('hidden', on);
}

function startSession(cfg) {
  audio.init(); audio.startMusic();
  ui.closeSheet();
  S.attract = false; S.screen = 'play'; S.session = cfg; S.paused = false; S.ended = false;
  keepAwake();
  applyHall(cfg.hall);
  S.mode = { kind: cfg.kind, opp: cfg.opp, seats: seatsFor(cfg) };
  if (cfg.type === 'trick') S.trick = { ch: findChallenge(cfg.challenge), attempts: 1, hint: false };
  if (cfg.type === 'daily') S.dailySetup = dailyLayout(dailySeed(cfg.date));
  if (!cfg.rematch) S.breaker = 0; else S.breaker = 1 - S.breaker;
  showPlayChrome(true);
  renderer.setLayout({ menu: false });
  makeMatch();
  audio.chalk();
  audio.swoosh();
  maybePortraitHint();
}

function makeMatch() {
  const cfg = S.session;
  let setup = null;
  if (cfg.type === 'trick') setup = S.trick.ch.setup;
  if (cfg.type === 'daily') setup = S.dailySetup;
  const seats = S.mode.seats;
  S.match = newMatch({ kind: cfg.kind, seed: cfg.type === 'daily' ? dailySeed(cfg.date) : (Math.random() * 1e9) | 0, pocket: settings.pocket, cloth: settings.cloth, breaker: seats.length > 1 ? S.breaker % seats.length : 0, trackOrient: true, setup });
  renderer.setTable(S.match.table);
  juice.reset(); S.cueAnim = null; S.ai = null; S.callSel = null; S.callAuto = null; S.lastShot = null; S.replay = null;
  S.power = 0; S.spin = { a: 0, b: 0 }; S.shotCount = 0; S.slowDone = false; S.ended = false;
  S.blitz = cfg.type === 'blitz' ? newBlitz() : null; S.blitzSec = -1;
  setJump(0);
  updateSpinDot();
  $('btnRerack').classList.toggle('hidden', cfg.type !== 'practice');
  $('btnReplay').classList.add('hidden');
  $('btnHint').classList.add('hidden');
  buildTags();
  setAimTowardsTarget();
  nextPhase();
}

function startAttract() {
  S.attract = true; S.screen = 'menu'; S.session = null; S.paused = false; S.ended = false;
  const kind = Math.random() < 0.5 ? 'eight' : 'nine';
  const a = { ...LEVELS[2], think: 0.45 }, b = { ...LEVELS[1], think: 0.45 };
  S.mode = { kind, opp: 'demo', seats: [{ human: false, level: a, name: 'A' }, { human: false, level: b, name: 'B' }] };
  S.match = newMatch({ kind, seed: (Math.random() * 1e9) | 0, pocket: 'standard', trackOrient: true });
  renderer.setTable(S.match.table);
  juice.reset(); S.cueAnim = null; S.ai = null; S.spin = { a: 0, b: 0 }; S.power = 0;
  hideControls(); hint('');
  nextPhase();
}

function enterMenu(screen = 'home') {
  S.paused = false;
  showPlayChrome(false);
  ui.closeSheet();
  $('banner').classList.add('hidden');
  applyHall(settings.hall);
  renderer.setLayout({ menu: true });
  audio.roll(0);
  ui.show(screen);
  startAttract();
}

const challengeLabel = (ch) => (ch.lesson ? `Lesson ${LESSONS.indexOf(ch) + 1} of ${LESSONS.length}` : `Trick shot ${CHALLENGES.indexOf(ch) + 1}`);
const dailyHall = (date) => HALLS[dailySeed(date) % HALLS.length].id;

const actions = {
  startQuick: ({ kind, opp, hall }) => startSession({ type: 'quick', kind, opp, hall }),
  startRival: (idx) => { const r = RIVALS[idx]; startSession({ type: 'circuit', kind: r.kind, opp: 'ai', hall: r.hall, rival: r, rivalIdx: idx }); },
  startChallenge: (id) => { const ch = findChallenge(id); const i = CHALLENGES.indexOf(ch); startSession({ type: 'trick', kind: 'trick', opp: 'none', hall: ch.lesson ? 'parlor' : HALLS[i % HALLS.length].id, challenge: id }); },
  startDaily: () => { const date = localDateString(); startSession({ type: 'daily', kind: 'runout', opp: 'none', hall: dailyHall(date), date }); },
  startBlitz: (hall) => startSession({ type: 'blitz', kind: 'blitz', opp: 'none', hall }),
  startPractice: (hall) => startSession({ type: 'practice', kind: 'practice', opp: 'none', hall }),
  previewHall: (id) => applyHall(id),
  gearChanged: () => applyGear(),
  settingChanged: (key) => {
    if (key === 'sound') audio.setSfx(settings.sound === 'on');
    if (key === 'music') audio.setMusic(settings.music === 'on');
    if (key === 'shake') juice.shakeScale = shakeScale();
    if (key === 'assist') S.guideDirty = true;
    if (key === 'hand') applyHand();
  },
  resetProgress: () => { ['pool.profile.v2', 'pool.settings2'].forEach((k) => safeStorage.removeItem(k)); location.reload(); },
};
const ui = createUI({ profile, settings, saveSettings, actions, audio });

// ---------------------------------------------------------------- phase machine
function nextPhase() {
  const m = S.match, r = m.rules;
  S.guideDirty = true; S.callSel = null; S.callAuto = null;
  if (r.winner != null && !S.attract) return gameOver();
  if (r.winner != null && S.attract) { S.phase = 'over'; setTimeout(() => { if (S.attract && S.screen === 'menu') startAttract(); }, 2600); return; }
  const seat = seatOf();
  if (seat.human) {
    if (r.ballInHand && !r.breakShot) enterPlace(); else enterAim();
  } else {
    S.phase = 'ai'; S.ai = null;
    hideControls();
    if (!S.attract) status(`${seat.name} is thinking`);
  }
  buildTags();
}

function enterPlace() {
  S.phase = 'place';
  const cue = S.match.sim.ball(0);
  S.placeGhost = { x: Math.min(cue.x, S.match.rules.kitchen ? HEAD_X : HALF_L), y: cue.y, valid: true, kitchen: S.match.rules.kitchen };
  hideControls(); juice.clearAim();
  $('btnPlace').textContent = 'PLACE CUE BALL';
  $('btnPlace').classList.remove('hidden');
  status('Ball in hand');
  hint(S.match.rules.kitchen ? 'Place the cue ball behind the head string' : 'Place the cue ball anywhere');
}

function enterAim() {
  S.phase = 'aim'; S.placeGhost = null;
  $('btnPlace').classList.add('hidden');
  $('spinWidget').classList.remove('hidden'); $('powerStrip').classList.remove('hidden');
  const r = S.match.rules;
  if (r.breakShot && S.session && (S.mode.kind === 'eight' || S.mode.kind === 'nine' || S.mode.kind === 'onepocket')) {
    $('btnPlace').textContent = 'MOVE CUE BALL'; $('btnPlace').classList.remove('hidden');
  }
  setAimTowardsTarget();
  S.guideDirty = true;
  const seat = seatOf();
  const multi = S.mode.seats.length > 1;
  status(S.session && S.session.type === 'trick' ? `Attempt ${S.trick.attempts}` : multi ? (seat.name === 'You' ? 'Your shot' : `${seat.name}'s shot`) : 'Your shot');
  S.blitzSec = -1;
  if (mustCall8(r, onTable())) hint('Call a pocket for the 8-ball: tap a glowing pocket');
  else if (S.blitz && S.shotCount === 0) hint('Sixty seconds. Pot everything. Streaks multiply your score.');
  else if (S.session && S.session.type === 'trick' && S.trick.ch.lesson) hint(S.trick.ch.coach);
  else if (S.session && S.session.type === 'trick' && S.trick.attempts === 1) hint(S.trick.ch.blurb);
  else if (!profile.seen('coach1')) hint(coachText());
  else if (!profile.seen('coach2') && S.shotCount >= 1) hint('Drag the red dot for spin');
  else hint('');
}

function coachText() {
  if (S.inputMode === 'pad') return 'Left stick aims \u00b7 pull the right stick down, push up to shoot';
  if (S.inputMode === 'touch' || isCoarse()) return 'Drag to aim \u00b7 pull the strip down, flick up to shoot';
  if (S.inputMode === 'kbd') return 'Arrows aim \u00b7 Up/Down power \u00b7 Space to shoot';
  return 'Move to aim \u00b7 press, pull back, then push forward to shoot';
}

function hideControls() { ['spinWidget', 'powerStrip', 'btnPlace'].forEach((id) => $(id).classList.add('hidden')); }

function setAimTowardsTarget() {
  const m = S.match; if (!m) return;
  const cue = m.sim.ball(0);
  const t = legalTargets(m.rules, onTable());
  let best = null;
  for (const id of t) {
    const b = m.sim.ball(id); if (!b || b.pocketed) continue;
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (!best || d < best.d) best = { b, d };
  }
  if (best) S.aim.angle = Math.atan2(best.b.y - cue.y, best.b.x - cue.x);
}

// ---------------------------------------------------------------- HUD
let bannerTimer = 0;
function banner(title, sub, kind = '') {
  const el = $('banner');
  el.className = kind; el.querySelector('b').textContent = title; el.querySelector('span').textContent = sub || '';
  el.classList.remove('hidden'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.classList.add('hidden'), 2400);
}
function status(t) { $('status').textContent = t; }
function hint(t) { const h = $('hint'); if (t) { h.textContent = t; h.classList.remove('hidden'); } else h.classList.add('hidden'); }

function miniBall(id, gone) {
  const d = document.createElement('div');
  d.className = 'mini' + (id >= 9 ? ' stripe' : '') + (gone ? ' gone' : '');
  d.dataset.id = id; d.style.setProperty('--c', colorOf(id)); d.innerHTML = `<span>${id}</span>`;
  return d;
}
const GROUP_IDS = { solid: [1, 2, 3, 4, 5, 6, 7], stripe: [9, 10, 11, 12, 13, 14, 15] };

function buildTags() {
  const m = S.match; if (!m || S.attract) return;
  const seats = S.mode.seats, r = m.rules, tbl = onTable(), kind = S.mode.kind, two = seats.length > 1;
  $('tagB').classList.toggle('hidden', !two);
  $('hud').classList.toggle('solo', !two);
  const cfg = S.session;
  $('hud').querySelector('.modeTag').textContent = cfg.type === 'circuit' ? `${HALL_BY_ID[cfg.hall].name} · ${GAMES[kind].name}` : cfg.type === 'trick' ? challengeLabel(S.trick.ch) : kindName();
  [['tagA', 0], ['tagB', 1]].forEach(([id, i]) => {
    if (i >= seats.length) return;
    const el = $(id);
    el.classList.toggle('active', two ? r.turn === i && r.winner == null : true);
    const av = el.querySelector('.av');
    av.classList.toggle('you', !!seats[i].human && seats[i].name === 'You');
    av.textContent = seats[i].human && seats[i].name === 'You' ? '' : seats[i].name === 'Player 1' ? '1' : seats[i].name === 'Player 2' ? '2' : seats[i].name[0];
    el.querySelector('.pname').textContent = seats[i].name;
    const tray = el.querySelector('.tray'); tray.innerHTML = '';
    let g = '';
    if (kind === 'eight') {
      const grp = r.groups[i];
      g = r.open ? 'Table open' : grp === 'solid' ? 'Solids' : 'Stripes';
      if (grp) GROUP_IDS[grp].forEach((n) => tray.appendChild(miniBall(n, !tbl.includes(n))));
      if (grp && !GROUP_IDS[grp].some((n) => tbl.includes(n))) tray.appendChild(miniBall(8, !tbl.includes(8)));
    } else if (kind === 'nine' || kind === 'runout') {
      g = kind === 'runout' ? `${r.score[0]} down` : r.turn === i ? 'At the table' : 'Waiting';
      if (i === 0) [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((n) => tray.appendChild(miniBall(n, !tbl.includes(n))));
    } else if (kind === 'onepocket') {
      g = `${r.score[i]} of ${ONE_POCKET_TARGET} · ${i === 0 ? 'ringed pocket' : 'white pocket'}`;
      r.owned[i].forEach((n) => tray.appendChild(miniBall(n, false)));
    } else if (kind === 'blitz') g = `${S.blitz.score.toLocaleString()} pts \u00b7 x${multiplier(S.blitz.streak + 1)} next`;
    else if (kind === 'trick') g = `Attempt ${S.trick.attempts}`;
    else g = 'Free practice';
    el.querySelector('.pgroup').textContent = g;
  });
}

function updateSpinDot() {
  const dot = document.querySelector('#spinWidget .dot');
  dot.style.left = `${50 + (S.spin.a / 0.5) * 44}%`; dot.style.top = `${50 - (S.spin.b / 0.5) * 44}%`;
}
function updatePowerUI() {
  const strip = $('powerStrip').querySelector('.track');
  const h = strip.clientHeight - 30;
  strip.querySelector('.handle').style.top = `${S.power * h}px`;
  strip.querySelector('.fill').style.height = `${S.power * h + 15}px`;
  strip.querySelector('.handle em').textContent = S.power > 0.02 ? `${Math.round(S.power * 100)}` : 'POWER';
}
function maybePortraitHint() {
  if (renderer.portrait && !profile.seen('rotate')) {
    profile.markSeen('rotate'); hint('Turn sideways for a bigger table');
    setTimeout(() => { if (S.phase === 'aim') hint(''); }, 4500);
  }
}

// ---------------------------------------------------------------- power and shooting
const pullFor = (p) => 0.012 + p * 0.5;

function humanPlan(p) {
  const { a, b } = S.spin;
  const need8 = mustCall8(S.match.rules, onTable());
  const plan = { angle: S.aim.angle - SQUIRT * a, speed: speedFromPower(p), a, b, jump: S.jump, called: null };
  if (need8) {
    plan.called = S.callSel != null ? S.callSel : predictPocket(plan, 8);
    if (plan.called == null) plan.called = -1;
  }
  return plan;
}
function predictPocket(plan, id) {
  const s = S.match.sim.clone(); s.events = [];
  s.strike(0, plan.angle, plan.speed, plan.a, plan.b, plan.jump || 0); s.runToRest(25);
  const pe = s.events.find((e) => e.type === 'pocket' && e.id === id);
  return pe ? pe.pocket : null;
}

function fire(plan, power, visualPull = power) {
  if (S.phase !== 'aim' && S.phase !== 'ai') return;
  S.phase = 'shooting';
  hideControls(); hint('');
  const pull0 = pullFor(visualPull);
  // the strike runs at the speed of the stroke: a flick is instant, a slow push takes its time
  const drawT = clamp(pull0 / (speedFromPower(power) * 0.9), 0.035, 0.22);
  S.cueAnim = { t: 0, drawT, pull0, plan, power, struck: false, follow: 0 };
  S.power = power;
  audio.init(); if (!S.attract) audio.stroke(power);
}

function decisiveIds() {
  const m = S.match, k = m.rules.kind;
  if (k === 'nine' || k === 'runout') return [9];
  if (k === 'eight') return mustCall8(m.rules, onTable()) ? [8] : [];
  if (k === 'trick' && S.trick && S.trick.ch.objective.pot) return [S.trick.ch.objective.pot[S.trick.ch.objective.pot.length - 1]];
  return [];
}

function strikeNow() {
  const a = S.cueAnim; if (!a) return;
  const m = S.match, cue = m.sim.ball(0);
  S.lastShot = { positions: m.sim.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })), plan: { ...a.plan } };
  S.shotCount++; S.evIdx = 0; S.slowDone = false;
  S.decisive = decisiveIds();
  beginShot(m, a.plan);
  a.struck = true;
  const dir = [Math.cos(a.plan.angle), Math.sin(a.plan.angle)];
  if (!S.attract) {
    audio.cue(a.power);
    juice.onStrike(a.power, dir);
    buzz(8);
    profile.markSeen('coach1');
    if (S.shotCount >= 2) profile.markSeen('coach2');
  }
  juice.chalkPuff(cue.x - dir[0] * (R + 0.01), cue.y - dir[1] * (R + 0.01));
  S.phase = 'roll';
  hint(''); if (!S.blitz) status('…');
  setJump(0);
}

function cueGeom() {
  const m = S.match, cue = m.sim.ball(0), a = S.cueAnim;
  const angle = a ? a.plan.angle : S.aim.angle - SQUIRT * S.spin.a;
  let gap;
  if (a) {
    if (!a.struck) { const k = clamp(a.t / a.drawT, 0, 1); gap = 0.012 + a.pull0 * (1 - k * k); }
    else gap = -0.02 * clamp(a.follow / 0.08, 0, 1);
  } else if (S.phase === 'ai' && S.ai && S.ai.pull != null) gap = 0.012 + S.ai.pull;
  else gap = pullFor(S.power);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let off = S.spin.a * R;
  if (S.power > 0.9 && !a) off += Math.sin(S.time * 90) * 0.0012 * (S.power - 0.9) * 10;   // the cue trembles at full draw
  const g = Math.max(0.0005, gap + 0.002);
  return { tipX: cue.x - dx * (R + g) + dy * off, tipY: cue.y - dy * (R + g) - dx * off, angle, power: a ? (a.struck ? 0 : a.power) : S.power, tipFlash: !!(a && a.struck && a.follow < 0.06), lift: (a ? a.plan.jump || 0 : S.jump) / 0.52 };
}

// ---------------------------------------------------------------- aim guide (simulated by the real engine)
function computeGuide() {
  const m = S.match;
  const p = S.power > 0.04 ? S.power : 0.45;
  const s = m.sim.clone(); s.events = [];
  const plan = { angle: S.aim.angle - SQUIRT * S.spin.a, speed: speedFromPower(p), a: S.spin.a, b: S.spin.b, jump: S.jump };
  const cueB = s.ball(0);
  s.strike(0, plan.angle, plan.speed, plan.a, plan.b, plan.jump);
  const pts = [{ x: cueB.x, y: cueB.y }];
  let last = pts[0], first = null, steps = 0;
  while (s.time < 4 && steps++ < 12000) {
    s.step(s.nextDt());
    const b = s.ball(0);
    if (Math.hypot(b.x - last.x, b.y - last.y) > 0.012) { last = { x: b.x, y: b.y }; pts.push(last); }
    first = s.events.find((e) => (e.type === 'ball' && (e.a === 0 || e.b === 0)) || (e.type === 'rail' && e.id === 0 && e.wall < 100));
    if (first || !s.isMoving()) break;
  }
  const g = { cuePath: pts, ghost: null, objPath: null, cueAfter: null, obj: null, pred8: null };
  const b0 = s.ball(0);
  pts.push({ x: b0.x, y: b0.y });
  const objId = first && first.type === 'ball' ? (first.a === 0 ? first.b : first.a) : null;
  if (objId != null) { g.ghost = { x: b0.x, y: b0.y }; g.obj = objId; }
  if (first) {
    const cueAfter = [{ x: b0.x, y: b0.y }];
    const ob = objId != null ? s.ball(objId) : null;
    const objPath = ob ? [{ x: ob.x, y: ob.y }] : null;
    const t0 = s.time; let ev0 = s.events.length; let objDone = false, cueDone = false;
    let lc = cueAfter[0], lo = objPath ? objPath[0] : null;
    while (s.time - t0 < 0.9 && steps++ < 30000 && s.isMoving()) {
      s.step(Math.min(s.nextDt(), 0.003));
      const c = s.ball(0);
      if (!cueDone && Math.hypot(c.x - lc.x, c.y - lc.y) > 0.01) { lc = { x: c.x, y: c.y }; cueAfter.push(lc); }
      if (ob && !objDone && Math.hypot(ob.x - lo.x, ob.y - lo.y) > 0.01) { lo = { x: ob.x, y: ob.y }; objPath.push(lo); }
      for (; ev0 < s.events.length; ev0++) {
        const e = s.events[ev0];
        if (e.type === 'rail' && e.id === 0 && e.wall < 100 && !cueDone) cueDone = true;
        if (ob && ((e.type === 'rail' && e.id === objId) || (e.type === 'pocket' && e.id === objId))) objDone = true;
        if (e.type === 'ball' && ob && (e.a === objId || e.b === objId) && !(e.a === 0 || e.b === 0)) objDone = true;
      }
      if (ob && ob.pocketed) objDone = true;
      if (cueDone && (!ob || objDone)) break;
    }
    g.cueAfter = cueAfter.length > 1 ? cueAfter : null;
    g.objPath = objPath && objPath.length > 1 ? objPath : null;
    if (settings.assist === 'line' && g.objPath) {
      let acc = 0; const cut = [g.objPath[0]];
      for (let i = 1; i < g.objPath.length && acc < 0.28; i++) { acc += Math.hypot(g.objPath[i].x - g.objPath[i - 1].x, g.objPath[i].y - g.objPath[i - 1].y); cut.push(g.objPath[i]); }
      g.objPath = cut;
    }
  }
  if (mustCall8(m.rules, onTable())) {
    const s2 = m.sim.clone(); s2.events = [];
    s2.strike(0, plan.angle, plan.speed, plan.a, plan.b, plan.jump); s2.runToRest(20);
    const pe = s2.events.find((e) => e.type === 'pocket' && e.id === 8);
    g.pred8 = pe ? pe.pocket : null; S.autoCall = pe ? pe.pocket : null;
  }
  S.guide = g;
}

// ---------------------------------------------------------------- events -> sound, juice, flyers
function screenPan(x, y) {
  const p = renderer.toScreen(x, y);
  return clamp((p.x - renderer.w / 2) / (renderer.w / 2), -1, 1) * 0.7;
}

function trayTarget(id) {
  const el = document.querySelector(`#tagA .mini[data-id="${id}"], #tagB .mini[data-id="${id}"]`);
  if (el) return el;
  const seat = S.match ? S.match.rules.turn % S.mode.seats.length : 0;
  return document.querySelector(seat === 1 ? '#tagB .av' : '#tagA .av');
}

function processEvents(sim, idxKey, live) {
  const evs = sim.events;
  for (; S[idxKey] < evs.length; S[idxKey]++) {
    const e = evs[S[idxKey]];
    if (e.type === 'ball') {
      if (live && !S.attract) { audio.ballHit(e.speed, screenPan(e.x, e.y)); if (S.inputMode === 'pad' && e.speed > 2) pad.rumble(Math.min(1, e.speed / 8), 0.3, 60); }
      const breakHit = live && (e.a === 0 || e.b === 0) && S.match.pending && S.match.pending.wasBreak;
      if (S.attract) { if (e.speed > 1.4) juice.effects.push({ type: 'ring', x: e.x, y: e.y, t: 0, dur: 0.28, s: Math.min(1, e.speed / 5) }); }
      else juice.onBall(e, breakHit && S[idxKey] < 6);
    } else if (e.type === 'rail') {
      if (live && !S.attract) audio.cushion(e.speed, screenPan(e.x, e.y));
      if (!S.attract) juice.onRail(e);
    } else if (e.type === 'land') {
      if (live && !S.attract) audio.land(e.speed);
      juice.effects.push({ type: 'ring', x: e.x, y: e.y, t: 0, dur: 0.24, s: Math.min(1, 0.4 + e.speed / 3) });
    } else if (e.type === 'pocket') {
      if (!S.attract) { audio.pocket(Math.hypot(e.vx, e.vy), screenPan(e.x, e.y)); if (S.inputMode === 'pad') pad.rumble(0.7, 0.5, 120); }
      const b = sim.ball(e.id);
      const pk = sim.table.pockets[e.pocket];
      if (!S.attract) juice.onPocket(e, e.pocket, sim.table, b);
      else juice.sinking.push({ id: e.id, x: e.x, y: e.y, sx: e.x, sy: e.y, tx: pk.x + (pk.x - pk.mx) * 0.4, ty: pk.y + (pk.y - pk.my) * 0.4, t: 0, q: b.q.slice() });
      if (live && !S.attract && e.id !== 0) {
        const from = renderer.toScreen(pk.mx, pk.my);
        juice.flyer(e.id, from, trayTarget(e.id), colorOf(e.id), e.id >= 9);
        buzz(14);
      }
      if (S.slowDone) juice.slowUntil = S.time + 0.5;
    }
  }
}

// the deciding ball, heading for a pocket: slow the world and lean in
function checkDecisive(sim) {
  if (S.slowDone || S.attract || !S.decisive.length) return;
  for (const id of S.decisive) {
    const b = sim.ball(id);
    if (!b || b.pocketed) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 0.25) continue;
    for (const pk of sim.table.pockets) {
      const dx = pk.mx - b.x, dy = pk.my - b.y, d = Math.hypot(dx, dy);
      if (d < 0.34 && (b.vx * dx + b.vy * dy) / (sp * d) > 0.93) {
        S.slowDone = true;
        juice.slowMo({ x: pk.mx, y: pk.my }, S.time, 1.5);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------- shot end
function announce(result, actor) {
  if (S.attract) return;
  if (result.foul) {
    audio.foul(); buzz([40, 30, 40]);
    juice.callout('Foul', result.reasons[0], 'foul');
    return;
  }
  const tags = result.tags || [];
  tags.slice(0, 3).forEach((t, i) => setTimeout(() => {
    if (S.screen !== 'play') return;
    juice.callout(t.label, `+${t.xp} chalk`, t.id === 'GOLDEN' ? 'big' : 'good');
    audio.chime(Math.min(4, i + (t.id === 'GOLDEN' ? 3 : t.id === 'RUN' ? 2 : 0)));
  }, i * 380));
  if (!tags.length && result.text && result.text !== 'Pocketed' && !result.lose) {
    juice.callout(result.text.replace(/^You are/, actor === 'You' ? 'You are' : `${actor} is`), result.sub || '', 'good');
    audio.chime(0);
  } else if (!tags.length && result.pocketed.length && !result.respot.length) {
    juice.callout('Pocketed', `Sank the ${result.pocketed.join(', ')}`, 'good');
    audio.chime(0);
  }
  if (result.lose) juice.callout('Lost the frame', result.lose, 'foul');
}

function finishShot() {
  const m = S.match;
  audio.roll(0); juice.releaseSlowMo();
  const actor = seatOf().name;
  const result = endShot(m);
  S.lastShot.result = result;
  if (!S.attract) $('btnReplay').classList.remove('hidden');
  if (S.blitz) blitzShot(result, actor); else announce(result, actor);
  buildTags();
  S.phase = 'roll-done';
  if (S.blitz && (S.blitz.ending || S.blitz.t <= 0)) endBlitz(900);
  S.doneTimer = result.foul || result.tags && result.tags.length ? 1.25 : 0.55;
  // trick shots resolve per attempt
  if (S.session && S.session.type === 'trick') {
    const ev = evaluate(S.trick.ch, m, S.lastShot.plan);
    if (ev.solved) { S.phase = 'trick-solved'; S.doneTimer = 1.1; }
    else { S.phase = 'trick-miss'; S.doneTimer = 1.4; S.trickWhy = ev.why; juice.callout('Not quite', ev.why, 'foul'); audio.foul(); }
  }
}

// ---------------------------------------------------------------- replay and demonstration
function startReplay(shot = S.lastShot, back = null) {
  if (!shot || !(S.phase === 'aim' || S.phase === 'place')) return;
  const sim = new Sim({ table: S.match.table, params: S.match.sim.params, trackOrient: true });
  for (const b of shot.positions) sim.addBall(b.id, b.x, b.y).pocketed = b.pocketed;
  sim.strike(0, shot.plan.angle, shot.plan.speed, shot.plan.a, shot.plan.b, shot.plan.jump || 0);
  S.replay = { sim, back: back || S.phase };
  S.replayEv = 0; S.phase = 'replay';
  juice.reset();
  hideControls(); hint('Replay · tap to skip'); status('Replay');
}
function stopReplay() {
  if (S.phase !== 'replay') return;
  const back = S.replay.back;
  S.replay = null; juice.reset(); audio.roll(0); hint('');
  if (back === 'place') enterPlace(); else enterAim();
}
function showSolution() {
  const ch = S.trick && S.trick.ch;
  if (!ch || !(S.phase === 'aim')) return;
  startReplay({ positions: S.match.sim.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })), plan: ch.solution }, 'aim');
  hint('Here is one way to do it');
}

// ---------------------------------------------------------------- game over and results
function statRows(st) {
  return [['Balls potted', st.pots], ['Best run', st.bestRun], ['Fouls', st.fouls], ['Skill shots', st.tags.filter((t) => t !== 'RUN').length]];
}
function award(xp) {
  const from = profile.data.xp;
  const r = profile.addXp(xp);
  return { ...r, fromXp: from };
}
// progress first, then achievements (which add their own Chalk), then one award so the results sheet counts it all
let lastAch = [];
function awardWithAchievements(baseXp) {
  let ach = checkAchievements(profile);
  const from = profile.data.xp;
  let total = baseXp + ach.reduce((a, b) => a + b.xp, 0);
  let r = profile.addXp(total);
  const more = checkAchievements(profile);           // e.g. a level milestone reached by this very award
  if (more.length) { ach = ach.concat(more); const extra = profile.addXp(more.reduce((a, b) => a + b.xp, 0)); r = { ...r, after: extra.after, ups: [...new Set([...r.ups, ...extra.ups])], unlocked: [...r.unlocked, ...extra.unlocked], gained: r.gained + extra.gained }; }
  lastAch = ach;
  return { ...r, fromXp: from };
}

function gameOver() {
  if (S.ended) return;
  S.ended = true; S.phase = 'over';
  hideControls(); juice.releaseSlowMo();
  const m = S.match, r = m.rules, seats = S.mode.seats, cfg = S.session;
  const st = m.stats[0];
  setTimeout(() => {
    if (S.phase !== 'over' || S.screen !== 'play') return;
    if (cfg.type === 'daily') return dailyEnd(m);
    if (cfg.type === 'circuit') return circuitEnd(m);
    const vsAI = seats.length === 2 && !seats[1].human && seats[0].human;
    const won = r.winner === 0;
    if (vsAI) {
      profile.recordMatch(st, won);
      const xp = awardWithAchievements((won ? 60 : 15) + st.xp);
      audio.win();
      ui.results({ achievements: lastAch, kicker: GAMES[cfg.kind].name, title: won ? 'Victory' : 'Defeat', sub: won ? (r.last && r.last.sub) || 'Clean finish.' : `${seats[1].name} took it${r.loseReason ? `: ${r.loseReason.toLowerCase()}` : ''}`, rows: statRows(st), xp, buttons: [{ label: 'Rematch', primary: true, cb: () => startSession({ ...cfg, rematch: true }) }, { label: 'Menu', cb: () => enterMenu('home') }] });
    } else {
      audio.win();
      ui.results({ kicker: GAMES[cfg.kind].name, title: `${seats[r.winner % seats.length].name} wins`, sub: r.loseReason || '', rows: [], buttons: [{ label: 'Rematch', primary: true, cb: () => startSession({ ...cfg, rematch: true }) }, { label: 'Menu', cb: () => enterMenu('home') }] });
    }
  }, 1100);
}

function circuitEnd(m) {
  const cfg = S.session, rival = cfg.rival, won = m.rules.winner === 0;
  const st = m.stats[0];
  const sc = scoreMatch(rival, m, won);
  profile.recordMatch(st, won);
  const key = `${rival.hall}:${RIVALS.filter((x) => x.hall === rival.hall).indexOf(rival)}`;
  if (won) profile.setStars('circuit', key, sc.stars);
  const xp = awardWithAchievements((won ? winXp(sc.stars) : 15) + st.xp);
  audio.win();
  const nextIdx = won && cfg.rivalIdx + 1 < RIVALS.length ? cfg.rivalIdx + 1 : null;
  const buttons = [];
  if (nextIdx != null) buttons.push({ label: `Next: ${RIVALS[nextIdx].name}`, primary: true, cb: () => actions.startRival(nextIdx) });
  buttons.push({ label: won ? 'Play again for stars' : 'Rematch', primary: nextIdx == null, cb: () => startSession({ ...cfg, rematch: true }) });
  buttons.push({ label: 'The Circuit', cb: () => enterMenu('circuit') });
  ui.results({ achievements: lastAch, kicker: `${HALL_BY_ID[cfg.hall].name} · vs ${rival.name}`, title: won ? 'Victory' : 'Defeat', sub: won ? 'One star for the win, one for each goal.' : `${rival.name} won. ${m.rules.loseReason ? m.rules.loseReason : ''}`, stars: won ? sc.stars : 0, goals: sc.goals, rows: statRows(st), xp, buttons });
}

function dailyEnd(m) {
  const cfg = S.session, st = m.stats[0];
  const cleared = m.rules.score[0] >= 1 && !m.rules.loseReason;
  const score = dailyScore(st, cleared);
  const d = profile.recordDaily(cfg.date, score);
  if (cleared) profile.noteDailyClear();
  profile.addStats(st);
  const xp = awardWithAchievements(20 + Math.floor(score / 40) + (d.streak > 1 ? d.streak * 3 : 0));
  audio.win();
  ui.results({ achievements: lastAch, kicker: `Daily Run · ${cfg.date}`, title: cleared ? 'Rack cleared' : `${st.pots} down`, sub: cleared ? 'Every ball, in order.' : `Run ended: ${(m.rules.loseReason || '').toLowerCase()}`, rows: [['Score', score.toLocaleString()], ['Today\'s best', d.todayBest.toLocaleString()], ['All-time best', profile.data.daily.best.toLocaleString()], ['Streak', `${d.streak} day${d.streak === 1 ? '' : 's'}`]], xp, buttons: [{ label: 'Run it again', primary: true, cb: () => startSession({ ...cfg, rematch: true }) }, { label: 'Menu', cb: () => enterMenu('home') }] });
}

function blitzShot(result, actor) {
  const b = S.blitz, m = S.match;
  const sc = scoreShot(b, result);
  if (result.scratch) {
    audio.foul(); buzz([40, 30, 40]);
    juice.callout('Scratch', `-${SCRATCH_POINTS} points \u00b7 -${SCRATCH_TIME} seconds`, 'foul');
  } else if (sc.points > 0) {
    if (result.tags && result.tags.length) announce({ ...result, foul: false }, actor);
    else { juice.callout(sc.label || 'Pocketed', `+${sc.points}`, 'good'); audio.chime(Math.min(4, sc.mult - 1)); }
  }
  if (m.sim.balls.every((x) => x.id === 0 || x.pocketed)) {
    clearRack(b);
    rerackKeepCue(m);
    setTimeout(() => { if (S.blitz) { juice.callout('Rack cleared', `+${CLEAR_BONUS} \u00b7 +${CLEAR_TIME} seconds`, 'big'); audio.chime(4); } }, 500);
    S.blitzSec = -1;
  }
}

function endBlitz(delay = 600) {
  if (S.ended) return;
  S.ended = true; S.phase = 'over';
  hideControls(); juice.releaseSlowMo();
  setTimeout(() => {
    if (S.screen !== 'play' || !S.blitz) return;
    const b = S.blitz, cfg = S.session;
    const rb = profile.recordBlitz(b.score);
    profile.addStats(S.match.stats[0]);
    const xp = awardWithAchievements(blitzXp(b.score));
    audio.win();
    ui.results({ achievements: lastAch, kicker: 'Blitz', title: rb.newBest && b.score > 0 ? 'New best' : "Time's up", sub: `${b.balls} balls potted \u00b7 best streak ${b.bestStreak}`, rows: [['Score', b.score.toLocaleString()], ['Personal best', rb.best.toLocaleString()], ['Racks cleared', b.racks], ['Balls potted', b.balls]], xp, buttons: [{ label: 'Go again', primary: true, cb: () => startSession({ ...cfg }) }, { label: 'Menu', cb: () => enterMenu('home') }] });
  }, delay);
}

function trickSolved() {
  const cfg = S.session, t = S.trick;
  if (t.ch.lesson) return lessonDone();
  const st = trickStars(t.attempts);
  const first = !profile.data.challenges[t.ch.id];
  profile.setStars('challenges', t.ch.id, st);
  profile.addStats(S.match.stats[0]);
  const xp = awardWithAchievements(30 * st + (first ? 20 : 0));
  audio.win();
  const i = CHALLENGES.indexOf(t.ch);
  const next = CHALLENGES[i + 1];
  const buttons = [];
  if (next) buttons.push({ label: `Next: ${next.name}`, primary: true, cb: () => actions.startChallenge(next.id) });
  buttons.push({ label: 'Try for three stars', primary: !next, cb: () => startSession({ ...cfg }) });
  buttons.push({ label: 'Trick shots', cb: () => enterMenu('tricks') });
  ui.results({ achievements: lastAch, kicker: `Trick shot ${i + 1}`, title: t.ch.name, sub: st === 3 ? 'First try. Clean.' : `Solved on attempt ${t.attempts}.`, stars: st, rows: [['Attempts', t.attempts]], xp, buttons });
}

function lessonDone() {
  const cfg = S.session, t = S.trick;
  const first = !profile.data.lessons[t.ch.id];
  profile.setStars('lessons', t.ch.id, 1);
  const xp = awardWithAchievements(first ? 25 : 5);
  audio.win();
  const i = LESSONS.indexOf(t.ch), next = LESSONS[i + 1];
  const buttons = [];
  if (next) buttons.push({ label: `Next lesson: ${next.name}`, primary: true, cb: () => actions.startChallenge(next.id) });
  else buttons.push({ label: 'Start the Circuit', primary: true, cb: () => enterMenu('circuit') });
  buttons.push({ label: 'Repeat this lesson', cb: () => startSession({ ...cfg }) });
  buttons.push({ label: 'Menu', cb: () => enterMenu('home') });
  ui.results({ achievements: lastAch, kicker: `Lesson ${i + 1} of ${LESSONS.length}`, title: next ? 'Got it' : 'Lessons complete', sub: next ? t.ch.blurb : 'You know the basics. The Circuit is next.', rows: [['Attempts', t.attempts]], xp, buttons });
}

// ---------------------------------------------------------------- AI driver
const aiRand = rng((Math.random() * 1e9) | 0);
function updateAI(dt) {
  const m = S.match, seat = seatOf();
  if (!S.ai) S.ai = { gen: planShot({ sim: m.sim, rules: m.rules, table: m.table, level: seat.level, rand: aiRand }), plan: null, t: 0, stage: 'think', pull: 0, level: seat.level };
  const ai = S.ai;
  ai.t += dt;
  if (ai.stage === 'think') {
    const t0 = performance.now();
    while (!ai.plan && performance.now() - t0 < 7) { const r = ai.gen.next(); if (r.done) ai.plan = r.value; }
    S.aim.angle += Math.sin(S.time * 2.1) * 0.0006;
    if (ai.plan && ai.t >= ai.level.think) { ai.stage = ai.plan.place ? 'place' : 'rot'; ai.t = 0; ai.from = S.aim.angle; ai.cue0 = { x: m.sim.ball(0).x, y: m.sim.ball(0).y }; }
  } else if (ai.stage === 'place') {
    const k = clamp(ai.t / 0.45, 0, 1), e = k * k * (3 - 2 * k);
    placeCue(m, ai.cue0.x + (ai.plan.place.x - ai.cue0.x) * e, ai.cue0.y + (ai.plan.place.y - ai.cue0.y) * e);
    if (k >= 1) { if (!S.attract) audio.place(); ai.stage = 'rot'; ai.t = 0; ai.from = S.aim.angle; m.rules.ballInHand = false; }
  } else if (ai.stage === 'rot') {
    const target = ai.plan.angle + SQUIRT * ai.plan.a;
    const k = clamp(ai.t / 0.7, 0, 1), e = k * k * (3 - 2 * k);
    S.aim.angle = ai.from + wrap(target - ai.from) * e;
    S.spin = { a: ai.plan.a, b: ai.plan.b };
    if (ai.plan.called != null && ai.plan.called >= 0) S.callSel = ai.plan.called;
    if (k >= 1) { ai.stage = 'pull'; ai.t = 0; }
  } else if (ai.stage === 'pull') {
    const p = powerFromSpeed(ai.plan.speed), k = clamp(ai.t / 0.5, 0, 1);
    ai.pull = pullFor(p) * k * (2 - k); S.power = p * k;
    if (k >= 1) { ai.stage = 'hold'; ai.t = 0; }
  } else if (ai.stage === 'hold') {
    if (ai.t > 0.18) { const plan = ai.plan, p = powerFromSpeed(plan.speed); S.ai = null; S.power = 0; fire({ ...plan }, p); }
  }
}

// ---------------------------------------------------------------- frame loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  S.time += dt;
  padUpdate(dt);                       // polled every frame, paused or not, so menus stay navigable
  if (S.match && !S.paused) update(dt);
  render();
  requestAnimationFrame(frame);
}

function blitzClock(dt) {
  const b = S.blitz;
  if (!b || S.phase === 'over' || S.phase === 'replay') return;
  b.t = Math.max(0, b.t - dt);
  const sec = Math.ceil(b.t);
  if (sec !== S.blitzSec) {
    S.blitzSec = sec;
    status(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    $('status').classList.toggle('urgent', sec <= 10);
    if (sec <= 5 && sec > 0) audio.tick();
  }
  if (b.t <= 0) {
    if (S.phase === 'aim' || S.phase === 'place' || S.phase === 'roll-done') endBlitz(400);
    else b.ending = true;                       // let the shot in flight finish and count
  }
}

function update(dt) {
  const m = S.match;
  blitzClock(dt);
  const { dt: sdt } = juice.update(dt, S.time);
  switch (S.phase) {
    case 'aim':
      if (S.guideDirty && S.time - S.guideT > 0.02) {
        S.guideDirty = false; S.guideT = S.time; computeGuide();
        S.callAuto = mustCall8(m.rules, onTable()) ? S.autoCall : null; S.autoCall = null;
      }
      juice.setAim(S.power, m.sim.ball(0));
      break;
    case 'ai':
      updateAI(dt);
      if (!S.attract) juice.setAim(S.power, m.sim.ball(0));
      break;
    case 'shooting': {
      const a = S.cueAnim;
      if (!a.struck) { a.t += dt; if (a.t >= a.drawT) strikeNow(); }
      break;
    }
    case 'roll': {
      const sim = m.sim;
      const slow = juice.timeScale < 0.9;
      const fast = !slow && sim.maxSpeed() < 0.45 && sim.time > 0.5;
      sim.advance(sim.time + sdt * (fast ? 3 : 1));
      processEvents(sim, 'evIdx', true);
      checkDecisive(sim);
      let total = 0; for (const b of sim.balls) if (!b.pocketed) total += Math.hypot(b.vx, b.vy);
      if (!S.attract) audio.roll(total);
      if (S.cueAnim) { S.cueAnim.follow += dt; if (S.cueAnim.follow > 0.35) S.cueAnim = null; }
      if (!sim.isMoving() || sim.time - (sim.shotStart || 0) > 60) { S.cueAnim = null; finishShot(); }
      break;
    }
    case 'roll-done':
      S.doneTimer -= dt;
      if (S.doneTimer <= 0) nextPhase();
      break;
    case 'trick-miss':
      S.doneTimer -= dt;
      if (S.doneTimer <= 0) {
        S.trick.attempts++;
        if (S.trick.attempts > (S.trick.ch.lesson ? 2 : 3)) $('btnHint').classList.remove('hidden');
        makeMatch();
      }
      break;
    case 'trick-solved':
      S.doneTimer -= dt;
      if (S.doneTimer <= 0) { S.phase = 'over'; trickSolved(); }
      break;
    case 'replay': {
      const sim = S.replay.sim;
      const fast = sim.maxSpeed() < 0.45 && sim.time > 0.5;
      sim.advance(sim.time + sdt * (fast ? 3 : 1));
      processEvents(sim, 'replayEv', false);
      let total = 0; for (const b of sim.balls) if (!b.pocketed) total += Math.hypot(b.vx, b.vy);
      audio.roll(total);
      if (!sim.isMoving()) stopReplay();
      break;
    }
    case 'place': juice.clearAim(); break;
    default: break;
  }
  if (S.phase === 'aim' || S.phase === 'ai' || S.phase === 'shooting') updatePowerUI();
}

function render() {
  const m = S.match; if (!m) return;
  const menu = S.screen === 'menu';
  const sim = S.phase === 'replay' && S.replay ? S.replay.sim : m.sim;
  const f = {
    balls: sim.balls, time: S.time, effects: juice.effects, sinking: juice.sinking,
    showGuide: !menu && S.phase === 'aim' && humanTurn() && settings.assist !== 'none',
    guide: S.guide, assist: settings.assist, hideCue: false,
    tension: (S.phase === 'aim' || S.phase === 'ai') && !menu ? S.power : 0, cueBall: m.sim.ball(0),
  };
  if (!menu && S.phase === 'place' && S.placeGhost) { f.placeGhost = S.placeGhost; f.hideCue = true; }
  if (!menu && S.phase === 'aim' && humanTurn() && mustCall8(m.rules, onTable())) f.call = { pockets: [0, 1, 2, 3, 4, 5], selected: S.callSel != null ? S.callSel : S.callAuto };
  if (!menu && S.phase === 'ai' && S.callSel != null && mustCall8(m.rules, onTable())) f.call = { pockets: [S.callSel], selected: S.callSel };
  // table markings: one-pocket ownership, trick-shot targets
  const marks = [];
  if (!menu && S.mode && S.mode.kind === 'onepocket') {
    ONE_POCKET_OWNERS.forEach((pi, i) => {
      const p = m.table.pockets[pi];
      marks.push({ x: p.mx + (p.x - p.mx) * 0.75, y: p.my + (p.y - p.my) * 0.75, r: 0.075, color: i === 0 ? renderer.hall.accent : '#ffffff', w: 0.009, pulse: m.rules.turn === i, alpha: 0.95 });
    });
  }
  if (!menu && S.session && S.session.type === 'trick' && S.trick) {
    const o = S.trick.ch.objective;
    if (o.zone) marks.push({ x: o.zone.x, y: o.zone.y, r: o.zone.r, color: renderer.hall.accent, w: 0.006, dash: true, fill: 0.06, alpha: 0.85, pulse: true });
    if (o.pocket != null) { const p = m.table.pockets[o.pocket]; marks.push({ x: p.mx + (p.x - p.mx) * 0.75, y: p.my + (p.y - p.my) * 0.75, r: 0.07, color: '#ffffff', w: 0.008, pulse: true }); }
  }
  f.marks = marks;
  if (!menu && S.phase === 'aim' && S.drag && S.drag.kind === 'rotate' && S.touchPt && S.guide) {
    const cb = m.sim.ball(0), g = S.guide;
    f.loupe = { pt: S.touchPt, target: g.ghost ? { x: g.ghost.x, y: g.ghost.y } : { x: cb.x + Math.cos(S.aim.angle) * 0.5, y: cb.y + Math.sin(S.aim.angle) * 0.5 } };
  }
  const showCue = !menu ? (S.phase === 'aim' || S.phase === 'shooting' || S.phase === 'ai' || (S.phase === 'roll' && S.cueAnim)) : (S.phase === 'ai' || S.phase === 'shooting' || (S.phase === 'roll' && S.cueAnim));
  if (showCue && !m.sim.ball(0).pocketed) { const g = cueGeom(); f.cue = { visible: true, ...g }; }
  renderer.draw(f);
}

// ---------------------------------------------------------------- input
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };

function noteInput(mode) {
  if (S.inputMode === mode) return;
  S.inputMode = mode;
  document.body.classList.remove('input-mouse', 'input-touch', 'input-pad', 'input-kbd');
  document.body.classList.add(`input-${mode}`);
}

function updateGhost(w) {
  const m = S.match;
  const x = clamp(w.x, -HALF_L + R, HALF_L - R), y = clamp(w.y, -HALF_W + R, HALF_W - R);
  S.placeGhost = { x, y, kitchen: m.rules.kitchen, valid: validCuePlacement(x, y, m.sim.balls, m.rules.kitchen) };
}
function commitPlace() {
  const g = S.placeGhost; if (!g || !g.valid) return;
  placeCue(S.match, g.x, g.y); audio.place();
  S.match.rules.ballInHand = false;
  enterAim();
}
function setAim(angle) { S.aim.angle = angle; S.guideDirty = true; }
function setSpin(a, b) {
  const m = Math.hypot(a, b), k = m > 0.5 ? 0.5 / m : 1;
  S.spin = { a: a * k, b: b * k }; updateSpinDot(); S.guideDirty = true;
}

// ---- the stroke: one path for the mouse, the touch strip and the gamepad's right stick
const strokeGain = () => ({ low: 1.1, med: 1.5, high: 2.0 }[settings.stroke] ?? 1.5);
const newStroke = (extra = {}) => new Stroke({ gain: strokeGain(), ...extra });
function shootFromStroke(power) {
  const visualPull = S.power;                       // where the cue actually is right now
  S.drag = null; S.strip = null; S.padStroke = null;
  fire(humanPlan(power), power, visualPull);
}
function cancelStroke() { S.drag = null; S.strip = null; S.padStroke = null; S.power = 0; S.guideDirty = true; }
function feedStroke(stroke, s, t) {
  const out = stroke.push(s, t);
  S.power = out.pull; S.guideDirty = true;
  if (out.fire != null) { shootFromStroke(out.fire); return true; }
  return false;
}
const samplesOf = (e) => { const c = e.getCoalescedEvents ? e.getCoalescedEvents() : null; return c && c.length ? c : [e]; };

canvas.addEventListener('pointerdown', (e) => {
  audio.init();
  noteInput(e.pointerType === 'touch' ? 'touch' : 'mouse');
  if (S.screen !== 'play' || S.paused) return;
  if (S.phase === 'replay') { stopReplay(); return; }
  const w = renderer.toWorld(e.clientX, e.clientY);
  if (S.phase === 'place' && humanTurn()) {
    updateGhost(w);
    if (e.pointerType === 'mouse') commitPlace(); else { S.drag = { kind: 'place' }; capture(canvas, e.pointerId); }
    return;
  }
  if (S.phase !== 'aim' || !humanTurn()) return;
  if (mustCall8(S.match.rules, onTable())) {
    let best = -1, bd = 0.2;
    S.match.table.pockets.forEach((p, i) => { const d = Math.hypot(w.x - p.mx, w.y - p.my); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { S.callSel = best; audio.tick(); return; }
  }
  const cue = S.match.sim.ball(0);
  capture(canvas, e.pointerId);
  if (e.pointerType === 'touch') {
    S.drag = { kind: 'rotate', f0: Math.atan2(w.y - cue.y, w.x - cue.x), a0: S.aim.angle };
    S.touchPt = { x: e.clientX, y: e.clientY };
  } else {
    if (Math.hypot(w.x - cue.x, w.y - cue.y) > 0.05) setAim(wrap(Math.atan2(w.y - cue.y, w.x - cue.x)));
    const dir = [Math.cos(S.aim.angle), Math.sin(S.aim.angle)];
    S.drag = { kind: 'stroke', start: w, dir, stroke: newStroke(), s: 0, t: e.timeStamp / 1000 };
    S.drag.stroke.push(0, S.drag.t);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (S.screen !== 'play' || S.paused || !S.match) return;
  if (e.pointerType !== 'touch' && S.inputMode !== 'mouse') noteInput('mouse');
  const w = renderer.toWorld(e.clientX, e.clientY);
  if (S.phase === 'place' && humanTurn()) { if (e.pointerType === 'mouse' || (S.drag && S.drag.kind === 'place')) updateGhost(w); return; }
  if (S.phase !== 'aim' || !humanTurn()) return;
  const cue = S.match.sim.ball(0);
  if (S.drag && S.drag.kind === 'stroke') {
    const d = S.drag;
    for (const ev of samplesOf(e)) {
      const p = renderer.toWorld(ev.clientX, ev.clientY);
      d.s = (p.x - d.start.x) * -d.dir[0] + (p.y - d.start.y) * -d.dir[1];
      d.t = ev.timeStamp / 1000;
      if (feedStroke(d.stroke, d.s, d.t)) return;
    }
  } else if (S.drag && S.drag.kind === 'rotate') {
    setAim(S.drag.a0 + wrap(Math.atan2(w.y - cue.y, w.x - cue.x) - S.drag.f0));
    S.touchPt = { x: e.clientX, y: e.clientY };
  } else if (e.pointerType !== 'touch' && !S.drag) {
    if (Math.hypot(w.x - cue.x, w.y - cue.y) < 0.06) return;
    const ang = Math.atan2(w.y - cue.y, w.x - cue.x);
    if (e.shiftKey) { if (!S.fineBase) S.fineBase = { aim: S.aim.angle, ptr: ang }; setAim(S.fineBase.aim + wrap(ang - S.fineBase.ptr) * 0.12); }
    else { S.fineBase = null; setAim(ang); }
  }
});

function endDrag(e) {
  const d = S.drag; S.drag = null; S.touchPt = null;
  if (!d || S.phase !== 'aim') return;
  if (d.kind === 'stroke') {
    const r = d.stroke.release(d.s, (e && e.timeStamp ? e.timeStamp : performance.now()) / 1000);
    if (r.fire != null) shootFromStroke(r.fire); else { S.power = 0; S.guideDirty = true; }
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { S.drag = null; S.touchPt = null; S.power = 0; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelStroke(); });
canvas.addEventListener('wheel', (e) => {
  if (S.phase !== 'aim' || !humanTurn()) return;
  e.preventDefault();
  setAim(S.aim.angle + Math.sign(e.deltaY) * (e.shiftKey ? 0.0006 : 0.0025));
}, { passive: false });

{ // power strip: the same stroke, on a track (pull down, push or flick up)
  const track = $('powerStrip').querySelector('.track');
  let stroke = null, lastS = 0;
  const sOf = (ev) => { const r = track.getBoundingClientRect(); return clamp((ev.clientY - r.top - 15) / (r.height - 30), 0, 1.2) * 0.62; };
  track.addEventListener('pointerdown', (e) => {
    audio.init(); noteInput(e.pointerType === 'touch' ? 'touch' : 'mouse');
    if (S.phase !== 'aim' || !humanTurn()) return;
    stroke = newStroke({ arm: 0.06 }); S.strip = true; capture(track, e.pointerId);
    lastS = sOf(e); if (feedStroke(stroke, lastS, e.timeStamp / 1000)) stroke = null;
  });
  track.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    for (const ev of samplesOf(e)) { lastS = sOf(ev); if (feedStroke(stroke, lastS, ev.timeStamp / 1000)) { stroke = null; return; } }
  });
  track.addEventListener('pointerup', (e) => {
    if (!stroke) return;
    const r = stroke.release(lastS, e.timeStamp / 1000); stroke = null;
    if (S.phase === 'aim' && r.fire != null) shootFromStroke(r.fire); else cancelStroke();
  });
  track.addEventListener('pointercancel', () => { stroke = null; cancelStroke(); });
}

{ // spin widget and aim nudges
  const ball = document.querySelector('#spinWidget .ball');
  let active = false;
  const setFromEvent = (e) => {
    const r = ball.getBoundingClientRect();
    setSpin(((e.clientX - r.left) / r.width - 0.5) * 2 * 0.5, -((e.clientY - r.top) / r.height - 0.5) * 2 * 0.5);
  };
  ball.addEventListener('pointerdown', (e) => { active = true; capture(ball, e.pointerId); setFromEvent(e); audio.tick(); });
  ball.addEventListener('pointermove', (e) => { if (active) setFromEvent(e); });
  ball.addEventListener('pointerup', () => { active = false; });
  ball.addEventListener('dblclick', () => setSpin(0, 0));
  const nudge = (id, dir) => {
    const el = $(id); let timer = 0;
    const step = () => { if (S.phase === 'aim' && humanTurn()) setAim(S.aim.angle + dir * 0.0016); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); step(); timer = setInterval(step, 40); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(t, () => clearInterval(timer));
  };
  nudge('nudgeL', 1); nudge('nudgeR', -1);
}

const JUMP_STEPS = [0, 0.28, 0.4, 0.52];
function setJump(v) {
  S.jump = v; S.guideDirty = true;
  const b = $('jumpBtn'); if (!b) return;
  b.classList.toggle('on', v > 0);
  b.querySelector('b').textContent = v === 0 ? 'OFF' : String(JUMP_STEPS.indexOf(v));
}
const cycleJump = () => { setJump(JUMP_STEPS[(JUMP_STEPS.indexOf(S.jump) + 1) % JUMP_STEPS.length]); audio.tick(); };
$('jumpBtn').addEventListener('click', () => { audio.init(); cycleJump(); });

$('btnPlace').onclick = () => {
  audio.init();
  if (S.phase === 'place') commitPlace();
  else if (S.phase === 'aim') { S.match.rules.kitchen = S.match.rules.breakShot; enterPlace(); }
};

// ---- menus by keyboard or gamepad: move a highlight, press, go back
const modalOpen = () => !$('modal').classList.contains('hidden');
const navRoot = () => (modalOpen() ? $('modalSheet') : $('menuPanel'));
const navButtons = () => [...navRoot().querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
function navMove(dir) {
  const bs = navButtons(); if (!bs.length) return;
  let i = bs.findIndex((b) => b.dataset.pf === '1');
  i = i < 0 ? (dir > 0 ? 0 : bs.length - 1) : (i + dir + bs.length) % bs.length;
  bs.forEach((b) => { delete b.dataset.pf; });
  bs[i].dataset.pf = '1'; bs[i].scrollIntoView({ block: 'nearest' });
  audio.init(); audio.tick();
}
function navPress() { const b = navButtons().find((x) => x.dataset.pf === '1') || navButtons()[0]; if (b) b.click(); }
function navBack() {
  const back = navRoot().querySelector('[data-back]');
  if (back) back.click(); else if ($('sResume')) $('sResume').click();
}
const menuActive = () => S.screen === 'menu' || modalOpen();

// ---- gamepad
const pad = new PadInput();
const stickSens = () => ({ slow: 0.6, med: 1, fast: 1.6 }[settings.stick] ?? 1);
function padMenu(st) {
  if (st.edge.down || st.edge.right) navMove(1);
  else if (st.edge.up || st.edge.left) navMove(-1);
  if (st.edge.A) navPress();
  if (st.edge.B) navBack();
}
function padUpdate(dt) {
  const st = pad.poll();
  S.padConnected = !!st;
  if (!st) { S.padStroke = null; return; }
  if (st.any) noteInput('pad');
  if (menuActive()) { padMenu(st); return; }
  if (S.screen !== 'play') return;
  if (st.edge.start) { togglePause(); return; }
  if (S.paused) return;
  if (S.phase === 'replay') { if (st.edge.A || st.edge.B) stopReplay(); return; }
  if (!humanTurn()) return;
  if (st.edge.Y && (S.phase === 'aim' || S.phase === 'place')) { startReplay(); return; }
  if (S.phase === 'place' && S.placeGhost) {
    // the left stick carries the cue ball across the cloth; A puts it down
    const o = renderer.toWorld(0, 0), v = renderer.toWorld(st.lx, st.ly), k = renderer.view.s * renderer.cam.z;
    const sp = (st.fine ? 0.25 : 0.9) * dt;
    updateGhost({ x: S.placeGhost.x + (v.x - o.x) * k * sp, y: S.placeGhost.y + (v.y - o.y) * k * sp });
    if (st.edge.A) commitPlace();
    return;
  }
  if (S.phase !== 'aim') return;
  if (st.lx) setAim(S.aim.angle + aimRate(st.lx, st.fine, stickSens()) * dt);
  if (st.edge.left) setAim(S.aim.angle + 0.004);
  if (st.edge.right) setAim(S.aim.angle - 0.004);
  if (st.edge.up) { S.keyPower = clamp(S.keyPower + 0.05, 0.05, 1); S.power = S.keyPower; S.guideDirty = true; }
  if (st.edge.down) { S.keyPower = clamp(S.keyPower - 0.05, 0.05, 1); S.power = S.keyPower; S.guideDirty = true; }
  if (st.edge.X) cycleJump();
  if (st.edge.LB) setSpin(0, 0);
  if (st.down.RB) {                                  // right stick moves the spin dot while RB is held
    if (st.rx || st.ry) setSpin(S.spin.a + st.rx * dt * 0.5, S.spin.b - st.ry * dt * 0.5);
    S.padStroke = null;
    return;
  }
  // the cue: pull the right stick down to draw back, push up to strike
  const s = st.ry * 0.62;
  if (!S.padStroke && st.ry > 0.12) S.padStroke = newStroke({ startSpeed: 0.25, arm: 0.05 });
  if (S.padStroke) {
    const fired = feedStroke(S.padStroke, s, S.time);
    if (!fired && S.padStroke && st.ry < 0.05) {     // the stick came home without striking
      const r = S.padStroke.release(s, S.time); S.padStroke = null;
      if (r.fire != null) shootFromStroke(r.fire); else { S.power = 0; S.guideDirty = true; }
    }
    if (S.padStroke && st.edge.B) cancelStroke();
    if (S.padStroke && st.edge.A && S.power > 0.04) shootFromStroke(S.power);
  } else if (st.edge.A) {
    const p = S.keyPower; S.power = p; shootFromStroke(p);
  }
}

// ---- keyboard
window.addEventListener('keydown', (e) => {
  noteInput('kbd');
  const k = e.key;
  if (menuActive() && !e.ctrlKey && !e.metaKey) {
    if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); navMove(1); return; }
    if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); navMove(-1); return; }
    if ((k === 'Enter' || k === ' ') && navButtons().some((b) => b.dataset.pf === '1')) { e.preventDefault(); navPress(); return; }
    if (k === 'Escape' && !S.paused) { navBack(); return; }
  }
  if (e.repeat && !['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(k)) return;
  if ((k === 'Escape' || k === 'p' || k === 'P') && S.screen === 'play' && S.phase !== 'over') { togglePause(); return; }
  if (k === 'm' || k === 'M') { toggleMute(); return; }
  if (k === 'f' || k === 'F') { toggleFullscreen(); return; }
  if (S.screen !== 'play' || S.paused) return;
  if (k === 'r' || k === 'R') { if (S.phase === 'replay') stopReplay(); else startReplay(); return; }
  if (S.phase === 'replay') { stopReplay(); return; }
  if (S.phase === 'place' && (k === 'Enter' || k === ' ')) { e.preventDefault(); commitPlace(); return; }
  if (S.phase !== 'aim' || !humanTurn()) return;
  if (k === 'j' || k === 'J') { cycleJump(); return; }
  const spinStep = 0.05;
  if (k === 'w' || k === 'W') { setSpin(S.spin.a, S.spin.b + spinStep); return; }
  if (k === 's' || k === 'S') { setSpin(S.spin.a, S.spin.b - spinStep); return; }
  if (k === 'a' || k === 'A') { setSpin(S.spin.a - spinStep, S.spin.b); return; }
  if (k === 'd' || k === 'D') { setSpin(S.spin.a + spinStep, S.spin.b); return; }
  if (k === 'c' || k === 'C') { setSpin(0, 0); return; }
  const step = e.shiftKey ? 0.0006 : 0.004;
  if (k === 'ArrowLeft') { e.preventDefault(); setAim(S.aim.angle + step); }
  else if (k === 'ArrowRight') { e.preventDefault(); setAim(S.aim.angle - step); }
  else if (k === 'ArrowUp') { e.preventDefault(); S.keyPower = clamp(S.keyPower + 0.05, 0.05, 1); S.power = S.keyPower; S.guideDirty = true; }
  else if (k === 'ArrowDown') { e.preventDefault(); S.keyPower = clamp(S.keyPower - 0.05, 0.05, 1); S.power = S.keyPower; S.guideDirty = true; }
  else if (k === ' ' || k === 'Enter') { e.preventDefault(); const p = S.keyPower; S.power = p; shootFromStroke(p); }
});
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') S.fineBase = null; });

// ---------------------------------------------------------------- pause, chrome
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    } else await document.exitFullscreen();
  } catch { /* not allowed here; fullscreen is a nicety */ }
}
let wakeLock = null;
async function keepAwake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* denied */ }
}
function applyHand() { document.body.classList.toggle('lefty', settings.hand === 'left'); }

function togglePause() {
  if (S.paused) { S.paused = false; ui.closeSheet(); if (audio.ctx) audio.ctx.resume(); return; }
  S.paused = true; audio.roll(0);
  ui.pause({ onResume: () => { S.paused = false; }, onRestart: () => { S.paused = false; startSession({ ...S.session }); }, onQuit: () => { S.paused = false; enterMenu('home'); } });
}
function toggleMute() {
  audio.init();
  audio.setMasterMuted(!audio.masterMuted);
  $('btnSound').classList.toggle('off', audio.masterMuted);
}
$('btnPause').onclick = togglePause;
$('btnSound').onclick = toggleMute;
$('btnReplay').onclick = () => startReplay();
$('btnRerack').onclick = () => startSession({ ...S.session });
$('btnHint').onclick = showSolution;
if (!document.documentElement.requestFullscreen) $('btnFull').classList.add('hidden');
$('btnFull').onclick = toggleFullscreen;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.screen === 'play' && !S.paused && S.phase !== 'over') togglePause();
  if (!document.hidden && S.screen === 'play') keepAwake();
});

function onResize() { renderer.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2)); }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

// ---------------------------------------------------------------- boot
juice.shakeScale = shakeScale();
applyHand();
noteInput(isCoarse() ? 'touch' : 'mouse');
audio.setSfx(settings.sound === 'on'); audio.musicOn = settings.music === 'on';
applyHall(settings.hall);
applyGear();
renderer.setLayout({ menu: true });
onResize();
ui.show('home');
startAttract();
requestAnimationFrame(frame);
{
  const q = new URLSearchParams(location.search);
  if (q.get('hall') && HALL_BY_ID[q.get('hall')]) { settings.hall = q.get('hall'); applyHall(settings.hall); }
  if (q.has('play')) startSession({ type: 'quick', kind: q.get('game') || 'eight', opp: q.get('rival') || '1', hall: settings.hall });
  if (q.get('trick')) actions.startChallenge(q.get('trick'));
  if (q.has('daily')) actions.startDaily();
  if (q.get('screen')) ui.show(q.get('screen'));
}

// test hook: let the AI play the human seat for one shot
function autoHuman(levelId = 2) {
  if (S.phase === 'place') { const pl = planNow({ sim: S.match.sim, rules: S.match.rules, table: S.match.table, level: LEVELS[levelId], rand: aiRand }); if (pl.place) placeCue(S.match, pl.place.x, pl.place.y); S.match.rules.ballInHand = false; enterAim(); }
  if (S.phase !== 'aim') return false;
  const plan = planNow({ sim: S.match.sim, rules: S.match.rules, table: S.match.table, level: LEVELS[levelId], rand: aiRand });
  if (plan.place) placeCue(S.match, plan.place.x, plan.place.y);
  fire(plan, powerFromSpeed(plan.speed));
  return true;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is a bonus */ }); });
}

window.__pool = { autoHuman, planNow, LEVELS, S, settings, profile, fire, humanPlan, audio, renderer, juice, onTable, speedFromPower, powerFromSpeed, nextPhase, enterPlace, enterAim, commitPlace, startReplay, startSession, enterMenu, actions, ui, decisiveIds };
