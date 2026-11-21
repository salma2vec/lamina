import test from 'node:test';
import assert from 'node:assert/strict';
import { histogram, initialThresholds, quantise, levelCounts } from '../src/cane/quantise.js';
import { erode, dilate, open, close, removeSmallRegions, removeThinRegions, modeFilter, distanceTransform, smallestFeature, smoothLabels, cleanup, OUTSIDE } from '../src/cane/morph.js';
import { outlineMask, outlineArea, insideOutline } from '../src/cane/outline.js';
import { cropSlice } from '../src/cane/crop.js';
import { traceContours } from '../src/cane/vectorise.js';
import { loopArea } from '../src/geom/slice-mesh.js';
import { defaultMapping, PRESETS } from '../src/cane/palette.js';
import { layoutTiles, stretchedBox } from '../src/pattern/tile.js';

test('quantise applies ascending thresholds', () => {
  const q = quantise([0, 0.2, 0.39, 0.4, 0.8, 1], [0.4, 0.7]);
  assert.deepEqual([...q], [0, 0, 0, 1, 2, 2]);
  const m = quantise([0.5, 0.5], [0.4], new Uint8Array([1, 0]));
  assert.deepEqual([...m], [1, 255]);
  assert.deepEqual(levelCounts(new Uint8Array([0, 1, 1, 255, 2]), 3), [1, 2, 1]);
});

test('k-means thresholds separate a trimodal histogram', () => {
  const vals = [];
  for (let i = 0; i < 300; i++) vals.push(0.1 + (i % 7) * 0.003, 0.5 + (i % 5) * 0.003, 0.9 - (i % 3) * 0.003);
  const t = initialThresholds(histogram(vals, null, 128), 3);
  assert.equal(t.length, 2);
  assert.ok(t[0] > 0.15 && t[0] < 0.48, `t0=${t[0]}`);
  assert.ok(t[1] > 0.52 && t[1] < 0.88, `t1=${t[1]}`);
  for (const L of [2, 4, 6]) {
    const tt = initialThresholds(histogram(vals, null, 128), L);
    assert.equal(tt.length, L - 1);
    for (let i = 1; i < tt.length; i++) assert.ok(tt[i] > tt[i - 1]);
  }
});

const square = (w, h, x0, y0, x1, y1, v = 1, bg = 0) => {
  const a = new Uint8Array(w * h).fill(bg);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = v;
  return a;
};
const count = (a, v) => a.reduce((s, x) => s + (x === v ? 1 : 0), 0);

test('erode and dilate on a square', () => {
  const a = square(20, 20, 5, 5, 15, 15);
  assert.equal(count(erode(a, 20, 20, 1), 1), 8 * 8);
  const d = dilate(a, 20, 20, 1);
  assert.ok(count(d, 1) > 100 && count(d, 1) <= 12 * 12);
});

test('opening removes a thin line; closing fills a thin gap', () => {
  const a = square(30, 30, 5, 5, 25, 25);
  for (let y = 0; y < 30; y++) a[y * 30 + 2] = 1; // 1-px line outside the square
  const o = open(a, 30, 30, 1);
  assert.equal(o[10 * 30 + 2], 0);
  assert.equal(o[15 * 30 + 15], 1);
  const b = square(30, 30, 5, 5, 25, 25);
  for (let y = 5; y < 25; y++) b[y * 30 + 15] = 0; // 1-px slit
  const c = close(b, 30, 30, 1);
  assert.equal(c[15 * 30 + 15], 1);
});

test('small regions merge into neighbours (specks and pinholes)', () => {
  const a = square(40, 40, 0, 0, 40, 40, 0);
  a[10 * 40 + 10] = 1; // speck
  const big = square(40, 40, 20, 20, 36, 36, 2);
  for (let i = 0; i < a.length; i++) if (big[i] === 2) a[i] = 2;
  a[28 * 40 + 28] = 0; // pinhole inside the big region
  const out = removeSmallRegions(a, 40, 40, 4);
  assert.equal(out[10 * 40 + 10], 0);
  assert.equal(out[28 * 40 + 28], 2);
  assert.equal(count(out, 2), 16 * 16);
});

test('outside pixels are never modified', () => {
  const a = square(10, 10, 0, 0, 10, 10, 1);
  a[0] = OUTSIDE;
  for (const f of [(x) => erode(x, 10, 10, 2), (x) => modeFilter(x, 10, 10, 2, 3), (x) => smoothLabels(x, 10, 10, 1.5, 3), (x) => removeSmallRegions(x, 10, 10, 5)]) {
    assert.equal(f(a)[0], OUTSIDE);
  }
});

