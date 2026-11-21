import test from 'node:test';
import assert from 'node:assert/strict';
import { weldMesh, sliceMesh, evenOddArea, loopArea, rasterizeLoops } from '../src/geom/slice-mesh.js';
import { planeFrame } from '../src/geom/plane.js';
import { cubeSoup, sphereSoup } from './helpers.js';

const within = (a, b, rel) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} not within ${rel * 100}% of ${b}`);

test('welding merges shared cube vertices', () => {
  const m = weldMesh(cubeSoup(2));
  assert.equal(m.positions.length / 3, 8);
  assert.equal(m.indices.length, 36);
});

test('cube cross-section at z=0 is a 2x2 square', () => {
  const m = weldMesh(cubeSoup(2));
  const { loops, repaired } = sliceMesh(m, planeFrame({ axis: 'xy', offset: 0.3 }));
  assert.equal(loops.length, 1);
  assert.equal(repaired, 0);
  within(evenOddArea(loops), 4, 0.01);
});

test('cube cut through a vertex plane (degenerate) still closes', () => {
  const m = weldMesh(cubeSoup(2));
  const { loops } = sliceMesh(m, planeFrame({ axis: 'xy', offset: 1 - 1e-9 }));
  assert.equal(loops.length, 1);
  within(evenOddArea(loops), 4, 0.01);
});

test('tilted cube section matches analytic area', () => {
  const m = weldMesh(cubeSoup(2));
  const a = 30;
  const { loops } = sliceMesh(m, planeFrame({ axis: 'xy', offset: 0, tiltA: a }));
  within(evenOddArea(loops), 4 / Math.cos((a * Math.PI) / 180), 0.01);
});

test('sphere sections match pi (r^2 - h^2) within 1%', () => {
  const m = weldMesh(sphereSoup(1, 160, 80));
  for (const h of [0, 0.3, 0.7]) {
    for (const axis of ['xy', 'xz', 'yz']) {
      const { loops } = sliceMesh(m, planeFrame({ axis, offset: h, tiltA: 17, tiltB: -9 }));
      assert.equal(loops.length, 1);
      within(evenOddArea(loops), Math.PI * (1 - h * h), 0.01);
    }
  }
});

test('open mesh (missing faces) is repaired into a closed loop', () => {
  const soup = cubeSoup(2);
  // Remove the two +x faces (triangles 8 and 9).
  const open = new Float32Array([...soup.slice(0, 8 * 9), ...soup.slice(10 * 9)]);
  const { loops, repaired } = sliceMesh(weldMesh(open), planeFrame({ axis: 'xy', offset: 0.1 }));
  assert.equal(loops.length, 1);
  assert.equal(repaired, 1);
  within(Math.abs(loopArea(loops[0])), 4, 0.01);
});

test('even-odd area of nested squares (frame)', () => {
  const sq = (s) => new Float64Array([-s, -s, s, -s, s, s, -s, s]);
  within(evenOddArea([sq(2), sq(1)]), 16 - 4, 1e-9);
});

test('rasterised coverage matches polygon area', () => {
  const m = weldMesh(sphereSoup(1, 96, 48));
  const { loops } = sliceMesh(m, planeFrame({ axis: 'xy', offset: 0 }));
  const n = 200, px = 3 / n;
  const cov = rasterizeLoops(loops, n, px);
  let s = 0;
  for (const c of cov) s += c;
  within(s * px * px, evenOddArea(loops), 0.01);
  // Frame rasterises with a hole.
  const sq = (r) => new Float64Array([-r, -r, r, -r, r, r, -r, r]);
  const f = rasterizeLoops([sq(1), sq(0.5)], 100, 0.03);
  assert.equal(f[50 * 100 + 50], 0);
  assert.ok(f[50 * 100 + 50 - 25] > 0.99);
});
