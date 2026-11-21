/**
 * Cutting-plane geometry. A plane is described by a base axis, an offset
 * along its normal and two tilt angles (degrees). All coordinates are in
 * source space, centred on the source bounding box.
 */

/** Base frames for the three orthogonal plane families. */
export const AXES = {
  xy: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  xz: { u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] },
  yz: { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
};

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const lin = (a, ca, b, cb) => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];

/**
 * Build an orthonormal frame for a plane.
 * @param {{axis:string, offset:number, tiltA:number, tiltB:number}} p
 * @returns {{origin:number[], u:number[], v:number[], n:number[]}}
 */
export function planeFrame(p) {
  const base = AXES[p.axis] || AXES.xy;
  const a = ((p.tiltA || 0) * Math.PI) / 180;
  const b = ((p.tiltB || 0) * Math.PI) / 180;
  // Rotate about u by a.
  const u1 = base.u;
  const v1 = lin(base.v, Math.cos(a), base.n, Math.sin(a));
  const n1 = lin(base.v, -Math.sin(a), base.n, Math.cos(a));
  // Rotate about v1 by b.
  const u2 = lin(u1, Math.cos(b), n1, -Math.sin(b));
  const n2 = lin(u1, Math.sin(b), n1, Math.cos(b));
  return { origin: add([0, 0, 0], n2, p.offset || 0), u: u2, v: v1, n: n2 };
}

/**
 * Half-extent of a box along a direction (support function of a centred box).
 * @param {number[]} size box size [x,y,z]
 * @param {number[]} dir unit direction
 */
export function halfExtentAlong(size, dir) {
  return 0.5 * (Math.abs(size[0] * dir[0]) + Math.abs(size[1] * dir[1]) + Math.abs(size[2] * dir[2]));
}

/**
 * Half-size of the square that holds the plane's intersection with a
 * centred box, measured in the plane's u/v axes. Returns 0 if the plane
 * misses the box.
 * @param {number[]} size box size [x,y,z]
 * @param {{origin:number[], u:number[], v:number[], n:number[]}} f
 */
export function planeBoxHalfExtent(size, f) {
  const h = size.map((s) => s / 2);
  const corners = [];
  for (let i = 0; i < 8; i++) corners.push([i & 1 ? h[0] : -h[0], i & 2 ? h[1] : -h[1], i & 4 ? h[2] : -h[2]]);
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const od = dot(f.origin, f.n);
  let m = 0, hit = false;
  for (const [a, b] of edges) {
    const da = dot(corners[a], f.n) - od, db = dot(corners[b], f.n) - od;
    if ((da > 0) === (db > 0) && da !== 0 && db !== 0) continue;
    const t = da === db ? 0 : da / (da - db);
    const p = corners[a].map((c, k) => c + (corners[b][k] - c) * t);
    const rel = p.map((c, k) => c - f.origin[k]);
    m = Math.max(m, Math.abs(dot(rel, f.u)), Math.abs(dot(rel, f.v)));
    hit = true;
  }
  return hit ? m : 0;
}
