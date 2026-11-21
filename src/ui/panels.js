/** Right- and left-rail panels: level list, palette editor, build sheet, source facts. */
import { el, fx } from './dom.js';
import { PRESETS } from '../cane/palette.js';

/** Level rows: clay assignment and area share per level. */
export function renderLevels(root, app) {
  const p = app.params;
  const sw = p.palette.swatches;
  const counts = app.d.counts || [];
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const t = [0, ...p.thresholds, 1];
  root.replaceChildren();
  for (let l = p.levels - 1; l >= 0; l--) {
    const sel = el('select', { 'aria-label': `Clay for level ${l + 1}`, onchange: (e) => { p.mapping[l] = +e.target.value; app.changed('mapping'); } },
      sw.map((s, i) => el('option', { value: i, text: s.name, selected: p.mapping[l] === i })));
    const chip = el('span', { class: 'chip' });
    chip.style.background = (sw[p.mapping[l]] || sw[0]).colour;
    const label = el('div', {}, [el('span', { class: 'lvl mono', text: `${l + 1} · ${t[l].toFixed(2)}–${t[l + 1].toFixed(2)}` }), sel]);
    root.append(el('li', {}, [chip, label, el('span', { class: 'num', text: `${fx(((counts[l] || 0) / total) * 100, 1)}%` })]));
  }
}

/** Palette preset selector and swatch editor. */
export function renderPalette(presetSel, list, addBtn, app) {
  const pal = app.params.palette;
  presetSel.replaceChildren(
    ...Object.entries(PRESETS).map(([k, v]) => el('option', { value: k, text: v.name, selected: pal.preset === k })),
    el('option', { value: 'custom', text: 'Custom', selected: !PRESETS[pal.preset] }),
  );
  list.replaceChildren();
  pal.swatches.forEach((s, i) => {
    const colour = el('input', { type: 'color', value: s.colour, 'aria-label': `Colour of ${s.name}` });
    colour.addEventListener('input', () => { s.colour = colour.value; app.changed('palette'); app.emit('palette-light'); });
    const name = el('input', { type: 'text', value: s.name, 'aria-label': 'Clay name', maxlength: 40 });
    name.addEventListener('input', () => { s.name = name.value || `Clay ${i + 1}`; app.changed('palette'); app.emit('palette-light'); });
    const shrink = el('input', { type: 'number', value: s.shrinkage, min: 0, max: 30, step: 0.1, 'aria-label': `Shrinkage of ${s.name}, percent` });
    shrink.addEventListener('input', () => { const v = parseFloat(shrink.value); if (Number.isFinite(v)) { s.shrinkage = v; app.changed('palette'); app.emit('palette-light'); } });
    const rm = el('button', { class: 'rm', title: 'Remove clay', 'aria-label': `Remove ${s.name}`, text: '×', disabled: pal.swatches.length <= 2 });
    rm.addEventListener('click', () => {
      pal.swatches.splice(i, 1);
      app.params.mapping = app.params.mapping.map((m) => (m === i ? Math.max(0, i - 1) : m > i ? m - 1 : m));
      app.changed('palette');
      app.emit('palette');
    });
    list.append(el('li', {}, [colour, name, el('span', { class: 'shrink' }, [shrink, el('span', { text: '%' })]), rm]));
  });
  addBtn.disabled = pal.swatches.length >= 6;
}

/** Build sheet numbers and warnings. */
export function renderSheet(root, app) {
  const s = app.d.sheet;
  root.replaceChildren();
  if (!s) return;
  const p = app.params.cane;
  const row = (k, v) => el('tr', {}, [el('th', { text: k }), el('td', { text: v })]);
  root.append(el('table', {}, [
    row('Reduction ratio', `${fx(s.ratio, 2)} : 1`),
    row('Length after reduction', `${fx(s.reducedLength, 0)} mm`),
    row('Thinnest region, build', `${fx(s.smallestBuild, 2)} mm`),
    row('Thinnest region, reduced', `${fx(s.smallestReduced, 2)} mm`),
    row('Thinnest region, fired', `${fx(s.smallestFired, 2)} mm`),
    row('Fired size', `${fx(s.firedMin, 2)}–${fx(s.firedMax, 2)} mm`),
  ]));
  const head = el('thead', {}, [el('tr', {}, [el('th', { text: 'Clay' }), el('td', { text: 'area' }), el('td', { text: 'wet g' })])]);
  const body = el('tbody', {}, s.clays.map((c) => {
    const sw = el('span', { class: 'sw' });
    sw.style.background = c.colour;
    return el('tr', {}, [el('th', {}, [sw, c.name]), el('td', { text: `${fx(c.fraction * 100, 1)}%` }), el('td', { text: fx(c.mass, 0) })]);
  }));
  body.append(el('tr', { class: 'total' }, [el('th', { text: `Total, with ${fx(p.waste, 0)}% waste` }), el('td', { text: '' }), el('td', { text: fx(s.totalMass, 0) })]));
  root.append(el('table', { class: 'clays' }, [head, body]));
  if (s.featureWarn) {
    root.append(el('p', { class: 'warn', text: `The thinnest region is ${fx(s.smallestReduced, 2)} mm after reduction. This is below ${fx(p.minReduced, 1)} mm. Increase the minimum feature or reduce less.` }));
  }
  if (s.compat.warn) {
    const w = el('p', { class: 'warn' }, [`Shrinkage differs by ${fx(s.compat.spread, 1)} percentage points between these clays. The cane can crack in drying or firing. Test the combination first. `]);
    w.append(el('a', { href: 'docs/CERAMICS.md#3-clay-compatibility', target: '_blank', rel: 'noopener', text: 'Clay compatibility' }), '.');
    root.append(w);
  }
}

/** Source facts list. */
export function renderFacts(root, app) {
  const s = app.source;
  root.replaceChildren();
  if (!s) return;
  const add = (k, v) => root.append(el('dt', { text: k }), el('dd', { text: v, title: v }));
  add('Name', s.name);
  if (s.kind === 'volume') {
    const v = s.volume;
    add('Type', s.synthetic ? 'Synthetic volume' : 'Volume');
    if (v.sourceDims && v.factor.some((f) => f > 1)) add('Source', v.sourceDims.join(' × '));
    add('Voxels', v.dims.join(' × '));
    add('Voxel size', v.spacingKnown ? v.spacing.map((x) => fx(x, 3)).join(' × ') + ' mm' : 'unknown');
  } else if (s.kind === 'mesh') {
    add('Type', 'Mesh');
    add('Triangles', s.mesh.triangles.toLocaleString('en'));
    add('Size', s.size.map((x) => fx(x, 1)).join(' × ') + ' mm');
  } else {
    add('Type', 'Image');
    add('Pixels', `${s.image.w} × ${s.image.h}`);
  }
}
