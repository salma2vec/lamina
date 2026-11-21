import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseSTL } from '../src/io/stl.js';
import { parsePLY } from '../src/io/ply.js';
import { parseOBJ } from '../src/io/obj.js';
import { parseNRRD, spaceUnitScale } from '../src/io/nrrd.js';
import { classifyFiles } from '../src/io/detect.js';
import { cubeSoup, toBinarySTL, toAsciiSTL } from './helpers.js';

const close = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('STL binary round trip', () => {
  const soup = cubeSoup(2);
  const out = parseSTL(toBinarySTL(soup));
  assert.equal(out.length, soup.length);
  out.forEach((v, i) => close(v, soup[i]));
});

test('STL ASCII round trip', () => {
  const soup = cubeSoup(3);
  const out = parseSTL(toAsciiSTL(soup));
  assert.equal(out.length, 12 * 9);
  out.forEach((v, i) => close(v, soup[i]));
});

test('STL rejects garbage', () => {
  assert.throws(() => parseSTL(new Uint8Array(120).fill(7).buffer), /STL/);
});

const plyQuad = (format) => {
  const verts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
  const head = `ply\nformat ${format} 1.0\ncomment test\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n`;
  if (format === 'ascii') {
    return new TextEncoder().encode(head + verts.map((v) => v.join(' ') + ' 200').join('\n') + '\n4 0 1 2 3\n').buffer;
  }
  const h = new TextEncoder().encode(head);
  const buf = new ArrayBuffer(h.length + 4 * 13 + 1 + 16);
  new Uint8Array(buf).set(h);
  const dv = new DataView(buf);
  let o = h.length;
  for (const v of verts) { for (const c of v) { dv.setFloat32(o, c, true); o += 4; } dv.setUint8(o++, 200); }
  dv.setUint8(o++, 4);
  for (const i of [0, 1, 2, 3]) { dv.setInt32(o, i, true); o += 4; }
  return buf;
};

test('PLY ASCII quad is fan-triangulated', () => {
  const out = parsePLY(plyQuad('ascii'));
  assert.equal(out.length, 18);
  assert.deepEqual([...out.slice(0, 9)], [0, 0, 0, 1, 0, 0, 1, 1, 0]);
});

test('PLY binary little-endian with extra vertex property', () => {
  const out = parsePLY(plyQuad('binary_little_endian'));
  assert.equal(out.length, 18);
  assert.deepEqual([...out.slice(9)], [0, 0, 0, 1, 1, 0, 0, 1, 0]);
});

test('OBJ with slashes, negative indices and polygons', () => {
  const text = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nf 1/1/1 2/1/1 3/1/1 4/1/1\nf -4 -3 -2\n';
  const out = parseOBJ(text);
  assert.equal(out.length, 27);
  assert.deepEqual([...out.slice(18)], [0, 0, 0, 1, 0, 0, 1, 1, 0]);
  assert.throws(() => parseOBJ('v 0 0 0\nf 1 2 3\n'), /missing vertex/);
});

const nrrdBytes = (type, Ctor, enc, extra = '') => {
  const dims = [4, 3, 2];
  const data = new Ctor(24);
  for (let i = 0; i < 24; i++) data[i] = i * (Ctor === Float32Array ? 0.5 : 1) - (Ctor === Int16Array ? 5 : 0);
  let body = new Uint8Array(data.buffer);
  if (enc === 'gzip') body = gzipSync(body);
  const head = new TextEncoder().encode(`NRRD0004\n# test\ntype: ${type}\ndimension: 3\nsizes: ${dims.join(' ')}\nendian: little\nencoding: ${enc}\n${extra}\n`);
  const out = new Uint8Array(head.length + body.length);
  out.set(head); out.set(body, head.length);
  return { buf: out.buffer, data };
};

for (const [type, Ctor] of [['uint8', Uint8Array], ['uint16', Uint16Array], ['int16', Int16Array], ['float', Float32Array]]) {
  for (const enc of ['raw', 'gzip']) {
    test(`NRRD ${type} ${enc}`, async () => {
      const { buf, data } = nrrdBytes(type, Ctor, enc, 'space directions: (0.5,0,0) (0,0.5,0) (0,0,2)\n');
      const v = await parseNRRD(buf);
      assert.deepEqual(v.dims, [4, 3, 2]);
      assert.deepEqual(v.spacing, [0.5, 0.5, 2]);
      assert.deepEqual([...v.data], [...data]);
    });
  }
}

