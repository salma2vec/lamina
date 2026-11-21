/**
 * Clean-up operations on label images. Labels 0..L-1 are clay levels;
 * 255 marks pixels outside the cane outline, which are never changed.
 */

export const OUTSIDE = 255;

function discOffsets(r, w) {
  const o = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r + r * 0.5) o.push([dx, dy, dy * w + dx]);
  }
  return o;
}

/**
 * Majority (mode) filter: the label-image form of a median filter.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {number} r radius in pixels
 * @param {number} levels
 */
export function modeFilter(labels, w, h, r, levels) {
  if (r < 1) return labels.slice();
  const out = labels.slice();
  const off = discOffsets(r, w);
  const cnt = new Int32Array(levels);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (labels[i] === OUTSIDE) continue;
    cnt.fill(0);
    for (const [dx, dy, d] of off) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const l = labels[i + d];
      if (l !== OUTSIDE) cnt[l]++;
    }
    let best = labels[i], bc = cnt[best];
    for (let k = 0; k < levels; k++) if (cnt[k] > bc) { bc = cnt[k]; best = k; }
    out[i] = best;
  }
  return out;
}

function minmax(labels, w, h, r, isMax) {
  if (r < 1) return labels.slice();
  const out = labels.slice();
  const off = discOffsets(r, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (labels[i] === OUTSIDE) continue;
    let v = labels[i];
    for (const [dx, dy, d] of off) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const l = labels[i + d];
      if (l === OUTSIDE) continue;
      if (isMax ? l > v : l < v) v = l;
    }
    out[i] = v;
  }
  return out;
}

/** Grey-level erosion (minimum over a disc). */
export const erode = (labels, w, h, r) => minmax(labels, w, h, r, false);
/** Grey-level dilation (maximum over a disc). */
export const dilate = (labels, w, h, r) => minmax(labels, w, h, r, true);
/** Opening: removes features of high levels narrower than the disc. */
export const open = (labels, w, h, r) => dilate(erode(labels, w, h, r), w, h, r);
/** Closing: removes features of low levels narrower than the disc. */
export const close = (labels, w, h, r) => erode(dilate(labels, w, h, r), w, h, r);

/**
 * Connected components (4-connected) of equal labels.
 * @returns {{comp:Int32Array, sizes:number[], label:number[]}}
 */
export function components(labels, w, h) {
  const comp = new Int32Array(w * h).fill(-1);
  const sizes = [], label = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (comp[s] >= 0 || labels[s] === OUTSIDE) continue;
    const id = sizes.length, l = labels[s];
    let sp = 0, n = 0;
    stack[sp++] = s; comp[s] = id;
    while (sp) {
      const i = stack[--sp]; n++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && comp[i - 1] < 0 && labels[i - 1] === l) { comp[i - 1] = id; stack[sp++] = i - 1; }
      if (x < w - 1 && comp[i + 1] < 0 && labels[i + 1] === l) { comp[i + 1] = id; stack[sp++] = i + 1; }
      if (y > 0 && comp[i - w] < 0 && labels[i - w] === l) { comp[i - w] = id; stack[sp++] = i - w; }
      if (y < h - 1 && comp[i + w] < 0 && labels[i + w] === l) { comp[i + w] = id; stack[sp++] = i + w; }
    }
    sizes.push(n); label.push(l);
  }
  return { comp, sizes, label };
}

/**
 * Merge every component marked in `drop` into its most common neighbouring
 * level. Large neighbours win over other dropped components.
 */
function mergeComponents(labels, w, h, comp, sizes, drop) {
  const out = labels.slice();
  const votes = new Map();
  for (let i = 0; i < w * h; i++) {
    const c = comp[i];
    if (c < 0 || !drop[c]) continue;
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of nb) {
      if (j < 0 || j >= w * h) continue;
      const l = labels[j];
      if (l === OUTSIDE || comp[j] === c) continue;
      let v = votes.get(c);
      if (!v) votes.set(c, (v = new Map()));
      v.set(l, (v.get(l) || 0) + (drop[comp[j]] ? 0.01 : 1));
    }
  }
  const target = new Int16Array(sizes.length).fill(-1);
  for (const [c, v] of votes) {
    let best = -1, bv = -1;
    for (const [l, n] of v) if (n > bv) { bv = n; best = l; }
    target[c] = best;
  }
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    const c = comp[i];
    if (c >= 0 && target[c] >= 0) { out[i] = target[c]; changed++; }
  }
  return { out, changed };
}

/**
 * Merge regions smaller than minArea pixels into their most common
 * neighbouring level. Removes specks and fills pinholes alike.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {number} minArea
 * @returns {Uint8Array}
 */
export function removeSmallRegions(labels, w, h, minArea) {
  let out = labels.slice();
  if (minArea <= 1) return out;
  for (let pass = 0; pass < 3; pass++) {
    const { comp, sizes } = components(out, w, h);
    const drop = new Uint8Array(sizes.length);
    let any = false;
    sizes.forEach((s, id) => { if (s < minArea) { drop[id] = 1; any = true; } });
    if (!any) break;
    const r = mergeComponents(out, w, h, comp, sizes, drop);
    out = r.out;
    if (!r.changed) break;
  }
  return out;
}

/**
 * Largest inscribed width of every connected region, in pixels. The outline
 * edge does not count as a boundary, so regions cut by the outline are
 * measured by their inner extent.
 * @returns {{comp:Int32Array, sizes:number[], label:number[], width:Float32Array, at:Int32Array}}
 */
