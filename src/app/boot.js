// Boot: builds store, audio + lifecycle, screens, HUD, router, attract, loop.
import { createStore } from '../state/store.js';
import { loadSettings, saveSettings } from '../state/settings.js';
import { loadProfile, saveProfile } from '../state/profile.js';
import { createSession, resetSession } from '../state/session.js';
import { hallById } from '../state/halls.js';
import { createHUD } from '../ui/hud.js';
import { createScreens } from '../ui/screens.js';
import { createRouter } from './router.js';
import { createLoop } from './loop.js';
import { createMatch } from '../modes/match.js';
import { createPractice } from '../modes/practice.js';
import { createAttract } from '../modes/exhibition.js';
import { AudioEngine } from '../audio/engine.js';
import { installLifecycle } from '../audio/lifecycle.js';

const $ = (id) => document.getElementById(id);

export function boot() {
  const store = createStore({
    settings: loadSettings(),
    profile: loadProfile(),
    screen: 'menu',
    exhLeft: 'club', exhRight: 'rookie',
  });
  const session = createSession();
  const audio = new AudioEngine();
  installLifecycle(audio, document);
  window.addEventListener('pagehide', () => { try { audio.teardown(); } catch {} });

  const applySettings = (s) => {
    document.body.classList.toggle('hand-left', s.hand === 'left');
    audio.setLevels({ sfx: s.sfxVol, music: s.musicVol, muted: s.muted });
    document.documentElement.style.setProperty('--accent', hallById(s.hall).accent);
  };
  applySettings(store.get().settings);

  // Audio starts only from a user gesture; after that the engine is live.
  const unlock = () => { try { audio.ensure(); } catch {} };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  let active = null;   // current match / practice controller
  let attract = null;  // menu attract
  let settingsReturn = 'menu';

  const screens = createScreens({
    store, engine: audio,
    callbacks: {
      onPlay() { startMatch(matchConfig()); },
      onPractice() { startPractice(); },
      onExhibition({ left, right }) { startMatch(exhibitionConfig(left, right)); },
      onSettingsChanged(s) {
        applySettings(s);
        if (active && active.setView) active.setView(s.view);
        if (active && active.setCameraPreset) active.setCameraPreset(s.camera);
      },
      onResume() { if (active) active.pause(false); screens.hideSheets(); },
      onRestartRack() { if (active) { active.pause(false); active.restartRack(); } screens.hideSheets(); },
      onQuitToMenu() { quitToMenu(); },
      onOpenSettings(from) {
        settingsReturn = from;
        if (from === 'pause' && active) active.pause(true);
        router.go('settings');
      },
      onSettingsBack() {
        if (settingsReturn === 'pause' && active) {
          router.go('match');
          screens.showPause(true, { spectate: !!active.config?.spectate });
          // The match screen was hidden while Settings showed; restore
          // canvas sizes now that it has a real rect again.
          requestAnimationFrame(() => { if (active) active.resize(); });
        }
        else router.go('menu');
      },
      onPace(p) { if (active) active.setPace(p); },
      onRematch() { if (active) startMatch(active.config); },
    },
  });

  const router = createRouter({ screens, store });

  const hud = createHUD({
    onPause() { if (active) active.pause(true); screens.showPause(true, { spectate: !!active.config?.spectate }); },
    onPlace() { if (active && active.onPlaceAction) active.onPlaceAction(); },
    onRerack() { if (active && active.onRerackAction) active.onRerackAction(); },
    onSpinToggle() {},
    onSpin() {},
  });

  function matchConfig() {
    const s = store.get().settings;
    const players = s.opp === 'two'
      ? [{ kind: 'human', name: 'Player 1' }, { kind: 'human', name: 'Player 2' }]
      : [{ kind: 'human', name: 'You' }, { kind: 'ai', tier: s.opp }];
    return { players, hall: s.hall, view: s.view, spectate: false, pace: 1 };
  }
  function exhibitionConfig(left, right) {
    const s = store.get().settings;
    return { players: [{ kind: 'ai', tier: left }, { kind: 'ai', tier: right }], hall: s.hall, view: s.view, spectate: true, pace: 1 };
  }

  function enterMatch(config) {
    stopAttract();
    resetSession(session);
    if (active) active.destroy();
    hud.reset();
    router.go('match');
    active = createMatch({ store, session, audio, hud, screens, config,
      onExit: () => quitToMenu(),
      onMatchEnd: ({ winner }) => {
        const profile = { ...store.get().profile };
        saveProfile(profile);
      },
    });
    active.start();
    requestAnimationFrame(() => { if (active) active.resize(); });
  }
  function startMatch(config) { enterMatch(config); }
  function startPractice() {
    stopAttract();
    resetSession(session);
    if (active) active.destroy();
    hud.reset();
    router.go('match');
    active = createPractice({ store, session, audio, hud, screens, onExit: () => quitToMenu(), onPause: () => hud.reset() && null });
    active.start();
    requestAnimationFrame(() => { if (active) active.resize(); });
  }
  function quitToMenu() {
    if (active) { active.destroy(); active = null; }
    hud.reset();
    screens.hideSheets();
    router.go('menu');
    startAttract();
  }

  function startAttract() {
    stopAttract();
    attract = createAttract($('menu-cv'), { hall: hallById(store.get().settings.hall) });
    attract.start();
  }
  function stopAttract() { if (attract) { attract.stop(); attract = null; } }
  window.addEventListener('resize', () => { if (attract) attract.resize(); });

  const loop = createLoop((dt) => { if (active) active.frame(dt); });
  loop.start();

  router.go('menu');
  startAttract();

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // QA hook: drives the audio lifecycle probe and boot introspection.
  window.__ghostball = { store, audio, get active() { return active; }, hud, screens };
}

boot();
