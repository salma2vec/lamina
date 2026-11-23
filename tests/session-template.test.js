import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, toSession, fromSession } from '../src/state.js';
import { getTemplate, defaultValues, cleanValues } from '../src/templates/index.js';

test('a template session stores its id and values and restores them', () => {
  const t = getTemplate('ammonite');
  const values = { ...defaultValues(t), whorls: 3.5, fill: 'scatter' };
  const params = defaultParams();
  params.outline.shape = 'hexagon';
  const json = JSON.stringify(toSession(params, { kind: 'template', name: t.name, id: t.id, values }));
  const { params: p, source } = fromSession(JSON.parse(json));
  assert.equal(source.kind, 'template');
  assert.equal(source.id, 'ammonite');
  assert.equal(source.note, undefined);
  assert.deepEqual(cleanValues(getTemplate(source.id), source.values), values);
  assert.equal(p.outline.shape, 'hexagon');
});

test('template values out of range are clamped on restore, and unknown keys are dropped', () => {
  const t = getTemplate('nerinea');
  const obj = toSession(defaultParams(), { kind: 'template', name: t.name, id: t.id, values: { whorls: 99, plaits: 'many', extra: 1 } });
  const { source } = fromSession(JSON.parse(JSON.stringify(obj)));
  const v = cleanValues(getTemplate(source.id), source.values);
  assert.equal(v.whorls, 12);
  assert.equal(v.plaits, t.params.find((q) => q.key === 'plaits').default);
  assert.equal('extra' in v, false);
});

test('a template session without an id has no source', () => {
  const obj = toSession(defaultParams(), null);
  obj.source = { kind: 'template', name: 'X', values: {} };
  assert.equal(fromSession(obj).source, null);
});
