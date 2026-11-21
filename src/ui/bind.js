/** Two-way binding between [data-key] controls and app parameters. */
import { $$, getPath, setPath, fx } from './dom.js';

/**
 * Format a value for an <output data-unit>.
 * @param {number} v
 * @param {string} unit
 * @param {string} lenUnit unit of source lengths
 */
export function formatOut(v, unit, lenUnit) {
  switch (unit) {
    case 'len': return `${fx(v, 1)} ${lenUnit}`;
    case 'deg': return `${fx(v, 1)}°`;
    case 'vox': return `${v} vox`;
    case 'px': return `${fx(v, Number.isInteger(v) ? 0 : 2)} px`;
    case 'mm': return `${fx(v, 1)} mm`;
    case 'x': return `${fx(v, 2)}×`;
    case 'ratio': return fx(v, 2);
    default: return String(v);
  }
}

/**
 * Wire every [data-key] control under root.
 * @param {import('./app.js').App} app
 * @param {ParentNode} [root]
 * @returns {() => void} sync function: pushes params into controls
 */
export function bindControls(app, root = document) {
  const inputs = $$('[data-key]', root);
  for (const input of inputs) {
    const key = input.dataset.key;
    const ev = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(ev, () => {
      let v;
      if (input.type === 'checkbox') v = input.checked;
      else if (input.tagName === 'SELECT') v = input.value;
      else {
        v = parseFloat(input.value);
        if (!Number.isFinite(v)) return;
        if (input.type === 'number') {
          const lo = parseFloat(input.min), hi = parseFloat(input.max);
          if (Number.isFinite(lo) && v < lo) return;
          if (Number.isFinite(hi) && v > hi) return;
        }
      }
      setPath(app.params, key, v);
      app.changed(key);
      syncOutputs();
    });
  }
  const syncOutputs = () => {
    for (const o of $$('output[data-out]', root)) {
      o.textContent = formatOut(getPath(app.params, o.dataset.out), o.dataset.unit, app.unit);
    }
  };
  return function sync() {
    for (const input of inputs) {
      if (document.activeElement === input && input.type === 'number') continue;
      const v = getPath(app.params, input.dataset.key);
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v;
    }
    syncOutputs();
  };
}
