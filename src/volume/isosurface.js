/**
 * Isosurface extraction for volumes (naive surface nets). Pure; no DOM.
 * The volume is padded with zeros, so surfaces that reach the volume edge
 * are closed. Output positions are in physical units, centred like the
 * volume (see volume.js), with normals from the intensity gradient.
 */

/** Corner offsets of a cell: bit 0 = x, bit 1 = y, bit 2 = z. */
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Box-average a volume into a zero-padded float grid, reducing each axis by
 * an integer step so that no side exceeds maxSide.
 * @param {{dims:number[], data:ArrayLike<number>, scale:number}} vol
 * @param {number} maxSide
 * @returns {{grid:Float32Array, m:number[], step:number}}
 */
export function paddedGrid(vol, maxSide = 128) {
  const [nx, ny, nz] = vol.dims;
  const step = Math.max(1, Math.ceil(Math.max(nx, ny, nz) / maxSide));
  const m = [Math.ceil(nx / step), Math.ceil(ny / step), Math.ceil(nz / step)];
  const P = [m[0] + 2, m[1] + 2, m[2] + 2];
  const grid = new Float32Array(P[0] * P[1] * P[2]);
  const cnt = step > 1 ? new Uint16Array(grid.length) : null;
  const d = vol.data, s = vol.scale;
  for (let z = 0; z < nz; z++) {
    const gz = ((z / step) | 0) + 1;
    for (let y = 0; y < ny; y++) {
      const gy = ((y / step) | 0) + 1;
      const row = (gz * P[1] + gy) * P[0] + 1;
      const src = (z * ny + y) * nx;
      if (step === 1) {
        for (let x = 0; x < nx; x++) grid[row + x] = d[src + x] * s;
      } else {
        for (let x = 0; x < nx; x++) { const o = row + ((x / step) | 0); grid[o] += d[src + x] * s; cnt[o]++; }
      }
    }
  }
  if (cnt) for (let i = 0; i < grid.length; i++) if (cnt[i]) grid[i] /= cnt[i];
  return { grid, m, step };
}

/**
 * Two-class Otsu threshold of a volume's values, in 0..1.
 * @param {{data:ArrayLike<number>, scale:number}} vol
 * @param {number} [bins]
 */
