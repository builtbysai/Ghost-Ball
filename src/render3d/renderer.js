// 3D renderer (three.js, pinned CDN, dynamic import). Same frame contract
// as Render2D.draw; the HUD stays DOM/screen-space and never lives here
// (DESIGN.md 6.3, 6.4). Table coordinates map to three.js as
// (x, up, -y): a proper rotation, so sim orientation quaternions transfer
// through the matching basis change and balls roll honestly.
// CONTRACT (locked):
//   class Render3D { static async create(container);
//     setHall(hall); resize(cssW, cssH, dpr); draw(frame);
//     setCameraPreset('elevated'|'overhead');
//     canvas; view() -> { scale, portrait, toTable(x, y) } }
// toTable/view mirror the Render2D contract: canvas-relative CSS px in.
import { BALL_R, TABLE_L, TABLE_W, HALF_L, HALF_W, HEAD_X, buildTable } from '../sim/table.js';
import { ballColors } from '../render2d/balls.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let THREE = null;

const R = BALL_R;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Equirect ball texture: base, stripe band for 9-15, two number discs. */
function ballTexture(id) {
  const { base, stripe, label } = ballColors(id);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = stripe || id === 0 ? '#f7f3e8' : base;
  g.fillRect(0, 0, 256, 128);
  if (stripe) { g.fillStyle = base; g.fillRect(0, 46, 256, 36); }
  const disc = (u, y) => {
    const x = u * 256;
    if (label) {
      g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2);
      g.fillStyle = '#f8f5ec'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
      g.fillStyle = '#1d1a16';
      g.font = `700 ${label.length > 1 ? 13 : 15}px Barlow, Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, y + 1);
    } else if (id === 0) {
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fillStyle = '#b3402e'; g.fill();
    }
  };
  // Two latitudes so a disc reads from the elevated camera at rack rest;
  // the sim quaternion rolls them honestly once the ball moves.
  disc(0.25, 32); disc(0.75, 32); disc(0.25, 96); disc(0.75, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Render3D {
  static async create(container) {
    if (!THREE) THREE = await import(/* @vite-ignore */THREE_URL);
    const r = new Render3D(container);
    r._init();
    return r;
  }

  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.hall = null;
    this.cssW = 300; this.cssH = 150; this.dpr = 1;
    this._scale = 300;
    this._pockets = buildTable(1.06).pockets;
    this._preset = 'elevated';
    this._cam = { az: 0, el: 1.08, dist: 2.75 };        // current (eased)
    this._camGoal = { ...this._cam };
    this._orbited = false;
    this._shotLive = false;
    this._lastT = 0;
  }

  _home() {
    const portrait = this.cssH > this.cssW;
    const az = portrait ? Math.PI / 2 : 0;
    const el = this._preset === 'overhead' ? 1.47 : 1.08;
    const fallback = this._preset === 'overhead'
      ? (portrait ? 3.6 : 3.05)
      : (portrait ? 3.55 : 2.75);
    return { az, el, dist: this.camera ? this._fitDist(az, el, fallback) : fallback };
  }

  /**
   * Smallest camera distance at which the whole table (rails included)
   * projects inside the frame at the home azimuth/elevation. Fixed
   * distances cropped the rails and foot pockets on portrait phones:
   * at 390x844 the old 3.55m left ~20% of the table outside the frustum.
   * Scans outward in 0.05m steps; cheap and runs on resize only.
   */
  _fitDist(az, el, fallback) {
    const T = THREE;
    if (!T || !this.camera) return fallback;
    const cam = this.camera;
    const hx = HALF_L + 0.17, hz = HALF_W + 0.17;
    const corners = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      corners.push(new T.Vector3(sx * hx, 0, sz * hz));
      corners.push(new T.Vector3(sx * hx, 0.09, sz * hz));
    }
    const v = new T.Vector3();
    for (let dist = 1.8; dist <= 7.0; dist += 0.05) {
      cam.position.set(
        Math.sin(az) * Math.cos(el) * dist,
        Math.sin(el) * dist,
        Math.cos(az) * Math.cos(el) * dist);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      let fits = true;
      for (const c of corners) {
        v.copy(c).project(cam);
        if (Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.96 || v.z > 1) { fits = false; break; }
      }
      if (fits) return dist;
    }
    return 7.0;
  }

  _init() {
    const T = THREE;
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, this.dpr));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.style.touchAction = 'none';
    this.canvas.style.display = 'block';
    this.container.appendChild(this.canvas);

    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(38, 1, 0.05, 30);
    this.raycaster = new T.Raycaster();
    // Basis change table->three: table x -> three x, table y -> three -z,
    // table z(up) -> three +y. Ball quaternion maps q' = B q B^-1.
    this._qBasis = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(
        new T.Vector3(1, 0, 0), new T.Vector3(0, 0, -1), new T.Vector3(0, 1, 0)));
    this._qBasisInv = this._qBasis.clone().invert();
    this._qTmp = new T.Quaternion();

    const hemi = new T.HemisphereLight(0xfff3e0, 0x191007, 0.85);
    this.scene.add(hemi);
    const key = new T.DirectionalLight(0xffe7c4, 2.2);
    key.position.set(0.9, 1.7, 0.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.7; key.shadow.camera.right = 1.7;
    key.shadow.camera.top = 1.2; key.shadow.camera.bottom = -1.2;
    key.shadow.camera.far = 4;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 3;
    this.scene.add(key);
    this._lampLight = new T.PointLight(0xffb347, 5, 4.5, 1.8);
    this._lampLight.position.set(0, 1.02, 0);
    this.scene.add(this._lampLight);

    this._buildRoom();
    this._buildTable();
    this._buildBalls();
    this._buildGuide();
    this._buildCue();
    this._bindOrbit();
    this.resize(this.cssW, this.cssH, this.dpr);
    this._cam = this._home(); this._camGoal = { ...this._cam };
  }

  _mat(params) { return new THREE.MeshStandardMaterial(params); }

  _buildRoom() {
    const T = THREE;
    this._floorMat = this._mat({ color: 0x241a12, roughness: 1 });
    const floor = new T.Mesh(new T.PlaneGeometry(14, 14), this._floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const shade = new T.Mesh(
      new T.ConeGeometry(0.24, 0.18, 40, 1, true),
      this._mat({ color: 0x1f150e, roughness: 0.6, metalness: 0.25, side: T.DoubleSide }));
    shade.position.y = 1.95;
    const bulb = new T.Mesh(new T.CircleGeometry(0.21, 40),
      new T.MeshBasicMaterial({ color: 0xffd9a0 }));
    bulb.rotation.x = Math.PI / 2;
    bulb.position.y = 1.875;
    const cord = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.7),
      this._mat({ color: 0x0d0906, roughness: 1 }));
    cord.position.y = 2.38;
    // From the overhead camera the shade would sit between camera and
    // cloth; the lamp group hides whenever the camera rides high.
    this._lampGroup = new T.Group();
    this._lampGroup.add(shade, bulb, cord);
    this.scene.add(this._lampGroup);
  }

  _buildTable() {
    const T = THREE;
    const g = new T.Group();
    this.scene.add(g);
    this._feltMat = this._mat({ color: 0x4d7c55, roughness: 0.96 });
    this._rubberMat = this._mat({ color: 0x3b6444, roughness: 0.92 });
    this._woodMat = this._mat({ color: 0x3a2417, roughness: 0.55 });
    this._brassMat = this._mat({ color: 0xc9963c, roughness: 0.35, metalness: 0.8 });
    const darkMat = this._mat({ color: 0x0a0705, roughness: 1 });

    const cloth = new T.Mesh(new T.BoxGeometry(TABLE_L + 0.12, 0.024, TABLE_W + 0.12), this._feltMat);
    cloth.position.y = -0.012;
    cloth.receiveShadow = true;
    g.add(cloth);
    const apron = new T.Mesh(new T.BoxGeometry(TABLE_L + 0.34, 0.10, TABLE_W + 0.34), this._woodMat);
    apron.position.y = -0.075;
    apron.castShadow = true;
    g.add(apron);

    // Cushions: segments between the pocket mouths, top at nose height.
    const seg = (cx, cz, len, alongX) => {
      const m = new T.Mesh(new T.BoxGeometry(alongX ? len : 0.05, 0.034, alongX ? 0.05 : len), this._rubberMat);
      m.position.set(cx, 0.017, cz);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      const rail = new T.Mesh(new T.BoxGeometry(alongX ? len + 0.04 : 0.115, 0.036, alongX ? 0.115 : len + 0.04), this._woodMat);
      rail.position.set(
        cx + (alongX ? 0 : Math.sign(cx) * 0.082), 0.018,
        cz + (alongX ? Math.sign(cz) * 0.082 : 0));
      rail.castShadow = true; rail.receiveShadow = true;
      g.add(rail);
    };
    const gapC = 0.115, gapS = 0.085;   // pocket gaps at corners / sides
    for (const s of [-1, 1]) {
      seg(-(HALF_L / 2 + gapS / 2), s * (HALF_W + 0.025), HALF_L - gapC - gapS, true);
      seg((HALF_L / 2 + gapS / 2), s * (HALF_W + 0.025), HALF_L - gapC - gapS, true);
      seg(s * (HALF_L + 0.025), 0, TABLE_W - 2 * gapC, false);
    }
    for (const s of [-1, 1]) for (const fx of [-0.635, 0, 0.635]) {
      const d = new T.Mesh(new T.BoxGeometry(0.02, 0.005, 0.02), this._brassMat);
      d.position.set(fx, 0.038, s * (HALF_W + 0.107));
      d.rotation.y = Math.PI / 4;
      g.add(d);
    }
    for (const p of this._pockets) {
      const well = new T.Mesh(new T.CylinderGeometry(p.r * 0.96, p.r * 0.8, 0.055, 24), darkMat);
      well.position.set(p.mx, -0.026, -p.my);
      g.add(well);
      const rim = new T.Mesh(new T.TorusGeometry(p.r * 0.98, 0.0055, 10, 28), darkMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(p.mx, 0.002, -p.my);
      g.add(rim);
    }
  }

  _buildBalls() {
    const T = THREE;
    const geo = new T.SphereGeometry(R, 40, 28);
    this._balls = [];
    for (let id = 0; id <= 15; id++) {
      const m = new T.Mesh(geo, this._mat({ map: ballTexture(id), roughness: 0.24, metalness: 0.02 }));
      m.castShadow = true;
      m.visible = false;
      this.scene.add(m);
      this._balls[id] = m;
    }
  }

  _ribbon(color, opacity) {
    // Flat ribbon mesh lying on the cloth, rebuilt per frame from 2 points.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.renderOrder = 5;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _setRibbon(m, x1, y1, x2, y2, w1, w2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { m.visible = false; return; }
    const nx = -dy / len, ny = dx / len;
    const p = m.geometry.attributes.position.array;
    const Y = 0.0035;
    p[0] = x1 + nx * w1 / 2; p[1] = Y; p[2] = -(y1 + ny * w1 / 2);
    p[3] = x1 - nx * w1 / 2; p[4] = Y; p[5] = -(y1 - ny * w1 / 2);
    p[6] = x2 - nx * w2 / 2; p[7] = Y; p[8] = -(y2 - ny * w2 / 2);
    p[9] = x2 + nx * w2 / 2; p[10] = Y; p[11] = -(y2 + ny * w2 / 2);
    m.geometry.attributes.position.needsUpdate = true;
    m.visible = true;
  }

  _buildGuide() {
    const T = THREE;
    this._cueLine = this._ribbon(0xe8b95a, 0.95);
    this._objLine = this._ribbon(0xf2ead9, 0.75);
    this._afterLine = this._ribbon(0xe8b95a, 0.5);
    const ring = (inner, outer, color, opacity) => {
      const m = new T.Mesh(new T.RingGeometry(inner, outer, 40),
        new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.0035;
      m.renderOrder = 6;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this._ghostRing = ring(R * 0.9, R * 1.1, 0xe8b95a, 0.95);
    this._targetRing = ring(R * 1.5, R * 1.85, 0xe8b95a, 0.9);
    this._markRing = ring(R * 1.6, R * 1.95, 0xe8b95a, 0.9);
    this._wrongRing = ring(R * 1.15, R * 1.45, 0xd2553f, 0.95);
    this._placeRing = ring(R * 1.2, R * 1.5, 0xe8b95a, 0.9);
    this._placeBall = new T.Mesh(new T.SphereGeometry(R, 28, 20),
      new T.MeshBasicMaterial({ color: 0xf7f3e8, transparent: true, opacity: 0.45, depthWrite: false }));
    this._placeBall.visible = false;
    this.scene.add(this._placeBall);
    this._kitchenLine = this._ribbon(0xe8b95a, 0.4);
  }

  _buildCue() {
    const T = THREE;
    const grp = new T.Group();
    const shaftMat = this._mat({ color: 0xd9b98a, roughness: 0.5 });
    const buttMat = this._mat({ color: 0x2e2016, roughness: 0.45 });
    const mk = (rBall, rFar, len, mat, x) => {
      const m = new T.Mesh(new T.CylinderGeometry(rBall, rFar, len, 14), mat);
      m.rotation.z = -Math.PI / 2;   // cylinder axis -> x, top toward +x
      m.position.x = x;
      m.castShadow = true;
      grp.add(m);
    };
    // Built along -x: tip at x~0 (the cue ball sits at the group origin),
    // butt at x=-1.47. The group is yawed so +x points along the aim.
    mk(0.0058, 0.0068, 0.30, shaftMat, -0.162);
    mk(0.0068, 0.0095, 0.62, shaftMat, -0.622);
    mk(0.0095, 0.0135, 0.55, buttMat, -1.205);
    const tip = new T.Mesh(new T.CylinderGeometry(0.0058, 0.0058, 0.012, 12),
      this._mat({ color: 0x7a4a2e, roughness: 0.8 }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = -0.006;
    grp.add(tip);
    grp.visible = false;
    this.scene.add(grp);
    this._cue = grp;
  }

  _bedQuadContains(px, py) {
    // Projected bed corners (canvas CSS px); the bed always projects to
    // a convex quad from any above-table camera. Boundary counts inside.
    const c = [this.project(-HALF_L, -HALF_W), this.project(HALF_L, -HALF_W),
               this.project(HALF_L, HALF_W), this.project(-HALF_L, HALF_W)];
    if (c.some((p) => !p)) return false;
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      const cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
      if (Math.abs(cross) < 1e-9) continue;
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  _bindOrbit() {
    // Drags that start OFF the projected bed orbit the camera; drags on
    // the cloth belong to the stroke gestures bound on the wrap element
    // (bubble phase), so this capture listener wins and stops them
    // shooting. The projected-quad test (not the infinite cloth plane)
    // is what "off the table" means on screen at any camera angle.
    let drag = null;
    this.canvas.addEventListener('pointerdown', (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      const onBed = this._bedQuadContains(ev.clientX - rect.left, ev.clientY - rect.top);
      if (onBed) return;
      drag = { x: ev.clientX, y: ev.clientY, az: this._camGoal.az, el: this._camGoal.el };
      this._orbited = true;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
    window.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      this._camGoal.az = drag.az - (ev.clientX - drag.x) * 0.005;
      this._camGoal.el = clamp(drag.el + (ev.clientY - drag.y) * 0.004, 0.45, 1.52);
    });
    window.addEventListener('pointerup', () => { drag = null; });
    this.canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      this._camGoal.dist = clamp(this._camGoal.dist * (ev.deltaY > 0 ? 1.08 : 0.93), 1.9, 4.2);
      this._orbited = true;
    }, { passive: false });
  }

  setHall(hall) {
    this.hall = hall;
    if (!this.scene) return;
    this.scene.background = new THREE.Color(hall.wall);
    this.scene.fog = new THREE.Fog(hall.wall, 5.5, 11);
    this._feltMat.color.set(hall.felt.base);
    this._rubberMat.color.set(hall.felt.rubber);
    this._woodMat.color.set(hall.rail);
    this._floorMat.color.set(hall.wall);
    this._lampLight.color.set(hall.accent);
  }

  setCameraPreset(preset) {
    this._preset = preset === 'overhead' ? 'overhead' : 'elevated';
    this._orbited = false;
    this._camGoal = this._home();
  }

  resize(cssW, cssH, dpr) {
    this.cssW = Math.max(50, cssW); this.cssH = Math.max(50, cssH);
    this.dpr = dpr || 1;
    if (!this.renderer) return;
    this.renderer.setPixelRatio(Math.min(2, this.dpr));
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
    if (!this._orbited) this._camGoal = this._home();
  }

  view() {
    return {
      scale: this._scale,
      portrait: this.cssH > this.cssW,
      dpr: this.dpr,
      toTable: (x, y) => this.toTable(x, y),
    };
  }

  /** Canvas-relative CSS px of a table point on the cloth plane. */
  project(x, y) {
    const v = new THREE.Vector3(x, 0, -y).project(this.camera);
    return [(v.x + 1) / 2 * this.cssW, (1 - v.y) / 2 * this.cssH];
  }

  toTable(x, y) {
    const ndc = new THREE.Vector2((x / this.cssW) * 2 - 1, -(y / this.cssH) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    if (t < 0) return null;
    return { x: o.x + d.x * t, y: -(o.z + d.z * t) };
  }

  _updateCamera(dt) {
    if (this._orbited && this._shotLive) {   // shot rolling: ease home
      this._camGoal = this._home();
      this._orbited = false;
    }
    const k = 1 - Math.exp(-dt * 5);
    for (const key of ['az', 'el', 'dist']) {
      let d = this._camGoal[key] - this._cam[key];
      if (key === 'az') { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; }
      this._cam[key] += d * k;
    }
    const { az, el, dist } = this._cam;
    this.camera.position.set(
      Math.sin(az) * Math.cos(el) * dist,
      Math.sin(el) * dist,
      Math.cos(az) * Math.cos(el) * dist);
    this.camera.lookAt(0, -0.02, 0);
    this.camera.updateMatrixWorld();
    // The shade hangs over table center; from the high home angles it lands
    // mid-frame as a black blob over the head rail, so it only shows when
    // the player orbits down to a low, dramatic angle.
    if (this._lampGroup) this._lampGroup.visible = el < 0.95;
    // CSS px per meter at table center, from the camera right vector.
    const e = this.camera.matrixWorld.elements;
    const rx = e[0], rz = e[2];
    const a = new THREE.Vector3(0, 0, 0).project(this.camera);
    const b = new THREE.Vector3(rx, 0, rz).project(this.camera);
    this._scale = Math.max(40,
      Math.hypot((b.x - a.x) * this.cssW / 2, (b.y - a.y) * this.cssH / 2));
  }

  draw(frame) {
    const now = performance.now();
    const dt = clamp((now - this._lastT) / 1000, 0.001, 0.1);
    this._lastT = now;
    this._shotLive = !frame.cue;
    this._updateCamera(dt);

    for (const m of this._balls) m.visible = false;
    for (const b of frame.balls || []) {
      const m = this._balls[b.id];
      if (!m || b.pocketed) continue;
      m.visible = true;
      m.position.set(b.x, R + (b.z || 0), -b.y);
      const q = Array.isArray(b.q) && b.q.length === 4 ? b.q : [1, 0, 0, 0];
      this._qTmp.set(q[1], q[2], q[3], q[0]);
      m.quaternion.copy(this._qBasis).multiply(this._qTmp).multiply(this._qBasisInv);
    }

    this._drawGuide(frame);
    this._drawCue(frame);
    this.renderer.render(this.scene, this.camera);
  }

  _drawGuide(frame) {
    const guide = frame.guideMode === 'none' ? null : frame.guide;
    this._cueLine.visible = this._objLine.visible = this._afterLine.visible = false;
    this._ghostRing.visible = this._targetRing.visible = this._wrongRing.visible = false;
    this._markRing.visible = false;
    this._placeBall.visible = false; this._placeRing.visible = false;
    this._kitchenLine.visible = false;
    if (guide) {
      const path = guide.cuePath || [];
      if (path.length >= 2) {
        const a = path[0], b = path[path.length - 1];
        this._setRibbon(this._cueLine, a[0], a[1], b[0], b[1], 0.0012, 0.006);
      }
      if (guide.ghost) {
        this._ghostRing.visible = true;
        this._ghostRing.position.set(guide.ghost.x, 0.0035, -guide.ghost.y);
      }
      if (guide.objPath && guide.objPath.length >= 2 && frame.guideMode !== 'line') {
        const a = guide.objPath[0], b = guide.objPath[guide.objPath.length - 1];
        this._setRibbon(this._objLine, a[0], a[1], b[0], b[1], 0.004, 0.0012);
      }
      if (guide.cueAfter && guide.cueAfter.length >= 2) {
        const a = guide.cueAfter[0], b = guide.cueAfter[guide.cueAfter.length - 1];
        this._setRibbon(this._afterLine, a[0], a[1], b[0], b[1], 0.003, 0.001);
      }
      if (guide.targetPocket != null && this._pockets[guide.targetPocket]) {
        const p = this._pockets[guide.targetPocket];
        const pulse = 1 + 0.15 * Math.sin((frame.time || 0) / 280);
        this._targetRing.visible = true;
        this._targetRing.scale.setScalar(pulse * (p.r / (R * 1.675)) * 1.6);
        this._targetRing.position.set(p.mx, 0.0035, -p.my);
      }
      if (guide.wrongFirst && guide.contact) {
        this._wrongRing.visible = true;
        this._wrongRing.position.set(guide.contact.x, 0.0035, -guide.contact.y);
      }
    }
    if (Array.isArray(frame.marks) && frame.marks.length && this._pockets[frame.marks[0]]) {
      const p = this._pockets[frame.marks[0]];
      const pulse = 1 + 0.15 * Math.sin((frame.time || 0) / 280);
      this._markRing.visible = true;
      this._markRing.scale.setScalar(pulse * (p.r / (R * 1.775)) * 1.6);
      this._markRing.position.set(p.mx, 0.0035, -p.my);
    }
    if (frame.place) {
      const pl = frame.place;
      this._placeBall.visible = true;
      this._placeBall.position.set(pl.x, R, -pl.y);
      this._placeRing.visible = true;
      this._placeRing.material.color.set(pl.valid ? 0xe8b95a : 0xd2553f);
      this._placeRing.position.set(pl.x, 0.0035, -pl.y);
      if (pl.kitchen) this._setRibbon(this._kitchenLine, HEAD_X, -HALF_W, HEAD_X, HALF_W, 0.004, 0.004);
    }
  }

  _drawCue(frame) {
    const ball = (frame.balls || []).find((b) => b.id === 0);
    if (!frame.cue || !ball || ball.pocketed) { this._cue.visible = false; return; }
    const pullM = clamp((frame.cue.pullPx || 0) / Math.max(1, this._scale), 0, 0.5);
    this._cue.visible = true;
    this._cue.position.set(ball.x, R * 0.98 + pullM * 0.06, -ball.y);
    // Group +x must point along the aim: the three.js aim direction is
    // (cos a, -sin a) in (x, z) and Ry(t) maps +x to (cos t, -sin t), so
    // yaw = +a; the pitch raises the butt so the tip sits at center-back.
    this._cue.rotation.set(0, frame.cue.angle, 0);
    this._cue.rotateZ(-0.05 - pullM * 0.04);
    this._cue.translateX(-(R * 0.45 + pullM));
  }
}
