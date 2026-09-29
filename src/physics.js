// Pool physics. Pure, deterministic, DOM-free, SI units.
//
// Model (see docs/RESEARCH.md):
//  * A ball is a sphere with linear velocity (vx,vy) and angular velocity
//    (wx,wy,wz) on a flat slate. It slides while the cloth contact point slips,
//    then rolls; rolling resistance and side-spin decay slow it further.
//  * Ball-ball: normal impulse with restitution plus a frictional tangential
//    impulse from slip at the contact point (cut throw, spin throw, spin transfer).
//  * Cushions: frictional impact at the cushion nose height (0.635 D), so spin
//    and speed change the rebound the way they do on a real table.
//  * Pockets: capture circles behind the mouth; rounded jaw knuckles rattle balls.
// Integration is small adaptive steps with analytic friction per step and
// rewind-to-impact, so results depend only on the input state.

import { BALL_R, buildTable } from './table.js';

export const R = BALL_R;
export const MASS = 0.170097;
export const G = 9.81;
const INERTIA = 0.4 * MASS * R * R;

export const DEFAULTS = {
  muSlide: 0.2,          // ball on cloth
  muRoll: 0.011,         // rolling resistance
  spinDecay: 11,         // rad/s^2, vertical spin
  eBall: 0.93,           // ball-ball restitution
  eCushion0: 0.93,       // cushion restitution at low speed
  eCushionSlope: 0.05,   // loss per m/s of normal speed
  muCushion: 0.16,       // ball on cushion rubber
  noseH: 0.635 * 2,      // contact height above the bed, in ball radii
  lowSpeedRoll: 0.12,    // below this speed the nap drags harder (balls "die" sooner)
  lowSpeedBoost: 2.2,
  squirt: 0.045,         // rad of cue-ball deflection per unit of tip offset (in radii)
  maxSpeed: 9.5,
  eTable: 0.5,           // restitution when a jumped ball lands on the slate
};

const SIN_TH = 0.635 * 2 - 1;                    // (h - R)/R with h = 1.27 R
const COS_TH = Math.sqrt(1 - SIN_TH * SIN_TH);

export function makeBall(id, x, y) {
  return { id, x, y, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, pocketed: false, pocket: -1, q: [1, 0, 0, 0] };
}

export class Sim {
  constructor(opts = {}) {
    this.params = { ...DEFAULTS, ...(opts.params || {}) };
    this.table = opts.table || buildTable(opts.pocketScale);
    this.balls = [];
    this.time = 0;
    this.events = [];
    this.trackOrient = !!opts.trackOrient;
    this.cueId = 0;
  }

  addBall(id, x, y) {
    const b = makeBall(id, x, y);
    this.balls.push(b);
    return b;
  }

  ball(id) { return this.balls.find(b => b.id === id); }

  clone() {
    const s = new Sim({ params: this.params, table: this.table, trackOrient: false });
    s.balls = this.balls.map(b => ({ ...b, q: b.q.slice() }));
    s.time = this.time;
    return s;
  }

  // ---- cue strike --------------------------------------------------------
  /**
   * angle: radians (0 = +x, CCW). speed: m/s. a: sideways tip offset, b: vertical,
   * both in ball radii, |(a,b)| <= 0.5. jump: cue elevation in radians (0 = flat);
   * the stroke speed splits into horizontal and vertical parts and the ball leaves
   * the slate. Returns the effective launch angle.
   */
  strike(id, angle, speed, a = 0, b = 0, jump = 0, masse = 0) {
    const ball = this.ball(id);
    const p = this.params;
    const total = Math.min(speed, p.maxSpeed);
    // A massé is a steep cue that hits down and off centre, so the ball stays on the slate. The
    // stroke splits into a forward part (cos e) and a downward part the slate absorbs.
    const v = total * Math.cos(masse || jump);
    const eff = angle + p.squirt * a;         // hit right of center, squirt to the left
    const dx = Math.cos(eff), dy = Math.sin(eff);
    ball.vx = dx * v; ball.vy = dy * v;
    ball.vz = masse ? 0 : total * Math.sin(jump);
    if (ball.vz > 0) ball.z = 1e-9;
    const k = 2.5 * total / R;                // angular speed per unit of tip offset, from the full stroke impulse
    // Tip offset (a to the right, b up) about a cue raised by e gives, in the frame of the shot:
    //   spin about the direction of travel  a * sin e   <- the massé spin: cloth friction bends the path
    //   spin about the vertical             a * cos e   <- ordinary side spin
    //   spin about the horizontal normal    b           <- top/back spin
    const e = masse || 0, sinE = Math.sin(e), cosE = Math.cos(e);
    ball.wz = k * a * cosE;
    const along = k * a * sinE;               // component along the shot direction
    ball.wx = along * dx + k * b * -dy;       // b = 0.4 gives instant rolling
    ball.wy = along * dy + k * b * dx;
    this.events.push({ t: this.time, type: 'cue', id, speed: v });
    return eff;
  }

