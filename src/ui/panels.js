/** Panel contents: clay levels, palettes, clay editor, build sheet, source facts, clay chips. */
import { el, fx } from './dom.js';
import { icon } from './icons.js';
import { PRESETS } from '../cane/palette.js';
import { drawThinnest } from './flat.js';
import { assembly } from './export.js';

const chip = (colour, cls = 'chip') => {
  const c = el('span', { class: cls });
  c.style.background = colour;
  return c;
};

/** Level rows, lightest section values first: clay choice and area share. */
export function renderLevels(root, app) {
  const p = app.params;
  const sw = p.palette.swatches;
  const counts = app.d.counts || [];
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const t = [0, ...p.thresholds, 1];
  root.replaceChildren();
  for (let l = p.levels - 1; l >= 0; l--) {
    const cur = sw[p.mapping[l]] || sw[0];
    // A template's levels are its parts, not ranges of section values.
    const range = t.length === p.levels + 1 ? `values ${t[l].toFixed(2)}–${t[l + 1].toFixed(2)}` : null;
    const sel = el('select', {
      'aria-label': `Clay for level ${l + 1}${range ? `, ${range}` : ''}`,
      title: `Level ${l + 1}${range ? `: ${range}` : ''}`,
      onchange: (e) => { p.mapping[l] = +e.target.value; app.changed('mapping'); },
    }, sw.map((s, i) => el('option', { value: i, text: s.name, selected: p.mapping[l] === i })));
    root.append(el('li', {}, [chip(cur.colour), sel, el('span', { class: 'num', text: `${fx(((counts[l] || 0) / total) * 100, 1)}%` })]));
  }
}

/**
 * Palette presets as a radio list with colour chips and full names.
 * @param {HTMLElement} root
 * @param {import('./app.js').App} app
 * @param {Object[]|null} custom last custom swatches, offered while a preset is shown
 * @param {(id:string) => void} onPick
 */
export function renderPresets(root, app, custom, onPick) {
  const pal = app.params.palette;
  const items = Object.entries(PRESETS).map(([id, v]) => ({ id, name: v.name, swatches: v.swatches }));
  if (!PRESETS[pal.preset]) items.push({ id: 'custom', name: 'Custom', swatches: pal.swatches });
  else if (custom) items.push({ id: 'custom', name: 'Custom', swatches: custom });
  root.replaceChildren(...items.map((it) => {
    const chips = el('span', { class: 'chips-s', 'aria-hidden': 'true' }, it.swatches.map((s) => chip(s.colour, 'chip-s')));
    const on = pal.preset === it.id || (it.id === 'custom' && !PRESETS[pal.preset]);
    const b = el('button', { role: 'radio', 'aria-checked': String(on), 'data-preset': it.id }, [chips, el('span', { class: 'pname', text: it.name })]);
    b.addEventListener('click', () => onPick(it.id));
    return b;
  }));
}

