import test from 'node:test';
import assert from 'node:assert/strict';
import { reductionRatio, clayMass, firedSize, compatibility, computeSheet } from '../src/sheet/quantities.js';
import { caneSVG } from '../src/sheet/svg.js';
import { printSheetHTML } from '../src/sheet/print.js';
import { outlineMask } from '../src/cane/outline.js';
import { PRESETS } from '../src/cane/palette.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('reduction ratio and fired size', () => {
  close(reductionRatio(60, 15), 4);
  close(firedSize(100, 13), 87);
  assert.ok(Number.isNaN(reductionRatio(60, 0)));
});

test('clay mass: area * length * density + waste', () => {
  // 1000 mm^2 * 100 mm = 100 cm^3; * 1.9 = 190 g; +10% = 209 g
  close(clayMass(1000, 100, 1.9, 10), 209, 1e-9);
  close(clayMass(1000, 100, 1.9, 0), 190, 1e-9);
});

test('shrinkage compatibility warning above 1.5 points', () => {
  assert.equal(compatibility([13, 12, 12]).warn, false);
  assert.equal(compatibility([13, 11.4]).warn, true);
  assert.equal(compatibility([13, 11.5]).warn, false);
  assert.equal(compatibility([12]).warn, false);
});

const sheetInput = () => ({
  counts: [100, 300, 600],
  mapping: [2, 1, 0],
  swatches: PRESETS.sandalwood.swatches,
  shape: 'circle', aspect: 0.6, size: 60, length: 150, target: 15,
  density: 1.9, waste: 10, minFeature: 1, smallestPx: 8, grid: 320,
});

test('build sheet aggregates per clay', () => {
  const s = computeSheet(sheetInput());
  const area = Math.PI * 30 * 30;
  close(s.area, area, 1e-9);
  assert.equal(s.clays.length, 3);
  const porcelain = s.clays.find((c) => c.name === 'Porcelain');
  close(porcelain.fraction, 0.6);
  close(porcelain.mass, ((0.6 * area * 150) / 1000) * 1.9 * 1.1, 1e-9);
  close(s.ratio, 4);
  close(s.reducedLength, 150 * 16);
  close(s.smallestBuild, (8 * 60) / 320);
  close(s.smallestReduced, 1.5 / 4);
  close(s.smallestFired, (1.5 / 4) * 0.87);
  assert.equal(s.featureWarn, true);
  close(s.minBuildFeature, 4);
  assert.equal(s.compat.warn, false);
  close(porcelain.fired, 15 * 0.87, 1e-9);
  close(s.totalMass, s.clays.reduce((a, c) => a + c.mass, 0));
});

test('two levels mapped to one clay are summed', () => {
  const p = sheetInput();
  p.mapping = [2, 2, 0];
  const s = computeSheet(p);
  assert.equal(s.clays.length, 2);
  close(s.clays.find((c) => c.index === 2).fraction, 0.4);
});

test('SVG export is in millimetres at 1:1', () => {
  const G = 64;
  const mask = outlineMask('circle', G);
  const labels = new Uint8Array(G * G).map((_, i) => (mask[i] ? ((i % G) < G / 2 ? 0 : 1) : 255));
  const sheet = computeSheet({ ...sheetInput(), counts: [1, 1], mapping: [2, 0], size: 50 });
  const { svg, width, height } = caneSVG({ labels, G, levels: 2, colours: ['#2a2622', '#efeae0'], shape: 'circle', aspect: 0.6, size: 50, sheet, title: 'Test' });
  assert.match(svg, new RegExp(`width="${width}mm"`));
  assert.match(svg, new RegExp(`height="${height}mm"`));
  assert.match(svg, new RegExp(`viewBox="0 0 ${width} ${height}"`));
  // The outline spans exactly 50 mm in user units (= mm).
  const d = svg.match(/id="cane-outline" d="([^"]+)"/)[1];
  const xs = [...d.matchAll(/([-\d.]+) ([-\d.]+)/g)].map((m) => +m[1]);
  close(Math.max(...xs) - Math.min(...xs), 50, 0.02);
  // A 100 mm ruler with 101 millimetre ticks.
  const ruler = svg.match(/<g id="scale-bar"><path d="M([\d.]+) ([\d.]+)H([\d.]+)([^"]*)"/);
  close(+ruler[3] - +ruler[1], 100, 1e-9);
  assert.equal((ruler[4].match(/v/g) || []).length, 101);
  assert.match(svg, />50 mm</);
  assert.match(svg, /Volcanic black/);
});

test('SVG loaf shows a height dimension that fits on the page', () => {
  const G = 32;
  const mask = outlineMask('rectangle', G, 0.5);
  const labels = new Uint8Array(G * G).map((_, i) => (mask[i] ? 0 : 255));
  const { svg } = caneSVG({ labels, G, levels: 1, colours: ['#efeae0'], shape: 'rectangle', aspect: 0.5, size: 40 });
  assert.match(svg, />20 mm</);
  // A wide loaf: the height label must stay inside the page width.
  const wide = caneSVG({ labels, G, levels: 1, colours: ['#efeae0'], shape: 'rectangle', aspect: 0.5, size: 140 });
  const x = +wide.svg.match(/<text x="([\d.]+)" y="[\d.]+" font-family="Menlo, monospace" font-size="2.8" fill="#1b1a18">70 mm/)[1];
  assert.ok(x + 12 < wide.width - 3, `label at ${x} on a ${wide.width} mm page`);
});

