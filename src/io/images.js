/** Raster image helpers: natural sort and browser image decoding. */

/**
 * Natural (human) filename comparison: "slice2" sorts before "slice10".
 * @param {string} a
 * @param {string} b
 */
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Decode a PNG/JPEG/WebP blob to a greyscale Float32 plane (0..255).
 * Works on the main thread and in workers with OffscreenCanvas.
 * @param {Blob} blob
 * @param {number} [maxSide] optional downscale bound
 * @returns {Promise<{width:number, height:number, data:Float32Array, sourceWidth:number, sourceHeight:number}>}
 */
export async function decodeImageGrey(blob, maxSide = Infinity) {
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    throw new Error('The image could not be decoded. The file may be damaged or cut short. Lamina reads PNG, JPEG, WebP and TIFF.');
  }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const sourceWidth = bmp.width, sourceHeight = bmp.height;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  return { width: w, height: h, data, sourceWidth, sourceHeight };
}
