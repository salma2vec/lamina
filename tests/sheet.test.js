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
  assert.match(svg, /<rect x="[\d.]+" y="[\d.]+" width="10" height="1.2"/);
  assert.match(svg, />50 mm</);
  assert.match(svg, /Volcanic black/);
});

test('SVG loaf shows a height dimension', () => {
  const G = 32;
  const mask = outlineMask('rectangle', G, 0.5);
  const labels = new Uint8Array(G * G).map((_, i) => (mask[i] ? 0 : 255));
  const { svg } = caneSVG({ labels, G, levels: 1, colours: ['#efeae0'], shape: 'rectangle', aspect: 0.5, size: 40 });
  assert.match(svg, />20 mm</);
});

test('print sheet lists clays and warnings', () => {
  const sheet = computeSheet(sheetInput());
  const html = printSheetHTML({ svg: '<svg></svg>', sheet, params: { size: 60, length: 150, target: 15, density: 1.9, waste: 10, minFeature: 1 }, meta: [{ label: 'Specimen', value: 'Osteon bone' }], title: 'Osteon bone' });
  assert.match(html, /Sandalwood stoneware/);
  assert.match(html, /below the 1.0 mm minimum/);
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
