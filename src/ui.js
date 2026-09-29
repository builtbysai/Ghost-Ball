// Menu screens and modal sheets. DOM only: state lives in the profile and
// settings objects handed in, and every button goes out through `actions`.

import { HALLS, HALL_BY_ID } from './halls.js';
import { GAMES } from './rules.js';
import { LEVELS } from './ai.js';
import { CUES, CHALKS, BALLSETS, xpForLevel, levelForXp } from './gear.js';
import { RIVALS, rivalsOf, hallOpen, nextRival, GOALS } from './circuit.js';
import { CHALLENGES, LESSONS } from './challenges.js';
import { localDateString } from './profile.js';
import { ACHIEVEMENTS } from './achievements.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const starsHtml = (n, of = 3) => `<span class="stars">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;
const KIND_LABEL = { eight: '8-BALL', nine: '9-BALL', onepocket: 'ONE-POCKET' };

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
  function home() {
    const pr = profile.progress();
    const nr = nextRival(profile);
    const solved = Object.keys(profile.data.challenges).length;
    const lessonsDone = LESSONS.filter((l) => profile.data.lessons[l.id]).length, lessonsLeft = lessonsDone < LESSONS.length;
    const today = localDateString();
    const d = profile.data.daily;
    const todayDone = d.todayDate === today;
    mount(`
      <div class="wordmark"><small>A POOL GAME</small><h1><span>GH<i class="ghostO"></i>ST</span><span>BALL</span></h1></div>
      <div class="profile" data-a="profile" style="cursor:pointer"><div class="ring" style="--p:${Math.round(pr.frac * 100)}"><i>${pr.level}</i></div>
        <div><b>Chalk level ${pr.level}</b><span>${pr.into} / ${pr.need} to level ${pr.level + 1} · ${profile.totalStars('circuit') + profile.totalStars('challenges')} stars</span></div></div>
      <div class="mlist">
        ${lessonsLeft ? `<button class="mbtn primary" data-a="lesson"><span class="num">★</span><div class="tt"><b>${lessonsDone ? 'Continue lessons' : 'Learn the basics'}</b><span>${lessonsDone} of ${LESSONS.length} done · aim, power, cut, draw, English</span></div><span class="go">›</span></button>` : ''}
        <button class="mbtn ${lessonsLeft ? '' : 'primary'}" data-a="quick"><span class="num">01</span><div class="tt"><b>Quick Match</b><span>${GAMES[settings.kind].name} · ${oppLabel()} · ${HALL_BY_ID[settings.hall].name}</span></div><span class="go">›</span></button>
        <button class="mbtn" data-a="circuit"><span class="num">02</span><div class="tt"><b>The Circuit</b><span>${nr ? `Next: ${esc(nr.name)} at ${HALL_BY_ID[nr.hall].name}` : 'Every rival beaten. Chase the stars.'}</span></div><span class="go">›</span></button>
        <button class="mbtn" data-a="tricks"><span class="num">03</span><div class="tt"><b>Trick Shots</b><span>${solved} of ${CHALLENGES.length} solved · ${profile.totalStars('challenges')} of ${CHALLENGES.length * 3} stars</span></div><span class="go">›</span></button>
        <button class="mbtn" data-a="daily"><span class="num">04</span><div class="tt"><b>Daily Run</b><span>${todayDone ? `Today's best ${d.todayBest.toLocaleString()}` : 'Same rack for everyone today'} · streak ${d.streak}</span></div><span class="go">›</span></button>
        <button class="mbtn" data-a="blitz"><span class="num">05</span><div class="tt"><b>Blitz</b><span>60 seconds, streaks, one rack after another \u00b7 best ${profile.data.blitz.best.toLocaleString()}</span></div><span class="go">\u203a</span></button>
        <button class="mbtn" data-a="practice"><span class="num">06</span><div class="tt"><b>Practice</b><span>A free table. Test any shot.</span></div><span class="go">›</span></button>
      </div>
      <div class="mfoot"><button class="linkbtn" data-a="profile">Profile</button><button class="linkbtn" data-a="locker">Locker</button><button class="linkbtn" data-a="settings">Settings</button><button class="linkbtn" data-a="how">How to play</button></div>`,
    (root) => {
      root.querySelectorAll('[data-a]').forEach((b) => {
        b.onclick = () => click(() => {
          const a = b.dataset.a;
          if (a === 'daily') return actions.startDaily();
          if (a === 'blitz') return actions.startBlitz(settings.hall);
          if (a === 'lesson') { const next = LESSONS.find((l) => !profile.data.lessons[l.id]); return actions.startChallenge(next.id); }
          show(a);
        });
      });
    });
  }
  const oppLabel = () => (settings.opp === '2p' ? 'Two players' : settings.opp === 'demo' ? 'AI vs AI' : LEVELS[+settings.opp].name);

  // ---------------------------------------------------------------- quick match / practice
  function hallRows(selected) {
    return `<div class="halls">${HALLS.map((h) => `
      <button class="hallrow ${h.id === selected ? 'sel' : ''}" data-hall="${h.id}"><i class="sw" style="--rail:${h.rail.a};--cloth:${h.cloth.base}"></i><div><b>${h.name}</b><span>${esc(h.tagline)}</span></div><em class="yr">${h.year}</em></button>`).join('')}</div>`;
  }
  function wireHalls(root, get, set) {
    root.querySelectorAll('[data-hall]').forEach((b) => {
      b.onclick = () => click(() => { set(b.dataset.hall); root.querySelectorAll('.hallrow').forEach((x) => x.classList.toggle('sel', x === b)); });
    });
  }

  function quick() {
    const kinds = ['eight', 'nine', 'onepocket'];
    mount(`${backBtn()}
      <div class="scr-title">Quick Match</div><p class="scr-sub">A single frame. Pick a hall, a game and a rival.</p>
      <div class="label">The Hall</div>${hallRows(settings.hall)}
      <div class="label">The Game</div>
      <div class="chips" id="qKind">${kinds.map((k) => `<button class="chip ${settings.kind === k ? 'sel' : ''}" data-k="${k}">${GAMES[k].name}<small>${GAMES[k].blurb}</small></button>`).join('')}</div>
      <div class="label">The Rival</div>
      <div class="chips" id="qOpp">${[...LEVELS.map((l) => ({ v: String(l.id), t: l.name, s: l.blurb })), { v: '2p', t: 'Two players', s: 'Same screen' }, { v: 'demo', t: 'Watch', s: 'AI vs AI' }].map((o) => `<button class="chip ${settings.opp === o.v ? 'sel' : ''}" data-o="${o.v}">${o.t}<small>${o.s}</small></button>`).join('')}</div>
      <button class="mbtn primary startbtn" id="qGo"><span class="num"></span><div class="tt"><b>Break</b><span>Rack them up</span></div><span class="go">›</span></button>`,
    (root) => {
      wireBack(root);
      wireHalls(root, () => settings.hall, (id) => { settings.hall = id; saveSettings(); actions.previewHall(id); });
      root.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => click(() => { settings.kind = b.dataset.k; saveSettings(); root.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('sel', x === b)); }); });
      root.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => click(() => { settings.opp = b.dataset.o; saveSettings(); root.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('sel', x === b)); }); });
      $('qGo').onclick = () => click(() => actions.startQuick({ kind: settings.kind, opp: settings.opp, hall: settings.hall }));
    });
  }

  function practice() {
    mount(`${backBtn()}<div class="scr-title">Practice</div><p class="scr-sub">A free table with no rules. Rack, break, try things. Use Re-rack in the corner to reset.</p>
      <div class="label">The Hall</div>${hallRows(settings.hall)}
      <button class="mbtn primary startbtn" id="pGo"><span class="num"></span><div class="tt"><b>Start practice</b><span>No opponent, no pressure</span></div><span class="go">›</span></button>`,
    (root) => {
      wireBack(root);
      wireHalls(root, () => settings.hall, (id) => { settings.hall = id; saveSettings(); actions.previewHall(id); });
      $('pGo').onclick = () => click(() => actions.startPractice(settings.hall));
    });
  }

  // ---------------------------------------------------------------- circuit
  function circuit() {
    const nr = nextRival(profile);
    const blocks = HALLS.map((h, hi) => {
      const open = hallOpen(profile, h.id);
      const rs = rivalsOf(h.id);
      const rows = rs.map((r, k) => {
        const st = profile.data.circuit[`${h.id}:${k}`] || 0;
        const prevBeaten = k === 0 || (profile.data.circuit[`${h.id}:${k - 1}`] || 0) >= 1;
        const playable = open && prevBeaten;
        const isNext = nr && nr.idx === r.idx;
        return `<button class="rival ${isNext ? 'next' : ''}" data-r="${r.idx}" ${playable ? '' : 'disabled'}>
          <i class="mono">${esc(r.name[0])}</i><div class="who"><b>${esc(r.name)}</b><span>${esc(r.bio)}</span></div>
          <span class="kind">${KIND_LABEL[r.kind]}</span>${starsHtml(st)}</button>`;
      }).join('');
      return `<div class="cir-hall ${open ? '' : 'locked'}"><div class="cir-head"><b>${hi + 1}. ${h.name}</b><span>${h.year}${open ? '' : ' · LOCKED'}</span></div>${rows}${open ? '' : '<p class="fine">Beat all three rivals in the previous hall to open this one.</p>'}</div>`;
    }).join('');
    mount(`${backBtn()}<div class="scr-title">The Circuit</div><p class="scr-sub">Fifteen rivals across five halls. A win is one star; two side goals make it three.</p>${blocks}`,
    (root) => {
      wireBack(root);
      root.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => click(() => actions.startRival(+b.dataset.r)); });
      const n = root.querySelector('.rival.next'); if (n) n.scrollIntoView({ block: 'center' });
    });
  }

  // ---------------------------------------------------------------- trick shots
  function tricks() {
    const lessonTiles = LESSONS.map((c, i) => `<button class="tile" data-c="${c.id}"><small>LESSON ${i + 1}</small><b>${esc(c.name)}</b><span class="stars"><i class="${profile.data.lessons[c.id] ? 'on' : ''}">✓</i></span></button>`).join('');
    const tiles = CHALLENGES.map((c, i) => `<button class="tile" data-c="${c.id}"><small>${String(i + 1).padStart(2, '0')}</small><b>${esc(c.name)}</b>${starsHtml(profile.data.challenges[c.id] || 0)}</button>`).join('');
    mount(`${backBtn()}<div class="scr-title">Trick Shots</div><p class="scr-sub">One setup, one solution. Solve it first try for three stars. Banks, kicks, combos, draw, follow and English.</p><div class="label">Lessons</div><div class="tiles">${lessonTiles}</div><div class="label">Challenges</div><div class="tiles">${tiles}</div>`,
    (root) => { wireBack(root); root.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => click(() => actions.startChallenge(b.dataset.c)); }); });
  }

  // ---------------------------------------------------------------- locker
  function locker() {
    const lvl = profile.level();
    const sect = (title, kind, list, current) => `<div class="label">${title}</div><div class="chips locker-row">${list.map((it) => {
      const locked = it.level > lvl;
      const swatch = kind === 'cue' ? `<div class="dots"><i style="background:${it.butt}"></i><i style="background:${it.wrap}"></i><i style="background:${it.shaft}"></i></div>`
        : kind === 'chalk' ? `<div class="dots"><i style="background:${it.color};width:40px"></i></div>`
        : `<div class="dots">${it.colors.slice(1, 6).map((c) => `<i style="background:${c};width:10px;height:10px;border-radius:50%"></i>`).join('')}</div>`;
      return `<button class="chip gearchip ${it.id === current ? 'sel' : ''} ${locked ? 'locked' : ''}" data-g="${kind}:${it.id}">${it.name}<small>${locked ? `Unlocks at level ${it.level}` : it.id === current ? 'Equipped' : 'Tap to equip'}</small>${swatch}</button>`;
    }).join('')}</div>`;
    const eq = profile.data.equipped;
    mount(`${backBtn()}<div class="scr-title">Locker</div><p class="scr-sub">Everything here is earned by playing. Chalk level ${lvl}.</p>
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
  const LABEL = { assist: 'Aim assist', pocket: 'Pockets', cloth: 'Cloth', sound: 'Sound', music: 'Music', shake: 'Screen shake', haptics: 'Haptics', hand: 'Controls', stroke: 'Stroke feel', stick: 'Aim stick' };
  function settingsRows() {
    return Object.keys(OPT).map((k) => `<div class="setrow"><label>${LABEL[k]}</label><div class="seg3" data-set="${k}">${OPT[k].map(([v, t]) => `<button class="chip ${settings[k] === v ? 'sel' : ''}" data-v="${v}">${t}</button>`).join('')}</div></div>`).join('');
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
    mount(`${backBtn()}<div class="scr-title">Settings</div>${settingsRows()}<p class="fine">Pocket and cloth changes apply to the next match. Screen shake also respects your system's reduced-motion setting.</p>
      <div class="chips" style="margin-top:14px"><button class="chip" id="resetBtn">Reset all progress</button></div>`,
    (root) => { wireBack(root); wireSettings(root); });
  }
  function how() {
    mount(`${backBtn()}<div class="scr-title">How to play</div><p class="scr-sub"></p><ul class="howlist">
      <li><b>Aim</b><br>Move the mouse (or drag on touch). <kbd>Shift</kbd>, the wheel, the arrows or the ◀ ▶ buttons fine-tune.</li>
      <li><b>Shoot</b><br>Press and drag away from your aim, or pull the power strip, then release. <kbd>Space</kbd> fires at the strip's power.</li>
      <li><b>Spin</b><br>Drag the dot on the cue ball. Top follows through, bottom draws back, sides bend the ball off cushions.</li>
      <li><b>Jump</b><br>Raise the cue with the JUMP levels (or <kbd>J</kbd>) to hop over a blocking ball. It resets after every shot.</li>
      <li><b>8-Ball</b><br>Pot your group, then call a pocket for the 8.</li>
      <li><b>9-Ball</b><br>Always hit the lowest ball first. Pot the 9 to win.</li>
      <li><b>One-Pocket</b><br>Only balls in your foot-rail pocket count. First to eight wins. A foul gives a ball back.</li>
      <li><b>Chalk</b><br>You earn Chalk for winning and for skilled shots. Levels unlock cues, chalks and ball sets. Nothing is for sale.</li>
      <li><kbd>P</kbd> pause · <kbd>M</kbd> mute · <kbd>R</kbd> replay your last shot</li></ul>`, (root) => wireBack(root));
  }

  // ---------------------------------------------------------------- profile
  function profileScreen() {
    const s = profile.data.stats, pr = profile.progress();
    const earned = ACHIEVEMENTS.filter((a) => profile.data.achievements[a.id]).length;
    const cell = (a, b) => `<div class="statcell"><b>${b}</b><span>${a}</span></div>`;
    mount(`${backBtn()}<div class="scr-title">Profile</div><p class="scr-sub">Chalk level ${pr.level} · ${earned} of ${ACHIEVEMENTS.length} achievements</p>
      <div class="statgrid">${cell('Matches', s.matches)}${cell('Wins', s.wins)}${cell('Balls potted', s.pots)}${cell('Best run', s.bestRun)}${cell('Banks', s.banks)}${cell('Kicks', s.kicks)}${cell('Combos', s.combos)}${cell('Jump shots', s.jumps)}${cell('Fouls', s.fouls)}${cell('Daily best', profile.data.daily.best.toLocaleString())}${cell('Daily streak', profile.data.daily.streak)}${cell('Stars', profile.totalStars('circuit') + profile.totalStars('challenges'))}</div>
      <div class="label">Achievements</div>
      <div class="achlist">${ACHIEVEMENTS.map((a) => { const got = profile.data.achievements[a.id]; return `<div class="ach ${got ? 'got' : ''}"><i>${got ? '★' : '○'}</i><div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div><em>+${a.xp}</em></div>`; }).join('')}</div>`,
    (root) => wireBack(root));
  }

  function show(name) {
    screen = name;
    ({ home, quick, practice, circuit, tricks, locker, profile: profileScreen, settings: settingsScreen, how }[name] || home)();
  }

  // ---------------------------------------------------------------- modal sheets
  function openSheet(html, wire) {
    sheet.innerHTML = html;
    modal.classList.remove('hidden');
    if (wire) wire(sheet);
  }
  function closeSheet() { modal.classList.add('hidden'); sheet.innerHTML = ''; }

  function pause({ onResume, onRestart, onQuit }) {
    openSheet(`<div class="kick">Paused</div><h2>Take five</h2>
      ${settingsRows()}
      <div class="btnrow"><button class="btn primary" id="sResume">Resume</button><button class="btn" id="sRestart">Restart match</button><button class="btn" id="sQuit">Quit to menu</button></div>`,
    (root) => {
      wireSettings(root);
      $('sResume').onclick = () => { closeSheet(); onResume(); };
      $('sRestart').onclick = () => { closeSheet(); onRestart(); };
      $('sQuit').onclick = () => { closeSheet(); onQuit(); };
    });
  }

  /**
   * Results sheet. data: { kicker, title, sub, stars (0..3 or null), goals:[{label,met}], rows:[[label,value]],
   * xp: { gained, from, to, level, ups, unlocked }, buttons:[{label, primary, cb}] }
   */
  function results(data) {
    const xp = data.xp;
    const pr0 = xp ? { level: xp.before, frac: fracAt(xp.fromXp, xp.before) } : null;
    openSheet(`<div class="kick">${esc(data.kicker || '')}</div><h2>${esc(data.title)}</h2>
      ${data.sub ? `<p class="scr-sub">${esc(data.sub)}</p>` : ''}
      ${data.stars != null ? `<div class="starrow" id="rStars">${[0, 1, 2].map(() => '<i>★</i>').join('')}</div>` : ''}
      ${data.goals && data.goals.length ? `<div class="rows">${data.goals.map((g) => `<div class="rowline ${g.met ? 'met' : 'miss'}"><span>${esc(g.label)}</span><b>${g.met ? '✓' : '–'}</b></div>`).join('')}</div>` : ''}
      ${data.achievements && data.achievements.length ? `<div class="rows">${data.achievements.map((a) => `<div class="rowline met"><span>Achievement: ${esc(a.name)}</span><b>+${a.xp}</b></div>`).join('')}</div>` : ''}
      ${data.rows && data.rows.length ? `<div class="rows">${data.rows.map(([a, b]) => `<div class="rowline"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>` : ''}
      ${xp ? `<div class="xpwrap"><div class="xphead"><span>Chalk level <b id="rLvl">${pr0.level}</b></span><span>+<b id="rXp">0</b></span></div><div class="xpbar"><i id="rBar" style="width:${Math.round(pr0.frac * 100)}%"></i></div></div>` : ''}
      <div id="rUnlocks"></div>
      <div class="btnrow">${data.buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-b="${i}">${esc(b.label)}</button>`).join('')}</div>`,
    (root) => {
      root.querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { closeSheet(); data.buttons[+b.dataset.b].cb(); }; });
      // stars pop in one at a time, then the Chalk counts up and the bar fills
      const stars = root.querySelectorAll('#rStars i');
      let t = 350;
      for (let i = 0; i < (data.stars || 0); i++) { setTimeout(() => { stars[i] && stars[i].classList.add('on'); audio.star(i); }, t); t += 340; }
      if (xp) setTimeout(() => animateXp(root, xp), t);
    });
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

  return { show, home, pause, results, closeSheet, get screen() { return screen; } };
}
