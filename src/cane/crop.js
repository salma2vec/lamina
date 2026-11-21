/** Map a slice into the cane frame: rotation, zoom and offset. */

/**
 * Resample the slice into a G x G cane grid with bilinear interpolation.
 * The cane grid spans a window of side (ref / zoom), rotated by
 * `rotation` degrees and centred at offset (ox, oy) in source units.
 * @param {{data:Float32Array, w:number, h:number, px:number}} slice
 * @param {number} G
 * @param {{rotation:number, zoom:number, ox:number, oy:number}} c
 * @param {number} [ref] reference size in source units (default: slice side)
 * @returns {Float32Array}
 */
export function cropSlice(slice, G, c, ref) {
  const { data, px } = slice;
  const w = slice.w, h = slice.h;
  const out = new Float32Array(G * G);
  const side = (ref || Math.max(w, h) * px) / Math.max(0.05, c.zoom);
  const step = side / G;
  const a = ((c.rotation || 0) * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const hw = w / 2, hh = h / 2;
  for (let j = 0; j < G; j++) {
    const v = ((G / 2 - j - 0.5) * step);
    for (let i = 0; i < G; i++) {
      const u = ((i + 0.5 - G / 2) * step);
      // Rotate cane coordinates into slice coordinates.
      const x = (u * ca - v * sa + (c.ox || 0)) / px + hw - 0.5;
      const y = hh - (u * sa + v * ca + (c.oy || 0)) / px - 0.5;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) { out[j * G + i] = 0; continue; }
      const fx = x - x0, fy = y - y0;
      const k = y0 * w + x0;
      out[j * G + i] = (data[k] * (1 - fx) + data[k + 1] * fx) * (1 - fy) + (data[k + w] * (1 - fx) + data[k + w + 1] * fx) * fy;
    }
  }
  return out;
}

/**
 * Outline polygon of the crop window in source units, for drawing an overlay.
 * @param {{rotation:number, zoom:number, ox:number, oy:number}} c
 * @param {number[][]} poly unit outline polygon
 * @param {number} ref reference size in source units
 */
export function cropOutlineInSlice(c, poly, ref) {
  const side = ref / Math.max(0.05, c.zoom);
  const a = ((c.rotation || 0) * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  return poly.map(([x, y]) => {
    const u = x * side, v = y * side;
    return [u * ca - v * sa + (c.ox || 0), u * sa + v * ca + (c.oy || 0)];
  });
}
