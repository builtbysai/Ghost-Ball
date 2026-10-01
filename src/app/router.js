// Exactly one screen visible; sheets overlay the match.
export function createRouter({ screens, store }) {
  return {
    go(name) { screens.show(name); },
    current() { return store.get().screen; },
  };
}
