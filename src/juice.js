// Juice: the feel layer. It never changes the physics, only how a shot lands:
// hit-stop on hard impacts, camera recoil and push-in, slow motion for the
// deciding ball, sparks, pocket flashes, callouts and balls that fly to your
// tray. Restraint rules (from the research): everything echoes the core
// mechanic (precision and impact), hit-stop is rare and short, shake is
// scaled by a setting, and nothing trails the balls.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Juice {
  constructor(renderer, opts = {}) {
    this.r = renderer;
    this.shakeScale = opts.shake ?? 1;     // 0..1, set from settings and reduced-motion
    this.effects = [];
    this.sinking = [];
    this.freeze = 0;           // seconds of hit-stop left
    this.freezeCooldown = 0;
    this.timeScale = 1;
    this.timeTarget = 1;
    this.kick = { x: 0, y: 0 };
    this.shake = 0;
    this.zoomTarget = 1;
    this.focus = { x: 0, y: 0 };
    this.slowUntil = 0;
    this.host = null;          // DOM container for callouts and flyers
  }

  setHost(el) { this.host = el; }
  reset() { this.effects = []; this.sinking = []; this.freeze = 0; this.timeScale = this.timeTarget = 1; this.kick = { x: 0, y: 0 }; this.shake = 0; this.zoomTarget = 1; }

  /** Advance the feel layer. Returns the dt the simulation should use (0 while frozen). */
  update(dt, now) {
    const cam = this.r.cam;
    // camera: zoom eases toward its target about the focus point; recoil springs back
    cam.z += (this.zoomTarget - cam.z) * (1 - Math.exp(-dt * 7));
    cam.fx += (this.focus.x - cam.fx) * (1 - Math.exp(-dt * 6));
    cam.fy += (this.focus.y - cam.fy) * (1 - Math.exp(-dt * 6));
    this.kick.x *= Math.exp(-dt * 11); this.kick.y *= Math.exp(-dt * 11);
    this.shake = Math.max(0, this.shake - dt * 24);
    const jx = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake * this.shakeScale : 0;
    const jy = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake * this.shakeScale : 0;
    cam.kx = this.kick.x * this.shakeScale + jx; cam.ky = this.kick.y * this.shakeScale + jy;

    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
    for (const s of this.sinking) {
      s.t += dt / 0.44;
      const k = Math.min(1, s.t), e = k * k;
      s.x = s.sx + (s.tx - s.sx) * e; s.y = s.sy + (s.ty - s.sy) * e;
    }
    this.sinking = this.sinking.filter((s) => s.t < 1);

    this.freezeCooldown = Math.max(0, this.freezeCooldown - dt);
    if (this.freeze > 0) { this.freeze = Math.max(0, this.freeze - dt); return { dt: 0, real: dt }; }
    if (now > this.slowUntil && this.timeTarget < 1) this.timeTarget = 1;
    this.timeScale += (this.timeTarget - this.timeScale) * (1 - Math.exp(-dt * 9));
    return { dt: dt * this.timeScale, real: dt };
  }

  // ---- triggers --------------------------------------------------------------
  /** The cue strikes: recoil against the shot direction (screen space) scaled by power. */
  onStrike(power, dirWorld) {
    const p = this.r.toScreen(0, 0), q = this.r.toScreen(dirWorld[0] * 0.1, dirWorld[1] * 0.1);
    const sx = q.x - p.x, sy = q.y - p.y, l = Math.hypot(sx, sy) || 1;
    const mag = 2 + power * 9;
    this.kick.x = -sx / l * mag; this.kick.y = -sy / l * mag;
    if (power > 0.85) this.shake = Math.max(this.shake, 5 + (power - 0.85) * 25);
    this.zoomTarget = 1;
  }

  /** Aim push-in: creep toward the cue ball as the stroke is drawn back. */
  setAim(power, cueBall) {
    this.zoomTarget = 1 + 0.045 * clamp(power, 0, 1);
    if (cueBall) { this.focus.x = cueBall.x; this.focus.y = cueBall.y; }
  }
  clearAim() { this.zoomTarget = 1; this.focus.x = 0; this.focus.y = 0; }

  onBall(e, isBreakHit = false) {
    if (e.speed > 1.4) this.effects.push({ type: 'ring', x: e.x, y: e.y, t: 0, dur: 0.28, s: Math.min(1, e.speed / 5) });
    if (e.speed > 2.6) this.sparks(e.x, e.y, Math.min(9, 3 + Math.round(e.speed)), e.speed);
    // hit-stop: only for real impacts, rarely, and briefly
    if (e.speed > (isBreakHit ? 3 : 4.2) && this.freezeCooldown <= 0) {
      this.freeze = isBreakHit ? 0.075 : 0.04;
      this.freezeCooldown = 0.6;
      if (isBreakHit) this.shake = Math.max(this.shake, 7);
    }
  }

  onRail(e) {
    if (e.speed > 3.2) { this.kick.x += (Math.random() - 0.5) * 2; this.kick.y += (Math.random() - 0.5) * 2; }
  }

  onPocket(e, pocket, table, ball) {
    const pk = table.pockets[pocket];
    this.effects.push({ type: 'pflash', x: pk.mx, y: pk.my, t: 0, dur: 0.5 });
    this.sparks(pk.mx, pk.my, 7, 3, this.r.hall.accent);
    this.shake = Math.max(this.shake, 2 + Math.min(3, Math.hypot(e.vx, e.vy)));
    this.sinking.push({ id: e.id, x: e.x, y: e.y, sx: e.x, sy: e.y, tx: pk.x + (pk.x - pk.mx) * 0.4, ty: pk.y + (pk.y - pk.my) * 0.4, t: 0, q: ball ? ball.q.slice() : [1, 0, 0, 0] });
  }

  sparks(x, y, n, speed, color) {
    const parts = Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, v: 0.03 + Math.random() * 0.05 * (0.5 + speed / 6) }));
    this.effects.push({ type: 'spark', x, y, t: 0, dur: 0.32, parts, color });
  }

  chalkPuff(x, y) {
    const parts = Array.from({ length: 8 }, () => ({ dx: (Math.random() - 0.5) * 0.06, dy: (Math.random() - 0.5) * 0.06 }));
    this.effects.push({ type: 'chalk', x, y, t: 0, dur: 0.6, parts });
  }

  /** Slow motion and a push toward the pocket for the deciding ball. */
  slowMo(point, now, seconds = 1.6) {
    this.timeTarget = 0.28;
    this.slowUntil = now + seconds;
    this.zoomTarget = 1.22;
    this.focus.x = point.x; this.focus.y = point.y;
  }
  releaseSlowMo() { this.timeTarget = 1; this.slowUntil = 0; this.zoomTarget = 1; this.focus.x = 0; this.focus.y = 0; }

  // ---- DOM: callouts and flyers -----------------------------------------------
  callout(title, sub = '', tone = 'good') {
    if (!this.host) return;
    const el = document.createElement('div');
    el.className = `callout ${tone}`;
    el.innerHTML = `<b></b><span></span>`;
    el.querySelector('b').textContent = title;
    el.querySelector('span').textContent = sub;
    // stack: push existing ones up
    this.host.querySelectorAll('.callout').forEach((c, i, all) => { c.style.setProperty('--lift', `${(all.length - i) * 58}px`); });
    this.host.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  /** A mini ball that flies from a screen point to a tray slot. */
  flyer(id, from, toEl, colorVar, stripe) {
    if (!this.host || !toEl || !toEl.getBoundingClientRect) return;
    const to = toEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'flyer' + (stripe ? ' stripe' : '');
    el.style.setProperty('--c', colorVar);
    el.textContent = id;
    el.style.left = `${from.x - 11}px`; el.style.top = `${from.y - 11}px`;
    this.host.appendChild(el);
    const dx = to.left + to.width / 2 - from.x, dy = to.top + to.height / 2 - from.y;
    const arc = -Math.min(120, Math.hypot(dx, dy) * 0.3);
    const anim = el.animate([
      { transform: 'translate(0,0) scale(1.5)', opacity: 0.0 },
      { transform: 'translate(0,0) scale(1.6)', opacity: 1, offset: 0.12 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + arc}px) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.75)`, opacity: 1 },
    ], { duration: 780, easing: 'cubic-bezier(.3,.1,.3,1)', delay: 260 });
    anim.onfinish = () => { el.remove(); toEl.classList.add('pop'); setTimeout(() => toEl.classList.remove('pop'), 300); };
  }
}
