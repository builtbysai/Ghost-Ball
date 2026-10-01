// Page lifecycle binding: the anti-hijack rules (DESIGN.md section 7).
//   visibilitychange hidden -> engine.suspend()
//   visibilitychange visible -> engine.resume(), but ONLY if the audio
//     was running before the page hid (tracked on engine.wasRunning)
//   pagehide                -> engine.teardown()
//   pageshow                -> nothing: if the event was persisted and
//     the engine is closed, audio restarts on the next gesture's
//     ensure() (bfcache re-show).
// CONTRACT (locked): installLifecycle(engine, target=document) -> uninstall()
// The automated probe drives a fake engine + fake event target in tests
// and the real AudioContext in the QA harness.
//
// Note: pagehide/pageshow are window events; listeners are attached to
// the given target, and additionally to target.defaultView (the window
// of a real document) when that differs from the target, so the spec
// holds in a real browser whether the caller passes document or window.
// Fake targets in tests have no defaultView, so only they are touched.

const hasDocument = () => typeof document !== 'undefined';

function windowOf(target) {
  try {
    if (target && target !== (hasDocument() ? window : null)) {
      const win = target.defaultView;
      if (win && win !== target) return win;
    }
  } catch { /* ignore */ }
  return null;
}

function isRunning(engine) {
  try { return engine.state === 'running'; } catch { return false; }
}

function isHidden(target, event) {
  // Prefer the event's own flag, then the target's hidden property
  // (real document.hidden / a fake target's field), then the real
  // document when it exists.
  if (event && event.hidden === true) return true;
  if (target && target.hidden === true) return true;
  if (hasDocument() && document.hidden === true) return true;
  return false;
}

export function installLifecycle(engine, target = hasDocument() ? document : null) {
  if (!engine || !target) {
    return () => {};
  }
  const aux = windowOf(target); // real document's window, or null

  function onVisibility(event) {
    try {
      if (isHidden(target, event)) {
        // Remember the pre-hide state BEFORE suspending.
        engine.wasRunning = isRunning(engine);
        engine.suspend();
      } else {
        if (engine.wasRunning) {
          engine.resume();
        }
        engine.wasRunning = false;
      }
    } catch { /* lifecycle never throws into game code */ }
  }

  function onPageHide() {
    try { engine.teardown(); } catch { /* ignore */ }
  }

  function onPageShow(event) {
    // Deliberate no-op: if the page came back from the bfcache with
    // the engine closed (event.persisted), audio restarts only on the
    // next user gesture's ensure(). Never re-grab the device on show.
    try {
      engine.wasRunning = false;
      void event;
    } catch { /* ignore */ }
  }

  const listeners = [
    [target, 'visibilitychange', onVisibility],
    [target, 'pagehide', onPageHide],
    [target, 'pageshow', onPageShow],
  ];
  if (aux) {
    listeners.push([aux, 'pagehide', onPageHide]);
    listeners.push([aux, 'pageshow', onPageShow]);
  }
  for (const [t, type, fn] of listeners) {
    try { t.addEventListener(type, fn); } catch { /* ignore */ }
  }

  let removed = false;
  return function uninstall() {
    if (removed) return;
    removed = true;
    for (const [t, type, fn] of listeners) {
      try { t.removeEventListener(type, fn); } catch { /* ignore */ }
    }
  };
}
