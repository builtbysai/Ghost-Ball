// Match HUD controller (DOM, screen space). The 3D renderer never touches
// these elements; the HUD is identical in 2D and 3D (DESIGN.md 6.3).
import { createBanner } from './banner.js';
import { SpinControl } from '../input/spin.js';
import { ballColors } from '../render2d/balls.js';

const $ = (id) => document.getElementById(id);

export function createHUD(handlers = {}) {
  const els = {
    hud: $('hud'), cardA: $('card-a'), cardB: $('card-b'),
    gameLabel: $('hud-game-label'), turnLabel: $('hud-turn-label'),
    powerFill: $('power-fill'), powerNum: $('power-num'),
    powerGauge: $('power-gauge'), aimStrip: $('aim-strip'),
    spinBtn: $('spin-btn'), spinBtnDot: $('spin-btn-dot'),
    spinPad: $('spin-pad'), spinBall: $('spin-ball'), spinDot: $('spin-dot'),
    placeBtn: $('place-btn'), rerackBtn: $('rerack-btn'),
    spectateTag: $('spectate-tag'),
  };
  const bannerApi = createBanner($('banner'));
  // callable + method-bearing so callers can hud.banner(txt, opts)
  const banner = (text, opts) => bannerApi.show(text, opts);
  banner.show = bannerApi.show; banner.hide = bannerApi.hide; banner.clear = bannerApi.clear;
  const spin = new SpinControl();
  const cards = [els.cardA, els.cardB];

  $('pause-btn').addEventListener('click', () => handlers.onPause && handlers.onPause());
  els.placeBtn.addEventListener('click', () => handlers.onPlace && handlers.onPlace());
  els.rerackBtn.addEventListener('click', () => handlers.onRerack && handlers.onRerack());

  function paintSpin() {
    const t = `translate(${spin.x * 26}px, ${spin.y * 26}px)`;
    els.spinDot.style.transform = t;
    els.spinBtnDot.style.transform = `translate(${spin.x * 9}px, ${spin.y * 9}px)`;
  }
  els.spinBtn.addEventListener('click', () => {
    els.spinPad.classList.toggle('hidden');
    if (handlers.onSpinToggle) handlers.onSpinToggle(!els.spinPad.classList.contains('hidden'));
  });
  let padDrag = false;
  const padMove = (ev) => {
    if (!padDrag) return;
    const r = els.spinBall.getBoundingClientRect();
    spin.fromPad(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2), r.width / 2);
    paintSpin();
    if (handlers.onSpin) handlers.onSpin(spin.value);
  };
  els.spinBall.addEventListener('pointerdown', (ev) => {
    padDrag = true; els.spinBall.setPointerCapture(ev.pointerId); padMove(ev);
  });
  els.spinBall.addEventListener('pointermove', padMove);
  els.spinBall.addEventListener('pointerup', () => { padDrag = false; });
  els.spinBall.addEventListener('dblclick', () => { spin.center(); paintSpin(); });
  paintSpin();

  return {
    els, banner, spin,
    spinValue() { return { x: spin.value.x, y: spin.value.y }; },
    setPlayers(players, activeIdx) {
      cards.forEach((card, i) => {
        if (!card) return;
        const p = players[i];
        card.classList.toggle('hidden', !p);
        if (!p) return;
        card.querySelector('.p-name').textContent = p.name;
        card.querySelector('.p-sub').textContent = p.sub || '';
        card.classList.toggle('active', i === activeIdx);
      });
    },
    setActive(idx) {
      cards.forEach((c, i) => c && c.classList.toggle('active', i === idx));
    },
    setBallTrays(groups, potted) {
      // groups: [group|null, group|null]; potted: {0:[ids],1:[ids]} by owner
      cards.forEach((card, i) => {
        if (!card) return;
        const tray = card.querySelector('.tray');
        tray.innerHTML = '';
        (potted[i] || []).forEach((id) => {
          const c = ballColors(id);
          const d = document.createElement('i');
          d.className = 'tray-dot';
          d.style.background = c.stripe
            ? `linear-gradient(${c.base} 0 30%, #f4efe2 30% 70%, ${c.base} 70%)`
            : c.base;
          tray.appendChild(d);
        });
      });
    },
    setTurn(text) { els.turnLabel.textContent = text; },
    setGameLabel(text) { els.gameLabel.textContent = text; },
    setPower(frac) {
      const p = Math.max(0, Math.min(1, frac));
      els.powerFill.style.height = `${Math.round(p * 100)}%`;
      els.powerNum.textContent = String(Math.round(p * 100));
    },
    setPulling(on) {
      els.powerGauge.classList.toggle('locked', !!on);
      els.aimStrip.classList.toggle('locked', !!on);
    },
    setRolling(on) { els.hud.classList.toggle('rolling', !!on); },
    showPlacing(on) { els.placeBtn.classList.toggle('hidden', !on); },
    showRerack(on) { els.rerackBtn.classList.toggle('hidden', !on); },
    setSpectate(on) {
      els.spectateTag.classList.toggle('hidden', !on);
      els.hud.classList.toggle('spectate', !!on);
    },
    reset() {
      banner.clear();
      this.setPower(0);
      this.setPulling(false);
      this.setRolling(false);
      this.showPlacing(false);
      this.showRerack(false);
      this.setSpectate(false);
      els.spinPad.classList.add('hidden');
      spin.center(); paintSpin();
      cards.forEach((c) => { if (c) c.querySelector('.tray').innerHTML = ''; });
    },
  };
}
