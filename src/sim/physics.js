// Deterministic fixed-step pool physics. Pure, DOM-free; runs in Node.
//
// Model (literature-based, see DESIGN.md 6.1):
//  * A ball is a sphere with linear velocity (vx,vy) and angular velocity
//    (wx,wy,wz) on a flat slate. It slides while the cloth contact point slips
//    (slide time (2/7)|u0|/(mu*g)), then rolls; rolling resistance and
//    vertical-spin decay slow it further.
//  * Ball-ball: normal impulse with restitution plus a frictional tangential
//    impulse from slip at the contact point (cut throw, spin throw, spin
//    transfer, Alciatore/Mathavan form).
//  * Cushions: frictional impact at the cushion nose height (0.635 diameters),
//    so spin and speed change the rebound the way they do on a real table.
//  * Pockets: capture circles behind the mouth; rounded jaw knuckles rattle.
// Integration is fixed 1/240 s steps with analytic friction inside each step,
// internal substepping when fast, and rewind-to-impact for ball-ball and
// cushion contacts, so results depend only on the input state.
// CONTRACT (locked, do not rename):
//   STEP = 1/240
//   class Sim:
//     constructor({ params?, pocketScale?, trackOrient? })
//     addBall(id, x, y) -> ball {id,x,y,z,vx,vy,vz,wx,wy,wz,pocketed,pocket,q:[w,x,y,z]}
//     ball(id), cueBall() (id 0)
//     strike({ angle, speed, spin })  spin={x,y} tip offsets in radii (x side, y vert)
//     step(h=STEP) -> events [{type:'contact',a,b,speed}|{type:'cushion',ball,speed}|
//                             {type:'pocket',ball,pocket}]
//     rest() -> bool
//     clone() -> Sim (deep, independent)
//     snapshot() -> plain-data copy of ball states
//     loadSnapshot(snap)
//   runToRest(sim, maxSeconds?) -> { events, seconds }
// Constants: muSlide 0.2, muRoll 0.011, spinDecay 11, eBall 0.93,
// eCushion 0.93 - 0.05*vNormal, muCushion 0.16, nose height 0.635*diameter,
// squirt 0.045 rad per unit tip offset, maxSpeed 9.5 (DESIGN.md 6.1).
//
// NOTE: sim.balls is the canonical LIVE array of ball objects. addBall pushes
// into it; the integration layer may mutate it directly (e.g. clear the rack
// with sim.balls.length = 0); renderers read it every frame. clone() gives the
// clone its own deep-copied array.

import { BALL_R, buildTable } from './table.js';

export const STEP = 1 / 240;

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

// Rest thresholds: rest() is true when every ball's linear speed, contact
// slip and vertical spin are all under these.
const REST_V2 = 4e-6;      // speed < 0.002 m/s
const REST_WZ = 0.02;      // |wz| < 0.02 rad/s
const LAND_VZ = 0.35;      // land softly below this vertical speed

const SIN_TH = 0.635 * 2 - 1;                 // (h - R)/R with h = 1.27 R
const COS_TH = Math.sqrt(1 - SIN_TH * SIN_TH);

function makeBall(id, x, y) {
  return {
    id, x, y, z: 0, vx: 0, vy: 0, vz: 0,
    wx: 0, wy: 0, wz: 0, pocketed: false, pocket: -1,
    q: [1, 0, 0, 0],   // orientation quaternion [w,x,y,z], for renderers
  };
}

function copyBall(b) {
  return { ...b, q: b.q.slice() };
}

export class Sim {
  constructor(opts = {}) {
    this.params = { ...DEFAULTS, ...(opts.params || {}) };
    this.table = opts.table || buildTable(opts.pocketScale);
    this.balls = [];           // live ball store (see contract note above)
    this.time = 0;
    this.trackOrient = opts.trackOrient !== false;
    this._ev = [];             // events collected by the current step()
  }

  addBall(id, x, y) {
    const b = makeBall(id, x, y);
    this.balls.push(b);
    return b;
  }

  ball(id) { return this.balls.find((b) => b.id === id); }
  cueBall() { return this.ball(0); }

