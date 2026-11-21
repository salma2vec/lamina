/**
 * Mesh welding, exact plane-mesh intersection and even-odd polygon
 * rasterisation. Pure functions; usable in Node and the browser.
 */
import { dot } from './plane.js';

/**
 * Merge coincident vertices of a triangle soup.
 * @param {Float32Array} soup xyz per vertex, three vertices per triangle
 * @param {number} [tol] weld tolerance in source units (default 1e-6 of the diagonal)
 * @returns {{positions:Float32Array, indices:Uint32Array, min:number[], max:number[]}}
 */
export function weldMesh(soup, tol) {
  const n = soup.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const c = soup[i * 3 + k];
      if (c < min[k]) min[k] = c;
      if (c > max[k]) max[k] = c;
    }
  }
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const q = tol || diag * 1e-6;
  const map = new Map();
  const pos = [];
  const indices = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const x = soup[i * 3], y = soup[i * 3 + 1], z = soup[i * 3 + 2];
    const key = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      map.set(key, id);
      pos.push(x, y, z);
    }
    indices[i] = id;
  }
  return { positions: new Float32Array(pos), indices, min, max };
}

/**
 * Intersect an indexed mesh with a plane.
 * Returns closed loops in plane coordinates (u, v). Open chains caused by
 * holes or non-manifold edges are joined to the nearest chain end within
 * tolerance, then closed with a straight edge.
 * @param {{positions:Float32Array, indices:Uint32Array}} mesh
 * @param {{origin:number[], u:number[], v:number[], n:number[]}} frame
 * @param {number} [tol] join tolerance in source units
 * @returns {{loops:Float64Array[], repaired:number}}
 */
