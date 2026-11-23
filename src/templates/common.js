/** Shared helpers for constructed cane templates. Pure; no DOM. */
import { OUTSIDE, removeThinRegions } from '../cane/morph.js';
import { insideOutline } from '../cane/outline.js';

/**
 * Rasterise a label function over the cane outline on a G x G grid.
 * Each pixel takes the majority label of an s x s set of sub-samples, which
 * keeps thin walls continuous without blurring clay boundaries.
 * @param {(x:number, y:number) => number} labelAt label for a point in unit coordinates (y up)
 * @param {{G:number, shape:string, aspect:number, levels:number, samples?:number}} o
 * @returns {Uint8Array}
 */
export function rasterise(labelAt, o) {
  const { G, shape, aspect, levels } = o;
  const s = o.samples ?? 3;
  const out = new Uint8Array(G * G);
  const votes = new Uint8Array(levels);
  for (let j = 0; j < G; j++) {
    const yc = 0.5 - (j + 0.5) / G;
    for (let i = 0; i < G; i++) {
      const xc = (i + 0.5) / G - 0.5;
      if (!insideOutline(shape, xc, yc, aspect)) { out[j * G + i] = OUTSIDE; continue; }
      votes.fill(0);
      for (let b = 0; b < s; b++) for (let a = 0; a < s; a++) {
        const x = xc + ((a + 0.5) / s - 0.5) / G;
        const y = yc - ((b + 0.5) / s - 0.5) / G;
        votes[labelAt(x, y)]++;
      }
      let best = 0;
      for (let l = 1; l < levels; l++) if (votes[l] > votes[best]) best = l;
      out[j * G + i] = best;
    }
  }
  return out;
}

/**
 * Merge regions narrower than the thinnest sheet in the design into their
 * neighbours. Rasterising curved walls leaves one-pixel slivers where walls
 * meet; nobody can build those, so they should not set the thinnest region.
 * @param {Uint8Array} labels
 * @param {number} G grid size
 * @param {number} sheetMm thinnest sheet the design calls for
 * @param {number} sizeMm cane width D
 */
export function dropSlivers(labels, G, sheetMm, sizeMm) {
  const px = Math.max(2, 0.8 * (sheetMm / sizeMm) * G);
  return removeThinRegions(labels, G, G, px);
}

/** Deterministic hash of two integers to [0, 1). */
export function hash01(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Default values for a template's parameter list. */
export function defaultValues(template) {
  const v = {};
  for (const p of template.params) v[p.key] = p.default;
  return v;
}

/** Clamp a value set to a template's parameter ranges and choices. */
export function cleanValues(template, values = {}) {
  const v = {};
  for (const p of template.params) {
    const x = values[p.key];
    if (p.type === 'choice') v[p.key] = p.options.some((o) => o.id === x) ? x : p.default;
    else v[p.key] = typeof x === 'number' && Number.isFinite(x) ? Math.min(p.max, Math.max(p.min, x)) : p.default;
  }
  return v;
}

/** Round to one decimal for assembly text. */
export const mm = (x) => `${(Math.round(x * 10) / 10).toFixed(1)} mm`;
