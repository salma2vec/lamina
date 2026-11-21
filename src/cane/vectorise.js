/** Contour tracing (marching squares) and polyline simplification. */

/**
 * Trace iso-contours of a scalar field as closed loops.
 * The field is padded with zeros, so every contour closes.
 * Coordinates are in pixel units with pixel (x,y) centred at (x+0.5, y+0.5).
 * @param {ArrayLike<number>} field
 * @param {number} w
 * @param {number} h
 * @param {number} [iso]
 * @returns {number[][]} loops as flat [x0,y0,x1,y1,...]
 */
export function traceContours(field, w, h, iso = 0.5) {
  const W = w + 2, H = h + 2;
  const f = (x, y) => (x <= 0 || y <= 0 || x > w || y > h ? 0 : field[(y - 1) * w + (x - 1)]);
  // Edge keys: horizontal edge (x,y)-(x+1,y) => 2*(y*W+x); vertical (x,y)-(x,y+1) => 2*(y*W+x)+1.
  const pts = new Map();
  const point = (key) => {
    let p = pts.get(key);
    if (p) return p;
    const vert = key & 1, idx = key >> 1, x = idx % W, y = (idx / W) | 0;
    const a = f(x, y), b = vert ? f(x, y + 1) : f(x + 1, y);
    const t = a === b ? 0.5 : (iso - a) / (b - a);
    p = vert ? [x - 0.5, y + t - 0.5] : [x + t - 0.5, y - 0.5];
    pts.set(key, p);
    return p;
  };
  const next = new Map();
  const add = (k1, k2) => next.set(k1, k2);
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = f(x, y) >= iso, tr = f(x + 1, y) >= iso, br = f(x + 1, y + 1) >= iso, bl = f(x, y + 1) >= iso;
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const top = 2 * (y * W + x), bottom = 2 * ((y + 1) * W + x), left = 2 * (y * W + x) + 1, right = 2 * (y * W + x + 1) + 1;
      // Segments oriented with the inside on the right (clockwise in y-down space).
      switch (c) {
        case 1: add(bottom, left); break;
        case 2: add(right, bottom); break;
        case 3: add(right, left); break;
        case 4: add(top, right); break;
        case 5: {
          const centre = (f(x, y) + f(x + 1, y) + f(x + 1, y + 1) + f(x, y + 1)) / 4 >= iso;
          if (centre) { add(top, left); add(bottom, right); } else { add(top, right); add(bottom, left); }
          break;
        }
        case 6: add(top, bottom); break;
        case 7: add(top, left); break;
        case 8: add(left, top); break;
        case 9: add(bottom, top); break;
        case 10: {
          const centre = (f(x, y) + f(x + 1, y) + f(x + 1, y + 1) + f(x, y + 1)) / 4 >= iso;
          if (centre) { add(left, bottom); add(right, top); } else { add(left, top); add(right, bottom); }
          break;
        }
        case 11: add(right, top); break;
        case 12: add(left, right); break;
        case 13: add(bottom, right); break;
        case 14: add(left, bottom); break;
      }
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let k = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      const p = point(k);
      loop.push(p[0], p[1]);
      k = next.get(k);
    }
    if (loop.length >= 6) loops.push(loop);
  }
  return loops;
}

/**
 * Douglas-Peucker simplification of a closed loop.
 * @param {number[]} loop flat coordinates
 * @param {number} tol
 */
export function simplifyLoop(loop, tol) {
  const n = loop.length / 2;
  if (n < 8 || tol <= 0) return loop;
  // Work on the loop with its first point repeated at the end.
  const p = loop.concat([loop[0], loop[1]]);
  const keep = new Uint8Array(n + 1);
  const rec = (a, b) => {
    const ax = p[a * 2], ay = p[a * 2 + 1], dx = p[b * 2] - ax, dy = p[b * 2 + 1] - ay;
    const L = Math.hypot(dx, dy) || 1e-9;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[i * 2] - ax) * dy - (p[i * 2 + 1] - ay) * dx) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; rec(a, mi); rec(mi, b); }
  };
  const mid = n >> 1;
  keep[0] = keep[mid] = 1;
  rec(0, mid);
  rec(mid, n);
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out.length >= 6 ? out : loop;
}

/**
 * Smoothed indicator field of one level, for clean vector contours.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {number} level
 */
export function levelField(labels, w, h, level) {
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = labels[i] === level ? 1 : 0;
  // 3x3 binomial blur keeps contours at the label boundary but rounds stair steps.
  const b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = a[y * w + Math.max(0, x - 1)], c = a[y * w + x], r = a[y * w + Math.min(w - 1, x + 1)];
    b[y * w + x] = (l + 2 * c + r) / 4;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = b[Math.max(0, y - 1) * w + x], c = b[y * w + x], d = b[Math.min(h - 1, y + 1) * w + x];
    a[y * w + x] = (u + 2 * c + d) / 4;
  }
  return a;
}
