/**
 * Flat views: the section or the cane front-on, with a scale bar, for
 * precise work. Dragging moves the section under the outline; the wheel
 * zooms it.
 */
import { fitCanvas, niceLength, fx } from './dom.js';
import { cropOutlineInSlice } from '../cane/crop.js';
import { outlineHeight, outlinePolygon } from '../cane/outline.js';
import { drawPattern } from './pattern-texture.js';

export const INK = '#e9e5dc';
export const INK2 = '#b3ada2';
export const INK3 = '#948e83';
export const ACCENT = '#c4574a';
const MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';

/** Space kept clear of the toolbars and the bottom controls, in CSS pixels. */
export function safeArea(w, h) {
  const phone = w < 640;
  return { l: phone ? 56 : 76, r: phone ? 56 : 76, t: phone ? 64 : 56, b: phone ? 128 : 120 };
}

/** Studio backdrop for 2D canvases, matching the 3D scene. */
export function backdrop(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, '#252321');
  g.addColorStop(1, '#121110');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

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

/** Scale bar with a label, left end at x, baseline y. */
export function scaleBar(ctx, x, y, pxPerUnit, unit, suffix = '') {
  const len = niceLength(90 / pxPerUnit);
  const w = len * pxPerUnit;
  ctx.fillStyle = INK2;
  ctx.fillRect(x, y - 3, w, 1);
  ctx.fillRect(x, y - 7, 1, 8);
  ctx.fillRect(x + w - 1, y - 7, 1, 8);
  ctx.font = `11px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${len < 1 ? len.toFixed(2) : len} ${unit}${suffix}`, x + w + 8, y);
}

/**
 * Mark the thinnest region on a cane drawn at (x0, y0) with side `size`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./app.js').App} app
 * @param {boolean} [label] add a text label
 */
