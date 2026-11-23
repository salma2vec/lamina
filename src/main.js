/** Lamina entry point: builds the interface and wires it to the app state. */
import * as THREE from 'three';
import { App } from './ui/app.js';
import { $, $$, el, fx } from './ui/dom.js';
import { bindControls, formatOut } from './ui/bind.js';
import { icon } from './ui/icons.js';
import { Stage, webglAvailable } from './ui/gl/stage.js';
import { SectionMode } from './ui/gl/section.js';
import { CaneMode } from './ui/gl/cane.js';
import { PatternMode } from './ui/gl/pattern.js';
import { FlatView } from './ui/flat.js';
import { Histogram } from './ui/histogram.js';
import { Panels, installTips } from './ui/popover.js';
import { VSlider } from './ui/vslider.js';
import { renderLevels, renderPresets, renderSwatches, renderSheet, renderFacts, renderChips } from './ui/panels.js';
import { loadFiles, syntheticVolume, cancelLoad, runJob } from './ui/loader.js';
import { runExport } from './ui/export.js';
import { Today } from './ui/today.js';
import { installShortcuts } from './ui/shortcuts.js';
import { SPECIMENS } from './volume/synthetic.js';
import { otsuLevel } from './volume/isosurface.js';
import { SHAPES, outlinePolygon } from './cane/outline.js';
import { LAYOUTS, ALTERNATIONS } from './pattern/tile.js';
import { PRESETS, defaultMapping } from './cane/palette.js';
import { fromSession } from './state.js';

const query = new URLSearchParams(location.search);
const still = ['section', 'cane', 'pattern'].includes(query.get('still')) ? query.get('still') : null;
const body = document.body;
if (still) body.classList.add('still');

for (const b of $$('[data-icon]')) b.innerHTML = icon(b.dataset.icon);

const app = new App();
const glOK = webglAvailable();
let stage = null;
const modes = {};
if (glOK) {
  stage = new Stage($('#gl'), $('#stage'));
  modes.section = new SectionMode(stage);
  modes.cane = new CaneMode(stage);
  modes.pattern = new PatternMode(stage);
  for (const [k, m] of Object.entries(modes)) stage.add(k, m);
} else {
  body.classList.add('no-gl');
  $('#gl').hidden = true;
}
const flat = new FlatView($('#flat'), app);
const hist = new Histogram($('#hist'), app);
const panels = new Panels();
installTips($('#tip'));

/** Short lines for the study volume list; the full description is the tooltip. */
const SHORT = {
  osteon: 'Haversian canals in concentric lamellae',
  ammonite: 'Log-spiral shell with frilled septa',
  stromatolite: 'Domed microbial laminae in columns',
  wood: 'Growth rings, cell files and rays',
  frond: 'Ediacaran fractal branching',
};
/** Surface levels that show each study volume as a solid form. */
const ISO = { osteon: 0.18, ammonite: 0.3, stromatolite: 0.3, wood: 0.1, frond: 0.4 };

let mode = 'cane';
let flatOn = !glOK;
/** What changed since a view last drew it. */
const dirty = { section: true, crop: true, cane: true, pattern: true, sheet: true };

/* ---------- Status line ---------- */

const status = { kind: null, timer: 0 };
/**
 * Show one quiet line at the bottom left.
 * @param {string|null} text
 * @param {{kind?:'progress'|'error'|'note'|'toast', p?:number, action?:string, onAction?:()=>void}} [o]
 */
function say(text, o = {}) {
  const kind = o.kind || 'toast';
  clearTimeout(status.timer);
  const st = $('#status');
  if (!text) { st.hidden = true; status.kind = null; return; }
  status.kind = kind;
  st.hidden = false;
  st.classList.toggle('error', kind === 'error');
  $('#status-text').textContent = text;
  const act = $('#status-action');
  act.hidden = !o.action;
  act.textContent = o.action || '';
  act.onclick = o.onAction || null;
  $('#progress').hidden = kind !== 'progress';
  if (kind === 'progress') $('#progress-bar').style.width = `${Math.round((o.p || 0) * 100)}%`;
  if (kind === 'toast') status.timer = setTimeout(() => say(null), 2600);
}
const toast = (msg) => say(msg, { kind: 'toast' });
const dismiss = { action: 'Dismiss', onAction: () => say(null) };
function showError(msg) { if (msg) say(msg, { kind: 'error', ...dismiss }); else if (status.kind === 'error') say(null); }
function showNote(msg) { if (msg) say(msg, { kind: 'note', ...dismiss }); else if (status.kind === 'note') say(null); }
function progress(p, label) {
  if (p === null) { if (status.kind === 'progress') say(null); return; }
  say(label || 'Loading', { kind: 'progress', p, action: 'Cancel', onAction: () => cancelLoad() });
}

