/**
 * Application state and the derived-data pipeline:
 * slice -> crop -> quant -> clean -> render -> sheet -> pattern.
 * Invalidating a stage recomputes it and every later stage on the next frame.
 */
import { defaultParams } from '../state.js';
import { planeFrame, planeBoxHalfExtent, halfExtentAlong } from '../geom/plane.js';
import { sliceMesh, rasterizeLoops } from '../geom/slice-mesh.js';
import { sliceVolume } from '../volume/resample.js';
import { cropSlice } from '../cane/crop.js';
import { outlineMask } from '../cane/outline.js';
import { histogram, initialThresholds, quantise, levelCounts } from '../cane/quantise.js';
import { cleanup, smallestFeature } from '../cane/morph.js';
import { renderCane } from '../cane/render.js';
import { defaultMapping } from '../cane/palette.js';
import { computeSheet } from '../sheet/quantities.js';

export const STAGES = ['slice', 'crop', 'quant', 'clean', 'render', 'sheet', 'pattern'];

/**
 * Size of one working pixel of an image source: millimetres when the pixel
 * size is known, otherwise source pixels (the working image may be downsampled).
 */
const imagePixel = (s) => s.pixelSize || s.image.factor || 1;

/** Which stage a parameter path invalidates. */
export function stageFor(key) {
  if (key.startsWith('plane.') || key.startsWith('slab.')) return 'slice';
  if (key.startsWith('outline.') || key === 'levels') return 'crop';
  if (key === 'thresholds') return 'quant';
  if (key.startsWith('clean.') || key === 'cane.size') return 'clean';
  if (key === 'mapping' || key.startsWith('palette')) return 'render';
  if (key.startsWith('cane.')) return 'sheet';
  if (key.startsWith('pattern.')) return 'pattern';
  return 'slice';
}

export class App {
  constructor() {
    /** Editable parameters (saved in sessions). */
    this.params = defaultParams();
    /** Current source or null. */
    this.source = null;
    /** Derived data. */
    this.d = { slice: null, crop: null, raw: null, labels: null, counts: [], smallest: null, sheet: null };
    this.G = 320;
    this.autoThresholds = true;
    this.keepParams = false;
    this.dirty = new Set();
    this.handlers = {};
    this.raf = 0;
    this.maskKey = '';
    this.mask = null;
    this.caneCanvas = document.createElement('canvas');
  }

