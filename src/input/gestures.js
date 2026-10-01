// Pointer unification over the table surface + edge controls.
// Modes (DESIGN.md 3.2, research: separate gesture passes):
//   - move / drag on cloth: aim (lever rule from aim.js)
//   - press + drag back along the aim axis on cloth: the STROKE; aim locks
//     while pulling; push forward fires; releasing fires from draw.
//   - drag on the power gauge: draw distance from gauge travel; release
//     fires from draw (touch path); aim locked while pulling.
//   - drag on the fine-aim strip: micro angle changes.
// CONTRACT: attachGestures({ surface, powerEl, aimEl, callbacks }) where
//   callbacks: onAim(angle), onPullStart(), onStroke(sampleM, t),
//     onStrokeRelease(sampleM, t), onFineAim(deltaRadians),
//     onPowerPull(frac01), onPowerRelease(frac01), onTapPlace?(pt),
//     onHover?(pt)
//   returns detach(). Surface coords are converted by callbacks' owner via
//   the provided toTable(ev) helper argument. Keep this module DOM-light:
//   it reports raw events + geometry helpers; match.js owns meaning.
// CONTRACT2: tablePointFromEvent(el, ev, view) -> {x,y} in table meters,
//   view = {cx, cy, scale, portrait} supplied by renderer.
//
// Wiring (all optional except surface/callbacks):
//   toTable(ev) -> {x,y}|null   owner-supplied pointer->table-meters
//     (usually (ev) => tablePointFromEvent(canvas, ev, renderer.view()))
//   getAim() -> number           current aim angle, radians (table space)
//   getCue() -> {x,y}|null       cue-ball table position (lever-rule origin)
//   getView()/view/pxPerMeter     px-per-meter scale for the 12 px aim
//     deadband (falls back to 400 px/m and is documented in the report)
// This module never touches the sim or the DOM beyond the three elements.
import { angleFromPoint, fineDelta } from './aim.js';