/* ---------- Modes and views ---------- */

const usingFlat = () => !glOK || (flatOn && mode !== 'pattern');

function setMode(m) {
  mode = m;
  for (const k of ['section', 'cane', 'pattern']) body.classList.toggle(`mode-${k}`, k === m);
  $$('.modes [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  app.setHorizon(m === 'section' ? 'crop' : m === 'cane' ? 'sheet' : 'pattern');
  refreshView(true);
}

function refreshView(modeChanged = false) {
  const f = usingFlat();
  $('#flat').hidden = !f;
  if (glOK) {
    $('#gl').hidden = f;
    stage.active = !f;
  }
  flat.mode = mode;
  flat.visible = f;
  const t = $('#flat-toggle');
  t.setAttribute('aria-pressed', String(flatOn));
  t.innerHTML = icon(flatOn ? 'cube' : 'flat');
  t.dataset.tip = flatOn ? '3D view' : 'Flat view';
  if (f) { flat.draw(); return; }
  if (modeChanged) stage.show(mode);
  applyVisible();
}

/** Bring the visible view up to date with the pipeline. */
function applyVisible() {
  if (!app.source) return;
  if (usingFlat()) {
    const need = mode === 'section' ? dirty.section || dirty.crop : mode === 'cane' ? dirty.cane : dirty.pattern;
    if (need) flat.draw();
    if (mode === 'section') dirty.section = dirty.crop = false;
    else if (mode === 'cane') dirty.cane = false;
    else dirty.pattern = false;
    return;
  }
  const m = modes[mode];
  let reframe = false;
  if (mode === 'section') {
    if (dirty.section) modes.section.updateSlice(app, iso);
    else if (dirty.crop) modes.section.updateCrop(app);
    dirty.section = dirty.crop = false;
  } else if (mode === 'cane' && dirty.cane && app.d.caneImage) {
    reframe = modes.cane.build(app);
    modes.cane.updateTexture(app);
    dirty.cane = false;
  } else if (mode === 'pattern' && dirty.pattern && app.d.labels) {
    reframe = modes.pattern.setForm(app.params.pattern.preview);
    modes.pattern.updateTexture(app);
    dirty.pattern = false;
  }
  if (reframe && !m.userMoved) stage.frame(false);
  if (still) markStill();
}

$$('.modes [role="tab"]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#flat-toggle').addEventListener('click', () => { flatOn = !flatOn; refreshView(true); });

/* ---------- Controls ---------- */

const sync = bindControls(app);

function segment(sel, attr, get, set) {
  const buttons = $$(`${sel} button`);
  buttons.forEach((b) => b.addEventListener('click', () => { set(b.dataset[attr]); syncAll(); }));
  return () => buttons.forEach((b) => b.setAttribute('aria-checked', String(String(get()) === b.dataset[attr])));
}

// Outline shapes and pattern layouts as small drawings.
for (const s of SHAPES) {
  const pts = outlinePolygon(s.id, 0.6).map(([x, y]) => `${(x * 14 + 10).toFixed(2)},${(10 - y * 14).toFixed(2)}`).join(' ');
  const b = el('button', { 'data-shape': s.id, role: 'radio', title: s.name, 'aria-label': s.name });
  b.innerHTML = `<svg class="i" viewBox="0 0 20 20" aria-hidden="true"><polygon points="${pts}"/></svg>`;
  $('#shape-seg').append(b);
}
const LAYOUT_ICON = { grid: 'grid', brick: 'brick', hex: 'hex', mirror: 'mirror', radial: 'radial' };
for (const l of LAYOUTS) {
  const b = el('button', { 'data-layout': l.id, role: 'radio', title: l.name, 'aria-label': l.name });
  b.innerHTML = icon(LAYOUT_ICON[l.id] || 'grid');
  $('#layout-seg').append(b);
}
$('#preview-seg [data-preview="slab"]').innerHTML = icon('slab');
$('#preview-seg [data-preview="vessel"]').innerHTML = icon('bowl');
$('#pattern-alt').append(...ALTERNATIONS.map((l) => el('option', { value: l.id, text: l.name })));

const segSyncs = [
  segment('#axis-seg', 'axis', () => app.params.plane.axis, (v) => { app.params.plane.axis = v; app.params.plane.offset = 0; app.changed('plane.axis'); reframeSection(); }),
  segment('#slab-seg', 'slab', () => app.params.slab.mode, (v) => { app.params.slab.mode = v; app.changed('slab.mode'); }),
  segment('#levels-seg', 'levels', () => app.params.levels, (v) => setLevels(+v)),
  segment('#preview-seg', 'preview', () => app.params.pattern.preview, (v) => { app.params.pattern.preview = v; app.changed('pattern.preview'); }),
  segment('#shape-seg', 'shape', () => app.params.outline.shape, (v) => { app.params.outline.shape = v; app.changed('outline.shape'); }),
  segment('#layout-seg', 'layout', () => app.params.pattern.layout, (v) => { app.params.pattern.layout = v; app.changed('pattern.layout'); }),
];

function setLevels(n) {
  n = Math.max(2, Math.min(6, n));
  if (n === app.params.levels) return;
  app.params.levels = n;
  app.changed('levels');
  syncAll();
}

/** A new axis faces another way: turn the camera to it unless the view was moved by hand. */
function reframeSection() {
  if (!glOK) return;
  dirty.section = true;
  requestAnimationFrame(() => { if (mode === 'section' && !modes.section.userMoved) stage.frame(false); });
}

// Range sliders: while one is dragged, clean-up runs a lighter pass.
for (const r of $$('input[type="range"]')) {
  r.addEventListener('pointerdown', () => { app.interactive = true; });
  r.addEventListener('change', () => app.settle());
}

const offsetSlider = new VSlider($('#offset-slider'), {
  get: () => app.params.plane.offset,
  set: (v) => { app.params.plane.offset = v; app.changed('plane.offset'); syncAll(); },
  range: () => app.offsetRange(),
  format: (v) => formatOut(v, 'len', app.unit),
  start: () => { app.interactive = true; },
  end: () => app.settle(),
});

function syncRanges() {
  const r = app.offsetRange();
  const off = $('#plane-offset');
  off.min = (-r).toFixed(2);
  off.max = r.toFixed(2);
  off.step = Math.max(0.01, r / 200).toPrecision(2);
  const ref = app.ref || 1;
  for (const id of ['#outline-ox', '#outline-oy']) {
    const i = $(id);
    i.min = (-ref).toFixed(2); i.max = ref.toFixed(2); i.step = (ref / 400).toPrecision(2);
  }
}

function syncAll() {
  syncRanges();
  sync();
  segSyncs.forEach((f) => f());
  offsetSlider.sync();
  body.classList.toggle('not-loaf', app.params.outline.shape !== 'rectangle');
}

app.on('params', syncAll);

$('#auto-thresholds').addEventListener('click', () => { app.autoThresholds = true; app.changed('levels'); });
$('#invert-mapping').addEventListener('click', () => {
  app.params.mapping = app.params.mapping.slice().reverse();
  app.changed('mapping');
});
$('#random-plane').addEventListener('click', randomPlane);
$('#reset-plane').addEventListener('click', () => {
  Object.assign(app.params.plane, { offset: 0, tiltA: 0, tiltB: 0 });
  app.changed('plane.offset');
  syncAll();
});

function randomPlane() {
  if (!app.source || app.source.kind === 'image') return;
  const p = app.params.plane;
  p.axis = ['xy', 'xz', 'yz'][Math.floor(Math.random() * 3)];
  p.tiltA = Math.round((Math.random() - 0.5) * 60);
  p.tiltB = Math.round((Math.random() - 0.5) * 60);
  p.offset = 0;
  p.offset = Math.round((Math.random() - 0.5) * app.offsetRange() * 0.8 * 10) / 10;
  app.changed('plane.offset');
  syncAll();
  reframeSection();
}

/* ---------- 3D surface of volumes ---------- */

let iso = 0.5;
let surfaceSeq = 0;
let surfaceKey = '';
let isoTimer = 0;

function setIso(v, label = true) {
  iso = Math.min(0.98, Math.max(0.02, v));
  $('#iso-level').value = iso;
  if (label) $('#iso-out').textContent = fx(iso, 2);
}

/**
 * Ask the worker for the surface of the current volume at the current level.
 * @param {boolean} sendVolume the worker does not have this volume yet
 */
function requestSurface(sendVolume) {
  const s = app.source;
  if (!glOK || !s || s.kind !== 'volume') return;
  const seq = ++surfaceSeq;
  const v = s.volume;
  const msg = { key: surfaceKey, level: iso };
  if (sendVolume) msg.volume = { dims: v.dims, spacing: v.spacing, data: v.data, scale: v.scale };
  runJob('surface-worker', msg).then((r) => {
    if (seq !== surfaceSeq || app.source !== s) return;
    modes.section.setSurface(r);
    dirty.section = true;
    if (mode === 'section' && !usingFlat()) applyVisible();
  }).catch((err) => { if (seq === surfaceSeq) showError(err.message); });
}

$('#iso-level').addEventListener('input', (e) => {
  setIso(parseFloat(e.target.value));
  dirty.section = true;
  if (mode === 'section') applyVisible();
  clearTimeout(isoTimer);
  isoTimer = setTimeout(() => requestSurface(false), 220);
});
$('#iso-level').addEventListener('change', () => { clearTimeout(isoTimer); requestSurface(false); });

/* ---------- Palette ---------- */

/** The last custom palette, kept while a preset is shown so it can be picked again. */
let customPalette = null;

function pickPalette(k) {
  const pal = app.params.palette;
  if (k === pal.preset) return;
  if (pal.preset === 'custom') customPalette = structuredClone(pal.swatches);
  const swatches = k === 'custom' ? structuredClone(customPalette) : structuredClone(PRESETS[k].swatches);
  if (!swatches) return;
  app.params.palette = { preset: k, swatches };
  app.params.mapping = defaultMapping(app.params.levels, swatches);
  app.invalidate('render');
  drawPalette();
}
const drawPresets = () => renderPresets($('#palette-presets'), app, customPalette, pickPalette);
function drawPalette() {
  drawPresets();
  renderSwatches($('#swatch-list'), $('#add-swatch'), app);
  panels.place();
}
$('#add-swatch').addEventListener('click', () => {
  const sw = app.params.palette.swatches;
  if (sw.length >= 6) return;
  sw.push({ name: `Clay ${sw.length + 1}`, colour: '#8a7a68', shrinkage: 12 });
  app.changed('palette');
  drawPalette();
});
app.on('palette', drawPalette);
// Edits in the clay list: refresh the preset list only, so the field being typed in keeps focus.
app.on('palette-light', drawPresets);

const drawChips = () => renderChips($('#chips'), app, { open: (a) => panels.toggle('clays', a), step: (d) => setLevels(app.params.levels + d) });

/* ---------- Panels ---------- */

$$('[data-panel]').forEach((b) => b.addEventListener('click', () => panels.toggle(b.dataset.panel, b)));
panels.onChange = (id) => {
  if (id === 'clays') { renderLevels($('#level-list'), app); drawPalette(); if ($('#adjust').open) hist.draw(); }
  if (id === 'build') renderSheet($('#sheet'), app);
  if (id === 'specimen') renderFacts($('#source-facts'), app);
  panels.place();
};
$('#adjust').addEventListener('toggle', () => { if ($('#adjust').open) hist.draw(); panels.place(); });
for (const d of $$('.panel details')) d.addEventListener('toggle', () => panels.place());

/* ---------- Source ---------- */

for (const s of SPECIMENS) {
  const b = el('button', { 'data-id': s.id, title: s.description }, [el('span', { class: 'name', text: s.name }), el('span', { class: 'desc', text: SHORT[s.id] || '' })]);
  b.addEventListener('click', () => { loadSynthetic(s.id); panels.close(false); });
  $('#specimen-list').append(el('li', {}, [b]));
}

/* Each load gets a number. A load that a newer one replaced is cancelled, and its result is ignored. */
let loadSeq = 0;
/** Parameters (and scale) from a session whose source file has not been loaded yet. */
let pendingSession = null;
let pendingScale = null;

function beginLoad(label) {
  cancelLoad();
  showError('');
  progress(0, label);
  return ++loadSeq;
}

function loadFailed(seq, err) {
  if (seq !== loadSeq) return;
  progress(null);
  app.keepParams = false;
  if (err && err.cancelled) { toast('Loading cancelled.'); return; }
  showError((err && err.message) || 'The file could not be read.');
}

async function loadSynthetic(id, overrides) {
  const spec = SPECIMENS.find((s) => s.id === id);
  const label = `Generating ${spec.name.toLowerCase()}`;
  const seq = beginLoad(label);
  try {
    const volume = await syntheticVolume(id, 1, (p) => seq === loadSeq && progress(p, label), true);
    if (seq !== loadSeq) return;
    progress(null);
    showNote('');
    pendingSession = pendingScale = null;
    const defaults = overrides || { plane: spec.plane, crop: spec.crop, levels: spec.levels };
    app.setSource({ kind: 'volume', name: spec.name, synthetic: { id, seed: 1 }, volume }, defaults);
  } catch (err) {
    loadFailed(seq, err);
  }
}

async function handleFiles(files) {
  if (!files || !files.length) return;
  const seq = beginLoad('Reading');
  try {
    const r = await loadFiles(files, (p, label) => seq === loadSeq && progress(p, label));
    if (seq !== loadSeq) return;
    progress(null);
    if (r.kind === 'session') { applySession(r.session); return; }
    const session = pendingSession, scale = pendingScale;
    pendingSession = pendingScale = null;
    if (session) {
      // The session saved earlier for this file: keep its parameters.
      app.params = session;
      app.autoThresholds = app.params.thresholds.length === 0;
      app.keepParams = true;
      drawPalette();
    }
    showNote(r.warning || '');
    app.setSource(r);
    if (r.kind === 'image' && r.spacing) app.setScale(r.spacing, !!session);
    if (scale) app.setScale(scale, true);
  } catch (err) {
    loadFailed(seq, err);
  }
}

$('#tb-open').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#drop-veil').hidden = false; });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-veil').hidden = true; } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop-veil').hidden = true;
  if (!today.isOpen) handleFiles(e.dataTransfer.files);
});