export function sliceMesh(mesh, frame, tol = 1e-3) {
  const P = mesh.positions;
  const I = mesh.indices;
  const nv = P.length / 3;
  const { origin, u, v, n } = frame;
  const od = dot(origin, n), ou = dot(origin, u), ov = dot(origin, v);
  const d = new Float64Array(nv);
  for (let i = 0; i < nv; i++) {
    const s = P[i * 3] * n[0] + P[i * 3 + 1] * n[1] + P[i * 3 + 2] * n[2] - od;
    // Vertices on the plane are nudged to the positive side to avoid degeneracy.
    d[i] = s === 0 ? 1e-12 : s;
  }
  const pointCache = new Map();
  const point = (a, b) => {
    if (a > b) { const t = a; a = b; b = t; }
    const key = a * nv + b;
    let p = pointCache.get(key);
    if (!p) {
      const t = d[a] / (d[a] - d[b]);
      const x = P[a * 3] + (P[b * 3] - P[a * 3]) * t;
      const y = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t;
      const z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t;
      p = { key, x: x * u[0] + y * u[1] + z * u[2] - ou, y: x * v[0] + y * v[1] + z * v[2] - ov };
      pointCache.set(key, p);
    }
    return p;
  };
  const segs = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const sa = d[a] > 0, sb = d[b] > 0, sc = d[c] > 0;
    if (sa === sb && sb === sc) continue;
    const pts = [];
    if (sa !== sb) pts.push(point(a, b));
    if (sb !== sc) pts.push(point(b, c));
    if (sc !== sa) pts.push(point(c, a));
    if (pts.length === 2 && pts[0].key !== pts[1].key) segs.push(pts);
  }
  // Adjacency by shared edge key.
  const adj = new Map();
  segs.forEach((s, i) => {
    for (const p of s) {
      const l = adj.get(p.key);
      if (l) l.push(i); else adj.set(p.key, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const nextFrom = (key) => {
    const l = adj.get(key);
    if (!l) return -1;
    for (const i of l) if (!used[i]) return i;
    return -1;
  };
  const closed = [];
  const open = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const chain = [segs[i][0], segs[i][1]];
    const startKey = segs[i][0].key;
    let isClosed = false;
    for (;;) {
      const last = chain[chain.length - 1];
      if (last.key === startKey && chain.length > 2) { chain.pop(); isClosed = true; break; }
      const j = nextFrom(last.key);
      if (j < 0) break;
      used[j] = 1;
      const s = segs[j];
      chain.push(s[0].key === last.key ? s[1] : s[0]);
    }
    if (!isClosed) {
      // Extend backwards from the start.
      for (;;) {
        const first = chain[0];
        const j = nextFrom(first.key);
        if (j < 0) break;
        used[j] = 1;
        const s = segs[j];
        chain.unshift(s[0].key === first.key ? s[1] : s[0]);
      }
      open.push(chain);
    } else {
      closed.push(chain);
    }
  }
  let repaired = 0;
  // Join open chains greedily by nearest end within tolerance.
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  while (open.length) {
    const c = open.pop();
    let joined = true;
    while (joined) {
      joined = false;
      const end = c[c.length - 1];
      if (dist(end, c[0]) <= tol && c.length > 2) break;
      let best = -1, bestD = tol, flip = false;
      for (let k = 0; k < open.length; k++) {
        const o = open[k];
        const d0 = dist(end, o[0]);
        const d1 = dist(end, o[o.length - 1]);
        if (d0 <= bestD) { best = k; bestD = d0; flip = false; }
        if (d1 <= bestD) { best = k; bestD = d1; flip = true; }
      }
      if (best >= 0) {
        const o = open.splice(best, 1)[0];
        if (flip) o.reverse();
        for (const p of o) c.push(p);
        joined = true;
      }
    }
    if (c.length >= 3) { closed.push(c); repaired++; }
  }
  const loops = closed.map((c) => {
    const f = new Float64Array(c.length * 2);
    c.forEach((p, i) => { f[i * 2] = p.x; f[i * 2 + 1] = p.y; });
    return f;
  });
  return { loops, repaired };
}

/** Signed shoelace area of a flat [x0,y0,x1,y1,...] loop. */
export function loopArea(loop) {
  let a = 0;
  const n = loop.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += loop[j * 2] * loop[i * 2 + 1] - loop[i * 2] * loop[j * 2 + 1];
  }
  return a / 2;
}

function pointInLoop(x, y, loop) {
  let inside = false;
  const n = loop.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i * 2], yi = loop[i * 2 + 1], xj = loop[j * 2], yj = loop[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Area enclosed by loops under the even-odd rule, assuming loops do not cross.
 * @param {Float64Array[]} loops
 */
export function evenOddArea(loops) {
  let total = 0;
  loops.forEach((l, i) => {
    let depth = 0;
    loops.forEach((o, k) => { if (k !== i && pointInLoop(l[0], l[1], o)) depth++; });
    total += (depth % 2 ? -1 : 1) * Math.abs(loopArea(l));
  });
  return total;
}

/**
 * Rasterise loops with the even-odd rule into an n x n coverage grid.
 * Grid centre is plane coordinate (0,0); row 0 is the top (+v).
 * Uses 4 sub-scanlines per row with exact horizontal span coverage.
 * @param {Float64Array[]} loops
 * @param {number} n grid size in pixels
 * @param {number} px pixel size in source units
 * @returns {Float32Array} coverage 0..1
 */
export function rasterizeLoops(loops, n, px) {
  const SUB = 4;
  const rows = n * SUB;
  const xs = Array.from({ length: rows }, () => []);
  const half = n / 2;
  for (const l of loops) {
    const m = l.length / 2;
    for (let i = 0, j = m - 1; i < m; j = i++) {
      // Convert to pixel space: X right, Y down.
      const x0 = l[j * 2] / px + half, y0 = half - l[j * 2 + 1] / px;
      const x1 = l[i * 2] / px + half, y1 = half - l[i * 2 + 1] / px;
      if (y0 === y1) continue;
      const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      let r0 = Math.max(0, Math.ceil(ya * SUB - 0.5));
      const r1 = Math.min(rows - 1, Math.ceil(yb * SUB - 0.5) - 1);
      for (let r = r0; r <= r1; r++) {
        const y = (r + 0.5) / SUB;
        xs[r].push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
  }
  const out = new Float32Array(n * n);
  const w = 1 / SUB;
  for (let r = 0; r < rows; r++) {
    const list = xs[r];
    if (list.length < 2) continue;
    list.sort((a, b) => a - b);
    const row = Math.floor(r / SUB) * n;
    for (let k = 0; k + 1 < list.length; k += 2) {
      const a = Math.max(0, list[k]), b = Math.min(n, list[k + 1]);
      if (b <= a) continue;
      const ia = Math.floor(a), ib = Math.floor(b);
      if (ia === ib) { out[row + ia] += (b - a) * w; continue; }
      out[row + ia] += (ia + 1 - a) * w;
      for (let x = ia + 1; x < ib; x++) out[row + x] += w;
      if (ib < n) out[row + ib] += (b - ib) * w;
    }
  }
  for (let i = 0; i < out.length; i++) if (out[i] > 1) out[i] = 1;
  return out;
}
