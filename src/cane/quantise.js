/** Histogram, threshold initialisation and quantisation into clay levels. */

/**
 * Histogram of values in 0..1.
 * @param {ArrayLike<number>} values
 * @param {Uint8Array} [mask] only count where mask is non-zero
 * @param {number} [bins]
 * @returns {Uint32Array}
 */
export function histogram(values, mask, bins = 128) {
  const h = new Uint32Array(bins);
  for (let i = 0; i < values.length; i++) {
    if (mask && !mask[i]) continue;
    let b = (values[i] * bins) | 0;
    if (b < 0) b = 0; else if (b >= bins) b = bins - 1;
    h[b]++;
  }
  return h;
}

/**
 * Initial thresholds by 1D k-means (Lloyd) on a histogram.
 * @param {ArrayLike<number>} hist
 * @param {number} levels number of clay levels (2..6)
 * @returns {number[]} levels-1 ascending thresholds in 0..1
 */
export function initialThresholds(hist, levels) {
  const B = hist.length;
  let total = 0, lo = -1, hi = -1;
  for (let i = 0; i < B; i++) if (hist[i]) { total += hist[i]; if (lo < 0) lo = i; hi = i; }
  if (!total || lo === hi) return Array.from({ length: levels - 1 }, (_, i) => (i + 1) / levels);
  // Seed centres at quantiles.
  const c = [];
  let acc = 0, q = 0;
  for (let i = 0; i < B && c.length < levels; i++) {
    acc += hist[i];
    while (c.length < levels && acc >= ((q + 0.5) / levels) * total) { c.push((i + 0.5) / B); q++; }
  }
  while (c.length < levels) c.push(c[c.length - 1]);
  for (let it = 0; it < 60; it++) {
    const t = [];
    for (let k = 0; k + 1 < levels; k++) t.push((c[k] + c[k + 1]) / 2);
    const sum = new Float64Array(levels), cnt = new Float64Array(levels);
    for (let i = 0; i < B; i++) {
      if (!hist[i]) continue;
      const x = (i + 0.5) / B;
      let k = 0;
      while (k < t.length && x >= t[k]) k++;
      sum[k] += x * hist[i]; cnt[k] += hist[i];
    }
    let moved = 0;
    for (let k = 0; k < levels; k++) {
      if (!cnt[k]) continue;
      const n = sum[k] / cnt[k];
      moved += Math.abs(n - c[k]);
      c[k] = n;
    }
    c.sort((a, b) => a - b);
    if (moved < 1e-6) break;
  }
  const t = [];
  for (let k = 0; k + 1 < levels; k++) t.push(Math.round(((c[k] + c[k + 1]) / 2) * 1000) / 1000);
  // Keep thresholds strictly increasing.
  for (let k = 1; k < t.length; k++) if (t[k] <= t[k - 1]) t[k] = Math.min(1, t[k - 1] + 0.005);
  return t;
}

/**
 * Quantise values into levels using ascending thresholds.
 * Value v gets level k where t[k-1] <= v < t[k].
 * @param {ArrayLike<number>} values
 * @param {number[]} thresholds
 * @param {Uint8Array} [mask] where zero, output is 255 (outside)
 * @returns {Uint8Array}
 */
export function quantise(values, thresholds, mask) {
  const out = new Uint8Array(values.length);
  const t = thresholds;
  for (let i = 0; i < values.length; i++) {
    if (mask && !mask[i]) { out[i] = 255; continue; }
    const v = values[i];
    let k = 0;
    while (k < t.length && v >= t[k]) k++;
    out[i] = k;
  }
  return out;
}

/**
 * Pixel count per level (outside pixels ignored).
 * @param {Uint8Array} labels
 * @param {number} levels
 */
export function levelCounts(labels, levels) {
  const c = new Array(levels).fill(0);
  for (let i = 0; i < labels.length; i++) if (labels[i] < levels) c[labels[i]]++;
  return c;
}
