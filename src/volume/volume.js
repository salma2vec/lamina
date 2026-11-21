/**
 * Volume container helpers. A volume is
 * { dims:[nx,ny,nz], spacing:[sx,sy,sz], spacingKnown:boolean,
 *   data:Uint8Array|Uint16Array, scale:number } where value*scale is in 0..1.
 * Voxel (i,j,k) has its centre at ((i-(nx-1)/2)*sx, (j-(ny-1)/2)*sy, (k-(nz-1)/2)*sz).
 */

/**
 * Streaming box-filter downsampler. Feed z-slices in order; each axis is
 * reduced by an integer factor so that no side exceeds maxSide.
 */
export class VolumeBuilder {
  /**
   * @param {number} nx
   * @param {number} ny
   * @param {number} nz
   * @param {number} [maxSide]
   */
  constructor(nx, ny, nz, maxSide = 256) {
    this.src = [nx, ny, nz];
    this.f = this.src.map((n) => Math.max(1, Math.ceil(n / maxSide)));
    this.dims = this.src.map((n, i) => Math.ceil(n / this.f[i]));
    const [ox, oy, oz] = this.dims;
    this.acc = new Float32Array(ox * oy * oz);
    this.cnt = new Uint16Array(oz);
    this.row = new Float32Array(ox * oy);
    this.rowCnt = new Float32Array(ox * oy);
  }

  /**
   * Add one source z-slice (row-major, nx*ny values).
   * @param {number} z source slice index
   * @param {ArrayLike<number>} plane
   */
  addSlice(z, plane) {
    const [nx, ny] = this.src;
    const [fx, fy, fz] = this.f;
    const [ox] = this.dims;
    const row = this.row, rc = this.rowCnt;
    row.fill(0); rc.fill(0);
    for (let y = 0; y < ny; y++) {
      const oyi = ((y / fy) | 0) * ox;
      const base = y * nx;
      for (let x = 0; x < nx; x++) {
        const v = plane[base + x];
        const o = oyi + ((x / fx) | 0);
        if (v === v) { row[o] += v; rc[o]++; }
      }
    }
    const oz = (z / fz) | 0;
    const off = oz * row.length;
    for (let i = 0; i < row.length; i++) this.acc[off + i] += rc[i] ? row[i] / rc[i] : 0;
    this.cnt[oz]++;
  }

  /**
   * Normalise to 16-bit, clipping the 0.1 and 99.9 percentiles.
   * @param {number[]|null} spacing source voxel size, or null if unknown
   */
  finish(spacing) {
    const per = this.dims[0] * this.dims[1];
    for (let z = 0; z < this.dims[2]; z++) {
      const c = this.cnt[z] || 1;
      if (c !== 1) for (let i = z * per; i < (z + 1) * per; i++) this.acc[i] /= c;
    }
    const { lo, hi } = robustRange(this.acc);
    const data = new Uint16Array(this.acc.length);
    const k = hi > lo ? 65535 / (hi - lo) : 0;
    for (let i = 0; i < data.length; i++) {
      const v = (this.acc[i] - lo) * k;
      data[i] = v < 0 ? 0 : v > 65535 ? 65535 : v;
    }
    const s = spacing || [1, 1, 1];
    return {
      dims: this.dims.slice(),
      spacing: s.map((v, i) => v * this.f[i]),
      spacingKnown: !!spacing,
      data,
      scale: 1 / 65535,
      factor: this.f.slice(),
      sourceDims: this.src.slice(),
    };
  }
}

/**
 * 0.1 / 99.9 percentile range of an array.
 * @param {ArrayLike<number>} a
 */
export function robustRange(a) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!(mx > mn)) return { lo: mn, hi: mn + 1 };
  const B = 4096;
  const h = new Uint32Array(B);
  const k = (B - 1) / (mx - mn);
  for (let i = 0; i < a.length; i++) h[((a[i] - mn) * k) | 0]++;
  const cut = a.length * 0.001;
  let s = 0, lo = 0, hi = B - 1;
  for (let i = 0; i < B; i++) { s += h[i]; if (s > cut) { lo = i; break; } }
  s = 0;
  for (let i = B - 1; i >= 0; i--) { s += h[i]; if (s > cut) { hi = i; break; } }
  if (hi <= lo) return { lo: mn, hi: mx };
  return { lo: mn + lo / k, hi: mn + (hi + 1) / k };
}

/**
 * Build a volume from a full typed array (z-major slices).
 * @param {number[]} dims
 * @param {ArrayLike<number>} data
 * @param {number[]|null} spacing
 * @param {number} [maxSide]
 * @param {(p:number)=>void} [onProgress]
 */
export function buildVolume(dims, data, spacing, maxSide = 256, onProgress) {
  const [nx, ny, nz] = dims;
  const b = new VolumeBuilder(nx, ny, nz, maxSide);
  const per = nx * ny;
  for (let z = 0; z < nz; z++) {
    b.addSlice(z, data.subarray ? data.subarray(z * per, (z + 1) * per) : Array.prototype.slice.call(data, z * per, (z + 1) * per));
    if (onProgress && (z & 7) === 0) onProgress(z / nz);
  }
  return b.finish(spacing);
}

/**
 * Normalise a greyscale plane to 0..1 (robust range) and box-downsample so
 * that no side exceeds maxSide.
 * @param {ArrayLike<number>} plane
 * @param {number} w
 * @param {number} h
 * @param {number} [maxSide]
 * @returns {{w:number, h:number, data:Float32Array, factor:number}}
 */
export function imageFromPlane(plane, w, h, maxSide = 1024) {
  const f = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
  const ow = Math.ceil(w / f), oh = Math.ceil(h / f);
  const acc = new Float32Array(ow * oh), cnt = new Float32Array(ow * oh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = ((y / f) | 0) * ow + ((x / f) | 0);
    acc[o] += plane[y * w + x]; cnt[o]++;
  }
  for (let i = 0; i < acc.length; i++) acc[i] /= cnt[i] || 1;
  const { lo, hi } = robustRange(acc);
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < acc.length; i++) acc[i] = Math.min(1, Math.max(0, (acc[i] - lo) * k));
  return { w: ow, h: oh, data: acc, factor: f };
}
