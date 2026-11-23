/** A thin vertical slider at the screen edge, for the plane offset. */

export class VSlider {
  /**
   * @param {HTMLElement} root element with .thumb and output children
   * @param {{get:()=>number, set:(v:number)=>void, range:()=>number, format:(v:number)=>string, start?:()=>void, end?:()=>void}} o
   */
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.thumb = root.querySelector('.thumb');
    this.out = root.querySelector('output');
    let dragging = false;
    const fromY = (y) => {
      const r = root.getBoundingClientRect();
      const t = 1 - Math.min(1, Math.max(0, (y - r.top) / r.height));
      const R = o.range();
      return -R + 2 * R * t;
    };
    root.addEventListener('pointerdown', (e) => {
      dragging = true;
      root.setPointerCapture(e.pointerId);
      root.classList.add('active');
      if (o.start) o.start();
      o.set(fromY(e.clientY));
      e.preventDefault();
    });
    root.addEventListener('pointermove', (e) => { if (dragging) o.set(fromY(e.clientY)); });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      root.classList.remove('active');
      if (o.end) o.end();
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('keydown', (e) => {
      const R = o.range();
      const step = (e.shiftKey ? 10 : 1) * Math.max(R / 100, 1e-3);
      const d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 10, PageDown: -step * 10 }[e.key];
      let v = null;
      if (d !== undefined) v = o.get() + d;
      else if (e.key === 'Home') v = R;
      else if (e.key === 'End') v = -R;
      if (v === null) return;
      e.preventDefault();
      e.stopPropagation();
      o.set(Math.max(-R, Math.min(R, v)));
    });
  }

  /** Move the thumb and label to the current value. */
  sync() {
    const R = this.o.range() || 1, v = this.o.get();
    const t = 0.5 - v / (2 * R);
    const pct = `${(Math.min(1, Math.max(0, t)) * 100).toFixed(2)}%`;
    this.thumb.style.top = pct;
    this.out.style.top = pct;
    const text = this.o.format(v);
    this.out.textContent = text;
    this.root.setAttribute('aria-valuemin', (-R).toFixed(2));
    this.root.setAttribute('aria-valuemax', R.toFixed(2));
    this.root.setAttribute('aria-valuenow', v.toFixed(2));
    this.root.setAttribute('aria-valuetext', text);
  }
}