$('#scale-input').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) app.setScale(v);
});

function caption(s) {
  if (!s) return ['', ''];
  if (s.synthetic) return [s.name, ' — synthetic study volume'];
  if (s.kind === 'mesh') return [s.name, ` — mesh, ${s.mesh.triangles.toLocaleString('en')} triangles`];
  if (s.kind === 'volume') return [s.name, ` — volume, ${s.volume.dims.join(' × ')}`];
  return [s.name, ' — image'];
}

let lastSource = null;
app.on('source', (s) => {
  const [name, sub] = caption(s);
  $('#caption-name').textContent = name;
  $('#caption-sub').textContent = sub;
  $$('#specimen-list button').forEach((b) => b.classList.toggle('on', !!(s && s.synthetic && s.synthetic.id === b.dataset.id)));
  body.classList.toggle('no-source', !s);
  body.classList.toggle('no-volume', !s || s.kind !== 'volume');
  body.classList.toggle('no-plane', !s || s.kind === 'image');
  $('#plane-controls').hidden = !!(s && s.kind === 'image');
  $('#plane-none').hidden = !(s && s.kind === 'image');
  renderFacts($('#source-facts'), app);
  const sf = $('#scale-field');
  const showScale = s && !s.synthetic && (s.kind === 'mesh' || !s.unitKnown || s.userScale);
  sf.hidden = !showScale;
  if (showScale) {
    $('#scale-label').textContent = s.kind === 'mesh' ? 'Mesh unit' : s.kind === 'image' ? 'Pixel size' : 'Voxel size';
    $('#scale-input').value = s.kind === 'mesh' ? (s.meshScale || 1) : s.unitKnown ? +(s.kind === 'image' ? s.pixelSize / (s.image.factor || 1) : s.volume.spacing[0] / s.volume.factor[0]).toPrecision(6) : '';
  }
  // The same source with a new scale keeps its view; a new source starts fresh.
  const fresh = s !== lastSource;
  lastSource = s;
  if (glOK) {
    modes.section.setSource(s);
    if (fresh) { modes.cane.userMoved = false; modes.pattern.userMoved = false; }
    if (s && s.kind === 'volume') {
      if (fresh) setIso(s.synthetic ? ISO[s.synthetic.id] || 0.3 : otsuLevel(s.volume));
      surfaceKey = `${s.name}:${s.volume.spacing.join(',')}:${Math.random()}`;
      requestSurface(true);
    }
    if (mode === 'section' && !usingFlat()) stage.frame(false);
  }
  Object.keys(dirty).forEach((k) => { dirty[k] = true; });
  panels.place();
});

