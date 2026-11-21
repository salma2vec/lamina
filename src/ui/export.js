/** Exports: SVG, PNG, printable build sheet and session files. */
import { download, slug, fx } from './dom.js';
import { localDateString } from '../daily.js';
import { caneSVG } from '../sheet/svg.js';
import { printSheetHTML } from '../sheet/print.js';
import { renderCane } from '../cane/render.js';
import { toSession } from '../state.js';
import { drawTiles } from './view-pattern.js';
import { outlineHeight, outlinePolygon } from '../cane/outline.js';

function ready(app) {
  if (!app.source || !app.d.labels || !app.d.sheet) throw new Error('Load a source first.');
}

function title(app) { return app.source ? app.source.name : 'Cane'; }

function svgFor(app, standalone, key = true) {
  const p = app.params;
  return caneSVG({
    labels: app.d.labels, G: app.G, levels: p.levels, colours: app.colours(),
    shape: p.outline.shape, aspect: p.outline.aspect, size: p.cane.size,
    sheet: app.d.sheet, title: `${title(app)}, cane cross-section`, standalone, key,
  });
}

/** Specimen and slice metadata rows for the build sheet. */
export function metadata(app) {
  const s = app.source, p = app.params;
  const rows = [{ label: 'Source', value: `${s.name}${s.synthetic ? ' (synthetic study volume)' : ''}` }];
  if (s.kind !== 'image') {
    rows.push({ label: 'Plane', value: `${p.plane.axis.toUpperCase()}, offset ${fx(p.plane.offset, 2)} ${app.unit}, tilt A ${fx(p.plane.tiltA, 1)}°, tilt B ${fx(p.plane.tiltB, 1)}°` });
    if (s.kind === 'volume') rows.push({ label: 'Slab', value: `${p.slab.n} voxel${p.slab.n > 1 ? 's' : ''}, ${p.slab.mode === 'max' ? 'maximum' : 'average'}` });
  }
  rows.push({ label: 'Section', value: `zoom ${fx(p.outline.zoom, 2)}, rotation ${fx(p.outline.rotation, 0)}°, offset ${fx(p.outline.ox, 1)}, ${fx(p.outline.oy, 1)} ${app.unit}` });
  rows.push({ label: 'Levels', value: `${p.levels}; thresholds ${p.thresholds.map((t) => t.toFixed(3)).join(', ')}` });
  rows.push({ label: 'Clean-up', value: `majority ${p.clean.median} px, open/close ${p.clean.openClose} px, smooth ${p.clean.smooth} px, minimum feature ${fx(p.clean.minFeature, 1)} mm` });
  rows.push({ label: 'Date', value: localDateString() });
  return rows;
}

const toBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be created.'))), 'image/png'));

/**
 * Run an export action.
 * @param {string} kind
 * @param {import('./app.js').App} app
 * @param {Object} ctx { patternCanvas, pickSession }
 */
export async function runExport(kind, app, ctx) {
  const base = slug(title(app));
  if (kind === 'session-load') { ctx.pickSession(); return null; }
  if (kind === 'session-save') {
    const src = app.source ? { kind: app.source.kind, name: app.source.name, synthetic: app.source.synthetic } : null;
    const json = JSON.stringify(toSession(app.params, src), null, 2);
    download(new Blob([json], { type: 'application/json' }), `${base}-session.json`);
    return 'Session saved.';
  }
  ready(app);
  if (kind === 'svg') {
    const { svg } = svgFor(app, true);
    download(new Blob([svg], { type: 'image/svg+xml' }), `${base}-cane-1to1.svg`);
    return 'SVG saved at 1:1 scale.';
  }
  if (kind === 'png-cane') {
    const img = renderCane(app.d.labels, app.G, app.G, app.colours(), { scale: 4 });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    download(await toBlob(c), `${base}-cane.png`);
    return 'Cane PNG saved.';
  }
  if (kind === 'png-pattern') {
    const p = app.params;
    const c = document.createElement('canvas');
    c.width = 2400; c.height = 1600;
    const pat = { ...p.pattern };
    drawTiles(c.getContext('2d'), app.caneCanvas, c.width, c.height, pat, outlineHeight(p.outline.shape, p.outline.aspect), ctx.ground(), outlinePolygon(p.outline.shape, p.outline.aspect));
    download(await toBlob(c), `${base}-pattern.png`);
    return 'Pattern PNG saved.';
  }
  if (kind === 'print-a4' || kind === 'print-letter') {
    const size = kind === 'print-a4' ? 'A4' : 'letter';
    document.getElementById('page-size').textContent = `@page { size: ${size}; margin: 12mm; }`;
    // The printed table lists the clays, so the template omits its own key.
    const { svg } = svgFor(app, false, false);
    const sheet = document.getElementById('print-sheet');
    sheet.innerHTML = printSheetHTML({ svg, sheet: app.d.sheet, params: { ...app.params.cane, minFeature: app.params.cane.minReduced }, meta: metadata(app), title: title(app) });
    window.print();
    return null;
  }
  throw new Error(`Unknown export "${kind}".`);
}