test('compact SVG for the printed sheet drops the title and margins', () => {
  const G = 32;
  const mask = outlineMask('circle', G);
  const labels = new Uint8Array(G * G).map((_, i) => (mask[i] ? 0 : 255));
  const full = caneSVG({ labels, G, levels: 1, colours: ['#efeae0'], shape: 'circle', size: 80, title: 'T', key: false });
  const compact = caneSVG({ labels, G, levels: 1, colours: ['#efeae0'], shape: 'circle', size: 80, title: 'T', key: false, compact: true });
  assert.match(full.svg, />T</);
  assert.doesNotMatch(compact.svg, />T</);
  assert.ok(compact.height < full.height - 15);
  const d = compact.svg.match(/id="cane-outline" d="([^"]+)"/)[1];
  const xs = [...d.matchAll(/([-\d.]+) ([-\d.]+)/g)].map((m) => +m[1]);
  close(Math.max(...xs) - Math.min(...xs), 80, 0.02);
});

test('print sheet lists clays and warnings', () => {
  const sheet = computeSheet(sheetInput());
  const html = printSheetHTML({ svg: '<svg></svg>', sheet, params: { size: 60, length: 150, target: 15, density: 1.9, waste: 10, minFeature: 1 }, meta: [{ label: 'Specimen', value: 'Osteon bone' }], title: 'Osteon bone' });
  assert.match(html, /Sandalwood stoneware/);
  assert.match(html, /below the 1.0 mm minimum/);
  assert.doesNotMatch(html, /larger than the printable area/);
  const big = printSheetHTML({ svg: '<svg></svg>', sheet, params: { size: 200, length: 150, target: 15, density: 1.9, waste: 10, minFeature: 1 }, meta: [], title: 'Big', fit: { page: 'A4', width: 228, height: 260, printWidth: 186, printHeight: 273 } });
  assert.match(big, /228 × 260 mm\. It is larger than the printable area of A4 \(186 × 273 mm\)/);
  assert.doesNotMatch(html, /ps-steps/);
  const built = printSheetHTML({
    svg: '<svg></svg>', sheet, params: { size: 60, length: 150, target: 15, density: 1.9, waste: 10, minFeature: 1 }, meta: [], title: 'Ammonite',
    assembly: { parts: [{ name: 'Chamber wedges', qty: 12, size: '4.0–9.0 mm', clay: null }, { name: 'Septa sheet', size: '1.2 mm thick', clay: 'Septa <black>', colour: '#2b2420' }], steps: ['Roll the wedges.', 'Wrap them.'] },
  });
  assert.match(built, /<td>Mixed<\/td><td class="num">12<\/td>/);
  assert.match(built, /Septa &lt;black&gt;/);
  assert.match(built, /<ol class="ps-steps"><li>Roll the wedges\.<\/li><li>Wrap them\.<\/li><\/ol>/);
});

import { defaultParams, toSession, fromSession } from '../src/state.js';

test('session round trip keeps parameters and drops data', () => {
  const p = defaultParams();
  p.plane = { axis: 'xz', offset: 3.5, tiltA: 12, tiltB: -4 };
  p.levels = 4; p.thresholds = [0.2, 0.4, 0.6]; p.mapping = [2, 1, 1, 0];
  const s = toSession(p, { kind: 'volume', name: 'scan.nrrd', volume: { data: new Uint8Array(10) } });
  const json = JSON.parse(JSON.stringify(s));
  assert.equal(json.source.volume, undefined);
  assert.match(json.source.note, /Load the same file/);
  const back = fromSession(json);
  assert.deepEqual(back.params.plane, p.plane);
  assert.deepEqual(back.params.thresholds, [0.2, 0.4, 0.6]);
  assert.deepEqual(back.params.mapping, [2, 1, 1, 0]);
  assert.throws(() => fromSession({ app: 'other' }), /not a Lamina session/);
  const syn = fromSession(JSON.parse(JSON.stringify(toSession(p, { kind: 'volume', name: 'Ammonite', synthetic: { id: 'ammonite', seed: 1 } }))));
  assert.deepEqual(syn.source.synthetic, { id: 'ammonite', seed: 1 });
});

test('session keeps a voxel size the user typed for a file source', () => {
  const p = defaultParams();
  const s = JSON.parse(JSON.stringify(toSession(p, { kind: 'volume', name: 'stack.tif', scale: 0.025 })));
  assert.equal(fromSession(s).source.scale, 0.025);
  assert.equal(toSession(p, { kind: 'volume', name: 'Osteon bone', synthetic: { id: 'osteon', seed: 1 }, scale: 2 }).source.scale, undefined);
  assert.equal(fromSession({ ...s, source: { ...s.source, scale: -1 } }).source.scale, undefined);
});

import { hashSeed, pickStudy, localDateString } from '../src/daily.js';

test('daily study is deterministic per date', () => {
  const a = pickStudy(hashSeed('2026-11-22'));
  const b = pickStudy(hashSeed('2026-11-22'));
  assert.deepEqual(a.plane, b.plane);
  assert.equal(a.id, b.id);
  const days = new Set();
  for (let d = 1; d <= 28; d++) days.add(pickStudy(hashSeed(`2026-02-${String(d).padStart(2, '0')}`)).id);
  assert.ok(days.size >= 3);
  assert.match(localDateString(new Date(2026, 0, 5)), /^2026-01-05$/);
});
