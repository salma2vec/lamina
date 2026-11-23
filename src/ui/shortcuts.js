/** Keyboard shortcuts. */

const KEYS = { r: 'random', s: 'save', e: 'export', '?': 'help', t: 'today', v: 'flat', f: 'frame' };

/**
 * Install global key handling.
 * @param {Object<string, (e:KeyboardEvent)=>void>} actions keyed by action name
 */
export function installShortcuts(actions) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { actions.escape(e); return; }
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    // Letter and number keys still work from a range slider, which takes no text.
    if (typing && !(t.type === 'range' && /^[1-3vVfFrRsSeE?tT[\]]$/.test(e.key))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let name = null;
    if (k >= '1' && k <= '3') name = 'mode';
    else if (k === 'ArrowUp' || k === 'ArrowDown') name = 'offset';
    else if (k === 'ArrowLeft' || k === 'ArrowRight') name = 'tilt';
    else if (k === '[' || k === ']') name = 'bracket';
    else name = KEYS[k.toLowerCase()] || KEYS[k];
    if (!name || !actions[name]) return;
    // Arrow keys on a range slider move that slider.
    if ((name === 'offset' || name === 'tilt') && t && t.type === 'range') return;
    e.preventDefault();
    actions[name](e);
  });
}