test('NRRD spacings field and big-endian', async () => {
  const data = new Uint16Array([1, 256, 513, 4]);
  const be = new Uint8Array(8);
  const dv = new DataView(be.buffer);
  data.forEach((v, i) => dv.setUint16(i * 2, v, false));
  const head = new TextEncoder().encode('NRRD0004\ntype: ushort\ndimension: 3\nsizes: 2 2 1\nendian: big\nencoding: raw\nspacings: 0.1 0.1 0.3\n\n');
  const buf = new Uint8Array(head.length + 8);
  buf.set(head); buf.set(be, head.length);
  const v = await parseNRRD(buf.buffer);
  assert.deepEqual([...v.data], [1, 256, 513, 4]);
  assert.deepEqual(v.spacing, [0.1, 0.1, 0.3]);
});

test('NRRD space units convert to millimetres', async () => {
  const { buf } = nrrdBytes('uint8', Uint8Array, 'raw', 'space directions: (0,-40,0) (40,0,0) (0,0,120)\nspace units: "microns" "microns" "microns"\n');
  const v = await parseNRRD(buf);
  v.spacing.forEach((x, i) => close(x, [0.04, 0.04, 0.12][i], 1e-12));
  const mm = await parseNRRD(nrrdBytes('uint8', Uint8Array, 'raw', 'spacings: 0.5 0.5 1\nunits: "mm" "mm" "mm"\n').buf);
  assert.deepEqual(mm.spacing, [0.5, 0.5, 1]);
  assert.equal(spaceUnitScale('"cm" "cm" "cm"'), 10);
  assert.equal(spaceUnitScale(undefined), 1);
});

test('2D NRRD keeps its pixel size', async () => {
  const head = new TextEncoder().encode('NRRD0004\ntype: uint8\ndimension: 2\nsizes: 3 2\nspace directions: (0.25,0) (0,0.25)\nencoding: raw\n\n');
  const buf = new Uint8Array(head.length + 6);
  buf.set(head);
  const v = await parseNRRD(buf.buffer);
  assert.deepEqual(v.dims, [3, 2, 1]);
  assert.deepEqual(v.spacing, [0.25, 0.25, 0.25]);
});

test('damaged gzip NRRD gives a plain error', async () => {
  const { buf } = nrrdBytes('uint16', Uint16Array, 'gzip');
  await assert.rejects(parseNRRD(buf.slice(0, buf.byteLength - 20)), /damaged or incomplete/);
});

test('NRRD rejects detached data and bad types', async () => {
  const head = (t) => new TextEncoder().encode(`NRRD0004\ntype: ${t}\ndimension: 3\nsizes: 1 1 1\nencoding: raw\n\n\0\0\0\0\0\0\0\0`).buffer;
  await assert.rejects(parseNRRD(head('complex')), /Unsupported NRRD type/);
  const det = new TextEncoder().encode('NRRD0004\ntype: uchar\ndimension: 3\nsizes: 1 1 1\nencoding: raw\ndata file: x.raw\n\n').buffer;
  await assert.rejects(parseNRRD(det), /Detached/);
});

test('file classification and natural sort', () => {
  const r = classifyFiles([{ name: 'slice10.png' }, { name: 'slice2.png' }, { name: 'slice1.png' }]);
  assert.equal(r.kind, 'sequence');
  assert.deepEqual(r.files.map((f) => f.name), ['slice1.png', 'slice2.png', 'slice10.png']);
  assert.equal(classifyFiles([{ name: 'a.STL' }]).kind, 'mesh');
  assert.equal(classifyFiles([{ name: 'a.nrrd' }]).kind, 'nrrd');
  assert.equal(classifyFiles([{ name: 'a.jpg' }]).kind, 'image');
  assert.throws(() => classifyFiles([{ name: 'a.docx' }]), /not a supported/);
  assert.throws(() => classifyFiles([{ name: 'a.png' }, { name: 'b.stl' }]), /Do not mix/);
});
