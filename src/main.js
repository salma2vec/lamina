/** Lamina entry point: builds the interface and wires it to the app state. */
import { App } from './ui/app.js';
import { $, $$, el } from './ui/dom.js';
import { bindControls } from './ui/bind.js';
import { View3D } from './ui/view3d.js';
import { SliceView } from './ui/view-slice.js';
import { CaneView } from './ui/view-cane.js';
import { PatternView } from './ui/view-pattern.js';
import { Histogram } from './ui/histogram.js';
import { renderLevels, renderPresets, renderSwatches, renderSheet, renderFacts } from './ui/panels.js';
import { loadFiles, syntheticVolume, cancelLoad } from './ui/loader.js';
import { runExport } from './ui/export.js';
import { Today } from './ui/today.js';
import { installShortcuts } from './ui/shortcuts.js';
import { SPECIMENS } from './volume/synthetic.js';
import { SHAPES, outlinePolygon } from './cane/outline.js';
import { LAYOUTS, ALTERNATIONS } from './pattern/tile.js';
import { PRESETS, defaultMapping } from './cane/palette.js';
import { fromSession } from './state.js';

const app = new App();
const views = {
  '3d': new View3D($('#gl'), app),
  slice: new SliceView($('#slice-canvas'), $('#cap-slice'), app),
  cane: new CaneView($('#cane-canvas'), $('#cap-cane'), app),
  pattern: new PatternView($('#pattern-canvas'), $('#cap-pattern'), app),
};
const hist = new Histogram($('#hist'), app);
let current = 'cane';
let split = false;

/* ---------- Status, errors, toast ---------- */

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function showError(msg) {
  const e = $('#error');
  e.textContent = msg;
  e.hidden = !msg;
}
function showNote(msg) {
  const n = $('#source-note');
  n.textContent = msg;
  n.hidden = !msg;
}
function progress(p, label) {
  $('#status').hidden = p === null;
  if (p === null) return;
  $('#status-text').textContent = label || 'Loading';
  $('#progress-bar').style.width = `${Math.round(p * 100)}%`;
}

/* ---------- Views ---------- */

function isVisible(v) { return split || current === v; }