export function regionWidths(labels, w, h) {
  const cc = components(labels, w, h);
  const { comp, sizes, label } = cc;
  const maxD = new Float32Array(sizes.length);
  const at = new Int32Array(sizes.length);
  for (const l of new Set(label)) {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = labels[i] === l || labels[i] === OUTSIDE ? 1 : 0;
    const d = distanceTransform(m, w, h);
    for (let i = 0; i < w * h; i++) {
      const c = comp[i];
      if (c >= 0 && label[c] === l && d[i] > maxD[c]) { maxD[c] = d[i]; at[c] = i; }
    }
  }
  const width = maxD.map((v) => Math.max(1, 2 * v - 1));
  return { ...cc, width, at };
}

/**
 * Merge regions whose inscribed width is below minWidth pixels into their
 * neighbours, so every remaining region is at least that wide somewhere.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {number} minWidth
 */
export function removeThinRegions(labels, w, h, minWidth) {
  let out = labels.slice();
  if (minWidth <= 1) return out;
  for (let pass = 0; pass < 3; pass++) {
    const { comp, sizes, width } = regionWidths(out, w, h);
    const drop = new Uint8Array(sizes.length);
    let any = false;
    width.forEach((wd, id) => { if (wd < minWidth) { drop[id] = 1; any = true; } });
    if (!any) break;
    const r = mergeComponents(out, w, h, comp, sizes, drop);
    out = r.out;
    if (!r.changed) break;
  }
  return out;
}

function blur1d(src, dst, w, h, k, horizontal) {
  const r = (k.length - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let t = -r; t <= r; t++) {
      let xx = x, yy = y;
      if (horizontal) xx = Math.min(w - 1, Math.max(0, x + t)); else yy = Math.min(h - 1, Math.max(0, y + t));
      s += src[yy * w + xx] * k[t + r];
    }
    dst[y * w + x] = s;
  }
}

/**
 * Smooth region boundaries: Gaussian-blur each level's indicator and take
 * the per-pixel maximum.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {number} sigma in pixels
 * @param {number} levels
 */
export function smoothLabels(labels, w, h, sigma, levels) {
  if (sigma <= 0.25) return labels.slice();
  const r = Math.ceil(sigma * 2.5);
  const k = [];
  let ks = 0;
  for (let t = -r; t <= r; t++) { const v = Math.exp(-(t * t) / (2 * sigma * sigma)); k.push(v); ks += v; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const best = new Float32Array(w * h).fill(-1);
  const out = labels.slice();
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let l = 0; l < levels; l++) {
    let any = false;
    for (let i = 0; i < w * h; i++) { a[i] = labels[i] === l ? 1 : 0; if (a[i]) any = true; }
    if (!any) continue;
    blur1d(a, b, w, h, k, true);
    blur1d(b, a, w, h, k, false);
    for (let i = 0; i < w * h; i++) {
      if (labels[i] === OUTSIDE) continue;
      if (a[i] > best[i]) { best[i] = a[i]; out[i] = l; }
    }
  }
  return out;
}

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Exact Euclidean distance transform (Felzenszwalb-Huttenlocher).
 * Returns, for each foreground pixel, the distance to the nearest
 * background pixel. Pixels beyond the grid edge count as background.
 * @param {Uint8Array} mask foreground where non-zero
 * @param {number} w
 * @param {number} h
 * @returns {Float32Array}
 */
export function distanceTransform(mask, w, h) {
  const W = w + 2, H = h + 2;
  const INF = 1e20;
  const g = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = x > 0 && y > 0 && x <= w && y <= h && mask[(y - 1) * w + (x - 1)];
    g[y * W + x] = inside ? INF : 0;
  }
  const n = Math.max(W, H);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    edt1d(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1d(f, W, d, v, z);
    for (let x = 0; x < W; x++) g[y * W + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(g[(y + 1) * W + x + 1]);
  return out;
}

/**
 * The thinnest region: the one with the smallest largest-inscribed width.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @returns {{width:number, level:number, x:number, y:number}|null} width in pixels
 */
export function smallestFeature(labels, w, h) {
  const { sizes, label, width, at } = regionWidths(labels, w, h);
  if (!sizes.length) return null;
  let best = 0;
  for (let c = 1; c < sizes.length; c++) if (width[c] < width[best]) best = c;
  return { width: width[best], level: label[best], x: at[best] % w, y: (at[best] / w) | 0 };
}

/**
 * Full clean-up chain for buildability.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {{median:number, openClose:number, minWidth:number, smooth:number, levels:number}} o
 *   minWidth: minimum region width in pixels (specks and thin regions merge away)
 */
export function cleanup(labels, w, h, o) {
  let l = labels;
  if (o.median > 0) l = modeFilter(l, w, h, o.median, o.levels);
  if (o.openClose > 0) l = close(open(l, w, h, o.openClose), w, h, o.openClose);
  if (o.smooth > 0) l = smoothLabels(l, w, h, o.smooth, o.levels);
  if (o.minWidth > 1) {
    // Specks first (cheap), then regions that are too thin everywhere.
    l = removeSmallRegions(l, w, h, Math.ceil(o.minWidth * o.minWidth * 0.5));
    l = removeThinRegions(l, w, h, o.minWidth);
  }
  return l === labels ? labels.slice() : l;
}