/* ---------- Plane dragging in the 3D view ---------- */

if (glOK) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const gl = $('#gl');
  const hitPlane = (e) => {
    if (mode !== 'section' || !app.source || app.source.kind === 'image') return null;
    const r = gl.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    return modes.section.pickPlane(ray);
  };
  let drag = null;
  $('#stage').addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || usingFlat() || e.target !== gl) return;
    const hit = hitPlane(e);
    if (!hit) return;
    e.stopPropagation();
    e.preventDefault();
    const R = Math.max(...app.source.size) * 0.1;
    const n = new THREE.Vector3(...app.frame.n);
    const r = gl.getBoundingClientRect();
    const a = hit.point.clone().project(stage.camera), b = hit.point.clone().addScaledVector(n, R).project(stage.camera);
    let sx = ((b.x - a.x) * r.width) / 2, sy = (-(b.y - a.y) * r.height) / 2;
    let len = Math.hypot(sx, sy);
    // Seen almost face-on, the normal has no length on screen: use vertical motion instead.
    if (len < 14) { sx = 0; sy = -60; len = 60; }
    drag = { x: e.clientX, y: e.clientY, start: app.params.plane.offset, sx: sx / len, sy: sy / len, k: R / len, id: e.pointerId };
    gl.setPointerCapture(e.pointerId);
    gl.classList.add('dragging');
    app.interactive = true;
  }, true);
  gl.addEventListener('pointermove', (e) => {
    if (drag) {
      const d = (e.clientX - drag.x) * drag.sx + (e.clientY - drag.y) * drag.sy;
      const lim = app.offsetRange();
      app.params.plane.offset = Math.max(-lim, Math.min(lim, drag.start + d * drag.k));
      app.changed('plane.offset');
      syncAll();
      return;
    }
    if (e.buttons) return;
    gl.classList.toggle('on-plane', !!hitPlane(e));
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    gl.classList.remove('dragging');
    app.settle();
  };
  gl.addEventListener('pointerup', endDrag);
  gl.addEventListener('pointercancel', endDrag);
}

