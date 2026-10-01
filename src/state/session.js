// Transient per-session UI state. resetSession() clears EVERY transient
// field in one call: the old game's stale-hint bug class (hint text from a
// previous session leaking onto the wrong screen) dies at this contract.
export function createSession() {
  return {
    banner: null,        // { text, tone } currently shown
    callout: null,
    placing: false,      // ball-in-hand placement active
    calledPocket: null,  // pocket index called for the 8
    spectating: false,
    aiming: false,
    pulling: false,      // stroke pull in progress (aim locked)
  };
}
export function resetSession(session) {
  Object.assign(session, createSession());
  return session;
}
