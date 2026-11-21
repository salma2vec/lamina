/** Histogram with draggable thresholds. */
import { fitCanvas, cssVar } from './dom.js';

export class Histogram {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.app = app;
    this.drag = -1;
    new ResizeObserver(() => this.draw()).observe(canvas);
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left - 4) / (r.width - 8)));
    };
    canvas.addEventListener('pointerdown', (e) => {
      const t = this.app.params.thresholds;
      if (!t.length) return;
      const x = pos(e);
      let best = 0;
      t.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(t[best] - x)) best = i; });
      this.drag = best;
      canvas.setPointerCapture(e.pointerId);
      this.move(x);
    });
    canvas.addEventListener('pointermove', (e) => { if (this.drag >= 0) this.move(pos(e)); });
    const end = () => { this.drag = -1; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  move(x) {
    const t = this.app.params.thresholds;
    const i = this.drag;
    const lo = i > 0 ? t[i - 1] + 0.005 : 0.005;
    const hi = i < t.length - 1 ? t[i + 1] - 0.005 : 0.995;
    t[i] = Math.round(Math.min(hi, Math.max(lo, x)) * 1000) / 1000;
    this.app.changed('thresholds');
    this.draw();
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    const app = this.app, c = app.d.crop;
    const ink3 = cssVar('--ink-3'), accent = cssVar('--accent-ink'), rule = cssVar('--rule-2');
    const L = 4, R = w - 4, band = 10, base = h - band - 4;
    ctx.fillStyle = rule;
    ctx.fillRect(L, base, R - L, 1);
    if (!c) return;
    const hist = c.hist;
    let mx = 0;
    for (const v of hist) mx = Math.max(mx, Math.sqrt(v));
    const bw = (R - L) / hist.length;
    ctx.fillStyle = ink3;
    hist.forEach((v, i) => {
      const bh = mx ? (Math.sqrt(v) / mx) * (base - 8) : 0;
      ctx.fillRect(L + i * bw, base - bh, Math.max(1, bw - 0.6), bh);
    });
    const t = app.params.thresholds;
    const cols = app.colours();
    const edges = [0, ...t, 1];
    for (let k = 0; k + 1 < edges.length; k++) {
      ctx.fillStyle = cols[k] || '#888';
      ctx.fillRect(L + edges[k] * (R - L), h - band, (edges[k + 1] - edges[k]) * (R - L), band);
    }
    ctx.strokeStyle = rule;
    ctx.strokeRect(L + 0.5, h - band + 0.5, R - L - 1, band - 1);
    ctx.fillStyle = accent;
    ctx.strokeStyle = accent;
    for (const v of t) {
      const x = Math.round(L + v * (R - L)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, h - band); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 5); ctx.closePath(); ctx.fill();
    }
  }
}