  // ---- stepping ----------------------------------------------------------
  isMoving() {
    for (const b of this.balls) {
      if (b.pocketed) continue;
      if (b.vx * b.vx + b.vy * b.vy > 4e-6) return true;
      if (b.z > 0 || b.vz > 0) return true;
      const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
      if (ux * ux + uy * uy > 4e-6) return true;
    }
    return false;
  }

  maxSpeed() {
    let m = 0;
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const s = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (s > m) m = s;
    }
    return Math.sqrt(m);
  }

  /** Advance until sim time reaches `target` (may overshoot by one step). */
  advance(target) {
    let guard = 0;
    while (this.time < target && guard++ < 200000) {
      this.step(this.nextDt());
    }
  }

  /** Run until every ball is at rest or `limit` seconds pass. Returns elapsed. */
  runToRest(limit = 40) {
    const t0 = this.time;
    while (this.isMoving() && this.time - t0 < limit) this.step(this.nextDt());
    if (!this.isMoving()) this.settle();
    return this.time - t0;
  }

  nextDt() {
    const v = this.maxSpeed();
    // keep travel per step under a fifth of a radius when fast
    return Math.min(0.002, Math.max(0.00012, 0.2 * R / (v + 1e-6)));
  }

  settle() {
    for (const b of this.balls) {
      if (b.pocketed) continue;
      b.vx = b.vy = 0; b.wx = b.wy = b.wz = 0;
    }
  }

  step(dt) {
    const balls = this.balls;

    for (const b of balls) if (!b.pocketed) this.integrate(b, dt);

    // a few passes so a racked cluster resolves in one step
    for (let pass = 0; pass < 3; pass++) {
      let hit = false;
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.pocketed) continue;
        hit = this.hitWalls(a, dt) || hit;
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j];
          if (c.pocketed) continue;
          const dx = c.x - a.x;
          if (dx > 2 * R || dx < -2 * R) continue;
          const dy = c.y - a.y;
          let d2max = 4 * R * R;
          if (a.z > 0 || c.z > 0) {
            // a ball in the air is a sphere at a different height: contact happens at a shorter planar distance
            const dz = c.z - a.z;
            if (Math.abs(dz) >= 2 * R) continue;
            d2max = 4 * R * R - dz * dz;
          }
          if (dx * dx + dy * dy < d2max) hit = this.hitBall(a, c, dt, d2max) || hit;
        }
      }
      if (!hit) break;
    }

    // pockets
    for (const b of balls) {
      if (b.pocketed) continue;
      const pk = this.table.pockets;
      for (let k = 0; k < pk.length; k++) {
        const dx = b.x - pk[k].x, dy = b.y - pk[k].y;
        if (b.z < 0.6 * R && dx * dx + dy * dy < pk[k].r * pk[k].r) {
          b.pocketed = true; b.pocket = k;
          this.events.push({ t: this.time, type: 'pocket', id: b.id, pocket: k, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
          break;
        }
      }
    }

    if (this.trackOrient) for (const b of balls) if (!b.pocketed) this.spin(b, dt);
    this.time += dt;
  }

  spin(b, dt) {
    const w = Math.hypot(b.wx, b.wy, b.wz);
    if (w < 1e-6) return;
    const ang = w * dt * 0.5, s = Math.sin(ang) / w, c = Math.cos(ang);
    const [q0, q1, q2, q3] = b.q;
    const dx = b.wx * s, dy = b.wy * s, dz = b.wz * s;
    // q = dq * q (rotation about a world-frame axis)
    let n0 = c * q0 - dx * q1 - dy * q2 - dz * q3;
    let n1 = c * q1 + dx * q0 + dy * q3 - dz * q2;
    let n2 = c * q2 - dx * q3 + dy * q0 + dz * q1;
    let n3 = c * q3 + dx * q2 - dy * q1 + dz * q0;
    const inv = 1 / Math.hypot(n0, n1, n2, n3);
    b.q[0] = n0 * inv; b.q[1] = n1 * inv; b.q[2] = n2 * inv; b.q[3] = n3 * inv;
  }

  // Friction phases for one ball over dt (analytic within the step).
  fly(b, dt) {
    const p = this.params;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.z += b.vz * dt - 0.5 * G * dt * dt;
    b.vz -= G * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -0.35) {
        const sp = -b.vz;
        b.vz = sp * p.eTable;
        this.events.push({ t: this.time, type: 'land', id: b.id, speed: sp, x: b.x, y: b.y });
      } else b.vz = 0;
    }
    if (b.wz !== 0) {
      const dw = p.spinDecay * dt;
      b.wz = Math.abs(b.wz) <= dw ? 0 : b.wz - Math.sign(b.wz) * dw;
    }
  }

  integrate(b, dt) {
    if (b.z > 0 || b.vz > 0) { this.fly(b, dt); return; }
    const p = this.params;
    let t = dt;
    let ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
    let us = Math.hypot(ux, uy);
    if (us > 1e-5) {
      // sliding until the contact point stops slipping
      const decel = 3.5 * p.muSlide * G;
      const ts = Math.min(t, us / decel);
      const nx = ux / us, ny = uy / us;
      const ax = -p.muSlide * G * nx, ay = -p.muSlide * G * ny;
      b.x += b.vx * ts + 0.5 * ax * ts * ts;
      b.y += b.vy * ts + 0.5 * ay * ts * ts;
      b.vx += ax * ts; b.vy += ay * ts;
      const k = 2.5 * p.muSlide * G / R * ts;
      b.wx -= k * ny; b.wy += k * nx;
      t -= ts;
      if (t > 0) { // slip ended: snap to exact rolling
        b.wy = b.vx / R; b.wx = -b.vy / R;
      }
    }
    if (t > 0) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 0) {
        let a = p.muRoll * G;
        if (v < p.lowSpeedRoll) a *= 1 + (p.lowSpeedBoost - 1) * (1 - v / p.lowSpeedRoll);
        if (v <= a * t) {
          const d = v * v / (2 * a);
          b.x += b.vx / v * d; b.y += b.vy / v * d;
          b.vx = b.vy = 0; b.wx = b.wy = 0;
        } else {
          const nv = v - a * t;
          const d = (v + nv) * 0.5 * t;
          b.x += b.vx / v * d; b.y += b.vy / v * d;
          b.vx *= nv / v; b.vy *= nv / v;
          b.wy = b.vx / R; b.wx = -b.vy / R;
        }
      }
    }
    if (b.wz !== 0) {
      const dw = p.spinDecay * dt;
      b.wz = Math.abs(b.wz) <= dw ? 0 : b.wz - Math.sign(b.wz) * dw;
    }
  }

  // ---- ball vs ball ------------------------------------------------------
  hitBall(a, c, dt, D2 = 4 * R * R) {
    let dx = c.x - a.x, dy = c.y - a.y;
    const d2 = dx * dx + dy * dy;
    const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
    // rewind to the moment of first contact
    const vv = rvx * rvx + rvy * rvy;
    let tau = 0;
    if (vv > 1e-12) {
      const pv = dx * rvx + dy * rvy;
      if (pv >= 0) return this.separate(a, c, D2); // already separating: only fix overlap
      const disc = pv * pv - vv * (d2 - D2);
      tau = (pv + Math.sqrt(Math.max(0, disc))) / vv; // time since contact
      if (tau > dt) tau = dt;
      if (tau < 0) tau = 0;
    } else {
      return this.separate(a, c, D2);
    }
    a.x -= a.vx * tau; a.y -= a.vy * tau;
    c.x -= c.vx * tau; c.y -= c.vy * tau;
    dx = c.x - a.x; dy = c.y - a.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d, tx = -ny;
    const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
    if (vn < 0) {
      const p = this.params;
      const jn = (1 + p.eBall) * MASS * 0.5 * -vn;
      // tangential slip at the contact point: relative sliding plus vertical spin
      const vt = (c.vx - a.vx) * tx + (c.vy - a.vy) * nx;
      const s = vt - R * (a.wz + c.wz);
      const mu = 0.009951 + 0.108 * Math.exp(-1.088 * Math.abs(s));
      const stick = Math.abs(s) * MASS / 7;
      const jt = -Math.sign(s) * Math.min(stick, mu * jn);
      const ix = (jn * nx + jt * tx) / MASS, iy = (jn * ny + jt * nx) / MASS;
      a.vx -= ix; a.vy -= iy;
      c.vx += ix; c.vy += iy;
      const dw = -R * jt / INERTIA;
      a.wz += dw; c.wz += dw;
      this.events.push({ t: this.time, type: 'ball', a: a.id, b: c.id, speed: -vn, x: a.x + nx * R, y: a.y + ny * R });
    }
    a.x += a.vx * tau; a.y += a.vy * tau;
    c.x += c.vx * tau; c.y += c.vy * tau;
    return this.separate(a, c, D2) || true;
  }

  separate(a, c, D2 = 4 * R * R) {
    const dx = c.x - a.x, dy = c.y - a.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= D2) return false;
    const d = Math.sqrt(d2) || 1e-9;
    const push = (Math.sqrt(D2) - d) * 0.5 + 1e-9;
    const nx = dx / d, ny = dy / d;
    a.x -= nx * push; a.y -= ny * push;
    c.x += nx * push; c.y += ny * push;
    return false;
  }

  // ---- ball vs cushion / knuckle -----------------------------------------
  hitWalls(b, dt) {
    let any = false;
    const t = this.table;
    for (let i = 0; i < t.walls.length; i++) {
      const w = t.walls[i];
      // distance in front of the wall plane
      const rx = b.x - w.ax, ry = b.y - w.ay;
      const dist = rx * w.nx + ry * w.ny;
      if (dist >= R || dist < -R) continue;
      // along-wall extent
      const ex = w.bx - w.ax, ey = w.by - w.ay;
      const len = Math.hypot(ex, ey);
      const along = (rx * ex + ry * ey) / len;
      if (along < 0 || along > len) continue;
      const vn = b.vx * w.nx + b.vy * w.ny;
      if (vn < 0) {
        const tau = Math.min(dt, (R - dist) / -vn);
        b.x -= b.vx * tau; b.y -= b.vy * tau;
        this.cushionImpact(b, w.nx, w.ny, i);
        b.x += b.vx * tau; b.y += b.vy * tau;
        any = true;
      }
      const d2 = (b.x - w.ax) * w.nx + (b.y - w.ay) * w.ny;
      if (d2 < R) { b.x += (R - d2) * w.nx; b.y += (R - d2) * w.ny; }
    }
    for (let i = 0; i < t.knuckles.length; i++) {
      const k = t.knuckles[i];
      const dx = b.x - k.x, dy = b.y - k.y;
      const reach = R + k.r;
      if (dx * dx + dy * dy >= reach * reach) continue;
      const d = Math.hypot(dx, dy) || 1e-9;
      const nx = dx / d, ny = dy / d;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const tau = Math.min(dt, (reach - d) / -vn);
        b.x -= b.vx * tau; b.y -= b.vy * tau;
        const ddx = b.x - k.x, ddy = b.y - k.y, dd = Math.hypot(ddx, ddy) || 1e-9;
        this.cushionImpact(b, ddx / dd, ddy / dd, 100 + i);
        b.x += b.vx * tau; b.y += b.vy * tau;
        any = true;
      }
      const d3 = Math.hypot(b.x - k.x, b.y - k.y) || 1e-9;
      if (d3 < reach) { b.x = k.x + (b.x - k.x) / d3 * reach; b.y = k.y + (b.y - k.y) / d3 * reach; }
    }
    return any;
  }

  // Frictional impact at the nose. n = unit horizontal normal pointing into the table.
  cushionImpact(b, nx, ny, wallId) {
    const p = this.params;
    // contact vector from ball center to the nose (toward the wall, above center)
    const cx = -nx * COS_TH * R, cy = -ny * COS_TH * R, cz = SIN_TH * R;
    // surface velocity at the contact point: v + w x c
    const vcx = b.vx + (b.wy * cz - b.wz * cy);
    const vcy = b.vy + (b.wz * cx - b.wx * cz);
    const vcz = b.wx * cy - b.wy * cx;
    // unit force direction: into the table and pressed onto the slate
    const Nx = nx * COS_TH, Ny = ny * COS_TH, Nz = -SIN_TH;
    const vN = vcx * Nx + vcy * Ny + vcz * Nz;
    if (vN >= 0) return;
    const speed = -vN;
    const e = Math.max(0.55, p.eCushion0 - p.eCushionSlope * speed);
    const Pn = (1 + e) * MASS * speed;
    // tangential slip at the contact
    let tx = vcx - vN * Nx, ty = vcy - vN * Ny, tz = vcz - vN * Nz;
    const s = Math.hypot(tx, ty, tz);
    let Px = Pn * Nx, Py = Pn * Ny, Pz = Pn * Nz;
    if (s > 1e-9) {
      const Pt = Math.min(p.muCushion * Pn, s * MASS / 3.5);
      Px -= Pt * tx / s; Py -= Pt * ty / s; Pz -= Pt * tz / s;
    }
    b.vx += Px / MASS; b.vy += Py / MASS; // vertical component is absorbed by the slate
    b.wx += (cy * Pz - cz * Py) / INERTIA;
    b.wy += (cz * Px - cx * Pz) / INERTIA;
    b.wz += (cx * Py - cy * Px) / INERTIA;
    this.events.push({ t: this.time, type: 'rail', id: b.id, wall: wallId, speed, x: b.x, y: b.y });
  }
}
