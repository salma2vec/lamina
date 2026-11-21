/** Wavefront OBJ parser (geometry only). */

/**
 * Parse an OBJ file into a triangle soup. Supports v/vt/vn face syntax,
 * negative indices and polygons (fan-triangulated).
 * @param {ArrayBuffer|string} input
 * @returns {Float32Array}
 */
export function parseOBJ(input) {
  const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
  const v = [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (line.startsWith('v ')) {
      const t = line.split(/\s+/);
      v.push(+t[1], +t[2], +t[3]);
    } else if (line.startsWith('f ')) {
      const t = line.split(/\s+/).slice(1);
      const nv = v.length / 3;
      const ids = t.map((s) => {
        let i = parseInt(s.split('/')[0], 10);
        if (i < 0) i = nv + i; else i -= 1;
        if (!(i >= 0 && i < nv)) throw new Error(`OBJ line ${li + 1} refers to a missing vertex.`);
        return i;
      });
      for (let k = 1; k + 1 < ids.length; k++) {
        for (const id of [ids[0], ids[k], ids[k + 1]]) out.push(v[id * 3], v[id * 3 + 1], v[id * 3 + 2]);
      }
    }
  }
  if (!out.length) throw new Error('The OBJ file has no faces.');
  return new Float32Array(out);
}
