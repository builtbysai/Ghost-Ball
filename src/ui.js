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
import { cleanCode } from './online.js';

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
    const row = (a, icon, title, sub, primary = false) => `<button class="mbtn ${primary ? 'primary' : ''}" data-a="${a}"><span class="num">${icon}</span><div class="tt"><b>${title}</b><span>${sub}</span></div><span class="go">›</span></button>`;
    mount(`
      <div class="wordmark"><small>A Pool Game</small><h1><span>GH<i class="ghostO"></i>ST</span><span>BALL</span></h1></div>
      <p class="tagline">Five halls from pool's history. A circuit of rivals, trick shots, a daily run and private online tables. Everything is earned by playing.</p>
      <div class="profile" data-a="profile" role="button" tabindex="0"><div class="ring" style="--p:${Math.round(pr.frac * 100)}"><i>${pr.level}</i></div>
        <div><b>Chalk level ${pr.level}</b><span>${pr.into} of ${pr.need} chalk to level ${pr.level + 1}</span></div>
        <div class="pright"><b>${profile.totalStars('circuit') + profile.totalStars('challenges')} stars</b><span>on the wall</span></div></div>
      <div class="mlist">
        ${lessonsLeft ? row('lesson', ICON.book, lessonsDone ? 'Continue lessons' : 'Learn the basics', `${lessonsDone} of ${LESSONS.length} done · aim, power, cut, draw, English`, true) : ''}
        ${row('quick', ICON.play, 'Quick Match', `${GAMES[settings.kind].name} · ${oppLabel()} · ${HALL_BY_ID[settings.hall].name}`, !lessonsLeft)}
        ${row('circuit', ICON.trophy, 'The Circuit', nr ? `Next up: ${esc(nr.name)} at ${HALL_BY_ID[nr.hall].name}` : 'Every rival beaten. Now chase the stars.')}
        ${row('online', ICON.globe, 'Play Online', 'A private table for two. Share a code.')}
        ${row('tricks', ICON.star, 'Trick Shots', `${solved} of ${CHALLENGES.length} solved · ${profile.totalStars('challenges')} of ${CHALLENGES.length * 3} stars`)}
        ${row('daily', ICON.sun, 'Daily Run', `${todayDone ? `Today's best ${d.todayBest.toLocaleString()}` : 'Same rack for everyone today'} · streak ${d.streak}`)}
        ${row('blitz', ICON.bolt, 'Blitz', `60 seconds, streaks, one rack after another · best ${profile.data.blitz.best.toLocaleString()}`)}
        ${row('practice', ICON.target, 'Practice', 'A free table. Test any shot.')}
      </div>
      <div class="mfoot"><button class="linkbtn" data-a="profile">Profile</button><button class="linkbtn" data-a="locker">Locker</button><button class="linkbtn" data-a="settings">Settings</button><button class="linkbtn" data-a="how">How to play</button></div>
      <div class="ver">Ghost Ball · no ads, no shop, nothing to wait for</div>`,
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
  function wireHalls(root, set) {
    root.querySelectorAll('[data-hall]').forEach((b) => {
      b.onclick = () => click(() => { set(b.dataset.hall); root.querySelectorAll('.hallrow').forEach((x) => x.classList.toggle('sel', x === b)); });
    });
  }

  function quick() {
    const kinds = ['eight', 'nine', 'straight', 'onepocket'];
    mount(`${backBtn()}
      <div class="scr-title">Quick Match</div><p class="scr-sub">A single frame. Pick a hall, a game and a rival.</p>
      <div class="label">The Hall</div>${hallRows(settings.hall)}
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
    const blocks = HALLS.map((h, hi) => {
      const open = hallOpen(profile, h.id);
      const rs = rivalsOf(h.id);
      const rows = rs.map((r, k) => {
        const st = profile.data.circuit[`${h.id}:${k}`] || 0;
        const prevBeaten = k === 0 || (profile.data.circuit[`${h.id}:${k - 1}`] || 0) >= 1;
        const playable = open && prevBeaten;
        const isNext = nr && nr.idx === r.idx;
        const goals = (r.goals || []).map((g) => GOALS[g].label).join(' · ');
        return `<button class="rival ${isNext ? 'next' : ''}" data-r="${r.idx}" ${playable ? '' : 'disabled'} title="${esc(goals)}">
          <i class="mono" style="--c:${BALL_COLORS[r.idx % BALL_COLORS.length]}">${esc(r.name[0])}</i><div class="who"><b>${esc(r.name)}</b><span>${esc(r.bio)}</span></div>
          <span class="kind">${KIND_LABEL[r.kind] || ''}</span>${starsHtml(st)}</button>`;
      }).join('');
      return `<div class="cir-hall ${open ? '' : 'locked'}"><div class="cir-head"><b>${hi + 1}. ${h.name}</b><span>${h.year}${open ? '' : ' · Locked'}</span></div>${rows}${open ? '' : '<p class="fine">Beat all three rivals in the previous hall to open this one.</p>'}</div>`;
    }).join('');
    mount(`${backBtn()}<div class="scr-title">The Circuit</div><p class="scr-sub">Fifteen rivals across five halls. A win is one star. Run the table without a scratch, or pot three in a row, to make it three.</p>${blocks}`,
    (root) => {
      wireBack(root);
      root.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => click(() => actions.startRival(+b.dataset.r)); });
      const n = root.querySelector('.rival.next'); if (n) n.scrollIntoView({ block: 'center' });
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
      return `<button class="chip gearcard ${on ? 'sel' : ''} ${locked ? 'locked' : ''}" data-g="${kind}:${it.id}">${it.name}<small>${locked ? `Unlocks at chalk level ${it.level}` : on ? 'On the table now' : it.desc || 'Tap to equip'}</small>${swatch}${on ? '<span class="tag-on">Equipped</span>' : ''}</button>`;
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
  const LABEL = { assist: 'Aim assist', pocket: 'Pockets', cloth: 'Cloth', sound: 'Sound', music: 'Music', shake: 'Screen shake', haptics: 'Haptics', hand: 'Controls', stroke: 'Stroke feel', stick: 'Aim stick' };
  const GROUPS = [
    ['The Table', ['pocket', 'cloth']],
    ['Assists', ['assist']],
    ['Sound and Feel', ['sound', 'music', 'shake', 'haptics']],
    ['Controls', ['hand', 'stroke', 'stick']],
  ];
  function settingsRows() {
    return GROUPS.map(([g, keys]) => `<div class="label" style="margin-top:16px">${g}</div>${keys.map((k) => `<div class="setrow"><label>${LABEL[k]}</label><div class="seg3" data-set="${k}">${OPT[k].map(([v, t]) => `<button class="chip ${settings[k] === v ? 'sel' : ''}" data-v="${v}">${t}</button>`).join('')}</div></div>`).join('')}`).join('');
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
    mount(`${backBtn()}<div class="scr-title">Settings</div>${settingsRows()}<p class="fine" style="margin-top:14px">Pocket and cloth changes apply to the next match. Screen shake also respects your system's reduced-motion setting.</p>
      <div class="danger"><b>Reset progress</b><p>Erases rivals, stars, chalk levels, gear and stats. There is no way back.</p><button class="btn" id="resetBtn">Reset all progress</button></div>`,
    (root) => { wireBack(root); wireSettings(root); });
  }
  function how() {
    const step = (n, t, p) => `<div class="howstep"><span class="n">${n}</span><div><b>${t}</b><p>${p}</p></div></div>`;
    mount(`${backBtn()}<div class="scr-title">How to play</div><p class="scr-sub">Pool here is shot with a real stroke. Three moves cover almost everything.</p>
      <div class="howsteps">
        ${step(1, 'Aim', 'Move the mouse, or drag on touch, to swing the cue. The line is honest: the ghost ball shows contact, the short line shows where the object ball goes, and the stub shows where the cue ball drifts after. <kbd>Shift</kbd>, the wheel, the arrow keys or the fine-aim buttons trim it.')}
        ${step(2, 'Shoot', 'Press, pull back, and push forward. Your push speed is the shot speed, so a real stroke plays better than a click. Pull the power gauge on the right instead if you prefer, then release. <kbd>Space</kbd> fires at the gauge power.')}
        ${step(3, 'Spin', 'Drag the red dot on the cue ball at bottom left. Top is follow, bottom is draw, sides bend the ball off cushions. Double-tap the ball to center it.')}
      </div>
      <ul class="howlist">
      <li><b>Jump and massé</b>The Jump button (or <kbd>J</kbd>) cycles cue elevation: J1 to J3 hop over a blocker, M1 to M3 strike down and bend the ball toward the side you hit. It resets after every shot.</li>
      <li><b>8-Ball</b>Pot your group, then call a pocket for the 8 by tapping one. The game suggests the likeliest pocket; tap another if you see a better one.</li>
      <li><b>9-Ball</b>Always hit the lowest ball first. Pot the 9 to win.</li>
      <li><b>Straight Pool</b>Any ball, any pocket, a point each. A foul costs a point (two on the break, fifteen for three in a row). When one ball is left, the other fourteen are racked again. First to 30.</li>
      <li><b>One-Pocket</b>Only balls in your foot-rail pocket count. First to eight wins. A foul gives a ball back.</li>
      <li><b>Ball in hand</b>After a scratch or a foul, drag the ghost cue ball anywhere legal and tap Place cue ball. Green means legal, red means it overlaps a ball or a rail.</li>
      <li><b>Online</b>Host a private table and send the code, or join with one. Both players see each other's cue. A shot clock keeps things moving, and if the connection drops you have thirty seconds to come back.</li>
      <li><b>Chalk</b>You earn Chalk for winning and for skilled shots. Levels unlock cues, chalks and ball sets in the Locker. Nothing is for sale.</li>
      <li><b>Keys</b><kbd>P</kbd> pause · <kbd>M</kbd> mute · <kbd>R</kbd> replay your last shot · <kbd>F</kbd> fullscreen. Gamepads work too: left stick aims, right stick strokes, triggers set power.</li></ul>`, (root) => wireBack(root));
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

  // ---------------------------------------------------------------- online
  function onlineScreen() {
    const kinds = ['eight', 'nine', 'straight', 'onepocket'];
    mount(`${backBtn()}<div class="scr-title">Play Online</div><p class="scr-sub">A private table for two. Host one and send the code or link, or join a friend's.</p>
      <div class="label">Your name</div><input id="nameIn" class="field" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(settings.name || '')}" placeholder="Player">
      <div class="label">Host a table</div>
      <div class="chips" id="oKind">${kinds.map((k) => `<button class="chip ${settings.kind === k ? 'sel' : ''}" data-k="${k}">${GAMES[k].name}<small>${GAMES[k].blurb}</small></button>`).join('')}</div>
      <div class="label">The hall</div>${hallRows(settings.hall)}
      <div class="label">Shot clock</div>
      <div class="chips" id="oClock">${[['off', 'Off'], ['30', '30 seconds'], ['60', '60 seconds']].map(([v, t]) => `<button class="chip ${settings.clock === v ? 'sel' : ''}" data-c="${v}">${t}</button>`).join('')}</div>
      <button class="mbtn primary startbtn" id="oHost"><span class="num">${ICON.globe}</span><div class="tt"><b>Host a table</b><span>You get a code to share</span></div><span class="go">›</span></button>
      <div class="label">Join a table</div>
      <div class="joinrow"><input id="codeIn" class="field code" maxlength="7" placeholder="ABC234" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn primary" id="oJoin">Join</button></div>
      <p class="fine">Games connect directly between the two players, peer to peer. Both sides run the same simulation, so nothing is sent but your shots.</p>`,
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
      error(t) { const e = $('lobErr'); if (e) { e.textContent = t; e.classList.remove('hidden'); } const s = $('lobSub'); if (s) s.textContent = ''; },
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
  }
  function closeSheet() { modal.classList.add('hidden'); sheet.innerHTML = ''; }

  function pause({ onResume, onRestart, onQuit }) {
    openSheet(`<div class="kick">Paused</div><h2>Take five</h2>
      <div class="btnrow"><button class="btn primary" id="sResume">Resume</button><button class="btn" id="sRestart">Restart match</button><button class="btn" id="sQuit">Quit to menu</button></div>
      <div class="label">Table settings</div>
      ${settingsRows()}`,
    (root) => {
      wireSettings(root);
      $('sResume').onclick = () => { closeSheet(); onResume(); };
      $('sRestart').onclick = () => { closeSheet(); onRestart(); };
      $('sQuit').onclick = () => { closeSheet(); onQuit(); };
    });
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