function setView(v) {
  current = v;
  $$('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $$('.view').forEach((s) => s.classList.toggle('active', s.dataset.view === v));
  refreshVisibility();
}

function refreshVisibility() {
  $('#views').classList.toggle('split', split);
  document.body.classList.toggle('is-split', split);
  $('#split-toggle').setAttribute('aria-pressed', String(split));
  for (const [k, view] of Object.entries(views)) {
    const vis = isVisible(k);
    if (k === '3d') view.setVisible(vis);
    else { view.visible = vis; if (vis) view.draw(); }
  }
}

$$('.tabs [role="tab"]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#split-toggle').addEventListener('click', () => { split = !split; refreshVisibility(); });

/* ---------- Controls ---------- */

const sync = bindControls(app);

function segment(sel, attr, get, set) {
  const buttons = $$(`${sel} button`);
  buttons.forEach((b) => b.addEventListener('click', () => { set(b.dataset[attr]); syncAll(); }));
  return () => buttons.forEach((b) => b.setAttribute('aria-checked', String(String(get()) === b.dataset[attr])));
}

const segSyncs = [
  segment('#axis-seg', 'axis', () => app.params.plane.axis, (v) => { app.params.plane.axis = v; app.params.plane.offset = 0; app.changed('plane.axis'); }),
  segment('#slab-seg', 'slab', () => app.params.slab.mode, (v) => { app.params.slab.mode = v; app.changed('slab.mode'); }),
  segment('#levels-seg', 'levels', () => app.params.levels, (v) => { app.params.levels = +v; app.changed('levels'); }),
  segment('#preview-seg', 'preview', () => app.params.pattern.preview, (v) => { app.params.pattern.preview = v; app.changed('pattern.preview'); }),
];

// Outline shape buttons with small line drawings.
const shapeSeg = $('#shape-seg');
for (const s of SHAPES) {
  const pts = outlinePolygon(s.id, 0.6).map(([x, y]) => `${(x * 16 + 9).toFixed(2)},${(9 - y * 16).toFixed(2)}`).join(' ');
  const b = el('button', { 'data-shape': s.id, role: 'radio', title: s.name, 'aria-label': s.name });
  b.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><polygon points="${pts}"/></svg>`;
  shapeSeg.append(b);
}
segSyncs.push(segment('#shape-seg', 'shape', () => app.params.outline.shape, (v) => { app.params.outline.shape = v; app.changed('outline.shape'); }));

$('#pattern-layout').append(...LAYOUTS.map((l) => el('option', { value: l.id, text: l.name })));
$('#pattern-alt').append(...ALTERNATIONS.map((l) => el('option', { value: l.id, text: l.name })));

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
  document.body.classList.toggle('not-loaf', app.params.outline.shape !== 'rectangle');
}

app.on('params', syncAll);

$('#auto-thresholds').addEventListener('click', () => { app.autoThresholds = true; app.changed('levels'); });
$('#invert-mapping').addEventListener('click', () => {
  const m = app.params.mapping;
  app.params.mapping = m.slice().reverse();
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
}

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
}
$('#add-swatch').addEventListener('click', () => {
  const sw = app.params.palette.swatches;
  if (sw.length >= 6) return;
  sw.push({ name: `Clay ${sw.length + 1}`, colour: '#8a7a68', shrinkage: 12 });
  app.changed('palette');
  drawPalette();
});
app.on('palette', drawPalette);
// Edits in the swatch list: refresh the preset list only, so the field being typed in keeps focus.
app.on('palette-light', drawPresets);

/* ---------- Source ---------- */

const specimenList = $('#specimen-list');
for (const s of SPECIMENS) {
  const b = el('button', { 'data-id': s.id }, [el('b', { text: s.name }), el('span', { text: s.description })]);
  b.addEventListener('click', () => loadSynthetic(s.id));
  specimenList.append(el('li', {}, [b]));
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

$('#cancel-load').addEventListener('click', () => cancelLoad());

$('#file-input').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
const drop = $('#drop');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  drop.classList.remove('over');
  handleFiles(e.dataTransfer.files);
});

$('#scale-input').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) app.setScale(v);
});

app.on('source', (s) => {
  $('#specimen-title').textContent = s ? s.name : 'No source';
  $('#specimen-tag').hidden = !(s && s.synthetic);
  $$('#specimen-list button').forEach((b) => b.classList.toggle('on', !!(s && s.synthetic && s.synthetic.id === b.dataset.id)));
  document.body.classList.toggle('no-volume', !s || s.kind !== 'volume');
  document.body.classList.toggle('no-plane', !s || s.kind === 'image');
  $('#empty').hidden = !!s;
  renderFacts($('#source-facts'), app);
  const sf = $('#scale-field');
  const showScale = s && (!s.synthetic) && (s.kind === 'mesh' || !s.unitKnown || s.userScale);
  sf.hidden = !showScale;
  if (showScale) {
    $('#scale-label').textContent = s.kind === 'mesh' ? 'Mesh unit' : s.kind === 'image' ? 'Pixel size' : 'Voxel size';
    $('#scale-input').value = s.kind === 'mesh' ? (s.meshScale || 1) : s.unitKnown ? +(s.kind === 'image' ? s.pixelSize / (s.image.factor || 1) : s.volume.spacing[0] / s.volume.factor[0]).toPrecision(6) : '';
  }
  views['3d'].setSource(s);
});

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
    showNote(r.source ? `Session loaded. Load "${r.source.name}" again to restore the slice. Its data is not stored in the session.` : 'Session loaded.');
    // Show the session on the current source now, and apply it again to the next file loaded.
    pendingSession = r.source ? structuredClone(r.params) : null;
    pendingScale = r.source && r.source.scale ? r.source.scale : null;
    if (app.source) app.invalidate('slice');
  }
  syncAll();
  toast('Session loaded.');
}

$('#session-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { applySession(JSON.parse(await f.text())); } catch { showError('The session file is not valid JSON.'); }
});

/* ---------- Export menu ---------- */

const menu = $('#export-menu');
const toggleMenu = (open = menu.hidden) => {
  menu.hidden = !open;
  $('#export-toggle').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('button').focus();
};
$('#export-toggle').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false); });
async function doExport(kind) {
  toggleMenu(false);
  try {
    const msg = await runExport(kind, app, { pickSession: () => $('#session-input').click(), ground: () => views.pattern.ground() });
    if (msg) toast(msg);
  } catch (err) {
    toast(err.message);
  }
}
$$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));

/* ---------- Overlays ---------- */

const help = $('#help');
$('#help-toggle').addEventListener('click', () => { help.hidden = !help.hidden; });
help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });
$$('[data-close]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.close === 'today') today.close(); else $(`#${b.dataset.close}`).hidden = true;
}));