/** Clay editor: colour, name and shrinkage of each clay. */
export function renderSwatches(list, addBtn, app) {
  const pal = app.params.palette;
  list.replaceChildren();
  pal.swatches.forEach((s, i) => {
    const colour = el('input', { type: 'color', value: s.colour, 'aria-label': `Colour of ${s.name}` });
    colour.addEventListener('input', () => { s.colour = colour.value; app.changed('palette'); app.emit('palette-light'); });
    const name = el('input', { type: 'text', value: s.name, 'aria-label': 'Clay name', maxlength: 40, title: s.name });
    name.addEventListener('input', () => { s.name = name.value || `Clay ${i + 1}`; name.title = s.name; app.changed('palette'); app.emit('palette-light'); });
    const shrink = el('input', { type: 'number', value: s.shrinkage, min: 0, max: 30, step: 0.1, 'aria-label': `Shrinkage of ${s.name}, percent` });
    shrink.addEventListener('input', () => {
      const v = parseFloat(shrink.value);
      if (Number.isFinite(v) && v >= 0 && v <= 30) { s.shrinkage = v; app.changed('palette'); app.emit('palette-light'); }
    });
    shrink.addEventListener('change', () => { shrink.value = s.shrinkage; });
    const rm = el('button', { class: 'rm', title: 'Remove clay', 'aria-label': `Remove ${s.name}`, disabled: pal.swatches.length <= 2 });
    rm.innerHTML = icon('close');
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

/** Fired size as one value, or a range when the clays shrink differently. */
export function firedRange(s) {
  return Math.abs(s.firedMax - s.firedMin) < 0.005 ? fx(s.firedMin, 2) : `${fx(s.firedMin, 2)}–${fx(s.firedMax, 2)}`;
}

/** Build sheet: a small cane with the thinnest region marked, the numbers, and warnings. */
export function renderSheet(root, app) {
  const s = app.d.sheet;
  root.replaceChildren();
  if (!s) return;
  const p = app.params.cane;
  const thumb = el('canvas', { width: 192, height: 192, 'aria-hidden': 'true' });
  const ctx = thumb.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(app.caneCanvas, 0, 0, 192, 192);
  drawThinnest(ctx, app, 0, 0, 192, false);
  root.append(el('div', { class: 'thumb-row' }, [thumb, el('div', {}, [
    el('div', { class: 'big', text: `${fx(s.smallestReduced, 2)} mm` }),
    el('div', { class: 'cap', text: 'thinnest region, reduced' }),
  ])]));
  const row = (k, v) => el('tr', {}, [el('th', { text: k }), el('td', { text: v })]);
  root.append(el('table', { class: 'figures' }, [
    row('Reduction', `${fx(s.ratio, 2)} : 1`),
    row('Length reduced', `${fx(s.reducedLength, 0)} mm`),
    row('Thinnest, build', `${fx(s.smallestBuild, 2)} mm`),
    row('Thinnest, fired', `${fx(s.smallestFired, 2)} mm`),
    row('Fired size', `${firedRange(s)} mm`),
  ]));
  const head = el('thead', {}, [el('tr', {}, [el('th', { text: 'Clay' }), el('td', { text: 'Area' }), el('td', { text: 'Wet g' })])]);
  const body = el('tbody', {}, s.clays.map((c) => el('tr', {}, [
    el('th', { title: c.name }, [chip(c.colour, 'sw'), c.name]),
    el('td', { text: `${fx(c.fraction * 100, 1)}%` }),
    el('td', { text: fx(c.mass, 0) }),
  ])));
  body.append(el('tr', { class: 'total' }, [el('th', { text: `Total, ${fx(p.waste, 0)}% waste` }), el('td', { text: '' }), el('td', { text: fx(s.totalMass, 0) })]));
  root.append(el('table', { class: 'figures clays' }, [head, body]));
  for (const w of warnings(app)) root.append(w);
  const a = assembly(app);
  if (a) {
    const items = a.parts.map((q) => el('li', { title: q.clay || 'Mixed clays' }, [
      el('span', { class: 'n' }, [q.colour ? chip(q.colour, 'sw') : '', q.name]),
      el('span', { class: 'q', text: q.qty ? `${q.qty} ×` : '' }),
      el('span', { class: 's', text: q.size }),
    ]));
    root.append(el('div', { class: 'assembly' }, [
      el('h3', { text: 'Parts' }),
      el('ul', { class: 'parts' }, items),
      el('h3', { text: 'Steps' }),
      el('ol', { class: 'steps' }, a.steps.map((t) => el('li', { text: t }))),
    ]));
  }
}

/** Warnings about the build, as paragraphs. */
export function warnings(app) {
  const s = app.d.sheet, p = app.params.cane;
  const out = [];
  if (!s) return out;
  if (s.clays.length === 1 && app.params.levels > 1) {
    out.push(el('p', { class: 'warn', text: `Only one clay is left after clean-up: the structure is finer than the ${fx(app.params.clean.minFeature, 1)} mm minimum feature. Zoom in on the section, or lower the minimum feature.` }));
  }
  if (s.ratio <= 1) {
    out.push(el('p', { class: 'warn', text: `"Reduce to" is ${fx(p.target, 1)} mm, which is not smaller than the ${fx(p.size, 1)} mm cane. Set a smaller reduced size.` }));
  }
  if (s.featureWarn) {
    const fix = app.source && app.source.kind === 'template'
      ? 'Make the thinnest parts thicker, use a larger cane, or reduce less.'
      : `Set the minimum feature to at least ${fx(Math.ceil(s.minBuildFeature * 10) / 10, 1)} mm, or reduce less.`;
    out.push(el('p', { class: 'warn', text: `The thinnest region is ${fx(s.smallestReduced, 2)} mm after reduction, below ${fx(p.minReduced, 1)} mm. ${fix}` }));
  }
  if (s.compat.warn) {
    const w = el('p', { class: 'warn' }, [`Shrinkage differs by ${fx(s.compat.spread, 1)} percentage points between these clays. The cane can crack in drying or firing. Test the combination first. `]);
    w.append(el('a', { href: 'docs/CERAMICS.md#3-clay-compatibility', target: '_blank', rel: 'noopener', text: 'Clay compatibility' }), '.');
    out.push(w);
  }
  return out;
}

/** Source facts list. */
export function renderFacts(root, app) {
  const s = app.source;
  root.replaceChildren();
  if (!s) return;
  const add = (k, v) => root.append(el('dt', { text: k }), el('dd', { text: v, title: v }));
  add('Name', s.name);
  if (s.kind === 'template') {
    add('Type', 'Cane template');
    add('Clays', String(s.template.clays.length));
    return;
  }
  if (s.kind === 'volume') {
    const v = s.volume;
    add('Type', s.synthetic ? 'Synthetic study volume' : 'Volume');
    if (v.sourceDims && v.factor.some((f) => f > 1)) add('Source', v.sourceDims.join(' × '));
    add('Voxels', v.dims.join(' × '));
    add('Voxel size', v.spacingKnown ? v.spacing.map((x) => fx(x, 3)).join(' × ') + ' mm' : 'unknown');
  } else if (s.kind === 'mesh') {
    add('Type', 'Mesh');
    add('Triangles', s.mesh.triangles.toLocaleString('en'));
    add('Size', s.size.map((x) => fx(x, 1)).join(' × ') + ' mm');
  } else {
    const im = s.image;
    add('Type', 'Image');
    if (im.factor > 1.001) add('Source', `${im.sourceW} × ${im.sourceH}`);
    add('Pixels', `${im.w} × ${im.h}`);
    if (s.unitKnown) add('Pixel size', `${fx(s.pixelSize / (im.factor || 1), 4)} mm`);
  }
}

/**
 * The clay chips under the scene: one per level, darkest section values first.
 * @param {HTMLElement} root
 * @param {import('./app.js').App} app
 * @param {{open:(anchor:HTMLElement)=>void, step:(d:number)=>void}} on
 */
export function renderChips(root, app, on) {
  const p = app.params, sw = p.palette.swatches;
  const counts = app.d.counts || [];
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  // A template has a fixed number of clays.
  const fixed = app.source && app.source.kind === 'template';
  const minus = el('button', { class: 'step', title: 'Fewer clays ([)', 'aria-label': 'Fewer clays', disabled: p.levels <= 2 });
  minus.innerHTML = icon('minus');
  minus.addEventListener('click', () => on.step(-1));
  const plus = el('button', { class: 'step', title: 'More clays (])', 'aria-label': 'More clays', disabled: p.levels >= 6 });
  plus.innerHTML = icon('plus');
  plus.addEventListener('click', () => on.step(1));
  const chips = [];
  for (let l = 0; l < p.levels; l++) {
    const s = sw[p.mapping[l]] || sw[0];
    const label = `${s.name}, ${fx(((counts[l] || 0) / total) * 100, 1)}%`;
    const b = el('button', { class: 'chip-btn', title: label, 'aria-label': `${label}. Open clays.` }, [chip(s.colour)]);
    b.addEventListener('click', () => on.open(root));
    chips.push(b);
  }
  if (fixed) root.replaceChildren(...chips);
  else root.replaceChildren(minus, ...chips, plus);
}
