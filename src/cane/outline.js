/**
 * Cane outline shapes. Shapes live in a unit box [-0.5,0.5]^2 whose width is
 * the cane size D. The rectangle (loaf) has height = aspect * D.
 */

export const SHAPES = [
  { id: 'circle', name: 'Circle' },
  { id: 'square', name: 'Square' },
  { id: 'hexagon', name: 'Hexagon' },
  { id: 'triangle', name: 'Triangle' },
  { id: 'rectangle', name: 'Loaf' },
];

const S3 = Math.sqrt(3);

/**
 * Outline polygon in unit coordinates (y up).
 * @param {string} shape
 * @param {number} [aspect] loaf height / width
 * @returns {number[][]}
 */
export function outlinePolygon(shape, aspect = 0.6) {
  switch (shape) {
    case 'square': return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    case 'rectangle': return [[-0.5, -aspect / 2], [0.5, -aspect / 2], [0.5, aspect / 2], [-0.5, aspect / 2]];
    case 'hexagon': {
      // Corners at left and right; width D across corners.
      const p = [];
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; p.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]); }
      return p;
    }
    case 'triangle': {
      // Equilateral, base width D, centred on its bounding box.
      const h = S3 / 2;
      return [[-0.5, -h / 2], [0.5, -h / 2], [0, h / 2]];
    }
    default: {
      const p = [];
      for (let i = 0; i < 128; i++) { const a = (i / 128) * 2 * Math.PI; p.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]); }
      return p;
    }
  }
}

/**
 * Height of the shape's bounding box as a fraction of D.
 * @param {string} shape
 * @param {number} [aspect]
 */
export function outlineHeight(shape, aspect = 0.6) {
  if (shape === 'rectangle') return aspect;
  if (shape === 'hexagon' || shape === 'triangle') return S3 / 2;
  return 1;
}

/**
 * Cross-section area in mm^2 for cane size D (mm).
 * @param {string} shape
 * @param {number} D
 * @param {number} [aspect]
 */
export function outlineArea(shape, D, aspect = 0.6) {
  switch (shape) {
    case 'square': return D * D;
    case 'rectangle': return D * D * aspect;
    case 'hexagon': return ((3 * S3) / 8) * D * D;
    case 'triangle': return (S3 / 4) * D * D;
    default: return (Math.PI / 4) * D * D;
  }
}

/**
 * Point-in-shape test in unit coordinates.
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 * @param {number} [aspect]
 */
export function insideOutline(shape, x, y, aspect = 0.6) {
  switch (shape) {
    case 'square': return Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5;
    case 'rectangle': return Math.abs(x) <= 0.5 && Math.abs(y) <= aspect / 2;
    case 'hexagon': {
      const ax = Math.abs(x), ay = Math.abs(y);
      return ay <= (S3 / 4) && S3 * ax + ay <= (S3 / 2);
    }
    case 'triangle': {
      const h = S3 / 2;
      if (y < -h / 2) return false;
      return Math.abs(x) <= (h / 2 - y) / S3;
    }
    default: return x * x + y * y <= 0.25;
  }
}

/**
 * Raster mask of the outline on a G x G grid spanning the unit box.
 * @param {string} shape
 * @param {number} G
 * @param {number} [aspect]
 * @returns {Uint8Array}
 */
export function outlineMask(shape, G, aspect = 0.6) {
  const m = new Uint8Array(G * G);
  for (let j = 0; j < G; j++) {
    const y = 0.5 - (j + 0.5) / G;
    for (let i = 0; i < G; i++) {
      const x = (i + 0.5) / G - 0.5;
      m[j * G + i] = insideOutline(shape, x, y, aspect) ? 1 : 0;
    }
  }
  return m;
}
