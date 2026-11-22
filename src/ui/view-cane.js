/** Cane view: the rendered cross-section at build size with dimensions and key. */
import { fitCanvas, cssVar, fx } from './dom.js';
import { scaleBar } from './view-slice.js';
import { outlineHeight, outlinePolygon, SHAPES } from '../cane/outline.js';

export class CaneView {
  constructor(canvas, cap, app) {
    this.canvas = canvas;
    this.cap = cap;
    this.app = app;
    this.layout = null;
    new ResizeObserver(() => this.visible && this.draw()).observe(canvas);
    this.bindPointer();
  }

  bindPointer() {
    let last = null;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.layout) return;
      last = [e.clientX, e.clientY];
      c.setPointerCapture(e.pointerId);
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', (e) => {
      if (!last || !this.layout) return;
      const o = this.app.params.outline;
      // Screen motion moves the section under the fixed outline.
      const k = (this.app.ref / o.zoom) / this.layout.size;
      const dx = (e.clientX - last[0]) * k, dy = -(e.clientY - last[1]) * k;
      const a = (o.rotation * Math.PI) / 180;
      o.ox -= dx * Math.cos(a) - dy * Math.sin(a);
      o.oy -= dx * Math.sin(a) + dy * Math.cos(a);
      last = [e.clientX, e.clientY];
      this.app.changed('outline.ox');
      this.app.emit('params');
    });
    const end = () => { last = null; c.classList.remove('dragging'); };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      if (!this.layout) return;
      e.preventDefault();
      const o = this.app.params.outline;
      o.zoom = Math.min(8, Math.max(0.5, o.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.app.changed('outline.zoom');
      this.app.emit('params');
    }, { passive: false });
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    const app = this.app, p = app.params, d = app.d;
    this.layout = null;
    if (!app.source || !d.labels) { this.cap.innerHTML = ''; return; }
    const ink = cssVar('--ink'), ink2 = cssVar('--ink-2'), accent = cssVar('--accent-ink');
    const mono = cssVar('--mono'), sans = cssVar('--sans');
    const shapeName = SHAPES.find((s) => s.id === p.outline.shape).name.toLowerCase();
    this.cap.innerHTML = `<b>Cane</b>${shapeName} &middot; ${fx(p.cane.size, 0)} mm &middot; ${p.levels} levels`;
    const hf = outlineHeight(p.outline.shape, p.outline.aspect);
    const keyW = w > 620 ? 180 : 0;
    const size = Math.max(60, Math.min(w - 80 - keyW, (h - 120) / hf));
    const cx = (w - keyW) / 2, cy = h / 2 - 10;
    this.layout = { size };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(app.caneCanvas, cx - size / 2, cy - size / 2, size, size);
    // A hairline outline keeps the edge visible where a clay matches the page colour.
    ctx.beginPath();
    outlinePolygon(p.outline.shape, p.outline.aspect).forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * size, cy - y * size) : ctx.moveTo(cx + x * size, cy - y * size)));
    ctx.closePath();
    ctx.strokeStyle = cssVar('--ink-3');
    ctx.lineWidth = 1;
    ctx.stroke();
    const pxPerMm = size / p.cane.size;
    // Width dimension line.
    const yb = cy + (size * hf) / 2 + 22;
    ctx.fillStyle = ink;
    ctx.fillRect(cx - size / 2, yb, size, 1);
    ctx.fillRect(cx - size / 2, yb - 4, 1, 9);
    ctx.fillRect(cx + size / 2 - 1, yb - 4, 1, 9);
    ctx.font = `11px ${mono}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = cssVar('--bg');
    const label = `${fx(p.cane.size, 1)} mm`;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillRect(cx - tw / 2, yb - 7, tw, 14);
    ctx.fillStyle = ink;
    ctx.fillText(label, cx, yb + 4);
    ctx.textAlign = 'start';
    scaleBar(ctx, 14, h - 16, pxPerMm, 'mm', ink, ' at build');
    // Thinnest region marker.
    const sm = d.smallest, sh = d.sheet;
    // With a single region there is no thinnest region to point at.
    if (sm && sh && sh.clays.length > 1) {
      const g = app.G;
      const X = cx - size / 2 + ((sm.x + 0.5) / g) * size, Y = cy - size / 2 + ((sm.y + 0.5) / g) * size;
      const r = Math.max(6, (sm.width / 2 / g) * size + 4);
      ctx.strokeStyle = sh.featureWarn ? accent : ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X + r * 0.7, Y - r * 0.7);
      ctx.lineTo(X + r * 0.7 + 14, Y - r * 0.7 - 14);
      ctx.stroke();
      ctx.font = `11px ${mono}`;
      const txt = `thinnest ${fx(sh.smallestBuild, 1)} mm`;
      const tx = X + r * 0.7 + 17, ty = Y - r * 0.7 - 16;
      ctx.fillStyle = cssVar('--bg');
      ctx.fillRect(tx - 4, ty - 11, ctx.measureText(txt).width + 8, 16);
      ctx.fillStyle = sh.featureWarn ? accent : ink;
      ctx.fillText(txt, tx, ty);
    }
    // Key.
    if (keyW && sh) {
      let y = cy - (sh.clays.length * 34) / 2;
      const x = w - keyW;
      for (const c of sh.clays) {
        ctx.fillStyle = c.colour;
        ctx.fillRect(x, y, 16, 16);
        ctx.strokeStyle = cssVar('--rule-2');
        ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
        ctx.fillStyle = ink;
        ctx.font = `12px ${sans}`;
        ctx.fillText(c.name, x + 24, y + 8);
        ctx.fillStyle = ink2;
        ctx.font = `11px ${mono}`;
        ctx.fillText(`${fx(c.fraction * 100, 1)}%  ${fx(c.mass, 0)} g`, x + 24, y + 22);
        y += 34;
      }
    }
  }
}