const ARM_M = 0.07;    // draw that starts the stroke (matches Stroke's arm)
const AIM_DEADBAND_PX = 12; // axial travel that freezes onAim (pre-pull hush)
const TAP_MAX_PX = 10;      // movement that still counts as a tap for onTapPlace
const CUE_MIN_DIST_M = 0.03; // pointer must be this far from the cue to aim
const FALLBACK_PX_PER_M = 400;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Wrap an angle difference back to (-PI, PI] so a fine nudge near the
// +/-PI branch cut still reports a small delta (not ~2PI the long way).
const wrapDelta = (d) => {
  if (!Number.isFinite(d)) return 0;
  d = (d + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
};
const distPx = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const evTime = (ev) => (Number.isFinite(ev?.timeStamp) ? ev.timeStamp / 1000 : performance.now() / 1000);
const clientOf = (ev) => ({ x: ev.clientX, y: ev.clientY });

function resolveScale(opts) {
  if (Number.isFinite(opts?.pxPerMeter) && opts.pxPerMeter > 0) return opts.pxPerMeter;
  const v = typeof opts?.getView === 'function' ? opts.getView() : opts?.view;
  if (v && Number.isFinite(v.scale) && v.scale > 0) return v.scale;
  return FALLBACK_PX_PER_M;
}

/**
 * Pointer event -> table meters, inverting the Render2D mapping:
 * landscape: +x right, +y up (screen y flipped); portrait: +x down, +y right.
 * Returns null when the event, element, or view is unusable.
 */
export function tablePointFromEvent(el, ev, view) {
  if (!el || !ev || !view) return null;
  if (!Number.isFinite(ev.clientX) || !Number.isFinite(ev.clientY)) return null;
  if (!Number.isFinite(view.cx) || !Number.isFinite(view.cy)) return null;
  if (!Number.isFinite(view.scale) || view.scale <= 0) return null;
  let rect;
  try { rect = el.getBoundingClientRect(); } catch { return null; }
  if (!rect) return null;
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;
  if (view.portrait) {
    // toPx: px = cx + y*s, py = cy + x*s  =>  x = (py-cy)/s, y = (px-cx)/s
    return { x: (py - view.cy) / view.scale, y: (px - view.cx) / view.scale };
  }
  // toPx: px = cx + x*s, py = cy - y*s  =>  x = (px-cx)/s, y = (cy-py)/s
  return { x: (px - view.cx) / view.scale, y: (view.cy - py) / view.scale };
}

/**
 * Wire the surface + edge controls. See the header for the option shapes.
 * Returns detach() which removes every listener.
 */
export function attachGestures(opts = {}) {
  const surface = opts.surface;
  const powerEl = opts.powerEl;
  const aimEl = opts.aimEl;
  const cb = opts.callbacks || {};
  const toTable = opts.toTable || cb.toTable || null;
  const getAim = opts.getAim || cb.getAim || (() => 0);
  const getCue = opts.getCue || opts.cueBall || cb.getCue || cb.getCueBall || null;
  const scaleOf = () => resolveScale(opts);

  const on = (name) => (typeof cb[name] === 'function' ? cb[name] : null);
  const onAim = on('onAim'), onPullStart = on('onPullStart'), onStroke = on('onStroke');
  const onStrokeRelease = on('onStrokeRelease'), onFineAim = on('onFineAim');
  const onPowerPull = on('onPowerPull'), onPowerRelease = on('onPowerRelease');
  const onTapPlace = on('onTapPlace'), onHover = on('onHover');
  const canPull = typeof cb.canPull === 'function' ? cb.canPull : () => true;

  const cueOf = () => {
    try {
      const c = typeof getCue === 'function' ? getCue() : getCue;
      if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: c.x, y: c.y };
    } catch { /* owner hiccup: fall back below */ }
    return null;
  };

  // Axial draw distance in meters: projection of (pt - cue) onto the aim
  // axis, behind the ball positive. aimDir points cue -> target.
  const drawOf = (pt, cue, aimAngle) => {
    const dx = Math.cos(aimAngle), dy = Math.sin(aimAngle);
    return -((pt.x - cue.x) * dx + (pt.y - cue.y) * dy);
  };

  const removers = [];
  const listen = (el, type, fn, o) => {
    if (!el || !el.addEventListener) return;
    el.addEventListener(type, fn, o);
    removers.push(() => el.removeEventListener(type, fn, o));
  };
  const capture = (el, ev) => {
    try { el.setPointerCapture(ev.pointerId); } catch { /* no capture: still works */ }
  };

  // ---- surface: aim / stroke / tap-place / hover -------------------------
  // One gesture at a time; extra pointers are ignored until it ends.
  let g = null;

  const surfaceDown = (ev) => {
    if (g) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (typeof ev.preventDefault === 'function' && ev.cancelable !== false) {
      try { ev.preventDefault(); } catch { /* ignore */ }
    }
    capture(surface, ev);
    const pt = toTable ? toTable(ev) : null;
    g = {
      id: ev.pointerId,
      startClient: clientOf(ev),
      movedPx: 0,
      aim: getAim(),
      cue: cueOf(),
      downPt: pt,
      pulling: false,
      lastAim: null,
    };
  };

  const feedStroke = (ev, cue, aim) => {
    // Coalesced samples give true pointer velocity for the Stroke machine.
    const evs = (typeof ev.getCoalescedEvents === 'function' && ev.getCoalescedEvents().length)
      ? ev.getCoalescedEvents() : [ev];
    for (const e of evs) {
      const pt = toTable ? toTable(e) : null;
      if (!pt) continue;
      if (onStroke) onStroke(drawOf(pt, cue, aim), evTime(e));
    }
  };

  const surfaceMove = (ev) => {
    if (!g || ev.pointerId !== g.id) {
      // Hover with no buttons (mouse, or pen in range): the placement
      // ghost follows the pointer.
      if (onHover && (ev.pointerType === 'mouse' || ev.pointerType === 'pen') && ev.buttons === 0 && toTable) {
        const pt = toTable(ev);
        if (pt) onHover(pt);
      }
      return;
    }
    g.movedPx = Math.max(g.movedPx, distPx(clientOf(ev), g.startClient));
    const pt = toTable ? toTable(ev) : null;
    if (!pt) return;
    // Placement ghost follows drags too (touch has no hover): any surface
    // move that is not a pull keeps the ghost under the pointer.
    if (onHover && !g.pulling) onHover(pt);

    const cue = g.cue || g.downPt; // fallback: gesture start as the origin
    if (!cue) return;
    const scale = scaleOf();
    const a = drawOf(pt, cue, g.aim);
    const a0 = g.downPt ? drawOf(g.downPt, cue, g.aim) : 0;

    if (!g.pulling && a >= ARM_M && canPull()) {
      g.pulling = true;
      if (onPullStart) onPullStart();
      feedStroke(ev, cue, g.aim); // aim is frozen from here on
      return;
    }
    if (g.pulling) {
      feedStroke(ev, cue, g.aim);
      return;
    }
    // Pre-pull: hush the aim once the drag is clearly running back along
    // the aim axis (12 px of axial travel), so starting a pull does not
    // swing the cue.
    if ((a - a0) * scale > AIM_DEADBAND_PX) return;
    const d = Math.hypot(pt.x - cue.x, pt.y - cue.y);
    if (d < CUE_MIN_DIST_M) return;
    const angle = angleFromPoint(cue, pt);
    if (g.lastAim == null || Math.abs(angle - g.lastAim) > 0.0005) {
      g.lastAim = angle;
      if (onAim) onAim(angle);
    }
  };

  const surfaceUp = (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const wasPulling = g.pulling;
    const movedPx = g.movedPx;
    const cue = g.cue || g.downPt;
    const aim = g.aim;
    g = null;
    if (wasPulling) {
      const pt = toTable ? toTable(ev) : null;
      if (onStrokeRelease) onStrokeRelease(pt && cue ? drawOf(pt, cue, aim) : 0, evTime(ev));
      return;
    }
    // A tap (press + release with ~no travel, no pull) commits placement.
    if (ev.type === 'pointerup' && onTapPlace && movedPx <= TAP_MAX_PX && toTable) {
      const pt = toTable(ev);
      if (pt) onTapPlace(pt);
    }
  };

  listen(surface, 'pointerdown', surfaceDown);
  listen(surface, 'pointermove', surfaceMove);
  listen(surface, 'pointerup', surfaceUp);
  listen(surface, 'pointercancel', surfaceUp);

  // ---- power gauge: vertical drag, bottom = 0, top = 1 --------------------
  let powerId = null;
  const powerFrac = (ev) => {
    let rect;
    try { rect = powerEl.getBoundingClientRect(); } catch { return 0; }
    if (!rect || rect.height <= 0) return 0;
    return clamp01(1 - (ev.clientY - rect.top) / rect.height);
  };
  listen(powerEl, 'pointerdown', (ev) => {
    if (powerId != null) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    powerId = ev.pointerId;
    capture(powerEl, ev);
    if (onPowerPull) onPowerPull(powerFrac(ev));
  });
  listen(powerEl, 'pointermove', (ev) => {
    if (ev.pointerId !== powerId) return;
    if (onPowerPull) onPowerPull(powerFrac(ev));
  });
  const powerUp = (ev) => {
    if (ev.pointerId !== powerId) return;
    powerId = null;
    if (onPowerRelease) onPowerRelease(powerFrac(ev));
  };
  listen(powerEl, 'pointerup', powerUp);
  listen(powerEl, 'pointercancel', powerUp);

  // ---- fine-aim strip: horizontal drag -> micro radians -------------------
  let aimId = null, aimLastX = 0;
  listen(aimEl, 'pointerdown', (ev) => {
    if (aimId != null) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    aimId = ev.pointerId;
    aimLastX = ev.clientX;
    capture(aimEl, ev);
  });
  listen(aimEl, 'pointermove', (ev) => {
    if (ev.pointerId !== aimId) return;
    const dx = ev.clientX - aimLastX;
    aimLastX = ev.clientX;
    if (dx !== 0 && onFineAim) {
      const cur = getAim();
      onFineAim(wrapDelta(fineDelta(cur, dx) - cur)); // sensitivity lives in aim.js
    }
  });
  const aimUp = (ev) => { if (ev.pointerId === aimId) aimId = null; };
  listen(aimEl, 'pointerup', aimUp);
  listen(aimEl, 'pointercancel', aimUp);

  return function detach() {
    for (const rm of removers.splice(0)) {
      try { rm(); } catch { /* already gone */ }
    }
    g = null; powerId = null; aimId = null;
  };
}
