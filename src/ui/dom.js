/** Small DOM helpers. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Create an element.
 * @param {string} tag
 * @param {Object} [attrs] attributes; `text` sets textContent, `on*` adds listeners
 * @param {(Node|string)[]} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) e.append(c);
  return e;
}

/** Read a CSS custom property from the root element. */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Size a canvas backing store to its CSS box and device pixel ratio. Returns the CSS size. */
export function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height, dpr };
}

/** Get a value at a dotted path. */
export const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/** Set a value at a dotted path. */
export function setPath(o, path, v) {
  const ks = path.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => a[k], o);
  t[last] = v;
}

/** Trigger a file download from a Blob. */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** File-name-safe slug. */
export const slug = (s) => String(s || 'lamina').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lamina';

/** Pick a "nice" scale bar length (1, 2 or 5 x 10^k) close to target. */
export function niceLength(target) {
  if (!(target > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const m = target / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

/** Format a number with fixed decimals; dash for non-finite values. */
export const fx = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
