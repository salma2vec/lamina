/** STL parser (binary and ASCII). */

/**
 * Parse an STL file.
 * @param {ArrayBuffer} buf
 * @param {(msg:string)=>void} [warn] receives a note when the file looks cut short but can still be used
 * @returns {Float32Array} triangle soup, 9 floats per triangle
 */
export function parseSTL(buf, warn) {
  const dv = new DataView(buf);
  const count = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const expected = 84 + count * 50;
  if (buf.byteLength >= 84 && expected === buf.byteLength) return parseBinary(dv, count);
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096)));
  if (/^\s*solid/i.test(head) && /facet|endsolid/i.test(head)) return parseASCII(new TextDecoder().decode(buf), warn);
  if (buf.byteLength >= 84 && count > 0) {
    const held = Math.floor((buf.byteLength - 84) / 50);
    // Extra bytes after the last triangle are ignored.
    if (expected < buf.byteLength) return parseBinary(dv, count);
    if (count <= held * 10 + 10) throw new Error(`The STL header lists ${count} triangles, but the file holds only ${held}. The file may be truncated.`);
  }
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

function parseASCII(text, warn) {
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const v = [];
  let m;
  while ((m = re.exec(text))) v.push(+m[1], +m[2], +m[3]);
  let n = v.length - (v.length % 9);
  if (!/endsolid/i.test(text.slice(-4096))) {
    // The last triangle may hold a number that was cut in half.
    n = Math.max(0, n - 9);
    if (n && warn) warn('The STL file has no "endsolid" line, so it may be truncated. The mesh can have holes.');
  }
  if (!n) throw new Error('The ASCII STL file has no complete triangles.');
  return new Float32Array(v.slice(0, n));
}
