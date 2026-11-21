/**
 * Deterministic synthetic study volumes. Each generator is procedural and
 * seeded; none is derived from a real specimen. Values are 8-bit.
 */

/** Specimen catalogue: id, display name, one-line description, default plane and crop. */
export const SPECIMENS = [
  {
    id: 'osteon',
    name: 'Osteon bone',
    description: 'Cortical bone. Packed Haversian systems with concentric lamellae, central canals and cement lines.',
    plane: { axis: 'xy', offset: 0, tiltA: 0, tiltB: 0 },
    crop: { zoom: 1.9, rotation: 0, ox: 0, oy: 0 },
    levels: 3,
  },
  {
    id: 'ammonite',
    name: 'Ammonite',
    description: 'Log-spiral shell. Chambers divided by frilled septa; the body chamber is filled with sediment.',
    plane: { axis: 'xy', offset: 2, tiltA: 0, tiltB: 0 },
    crop: { zoom: 1.04, rotation: 0, ox: 0, oy: 0 },
    levels: 3,
  },
  {
    id: 'stromatolite',
    name: 'Stromatolite',
    description: 'Microbial mat growth. Stacked domed laminae in branching columns, with sediment between.',
    plane: { axis: 'xz', offset: 0, tiltA: 0, tiltB: 0 },
    crop: { zoom: 1.25, rotation: 0, ox: 0, oy: -6 },
    levels: 3,
  },
  {
    id: 'wood',
    name: 'Petrified wood',
    description: 'Silicified conifer stem. Radial files of cells, growth rings and rays.',
    plane: { axis: 'xy', offset: 0, tiltA: 0, tiltB: 0 },
    crop: { zoom: 2, rotation: 0, ox: 12, oy: 10 },
    levels: 3,
  },
  {
    id: 'frond',
    name: 'Rangeomorph frond',
    description: 'Ediacaran frond. Self-similar fractal branching, preserved in fine sediment.',
    plane: { axis: 'xz', offset: 0, tiltA: 0, tiltB: 0 },
    crop: { zoom: 1.05, rotation: 0, ox: 0, oy: 0 },
    levels: 3,
  },
];

