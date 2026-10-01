// Centered event banner: one sentence, fades. No persistent hint line.
export function createBanner(el) {
  let timer = null;
  function hide() {
    el.classList.remove('show');
    if (timer) { clearTimeout(timer); timer = null; }
  }
  return {
    show(text, { tone = '', ms = 1150 } = {}) {
      el.textContent = text;
      el.className = '';
      if (tone) el.classList.add('tone-' + tone);
      void el.offsetWidth; // restart the fade cleanly on repeat shows
      el.classList.add('show');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('show'), ms);
    },
    hide,
    clear() { hide(); el.textContent = ''; },
  };
}
