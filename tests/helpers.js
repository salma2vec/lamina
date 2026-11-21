/** Shared test fixtures: generated meshes. */

/** Axis-aligned cube centred at the origin, as a triangle soup. */
export function cubeSoup(s = 2) {
  const h = s / 2;
  const v = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]];
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])));
}

/** UV sphere as a triangle soup. */
export function sphereSoup(r = 1, seg = 128, rings = 64) {
  const out = [];
  const p = (i, j) => {
    const th = (j / rings) * Math.PI, ph = (i / seg) * 2 * Math.PI;
    return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
    if (j > 0) out.push(...a, ...c, ...b);
    if (j < rings - 1) out.push(...a, ...d, ...c);
  }
  return new Float32Array(out);
}

/** Encode a soup as binary STL. */
export function toBinarySTL(soup) {
  const n = soup.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + t * 50 + 12 + k * 4, soup[t * 9 + k], true);
  return buf;
}

/** Encode a soup as ASCII STL. */
export function toAsciiSTL(soup) {
  let s = 'solid test\n';
  for (let t = 0; t < soup.length; t += 9) {
    s += ' facet normal 0 0 0\n  outer loop\n';
    for (let k = 0; k < 3; k++) s += `   vertex ${soup[t + k * 3]} ${soup[t + k * 3 + 1]} ${soup[t + k * 3 + 2]}\n`;
    s += '  endloop\n endfacet\n';
  }
  return new TextEncoder().encode(s + 'endsolid test\n').buffer;
}

/**
 * Minimal uncompressed greyscale TIFF writer (one page per plane).
 * @param {ArrayLike<number>[]} pages sample values per page
 * @param {number} w
 * @param {number} h
 * @param {8|16} bits
 * @param {boolean} [littleEndian]
 */
export function writeTIFF(pages, w, h, bits = 16, littleEndian = true) {
  const bpp = bits / 8;
  const entries = 9;
  const ifdSize = 2 + entries * 12 + 4;
  const dataSize = w * h * bpp;
  const total = 8 + pages.length * (ifdSize + dataSize);
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const le = littleEndian;
  dv.setUint8(0, le ? 0x49 : 0x4d); dv.setUint8(1, le ? 0x49 : 0x4d);
  dv.setUint16(2, 42, le);
  dv.setUint32(4, 8, le);
  let o = 8;
  pages.forEach((plane, p) => {
    const ifd = o, data = o + ifdSize;
    const next = p < pages.length - 1 ? data + dataSize : 0;
    dv.setUint16(ifd, entries, le);
    const tags = [[256, 3, w], [257, 3, h], [258, 3, bits], [259, 3, 1], [262, 3, 1], [273, 4, data], [277, 3, 1], [278, 3, h], [279, 4, dataSize]];
    tags.forEach(([tag, type, val], i) => {
      const e = ifd + 2 + i * 12;
      dv.setUint16(e, tag, le); dv.setUint16(e + 2, type, le); dv.setUint32(e + 4, 1, le);
      if (type === 3) dv.setUint16(e + 8, val, le); else dv.setUint32(e + 8, val, le);
    });
    dv.setUint32(ifd + 2 + entries * 12, next, le);
    for (let i = 0; i < w * h; i++) {
      if (bits === 16) dv.setUint16(data + i * 2, plane[i], le); else dv.setUint8(data + i, plane[i]);
    }
    o = data + dataSize;
  });
  return buf;
}
