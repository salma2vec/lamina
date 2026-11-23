/**
 * Ammonite: a polished cross-section through a chambered, logarithmic-spiral shell.
 *
 * Geometry, in unit coordinates where the cane is 1 wide (D mm):
 *   the shell wall follows r(θ) = rc · e^(kθ), θ in [0, θmax], θmax = 2π · whorls,
 *   from the protoconch radius rc to the shell radius rs.
 *   Septa divide each whorl into equal angular steps and bow towards the aperture.
 *   The last part of the outer whorl is the body chamber, filled with matrix.
 */
import { rasterise, dropSlivers, hash01, mm } from './common.js';

const MATRIX = 0, WALL = 1, LINING = 2, FILL_A = 3, FILL_B = 4, FILL_C = 5;
const TAU = 2 * Math.PI;

export const ammonite = {
  id: 'ammonite',
  name: 'Ammonite',
  summary: 'Chambered logarithmic spiral. Crystal-lined chambers divided by septa, set in rock matrix.',
  outline: { shape: 'circle', aspect: 0.6 },
  clays: [
    { name: 'Matrix stoneware', colour: '#57524b', shrinkage: 12 },
    { name: 'Septa (black)', colour: '#2b2420', shrinkage: 12 },
    { name: 'Lining (porcelain)', colour: '#ece6d8', shrinkage: 13 },
    { name: 'Amber', colour: '#c8873a', shrinkage: 12.5 },
    { name: 'Ochre', colour: '#b98f45', shrinkage: 12.5 },
    { name: 'Translucent porcelain', colour: '#ddd3bf', shrinkage: 13 },
  ],
  params: [
    { key: 'whorls', label: 'Whorls', type: 'range', min: 2, max: 6, step: 0.25, default: 4 },
    { key: 'chambers', label: 'Chambers per whorl', type: 'range', min: 6, max: 18, step: 1, default: 12 },
    { key: 'shell', label: 'Shell size', type: 'range', min: 0.6, max: 0.96, step: 0.01, default: 0.88, unit: '× cane' },
    { key: 'core', label: 'Protoconch', type: 'range', min: 1, max: 8, step: 0.5, default: 4, unit: 'mm' },
    { key: 'wall', label: 'Septa sheet', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1.2, unit: 'mm' },
    { key: 'lining', label: 'Lining sheet', type: 'range', min: 0, max: 2, step: 0.1, default: 0.9, unit: 'mm' },
    { key: 'bend', label: 'Septa curve', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'body', label: 'Body chamber', type: 'range', min: 0, max: 0.75, step: 0.05, default: 0, unit: 'whorl' },
    {
      key: 'fill', label: 'Chamber fill', type: 'choice', default: 'gradient',
      options: [
        { id: 'gradient', name: 'Pale centre to amber rim' },
        { id: 'alternate', name: 'Alternate three clays' },
        { id: 'scatter', name: 'Scattered' },
      ],
    },
    { key: 'seed', label: 'Variation', type: 'range', min: 1, max: 99, step: 1, default: 7 },
  ],

  /**
   * @param {Object} v parameter values
   * @param {{G:number, size:number, shape:string, aspect:number}} ctx size = cane width D in mm
   */
  generate(v, ctx) {
    const D = ctx.size;
    const rs = 0.5 * v.shell;
    const rc = Math.min(rs * 0.5, v.core / 2 / D);
    const thetaMax = TAU * v.whorls;
    const k = Math.log(rs / rc) / thetaMax;
    const w = v.wall / D;
    const lin = v.lining / D;
    const step = TAU / v.chambers;
    const bodyStart = thetaMax - v.body * TAU;
    const fills = [FILL_A, FILL_B, FILL_C];
    // First angle where a chamber is deeper than two walls; inner turns are solid septa clay.
    const grow = 1 - Math.exp(-TAU * k);
    const thetaFirst = Math.max(0, Math.log((2 * w) / (rc * grow)) / k);
    const span = Math.max(1e-6, Math.min(bodyStart, thetaMax) - thetaFirst);

    const fillFor = (c, thetaMid) => {
      if (v.fill === 'alternate') return fills[((c % 3) + 3) % 3];
      if (v.fill === 'scatter') return fills[Math.floor(hash01(c, v.seed) * 3)];
      const p = (thetaMid - thetaFirst) / span + (hash01(c, v.seed) - 0.5) * 0.2;
      return p < 0.4 ? FILL_C : p < 0.72 ? FILL_B : FILL_A;
    };

    const labelAt = (x, y) => {
      const r = Math.hypot(x, y);
      if (r <= rc) return WALL;
      if (r > rs + w / 2) return MATRIX;
      let phi = Math.atan2(y, x);
      if (phi < 0) phi += TAU;
      const s = Math.log(r / rc) / k;
      const n = Math.floor((s - phi) / TAU) + 1;
      const tOut = phi + TAU * n;
      const tIn = tOut - TAU;
      const rOut = rc * Math.exp(k * tOut);
      const rIn = tIn >= 0 ? rc * Math.exp(k * tIn) : rc;
      if (tOut > thetaMax) {
        // Beyond the aperture: only the outer face of the previous turn is shell.
        return r - rIn < w / 2 ? WALL : MATRIX;
      }
      const dIn = r - rIn, dOut = rOut - r;
      if (dIn < w / 2 || dOut < w / 2) return WALL;
      if (tOut > bodyStart) return MATRIX;
      const u = dIn / (rOut - rIn);
      const tEff = tOut - v.bend * step * 0.6 * Math.sin(Math.PI * u);
      const q = tEff / step;
      const arc = Math.abs(q - Math.round(q)) * step * r;
      if (arc < w / 2) return WALL;
      if (lin > 0 && Math.min(dIn, dOut, arc) - w / 2 < lin) return LINING;
      const c = Math.floor(q);
      return fillFor(c, (c + 0.5) * step);
    };

    const raw = rasterise(labelAt, { G: ctx.G, shape: ctx.shape, aspect: ctx.aspect, levels: 6 });
    const labels = dropSlivers(raw, ctx.G, v.lining > 0 ? Math.min(v.wall, v.lining) : v.wall, D);

    // Assembly plan at build size.
    const groups = [];
    let wedges = 0;
    const firstC = 0, lastC = Math.floor(bodyStart / step);
    for (let c = firstC; c < lastC; c++) {
      const tm = (c + 0.5) * step;
      const rOut = rc * Math.exp(k * tm);
      const rIn = tm - TAU >= 0 ? rc * Math.exp(k * (tm - TAU)) : rc;
      const height = (rOut - rIn) * D - v.wall;
      const length = ((rOut + rIn) / 2) * step * D - v.wall;
      if (height < 1 || length < 1) continue;
      const whorl = Math.floor(tm / TAU) + 1;
      let g = groups.find((x) => x.whorl === whorl);
      if (!g) groups.push((g = { whorl, count: 0, minL: Infinity, maxL: 0, minH: Infinity, maxH: 0 }));
      g.count++; wedges++;
      g.minL = Math.min(g.minL, length); g.maxL = Math.max(g.maxL, length);
      g.minH = Math.min(g.minH, height); g.maxH = Math.max(g.maxH, height);
    }
    const matrixT = (0.5 - rs) * D;
    const parts = [
      { name: 'Protoconch coil', clay: WALL, size: `${mm(2 * rc * D)} across` },
      ...groups.map((g) => ({
        name: `Chamber wedges, whorl ${g.whorl}`,
        clay: null,
        qty: g.count,
        size: `${mm(g.minL)}–${mm(g.maxL)} long, ${mm(g.minH)}–${mm(g.maxH)} deep`,
      })),
      ...(v.lining > 0 ? [{ name: 'Lining sheet', clay: LINING, size: `${mm(v.lining)} thick` }] : []),
      { name: 'Septa sheet', clay: WALL, size: `${mm(v.wall)} thick` },
      { name: 'Matrix wrap', clay: MATRIX, size: `${mm(matrixT)} thick` },
    ];
    const steps = [
      `Roll ${wedges} tapered wedge canes in the three chamber clays, using the sizes in the parts list. Make each wedge slightly longer than the finished cane.`,
      v.lining > 0
        ? `Wrap each wedge in a ${mm(v.lining)} lining sheet, then in a ${mm(v.wall)} septa sheet. The lining becomes the pale crystal rim inside each chamber.`
        : `Wrap each wedge in a ${mm(v.wall)} septa sheet. Each sheet becomes a chamber wall.`,
      `Roll a ${mm(2 * rc * D)} coil of septa clay for the protoconch.`,
      'Lay the wedges around the coil from smallest to largest, wide end outwards, each one pressed against the last. Keep the seam between turns tight; trapped air opens into gaps during reduction.',
      v.body > 0
        ? `Finish the last ${Math.round(v.body * 100)}% of the outer turn with a matrix-clay wedge wrapped in septa sheet. This is the body chamber.`
        : 'Close the spiral with the largest wedge.',
      `Wrap the spiral in a ${mm(matrixT)} matrix sheet to reach a ${mm(D)} cane. The matrix supports the spiral while you reduce it.`,
      'Rest the cane until all clays are the same leather-soft state, then reduce from the middle outwards.',
    ];
    return { labels, levels: 6, assembly: { parts, steps, wedges } };
  },
};
