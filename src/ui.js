// Menu screens and modal sheets. DOM only: state lives in the profile and
// settings objects handed in, and every button goes out through `actions`.

import { HALLS, HALL_BY_ID } from './halls.js';
import { GAMES } from './rules.js';
import { LEVELS } from './ai.js';
import { CUES, CHALKS, BALLSETS, xpForLevel, levelForXp } from './gear.js';
import { RIVALS, rivalsOf, hallOpen, nextRival, GOALS } from './circuit.js';
import { CHALLENGES, LESSONS } from './challenges.js';
import { localDateString, dailySeed } from './profile.js';
import { ACHIEVEMENTS } from './achievements.js';
import { cleanCode } from './online.js';
import { Renderer } from './render.js';
import { buildTable, BALL_R, HEAD_X, FOOT_X } from './table.js';
import { BallSprite } from './ballshader.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const starsHtml = (n, of = 3) => `<span class="stars">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
const KIND_LABEL = { eight: '8-BALL', nine: '9-BALL', onepocket: 'ONE-POCKET' };
const BALL_COLORS = ['#f6c344', '#2456a6', '#d43a2f', '#5b3a8e', '#e07b2a', '#1e7a4c', '#7a2e35', '#232323'];
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M5 3h14v2h3v4a5 5 0 0 1-5 5h-.42A6 6 0 0 1 13 17.92V20h4v2H7v-2h4v-2.08A6 6 0 0 1 7.42 14H7a5 5 0 0 1-5-5V5h3zm14 4v2a3 3 0 0 0 3-3h-3zM5 7H2a3 3 0 0 0 3 2V7z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7 6h-3a15 15 0 0 0-1.3-3.3A8 8 0 0 1 19 8zM12 4a13 13 0 0 1 1.9 4h-3.8A13 13 0 0 1 12 4zM4.3 16a8 8 0 0 1 0-8h3.3a16 16 0 0 0 0 8zm.7 2h3a15 15 0 0 0 1.3 3.3A8 8 0 0 1 5 18zm3-10a14 14 0 0 0 0 8h3.3a100 100 0 0 1 0-8zm4 12a13 13 0 0 1-1.9-4h3.8A13 13 0 0 1 12 20zm2.3-12h3.4a14 14 0 0 1 0 8h-3.4a100 100 0 0 0 0-8zm.4 13.3A15 15 0 0 0 16 18h3a8 8 0 0 1-4.3 3.3z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5 1.2 2.6h-2.4zm7 1-1 2.6-1.7-1.7zm3 7-2.6 1.2V8.8zm-1 9-2.6-1 1.7-1.7zM12 22l-1.2-2.6h2.4zM5 21l1-2.6 1.7 1.7zM2 12l2.6-1.2v2.4zm3-9 2.6 1-1.7 1.7z" transform="scale(.92) translate(1 1)"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  target: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3zm2 2v13a1 1 0 0 0 1 1h11V6a1 1 0 0 0-1-1z"/></svg>',
};