test('distance transform and smallest feature width', () => {
  const m = square(40, 40, 10, 10, 30, 30);
  const d = distanceTransform(m, 40, 40);
  assert.equal(d[20 * 40 + 20], 10);
  assert.equal(d[10 * 40 + 10], 1);
  const l = square(40, 40, 0, 0, 40, 40, 0);
  for (let y = 5; y < 35; y++) for (let x = 20; x < 23; x++) l[y * 40 + x] = 1; // 3-px wide bar
  const f = smallestFeature(l, 40, 40);
  assert.equal(f.level, 1);
  assert.equal(f.width, 3);
});

test('thin regions merge away; wide ones stay', () => {
  const l = square(60, 60, 0, 0, 60, 60, 0);
  for (let y = 5; y < 55; y++) for (let x = 10; x < 12; x++) l[y * 60 + x] = 1; // 2 px wide, long
  for (let y = 20; y < 40; y++) for (let x = 30; x < 50; x++) l[y * 60 + x] = 2; // 20 px block
  const out = removeThinRegions(l, 60, 60, 5);
  assert.equal(count(out, 1), 0);
  assert.equal(count(out, 2), 400);
  const c = cleanup(l, 60, 60, { median: 0, openClose: 0, smooth: 0, minWidth: 5, levels: 3 });
  assert.ok(smallestFeature(c, 60, 60).width >= 5);
});

test('outline edge does not count as a boundary for width', () => {
  const l = square(20, 20, 0, 0, 20, 20, 1);
  for (let i = 0; i < 20; i++) l[i] = OUTSIDE; // top row outside
  for (let i = 20; i < 40; i++) l[i] = 0; // 1-px band along the edge
  assert.equal(smallestFeature(l, 20, 20).width, 1);
});

test('outline area: analytic vs raster mask', () => {
  const G = 400;
  for (const shape of ['circle', 'square', 'hexagon', 'triangle', 'rectangle']) {
    const m = outlineMask(shape, G, 0.6);
    const rasterArea = count(m, 1) / (G * G) * 50 * 50;
    const exact = outlineArea(shape, 50, 0.6);
    assert.ok(Math.abs(rasterArea - exact) / exact < 0.01, shape);
  }
  assert.ok(insideOutline('triangle', 0, 0));
  assert.ok(!insideOutline('triangle', 0.45, 0.3));
});

test('crop with zoom 1 and no rotation reproduces the slice', () => {
  const n = 32;
  const data = new Float32Array(n * n).map((_, i) => (i % n) / n);
  const out = cropSlice({ data, w: n, h: n, px: 1 }, n, { zoom: 1, rotation: 0, ox: 0, oy: 0 });
  assert.ok(Math.abs(out[5 * n + 10] - data[5 * n + 10]) < 1e-6);
  const rot = cropSlice({ data, w: n, h: n, px: 1 }, n, { zoom: 1, rotation: 90, ox: 0, oy: 0 });
  // Rotated by 90 degrees, the x gradient becomes a y gradient.
  assert.ok(Math.abs(rot[5 * n + 10] - rot[5 * n + 20]) < 1e-6);
});

test('marching squares contour area matches region area', () => {
  const f = new Float32Array(30 * 30);
  for (let y = 5; y < 25; y++) for (let x = 8; x < 20; x++) f[y * 30 + x] = 1;
  for (let y = 10; y < 15; y++) for (let x = 12; x < 16; x++) f[y * 30 + x] = 0;
  const loops = traceContours(f, 30, 30, 0.5);
  assert.equal(loops.length, 2);
  const areas = loops.map((l) => Math.abs(loopArea(new Float64Array(l)))).sort((a, b) => b - a);
  // Binary marching squares cuts each corner by 1/8 px.
  assert.ok(Math.abs(areas[0] - 240) < 1);
  assert.ok(Math.abs(areas[1] - 20) < 1);
});

test('default mapping sends low levels to dark clays', () => {
  const sw = PRESETS.sandalwood.swatches;
  assert.deepEqual(defaultMapping(3, sw), [2, 1, 0]);
  assert.deepEqual(defaultMapping(2, sw), [2, 0]);
  assert.equal(defaultMapping(6, sw).length, 6);
});

test('tile layouts', () => {
  const g = layoutTiles({ layout: 'grid', width: 100, height: 100, tileW: 10, tileH: 10 });
  assert.ok(g.tiles.length >= 100);
  const m = layoutTiles({ layout: 'mirror', width: 40, height: 40, tileW: 10, tileH: 10 });
  assert.ok(m.tiles.some((t) => t.flipX) && m.tiles.some((t) => t.flipY));
  const r = layoutTiles({ layout: 'radial', width: 100, height: 100, tileW: 10, tileH: 10 });
  assert.ok(r.tiles.length > 20);
  const b = stretchedBox(10, 10, 2, 0);
  const c = stretchedBox(10, 10, 2, 45, [[0.5, 0], [0, 0.5], [-0.5, 0], [0, -0.5]]);
  assert.ok(c.w < stretchedBox(10, 10, 2, 45).w);
  assert.ok(Math.abs(b.w - 20) < 1e-9 && Math.abs(b.h - 5) < 1e-9);
});