  clone() {
    const s = new Sim({ params: this.params, table: this.table, trackOrient: this.trackOrient });
    s.balls = this.balls.map(copyBall);
    s.time = this.time;
    return s;
  }

  /** Plain-data deep copy of the ball states (JSON-safe). */
  snapshot() {
    return { balls: this.balls.map(copyBall), time: this.time };
  }

  /** Accepts snapshot() output; also accepts a bare ball array for convenience. */
  loadSnapshot(snap) {
    const balls = Array.isArray(snap) ? snap : snap.balls;
    this.balls = balls.map(copyBall);
    if (!Array.isArray(snap) && typeof snap.time === 'number') this.time = snap.time;
  }

  // ---- cue strike --------------------------------------------------------
  /**
   * angle: radians (0 = +x, CCW). speed: m/s, capped at maxSpeed.
   * spin: {x, y} tip offsets in ball radii; x = side (positive = right of
   *   center as seen by the shooter), y = vertical (positive = top spin).
   * Sets cue-ball velocity along the (squirted) angle and the angular
   * velocity from the tip offsets: wz = 2.5*x*speed/R, and the horizontal
   * spin axis is 2.5*y*speed/R about the axis perpendicular to travel, so
   * y = 0.4 is instant rolling. Squirt deflects the launch angle by
   * squirt*x, away from the offset side.
   */
  strike({ angle, speed, spin }) {
    const b = this.cueBall();
    if (!b) throw new Error('strike: no cue ball (id 0)');
    const p = this.params;
    const v = Math.min(Math.max(0, speed), p.maxSpeed);
    const sx = (spin && spin.x) || 0, sy = (spin && spin.y) || 0;
    const eff = angle + p.squirt * sx;   // side hit right -> ball squirts left
    const dx = Math.cos(eff), dy = Math.sin(eff);
    b.vx = dx * v; b.vy = dy * v;
    const k = 2.5 * v / R;               // angular speed per unit tip offset
    b.wz = k * sx;                       // side spin
    const axis = k * sy;                 // follow/draw about the horizontal
    b.wx = axis * -dy;                   // perpendicular to travel: y=0.4 rolls
    b.wy = axis * dx;
    return eff;
  }

  // ---- rest ---------------------------------------------------------------
  rest() {
    for (const b of this.balls) {
      if (b.pocketed) continue;
      if (b.vx * b.vx + b.vy * b.vy > REST_V2) return false;
      if (b.z > 0 || b.vz !== 0) return false;
      if (Math.abs(b.wz) > REST_WZ) return false;
      const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
      if (ux * ux + uy * uy > REST_V2) return false;
    }
    return true;
  }

  /** Zero velocities and spins of every ball still on the table. */
  settle() {
    for (const b of this.balls) {
      if (b.pocketed) continue;
      b.vx = b.vy = b.vz = 0;
      b.wx = b.wy = b.wz = 0;
    }
  }