export function otsuLevel(vol, bins = 256) {
  const h = new Float64Array(bins);
  const d = vol.data, s = vol.scale;
  const stride = Math.max(1, Math.floor(d.length / 2e6));
  let n = 0;
  for (let i = 0; i < d.length; i += stride) {
    let b = (d[i] * s * bins) | 0;
    if (b >= bins) b = bins - 1; else if (b < 0) b = 0;
    h[b]++; n++;
  }
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * h[i];
  let wB = 0, sB = 0, best = 0, at = bins / 2;
  for (let t = 0; t < bins; t++) {
    wB += h[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sB += t * h[t];
    const mB = sB / wB, mF = (sum - sB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; at = t; }
  }
  return (at + 1) / bins;
}

/**
 * Extract the isosurface at `level`.
 * @param {{dims:number[], spacing:number[], data:ArrayLike<number>, scale:number}} vol
 * @param {number} level iso level in 0..1; voxels above it are solid
 * @param {{maxSide?:number}} [opt] maxSide: largest grid side before downsampling
 * @returns {{positions:Float32Array, normals:Float32Array, indices:Uint32Array, step:number}}
 */
export function isosurface(vol, level, opt = {}) {
  const { grid, m, step } = paddedGrid(vol, opt.maxSide || 128);
  const PX = m[0] + 2, PY = m[1] + 2, PZ = m[2] + 2;
  const sxy = PX * PY;
  const CX = PX - 1, CY = PY - 1, CZ = PZ - 1;
  const vidx = new Int32Array(CX * CY * CZ).fill(-1);
  let pos = new Float32Array(1 << 16), nv = 0;
  const corner = new Float32Array(8);
  const cOff = [0, 1, PX, PX + 1, sxy, sxy + 1, sxy + PX, sxy + PX + 1];

  for (let z = 0; z < CZ; z++) for (let y = 0; y < CY; y++) {
    let g = (z * PY + y) * PX;
    for (let x = 0; x < CX; x++, g++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = grid[g + cOff[c]]; corner[c] = v; if (v > level) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, k = 0;
      for (const [a, b] of EDGES) {
        const ia = (mask >> a) & 1, ib = (mask >> b) & 1;
        if (ia === ib) continue;
        const t = (level - corner[a]) / (corner[b] - corner[a]);
        ax += (a & 1) + ((b & 1) - (a & 1)) * t;
        ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
        k++;
      }
      if (nv * 3 + 3 > pos.length) { const p2 = new Float32Array(pos.length * 2); p2.set(pos); pos = p2; }
      pos[nv * 3] = x + ax / k; pos[nv * 3 + 1] = y + ay / k; pos[nv * 3 + 2] = z + az / k;
      vidx[(z * CY + y) * CX + x] = nv++;
    }
  }

  // Faces: every grid edge with a sign change joins the four cells around it.
  let idx = new Uint32Array(1 << 17), ni = 0;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (ni + 6 > idx.length) { const i2 = new Uint32Array(idx.length * 2); i2.set(idx); idx = i2; }
    if (flip) { idx[ni++] = a; idx[ni++] = d; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
  };
  const cell = (x, y, z) => vidx[(z * CY + y) * CX + x];
  for (let z = 0; z < CZ; z++) for (let y = 0; y < CY; y++) for (let x = 0; x < CX; x++) {
    const g = (z * PY + y) * PX + x;
    const inside = grid[g] > level;
    if (y > 0 && z > 0 && (grid[g + 1] > level) !== inside) {
      quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), !inside);
    }
    if (x > 0 && z > 0 && (grid[g + PX] > level) !== inside) {
      quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), !inside);
    }
    if (x > 0 && y > 0 && (grid[g + sxy] > level) !== inside) {
      quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), !inside);
    }
  }

  // Normals from the trilinear gradient, pointing from solid to empty.
  const sample = (x, y, z) => {
    x = Math.min(PX - 1.001, Math.max(0, x)); y = Math.min(PY - 1.001, Math.max(0, y)); z = Math.min(PZ - 1.001, Math.max(0, z));
    const x0 = x | 0, y0 = y | 0, z0 = z | 0, fx = x - x0, fy = y - y0, fz = z - z0;
    const i = (z0 * PY + y0) * PX + x0;
    const c00 = grid[i] + (grid[i + 1] - grid[i]) * fx;
    const c10 = grid[i + PX] + (grid[i + PX + 1] - grid[i + PX]) * fx;
    const c01 = grid[i + sxy] + (grid[i + sxy + 1] - grid[i + sxy]) * fx;
    const c11 = grid[i + sxy + PX] + (grid[i + sxy + PX + 1] - grid[i + sxy + PX]) * fx;
    const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
    return c0 + (c1 - c0) * fz;
  };
  const [nx, ny, nz] = vol.dims;
  const sp = vol.spacing;
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3);
  const h = 0.5;
  for (let i = 0; i < nv; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    let gx = (sample(px - h, py, pz) - sample(px + h, py, pz)) / sp[0];
    let gy = (sample(px, py - h, pz) - sample(px, py + h, pz)) / sp[1];
    let gz = (sample(px, py, pz - h) - sample(px, py, pz + h)) / sp[2];
    const L = Math.hypot(gx, gy, gz) || 1;
    normals[i * 3] = gx / L; normals[i * 3 + 1] = gy / L; normals[i * 3 + 2] = gz / L;
    // Padded grid index -> source voxel index -> physical position.
    positions[i * 3] = ((px - 1) * step + (step - 1) / 2 - (nx - 1) / 2) * sp[0];
    positions[i * 3 + 1] = ((py - 1) * step + (step - 1) / 2 - (ny - 1) / 2) * sp[1];
    positions[i * 3 + 2] = ((pz - 1) * step + (step - 1) / 2 - (nz - 1) / 2) * sp[2];
  }
  return { positions, normals, indices: idx.slice(0, ni), step };
}
