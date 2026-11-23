import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate, defaultValues, cleanValues } from '../src/templates/index.js';
import { OUTSIDE } from '../src/cane/morph.js';
import { levelCounts } from '../src/cane/quantise.js';
import { insideOutline } from '../src/cane/outline.js';

const G = 160;
const ctxFor = (t, size = 80) => ({ G, size, shape: t.outline.shape, aspect: t.outline.aspect });

for (const t of TEMPLATES) {
  test(`${t.id}: every clay appears and the outline is respected`, () => {
    const out = t.generate(defaultValues(t), ctxFor(t));
    assert.equal(out.labels.length, G * G);
    assert.equal(out.levels, t.clays.length);
    const counts = levelCounts(out.labels, out.levels);
    counts.forEach((n, i) => assert.ok(n > 0, `${t.clays[i].name} is missing`));
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = (i + 0.5) / G - 0.5, y = 0.5 - (j + 0.5) / G;
      const inside = insideOutline(t.outline.shape, x, y, t.outline.aspect);
      const l = out.labels[j * G + i];
      assert.equal(l === OUTSIDE, !inside);
      if (inside) assert.ok(l < out.levels);
    }
  });

  test(`${t.id}: output is deterministic`, () => {
    const a = t.generate(defaultValues(t), ctxFor(t));
    const b = t.generate(defaultValues(t), ctxFor(t));
    assert.deepEqual(a.labels, b.labels);
  });

  test(`${t.id}: a thicker wall sheet gives more wall clay`, () => {
    const key = 'wall';
    const v = defaultValues(t);
    const thin = t.generate({ ...v, [key]: 0.8 }, ctxFor(t));
    const thick = t.generate({ ...v, [key]: 2.5 }, ctxFor(t));
    assert.ok(levelCounts(thick.labels, thick.levels)[1] > levelCounts(thin.labels, thin.levels)[1]);
  });

  test(`${t.id}: assembly lists parts and steps`, () => {
    const { assembly } = t.generate(defaultValues(t), ctxFor(t));
    assert.ok(assembly.parts.length >= 3);
    assert.ok(assembly.steps.length >= 4);
    for (const p of assembly.parts) assert.ok(p.name && p.size);
    for (const s of assembly.steps) assert.ok(!/NaN|Infinity|undefined/.test(s), s);
  });
}

test('ammonite: wedge count follows chambers per whorl', () => {
  const t = getTemplate('ammonite');
  const v = defaultValues(t);
  const few = t.generate({ ...v, chambers: 6 }, ctxFor(t)).assembly.wedges;
  const many = t.generate({ ...v, chambers: 14 }, ctxFor(t)).assembly.wedges;
  assert.ok(many > few);
});

test('ammonite: a full body chamber turns the outer whorl to matrix', () => {
  const t = getTemplate('ammonite');
  const v = defaultValues(t);
  const none = levelCounts(t.generate({ ...v, body: 0 }, ctxFor(t)).labels, 6)[0];
  const lots = levelCounts(t.generate({ ...v, body: 0.75 }, ctxFor(t)).labels, 6)[0];
  assert.ok(lots > none);
});

test('nerinea: plaits add wall clay', () => {
  const t = getTemplate('nerinea');
  const v = defaultValues(t);
  const none = levelCounts(t.generate({ ...v, plaits: 'none' }, ctxFor(t)).labels, 4)[1];
  const three = levelCounts(t.generate({ ...v, plaits: 'three' }, ctxFor(t)).labels, 4)[1];
  assert.ok(three > none);
});

test('cleanValues clamps ranges and rejects unknown choices', () => {
  const t = getTemplate('nerinea');
  const v = cleanValues(t, { whorls: 99, plaits: 'seven', depth: 'deep' });
  assert.equal(v.whorls, 12);
  assert.equal(v.plaits, 'three');
  assert.equal(v.depth, 0.4);
});