  // ---- stepping ------------------------------------------------------------
  /**
   * Advance one fixed step (default STEP). Fast balls get deterministic
   * internal substeps so nothing tunnels. Returns the events produced
   * during the step, in time order.
   */
  step(h = STEP) {
    this._ev = [];
    // substep so no ball travels more than half a radius per substep
    let vmax = 0;
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const s = b.vx * b.vx + b.vy * b.vy;
      if (s > vmax) vmax = s;
    }
    vmax = Math.sqrt(vmax);
    const dtMax = Math.min(h, (0.5 * R) / (vmax + 1e-6));
    const n = Math.max(1, Math.ceil(h / dtMax));
    const dt = h / n;
    for (let i = 0; i < n; i++) this._substep(dt);
    this.time += h;
    const ev = this._ev;
    this._ev = [];
    return ev;
  }

  _substep(dt) {
    const balls = this.balls;
    for (const b of balls) if (!b.pocketed) this._integrate(b, dt);

    // a few passes so a racked cluster resolves inside one substep
    for (let pass = 0; pass < 3; pass++) {
      let hit = false;
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.pocketed) continue;
        hit = this._hitWalls(a, dt) || hit;
        for (let j = i + 1; j < balls.length; j++) {
          const c = balls[j];
          if (c.pocketed) continue;
          const dx = c.x - a.x;
          if (dx > 2 * R || dx < -2 * R) continue;
          const dy = c.y - a.y;
          let d2max = 4 * R * R;
          if (a.z > 0 || c.z > 0) {
            const dz = c.z - a.z;
            if (Math.abs(dz) >= 2 * R) continue;
            d2max = 4 * R * R - dz * dz;
          }
          if (dx * dx + dy * dy < d2max) hit = this._hitBall(a, c, dt, d2max) || hit;
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
          b.vx = b.vy = b.vz = 0; b.wx = b.wy = b.wz = 0;
          this._ev.push({ type: 'pocket', ball: b.id, pocket: k });
          break;
        }
      }
    }

    if (this.trackOrient) for (const b of balls) if (!b.pocketed) this._spinOrient(b, dt);
  }

  /** Integrate the orientation quaternion from angular velocity (world frame). */
  _spinOrient(b, dt) {
    const w = Math.hypot(b.wx, b.wy, b.wz);
    if (w < 1e-6) return;
    const ang = w * dt * 0.5, s = Math.sin(ang) / w, c = Math.cos(ang);
    const [q0, q1, q2, q3] = b.q;
    const dx = b.wx * s, dy = b.wy * s, dz = b.wz * s;
    let n0 = c * q0 - dx * q1 - dy * q2 - dz * q3;
    let n1 = c * q1 + dx * q0 + dy * q3 - dz * q2;
    let n2 = c * q2 - dx * q3 + dy * q0 + dz * q1;
    let n3 = c * q3 + dx * q2 - dy * q1 + dz * q0;
    const inv = 1 / Math.hypot(n0, n1, n2, n3);
    b.q[0] = n0 * inv; b.q[1] = n1 * inv; b.q[2] = n2 * inv; b.q[3] = n3 * inv;
  }

  // Ballistic flight for jumped balls (flat cue leaves these at zero).
  _fly(b, dt) {
    const p = this.params;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.z += b.vz * dt - 0.5 * G * dt * dt;
    b.vz -= G * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -LAND_VZ) b.vz = -b.vz * p.eTable;
      else b.vz = 0;
    }
    this._decayWz(b, dt);
  }

  _decayWz(b, dt) {
    if (b.wz === 0) return;
    const dw = this.params.spinDecay * dt;
    b.wz = Math.abs(b.wz) <= dw ? 0 : b.wz - Math.sign(b.wz) * dw;
  }

  // Friction phases for one ball over dt, analytic within the substep.
  _integrate(b, dt) {
    if (b.z > 0 || b.vz > 0) { this._fly(b, dt); return; }
    const p = this.params;
    let t = dt;
    const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
    const us = Math.hypot(ux, uy);
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
      if (t > 0) { b.wy = b.vx / R; b.wx = -b.vy / R; }  // snap to exact rolling
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
    this._decayWz(b, dt);
  }

  // ---- ball vs ball --------------------------------------------------------
  _hitBall(a, c, dt, D2 = 4 * R * R) {
    let dx = c.x - a.x, dy = c.y - a.y;
    const d2 = dx * dx + dy * dy;
    const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
    // rewind to the moment of first contact
    const vv = rvx * rvx + rvy * rvy;
    let tau = 0;
    if (vv > 1e-12) {
      const pv = dx * rvx + dy * rvy;
      if (pv >= 0) return this._separate(a, c, D2);   // separating: only fix overlap
      const disc = pv * pv - vv * (d2 - D2);
      tau = (pv + Math.sqrt(Math.max(0, disc))) / vv; // time since contact
      if (tau > dt) tau = dt;
      if (tau < 0) tau = 0;
    } else {
      return this._separate(a, c, D2);
    }
    a.x -= a.vx * tau; a.y -= a.vy * tau;
    c.x -= c.vx * tau; c.y -= c.vy * tau;
    dx = c.x - a.x; dy = c.y - a.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d, tx = -ny, ty = nx;
    const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
    if (vn < 0) {
      const p = this.params;
      const jn = (1 + p.eBall) * MASS * 0.5 * -vn;
      // tangential slip at the contact point: relative sliding plus vertical spin
      const vt = (c.vx - a.vx) * tx + (c.vy - a.vy) * ty;
      const s = vt - R * (a.wz + c.wz);
      const mu = 0.009951 + 0.108 * Math.exp(-1.088 * Math.abs(s));
      const stick = Math.abs(s) * MASS / 7;
      const jt = -Math.sign(s) * Math.min(stick, mu * jn);
      const ix = (jn * nx + jt * tx) / MASS, iy = (jn * ny + jt * ty) / MASS;
      a.vx -= ix; a.vy -= iy;
      c.vx += ix; c.vy += iy;
      const dw = -R * jt / INERTIA;    // spin transfer
      a.wz += dw; c.wz += dw;
      this._ev.push({ type: 'contact', a: a.id, b: c.id, speed: -vn });
    }
    a.x += a.vx * tau; a.y += a.vy * tau;
    c.x += c.vx * tau; c.y += c.vy * tau;
    return this._separate(a, c, D2) || true;
  }

  _separate(a, c, D2 = 4 * R * R) {
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

  // ---- ball vs cushion / knuckle -------------------------------------------
  _hitWalls(b, dt) {
    let any = false;
    const t = this.table;
    for (let i = 0; i < t.walls.length; i++) {
      const w = t.walls[i];
      const rx = b.x - w.ax, ry = b.y - w.ay;
      const dist = rx * w.nx + ry * w.ny;         // distance in front of the wall plane
      if (dist >= R || dist < -R) continue;
      const ex = w.bx - w.ax, ey = w.by - w.ay;
      const len = Math.hypot(ex, ey);
      const along = (rx * ex + ry * ey) / len;
      if (along < 0 || along > len) continue;
      const vn = b.vx * w.nx + b.vy * w.ny;
      if (vn < 0) {
        const tau = Math.min(dt, (R - dist) / -vn);
        b.x -= b.vx * tau; b.y -= b.vy * tau;
        this._cushionImpact(b, w.nx, w.ny);
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
        this._cushionImpact(b, ddx / dd, ddy / dd);
        b.x += b.vx * tau; b.y += b.vy * tau;
        any = true;
      }
      const d3 = Math.hypot(b.x - k.x, b.y - k.y) || 1e-9;
      if (d3 < reach) { b.x = k.x + (b.x - k.x) / d3 * reach; b.y = k.y + (b.y - k.y) / d3 * reach; }
    }
    return any;
  }

  // Frictional impact at the nose. n = unit horizontal normal pointing into the table.
  _cushionImpact(b, nx, ny) {
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
    const tx = vcx - vN * Nx, ty = vcy - vN * Ny, tz = vcz - vN * Nz;
    const s = Math.hypot(tx, ty, tz);
    let Px = Pn * Nx, Py = Pn * Ny, Pz = Pn * Nz;
    if (s > 1e-9) {
      const Pt = Math.min(p.muCushion * Pn, s * MASS / 3.5);
      Px -= Pt * tx / s; Py -= Pt * ty / s; Pz -= Pt * tz / s;
    }
    b.vx += Px / MASS; b.vy += Py / MASS;   // vertical component is absorbed by the slate
    b.wx += (cy * Pz - cz * Py) / INERTIA;
    b.wy += (cz * Px - cx * Pz) / INERTIA;
    b.wz += (cx * Py - cy * Px) / INERTIA;
    this._ev.push({ type: 'cushion', ball: b.id, speed });
  }
}

/**
 * Step sim until rest or maxSeconds. Returns { events, seconds }.
 * events is the chronological union of every step's events.
 */
export function runToRest(sim, maxSeconds = 40) {
  const events = [];
  const t0 = sim.time;
  let guard = 0;
  const maxSteps = Math.ceil(maxSeconds / STEP) + 1;
  while (!sim.rest() && guard < maxSteps) {
    events.push(...sim.step(STEP));
    guard++;
  }
  sim.settle();
  return { events, seconds: sim.time - t0 };
}