/* ---------- Session ---------- */

function applySession(obj) {
  let r;
  try { r = fromSession(obj); } catch (err) { showError(err.message); return; }
  app.params = r.params;
  app.autoThresholds = r.params.thresholds.length === 0;
  drawPalette();
  if (r.source && r.source.synthetic && SPECIMENS.some((s) => s.id === r.source.synthetic.id)) {
    showNote('');
    app.keepParams = true;
    loadSynthetic(r.source.synthetic.id);
    // loadSynthetic clears pending state; keepParams carries the session into setSource.
  } else {
    showNote(r.source ? `Session loaded. Open "${r.source.name}" again to restore the section; the session does not hold its data.` : 'Session loaded.');
    // Show the session on the current source now, and apply it again to the next file loaded.
    pendingSession = r.source ? structuredClone(r.params) : null;
    pendingScale = r.source && r.source.scale ? r.source.scale : null;
    if (app.source) app.invalidate('slice');
  }
  syncAll();
  if (!r.source || r.source.synthetic) toast('Session loaded.');
}

$('#session-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { applySession(JSON.parse(await f.text())); } catch { showError('The session file is not valid JSON.'); }
});

/* ---------- Export ---------- */

async function doExport(kind) {
  panels.close(false);
  try {
    const msg = await runExport(kind, app, { pickSession: () => $('#session-input').click() });
    if (msg) toast(msg);
  } catch (err) {
    toast(err.message);
  }
}
$$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));