const today = new Today((pick) => loadSynthetic(pick.id, { plane: pick.plane, crop: pick.crop, levels: pick.spec.levels }), toast);
$('#open-today').addEventListener('click', () => today.open());

installShortcuts({
  escape: () => { if (!help.hidden) help.hidden = true; else if (!menu.hidden) toggleMenu(false); else if (today.isOpen) today.close(); else cancelLoad(); },
  view: (e) => { if (!today.isOpen) setView(['3d', 'slice', 'cane', 'pattern'][+e.key - 1]); },
  offset: (e) => {
    if (today.isOpen || !app.source || app.source.kind === 'image') return;
    const r = app.offsetRange();
    const step = (e.shiftKey ? 10 : 1) * Math.max(r / 100, 1e-3);
    const p = app.params.plane;
    p.offset = Math.max(-r, Math.min(r, p.offset + (e.key === 'ArrowUp' ? step : -step)));
    app.changed('plane.offset');
    syncAll();
  },
  tilt: (e) => {
    if (today.isOpen || !app.source || app.source.kind === 'image') return;
    const p = app.params.plane;
    const k = e.shiftKey ? 'tiltB' : 'tiltA';
    p[k] = Math.max(-80, Math.min(80, p[k] + (e.key === 'ArrowRight' ? 1 : -1)));
    app.changed(`plane.${k}`);
    syncAll();
  },
  bracket: (e) => {
    if (today.isOpen) return;
    const d = e.key === ']' ? 1 : -1;
    if ((current === 'slice' || current === '3d') && app.source && app.source.kind === 'volume') {
      app.params.slab.n = Math.max(1, Math.min(32, app.params.slab.n + d));
      app.changed('slab.n');
    } else {
      const n = Math.max(2, Math.min(6, app.params.levels + d));
      if (n === app.params.levels) return;
      app.params.levels = n;
      app.changed('levels');
    }
    syncAll();
  },
  random: () => { if (today.isOpen) $('#today-random').click(); else randomPlane(); },
  save: () => doExport('session-save'),
  export: () => toggleMenu(true),
  help: () => { help.hidden = !help.hidden; },
  split: () => { split = !split; refreshVisibility(); },
  today: () => { if (!today.isOpen) today.open(); },
});

/* ---------- Pipeline updates ---------- */

app.on('updated', (ran) => {
  const has = (...k) => k.some((x) => ran.has(x));
  if (has('slice')) views.slice.refresh();
  if (has('slice', 'crop') && views['3d'].ok) views['3d'].updatePlane();
  if (has('slice', 'crop') && isVisible('slice')) views.slice.draw();
  if (has('crop', 'quant', 'render')) hist.draw();
  if (has('crop', 'quant', 'clean', 'render')) renderLevels($('#level-list'), app);
  if (has('sheet', 'render')) renderSheet($('#sheet'), app);
  if (has('render', 'sheet') && isVisible('cane')) views.cane.draw();
  if (has('render', 'pattern', 'sheet') && isVisible('pattern')) views.pattern.draw();
  if (has('crop')) segSyncs.forEach((f) => f());
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  refreshVisibility();
  hist.draw();
});

/* ---------- Start ---------- */

drawPalette();
syncAll();
setView('cane');
document.body.classList.add('no-volume', 'not-loaf');
$('#empty').hidden = false;
const start = new URLSearchParams(location.search).get('specimen');
loadSynthetic(SPECIMENS.some((s) => s.id === start) ? start : 'osteon');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for automated checks and the browser console.
window.lamina = { app, setView, loadSynthetic, today };
