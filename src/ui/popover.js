/**
 * Floating panels: one open at a time, placed beside the control that opened
 * it, closed by a tap outside or Esc. On narrow screens they are a bottom sheet.
 * Also the small tooltips of the toolbar buttons.
 */
import { $, $$ } from './dom.js';

const GAP = 8;
const narrow = () => window.matchMedia('(max-width: 640px)').matches;

export class Panels {
  constructor() {
    this.current = null;
    this.anchor = null;
    this.onChange = () => {};
    document.addEventListener('pointerdown', (e) => {
      if (!this.current) return;
      const t = e.target;
      if (this.current.contains(t) || (this.anchor && this.anchor.contains(t))) return;
      // Controls that open panels handle their own clicks.
      if (t.closest && t.closest('[data-panel]')) return;
      this.close(false);
    }, true);
    window.addEventListener('resize', () => this.place());
  }

  /** Whether a panel is open. */
  get isOpen() { return !!this.current; }

  /**
   * Open a panel, or close it if it is already open from the same control.
   * @param {string} id panel id without the "panel-" prefix
   * @param {HTMLElement} anchor
   */
  toggle(id, anchor) {
    const p = $(`#panel-${id}`);
    if (this.current === p) { this.close(true); return; }
    this.open(id, anchor);
  }

  open(id, anchor) {
    const p = $(`#panel-${id}`);
    if (!p) return;
    if (this.current && this.current !== p) this.close(false);
    this.current = p;
    this.anchor = anchor;
    p.hidden = false;
    $$('[data-panel]').forEach((b) => b.setAttribute('aria-expanded', String(b === anchor)));
    this.place();
    // Keyboard users land inside the panel; pointer users keep their place.
    if (anchor && anchor.matches(':focus-visible')) p.focus();
    this.onChange(id);
  }

  /**
   * Close the open panel.
   * @param {boolean} refocus return focus to the control that opened it
   */
  close(refocus) {
    const p = this.current;
    if (!p) return;
    const hadFocus = p.contains(document.activeElement);
    p.hidden = true;
    this.current = null;
    $$('[data-panel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if ((refocus || hadFocus) && this.anchor && this.anchor.focus) this.anchor.focus({ preventScroll: true });
    this.anchor = null;
    this.onChange(null);
  }

  /** Position the open panel beside its control. */
  place() {
    const p = this.current, a = this.anchor;
    if (!p) return;
    p.style.left = p.style.right = p.style.top = p.style.bottom = '';
    if (narrow() || !a) return;
    const r = a.getBoundingClientRect();
    const bar = a.closest('.toolbar, .bottom') || a;
    const br = bar.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x, y;
    if (bar.classList.contains('right') || bar.classList.contains('corner')) {
      x = br.left - GAP - pw;
      y = r.top - 4;
    } else if (bar.classList.contains('left')) {
      x = br.right + GAP;
      y = r.top - 4;
    } else if (bar.classList.contains('bottom') || a.closest('.bottom')) {
      x = r.left + r.width / 2 - pw / 2;
      y = br.top - GAP - ph;
    } else {
      x = r.left;
      y = r.bottom + GAP;
    }
    x = Math.max(GAP, Math.min(vw - pw - GAP, x));
    y = Math.max(GAP, Math.min(vh - ph - GAP, y));
    p.style.left = `${Math.round(x)}px`;
    p.style.top = `${Math.round(y)}px`;
  }
}

/**
 * Hover tooltips for elements with data-tip (and an optional data-key-hint).
 * @param {HTMLElement} tip the tooltip element
 */
export function installTips(tip) {
  let timer = 0, current = null;
  const hide = () => { clearTimeout(timer); tip.hidden = true; current = null; };
  const show = (t) => {
    tip.replaceChildren(t.dataset.tip);
    if (t.dataset.keyHint) {
      const k = document.createElement('kbd');
      k.textContent = t.dataset.keyHint;
      if (t.dataset.keyHint.length > 2) { k.style.border = '0'; k.style.padding = '0'; }
      tip.append(k);
    }
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const bar = t.closest('.toolbar');
    let x, y;
    if (bar && bar.classList.contains('left')) { x = r.right + 10; y = r.top + r.height / 2 - th / 2; }
    else if (bar) { x = r.left - 10 - tw; y = r.top + r.height / 2 - th / 2; }
    else { x = r.left + r.width / 2 - tw / 2; y = r.top - th - 8; }
    tip.style.left = `${Math.round(Math.max(4, Math.min(window.innerWidth - tw - 4, x)))}px`;
    tip.style.top = `${Math.round(Math.max(4, y))}px`;
  };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t === current) return;
    hide();
    if (!t || e.pointerType === 'touch' || t.getAttribute('aria-expanded') === 'true') return;
    current = t;
    timer = setTimeout(() => show(t), 380);
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
}
