import test from 'node:test';
import assert from 'node:assert/strict';
import { tiffPages, decodeTiffPage } from '../src/io/tiff.js';
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
