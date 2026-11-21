/** Build-sheet arithmetic: reduction, clay masses and shrinkage. */
import { outlineArea } from '../cane/outline.js';

/** Linear reduction ratio from build size to reduced size. */
export function reductionRatio(buildSize, reducedSize) {
  return reducedSize > 0 ? buildSize / reducedSize : NaN;
}

/**
 * Wet clay mass in grams.
 * @param {number} areaMm2 cross-section area of this clay
 * @param {number} lengthMm cane length at build
 * @param {number} density wet density, g/cm^3
 * @param {number} wastePct allowance for trimming and loss, percent
 */
export function clayMass(areaMm2, lengthMm, density, wastePct) {
  return ((areaMm2 * lengthMm) / 1000) * density * (1 + wastePct / 100);
}

/** Size after firing for a linear shrinkage in percent. */
export function firedSize(size, shrinkPct) {
  return size * (1 - shrinkPct / 100);
}

/**
 * Shrinkage spread between clays and whether it exceeds the limit.
 * @param {number[]} shrinkages percent values of the clays used
 * @param {number} [limit] percentage points
 */
export function compatibility(shrinkages, limit = 1.5) {
  if (shrinkages.length < 2) return { spread: 0, warn: false };
  const spread = Math.max(...shrinkages) - Math.min(...shrinkages);
  return { spread: Math.round(spread * 100) / 100, warn: spread > limit + 1e-9 };
}

/**
 * Full build sheet.
 * @param {Object} p
 * @param {number[]} p.counts pixel count per level inside the outline
 * @param {number[]} p.mapping swatch index per level
 * @param {{name:string, colour:string, shrinkage:number}[]} p.swatches
 * @param {string} p.shape
 * @param {number} p.aspect
 * @param {number} p.size cane size at build, mm
 * @param {number} p.length cane length at build, mm
 * @param {number} p.target reduced size, mm
 * @param {number} p.density g/cm^3
 * @param {number} p.waste percent
 * @param {number} p.minFeature minimum buildable feature after reduction, mm
 * @param {number|null} p.smallestPx thinnest region width in grid pixels
 * @param {number} p.grid grid pixels across the cane size
 * @param {number} [p.shrinkLimit] percentage points
 */
export function computeSheet(p) {
  const area = outlineArea(p.shape, p.size, p.aspect);
  const total = p.counts.reduce((a, b) => a + b, 0) || 1;
  const byClay = new Map();
  p.counts.forEach((c, level) => {
    const si = p.mapping[level];
    if (si === undefined || !p.swatches[si]) return;
    byClay.set(si, (byClay.get(si) || 0) + c);
  });
  const clays = [...byClay.entries()].filter(([, c]) => c > 0).sort((a, b) => a[0] - b[0]).map(([si, c]) => {
    const sw = p.swatches[si];
    const fraction = c / total;
    const a = fraction * area;
    return {
      index: si,
      name: sw.name,
      colour: sw.colour,
      shrinkage: sw.shrinkage,
      fraction,
      area: a,
      volume: (a * p.length) / 1000,
      mass: clayMass(a, p.length, p.density, p.waste),
      fired: firedSize(p.target, sw.shrinkage),
    };
  });
  const ratio = reductionRatio(p.size, p.target);
  const mmPerPx = p.size / p.grid;
  const smallestBuild = p.smallestPx != null ? p.smallestPx * mmPerPx : null;
  const smallestReduced = smallestBuild != null ? smallestBuild / ratio : null;
  const compat = compatibility(clays.map((c) => c.shrinkage), p.shrinkLimit ?? 1.5);
  const fired = clays.map((c) => c.fired);
  const maxShrink = clays.length ? Math.max(...clays.map((c) => c.shrinkage)) : 0;
  return {
    area,
    clays,
    totalMass: clays.reduce((a, c) => a + c.mass, 0),
    ratio,
    reducedLength: p.length * ratio * ratio,
    smallestBuild,
    smallestReduced,
    smallestFired: smallestReduced != null ? firedSize(smallestReduced, maxShrink) : null,
    featureWarn: smallestReduced != null && smallestReduced < p.minFeature,
    firedMin: fired.length ? Math.min(...fired) : NaN,
    firedMax: fired.length ? Math.max(...fired) : NaN,
    compat,
  };
}