export function drawThinnest(ctx, app, x0, y0, size, label = true) {
  const sm = app.d.smallest, sh = app.d.sheet;
  // With a single region there is no thinnest region to point at.
  if (!sm || !sh || sh.clays.length < 2) return;
  const g = app.G;
  const X = x0 + ((sm.x + 0.5) / g) * size, Y = y0 + ((sm.y + 0.5) / g) * size;
  const r = Math.max(label ? 7 : 10, (sm.width / 2 / g) * size + (label ? 5 : 6));
  const col = sh.featureWarn ? ACCENT : INK;
  ctx.save();
  ctx.lineWidth = label ? 1.25 : 2.5;
  ctx.strokeStyle = 'rgba(18,17,16,0.7)';
  ctx.beginPath(); ctx.arc(X, Y, r + ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
  if (label) {
    ctx.beginPath();
    ctx.moveTo(X + r * 0.7, Y - r * 0.7);
    ctx.lineTo(X + r * 0.7 + 16, Y - r * 0.7 - 16);
    ctx.stroke();
    ctx.font = `11px ${MONO}`;
    const txt = `thinnest ${fx(sh.smallestBuild, 1)} mm`;
    const tx = X + r * 0.7 + 19, ty = Y - r * 0.7 - 18;
    ctx.fillStyle = 'rgba(24,23,22,0.86)';
    ctx.fillRect(tx - 5, ty - 12, ctx.measureText(txt).width + 10, 17);
    ctx.fillStyle = col;
    ctx.fillText(txt, tx, ty);
  }
  ctx.restore();
}

export class FlatView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./app.js').App} app
   */
  constructor(canvas, app) {
    this.canvas = canvas;
    this.app = app;
    this.mode = 'cane';
    this.img = null;
    this.layout = null;
    this.patternCanvas = document.createElement('canvas');
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
      this.app.interactive = true;
    });
    c.addEventListener('pointermove', (e) => {
      if (!last || !this.layout) return;
      const o = this.app.params.outline;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      if (this.mode === 'section') {
        const k = this.layout.unitsPerPx;
        o.ox += dx * k;
        o.oy -= dy * k;
      } else {
        // In the cane the outline stays put and the section moves under it.
        const k = (this.app.ref / o.zoom) / this.layout.size;
        const ux = dx * k, uy = -dy * k;
        const a = (o.rotation * Math.PI) / 180;
        o.ox -= ux * Math.cos(a) - uy * Math.sin(a);
        o.oy -= ux * Math.sin(a) + uy * Math.cos(a);
      }
      this.app.changed('outline.ox');
      this.app.emit('params');
    });
    const end = () => {
      if (!last) return;
      last = null;
      c.classList.remove('dragging');
      this.app.settle();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    let wheelTimer = 0;
    c.addEventListener('wheel', (e) => {
      if (!this.layout) return;
      e.preventDefault();
      const o = this.app.params.outline;
      o.zoom = Math.min(8, Math.max(0.5, o.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.app.interactive = true;
      this.app.changed('outline.zoom');
      this.app.emit('params');
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => this.app.settle(), 180);
    }, { passive: false });
  }

  draw() {
    const { ctx, w, h } = fitCanvas(this.canvas);
    backdrop(ctx, w, h);
    this.layout = null;
    if (!this.app.source) return;
    if (this.mode === 'section') this.drawSection(ctx, w, h);
    else if (this.mode === 'cane') this.drawCane(ctx, w, h);
    else this.drawPatternFlat(ctx, w, h);
  }

  drawSection(ctx, w, h) {
    const app = this.app, sl = app.d.slice, s = app.source, p = app.params;
    const safe = safeArea(w, h);
    if (!sl || !this.img) {
      ctx.fillStyle = INK3;
      ctx.font = 'italic 15px ' + getComputedStyle(document.documentElement).getPropertyValue('--serif');
      ctx.textAlign = 'center';
      ctx.fillText('The plane is outside the specimen.', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }
    const aw = w - safe.l - safe.r, ah = h - safe.t - safe.b - 24;
    const scale = Math.min(aw / sl.w, ah / sl.h);
    const dw = sl.w * scale, dh = sl.h * scale;
    const x0 = safe.l + (aw - dw) / 2, y0 = safe.t + (ah - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, x0, y0, dw, dh);
    const k = scale / sl.px;
    const cx = x0 + dw / 2, cy = y0 + dh / 2;
    this.layout = { unitsPerPx: 1 / k };
    if (sl.loops) {
      ctx.strokeStyle = ACCENT;
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
    ctx.strokeStyle = 'rgba(18,17,16,0.75)';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
    const unit = app.unit;
    scaleBar(ctx, x0, y0 + dh + 26, k, unit);
    ctx.fillStyle = INK3;
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'right';
    const line = s.kind === 'image'
      ? `${s.image.sourceW || s.image.w} × ${s.image.sourceH || s.image.h} px`
      : `${p.plane.axis.toUpperCase()}  ${fx(p.plane.offset)} ${unit}  tilt ${fx(p.plane.tiltA)}° / ${fx(p.plane.tiltB)}°${s.kind === 'volume' && p.slab.n > 1 ? `  ${p.slab.mode === 'max' ? 'max' : 'avg'} ${p.slab.n} vox` : ''}`;
    ctx.fillText(line, x0 + dw, y0 + dh + 26);
    if (sl.repaired) ctx.fillText(`${sl.repaired} open contour${sl.repaired > 1 ? 's' : ''} closed`, x0 + dw, y0 + dh + 42);
    ctx.textAlign = 'start';
  }

  drawCane(ctx, w, h) {
    const app = this.app, p = app.params, d = app.d;
    if (!d.labels) return;
    const safe = safeArea(w, h);
    const hf = outlineHeight(p.outline.shape, p.outline.aspect);
    const aw = w - safe.l - safe.r, ah = h - safe.t - safe.b - 44;
    const size = Math.max(60, Math.min(aw, ah / hf));
    const cx = safe.l + aw / 2, cy = safe.t + ah / 2;
    this.layout = { size };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(app.caneCanvas, cx - size / 2, cy - size / 2, size, size);
    ctx.beginPath();
    outlinePolygon(p.outline.shape, p.outline.aspect).forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * size, cy - y * size) : ctx.moveTo(cx + x * size, cy - y * size)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Width dimension.
    const yb = cy + (size * hf) / 2 + 24;
    ctx.fillStyle = INK2;
    ctx.fillRect(cx - size / 2, yb, size, 1);
    ctx.fillRect(cx - size / 2, yb - 4, 1, 9);
    ctx.fillRect(cx + size / 2 - 1, yb - 4, 1, 9);
    ctx.font = `11px ${MONO}`;
    ctx.textAlign = 'center';
    const label = `${fx(p.cane.size, 1)} mm`;
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#1e1d1b';
    ctx.fillRect(cx - tw / 2, yb - 7, tw, 14);
    ctx.fillStyle = INK;
    ctx.fillText(label, cx, yb + 4);
    ctx.textAlign = 'start';
    scaleBar(ctx, safe.l, h - safe.b + 34, size / p.cane.size, 'mm', ' at build');
    drawThinnest(ctx, app, cx - size / 2, cy - size / 2, size);
  }

  drawPatternFlat(ctx, w, h) {
    const app = this.app;
    if (!app.d.labels) return;
    const safe = safeArea(w, h);
    const aw = Math.round(w - safe.l - safe.r), ah = Math.round(h - safe.t - safe.b);
    drawPattern(app, this.patternCanvas, aw, ah);
    ctx.drawImage(this.patternCanvas, safe.l, safe.t, aw, ah);
  }
}
