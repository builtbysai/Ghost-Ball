// Screens: menu, match, settings, exhibition, how, plus pause/results
// sheets. Owns DOM visibility and all menu/settings bindings.
import { HALLS, hallById } from '../state/halls.js';
import { saveSettings } from '../state/settings.js';
import { resetProfile } from '../state/profile.js';
import * as sfx from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-menu', 'screen-match', 'screen-settings', 'screen-exhibition', 'screen-how'];
const OPP_LABEL = { rookie: 'vs Rookie', club: 'vs Club Pro', champ: 'vs Champion', two: 'Two players' };
const GAME_LABEL = { '8ball': '8-Ball', '9ball': '9-Ball' };

export function createScreens({ store, engine, callbacks }) {
  const tap = () => sfx.uiTap(engine);
  function settings() { return store.get().settings; }
  function updateSettings(patch) {
    const next = { ...settings(), ...patch };
    store.set({ settings: next });
    saveSettings(next);
    if (callbacks.onSettingsChanged) callbacks.onSettingsChanged(next);
    paintMenu();
  }

  // ---------- menu ----------
  const hallSeg = $('pick-hall');
  HALLS.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.hall = h.id; b.textContent = h.name;
    b.addEventListener('click', () => { tap(); updateSettings({ hall: h.id }); });
    hallSeg.appendChild(b);
  });
  function segWire(el, attr, cb) {
    el.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => { tap(); cb(b.dataset[attr]); });
    });
  }
  segWire($('pick-game'), 'game', (v) => updateSettings({ game: v }));
  segWire($('pick-opp'), 'opp', (v) => updateSettings({ opp: v }));
  segWire($('pick-view'), 'view', (v) => updateSettings({ view: v }));
  function paintSeg(el, attr, val) {
    el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === val));
  }
  function paintMenu() {
    const s = settings();
    const hall = hallById(s.hall);
    paintSeg($('pick-game'), 'game', s.game);
    paintSeg($('pick-opp'), 'opp', s.opp);
    paintSeg($('pick-view'), 'view', s.view);
    hallSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.hall === s.hall));
    $('menu-hall-line').textContent = `${hall.name} · ${hall.year} — ${hall.line}`;
    $('play-summary').textContent = `${GAME_LABEL[s.game] || '8-Ball'} · ${OPP_LABEL[s.opp] || ''} · ${s.view === '3d' ? '3D' : '2D'}`;
    document.documentElement.style.setProperty('--accent', hall.accent);
  }
  $('play-btn').addEventListener('click', () => { tap(); callbacks.onPlay(); });
  $('link-exhibition').addEventListener('click', () => { tap(); api.show('exhibition'); });
  $('link-practice').addEventListener('click', () => { tap(); callbacks.onPractice(); });
  $('link-how').addEventListener('click', () => { tap(); api.show('how'); });
  $('link-settings').addEventListener('click', () => { tap(); callbacks.onOpenSettings('menu'); });

  // ---------- exhibition ----------
  segWire($('pick-left'), 'side', (v) => { store.set({ exhLeft: v }); paintExh(); });
  segWire($('pick-right'), 'side', (v) => { store.set({ exhRight: v }); paintExh(); });
  function paintExh() {
    paintSeg($('pick-left'), 'side', store.get().exhLeft || 'club');
    paintSeg($('pick-right'), 'side', store.get().exhRight || 'rookie');
  }
  $('btn-exh-start').addEventListener('click', () => {
    tap();
    callbacks.onExhibition({ left: store.get().exhLeft || 'club', right: store.get().exhRight || 'rookie' });
  });
  $('btn-exh-back').addEventListener('click', () => { tap(); api.show('menu'); });

  // ---------- how ----------
  $('btn-how-play').addEventListener('click', () => { tap(); callbacks.onPlay(); });
  $('btn-how-back').addEventListener('click', () => { tap(); api.show('menu'); });

  // ---------- settings ----------
  segWire($('set-view'), 'view', (v) => updateSettings({ view: v }));
  segWire($('set-camera'), 'camera', (v) => updateSettings({ camera: v }));
  segWire($('set-guide'), 'guide', (v) => updateSettings({ guide: v }));
  segWire($('set-hand'), 'hand', (v) => updateSettings({ hand: v }));
  const sfxRange = $('set-sfx'), musicRange = $('set-music');
  sfxRange.addEventListener('input', () => updateSettings({ sfxVol: Number(sfxRange.value) }));
  musicRange.addEventListener('input', () => updateSettings({ musicVol: Number(musicRange.value) }));
  $('set-mute').addEventListener('click', (ev) => {
    updateSettings({ muted: !settings().muted });
    ev.currentTarget.setAttribute('aria-checked', String(settings().muted));
  });
  $('btn-reset-progress').addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    if (btn.dataset.armed) {
      store.set({ profile: resetProfile() });
      btn.textContent = 'Progress reset'; btn.dataset.armed = '';
      setTimeout(() => { btn.textContent = 'Reset progress'; }, 1200);
    } else {
      btn.dataset.armed = '1'; btn.textContent = 'Tap again to confirm';
      setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'Reset progress'; }, 2500);
    }
  });
  $('btn-settings-back').addEventListener('click', () => { tap(); callbacks.onSettingsBack(); });
  function paintSettings() {
    const s = settings();
    paintSeg($('set-view'), 'view', s.view);
    paintSeg($('set-camera'), 'camera', s.camera || 'elevated');
    paintSeg($('set-guide'), 'guide', s.guide);
    paintSeg($('set-hand'), 'hand', s.hand);
    sfxRange.value = String(s.sfxVol);
    musicRange.value = String(s.musicVol);
    $('set-mute').setAttribute('aria-checked', String(s.muted));
  }

  // ---------- match sheets ----------
  $('btn-resume').addEventListener('click', () => { tap(); callbacks.onResume(); });
  segWire($('pick-pace'), 'pace', (v) => {
    paintSeg($('pick-pace'), 'pace', v);
    callbacks.onPace(Number(v));
  });
  $('btn-pause-settings').addEventListener('click', () => { tap(); callbacks.onOpenSettings('pause'); });
  $('btn-restart').addEventListener('click', () => { tap(); callbacks.onRestartRack(); });
  $('btn-quit').addEventListener('click', () => { tap(); callbacks.onQuitToMenu(); });
  $('btn-rematch').addEventListener('click', () => { tap(); callbacks.onRematch(); });
  $('btn-results-menu').addEventListener('click', () => { tap(); callbacks.onQuitToMenu(); });

  const api = {
    show(name) {
      const target = 'screen-' + name;
      SCREENS.forEach((id) => $(id).classList.toggle('hidden', id !== target));
      api.hideSheets();
      if (name === 'menu') paintMenu();
      if (name === 'exhibition') paintExh();
      if (name === 'settings') paintSettings();
      store.set({ screen: name });
    },
    showPause(on, { spectate } = {}) {
      $('sheet-pause').classList.toggle('hidden', !on);
      $('pace-row').classList.toggle('hidden', !spectate);
    },
    showResults({ kicker, title, defeat, reason, stats }) {
      $('result-kicker').textContent = kicker || '';
      const t = $('result-title');
      t.textContent = title;
      t.classList.toggle('defeat', !!defeat);
      $('result-reason').textContent = reason || '';
      const box = $('result-stats');
      box.innerHTML = '';
      (stats || []).forEach(([k, v]) => {
        const row = document.createElement('div');
        row.innerHTML = '<span></span><b></b>';
        row.querySelector('span').textContent = k;
        row.querySelector('b').textContent = v;
        box.appendChild(row);
      });
      $('sheet-results').classList.remove('hidden');
    },
    hideSheets() {
      $('sheet-pause').classList.add('hidden');
      $('sheet-results').classList.add('hidden');
    },
    paintMenu, paintSettings,
  };
  paintMenu();
  return api;
}
