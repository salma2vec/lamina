/** Trilinear sampling and oblique slab resampling of volumes. */

/**
 * Trilinear sample at continuous voxel-index coordinates. Outside returns 0.
 * @param {{dims:number[], data:ArrayLike<number>, scale:number}} vol
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number} value in 0..1
 */
export function trilinear(vol, x, y, z) {
  const [nx, ny, nz] = vol.dims;
  if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) return 0;
  const x0 = Math.min(x | 0, nx - 2 < 0 ? 0 : nx - 2), y0 = Math.min(y | 0, ny - 2 < 0 ? 0 : ny - 2), z0 = Math.min(z | 0, nz - 2 < 0 ? 0 : nz - 2);
  const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1), z1 = Math.min(z0 + 1, nz - 1);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const d = vol.data, sx = 1, sy = nx, sz = nx * ny;
  const i000 = x0 * sx + y0 * sy + z0 * sz;
  const c00 = d[i000] * (1 - fx) + d[x1 * sx + y0 * sy + z0 * sz] * fx;
  const c10 = d[x0 * sx + y1 * sy + z0 * sz] * (1 - fx) + d[x1 * sx + y1 * sy + z0 * sz] * fx;
  const c01 = d[x0 * sx + y0 * sy + z1 * sz] * (1 - fx) + d[x1 * sx + y0 * sy + z1 * sz] * fx;
  const c11 = d[x0 * sx + y1 * sy + z1 * sz] * (1 - fx) + d[x1 * sx + y1 * sy + z1 * sz] * fx;
  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  return (c0 * (1 - fz) + c1 * fz) * vol.scale;
}

/**
 * Resample a volume on a plane. The output grid is n x n, centred on the
 * plane origin, with row 0 at +v.
 * @param {Object} vol volume (see volume.js)
 * @param {{origin:number[], u:number[], v:number[], n:number[]}} frame physical frame
 * @param {{n:number, px:number, slab?:number, mode?:'mean'|'max'}} opt
 * @returns {Float32Array}
 */
export function sliceVolume(vol, frame, opt) {
  const { n, px } = opt;
  const slab = Math.max(1, Math.round(opt.slab || 1));
  const useMax = opt.mode === 'max';
  const [nx, ny, nz] = vol.dims;
  const [sx, sy, sz] = vol.spacing;
  const step = Math.min(sx, sy, sz);
  const cx = (nx - 1) / 2, cy = (ny - 1) / 2, cz = (nz - 1) / 2;
  const { origin: o, u, v, n: nn } = frame;
  // Index-space increments.
  const du = [(u[0] * px) / sx, (u[1] * px) / sy, (u[2] * px) / sz];
  const dv = [(v[0] * px) / sx, (v[1] * px) / sy, (v[2] * px) / sz];
  const dn = [(nn[0] * step) / sx, (nn[1] * step) / sy, (nn[2] * step) / sz];
  const half = n / 2 - 0.5;
  const base = [o[0] / sx + cx, o[1] / sy + cy, o[2] / sz + cz];
  const out = new Float32Array(n * n);
  const offs = [];
  for (let k = 0; k < slab; k++) offs.push(k - (slab - 1) / 2);
  for (let j = 0; j < n; j++) {
    const vj = half - j;
    for (let i = 0; i < n; i++) {
      const ui = i - half;
      const px0 = base[0] + du[0] * ui + dv[0] * vj;
      const py0 = base[1] + du[1] * ui + dv[1] * vj;
      const pz0 = base[2] + du[2] * ui + dv[2] * vj;
      let acc = 0;
      for (let k = 0; k < slab; k++) {
        const t = offs[k];
        const s = trilinear(vol, px0 + dn[0] * t, py0 + dn[1] * t, pz0 + dn[2] * t);
        if (useMax) { if (s > acc) acc = s; } else acc += s;
      }
      out[j * n + i] = useMax ? acc : acc / slab;
    }
  }
  return out;
}

/**
 * Extract an axis-aligned slice through the volume centre as 8-bit grey.
 * @param {Object} vol
 * @param {'x'|'y'|'z'} axis normal axis
 * @returns {{w:number, h:number, data:Uint8Array}}
 */
export function centreSlice(vol, axis) {
  const [nx, ny, nz] = vol.dims;
  const k = 255 * vol.scale;
  const d = vol.data;
  let w, h, out;
  if (axis === 'z') {
    w = nx; h = ny; out = new Uint8Array(w * h);
    const z = nz >> 1;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) out[y * w + x] = d[x + y * nx + z * nx * ny] * k;
  } else if (axis === 'y') {
    w = nx; h = nz; out = new Uint8Array(w * h);
    const y = ny >> 1;
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) out[z * w + x] = d[x + y * nx + z * nx * ny] * k;
  } else {
    w = ny; h = nz; out = new Uint8Array(w * h);
    const x = nx >> 1;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) out[z * w + y] = d[x + y * nx + z * nx * ny] * k;
  }
  return { w, h, data: out };
}
