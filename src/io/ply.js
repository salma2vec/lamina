/** PLY parser (ASCII, binary little-endian and binary big-endian). */

const SIZES = {
  char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8,
};

function reader(dv, type, le) {
  switch (type) {
    case 'char': case 'int8': return (o) => dv.getInt8(o);
    case 'uchar': case 'uint8': return (o) => dv.getUint8(o);
    case 'short': case 'int16': return (o) => dv.getInt16(o, le);
    case 'ushort': case 'uint16': return (o) => dv.getUint16(o, le);
    case 'int': case 'int32': return (o) => dv.getInt32(o, le);
    case 'uint': case 'uint32': return (o) => dv.getUint32(o, le);
    case 'float': case 'float32': return (o) => dv.getFloat32(o, le);
    case 'double': case 'float64': return (o) => dv.getFloat64(o, le);
    default: throw new Error(`Unknown PLY property type "${type}".`);
  }
}

/**
 * Parse a PLY file into a triangle soup. Polygons are fan-triangulated.
 * @param {ArrayBuffer} buf
 * @returns {Float32Array}
 */
export function parsePLY(buf) {
  const bytes = new Uint8Array(buf);
  const probe = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
  if (!probe.startsWith('ply')) throw new Error('This is not a PLY file. It must start with "ply".');
  const endIdx = probe.indexOf('end_header');
  if (endIdx < 0) throw new Error('The PLY header has no "end_header" line.');
  let bodyStart = endIdx + 'end_header'.length;
  if (probe[bodyStart] === '\r') bodyStart++;
  bodyStart++;
  const header = probe.slice(0, endIdx).split(/\r?\n/);
  let format = null;
  const elements = [];
  for (const line of header) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'format') format = t[1];
    else if (t[0] === 'element') elements.push({ name: t[1], count: +t[2], props: [] });
    else if (t[0] === 'property' && elements.length) {
      const el = elements[elements.length - 1];
      if (t[1] === 'list') el.props.push({ list: true, countType: t[2], type: t[3], name: t[4] });
      else el.props.push({ type: t[1], name: t[2] });
    }
  }
  const vEl = elements.find((e) => e.name === 'vertex');
  if (!vEl) throw new Error('The PLY file has no vertex element.');
  const ix = ['x', 'y', 'z'].map((k) => vEl.props.findIndex((p) => p.name === k));
  if (ix.some((i) => i < 0)) throw new Error('PLY vertices need x, y and z properties.');
  const verts = new Float32Array(vEl.count * 3);
  const faces = [];
  // Byte offset of the body in the raw buffer (header is ASCII).
  const headerBytes = new TextEncoder().encode(probe.slice(0, bodyStart)).length;

  if (format === 'ascii') {
    const text = new TextDecoder().decode(bytes.subarray(headerBytes));
    const tok = text.split(/\s+/).filter(Boolean);
    let p = 0;
    for (const el of elements) {
      for (let r = 0; r < el.count; r++) {
        const vals = [];
        for (const pr of el.props) {
          if (pr.list) {
            const c = +tok[p++];
            const l = [];
            for (let k = 0; k < c; k++) l.push(+tok[p++]);
            vals.push(l);
          } else vals.push(+tok[p++]);
        }
        if (p > tok.length) throw new Error('The ASCII PLY file ends early.');
        if (el === vEl) for (let k = 0; k < 3; k++) verts[r * 3 + k] = vals[ix[k]];
        else if (el.name === 'face') faces.push(vals[el.props.findIndex((q) => q.list)]);
      }
    }
  } else if (format === 'binary_little_endian' || format === 'binary_big_endian') {
    try {
      readBinary(buf, headerBytes, elements, vEl, ix, verts, faces, format === 'binary_little_endian');
    } catch (err) {
      if (err instanceof RangeError) throw new Error('The binary PLY file ends early. It may be truncated.');
      throw err;
    }
  } else {
    throw new Error(`Unsupported PLY format "${format}".`);
  }
  let tris = 0;
  for (const f of faces) if (f.length >= 3) tris += f.length - 2;
  if (!tris) throw new Error('The PLY file has no faces. Point clouds cannot be sliced.');
  const out = new Float32Array(tris * 9);
  let w = 0;
  for (const f of faces) {
    for (let k = 1; k + 1 < f.length; k++) {
      for (const id of [f[0], f[k], f[k + 1]]) {
        if (id < 0 || id >= vEl.count) throw new Error('A PLY face refers to a missing vertex.');
        out[w++] = verts[id * 3]; out[w++] = verts[id * 3 + 1]; out[w++] = verts[id * 3 + 2];
      }
    }
  }
  return out;
}

/** Read binary PLY elements into verts and faces. Throws RangeError when the data ends early. */
function readBinary(buf, headerBytes, elements, vEl, ix, verts, faces, le) {
  const dv = new DataView(buf);
  let o = headerBytes;
  for (const el of elements) {
    const reads = el.props.map((pr) => ({
      pr,
      r: reader(dv, pr.type, le),
      rc: pr.list ? reader(dv, pr.countType, le) : null,
    }));
    for (let r = 0; r < el.count; r++) {
      let list = null;
      for (let k = 0; k < reads.length; k++) {
        const { pr, r: rd, rc } = reads[k];
        if (o >= buf.byteLength) throw new RangeError('end of data');
        if (pr.list) {
          const c = rc(o);
          o += SIZES[pr.countType];
          const l = new Array(c);
          for (let q = 0; q < c; q++) { l[q] = rd(o); o += SIZES[pr.type]; }
          if (!list) list = l;
        } else {
          const val = rd(o);
          o += SIZES[pr.type];
          if (el === vEl) {
            const a = ix.indexOf(k);
            if (a >= 0) verts[r * 3 + a] = val;
          }
        }
      }
      if (el.name === 'face' && list) faces.push(list);
    }
  }
}
