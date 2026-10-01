// Match controller: wires sim + rules + input + renderer + audio + HUD.
// Owns the turn state machine and every on-cloth interaction.
import { Sim, STEP } from '../sim/physics.js';
import { BALL_R, HALF_L, HALF_W, HEAD_X, FOOT_X, buildTable } from '../sim/table.js';
import { Rules8, Rules9, ballGroup } from '../sim/rules.js';
import { placeRack } from '../sim/rack.js';
import { previewShot } from '../sim/preview.js';
import { Stroke, speedFromPower } from '../input/stroke.js';
import { angleFromPoint, fineDelta } from '../input/aim.js';
import { attachGestures } from '../input/gestures.js';
import { Render2D } from '../render2d/renderer.js';
import { chooseShot } from './ai.js';
import { hallById } from '../state/halls.js';
import * as sfx from '../audio/sfx.js';

const AI_NAMES = { rookie: 'Rookie', club: 'Club Pro', champ: 'Champion' };

export function createMatch(deps) {
  const { store, session, audio, hud, screens, onExit, onMatchEnd } = deps;
  const settings = store.get().settings;
  const hall = hallById(settings.hall);
  const cfg = deps.config; // {players:[{kind,tier?,name}], hall, view, spectate, pace, game}
  const rngState = { seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 };
  let rng = cfg.seed != null ? makeRng(cfg.seed) : makeRng(rngState.seed);

  // --- sim + rules ---
  const sim = new Sim({ pocketScale: 1.06, trackOrient: true });
  const game = settings.game === '9ball' ? '9ball' : '8ball';
  const rules = game === '9ball' ? new Rules9() : new Rules8();
  let activeRenderer = null; // Render2D | Render3D-ish
  let renderer2d = null;
  let renderer3d = null;
  const cv2d = document.getElementById('cv2d');
  const cv3dWrap = document.getElementById('cv3d-wrap');

  // --- match state ---
  let phase = 'aim'; // aim|pulling-substate|rolling|placing|ai-think|over
  let aimAngle = 0;
  let stroke = new Stroke();
  let pulling = false; // aim locked, feeding the stroke
  let pullSample = 0; // draw meters currently drawn
  let shotIndex = 0;
  let turn = 0; // 0 | 1
  let guidePreview = null;
  let marks = [];
  let pendingPlace = null; // {x,y,valid} ghost while placing
  let kitchenOnly = false;
  let aiPlan = null; // {aimAngle, shot} for animation
  let aiTimer = 0;
  let simAccum = 0;
  let eventCursor = []; // events collected during the current roll
  let firstContactId = null;
  let pottedThisShot = [];
  let pottedPockets = {}; // ballId -> pocket index, for the called-8 verdict
  let cuePotted = false;
  let railAfterContact = false;
  let stats = { pots: [0, 0], fouls: [0, 0], runs: [0, 0], best: [0, 0] };
  let wasBreak = true;
  let destroyed = false;
  let paused = false;
  let detachGestures = null;

  const table = buildTable(1.06); // pockets geometry for placement checks

  // ---------- rack ----------
  function rack() {
    placeRack(sim, game, rng);
    rules.startRack();
    aimAngle = 0; shotIndex = 0; turn = 0; wasBreak = true;
    firstContactId = null; pottedThisShot = []; cuePotted = false; railAfterContact = false;
    marks = [];
    stats = { pots: [0, 0], fouls: [0, 0], runs: [0, 0], best: [0, 0] };
    hud.setPlayers(playerCards(), turn);
    hud.setTurn(turnText());
    hud.setGameLabel(settings.game === '9ball' ? '9-BALL' : '8-BALL');
    hud.setBallTrays(groups(), { 0: [], 1: [] });
    hud.banner(`Rack 'em — ${playerCards()[0].name} to break`, { tone: 'info' });
    beginAim();
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- players / labels ----------
  function playerCards() {
    return cfg.players.map((p, i) => {
      if (p.kind === 'ai') return { name: AI_NAMES[p.tier] || 'Rival', sub: p.tier === 'club' ? 'Club champion' : p.tier === 'champ' ? 'Table legend' : 'Learning the game' };
      return { name: p.name || (cfg.players.length > 1 ? `Player ${i + 1}` : 'You'), sub: i === 0 ? 'To play' : 'To play' };
    });
  }
  function groups() { return rules.state.groups; }
  function groupLabel(i) {
    const g = groups()[i];
    return g ? (g === 'solid' ? 'Solids' : 'Stripes') : 'Open';
  }
  function turnText() {
    const card = playerCards()[turn];
    // Rotation: no name prefix — the number is the information, and the
    // narrow top bar cannot fit both name and state at phone widths.
    if (rules.sequence) {
      return rules.onEight(turn) ? `The ${rules.finalId ?? 9} ball` : `Lowest ball ${rules.lowest()}`;
    }
    const onFinal = rules.onEight(turn);
    return `${card.name} · ${onFinal ? `The ${rules.finalId ?? 8} ball` : groupLabel(turn)}`;
  }

  // ---------- turn flow ----------
  function beginAim() {
    phase = 'aim'; pulling = false; guidePreview = null;
    stroke.reset();
    hud.setRolling(false); hud.showPlacing(false); hud.setPulling(false);
    hud.setActive(turn); hud.setTurn(turnText());
    const me = cfg.players[turn];
    if (me.kind === 'ai') {
      phase = 'ai-think';
      aiTimer = (0.9 + rng() * 0.6) / cfg.pace;
      aiPlan = null;
    } else if (cfg.spectate) {
      beginSpectateTurn();
    }
  }

  function beginSpectateTurn() {
    phase = 'ai-think';
    aiTimer = 0.7 / cfg.pace;
    aiPlan = null;
  }

  function aiThinkDone() {
    const me = cfg.players[turn];
    if (me.kind !== 'ai') { beginSpectateTurn(); return; }
    try {
      aiPlan = chooseShot(sim, rules, me.tier, rng);
    } catch (e) {
      aiPlan = { aimAngle, shot: { angle: aimAngle, speed: 2, spin: { x: 0, y: 0 } } };
    }
    // On the 8, the AI calls the pocket it is aiming at, same as a human.
    if (game === '8ball' && aiPlan.pocket != null && rules.onEight(turn)) {
      rules.callPocket(aiPlan.pocket);
      marks = [aiPlan.pocket];
    }
    phase = 'ai-aim';
    aiTimer = 0.55 / cfg.pace; // cue tracks to the chosen angle
  }

  function aiPullDone() {
    // strike with the planned shot
    aimAngle = aiPlan.aimAngle;
    executeShot(aiPlan.shot.speed, aiPlan.shot.spin, aiPlan.shot.angle);
  }

  // ---------- shooting ----------
  function currentSpeed() {
    if (pulling) return speedFromPower(Math.max(0, Math.min(1, pullSample / 0.62)));
    return 3.2; // guide assumption while aiming
  }
  function executeShot(speed, spin, angle) {
    if (phase === 'over' || phase === 'rolling') return;
    const cue = sim.ball(0);
    if (!cue || cue.pocketed) return;
    const shot = { angle: angle ?? aimAngle, speed, spin: spin || hud.spinValue() };
    sim.strike(shot);
    sfx.cueStrike(audio, { power: Math.min(1, speed / 9.5) });
    pulling = false; hud.setPulling(false); hud.setPower(0);
    phase = 'rolling'; simAccum = 0;
    eventCursor = []; firstContactId = null; pottedThisShot = [];
    pottedPockets = {}; cuePotted = false; railAfterContact = false;
    hud.setRolling(true); hud.banner.hide();
    shotIndex++;
  }

  function stepRolling(dt) {
    simAccum += dt / cfg.pace;
    const budget = simAccum;
    let used = 0;
    while (used < budget) {
      const evs = sim.step(STEP);
      used += STEP;
      for (const ev of evs) handleEvent(ev);
      if (sim.rest()) { simAccum = 0; finishRoll(); return; }
    }
    simAccum -= used;
    if (sim.rest()) { simAccum = 0; finishRoll(); }
  }

  function handleEvent(ev) {
    eventCursor.push(ev);
    const pan = evBallX(ev) / HALF_L;
    if (ev.type === 'contact') {
      if (firstContactId == null && (ev.a === 0 || ev.b === 0)) firstContactId = ev.a === 0 ? ev.b : ev.a;
      if (firstContactId != null) railAfterContact = false; // reset; set by cushion after
      sfx.clack(audio, { speed: ev.speed, pan });
    } else if (ev.type === 'cushion') {
      if (firstContactId != null) railAfterContact = true;
      sfx.thump(audio, { speed: ev.speed, pan });
    } else if (ev.type === 'pocket') {
      railAfterContact = true; // a pot satisfies "something happened"
      sfx.pocketDrop(audio, { pan });
      if (ev.ball === 0) { cuePotted = true; }
      else {
        pottedThisShot.push(ev.ball);
        if (ev.pocket != null) pottedPockets[ev.ball] = ev.pocket;
      }
    }
  }
  function evBallX(ev) {
    const b = sim.ball(ev.type === 'contact' ? ev.a : ev.ball);
    return b ? b.x : 0;
  }

  function finishRoll() {
    const summary = {
      firstContactId,
      potted: pottedThisShot,
      pocketOf: pottedPockets,
      cuePotted,
      railAfterContact,
      wasBreak,
    };
    const out = rules.settle(summary);
    stats.fouls[turn] += out.foul ? 1 : 0;
    // trays
    const trays = { 0: [], 1: [] };
    for (const b of sim.balls) {
      if (b.pocketed && b.id !== 0) {
        const g0 = rules.state.groups[0];
        const owner = g0 == null ? turn : (ballGroup(b.id) === g0 ? 0 : 1);
        trays[owner].push(b.id);
      }
    }
    hud.setBallTrays(rules.state.groups, trays);

    if (out.gameOver) { endMatch(out); return; }
    const respotId = out.respotId ?? (out.respot8 ? 8 : null);
    if (respotId != null) {
      const ball = sim.ball(respotId);
      if (ball) {
        ball.pocketed = false;
        const spot = freeSpotNear(FOOT_X, 0);
        ball.x = spot.x; ball.y = spot.y;
        ball.vx = ball.vy = ball.vz = 0;
        ball.wx = ball.wy = ball.wz = 0;
        hud.banner(`${respotId} ball re-spotted`, { tone: 'info' });
      }
    }
    turn = out.nextTurn;
    wasBreak = false;
    const potsByTurn = pottedThisShot.length;
    if (!out.foul && potsByTurn > 0) {
      stats.pots[turn] += potsByTurn; // turn unchanged when continuing
      stats.runs[turn] += potsByTurn;
      stats.best[turn] = Math.max(stats.best[turn], stats.runs[turn]);
    } else {
      stats.runs[turn] = 0;
    }
    if (out.ballInHand) {
      beginPlacing(out.ballInHand === 'kitchen');
      if (out.foul) hud.banner(out.message || 'Foul — ball in hand', { tone: 'fault' });
      return;
    }
    if (out.foul) hud.banner(out.message || 'Foul', { tone: 'fault' });
    else if (potsByTurn > 0) hud.banner(potMessage(), { tone: 'good' });
    beginAim();
  }

  function potMessage() {
    const names = pottedThisShot.map((id) => `#${id}`).join(', ');
    if (game === '9ball' || groups()[0] != null) return `Sunk ${names}`;
    const g = ballGroup(pottedThisShot[0]);
    return `Sunk ${names} — you are ${g === 'solid' ? 'solids' : 'stripes'}`;
  }

  function freeSpotNear(x, y) {
    for (let r = 0; r < 30; r++) {
      const xx = x + (rng() - 0.5) * 0.3, yy = y + (rng() - 0.5) * 0.2;
      if (Math.abs(xx) > HALF_L - BALL_R * 2 || Math.abs(yy) > HALF_W - BALL_R * 2) continue;
      if (sim.balls.some((b) => !b.pocketed && Math.hypot(b.x - xx, b.y - yy) < BALL_R * 3)) continue;
      return { x: xx, y: yy };
    }
    return { x: FOOT_X, y: 0 };
  }

  // ---------- ball in hand ----------
  function beginPlacing(kitchen) {
    phase = 'placing'; kitchenOnly = kitchen;
    hud.setRolling(false);
    const cue = sim.ball(0);
    if (cue && cue.pocketed) { cue.pocketed = false; cue.x = kitchen ? HEAD_X : HEAD_X; cue.y = 0; }
    pendingPlace = { x: HEAD_X, y: 0, valid: true };
    hud.showPlacing(true);
    hud.setTurn(`${playerCards()[turn].name} · Place the cue ball`);
    hud.banner(kitchen ? 'Ball in hand — behind the head string' : 'Ball in hand', { tone: 'info' });
  }
  function placeValid(x, y) {
    if (Math.abs(x) > HALF_L - BALL_R * 2 || Math.abs(y) > HALF_W - BALL_R * 2) return false;
    if (kitchenOnly && x > HEAD_X) return false;
    if (sim.table.pockets.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + BALL_R)) return false;
    if (sim.balls.some((b) => !b.pocketed && b.id !== 0 && Math.hypot(b.x - x, b.y - y) < BALL_R * 2.2)) return false;
    return true;
  }
  function commitPlace() {
    if (phase !== 'placing') return;
    if (!pendingPlace.valid) { hud.banner('Not there — pick a clear spot', { tone: 'fault' }); return; }
    const cue = sim.ball(0);
    cue.x = pendingPlace.x; cue.y = pendingPlace.y;
    cue.vx = cue.vy = cue.vz = cue.wx = cue.wy = cue.wz = 0;
    pendingPlace = null;
    hud.banner('Ball placed — aim away', { tone: 'good', ms: 800 });
    beginAim();
  }

  // ---------- end of match ----------
  function endMatch(out) {
    phase = 'over';
    const winner = out.winner;
    const humanWon = winner === 0 && cfg.players[0].kind === 'human';
    hud.banner(out.message || 'Game over', { tone: out.winner === 0 ? 'big' : 'fault', ms: 2200 });
    const profile = { ...store.get().profile };
    profile.matches++;
    if (humanWon) profile.wins++;
    profile.pots += stats.pots[0] + (cfg.players[0].kind === 'human' ? stats.pots[0] : 0);
    profile.bestRun = Math.max(profile.bestRun, stats.best[0], stats.best[1]);
    store.set({ profile });
    const cards = playerCards();
    setTimeout(() => {
      if (destroyed) return;
      screens.showResults({
        kicker: 'Match result',
        title: cards[winner].name + (winner === 0 && cfg.players[0].kind === 'human' ? ' win!' : winner === 1 && cfg.players[1].kind === 'human' ? ' win!' : ' takes the rack'),
        defeat: !humanWon && !cfg.spectate,
        reason: out.reason || '',
        stats: [
          [`${cards[0].name} balls`, String(stats.pots[0])],
          [`${cards[1].name} balls`, String(stats.pots[1])],
          ['Best run', String(Math.max(stats.best[0], stats.best[1]))],
        ],
      });
      if (onMatchEnd) onMatchEnd({ winner, out });
    }, 1800);
  }

  // ---------- frame ----------
  function frame(dtMs) {
    if (destroyed || paused) return;
    const dt = Math.min(0.1, dtMs / 1000);
    if (phase === 'ai-think') {
      aiTimer -= dt;
      if (aiTimer <= 0) aiThinkDone();
    } else if (phase === 'ai-aim' && aiPlan) {
      // cue tracks to the chosen angle, then pulls
      const k = 1 - Math.exp(-dt * 6 * cfg.pace);
      aimAngle += shortestAngle(aimAngle, aiPlan.aimAngle) * k;
      aiTimer -= dt;
      if (aiTimer <= 0) {
        phase = 'ai-pull';
        pullSample = 0; aiTimer = 0.32 / cfg.pace;
      }
    } else if (phase === 'ai-pull') {
      aiTimer -= dt;
      pullSample = Math.min(0.34, pullSample + dt * 1.4);
      hud.setPower(pullSample / 0.62);
      if (aiTimer <= 0) aiPullDone();
    } else if (phase === 'rolling') {
      stepRolling(dt);
    }
    // guide
    if ((phase === 'aim' && !pulling) || (phase === 'ai-aim' && cfg.spectate)) {
      const me = cfg.players[turn];
      const showGuide = phase === 'aim' ? me.kind === 'human' : true;
      if (showGuide && sim.ball(0) && !sim.ball(0).pocketed) {
        guidePreview = previewShot(sim, {
          angle: phase === 'aim' ? aimAngle : (aiPlan ? aiPlan.aimAngle : aimAngle),
          speed: 3.2, spin: hud.spinValue(),
        }, {
          isLegalFirst: (id) => rules.legalFirstIds().includes(id),
        });
        if (guidePreview && guidePreview.firstContactId != null) {
          guidePreview.wrongFirst = !rules.legalFirstIds().includes(guidePreview.firstContactId);
        }
      } else guidePreview = null;
    } else guidePreview = null;
    draw();
  }

  function draw() {
    const r = activeRenderer;
    if (!r) return;
    const guideMode = store.get().settings.guide;
    const view = r.view();
    const cueBall = sim.ball(0);
    const showCue = (phase === 'aim' || phase === 'ai-aim' || phase === 'ai-pull')
      && cueBall && !cueBall.pocketed;
    r.draw({
      balls: sim.balls,
      guide: guideMode === 'none' ? null : guidePreview,
      guideMode,
      cue: showCue ? {
        angle: phase === 'aim' ? aimAngle : (aiPlan ? aiPlan.aimAngle : aimAngle),
        pullPx: pullSample * view.scale,
        spin: { x: hud.spin.x, y: hud.spin.y },
      } : null,
      place: phase === 'placing' && pendingPlace ? { ...pendingPlace, kitchen: kitchenOnly } : null,
      marks,
      time: performance.now(),
    });
  }

  // ---------- input wiring ----------
  function bindInput() {
    // Both stage surfaces get the same gesture wiring; only the visible
    // one can receive a pointerdown (the other is display:none), and
    // toTable routes through whichever renderer is active.
    const gestureOpts = (surface) => ({
      surface,
      powerEl: document.getElementById('power-gauge'),
      aimEl: document.getElementById('aim-strip'),
      toTable: (ev) => {
        const r = activeRenderer;
        if (!r) return null;
        const rect = (r.canvas || cv2d).getBoundingClientRect();
        return r.toTable(ev.clientX - rect.left, ev.clientY - rect.top);
      },
      getAim: () => aimAngle,
      getCue: () => { const c = sim.ball(0); return c ? { x: c.x, y: c.y } : null; },
      getView: () => (activeRenderer ? activeRenderer.view() : { scale: 300 }),
      callbacks: {
        canPull: () => phase === 'aim',
        onAim(angle) {
          if (phase !== 'aim' || pulling) return;
          aimAngle = angle;
        },
        onPullStart() {
          if (phase !== 'aim' || pulling) return;
          pulling = true; stroke.reset(); pullSample = 0;
          hud.setPulling(true);
        },
        onStroke(sampleM, t) {
          if (!pulling || phase !== 'aim') return;
          pullSample = Math.max(0, sampleM);
          const res = stroke.push(sampleM, t);
          hud.setPower(res.pull);
          if (res.fire != null) {
            pulling = false;
            executeShot(speedFromPower(res.fire), { x: hud.spin.x, y: hud.spin.y });
          }
        },
        onStrokeRelease(sampleM, t) {
          if (!pulling || phase !== 'aim') return;
          const res = stroke.release(sampleM, t);
          pulling = false;
          hud.setPulling(false);
          hud.setPower(0);
          if (res.fire != null) executeShot(speedFromPower(res.fire), { x: hud.spin.x, y: hud.spin.y });
        },
        onFineAim(d) {
          if (phase !== 'aim' || pulling) return;
          aimAngle += d;
        },
        onPowerPull(frac) {
          if (phase !== 'aim') return;
          if (!pulling) {
            pulling = true; stroke.reset(); hud.setPulling(true);
          }
          pullSample = frac * 0.62;
          const res = stroke.push(pullSample, performance.now() / 1000);
          hud.setPower(res.pull);
        },
        onPowerRelease(frac) {
          if (!pulling || phase !== 'aim') return;
          pullSample = frac * 0.62;
          const res = stroke.release(pullSample, performance.now() / 1000);
          pulling = false; hud.setPulling(false); hud.setPower(0);
          if (res.fire != null) executeShot(speedFromPower(res.fire), { x: hud.spin.x, y: hud.spin.y });
        },
        onHover(pt) {
          if (phase === 'placing' && pt) pendingPlace = { x: pt.x, y: pt.y, valid: placeValid(pt.x, pt.y) };
        },
        onTapPlace(pt) {
          handleTap(pt);
        },
      },
    });
    const detach2d = attachGestures(gestureOpts(cv2d));
    const detach3d = attachGestures(gestureOpts(cv3dWrap));
    detachGestures = () => { detach2d(); detach3d(); };
  }

  function handleTap(pt) {
    if (phase === 'placing' && pt) {
      // tap: move ghost if invalid, commit if the tap is on a valid spot
      pendingPlace = { x: pt.x, y: pt.y, valid: placeValid(pt.x, pt.y) };
      if (pendingPlace.valid) commitPlace();
      else hud.banner('Not there — pick a clear spot', { tone: 'fault', ms: 700 });
      return;
    }
    if (phase !== 'aim' || pulling) return;
    if (pt && game === '8ball' && rules.onEight(turn)) {
      const pocket = nearestPocket(pt);
      if (pocket) {
        rules.callPocket(pocket.index);
        marks = [pocket.index];
        hud.banner(`8 ball called: ${pocketName(pocket)}`, { tone: 'info' });
      }
    }
  }

  function nearestPocket(pt) {
    let best = null, bd = Infinity;
    sim.table.pockets.forEach((p, index) => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < p.r * 2.2 && d < bd) { bd = d; best = { ...p, index }; }
    });
    return best;
  }
  function pocketName(p) {
    const v = p.y > 0 ? 'top' : 'bottom';
    const h = Math.abs(p.x) < 0.2 ? 'middle' : p.x > 0 ? 'right' : 'left';
    return `${v} ${h}`;
  }

  // ---------- renderer setup ----------
  function setView(v) {
    settings.view = v;
    const show3d = v === '3d';
    cv2d.classList.toggle('hidden', show3d);
    cv3dWrap.classList.toggle('hidden', !show3d);
    if (show3d) {
      ensure3d().then((ok) => {
        if (ok) { activeRenderer = renderer3d; resize(); }
        else { // fall back to 2D silently
          cv2d.classList.remove('hidden'); cv3dWrap.classList.add('hidden');
          activeRenderer = renderer2d; resize();
          hud.banner('3D unavailable — 2D', { tone: 'info' });
        }
      });
    } else {
      activeRenderer = renderer2d; resize();
    }
  }
  async function ensure3d() {
    if (renderer3d) return true;
    try {
      const m = await import('../render3d/renderer.js');
      renderer3d = await m.Render3D.create(cv3dWrap);
      renderer3d.setHall(hall);
      renderer3d.setCameraPreset(store.get().settings.camera || 'elevated');
      return true;
    } catch (e) {
      renderer3d = null;
      return false;
    }
  }
  function resize() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const rect = document.getElementById('stage').getBoundingClientRect();
    // Never size from a hidden screen (e.g. while Settings is showing):
    // a ~0 rect would crush both canvases to a cleared 50px square, and
    // no resize fires when the match screen returns. boot re-resizes
    // on the way back in.
    if (rect.width < 8 || rect.height < 8) return;
    const w = Math.max(50, rect.width), h = Math.max(50, rect.height);
    if (activeRenderer === renderer2d || !activeRenderer) {
      cv2d.width = Math.round(w * dpr); cv2d.height = Math.round(h * dpr);
      cv2d.style.width = `${w}px`; cv2d.style.height = `${h}px`;
      if (!renderer2d) { renderer2d = new Render2D(cv2d); renderer2d.setHall(hall); }
      renderer2d.resize(w, h, dpr);
      activeRenderer = activeRenderer || renderer2d;
    }
    if (renderer3d) renderer3d.resize(w, h, dpr);
  }

  // ---------- keyboard ----------
  function onKey(ev) {
    if (destroyed) return;
    if (ev.key === 'Escape') {
      if (phase === 'aim' && pulling) { pulling = false; stroke.reset(); hud.setPulling(false); hud.setPower(0); }
      else api.pause(true);
      return;
    }
    if (phase !== 'aim' || pulling || cfg.players[turn].kind !== 'human') return;
    const step = ev.shiftKey ? 0.0004 : 0.0016;
    if (ev.key === 'ArrowLeft') aimAngle += step;
    else if (ev.key === 'ArrowRight') aimAngle -= step;
  }

  // ---------- public ----------
  const api = {
    start() {
      renderer2d = new Render2D(cv2d);
      renderer2d.setHall(hall);
      renderer2d.canvas = cv2d;
      activeRenderer = renderer2d;
      bindInput();
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', resize);
      resize();
      if (settings.view === '3d') setView('3d');
      hud.setSpectate(!!cfg.spectate);
      hud.setGameLabel(settings.game === '9ball' ? '9-BALL' : '8-BALL');
      rack();
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      if (detachGestures) detachGestures();
    },
    frame,
    setView,
    setCameraPreset(p) { if (renderer3d) renderer3d.setCameraPreset(p); },
    setPace(p) { cfg.pace = p; },
    pause(on) { paused = on; },
    restartRack() { paused = false; rack(); },
    resize,
    config: cfg,
    sim,
    aimAt(angle) { aimAngle = angle; },
    phase() { return phase; },
    debugShoot(angle, power) {
      if (phase !== 'aim') return false;
      aimAngle = angle;
      executeShot(speedFromPower(Math.max(0.01, Math.min(1, power))), { x: 0, y: 0 });
      return true;
    },
    commitPlaceAt(x, y) {
      pendingPlace = { x, y, valid: placeValid(x, y) };
      commitPlace();
    },
    // QA hook: CSS px of a table point under the active renderer.
    debugProject(x, y) {
      const r = activeRenderer;
      if (!r || typeof r.project !== 'function') return null;
      const rect = (r.canvas || cv2d).getBoundingClientRect();
      const p = r.project(x, y);
      return p ? { x: rect.left + p[0], y: rect.top + p[1] } : null;
    },
    debugView() { return settings.view; },
    // QA hook: what the stroke machine has actually seen this gesture.
    debugStroke() {
      return {
        armed: stroke.armed, forward: stroke.forward, peak: stroke.peak,
        pulling, pullSample,
        samples: stroke.samples.slice(-8).map((s) => ({ s: +s.s.toFixed(3), t: +s.t.toFixed(3) })),
      };
    },
    // QA hook: table meters for a client point under the active renderer.
    debugToTable(cx, cy) {
      const r = activeRenderer;
      if (!r || typeof r.toTable !== 'function') return null;
      const rect = (r.canvas || cv2d).getBoundingClientRect();
      return r.toTable(cx - rect.left, cy - rect.top);
    },
  };
  api.onPlaceAction = commitPlace;
  api.onRerackAction = () => api.restartRack();
  return api;
}

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
