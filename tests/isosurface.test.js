import test from 'node:test';
import assert from 'node:assert/strict';
import { isosurface, otsuLevel, paddedGrid } from '../src/volume/isosurface.js';
import { planeFrame, planeBoxPolygon } from '../src/geom/plane.js';
import { loopArea } from '../src/geom/slice-mesh.js';

/** A smooth ball of radius r (voxels) in an n^3 volume, 8-bit. */
function ball(n, r, spacing = [1, 1, 1]) {
  const data = new Uint8Array(n * n * n);
  const c = (n - 1) / 2;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = Math.hypot(i - c, j - c, k - c);
    data[i + j * n + k * n * n] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - (d - r))));
  }
  return { dims: [n, n, n], spacing, data, scale: 1 / 255 };
}

/** Count edges used by other than two triangles. */
function openEdges(indices) {
  const m = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e], b = indices[t + ((e + 1) % 3)];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const v of m.values()) if (v !== 2) bad++;
  return { bad, edges: m.size };
}

test('isosurface of a ball lies on the sphere with outward normals', () => {
  const r = 9;
  const s = isosurface(ball(32, r), 0.5);
  const nv = s.positions.length / 3;
  assert.ok(nv > 500, `${nv} vertices`);
  let worst = 0, inward = 0;
  for (let i = 0; i < nv; i++) {
    const x = s.positions[i * 3], y = s.positions[i * 3 + 1], z = s.positions[i * 3 + 2];
    const d = Math.hypot(x, y, z);
    worst = Math.max(worst, Math.abs(d - r));
    if (x * s.normals[i * 3] + y * s.normals[i * 3 + 1] + z * s.normals[i * 3 + 2] <= 0) inward++;
  }
  assert.ok(worst < 0.6, `vertex up to ${worst} voxels off the sphere`);
  assert.equal(inward, 0);
});

test('isosurface triangles are wound to face outwards and form a closed surface', () => {
  const s = isosurface(ball(28, 8), 0.5);
  const P = s.positions, I = s.indices;
  let wrong = 0;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const centre = [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3];
    if (n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2] <= 0) wrong++;
  }
  assert.equal(wrong, 0);
  const { bad, edges } = openEdges(I);
  assert.equal(bad, 0);
  // Euler characteristic of a sphere: V - E + F = 2.
  assert.equal(P.length / 3 - edges + I.length / 3, 2);
});

test('a volume that is solid to its edges gives a closed box', () => {
  const n = 10;
  const vol = { dims: [n, n, n], spacing: [0.5, 0.5, 2], data: new Uint8Array(n * n * n).fill(200), scale: 1 / 255 };
  const s = isosurface(vol, 0.3);
  assert.equal(openEdges(s.indices).bad, 0);
  let mx = [0, 0, 0];
  for (let i = 0; i < s.positions.length; i += 3) for (let k = 0; k < 3; k++) mx[k] = Math.max(mx[k], Math.abs(s.positions[i + k]));
  // Half-size of the box plus up to half a voxel of padding, per axis.
  assert.ok(mx[0] > 2.2 && mx[0] < 2.75 + 1e-6, `x extent ${mx[0]}`);
  assert.ok(mx[2] > 9 && mx[2] < 11 + 1e-6, `z extent ${mx[2]}`);
});

test('large volumes are reduced by an integer step and keep their physical size', () => {
  const g = paddedGrid(ball(40, 12), 16);
  assert.equal(g.step, 3);
  assert.deepEqual(g.m, [14, 14, 14]);
  const s = isosurface(ball(40, 12), 0.5, { maxSide: 16 });
  let mx = 0;
  for (let i = 0; i < s.positions.length; i += 3) mx = Math.max(mx, Math.hypot(s.positions[i], s.positions[i + 1], s.positions[i + 2]));
  assert.ok(Math.abs(mx - 12) < 2.5, `radius ${mx}`);
});

test('Otsu level separates two populations', () => {
  const data = new Uint8Array(1000);
  for (let i = 0; i < data.length; i++) data[i] = i < 700 ? 40 + (i % 11) : 200 + (i % 13);
  const t = otsuLevel({ data, scale: 1 / 255 });
  assert.ok(t > 50 / 255 && t < 200 / 255, `level ${t}`);
});

test('plane and box intersection polygon matches the analytic section', () => {
  const size = [2, 3, 4];
  const sq = planeBoxPolygon(size, planeFrame({ axis: 'xy', offset: 0.5 }));
  assert.equal(sq.length, 4);
  assert.ok(Math.abs(Math.abs(loopArea(sq.flat())) - 6) < 1e-9);
  const a = 25;
  const tilted = planeBoxPolygon(size, planeFrame({ axis: 'xy', offset: 0, tiltA: a }));
  assert.ok(Math.abs(Math.abs(loopArea(tilted.flat())) - 6 / Math.cos((a * Math.PI) / 180)) < 1e-6);
  assert.ok(loopArea(tilted.flat()) > 0, 'counter-clockwise');
  assert.deepEqual(planeBoxPolygon(size, planeFrame({ axis: 'xy', offset: 2.5 })), []);
});
