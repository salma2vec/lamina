/** Clay palettes: presets, colour helpers and level-to-clay mapping. */

/** Preset palettes. Shrinkage is linear, wet to fired, in percent. */
export const PRESETS = {
  sandalwood: {
    name: 'Porcelain / Sandalwood stoneware / Volcanic black',
    swatches: [
      { name: 'Porcelain', colour: '#efeae0', shrinkage: 13 },
      { name: 'Sandalwood stoneware', colour: '#c9a27a', shrinkage: 12 },
      { name: 'Volcanic black', colour: '#2a2622', shrinkage: 12 },
    ],
  },
  stained: {
    name: 'Stained porcelain',
    swatches: [
      { name: 'Porcelain', colour: '#efeae0', shrinkage: 13 },
      { name: 'Cobalt blue', colour: '#2f4a82', shrinkage: 13 },
      { name: 'Iron red', colour: '#8c3b25', shrinkage: 12.5 },
      { name: 'Chrome green', colour: '#56704a', shrinkage: 13 },
      { name: 'Black stain', colour: '#22201d', shrinkage: 12.5 },
    ],
  },
};

/** @param {string} hex "#rrggbb" */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance 0..1 (sRGB, approximate). */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Default mapping from intensity levels to swatches: the lowest level gets
 * the darkest clay, the highest level the lightest.
 * @param {number} levels
 * @param {{colour:string}[]} swatches
 * @returns {number[]} swatch index per level
 */
export function defaultMapping(levels, swatches) {
  const order = swatches.map((s, i) => [luminance(s.colour), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const P = order.length;
  return Array.from({ length: levels }, (_, i) => {
    if (levels <= P) {
      // Spread across the palette, keeping extremes.
      const k = levels === 1 ? P - 1 : Math.round((i * (P - 1)) / (levels - 1));
      return order[k];
    }
    return order[Math.min(P - 1, Math.floor((i * P) / levels))];
  });
}
