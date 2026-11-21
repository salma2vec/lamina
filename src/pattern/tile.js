/** Tile layouts for nerikomi slices. Pure geometry; drawing is done by the UI. */
import { mulberry32 } from '../volume/synthetic.js';

export const LAYOUTS = [
  { id: 'grid', name: 'Grid' },
  { id: 'brick', name: 'Brick' },
  { id: 'hex', name: 'Hex pack' },
  { id: 'mirror', name: 'Four-way mirror' },
  { id: 'radial', name: 'Radial' },
];

export const ALTERNATIONS = [
  { id: 'none', name: 'None' },
  { id: 'rot90', name: 'Rotate 90° checker' },
  { id: 'rot180', name: 'Rotate 180° checker' },
  { id: 'quad', name: 'Rotate 90° per tile' },
];

/**
 * Size of the axis-aligned box around a tile after stretch.
 * @param {number} tw tile width
 * @param {number} th tile height
 * @param {number} stretch elongation factor (area preserving)
 * @param {number} angle stretch axis in degrees
 * @param {number[][]} [poly] tile outline in unit coordinates (width 1); gives a tighter box
 */
export function stretchedBox(tw, th, stretch, angle, poly) {
  const a = (angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const sx = stretch, sy = 1 / stretch;
  // M = R(a) S R(-a)
  const m00 = c * c * sx + s * s * sy, m01 = c * s * (sx - sy), m11 = s * s * sx + c * c * sy;
  const m = [m00, m01, m01, m11];
  if (poly && poly.length) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of poly) {
      const x = px * tw, y = py * tw;
      const X = m00 * x + m01 * y, Y = m01 * x + m11 * y;
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
    return { w: x1 - x0, h: y1 - y0, m };
  }
  return { w: Math.abs(m00) * tw + Math.abs(m01) * th, h: Math.abs(m01) * tw + Math.abs(m11) * th, m };
}

/**
 * Compute tile placements covering a width x height area.
 * Each tile: centre (x,y), rotation (rad), flipX/flipY, and the shared
 * stretch matrix m = [a,b,c,d] applied after rotation and flip.
 * @param {Object} o
 * @param {string} o.layout
 * @param {number} o.width
 * @param {number} o.height
 * @param {number} o.tileW
 * @param {number} o.tileH
 * @param {number} [o.gap] fraction of tile size
 * @param {number} [o.stretch]
 * @param {number} [o.stretchAngle]
 * @param {string} [o.alternate]
 * @param {number} [o.jitter] 0..1
 * @param {number} [o.seed]
 * @param {number[][]} [o.poly] tile outline in unit coordinates
 */
export function layoutTiles(o) {
  const stretch = o.stretch || 1;
  const box = stretchedBox(o.tileW, o.tileH, stretch, o.stretchAngle || 0, o.poly);
  const gap = o.gap || 0;
  const cw = box.w * (1 + gap), ch = box.h * (1 + gap);
  const rnd = mulberry32(o.seed || 1);
  const tiles = [];
  const alt = (i, j) => {
    switch (o.alternate) {
      case 'rot90': return ((i + j) & 1) * (Math.PI / 2);
      case 'rot180': return ((i + j) & 1) * Math.PI;
      case 'quad': return (((i & 1) + (j & 1) * 2) % 4) * (Math.PI / 2);
      default: return 0;
    }
  };
  const push = (x, y, rot, i, j, fx = false, fy = false) => {
    const jit = o.jitter || 0;
    tiles.push({
      x: x + (rnd() - 0.5) * jit * 0.18 * cw,
      y: y + (rnd() - 0.5) * jit * 0.18 * ch,
      rot: rot + alt(i, j) + (rnd() - 0.5) * jit * 0.16,
      flipX: fx, flipY: fy, m: box.m,
    });
  };
  const cx = o.width / 2, cy = o.height / 2;
  if (o.layout === 'radial') {
    const R = Math.min(o.width, o.height) / 2;
    const step = Math.max(cw, ch);
    push(cx, cy, 0, 0, 0);
    for (let k = 1; k * step - step / 2 < R; k++) {
      const r = k * step;
      const count = Math.max(6, Math.floor((2 * Math.PI * r) / cw));
      for (let q = 0; q < count; q++) {
        const a = (q / count) * 2 * Math.PI + (k & 1 ? Math.PI / count : 0);
        push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, a + Math.PI / 2, q, k);
      }
    }
    return { tiles, cell: { w: cw, h: ch } };
  }
  const hex = o.layout === 'hex';
  const rowH = hex ? ch * 0.866 : ch;
  const nx = Math.ceil(o.width / cw / 2) + 2, ny = Math.ceil(o.height / rowH / 2) + 2;
  for (let j = -ny; j <= ny; j++) {
    const shift = (o.layout === 'brick' || hex) && (j & 1) ? cw / 2 : 0;
    for (let i = -nx; i <= nx; i++) {
      const x = cx + i * cw + shift, y = cy + j * rowH;
      if (o.layout === 'mirror') push(x, y, 0, i, j, (i & 1) === 1, (j & 1) === 1);
      else push(x, y, 0, i, j);
    }
  }
  return { tiles, cell: { w: cw, h: rowH } };
}
