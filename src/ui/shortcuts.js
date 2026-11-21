/** Keyboard shortcuts. */

/**
 * Install global key handling.
 * @param {Object<string, (e:KeyboardEvent)=>void>} actions keyed by action name
 */
export function installShortcuts(actions) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { actions.escape(e); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (!(t.type === 'range' && /^[1-4gGrRsSeE?tT[\]]$/.test(e.key))) return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let name = null;
    if (k >= '1' && k <= '4') name = 'view';
    else if (k === 'ArrowUp' || k === 'ArrowDown') name = 'offset';
    else if (k === 'ArrowLeft' || k === 'ArrowRight') name = 'tilt';
    else if (k === '[' || k === ']') name = 'bracket';
    else name = { r: 'random', R: 'random', s: 'save', S: 'save', e: 'export', E: 'export', '?': 'help', g: 'split', G: 'split', t: 'today', T: 'today' }[k];
    if (!name || !actions[name]) return;
    if (t && t.type === 'range' && (name === 'offset' || name === 'tilt')) return;
    e.preventDefault();
    actions[name](e);
  });
}
