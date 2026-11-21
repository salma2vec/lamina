/** TIFF decoding to greyscale planes, built on the vendored UTIF decoder. */
import UTIF from '../../vendor/utif/utif.js';

/**
 * List the image pages (IFDs) of a TIFF file.
 * @param {ArrayBuffer} buf
 * @returns {Object[]} UTIF IFD records with width and height
 */
export function tiffPages(buf) {
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  const le = head[0] === 0x49 && head[1] === 0x49 && head[2] === 42;
  const be = head[0] === 0x4d && head[1] === 0x4d && head[3] === 42;
  if (!le && !be) throw new Error('This is not a TIFF file, or it is BigTIFF, which is not supported.');
  const ifds = UTIF.decode(buf).filter((d) => d.t256 && d.t257);
  if (!ifds.length) throw new Error('The TIFF file has no image pages.');
  return ifds;
}

/**
 * Decode one TIFF page to a greyscale Float32 plane (raw sample values).
 * Colour pages use the mean of R, G and B.
 * @param {ArrayBuffer} buf
 * @param {Object} ifd page from tiffPages
 * @returns {{width:number, height:number, data:Float32Array}}
 */
export function decodeTiffPage(buf, ifd) {
  UTIF.decodeImage(buf, ifd);
  const w = ifd.width, h = ifd.height;
  const bps = ifd.t258 ? ifd.t258[0] : 1;
  const spp = ifd.t277 ? ifd.t277[0] : 1;
  const fmt = ifd.t339 ? ifd.t339[0] : 1;
  const photo = ifd.t262 ? ifd.t262[0] : 1;
  const src = ifd.data;
  const out = new Float32Array(w * h);
  if (photo === 3 || bps === 1 || bps === 4 || (spp >= 3 && bps === 8)) {
    // Palette, bilevel or 8-bit colour: let UTIF expand to RGBA.
    const rgba = UTIF.toRGBA8(ifd);
    for (let i = 0; i < w * h; i++) out[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
    return { width: w, height: h, data: out };
  }
  const bytes = bps / 8;
  const stride = bytes * spp;
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  // UTIF converts 16-bit data to little-endian; 32-bit data keeps file order.
  const le = bps === 32 ? ifd.isLE : true;
  const read = {
    '8-1': (o) => dv.getUint8(o), '8-2': (o) => dv.getInt8(o),
    '16-1': (o) => dv.getUint16(o, true), '16-2': (o) => dv.getInt16(o, true),
    '32-1': (o) => dv.getUint32(o, le), '32-2': (o) => dv.getInt32(o, le), '32-3': (o) => dv.getFloat32(o, le),
  }[`${bps}-${fmt}`];
  if (!read) throw new Error(`Unsupported TIFF sample format: ${bps}-bit, format ${fmt}.`);
  const rowBytes = Math.ceil((bps * spp * w) / 8);
  const ch = Math.min(spp, 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * rowBytes + x * stride;
      let s = 0;
      for (let c = 0; c < ch; c++) s += read(o + c * bytes);
      out[y * w + x] = s / ch;
    }
  }
  if (photo === 0) {
    let mx = -Infinity;
    for (let i = 0; i < out.length; i++) if (out[i] > mx) mx = out[i];
    for (let i = 0; i < out.length; i++) out[i] = mx - out[i];
  }
  return { width: w, height: h, data: out };
}
