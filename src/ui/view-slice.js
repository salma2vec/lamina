/** Slice view: the resampled section, mesh contours, crop outline and scale bar. */
import { fitCanvas, cssVar, niceLength, fx } from './dom.js';
import { cropOutlineInSlice } from '../cane/crop.js';
import { outlinePolygon } from '../cane/outline.js';

/**
 * Convert a 0..1 float plane to an offscreen greyscale canvas.
 * @param {Float32Array} data
 * @param {number} w
 * @param {number} h
 */
export function greyCanvas(data, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const g = Math.max(0, Math.min(255, data[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/**
 * Draw a scale bar with a label.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x left
 * @param {number} y baseline
 * @param {number} pxPerUnit screen pixels per unit
 * @param {string} unit
 * @param {string} ink
 */
export function scaleBar(ctx, x, y, pxPerUnit, unit, ink, suffix = '') {
  const len = niceLength(90 / pxPerUnit);
  const w = len * pxPerUnit;
  ctx.fillStyle = ink;
  ctx.fillRect(x, y - 3, w, 2);
  ctx.fillRect(x, y - 7, 1, 6);
  ctx.fillRect(x + w - 1, y - 7, 1, 6);
  ctx.font = '11px ' + cssVar('--mono');
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${len < 1 ? len.toFixed(2) : len} ${unit}${suffix}`, x + w + 8, y);
}

export class SliceView {
  constructor(canvas, cap, app) {
    this.canvas = canvas;
    this.cap = cap;
    this.app = app;
    this.img = null;
    this.layout = null;
    new ResizeObserver(() => this.visible && this.draw()).observe(canvas);
    this.bindPointer();
  }

  /** Rebuild the greyscale image after a new slice. */
  refresh() {
    const sl = this.app.d.slice;
    this.img = sl ? greyCanvas(sl.data, sl.w, sl.h) : null;
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
      const k = this.layout.unitsPerPx;
      const o = this.app.params.outline;
      o.ox += (e.clientX - last[0]) * k;
      o.oy -= (e.clientY - last[1]) * k;
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
    const app = this.app, sl = app.d.slice, s = app.source;
    const ink = cssVar('--ink'), accent = cssVar('--accent-ink');
    this.layout = null;
    if (!s) { this.cap.innerHTML = ''; return; }
    const p = app.params;
    const unit = app.unit;
    this.cap.innerHTML = s.kind === 'image'
      ? `<b>Slice</b>image &middot; ${s.image.sourceW || s.image.w} &times; ${s.image.sourceH || s.image.h} px`
      : `<b>Slice</b>${p.plane.axis.toUpperCase()} &middot; ${fx(p.plane.offset)} ${unit} &middot; tilt ${fx(p.plane.tiltA)}&deg; / ${fx(p.plane.tiltB)}&deg;${s.kind === 'volume' && p.slab.n > 1 ? ` &middot; slab ${p.slab.n} ${p.slab.mode === 'max' ? 'max' : 'avg'}` : ''}`;
    if (!sl || !this.img) {
      ctx.fillStyle = cssVar('--ink-2');
      ctx.font = '13px ' + cssVar('--serif');
      ctx.textAlign = 'center';
      ctx.fillText('The plane is outside the specimen. Move it back with the offset slider.', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }
    const m = 40;
    const scale = Math.min((w - 2 * m) / sl.w, (h - 2 * m - 20) / sl.h);
    const dw = sl.w * scale, dh = sl.h * scale;
    const x0 = (w - dw) / 2, y0 = (h - dh) / 2 - 6;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, x0, y0, dw, dh);
    ctx.strokeStyle = cssVar('--rule-2');
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, dw + 1, dh + 1);
    const k = scale / sl.px; // screen px per unit
    const cx = x0 + dw / 2, cy = y0 + dh / 2;
    this.layout = { unitsPerPx: 1 / k };
    if (sl.loops) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const l of sl.loops) {
        for (let i = 0; i < l.length; i += 2) {
          const X = cx + l[i] * k, Y = cy - l[i + 1] * k;
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.closePath();
      }
      ctx.stroke();
    }
    const o = p.outline;
    const poly = cropOutlineInSlice(o, outlinePolygon(o.shape, o.aspect), app.ref);
    ctx.save();
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * k, cy - y * k) : ctx.moveTo(cx + x * k, cy - y * k)));
    ctx.closePath();
    // A paper-coloured halo keeps the outline legible on dark and light sections.
    ctx.strokeStyle = cssVar('--bg');
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = s.kind === 'mesh' ? ink : accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
    scaleBar(ctx, x0, y0 + dh + 24, k, unit, ink);
    if (sl.repaired) {
      ctx.fillStyle = cssVar('--ink-2');
      ctx.font = '11px ' + cssVar('--sans');
      ctx.textAlign = 'right';
      ctx.fillText(`${sl.repaired} open contour${sl.repaired > 1 ? 's' : ''} closed. The mesh has holes at this plane.`, x0 + dw, y0 + dh + 24);
      ctx.textAlign = 'start';
    }
  }
}
