// rAF loop with clamped dt. Modes expose frame(dtMs).
export function createLoop(tick) {
  let raf = 0, running = false, last = 0;
  function step(ts) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    const dt = Math.min(100, ts - last);
    last = ts;
    try { tick(dt); } catch (e) { console.error('[loop]', e); }
  }
  return {
    start() {
      if (running) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(step);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    running: () => running,
  };
}