/* ---------- Today ---------- */

let todayReturn = null;
const today = new Today((pick) => loadSynthetic(pick.id, { plane: pick.plane, crop: pick.crop, levels: pick.spec.levels }), toast);
today.onClose = () => {
  $('#app').inert = false;
  const back = todayReturn && document.contains(todayReturn) ? todayReturn : $('#tb-today');
  back.focus({ preventScroll: true });
};
function openToday() {
  if (today.isOpen) return;
  todayReturn = document.activeElement;
  panels.close(false);
  today.open();
  $('#app').inert = true;
  $('#timer-start').focus();
}
$('#tb-today').addEventListener('click', openToday);
$('[data-close="today"]').addEventListener('click', () => today.close());

/* ---------- Keyboard ---------- */

const editing = () => today.isOpen;
installShortcuts({
  escape: () => { if (panels.isOpen) panels.close(true); else if (today.isOpen) today.close(); else cancelLoad(); },
  mode: (e) => { if (!editing()) setMode(['section', 'cane', 'pattern'][+e.key - 1]); },
  offset: (e) => {
    if (editing() || !app.source || app.source.kind === 'image') return;
    const r = app.offsetRange();
    const step = (e.shiftKey ? 10 : 1) * Math.max(r / 100, 1e-3);
    const p = app.params.plane;
    p.offset = Math.max(-r, Math.min(r, p.offset + (e.key === 'ArrowUp' ? step : -step)));
    app.changed('plane.offset');
    syncAll();
  },
  tilt: (e) => {
    if (editing() || !app.source || app.source.kind === 'image') return;
    const p = app.params.plane;
    const k = e.shiftKey ? 'tiltB' : 'tiltA';
    p[k] = Math.max(-80, Math.min(80, p[k] + (e.key === 'ArrowRight' ? 1 : -1)));
    app.changed(`plane.${k}`);
    syncAll();
  },
  bracket: (e) => {
    if (editing()) return;
    const d = e.key === ']' ? 1 : -1;
    if (mode === 'section' && app.source && app.source.kind === 'volume') {
      app.params.slab.n = Math.max(1, Math.min(32, app.params.slab.n + d));
      app.changed('slab.n');
      syncAll();
    } else setLevels(app.params.levels + d);
  },
  random: () => { if (today.isOpen) $('#today-random').click(); else randomPlane(); },
  save: () => { if (!editing()) doExport('session-save'); },
  export: () => { if (!editing()) panels.open('export', $('[data-panel="export"]')); },
  help: () => { if (!editing()) panels.toggle('help', $('[data-panel="help"]')); },
  today: () => openToday(),
  flat: () => { if (!editing() && glOK && mode !== 'pattern') { flatOn = !flatOn; refreshView(true); } },
  frame: () => { if (!editing() && glOK && !usingFlat()) stage.frame(true); },
});

