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

/** Millimetres per unit for the units ImageJ writes in its description. */
const UNIT_MM = { mm: 1, millimeter: 1, millimetre: 1, micron: 1e-3, microns: 1e-3, um: 1e-3, 'µm': 1e-3, 'μm': 1e-3, '\\u00b5m': 1e-3, nm: 1e-6, nanometer: 1e-6, cm: 10, m: 1000, meter: 1000, metre: 1000, inch: 25.4, in: 25.4 };

/** Resolutions that image editors write by default. They say nothing about the specimen. */
const DEFAULT_DPI = [72, 96, 150, 300];

/**
 * Pixel size, slice spacing and page count from TIFF metadata.
 * Reads the ImageJ description (unit, spacing, images) and the resolution tags.
 * @param {Object} ifd first page from tiffPages
 * @returns {{pixelSize:number|null, zSpacing:number|null, pages:number|null}} sizes in mm
 */
export function tiffMeta(ifd) {
  const desc = ifd.t270 && typeof ifd.t270[0] === 'string' ? ifd.t270[0] : '';
  const ij = {};
  if (desc.startsWith('ImageJ=')) {
    for (const line of desc.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) ij[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const unitMm = ij.unit ? UNIT_MM[ij.unit.toLowerCase()] : undefined;
  const xres = ifd.t282 ? ifd.t282[0] : 0;
  // TIFF resolution unit: 1 none, 2 inch (the default), 3 centimetre.
  const resUnit = ifd.t296 ? ifd.t296[0] : 2;
  let pixelSize = null;
  if (xres > 0 && Number.isFinite(xres)) {
    if (unitMm) pixelSize = unitMm / xres;
    else if (resUnit === 3) pixelSize = 10 / xres;
    else if (resUnit === 2 && ifd.t282 && !DEFAULT_DPI.includes(Math.round(xres * 1000) / 1000)) pixelSize = 25.4 / xres;
  }
  const z = unitMm && +ij.spacing > 0 ? +ij.spacing * unitMm : null;
  const pages = +ij.images > 0 ? Math.round(+ij.images) : null;
  return { pixelSize, zSpacing: z, pages };
}

/**
 * Check that a page's image data lies inside the file.
 * @param {ArrayBuffer} buf
 * @param {Object} ifd
 */
export function tiffPageComplete(buf, ifd) {
  const offs = ifd.t273 || ifd.t324, counts = ifd.t279 || ifd.t325;
  if (!offs || !counts) return true;
  for (let i = 0; i < offs.length; i++) if (offs[i] + (counts[i] || 0) > buf.byteLength) return false;
  return true;
}

/**
 * Decode one TIFF page to a greyscale Float32 plane (raw sample values).
 * Colour pages use the mean of R, G and B.
 * @param {ArrayBuffer} buf
 * @param {Object} ifd page from tiffPages
 * @returns {{width:number, height:number, data:Float32Array}}
 */
export function decodeTiffPage(buf, ifd) {
  if (!tiffPageComplete(buf, ifd)) throw new Error('A TIFF page ends past the end of the file. The file may be truncated.');
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