// Hall thumbnails are painted by the game's own room and table painters, so
// the carousel shows the real table you are about to play on, not a picture
// of one. A fresh rack and the cue ball are stamped on top with the real
// ball sprites. Painted once per hall and ball set, then cached.
const thumbPainter = new Renderer(document.createElement('canvas'));
const thumbTable = buildTable();
const thumbCache = new Map();
const RACK = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
function hallThumb(hall, setId) {
  const key = `${hall.id}:${setId}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const W = 720, H = 228, SS = 1.5;
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * SS); cv.height = Math.round(H * SS);
  const ctx = cv.getContext('2d');
  ctx.scale(SS, SS);
  hall.paint(ctx, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  const s = Math.min((W * 0.985) / 2.88, (H * 0.985) / 1.61);
  ctx.scale(s, -s);
  thumbPainter.paintTable(ctx, hall, thumbTable);
  ctx.restore();
  const dia = Math.max(10, Math.round(2 * BALL_R * s));
  const drawBall = (id, x, y) => {
    const px = W / 2 + x * s, py = H / 2 - y * s;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(px, py + dia * 0.16, dia * 0.46, dia * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    const spr = new BallSprite(id, dia);
    ctx.drawImage(spr.render([1, 0, 0, 0], 0), px - dia / 2, py - dia / 2, dia, dia);
  };
  let n = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) {
    drawBall(RACK[n++], FOOT_X + row * BALL_R * 1.74, (k - row / 2) * 2 * BALL_R * 1.01);
  }
  drawBall(0, HEAD_X, 0);
  thumbCache.set(key, cv);
  return cv;
}

export function createUI({ profile, settings, saveSettings, actions, audio }) {
  const panel = $('menuPanel');
  const modal = $('modal'), sheet = $('modalSheet');
  let screen = 'home';

  const click = (fn) => { audio.init(); audio.tick(); fn(); };

  function mount(html, wire) {
    panel.innerHTML = `<div class="screen">${html}</div>`;
    panel.scrollTop = 0;
    if (wire) wire(panel);
  }
  const backBtn = (to = 'home') => `<button class="linkbtn back" data-back="${to}">‹ Back</button>`;
  function wireBack(root) { root.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => click(() => show(b.dataset.back)); }); }

  // ---------------------------------------------------------------- home
  // One centered club card over the live table of the chosen hall. Selection
  // (hall, mode, game, rival) and launch (the Play button) stay separate, and
  // the button always says exactly what is about to happen.
  function home() {
    const pr = profile.progress();
    const nr = nextRival(profile);
    const today = localDateString();
    const d = profile.data.daily;
    const todayDone = d.todayDate === today;
    const totalStars = profile.totalStars('circuit') + profile.totalStars('challenges');
    const dailyHall = HALL_BY_ID[HALLS[dailySeed(today) % HALLS.length].id];
    let mode = 'quick';
    let hallIdx = Math.max(0, HALLS.findIndex((h) => h.id === settings.hall));
    const kinds = ['eight', 'nine', 'straight', 'onepocket'];
    const opps = [...LEVELS.map((l) => ({ v: String(l.id), t: l.name })), { v: '2p', t: 'Two players' }, { v: 'demo', t: 'Watch' }];
    const MODES = [
      ['quick', 'Quick Match', ICON.play],
      ['circuit', 'Circuit', ICON.trophy],
      ['tricks', 'Trick Shots', ICON.star],
      ['daily', 'Daily Run', ICON.sun],
      ['blitz', 'Blitz', ICON.bolt],
      ['online', 'Online', ICON.globe],
    ];
    mount(`
      <div class="m-head">
        <div class="m-kicker">A members' billiard hall</div>
        <h1 class="m-word">GH<i class="ghostO"></i>ST&nbsp;BALL</h1>
        <p class="m-title">Real spin. Real wood. Nothing to buy.</p>
      </div>
      <button class="standing" data-a="profile">
        <span class="ring" style="--p:${Math.round(pr.frac * 100)}"><i>${pr.level}</i></span>
        <span class="st-tx"><b>Chalk level ${pr.level}</b><span>${pr.into} of ${pr.need} to level ${pr.level + 1}</span></span>
        <span class="st-bar"><i style="width:${Math.round(pr.frac * 100)}%"></i></span>
        <span class="st-right"><b>${totalStars} stars</b><span>daily streak ${d.streak}</span></span>
      </button>
      <div class="label m-label">The table</div>
      <div class="car">
        <div class="carView">
          <div class="carTrack" id="carTrack">${HALLS.map((h) => `<div class="carSlide" data-hall="${h.id}"></div>`).join('')}</div>
          <button class="carArrow prev" id="carPrev" aria-label="Previous hall">&#8249;</button>
          <button class="carArrow next" id="carNext" aria-label="Next hall">&#8250;</button>
          <span class="carCount" id="carCount"></span>
          <div class="carCap"><b id="carName"></b><span class="carMeta" id="carMeta"></span><span class="carLine" id="carLine"></span></div>
        </div>
        <div class="carDots" id="carDots">${HALLS.map((h, i) => `<button class="cdot" data-i="${i}" aria-label="${esc(h.name)}"></button>`).join('')}</div>
      </div>
      <div class="label m-label">Play</div>
      <div class="modes" id="mModes">${MODES.map(([v, t, ic]) => `<button class="mode ${v === mode ? 'sel' : ''}" data-mode="${v}"><span class="mic">${ic}</span>${t}</button>`).join('')}</div>
      <div class="mOpts" id="mOpts"></div>
      <button class="playbtn" id="mPlay" data-pf="1"><span class="pl-top">Play</span><span class="pl-sum" id="mSum"></span></button>
      <div class="mfoot">
        <button class="linkbtn" data-a="how">How to play</button><span class="fdot">·</span>
        <button class="linkbtn" data-a="practice">Practice</button><span class="fdot">·</span>
        <button class="linkbtn" data-a="locker">Locker</button><span class="fdot">·</span>
        <button class="linkbtn" data-a="profile">Profile</button><span class="fdot">·</span>
        <button class="linkbtn" data-a="settings">Settings</button><span class="fdot">·</span>
        <a class="linkbtn" href="https://github.com/builtbysai/Ghost-Ball" target="_blank" rel="noopener">GitHub</a>
      </div>
      <div class="ver">Ghost Ball · everything here is earned by playing</div>`,
    (root) => {
      const track = root.querySelector('#carTrack');
      const slides = [...track.children];
      const playBtn = root.querySelector('#mPlay'), playTop = playBtn.querySelector('.pl-top');
      const opts = root.querySelector('#mOpts');

      slides.forEach((sl) => {
        const cv = hallThumb(HALL_BY_ID[sl.dataset.hall], profile.data.equipped.ballset);
        cv.className = 'carImg';
        sl.appendChild(cv);
        sl.onclick = () => click(() => setHall(HALLS.findIndex((h) => h.id === sl.dataset.hall)));
      });

      function setHall(i) {
        hallIdx = (i + HALLS.length) % HALLS.length;
        const h = HALLS[hallIdx];
        track.style.transform = `translateX(${-hallIdx * 100}%)`;
        root.querySelector('#carName').textContent = h.name;
        root.querySelector('#carMeta').textContent = h.year;
        root.querySelector('#carLine').textContent = h.tagline;
        root.querySelector('#carCount').textContent = `${hallIdx + 1} / ${HALLS.length}`;
        root.querySelectorAll('.cdot').forEach((dt, k) => dt.classList.toggle('on', k === hallIdx));
        slides.forEach((sl, k) => { sl.classList.toggle('on', k === hallIdx); sl.setAttribute('aria-hidden', k === hallIdx ? 'false' : 'true'); });
        // the live table behind the card re-skins the moment the hall changes
        if (settings.hall !== h.id) { settings.hall = h.id; saveSettings(); actions.previewHall(h.id); }
        refreshPlay();
      }
      root.querySelector('#carPrev').onclick = () => click(() => setHall(hallIdx - 1));
      root.querySelector('#carNext').onclick = () => click(() => setHall(hallIdx + 1));
      root.querySelectorAll('.cdot').forEach((dt) => { dt.onclick = () => click(() => setHall(+dt.dataset.i)); });

      const seg = (list, cur, attr) => `<div class="seg">${list.map((o) => `<button class="segbtn ${String(o.v) === String(cur) ? 'sel' : ''}" data-${attr}="${o.v}">${o.t}</button>`).join('')}</div>`;
      function renderOpts() {
        if (mode === 'quick') {
          opts.innerHTML = `
            <div class="optrow"><span class="optlab">Game</span>${seg(kinds.map((k) => ({ v: k, t: GAMES[k].name })), settings.kind, 'k')}</div>
            <div class="optrow"><span class="optlab">Rival</span>${seg(opps, settings.opp, 'o')}</div>`;
          opts.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => click(() => { settings.kind = b.dataset.k; saveSettings(); renderOpts(); }); });
          opts.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => click(() => { settings.opp = b.dataset.o; saveSettings(); renderOpts(); }); });
        } else if (mode === 'circuit') {
          opts.innerHTML = `<div class="optrow"><span class="optlab">Next rival</span><div class="optline">${nr ? `<b>Face ${esc(nr.name)} · ${HALL_BY_ID[nr.hall].name}</b><span>${KIND_LABEL[nr.kind] || ''} · three stars for a clean win</span>` : `<b>All fifteen rivals beaten</b><span>Replay any hall to chase three stars</span>`}</div><span class="optstat">${profile.totalStars('circuit')} of 45</span><button class="mini-link" id="mBrowse">All rivals ›</button></div>`;
        } else if (mode === 'tricks') {
          const fu = CHALLENGES.find((c) => !(profile.data.challenges[c.id] > 0));
          opts.innerHTML = `<div class="optrow"><span class="optlab">Next shot</span><div class="optline">${fu ? `<b>Shot ${String(CHALLENGES.indexOf(fu) + 1).padStart(2, '0')} · ${esc(fu.name)}</b><span>One setup, one solution</span>` : `<b>Every shot solved</b><span>Replay any of them for three stars</span>`}</div><span class="optstat">${profile.totalStars('challenges')} of ${CHALLENGES.length * 3}</span><button class="mini-link" id="mBrowse">All shots ›</button></div>`;
        } else if (mode === 'daily') {
          opts.innerHTML = `<div class="optrow"><span class="optlab">Today</span><div class="optline"><b>Same rack for everyone, at ${dailyHall.name}</b><span>${todayDone ? `Today's best ${d.todayBest.toLocaleString()}` : 'Not played yet today'} · streak ${d.streak}</span></div><span class="optstat">${d.streak} day streak</span></div>`;
        } else if (mode === 'blitz') {
          opts.innerHTML = `<div class="optrow"><span class="optlab">The clock</span><div class="optline"><b>60 seconds, one rack after another</b><span>Streaks pay double</span></div><span class="optstat">best ${profile.data.blitz.best.toLocaleString()}</span></div>`;
        } else if (mode === 'online') {
          opts.innerHTML = `<div class="optrow"><span class="optlab">Two players</span><div class="optline"><b>A private table for two</b><span>Host one and share the code, or join a friend's</span></div></div>`;
        }
        const br = opts.querySelector('#mBrowse');
        if (br) br.onclick = () => click(() => show(mode === 'circuit' ? 'circuit' : 'tricks'));
        refreshPlay();
      }
      function refreshPlay() {
        const hall = HALLS[hallIdx];
        let top = 'Play', s = '';
        if (mode === 'quick') s = `${(GAMES[settings.kind] || GAMES.eight).name} · ${oppLabel()} · ${hall.name}`;
        else if (mode === 'circuit') s = nr ? `The Circuit · ${nr.name} at ${HALL_BY_ID[nr.hall].name}` : 'The Circuit · chase the stars';
        else if (mode === 'tricks') { const fu = CHALLENGES.find((c) => !(profile.data.challenges[c.id] > 0)); s = fu ? `Trick shot ${String(CHALLENGES.indexOf(fu) + 1).padStart(2, '0')} · ${fu.name}` : 'Trick shots · all solved'; }
        else if (mode === 'daily') s = `Daily Run · today at ${dailyHall.name}`;
        else if (mode === 'blitz') s = `Blitz · 60 seconds · ${hall.name}`;
        else if (mode === 'online') { top = 'Go online'; s = 'Private table · host or join with a code'; }
        playTop.textContent = top;
        root.querySelector('#mSum').textContent = s;
      }
      root.querySelectorAll('[data-mode]').forEach((b) => {
        b.onclick = () => click(() => { mode = b.dataset.mode; root.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('sel', x === b)); renderOpts(); });
      });
      playBtn.onclick = () => click(() => {
        if (mode === 'quick') return actions.startQuick({ kind: settings.kind, opp: settings.opp, hall: settings.hall });
        if (mode === 'circuit') return nr ? actions.startRival(nr.idx) : show('circuit');
        if (mode === 'tricks') { const fu = CHALLENGES.find((c) => !(profile.data.challenges[c.id] > 0)); return fu ? actions.startChallenge(fu.id) : show('tricks'); }
        if (mode === 'daily') return actions.startDaily();
        if (mode === 'blitz') return actions.startBlitz(settings.hall);
        if (mode === 'online') return show('online');
      });
      root.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => click(() => show(b.dataset.a)); });
      setHall(hallIdx);
      renderOpts();
    });
  }
  const oppLabel = () => (settings.opp === '2p' ? 'Two players' : settings.opp === 'demo' ? 'AI vs AI' : LEVELS[+settings.opp].name);

  // ---------------------------------------------------------------- quick match / practice
  function hallRows(selected) {
    return `<div class="halls">${HALLS.map((h) => `
      <button class="hallrow ${h.id === selected ? 'sel' : ''}" data-hall="${h.id}"><i class="sw" style="--rail:${h.rail.a};--cloth:${h.cloth.base}"></i><div><b>${h.name}</b><span>${esc(h.tagline)}</span></div><em class="yr">${h.year}</em></button>`).join('')}</div>`;
  }
  function wireHalls(root, set) {
    root.querySelectorAll('[data-hall]').forEach((b) => {
      b.onclick = () => click(() => { set(b.dataset.hall); b.parentElement.querySelectorAll('[data-hall]').forEach((x) => x.classList.toggle('sel', x === b)); });
    });
  }
  function hallChips(selected) {
    return `<div class="chips hallchips">${HALLS.map((h) => `<button class="chip hallchip ${h.id === selected ? 'sel' : ''}" data-hall="${h.id}"><i class="sw" style="--rail:${h.rail.a};--cloth:${h.cloth.base}"></i>${h.name}</button>`).join('')}</div>`;
  }

  function quick() {
    const kinds = ['eight', 'nine', 'straight', 'onepocket'];
    mount(`${backBtn()}
      <div class="scr-title">Quick Match</div><p class="scr-sub">A single frame. Pick a hall, a game and a rival.</p>
      <div class="label">The Hall</div>${hallChips(settings.hall)}
      <div class="label">The Game</div>
      <div class="chips" id="qKind">${kinds.map((k) => `<button class="chip ${settings.kind === k ? 'sel' : ''}" data-k="${k}">${GAMES[k].name}<small>${GAMES[k].blurb}</small></button>`).join('')}</div>
      <div class="label">The Rival</div>
      <div class="chips" id="qOpp">${[...LEVELS.map((l) => ({ v: String(l.id), t: l.name, s: l.blurb })), { v: '2p', t: 'Two players', s: 'Same screen' }, { v: 'demo', t: 'Watch', s: 'AI vs AI' }].map((o) => `<button class="chip ${settings.opp === o.v ? 'sel' : ''}" data-o="${o.v}">${o.t}<small>${o.s}</small></button>`).join('')}</div>
      <button class="mbtn primary startbtn" id="qGo"><span class="num">${ICON.play}</span><div class="tt"><b>Break</b><span id="qSum"></span></div><span class="go">›</span></button>`,
    (root) => {
      const sum = () => { const s = root.querySelector('#qSum'); if (s) s.textContent = `${GAMES[settings.kind].name} · ${oppLabel()} · ${HALL_BY_ID[settings.hall].name}`; };
      sum();
      wireBack(root);
      wireHalls(root, (id) => { settings.hall = id; saveSettings(); actions.previewHall(id); sum(); });
      root.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => click(() => { settings.kind = b.dataset.k; saveSettings(); root.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('sel', x === b)); sum(); }); });
      root.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => click(() => { settings.opp = b.dataset.o; saveSettings(); root.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('sel', x === b)); sum(); }); });
      root.querySelector('#qGo').onclick = () => click(() => actions.startQuick({ kind: settings.kind, opp: settings.opp, hall: settings.hall }));
    });
  }

  function practice() {
    mount(`${backBtn()}<div class="scr-title">Practice</div><p class="scr-sub">A free table with no rules. Rack, break, try things. Use Re-rack in the corner to reset.</p>
      <div class="label">The Hall</div>${hallRows(settings.hall)}
      <button class="mbtn primary startbtn" id="pGo"><span class="num">${ICON.target}</span><div class="tt"><b>Start practice</b><span>No opponent, no pressure</span></div><span class="go">›</span></button>`,
    (root) => {
      wireBack(root);
      wireHalls(root, (id) => { settings.hall = id; saveSettings(); actions.previewHall(id); });
      root.querySelector('#pGo').onclick = () => click(() => actions.startPractice(settings.hall));
    });
  }

  // ---------------------------------------------------------------- circuit
  function circuit() {
    const nr = nextRival(profile);
    const openHall = nr ? nr.hall : (HALLS.find((h) => hallOpen(profile, h.id)) || {}).id;
    const blocks = HALLS.map((h, hi) => {
      const open = hallOpen(profile, h.id);
      const rs = rivalsOf(h.id);
      const earned = rs.reduce((a, r, k) => a + (profile.data.circuit[`${h.id}:${k}`] || 0), 0);
      const expanded = open && h.id === openHall;
      const rows = rs.map((r, k) => {
        const st = profile.data.circuit[`${h.id}:${k}`] || 0;
        const prevBeaten = k === 0 || (profile.data.circuit[`${h.id}:${k - 1}`] || 0) >= 1;
        const playable = open && prevBeaten;
        const isNext = nr && nr.idx === r.idx;
        const goals = (r.goals || []).map((g) => GOALS[g].label).join(' \u00b7 ');
        return `<button class="rival ${isNext ? 'next' : ''}" data-r="${r.idx}" ${playable ? '' : 'disabled'} title="${esc(goals)}">
          <i class="mono" style="--c:${BALL_COLORS[r.idx % BALL_COLORS.length]}">${esc(r.name[0])}</i><div class="who"><b>${esc(r.name)}</b><span>${esc(r.bio)}</span></div>
          <span class="kind">${KIND_LABEL[r.kind] || ''}</span>${starsHtml(st)}</button>`;
      }).join('');
      return `<div class="cir-hall ${open ? '' : 'locked'} ${expanded ? '' : 'folded'}"><button class="cir-head" data-fold="${h.id}" ${open ? '' : 'disabled'}><b>${hi + 1}. ${h.name}</b><span class="cir-meta">${h.year}${open ? ` \u00b7 ${earned} of 9 stars` : ' \u00b7 Locked'}</span><span class="chev">${expanded ? '\u25be' : '\u203a'}</span></button><div class="cir-body">${rows}${open ? '' : '<p class="fine">Beat all three rivals in the previous hall to open this one.</p>'}</div></div>`;
    }).join('');
    mount(`${backBtn()}<div class="scr-title">The Circuit</div><p class="scr-sub">Fifteen rivals across five halls. A win is one star. Run the table without a scratch, or pot three in a row, to make it three.</p>${blocks}`,
    (root) => {
      wireBack(root);
      root.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => click(() => actions.startRival(+b.dataset.r)); });
      root.querySelectorAll('[data-fold]').forEach((b) => {
        b.onclick = () => click(() => {
          const hall = b.closest('.cir-hall');
          const nowFolded = hall.classList.toggle('folded');
          b.querySelector('.chev').textContent = nowFolded ? '\u203a' : '\u25be';
        });
      });
    });
  }

  // ---------------------------------------------------------------- trick shots
  function tricks() {
    const firstUnsolved = CHALLENGES.find((c) => !(profile.data.challenges[c.id] > 0));
    const lessonTiles = LESSONS.map((c, i) => `<button class="tile lesson" data-c="${c.id}"><small>Lesson ${i + 1}</small><b>${esc(c.name)}</b><span class="stars"><i class="${profile.data.lessons[c.id] ? 'on' : ''}">✓</i></span></button>`).join('');
    const tiles = CHALLENGES.map((c, i) => {
      const st = profile.data.challenges[c.id] || 0;
      const cls = st > 0 ? 'solved' : (firstUnsolved && c.id === firstUnsolved.id ? 'nextup' : '');
      return `<button class="tile ${cls}" data-c="${c.id}"><small>Shot ${String(i + 1).padStart(2, '0')}</small><b>${esc(c.name)}</b>${starsHtml(st)}</button>`;
    }).join('');
    mount(`${backBtn()}<div class="scr-title">Trick Shots</div><p class="scr-sub">One setup, one solution. Solve it first try for three stars. Banks, kicks, combos, draw, follow and English.</p><div class="label">Lessons</div><div class="tiles">${lessonTiles}</div><div class="label">Challenges</div><div class="tiles">${tiles}</div>`,
    (root) => { wireBack(root); root.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => click(() => actions.startChallenge(b.dataset.c)); }); });
  }

  // ---------------------------------------------------------------- locker
  function locker() {
    const lvl = profile.level();
    const sect = (title, kind, list, current) => `<div class="label">${title}</div><div class="chips locker-row">${list.map((it) => {
      const locked = it.level > lvl;
      const on = it.id === current;
      const swatch = kind === 'cue' ? `<span class="cuevis"><i class="tip" style="background:#d9c9a3"></i><i class="shaft" style="background:linear-gradient(180deg, ${it.shaft}, ${it.shaft})"></i><i class="joint"></i><i class="wrap" style="background-color:${it.wrap}"></i><i class="butt" style="background:${it.butt}"></i><i class="cap"></i></span>`
        : kind === 'chalk' ? `<span class="chalkvis" style="background:${it.color};display:block"></span>`
        : `<span class="setvis">${it.colors.slice(1, 6).map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
      return `<button class="chip gearcard ${on ? 'sel' : ''} ${locked ? 'locked' : ''}" data-g="${kind}:${it.id}">${it.name}<small>${locked ? `Chalk level ${it.level}` : on ? 'On the table now' : it.desc || 'Tap to equip'}</small>${swatch}${on ? '<span class="tag-on">Equipped</span>' : ''}</button>`;
    }).join('')}</div>`;
    const eq = profile.data.equipped;
    mount(`${backBtn()}<div class="scr-title">Locker</div><p class="scr-sub">Everything here is earned by playing. No prices, no timers. Chalk level ${lvl}.</p>
      ${sect('Cue', 'cue', CUES, eq.cue)}${sect('Chalk', 'chalk', CHALKS, eq.chalk)}${sect('Ball set', 'ballset', BALLSETS, eq.ballset)}`,
    (root) => {
      wireBack(root);
      root.querySelectorAll('[data-g]').forEach((b) => {
        b.onclick = () => {
          const [kind, id] = b.dataset.g.split(':');
          if (profile.equip(kind, id)) { audio.init(); audio.select(); actions.gearChanged(); locker(); } else { audio.init(); audio.foul(); }
        };
      });
    });
  }

  // ---------------------------------------------------------------- settings / how
  const OPT = {
    assist: [['full', 'Full path'], ['line', 'Guide line'], ['none', 'None']],
    pocket: [['forgiving', 'Forgiving'], ['standard', 'Standard'], ['tournament', 'Tournament']],
    cloth: [['fast', 'Fast'], ['standard', 'Standard'], ['slow', 'Slow']],
    sound: [['on', 'On'], ['off', 'Off']], music: [['on', 'On'], ['off', 'Off']],
    shake: [['off', 'Off'], ['low', 'Low'], ['full', 'Full']], haptics: [['on', 'On'], ['off', 'Off']],
    hand: [['right', 'Right'], ['left', 'Left']], stroke: [['low', 'Low'], ['med', 'Medium'], ['high', 'High']], stick: [['slow', 'Slow'], ['med', 'Medium'], ['fast', 'Fast']],
  };
  const LABEL = { assist: 'Aim assist', pocket: 'Pockets', cloth: 'Cloth', sound: 'Sound', music: 'Music', shake: 'Screen shake', haptics: 'Haptics', hand: 'Cue side', stroke: 'Stroke feel', stick: 'Aim stick' };
  const GROUPS = [
    ['The Table', ['pocket', 'cloth']],
    ['Assists', ['assist']],
    ['Sound and Feel', ['sound', 'music', 'shake', 'haptics']],
    ['Controls', ['hand', 'stroke', 'stick']],
  ];
  function settingsRows() {
    return GROUPS.map(([g, keys]) => `<div class="setgroup"><div class="label">${g}</div>${keys.map((k) => `<div class="setrow"><label>${LABEL[k]}</label><div class="seg3" data-set="${k}">${OPT[k].map(([v, t]) => `<button class="chip ${settings[k] === v ? 'sel' : ''}" data-v="${v}">${t}</button>`).join('')}</div></div>`).join('')}</div>`).join('');
  }
  function wireSettings(root) {
    root.querySelectorAll('.seg3').forEach((seg) => {
      seg.querySelectorAll('.chip').forEach((b) => {
        b.onclick = () => {
          const key = seg.dataset.set; settings[key] = b.dataset.v; saveSettings();
          seg.querySelectorAll('.chip').forEach((x) => x.classList.toggle('sel', x === b));
          audio.init(); audio.tick(); actions.settingChanged(key);
        };
      });
    });
    const r = root.querySelector('#resetBtn');
    if (r) r.onclick = () => { if (r.dataset.armed) { actions.resetProgress(); } else { r.dataset.armed = '1'; r.textContent = 'Tap again to erase everything'; } };
  }
  function settingsScreen() {
    mount(`${backBtn()}<div class="scr-title">Settings</div><div class="setcols">${settingsRows()}</div><p class="fine">Pocket and cloth changes apply to the next match. Screen shake also respects your system's reduced-motion setting.</p>
      <div class="danger"><b>Reset progress</b><p>Erases rivals, stars, chalk levels, gear and stats. No way back.</p><button class="btn" id="resetBtn">Reset all progress</button></div>`,
    (root) => { wireBack(root); wireSettings(root); });
  }
  function how() {
    const step = (n, t, p) => `<div class="howstep"><span class="n">${n}</span><div><b>${t}</b><p>${p}</p></div></div>`;
    const nextLesson = LESSONS.find((l) => !profile.data.lessons[l.id]);
    const lessonsDone = LESSONS.filter((l) => profile.data.lessons[l.id]).length;
    mount(`${backBtn()}<div class="scr-title">How to play</div><p class="scr-sub">Shot with a real stroke. Three moves cover almost everything.</p>
      ${nextLesson ? `<button class="mbtn primary lessoncard" id="lessonCard"><span class="num">${ICON.book}</span><div class="tt"><b>Learn the basics</b><span>${lessonsDone} of ${LESSONS.length} done · next: ${esc(nextLesson.name)}. Aim, power, cut, draw and English, one shot at a time.</span></div><span class="go">›</span></button>` : ''}
      <div class="howsteps">
        ${step(1, 'Aim', 'Drag to swing the cue. Lines show where each ball goes. <kbd>Shift</kbd>, wheel or arrows trim.')}
        ${step(2, 'Shoot', 'Press, pull back, push forward: push speed is shot speed. Or pull the gauge and release.')}
        ${step(3, 'Spin', 'Drag the red dot. Top follows, bottom draws, sides bend off cushions. Double-tap centers it.')}
      </div>
      <ul class="howlist">
      <li><b>Jump and massé</b>J1 to J3 hop a blocker, M1 to M3 bend it sideways. Jump button or <kbd>J</kbd> cycles.</li>
      <li><b>8-Ball</b>Pot your group, then tap a pocket to call the 8.</li>
      <li><b>9-Ball</b>Lowest ball first. Pot the 9 to win.</li>
      <li><b>Straight Pool</b>Any ball, any pocket. A foul costs a point. Race to 30.</li>
      <li><b>One-Pocket</b>Only your foot pocket counts. First to 8. Fouls spot a ball.</li>
      <li><b>Ball in hand</b>Drag the ghost ball to a legal spot. Green yes, red no.</li>
      <li><b>Online</b>Host or join with a code. Drops get 30 seconds.</li>
      <li><b>Chalk</b>Wins earn Chalk. Levels unlock gear.</li>
      <li><b>Keys</b><kbd>P</kbd> pause, <kbd>M</kbd> mute, <kbd>R</kbd> replay, <kbd>F</kbd> fullscreen. Gamepads work too.</li></ul>`, (root) => {
      wireBack(root);
      const lc = root.querySelector('#lessonCard');
      if (lc) lc.onclick = () => click(() => actions.startChallenge(nextLesson.id));
    });
  }

  // ---------------------------------------------------------------- profile
  function profileScreen() {
    const s = profile.data.stats, pr = profile.progress();
    const earned = ACHIEVEMENTS.filter((a) => profile.data.achievements[a.id]).length;
    const cell = (a, b) => `<div class="statcell"><b>${b}</b><span>${a}</span></div>`;
    mount(`${backBtn()}<div class="scr-title">Profile</div><p class="scr-sub">Chalk level ${pr.level} · ${earned} of ${ACHIEVEMENTS.length} achievements</p>
      <div class="statgrid">${cell('Matches', s.matches)}${cell('Wins', s.wins)}${cell('Balls potted', s.pots)}${cell('Best run', s.bestRun)}${cell('Banks', s.banks)}${cell('Kicks', s.kicks)}${cell('Combos', s.combos)}${cell('Jump shots', s.jumps)}${cell('Fouls', s.fouls)}${cell('Daily best', profile.data.daily.best.toLocaleString())}${cell('Daily streak', profile.data.daily.streak)}${cell('Stars', profile.totalStars('circuit') + profile.totalStars('challenges'))}</div>
      <div class="label">Achievements · ${earned} of ${ACHIEVEMENTS.length}</div>
      <div class="achgrid">${ACHIEVEMENTS.map((a) => { const got = profile.data.achievements[a.id]; return `<div class="ach ${got ? 'got' : ''}" title="${esc(a.desc)}"><i>${got ? '★' : '○'}</i><b>${esc(a.name)}</b><span>+${a.xp}</span></div>`; }).join('')}</div>`,
    (root) => wireBack(root));
  }

  // ---------------------------------------------------------------- online
  function onlineScreen() {
    const kinds = ['eight', 'nine', 'straight', 'onepocket'];
    mount(`${backBtn()}<div class="scr-title">Play Online</div><p class="scr-sub">A private table for two. Host one and send the code or link, or join a friend's.</p>
      <div class="label">Your name</div><input id="nameIn" class="field" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(settings.name || '')}" placeholder="Player">
      <div class="label">Host a table</div>
      <div class="chips" id="oKind">${kinds.map((k) => `<button class="chip ${settings.kind === k ? 'sel' : ''}" data-k="${k}">${GAMES[k].name}</button>`).join('')}</div>
      <div class="label">The hall</div>${hallChips(settings.hall)}
      <div class="label">Shot clock</div>
      <div class="chips" id="oClock">${[['off', 'Off'], ['30', '30 seconds'], ['60', '60 seconds']].map(([v, t]) => `<button class="chip ${settings.clock === v ? 'sel' : ''}" data-c="${v}">${t}</button>`).join('')}</div>
      <button class="mbtn primary startbtn" id="oHost"><span class="num">${ICON.globe}</span><div class="tt"><b>Host a table</b><span>You get a code to share</span></div><span class="go">›</span></button>
      <div class="label">Join a table</div>
      <div class="joinrow"><input id="codeIn" class="field code" maxlength="7" placeholder="ABC234" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn primary" id="oJoin">Join</button></div>
      <p class="fine">Games connect peer to peer. Nothing is sent but your shots.</p>`,
    (root) => {
      wireBack(root);
      wireHalls(root, (id) => { settings.hall = id; saveSettings(); actions.previewHall(id); });
      root.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => click(() => { settings.kind = b.dataset.k; saveSettings(); root.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('sel', x === b)); }); });
      root.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => click(() => { settings.clock = b.dataset.c; saveSettings(); root.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('sel', x === b)); }); });
      const nameIn = root.querySelector('#nameIn'), codeIn = root.querySelector('#codeIn');
      nameIn.oninput = () => { settings.name = nameIn.value.trim().slice(0, 16); saveSettings(); };
      codeIn.oninput = () => { codeIn.value = cleanCode(codeIn.value); };
      root.querySelector('#oHost').onclick = () => click(() => actions.onlineHost({ kind: settings.kind === 'practice' ? 'eight' : settings.kind, hall: settings.hall, clock: settings.clock === 'off' ? 0 : +settings.clock }));
      root.querySelector('#oJoin').onclick = () => click(() => actions.onlineJoin(codeIn.value));
      codeIn.onkeydown = (e) => { if (e.key === 'Enter') root.querySelector('#oJoin').click(); };
    });
  }

  function lobby({ title, code, link, sub, onCancel }) {
    const tiles = String(code).split('').map((c) => `<i>${esc(c)}</i>`).join('');
    openSheet(`<div class="kick center">Online</div><h2 style="text-align:center">${esc(title)}</h2>
      <div class="bigcode" id="lobCode">${tiles}</div>
      <div class="waitdots"><i></i><i></i><i></i></div>
      <p class="scr-sub" id="lobSub" style="text-align:center">${esc(sub)}</p>
      <p class="fine err hidden" id="lobErr" style="text-align:center"></p>
      <div class="btnrow">${link ? '<button class="btn primary" id="lobCopy">Copy invite link</button>' : ''}<button class="btn" id="lobCancel">Cancel</button></div>`,
    () => {
      const copy = $('lobCopy');
      if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied'; } catch { copy.textContent = link; } };
      $('lobCancel').onclick = () => { closeSheet(); onCancel(); };
    });
    return {
      close: closeSheet,
      setSub(t) { const e = $('lobSub'); if (e) e.textContent = t; },
      error(t) { const e = $('lobErr'); if (e) { e.textContent = t; e.classList.remove('hidden'); } const s = $('lobSub'); if (s) s.textContent = ''; const d = sheet.querySelector('.waitdots'); if (d) d.style.display = 'none'; const c = $('lobCancel'); if (c) c.textContent = 'Back'; },
    };
  }

  function notice(text) {
    openSheet(`<div class="kick center">Ghost Ball</div><p class="scr-sub" style="font-size:16px;color:var(--ink);text-align:center;margin-top:12px">${esc(text)}</p><div class="btnrow"><button class="btn primary" id="noteOk">OK</button></div>`, () => { $('noteOk').onclick = closeSheet; });
  }

  function onlineMenu({ onResume, onResign }) {
    openSheet(`<div class="kick">Online match</div><h2>Menu</h2><p class="scr-sub">The game keeps running while this is open.</p>
      <div class="btnrow"><button class="btn primary" id="omResume">Back to the table</button><button class="btn" id="omResign">Resign and leave</button></div>`,
    () => { $('omResume').onclick = () => { closeSheet(); onResume(); }; $('omResign').onclick = () => { closeSheet(); onResign(); }; });
  }

  function show(name) {
    screen = name;
    ({ home, quick, practice, online: onlineScreen, circuit, tricks, locker, profile: profileScreen, settings: settingsScreen, how }[name] || home)();
  }

  // ---------------------------------------------------------------- modal sheets
  function openSheet(html, wire) {
    sheet.innerHTML = html;
    modal.classList.remove('hidden');
    if (wire) wire(sheet);
    // keyboard and gamepad users land on the primary action, not behind the sheet
    const first = sheet.querySelector('.btn.primary:not([disabled]), .btn:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }
  function closeSheet() { modal.classList.add('hidden'); sheet.innerHTML = ''; }
  // keep Tab inside an open sheet so focus never wanders into the table behind it
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || modal.classList.contains('hidden')) return;
    const f = [...sheet.querySelectorAll('button:not([disabled]), input, a[href]')].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  let pauseArgs = null;
  function pause(args) {
    pauseArgs = args;
    const { onResume, onRestart, onQuit, onToggleSound, onFullscreen, soundLabel } = args;
    openSheet(`<div class="kick">Paused</div><h2>Take five</h2>
      <div class="btnrow"><button class="btn primary" id="sResume">Resume</button><button class="btn" id="sRestart">Restart match</button><button class="btn" id="sQuit">Quit to menu</button></div>
      <div class="btnrow">${onToggleSound ? '<button class="btn" id="sSound"></button>' : ''}${onFullscreen ? '<button class="btn" id="sFull">Fullscreen</button>' : ''}<button class="btn" id="sSettings">Table settings</button></div>`,
    () => {
      $('sResume').onclick = () => { closeSheet(); onResume(); };
      $('sRestart').onclick = () => { closeSheet(); onRestart(); };
      $('sQuit').onclick = () => { closeSheet(); onQuit(); };
      $('sSettings').onclick = () => pauseSettings();
      const snd = $('sSound');
      if (snd) { snd.textContent = soundLabel ? soundLabel() : 'Sound'; snd.onclick = () => { snd.textContent = onToggleSound(); }; }
      const ful = $('sFull');
      if (ful) ful.onclick = () => onFullscreen();
    });
  }
  function pauseSettings() {
    openSheet(`<div class="kick">Paused</div><h2>Table settings</h2><div class="setcols">${settingsRows()}</div><div class="btnrow"><button class="btn primary" id="sBack">Back</button></div>`,
    (root) => { wireSettings(root); $('sBack').onclick = () => pause(pauseArgs); });
  }

  /**
   * Results sheet. data: { kicker, title, sub, stars (0..3 or null), goals:[{label,mut}], rows:[[label,value]],
   * xp: { gained, fromXp, before, after, ups, unlocked }, buttons:[{label, primary, cb, keep}] }
   */
  function results(data) {
    const xp = data.xp;
    const pr0 = xp ? { level: xp.before, frac: fracAt(xp.fromXp, xp.before) } : null;
    openSheet(`<div class="kick">${esc(data.kicker || '')}</div><h2>${esc(data.title)}</h2>
      ${data.sub ? `<p class="scr-sub">${esc(data.sub)}</p>` : ''}
      ${data.stars != null ? `<div class="starrow" id="rStars">${[0, 1, 2].map(() => '<i>★</i>').join('')}</div>` : ''}
      ${data.goals && data.goals.length ? `<div class="rows">${data.goals.map((g) => `<div class="rowline ${g.met ? 'met' : 'miss'}"><span>${esc(g.label)}</span><b>${g.met ? 'Done' : 'Missed'}</b></div>`).join('')}</div>` : ''}
      ${data.achievements && data.achievements.length ? `<div class="rows">${data.achievements.map((a) => `<div class="rowline met"><span>Achievement: ${esc(a.name)}</span><b>+${a.xp}</b></div>`).join('')}</div>` : ''}
      ${data.rows && data.rows.length ? `<div class="rows">${data.rows.map(([a, b]) => `<div class="rowline"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>` : ''}
      ${xp ? `<div class="xpwrap"><div class="xphead"><span>Chalk level <b id="rLvl">${pr0.level}</b></span><span>+<b id="rXp">0</b> chalk</span></div><div class="xpbar"><i id="rBar" style="width:${Math.round(pr0.frac * 100)}%"></i></div></div>` : ''}
      <div id="rUnlocks"></div>
      <div class="btnrow">${data.buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-b="${i}">${esc(b.label)}</button>`).join('')}</div>`,
    (root) => {
      root.querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { const spec = data.buttons[+b.dataset.b]; if (!spec.keep) closeSheet(); spec.cb(); }; });
      // stars pop in one at a time, then the Chalk counts up and the bar fills
      const stars = root.querySelectorAll('#rStars i');
      let t = 350;
      for (let i = 0; i < (data.stars || 0); i++) { setTimeout(() => { stars[i] && stars[i].classList.add('on'); audio.star(i); }, t); t += 340; }
      if (xp) setTimeout(() => animateXp(root, xp), t);
    });
    return {
      setButton(i, label, disabled) { const b = sheet.querySelector(`[data-b="${i}"]`); if (b) { b.textContent = label; b.disabled = !!disabled; } },
    };
  }

  function fracAt(xp, level) { const lo = levelXp(level), hi = levelXp(level + 1); return (xp - lo) / (hi - lo); }
  const levelXp = xpForLevel;

  function animateXp(root, xp) {
    const num = root.querySelector('#rXp'), bar = root.querySelector('#rBar'), lvl = root.querySelector('#rLvl');
    if (!num) return;
    const dur = Math.min(1600, 500 + xp.gained * 4), t0 = performance.now();
    let lastTick = 0;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      num.textContent = Math.round(xp.gained * e);
      if (now - lastTick > 70 && k < 1) { audio.xpTick(k); lastTick = now; }
      const cur = xp.fromXp + xp.gained * e;
      const l = levelFor(cur);
      lvl.textContent = l;
      bar.style.transition = 'none';
      bar.style.width = `${Math.round(fracAt(cur, l) * 100)}%`;
      if (k < 1) requestAnimationFrame(step);
      else if (xp.ups && xp.ups.length) {
        audio.levelUp();
        const box = root.querySelector('#rUnlocks');
        box.innerHTML = `<div class="unlock">Level ${xp.after} reached${xp.unlocked.length ? `: unlocked ${xp.unlocked.map((u) => esc(u.name)).join(', ')}` : ''}</div>`;
      }
    };
    requestAnimationFrame(step);
  }
  const levelFor = levelForXp;

  return { show, home, pause, results, lobby, notice, onlineMenu, closeSheet, get screen() { return screen; } };
}