/** Seeded PRNG (mulberry32). Returns a function giving floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash to [0,1). */
function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(s, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Seeded 3D value noise in [-1,1], using a permutation table. */
function makeNoise(seed) {
  const rnd = mulberry32(seed * 977 + 13);
  const P = new Uint8Array(512);
  const V = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; V[i] = rnd() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  return (x, y, z) => {
    const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
    const xi = xf & 255, yi = yf & 255, zi = zf & 255;
    const fx = x - xf, fy = y - yf, fz = z - zf;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const a = P[xi] + yi, b = P[xi + 1] + yi;
    const aa = P[a] + zi, ab = P[a + 1] + zi, ba = P[b] + zi, bb = P[b + 1] + zi;
    const x00 = V[P[aa]] + (V[P[ba]] - V[P[aa]]) * ux;
    const x10 = V[P[ab]] + (V[P[bb]] - V[P[ab]]) * ux;
    const x01 = V[P[aa + 1]] + (V[P[ba + 1]] - V[P[aa + 1]]) * ux;
    const x11 = V[P[ab + 1]] + (V[P[bb + 1]] - V[P[ab + 1]]) * ux;
    const y0 = x00 + (x10 - x00) * uy;
    return y0 + (x01 + (x11 - x01) * uy - y0) * uz;
  };
}

function makeFbm(seed, octaves = 4) {
  const n = makeNoise(seed);
  return (x, y, z) => {
    let s = 0, a = 0.5, f = 1;
    for (let o = 0; o < octaves; o++) { s += a * n(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
    return s;
  };
}

const hyp = (a, b) => Math.sqrt(a * a + b * b);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/**
 * Generate a synthetic volume.
 * @param {string} id specimen id
 * @param {number} [size] edge length in voxels
 * @param {number} [seed]
 * @param {(p:number)=>void} [onProgress]
 * @returns {{dims:number[], spacing:number[], spacingKnown:boolean, data:Uint8Array, scale:number}}
 */
export function generate(id, size = 128, seed = 1, onProgress) {
  const gen = GENERATORS[id];
  if (!gen) throw new Error(`Unknown synthetic specimen "${id}".`);
  const N = size;
  const data = new Uint8Array(N * N * N);
  const field = gen(seed, N);
  for (let k = 0; k < N; k++) {
    const z = ((k + 0.5) / N) * 2 - 1;
    const slice = field.slice ? field.slice(z) : null;
    for (let j = 0; j < N; j++) {
      const y = ((j + 0.5) / N) * 2 - 1;
      for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N) * 2 - 1;
        let v = field.at(x, y, z, slice);
        v += 0.05 * (hash3(i, j, k, seed) - 0.5);
        data[i + j * N + k * N * N] = clamp01(v) * 255;
      }
    }
    if (onProgress && (k & 3) === 0) onProgress(k / N);
  }
  return { dims: [N, N, N], spacing: [1, 1, 1], spacingKnown: false, data, scale: 1 / 255 };
}

const GENERATORS = {
  osteon(seed) {
    const rnd = mulberry32(seed * 101 + 1);
    const fbm = makeFbm(seed + 11, 3);
    const lac = makeNoise(seed + 23);
    const os = [];
    // Poisson-disk-like dart throwing over a margin-extended square.
    for (let tries = 0; tries < 6000 && os.length < 220; tries++) {
      const x = rnd() * 2.6 - 1.3, y = rnd() * 2.6 - 1.3;
      const R = 0.13 + rnd() * 0.08;
      if (os.some((o) => hyp(o.x - x, o.y - y) < (o.R + R) * 0.72)) continue;
      os.push({
        x, y, R,
        rc: R * (0.16 + rnd() * 0.12),
        lam: 3 + Math.floor(rnd() * 3),
        dx: (rnd() - 0.5) * 0.18, dy: (rnd() - 0.5) * 0.18,
        ph: rnd() * 6.28, order: rnd(),
      });
    }
    os.sort((a, b) => a.order - b.order);
    const volk = Array.from({ length: 2 }, () => ({
      y: rnd() * 1.6 - 0.8, z: rnd() * 1.6 - 0.8, a: (rnd() - 0.5) * 1.2,
    }));
    const theta = rnd() * Math.PI;
    const CELL = 0.4, GN = 10, G0 = 2;
    return {
      slice(z) {
        const grid = Array.from({ length: GN * GN }, () => []);
        const cs = os.map((o, idx) => {
          const cx = o.x + o.dx * z + 0.02 * Math.sin(z * 3 + o.ph);
          const cy = o.y + o.dy * z + 0.02 * Math.cos(z * 2.5 + o.ph);
          const gx = Math.floor(cx / CELL) + G0, gy = Math.floor(cy / CELL) + G0;
          if (gx >= 0 && gy >= 0 && gx < GN && gy < GN) grid[gy * GN + gx].push(idx);
          return { cx, cy };
        });
        return { grid, cs };
      },
      at(x, y, z, s) {
        let best = -1, br = 0;
        const gx = Math.floor(x / CELL) + G0, gy = Math.floor(y / CELL) + G0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const xx = gx + a, yy = gy + b;
          if (xx < 0 || yy < 0 || xx >= GN || yy >= GN) continue;
          const l = s.grid[yy * GN + xx];
          for (const idx of l) {
            if (idx < best) continue;
            const o = os[idx];
            const ddx = x - s.cs[idx].cx, ddy = y - s.cs[idx].cy;
            const r2 = ddx * ddx + ddy * ddy;
            if (r2 < o.R * o.R) { best = idx; br = Math.sqrt(r2); }
          }
        }
        let v;
        const dots = lac(x * 24, y * 24, z * 10);
        if (best >= 0) {
          const o = os[best];
          if (br < o.rc) v = 0.07 + 0.04 * fbm(x * 9, y * 9, z * 9);
          else if (o.R - br < 0.018) v = 0.3;
          else {
            const ph = (br - o.rc) / ((o.R - o.rc) / o.lam);
            v = 0.66 + 0.11 * Math.cos(ph * 2 * Math.PI) + 0.04 * fbm(x * 6, y * 6, z * 3);
            if (dots > 0.62 && Math.abs(Math.cos(ph * Math.PI)) > 0.6) v -= 0.3;
          }
        } else {
          const t = (x * Math.cos(theta) + y * Math.sin(theta)) + 0.25 * fbm(x * 2, y * 2, z * 2);
          v = 0.58 + 0.1 * Math.cos((t / 0.07) * 2 * Math.PI) + 0.05 * fbm(x * 5, y * 5, z * 5);
          if (dots > 0.66) v -= 0.28;
        }
        for (const c of volk) {
          const yy = c.y + c.a * x;
          if (hyp(y - yy, z - c.z) < 0.018) { v = 0.08; break; }
        }
        return v;
      },
    };
  },

  ammonite(seed) {
    const rnd = mulberry32(seed * 131 + 7);
    const fbm = makeFbm(seed + 31, 4);
    const crys = makeNoise(seed + 41);
    const W = 2.25 + rnd() * 0.2;
    const b = Math.log(W) / (2 * Math.PI);
    const c = ((W - 1) / (W + 1)) * 0.97;
    const thMax = 4.3 * 2 * Math.PI;
    const rOut = 0.64;
    const a = rOut / Math.exp(b * thMax);
    const thMin = 0.6 * 2 * Math.PI;
    const zs = 0.82;
    const body = 1.3 * Math.PI;
    const nSept = 11 + Math.floor(rnd() * 3);
    const dTh = (2 * Math.PI) / nSept;
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    const fold = (psi) => (
      0.55 * Math.sin(5 * psi + ph[0]) + 0.25 * Math.sin(11 * psi + ph[1]) +
      0.13 * Math.sin(23 * psi + ph[2]) + 0.07 * Math.sin(47 * psi + ph[3])
    );
    return {
      at(x, y, z) {
        const rho = hyp(x, y);
        const phi = Math.atan2(y, x);
        let v = 0.22 + 0.07 * fbm(x * 3, y * 3, z * 3);
        for (let k = 0; k < 7; k++) {
          const th = phi + Math.PI + 2 * Math.PI * k;
          if (th < thMin || th > thMax) continue;
          const r = a * Math.exp(b * th);
          const w = c * r;
          const dr = rho - r;
          const dz = z / zs;
          const q = hyp(dr, dz) / w;
          if (q >= 1) continue;
          const t = Math.max(0.006, 0.075 * w);
          const psi = Math.atan2(dz, dr);
          if (q > 1 - t / w) return 0.9 + 0.04 * fbm(x * 20, y * 20, z * 20);
          // Siphuncle near the venter.
          if (hyp(dr - 0.78 * w, dz) < 0.07 * w) return 0.42;
          if (th > thMax - body) {
            return 0.36 + 0.09 * fbm(x * 7, y * 7, z * 7);
          }
          const curve = 0.22 * (dr / w) * (dr / w) - 0.12 * (dr / w);
          const sPos = (thMax - body - th + dTh * (curve + 0.3 * fold(psi) * q ** 3)) / dTh;
          const dist = Math.abs(sPos - Math.round(sPos)) * dTh * r;
          if (dist < Math.max(0.004, 0.035 * w)) return 0.86;
          const cr = crys(x * 30, y * 30, z * 30);
          return 0.56 + 0.08 * cr + 0.04 * fbm(x * 9, y * 9, z * 9);
        }
        return v;
      },
    };
  },

  stromatolite(seed) {
    const rnd = mulberry32(seed * 151 + 3);
    const fbm = makeFbm(seed + 51, 3);
    const fine = makeNoise(seed + 52);
    const base = -0.62;
    const cols = [];
    // Root columns rise from the basal mat; some branch into two.
    const grow = (x, y, z0, s, dx, dy, depth) => {
      const top = Math.min(0.92, z0 + 0.45 + rnd() * 0.8);
      const split = depth < 2 && rnd() < 0.6 ? z0 + (top - z0) * (0.35 + rnd() * 0.3) : Infinity;
      const z1 = Math.min(top, split);
      cols.push({ x, y, z0, z1, s, dx, dy, cap: split === Infinity });
      if (split !== Infinity) {
        const ex = x + dx * (z1 - z0), ey = y + dy * (z1 - z0);
        for (const side of [-1, 1]) {
          const a = rnd() * Math.PI * 2;
          grow(ex + side * Math.cos(a) * s * 0.35, ey + side * Math.sin(a) * s * 0.35, z1, s * 0.78, dx + side * Math.cos(a) * 0.35, dy + side * Math.sin(a) * 0.35, depth + 1);
        }
      }
    };
    // Roots on a jittered lattice so every section crosses several columns.
    for (let gy = -2; gy <= 2; gy++) for (let gx = -2; gx <= 2; gx++) {
      const x = gx * 0.42 + (gy & 1) * 0.21 + (rnd() - 0.5) * 0.12;
      const y = gy * 0.4 + (rnd() - 0.5) * 0.12;
      grow(x, y, base, 0.15 + rnd() * 0.06, (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.25, 0);
    }
    return {
      slice(z) {
        return cols.map((c) => {
          if (z < c.z0 - 0.02 || z > c.z1 + 0.15) return null;
          const t = z - c.z0;
          // Rounded cap: the column narrows above its top.
          const over = Math.max(0, z - c.z1);
          const r = c.cap ? c.s * Math.sqrt(Math.max(0, 1 - (over / 0.15) ** 2)) : (z > c.z1 ? 0 : c.s);
          if (r <= 0.005) return null;
          return { x: c.x + c.dx * t, y: c.y + c.dy * t, r };
        }).filter(Boolean);
      },
      at(x, y, z, act) {
        let col = z < base ? 1 : 0;
        for (const c of act) {
          const d = hyp(x - c.x, y - c.y) / c.r;
          if (d < 1.4) col = Math.max(col, 1 - smooth(0.8, 1.15, d));
        }
        // Laminae follow a dome height field over the columns.
        let dome = 0;
        for (const c of act) {
          const d2 = ((x - c.x) ** 2 + (y - c.y) ** 2) / (c.r * c.r);
          if (d2 < 4) dome = Math.max(dome, Math.exp(-d2 * 1.3) * c.r * 0.9);
        }
        const m = col;
        const sediment = m < 1 ? 0.3 + 0.1 * fbm(x * 8, y * 8, z * 8) : 0;
        if (m <= 0) return sediment;
        const T = z - dome + 0.03 * fbm(x * 3, y * 3, z * 1.5);
        const lam = Math.sin((T / 0.07) * 2 * Math.PI) + 0.45 * Math.sin((T / 0.033) * 2 * Math.PI + 1.7);
        const laminae = 0.56 + 0.22 * Math.tanh(lam * 1.6) + 0.04 * fine(x * 10, y * 10, z * 16);
        return sediment * (1 - m) + laminae * m;
      },
    };
  },

  wood(seed) {
    const rnd = mulberry32(seed * 171 + 5);
    const fbm = makeFbm(seed + 61, 3);
    const cx = -0.6, cy = -0.5;
    const rings = [0.08];
    while (rings[rings.length - 1] < 3) rings.push(rings[rings.length - 1] + 0.3 + rnd() * 0.16);
    const tang = 0.068;
    const files = rings.map((r, i) => Math.round((2 * Math.PI * ((r + (rings[i + 1] || r + 0.3)) / 2)) / tang));
    const se = 0.075, sl = 0.032;
    // Cumulative radial cell count inside a ring, as a 64-step table.
    const lut = new Float32Array(65);
    for (let i = 1; i <= 64; i++) {
      const t = (i - 0.5) / 64;
      lut[i] = lut[i - 1] + 1 / 64 / (se + (sl - se) * t ** 2.5);
    }
    return {
      at(x, y, z) {
        const dx = x - cx, dy = y - cy;
        const r = hyp(dx, dy) + 0.02 * fbm(x * 1.5, y * 1.5, z * 0.4);
        const phi = Math.atan2(dy, dx) + 0.05 * z + Math.PI;
        if (r < 0.08) return 0.45 + 0.08 * fbm(x * 20, y * 20, z * 4);
        let ri = 0;
        while (ri < rings.length - 2 && rings[ri + 1] <= r) ri++;
        const w = rings[ri + 1] - rings[ri];
        const t = (r - rings[ri]) / w;
        const li = Math.min(63, Math.floor(t * 64));
        const u = (lut[li] + (lut[li + 1] - lut[li]) * (t * 64 - li)) * w;
        const ft = (phi / (2 * Math.PI)) * files[ri];
        const file = Math.floor(ft);
        const fu = u - Math.floor(u);
        const fv = ft - file;
        const late = t ** 2.5;
        const isRay = hash3(file, ri, 0, seed) < 0.12 && hash3(file, Math.floor((z + 1) / 0.12), 1, seed) < 0.7;
        const wall = 0.14 + 0.2 * late;
        if (t > 0.985) return 0.9;
        if (isRay) {
          const ru = u * 0.4 - Math.floor(u * 0.4);
          return fv < 0.16 || fv > 0.84 || ru < 0.1 ? 0.84 : 0.6 + 0.04 * fbm(x * 9, y * 9, z * 9);
        }
        if (fu < wall || fv < wall * 0.8) return 0.84 + 0.03 * fbm(x * 9, y * 9, z * 2);
        const fill = hash3(file, Math.floor(u), ri, seed + 9) < 0.06;
        return (fill ? 0.56 : 0.15 + 0.1 * late) + 0.04 * fbm(x * 12, y * 12, z * 3);
      },
    };
  },

  frond(seed, N) {
    const rnd = mulberry32(seed * 191 + 9);
    const fbm = makeFbm(seed + 71, 3);
    const fine = makeNoise(seed + 72);
    const R = 256;
    const M = new Float32Array(R * R);
    const toPx = (p) => ((p + 1) / 2) * R;
    const stamp = (x0, z0, x1, z1, rad, val) => {
      const ax = toPx(x0), az = toPx(z0), bx = toPx(x1), bz = toPx(z1), rp = (rad / 2) * R + 0.6;
      const minx = Math.max(0, Math.floor(Math.min(ax, bx) - rp - 1)), maxx = Math.min(R - 1, Math.ceil(Math.max(ax, bx) + rp + 1));
      const minz = Math.max(0, Math.floor(Math.min(az, bz) - rp - 1)), maxz = Math.min(R - 1, Math.ceil(Math.max(az, bz) + rp + 1));
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-9;
      for (let j = minz; j <= maxz; j++) for (let i = minx; i <= maxx; i++) {
        const px = i + 0.5, pz = j + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / L2));
        const d = hyp(px - (ax + ex * t), pz - (az + ez * t));
        const cov = clamp01(rp - d + 0.5) * val;
        if (cov > M[j * R + i]) M[j * R + i] = cov;
      }
    };
    const branch = (x, z, ang, len, wid, depth) => {
      const segs = 10;
      const n = depth === 0 ? 16 : depth === 1 ? 9 : 0;
      let px = x, pz = z;
      const bend = (rnd() - 0.5) * 0.25;
      const pts = [];
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const a = ang + bend * t;
        const nx = x + Math.cos(a) * len * t, nz = z + Math.sin(a) * len * t;
        stamp(px, pz, nx, nz, wid * (1 - 0.55 * t), [1, 0.78, 0.6][depth]);
        pts.push([nx, nz, a]);
        px = nx; pz = nz;
      }
      if (depth >= 2) return;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.7) / (n + 0.4);
        const k = Math.min(segs - 1, Math.floor(t * segs));
        const [bx, bz, a] = pts[k];
        const side = i % 2 ? 1 : -1;
        const envelope = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7);
        const sub = len * (depth === 0 ? 0.36 : 0.42) * envelope;
        if (sub * R < 3) continue;
        branch(bx, bz, a + side * (0.9 + 0.12 * rnd()), sub, wid * 0.55, depth + 1);
      }
    };
    branch(0.02, -0.9, Math.PI / 2, 1.72, 0.05, 0);
    // Light blur for soft tissue edges.
    const B = new Float32Array(R * R);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      let s = 0, c = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < R && jj < R) { s += M[jj * R + ii]; c++; }
      }
      B[j * R + i] = s / c;
    }
    const sample = (x, z) => {
      const i = Math.min(R - 1, Math.max(0, Math.floor(((x + 1) / 2) * R)));
      const j = Math.min(R - 1, Math.max(0, Math.floor(((z + 1) / 2) * R)));
      return B[j * R + i];
    };
    void N;
    return {
      at(x, y, z) {
        const m = sample(x, z);
        const ys = 0.1 * x * x - 0.04 + 0.03 * fine(x * 1.5, 0, z * 1.5);
        const half = 0.03 + 0.12 * Math.sqrt(m);
        if (m > 0.05 && Math.abs(y - ys) < half) return 0.3 + 0.55 * m + 0.04 * fine(x * 18, y * 18, z * 18);
        return 0.24 + 0.07 * fbm(x * 6, y * 6, z * 6) + 0.035 * Math.sin(y * 70 + 3 * fine(x * 2, y * 2, z * 2));
      },
    };
  },
};
