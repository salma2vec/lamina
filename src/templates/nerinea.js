/**
 * Nerinea: a polished lengthwise section through a high-spired nerineid gastropod.
 *
 * The coiling axis runs across the cane. A solid columella sits on the axis.
 * Whorl cavities stack along both sides, offset by half a whorl, sloping with
 * the sutures, and narrowing towards the apex. Internal folds (plaits) push
 * into each cavity from the columella (columellar), the suture above
 * (parietal) and the outer wall (palatal). Each cavity holds sediment below
 * a flat geopetal surface, with sparry calcite above.
 */
import { rasterise, dropSlivers, mm } from './common.js';

const MATRIX = 0, WALL = 1, CALCITE = 2, SEDIMENT = 3;

export const nerinea = {
  id: 'nerinea',
  name: 'Nerinea',
  summary: 'Lengthwise section of a high-spired gastropod. Folded whorl chambers on both sides of the columella.',
  outline: { shape: 'rectangle', aspect: 0.5 },
  clays: [
    { name: 'Limestone matrix', colour: '#bdb2a0', shrinkage: 12 },
    { name: 'Shell wall', colour: '#3a2f28', shrinkage: 12 },
    { name: 'Calcite (porcelain)', colour: '#f0e9dc', shrinkage: 13 },
    { name: 'Sediment', colour: '#8b6b4c', shrinkage: 12 },
  ],
  params: [
    { key: 'whorls', label: 'Whorls shown', type: 'range', min: 3, max: 12, step: 1, default: 5 },
    { key: 'height', label: 'Shell height', type: 'range', min: 0.5, max: 0.98, step: 0.01, default: 0.9, unit: '× cane' },
    { key: 'taper', label: 'Taper to apex', type: 'range', min: 0, max: 0.7, step: 0.05, default: 0.35 },
    { key: 'slope', label: 'Suture slope', type: 'range', min: 0, max: 0.8, step: 0.05, default: 0.5 },
    { key: 'columella', label: 'Columella', type: 'range', min: 1, max: 8, step: 0.5, default: 2.5, unit: 'mm' },
    { key: 'wall', label: 'Wall sheet', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1.4, unit: 'mm' },
    {
      key: 'plaits', label: 'Plaits', type: 'choice', default: 'three',
      options: [
        { id: 'none', name: 'None' },
        { id: 'columellar', name: 'Columellar' },
        { id: 'two', name: 'Columellar + parietal' },
        { id: 'three', name: 'All three' },
      ],
    },
    { key: 'depth', label: 'Plait depth', type: 'range', min: 0.1, max: 0.6, step: 0.05, default: 0.4 },
    { key: 'sediment', label: 'Sediment fill', type: 'range', min: 0, max: 0.9, step: 0.05, default: 0.35 },
  ],

  /**
   * @param {Object} v parameter values
   * @param {{G:number, size:number, shape:string, aspect:number}} ctx size = cane width D in mm
   */
  generate(v, ctx) {
    const D = ctx.size;
    const halfH = (ctx.shape === 'rectangle' ? ctx.aspect : ctx.shape === 'hexagon' || ctx.shape === 'triangle' ? Math.sqrt(3) / 2 : 1) / 2;
    const H0 = halfH * v.height;
    const c = v.columella / D / 2;
    const w = v.wall / D;
    const L = 1 / v.whorls;
    const plaits = { none: 0, columellar: 1, two: 2, three: 3 }[v.plaits];
    const shellH = (x) => Math.max(c + 2 * w, H0 * (1 - v.taper * (x + 0.5)));

    // Distance from point p to segment ab, all in unit coordinates.
    const seg = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - ax - t * dx, py - ay - t * dy);
    };
    // A plait is a stem of wall clay ending in a rounded club.
    const plait = (px, py, ax, ay, bx, by) =>
      seg(px, py, ax, ay, bx, by) < w * 0.45 || Math.hypot(px - bx, py - by) < w * 0.85;

    const labelAt = (x, y) => {
      const Hs = shellH(x);
      const ay = Math.abs(y);
      if (ay > Hs) return MATRIX;
      if (ay < c) return WALL;
      const side = y >= 0 ? 1 : -1;
      const A = Hs - c;
      const q = (ay - c) / A;
      const p = (x + 0.5 + (side < 0 ? L / 2 : 0) + v.slope * q * L) / L;
      const b = (p - Math.floor(p)) * L;
      const a = q * A;
      // Cavity: a box inset by half a wall on each side, with rounded corners.
      const r0 = Math.min(A, L) * 0.38;
      const x0 = w / 2, x1 = A - w / 2, y0 = w / 2, y1 = L - w / 2;
      if (x1 - x0 < 2 * w || y1 - y0 < 2 * w) return WALL;
      const qx = Math.max(x0 + r0 - a, 0, a - (x1 - r0));
      const qy = Math.max(y0 + r0 - b, 0, b - (y1 - r0));
      if (Math.hypot(qx, qy) > r0) return WALL;
      const d = v.depth;
      if (plaits >= 1 && plait(a, b, x0, L * 0.55, x0 + d * (x1 - x0), L * 0.55 - d * 0.35 * (y1 - y0))) return WALL;
      if (plaits >= 2 && plait(a, b, x0 + 0.3 * (x1 - x0), y1, x0 + (0.3 + d * 0.35) * (x1 - x0), y1 - d * 0.9 * (y1 - y0))) return WALL;
      if (plaits >= 3 && plait(a, b, x1, L * 0.45, x1 - d * 0.6 * (x1 - x0), L * 0.45 + d * 0.2 * (y1 - y0))) return WALL;
      // Geopetal fill: sediment settles to the low side of each cavity in the rock.
      const lo = side > 0 ? c : -Hs;
      const hi = side > 0 ? Hs : -c;
      return (y - lo) / (hi - lo) < v.sediment ? SEDIMENT : CALCITE;
    };

    const labels = dropSlivers(rasterise(labelAt, { G: ctx.G, shape: ctx.shape, aspect: ctx.aspect, levels: 4 }), ctx.G, v.wall, D);

    const baseH = (shellH(-0.5) - c) * D - v.wall;
    const apexH = (shellH(0.5) - c) * D - v.wall;
    const blockL = L * D - v.wall;
    const perSide = Math.ceil(v.whorls) + 1;
    const plaitNames = ['columellar', 'parietal', 'palatal'].slice(0, plaits);
    const parts = [
      { name: 'Columella strip', clay: WALL, size: `${mm(v.columella)} thick` },
      { name: 'Whorl blocks', clay: null, qty: perSide * 2, size: `${mm(blockL)} long, ${mm(apexH)}–${mm(baseH)} deep` },
      ...(plaits ? [{ name: 'Plait rolls', clay: WALL, qty: perSide * 2 * plaits, size: `${mm(v.depth * Math.max(apexH, 1))}–${mm(v.depth * baseH)} across` }] : []),
      { name: 'Wall sheet', clay: WALL, size: `${mm(v.wall)} thick` },
      { name: 'Matrix packing', clay: MATRIX, size: 'to fill above and below the shell' },
    ];
    const steps = [
      `Make ${perSide * 2} whorl blocks, ${mm(blockL)} long, tapering in depth from ${mm(baseH)} at the base end to ${mm(apexH)} at the apex end. Build each from a sediment layer (${Math.round(v.sediment * 100)}% of its depth) under calcite clay.`,
      plaits
        ? `Press ${plaitNames.join(', ')} plait rolls of wall clay into each block at the fold positions shown on the template. Smooth them in so no air is trapped.`
        : 'Leave the block faces plain.',
      `Wrap each block in a ${mm(v.wall)} wall sheet.`,
      `Lay a ${mm(v.columella)} columella strip along the middle of the loaf.`,
      'Stack the blocks along one side of the columella, sediment towards the columella. Stack the other side with sediment towards the outer wall, offset by half a block. Lean every block to the suture slope.',
      'Pack matrix clay above and below the shell, then square the loaf to the template.',
      'Reduce by pressing and rolling along the length. A loaf distorts at the corners first; trim the ends before slicing.',
    ];
    return { labels, levels: 4, assembly: { parts, steps } };
  },
};
