// Practice: free table, no rules, no turns. Aim, stroke, move the cue ball,
// re-rack. createPractice(deps) -> { start(), destroy(), frame(dtMs) }
import { Sim, STEP } from '../sim/physics.js';
import { BALL_R, HALF_L, HALF_W, HEAD_X } from '../sim/table.js';
import { placeRack } from '../sim/rack.js';
import { previewShot } from '../sim/preview.js';
import { Stroke, speedFromPower } from '../input/stroke.js';
import { attachGestures } from '../input/gestures.js';
import { Render2D } from '../render2d/renderer.js';
import { hallById } from '../state/halls.js';
import * as sfx from '../audio/sfx.js';

export function createPractice(deps) {
  const { store, audio, hud, screens, onExit } = deps;
  const settings = store.get().settings;
  const hall = hallById(settings.hall);
  const sim = new Sim({ pocketScale: 1.06, trackOrient: true });
  const cv2d = document.getElementById('cv2d');

  let renderer = null, destroyed = false;
  let aimAngle = 0, stroke = new Stroke();
  let pulling = false, pullSample = 0;
  let rolling = false, simAccum = 0;
  let placing = false, pendingPlace = null;
  let guidePreview = null, detach = null;

  function rack() {
    // Practice racks the game picked on the menu (9-ball gets its diamond).
    let s = (Date.now() ^ 0x9E3779B9) >>> 0;
    const rngFn = () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    placeRack(sim, settings.game === '9ball' ? '9ball' : '8ball', rngFn);
    rolling = false; placing = false; aimAngle = 0;
    hud.setGameLabel('PRACTICE');
    hud.setPlayers([{ name: 'You', sub: 'Free table' }], 0);
    hud.setTurn('Aim, pull, shoot — no rules');
    hud.setBallTrays([null, null], { 0: [], 1: [] });
    hud.showRerack(true);
    hud.showPlacing(true);
    hud.banner('Practice — free table', { tone: 'info' });
  }

  function executeShot(speed) {
    const cue = sim.ball(0);
    if (!cue || cue.pocketed || rolling || placing) return;
    sim.strike({ angle: aimAngle, speed, spin: hud.spinValue() });
    sfx.cueStrike(audio, { power: Math.min(1, speed / 9.5) });
    pulling = false; hud.setPulling(false); hud.setPower(0);
    rolling = true; simAccum = 0; hud.setRolling(true); hud.banner.hide();
  }

  function placeValid(x, y) {
    if (Math.abs(x) > HALF_L - BALL_R * 2 || Math.abs(y) > HALF_W - BALL_R * 2) return false;
    return !sim.balls.some((b) => !b.pocketed && b.id !== 0 && Math.hypot(b.x - x, b.y - y) < BALL_R * 2.2);
  }

  function bindInput() {
    detach = attachGestures({
      surface: cv2d,
      powerEl: document.getElementById('power-gauge'),
      aimEl: document.getElementById('aim-strip'),
      toTable: (ev) => {
        if (!renderer) return null;
        const rect = cv2d.getBoundingClientRect();
        return renderer.toTable(ev.clientX - rect.left, ev.clientY - rect.top);
      },
      getAim: () => aimAngle,
      getCue: () => { const c = sim.ball(0); return c ? { x: c.x, y: c.y } : null; },
      getView: () => (renderer ? renderer.view() : { scale: 300 }),
      callbacks: {
        canPull: () => !placing && !rolling,
        onAim(a) { if (!rolling && !pulling && !placing) aimAngle = a; },
        onPullStart() { if (!rolling && !placing && !pulling) { pulling = true; stroke.reset(); hud.setPulling(true); } },
        onStroke(m, t) {
          if (!pulling || rolling || placing) return;
          pullSample = Math.max(0, m);
          const res = stroke.push(m, t); hud.setPower(res.pull);
          if (res.fire != null) { pulling = false; executeShot(speedFromPower(res.fire)); }
        },
        onStrokeRelease(m, t) {
          if (!pulling || rolling || placing) return;
          const res = stroke.release(m, t);
          pulling = false; hud.setPulling(false); hud.setPower(0);
          if (res.fire != null) executeShot(speedFromPower(res.fire));
        },
        onFineAim(d) { if (!rolling && !pulling && !placing) aimAngle += d; },
        onPowerPull(f) {
          if (rolling || placing) return;
          if (!pulling) { pulling = true; stroke.reset(); hud.setPulling(true); }
          pullSample = f * 0.62;
          hud.setPower(stroke.push(pullSample, performance.now() / 1000).pull);
        },
        onPowerRelease(f) {
          if (!pulling || rolling || placing) return;
          const res = stroke.release(f * 0.62, performance.now() / 1000);
          pulling = false; hud.setPulling(false); hud.setPower(0);
          if (res.fire != null) executeShot(speedFromPower(res.fire));
        },
        onHover(pt) {
          if (!placing || !pt) return;
          pendingPlace = { x: pt.x, y: pt.y, valid: placeValid(pt.x, pt.y) };
        },
        onTapPlace(pt) {
          if (!placing || !pt) return;
          pendingPlace = { x: pt.x, y: pt.y, valid: placeValid(pt.x, pt.y) };
          if (pendingPlace.valid) {
            const cue = sim.ball(0);
            if (cue.pocketed) cue.pocketed = false;
            cue.x = pt.x; cue.y = pt.y; cue.vx = cue.vy = cue.vz = cue.wx = cue.wy = cue.wz = 0;
            placing = false; pendingPlace = null;
            hud.showPlacing(false);
            hud.banner('Cue ball placed', { tone: 'good', ms: 700 });
          } else hud.banner('Not there — pick a clear spot', { tone: 'fault', ms: 700 });
        },
      },
    });
    const onKey = (ev) => {
      if (ev.key === 'Escape') deps.onPause && deps.onPause();
      if (ev.key === 'ArrowLeft') aimAngle += 0.0016;
      if (ev.key === 'ArrowRight') aimAngle -= 0.0016;
    };
    window.addEventListener('keydown', onKey);
    deps._practiceKey = onKey;
  }

  function resize() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const rect = document.getElementById('stage').getBoundingClientRect();
    // Never size from a hidden screen; boot re-resizes on return.
    if (rect.width < 8 || rect.height < 8) return;
    const w = Math.max(50, rect.width), h = Math.max(50, rect.height);
    cv2d.width = Math.round(w * dpr); cv2d.height = Math.round(h * dpr);
    cv2d.style.width = `${w}px`; cv2d.style.height = `${h}px`;
    renderer.resize(w, h, dpr);
  }

  function frame(dtMs) {
    if (destroyed) return;
    const dt = Math.min(0.1, dtMs / 1000);
    if (rolling) {
      simAccum += dt;
      let used = 0;
      while (used < simAccum) {
        const evs = sim.step(STEP); used += STEP;
        for (const ev of evs) {
          if (ev.type === 'contact') sfx.clack(audio, { speed: ev.speed, pan: 0 });
          else if (ev.type === 'cushion') sfx.thump(audio, { speed: ev.speed, pan: 0 });
          else if (ev.type === 'pocket') sfx.pocketDrop(audio, { pan: 0 });
        }
      }
      simAccum -= used;
      if (sim.rest()) { rolling = false; hud.setRolling(false); }
    }
    const cue = sim.ball(0);
    guidePreview = (!rolling && !pulling && !placing && cue && !cue.pocketed)
      ? previewShot(sim, { angle: aimAngle, speed: 3.2, spin: hud.spinValue() }, { isLegalFirst: () => true })
      : null;
    const view = renderer.view();
    renderer.draw({
      balls: sim.balls, guide: guidePreview, marks: [], time: performance.now(),
      cue: (!rolling && !placing && cue && !cue.pocketed)
        ? { angle: aimAngle, pullM: pullSample, pullPx: pullSample * view.scale, spin: hud.spinValue() } : null,
      place: placing ? pendingPlace : null,
    });
  }

  return {
    start() {
      // Practice is a 2D surface; clear any stale 3D toggle from a match.
      cv2d.classList.remove('hidden');
      document.getElementById('cv3d-wrap').classList.add('hidden');
      renderer = new Render2D(cv2d);
      renderer.setHall(hall);
      bindInput();
      window.addEventListener('resize', resize);
      resize();
      hud.setSpectate(false);
      rack();
    },
    destroy() {
      destroyed = true;
      if (detach) detach();
      window.removeEventListener('resize', resize);
      if (deps._practiceKey) window.removeEventListener('keydown', deps._practiceKey);
    },
    frame,
    setView() {}, setPace() {}, pause() {},
    restartRack() { rack(); },
    onPlaceAction() {
      if (rolling) return;
      placing = !placing;
      const cue = sim.ball(0);
      if (cue && cue.pocketed) { cue.pocketed = false; cue.x = HEAD_X; cue.y = 0; }
      pendingPlace = cue ? { x: cue.x, y: cue.y, valid: true } : null;
      hud.showPlacing(true);
      hud.banner(placing ? 'Move the cue ball — tap to set' : 'Back to aiming', { tone: 'info', ms: 900 });
    },
    onRerackAction() { rack(); },
    resize,
  };
}
