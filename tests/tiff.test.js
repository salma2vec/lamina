import test from 'node:test';
import assert from 'node:assert/strict';
import { tiffPages, decodeTiffPage, tiffMeta, tiffPageComplete } from '../src/io/tiff.js';
import { writeTIFF } from './helpers.js';

const ramp = (w, h, k) => Array.from({ length: w * h }, (_, i) => (i % w) * 100 + k);

for (const le of [true, false]) {
  test(`multi-page 16-bit TIFF, ${le ? 'little' : 'big'}-endian`, () => {
    const buf = writeTIFF([ramp(5, 4, 0), ramp(5, 4, 7), ramp(5, 4, 9)], 5, 4, 16, le);
    const pages = tiffPages(buf);
    assert.equal(pages.length, 3);
    const p1 = decodeTiffPage(buf, pages[1]);
    assert.equal(p1.width, 5);
    assert.equal(p1.height, 4);
    assert.deepEqual([...p1.data.slice(0, 5)], [7, 107, 207, 307, 407]);
  });
}

test('8-bit TIFF and non-TIFF input', () => {
  const buf = writeTIFF([ramp(3, 2, 1).map((v) => v % 256)], 3, 2, 8);
  const p = decodeTiffPage(buf, tiffPages(buf)[0]);
  assert.deepEqual([...p.data], [1, 101, 201, 1, 101, 201]);
  assert.throws(() => tiffPages(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer), /not a TIFF/);
});

test('ImageJ metadata gives pixel size, slice spacing and page count', () => {
  const description = 'ImageJ=1.54f\nimages=3\nslices=3\nunit=micron\nspacing=5\nloop=false';
  const buf = writeTIFF([ramp(4, 3, 0), ramp(4, 3, 1), ramp(4, 3, 2)], 4, 3, 16, true, { description, xres: 0.4, resUnit: 1 });
  const pages = tiffPages(buf);
  assert.equal(pages.length, 3);
  const m = tiffMeta(pages[0]);
  assert.ok(Math.abs(m.pixelSize - 0.0025) < 1e-12, `pixel ${m.pixelSize}`);
  assert.ok(Math.abs(m.zSpacing - 0.005) < 1e-12);
  assert.equal(m.pages, 3);
});

test('resolution tags in centimetres and inches; editor defaults are ignored', () => {
  const cm = tiffMeta(tiffPages(writeTIFF([ramp(2, 2, 0)], 2, 2, 8, true, { xres: 200, resUnit: 3 }))[0]);
  assert.ok(Math.abs(cm.pixelSize - 0.05) < 1e-12);
  const dpi = tiffMeta(tiffPages(writeTIFF([ramp(2, 2, 0)], 2, 2, 8, true, { xres: 2540, resUnit: 2 }))[0]);
  assert.ok(Math.abs(dpi.pixelSize - 0.01) < 1e-12);
  assert.equal(tiffMeta(tiffPages(writeTIFF([ramp(2, 2, 0)], 2, 2, 8, true, { xres: 72, resUnit: 2 }))[0]).pixelSize, null);
  assert.equal(tiffMeta(tiffPages(writeTIFF([ramp(2, 2, 0)], 2, 2, 8))[0]).pixelSize, null);
});

test('a page cut short by truncation is reported', () => {
  const buf = writeTIFF([ramp(16, 16, 0)], 16, 16, 16);
  const cut = buf.slice(0, buf.byteLength - 100);
  const pages = tiffPages(cut);
  assert.equal(tiffPageComplete(cut, pages[0]), false);
  assert.throws(() => decodeTiffPage(cut, pages[0]), /truncated/);
});
