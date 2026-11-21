/** STL parser (binary and ASCII). */

/**
 * Parse an STL file.
 * @param {ArrayBuffer} buf
 * @returns {Float32Array} triangle soup, 9 floats per triangle
 */
export function parseSTL(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const count = dv.getUint32(80, true);
    if (84 + count * 50 === buf.byteLength) return parseBinary(dv, count);
  }
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 512)));
  if (/^\s*solid/i.test(head)) return parseASCII(new TextDecoder().decode(buf));
  if (buf.byteLength >= 84) throw new Error('STL size does not match its triangle count. The file may be truncated.');
  throw new Error('This is not a valid STL file.');
}

function parseBinary(dv, count) {
  if (count === 0) throw new Error('The STL file contains no triangles.');
  const out = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
  }
  return out;
}

function parseASCII(text) {
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const v = [];
  let m;
  while ((m = re.exec(text))) v.push(+m[1], +m[2], +m[3]);
  if (v.length === 0 || v.length % 9) throw new Error('The ASCII STL file has no complete triangles.');
  return new Float32Array(v);
}