/* ---------- Pipeline updates ---------- */

app.on('updated', (ran) => {
  const has = (...k) => k.some((x) => ran.has(x));
  if (has('slice')) { flat.refresh(); dirty.section = true; }
  if (has('crop')) dirty.crop = true;
  if (has('render', 'sheet')) dirty.cane = true;
  if (has('render', 'pattern', 'sheet')) dirty.pattern = true;
  const open = (id) => !$(`#panel-${id}`).hidden;
  if (has('crop', 'quant', 'render') && open('clays') && $('#adjust').open) hist.draw();
  if (has('crop', 'quant', 'clean', 'render') && open('clays')) renderLevels($('#level-list'), app);
  if (has('crop', 'clean', 'render', 'sheet')) drawChips();
  if (has('sheet', 'render') && open('build')) { renderSheet($('#sheet'), app); panels.place(); }
  if (has('crop')) segSyncs.forEach((f) => f());
  applyVisible();
});

/* ---------- Still images for the README ---------- */

/** In still mode, say when the scene is drawn and settled. */
function markStill() {
  clearTimeout(markStill.t);
  markStill.t = setTimeout(() => { if (glOK) stage.invalidate(); window.laminaStill = true; }, 400);
}

/* ---------- Start ---------- */

drawPalette();
syncAll();
body.classList.add('no-source', 'no-volume', 'not-loaf');
setMode(still || 'cane');
const start = query.get('specimen');
loadSynthetic(SPECIMENS.some((s) => s.id === start) ? start : 'osteon');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for automated checks and the browser console.
window.lamina = { app, setMode, loadSynthetic, today, panels, stage, modes, get mode() { return mode; }, setFlat: (on) => { flatOn = on; refreshView(true); } };