  /** Subscribe to an event: 'updated' (Set of stages), 'source', 'params'. */
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, data) { for (const fn of this.handlers[evt] || []) fn(data); }

  /** Mark a stage and all later stages for recomputation. */
  invalidate(stage) {
    const i = STAGES.indexOf(stage);
    for (let k = Math.max(0, i); k < STAGES.length; k++) this.dirty.add(STAGES[k]);
    if (!this.raf) this.raf = requestAnimationFrame(() => this.run());
  }

  /** A parameter changed through the UI. */
  changed(key) {
    if (key === 'levels') { this.autoThresholds = true; this.params.mapping = []; }
    if (key === 'palette') this.params.palette.preset = 'custom';
    this.invalidate(stageFor(key));
  }

  /** Length unit of the current source. */
  get unit() {
    const s = this.source;
    if (!s) return '';
    if (s.unitKnown) return 'mm';
    return s.kind === 'image' ? 'px' : 'vox';
  }

  /** Reference size for crop zoom (largest source dimension). */
  get ref() { return this.source ? this.source.ref : 1; }

  get frame() { return planeFrame(this.params.plane); }

  /** Range for the plane offset slider given the current tilt. */
  offsetRange() {
    if (!this.source || this.source.kind === 'image') return 1;
    return halfExtentAlong(this.source.size, this.frame.n);
  }

  /**
   * Install a new source.
   * @param {Object} src {kind, name, mesh|volume|image, synthetic?}
   * @param {Object} [defaults] specimen defaults {plane, crop, levels}
   */
  setSource(src, defaults = {}) {
    const s = { ...src };
    if (s.kind === 'volume') {
      s.size = s.volume.dims.map((n, i) => n * s.volume.spacing[i]);
      s.unitKnown = !!s.volume.spacingKnown;
    } else if (s.kind === 'mesh') {
      // Mesh files carry no units; millimetres are the common convention.
      s.size = s.mesh.size.slice();
      s.unitKnown = true;
      s.meshScale = s.meshScale || 1;
    } else {
      const px = imagePixel(s);
      s.size = [s.image.w * px, s.image.h * px, 0];
      s.unitKnown = !!s.pixelSize;
    }
    s.ref = Math.max(...s.size);
    this.source = s;
    if (!this.keepParams) {
      const p = this.params;
      p.plane = { axis: 'xy', offset: 0, tiltA: 0, tiltB: 0, ...(defaults.plane || {}) };
      p.slab = { n: 1, mode: 'mean' };
      const c = defaults.crop || {};
      Object.assign(p.outline, { rotation: c.rotation || 0, zoom: c.zoom || this.fitZoom(), ox: c.ox || 0, oy: c.oy || 0 });
      p.levels = defaults.levels || (s.kind === 'mesh' ? 2 : 3);
      p.mapping = [];
      this.autoThresholds = true;
    }
    this.keepParams = false;
    this.emit('source', s);
    this.emit('params');
    this.invalidate('slice');
  }

  /**
   * Zoom that fits the cane window to the section of the source's bounding
   * box on the current plane. Meshes show the whole section with a margin.
   * Volumes and images fill the window, so the cane holds no empty border.
   */
  fitZoom() {
    const s = this.source;
    if (!s) return 1;
    let w = s.size[0], h = s.size[1];
    if (s.kind !== 'image') {
      const f = this.frame;
      w = 2 * halfExtentAlong(s.size, f.u);
      h = 2 * halfExtentAlong(s.size, f.v);
    }
    const z = s.kind === 'mesh' ? (0.85 * s.ref) / Math.max(w, h) : (1.01 * s.ref) / Math.min(w, h);
    return Math.round(Math.min(8, Math.max(0.5, z)) * 100) / 100;
  }

  /**
   * Change the physical scale of the current source (mm per voxel, pixel or mesh unit).
   * @param {number} mmPerUnit
   * @param {boolean} [keepParams] leave plane and section offsets as they are
   *   (they already use the new unit, as in a saved session)
   */
  setScale(mmPerUnit, keepParams = false) {
    const s = this.source;
    if (!s || !(mmPerUnit > 0)) return;
    s.userScale = mmPerUnit;
    const old = s.ref;
    if (s.kind === 'volume') {
      const f = s.volume.factor || [1, 1, 1];
      s.volume.spacing = f.map((k) => k * mmPerUnit);
      s.volume.spacingKnown = true;
      s.size = s.volume.dims.map((n, i) => n * s.volume.spacing[i]);
    } else if (s.kind === 'mesh') {
      const k = mmPerUnit / (s.meshScale || 1);
      const P = s.mesh.positions;
      for (let i = 0; i < P.length; i++) P[i] *= k;
      s.mesh.size = s.mesh.size.map((v) => v * k);
      s.size = s.mesh.size.slice();
      s.meshScale = mmPerUnit;
    } else {
      // mmPerUnit is the size of one source pixel; the working image may be downsampled.
      s.pixelSize = mmPerUnit * (s.image.factor || 1);
      s.size = [s.image.w * s.pixelSize, s.image.h * s.pixelSize, 0];
    }
    s.unitKnown = true;
    s.ref = Math.max(...s.size);
    if (!keepParams) {
      const k = s.ref / old;
      this.params.plane.offset *= k;
      this.params.outline.ox *= k;
      this.params.outline.oy *= k;
    }
    this.emit('source', s);
    this.emit('params');
    this.invalidate('slice');
  }

  run() {
    this.raf = 0;
    const ran = new Set();
    for (const st of STAGES) {
      if (!this.dirty.has(st)) continue;
      this.dirty.delete(st);
      this[`stage_${st}`]();
      ran.add(st);
    }
    this.emit('updated', ran);
  }

  stage_slice() {
    const s = this.source;
    this.d.slice = null;
    if (!s) return;
    if (s.kind === 'image') {
      this.d.slice = { data: s.image.data, w: s.image.w, h: s.image.h, px: imagePixel(s), loops: null };
      return;
    }
    const frame = this.frame;
    let half = planeBoxHalfExtent(s.size, frame);
    if (half <= 0) return;
    if (s.kind === 'volume') {
      const v = s.volume;
      const minSp = Math.min(...v.spacing);
      const n = Math.max(64, Math.min(384, Math.ceil((2 * half) / minSp)));
      const px = (2 * half) / n;
      const data = sliceVolume(v, frame, { n, px, slab: this.params.slab.n, mode: this.params.slab.mode });
      this.d.slice = { data, w: n, h: n, px, loops: null, frame, half };
    } else {
      half *= 1.02;
      const n = 512, px = (2 * half) / n;
      const tol = Math.max(...s.size) * 1e-4;
      const r = sliceMesh(s.mesh, frame, tol);
      const data = rasterizeLoops(r.loops, n, px);
      this.d.slice = { data, w: n, h: n, px, loops: r.loops, repaired: r.repaired, frame, half };
    }
  }

  stage_crop() {
    const sl = this.d.slice;
    this.d.crop = null;
    if (!sl) return;
    const o = this.params.outline;
    const key = `${o.shape}:${o.aspect}`;
    if (key !== this.maskKey) { this.mask = outlineMask(o.shape, this.G, o.aspect); this.maskKey = key; }
    const values = cropSlice(sl, this.G, o, this.ref);
    const hist = histogram(values, this.mask, 128);
    this.d.crop = { values, mask: this.mask, hist };
    const p = this.params;
    if (this.autoThresholds || p.thresholds.length !== p.levels - 1) {
      p.thresholds = initialThresholds(hist, p.levels);
      this.autoThresholds = false;
    }
    if (p.mapping.length !== p.levels || p.mapping.some((m) => m >= p.palette.swatches.length)) {
      p.mapping = defaultMapping(p.levels, p.palette.swatches);
    }
  }

  stage_quant() {
    const c = this.d.crop;
    this.d.raw = c ? quantise(c.values, this.params.thresholds, c.mask) : null;
  }

  stage_clean() {
    const raw = this.d.raw;
    if (!raw) { this.d.labels = null; this.d.counts = []; this.d.smallest = null; return; }
    const p = this.params, G = this.G;
    const minWidth = p.clean.minFeature / (p.cane.size / G);
    this.d.labels = cleanup(raw, G, G, { median: p.clean.median, openClose: p.clean.openClose, smooth: p.clean.smooth, minWidth, levels: p.levels });
    this.d.counts = levelCounts(this.d.labels, p.levels);
    this.d.smallest = smallestFeature(this.d.labels, G, G);
  }

  /** Clay colour per level. */
  colours() {
    const sw = this.params.palette.swatches;
    return this.params.mapping.map((i) => (sw[i] || sw[0]).colour);
  }

  stage_render() {
    const l = this.d.labels;
    const cv = this.caneCanvas;
    if (!l) { cv.width = cv.height = 1; return; }
    const img = renderCane(l, this.G, this.G, this.colours(), { scale: 2 });
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  }

  stage_sheet() {
    if (!this.d.labels) { this.d.sheet = null; return; }
    const p = this.params;
    this.d.sheet = computeSheet({
      counts: this.d.counts,
      mapping: p.mapping,
      swatches: p.palette.swatches,
      shape: p.outline.shape,
      aspect: p.outline.aspect,
      size: p.cane.size,
      length: p.cane.length,
      target: p.cane.target,
      density: p.cane.density,
      waste: p.cane.waste,
      minFeature: p.cane.minReduced,
      smallestPx: this.d.smallest ? this.d.smallest.width : null,
      grid: this.G,
    });
  }

  /** Pattern drawing happens in the pattern view; this stage only signals it. */
  stage_pattern() {}
}
