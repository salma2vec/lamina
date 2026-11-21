import test from 'node:test';
import assert from 'node:assert/strict';
import { trilinear, sliceVolume } from '../src/volume/resample.js';
import { VolumeBuilder, buildVolume } from '../src/volume/volume.js';
import { planeFrame } from '../src/geom/plane.js';
import { generate, SPECIMENS } from '../src/volume/synthetic.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Linear field f(i,j,k) = i + 2j + 3k, stored as Float32 with scale 1. */
function linearVolume(n = 8) {
  const data = new Float32Array(n * n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[i + j * n + k * n * n] = i + 2 * j + 3 * k;
  return { dims: [n, n, n], spacing: [1, 1, 1], data, scale: 1 };
}

test('trilinear interpolation reproduces a linear field', () => {
  const v = linearVolume();
  close(trilinear(v, 0, 0, 0), 0);
  close(trilinear(v, 1.5, 2.25, 3.75), 1.5 + 4.5 + 11.25);
  close(trilinear(v, 7, 7, 7), 42);
  assert.equal(trilinear(v, -0.1, 0, 0), 0);
});

test('oblique slice samples the expected plane', () => {
  const v = linearVolume(16);
  const frame = planeFrame({ axis: 'xy', offset: 1.25 });
  const s = sliceVolume(v, frame, { n: 8, px: 1 });
  // Pixel (i,j): u = i - 3.5, v = 3.5 - j; index x = u + 7.5, y = v + 7.5, z = 1.25 + 7.5.
  for (const [i, j] of [[0, 0], [3, 4], [7, 7]]) {
    const x = i - 3.5 + 7.5, y = 3.5 - j + 7.5, z = 8.75;
    close(s[j * 8 + i], x + 2 * y + 3 * z, 1e-4);
  }
});

test('slab mean equals centre for a linear field; max picks the far side', () => {
  const v = linearVolume(16);
  const frame = planeFrame({ axis: 'xy', offset: 0 });
  const one = sliceVolume(v, frame, { n: 4, px: 1 });
  const mean = sliceVolume(v, frame, { n: 4, px: 1, slab: 5, mode: 'mean' });
  const max = sliceVolume(v, frame, { n: 4, px: 1, slab: 5, mode: 'max' });
  one.forEach((x, i) => { close(mean[i], x, 1e-4); close(max[i], x + 3 * 2, 1e-4); });
});

test('anisotropic spacing maps physical to index space', () => {
  const v = linearVolume(8);
  v.spacing = [1, 1, 2];
  const s = sliceVolume(v, planeFrame({ axis: 'xy', offset: 2 }), { n: 2, px: 1 });
  // z index = 2/2 + 3.5 = 4.5
  close(s[0], (0.5 * -1 + 3.5) + 2 * (0.5 + 3.5) + 3 * 4.5, 1e-4);
});

test('volume builder downsamples by integer factors and normalises', () => {
  const nx = 20, ny = 10, nz = 6;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < data.length; i++) data[i] = i % nx;
  const v = buildVolume([nx, ny, nz], data, [0.1, 0.1, 0.2], 8);
  assert.deepEqual(v.dims, [7, 5, 6]);
  assert.deepEqual(v.spacing.map((x) => +x.toFixed(6)), [0.3, 0.2, 0.2]);
  assert.equal(v.data.constructor, Uint16Array);
  assert.ok(v.data[0] < v.data[6]);
  const b = new VolumeBuilder(4, 4, 4, 256);
  assert.deepEqual(b.dims, [4, 4, 4]);
});

test('synthetic generation is deterministic', () => {
  for (const s of SPECIMENS) {
    const a = generate(s.id, 24, 5);
    const b = generate(s.id, 24, 5);
    assert.deepEqual(a.dims, [24, 24, 24]);
    assert.equal(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)), 0, s.id);
    let mn = 255, mx = 0;
    for (const x of a.data) { if (x < mn) mn = x; if (x > mx) mx = x; }
    assert.ok(mx - mn > 60, `${s.id} has contrast`);
  }
});
