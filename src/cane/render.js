/** Clay-textured raster rendering of a cane cross-section. */
import { OUTSIDE } from './morph.js';
import { hexToRgb, luminance } from './palette.js';

function hash(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/**
 * Render labels to RGBA with clay texture: soft edges, fine grain and sparse
 * specks. Pixels outside the outline are transparent.
 * @param {Uint8Array} labels
 * @param {number} w
 * @param {number} h
 * @param {string[]} colours hex colour per level
 * @param {{scale?:number, seed?:number, texture?:number}} [opt]
 * @returns {{width:number, height:number, data:Uint8ClampedArray}}
 */
export function renderCane(labels, w, h, colours, opt = {}) {
  const s = Math.max(1, Math.round(opt.scale || 2));
  const seed = opt.seed || 7;
  const tex = opt.texture ?? 1;
  const W = w * s, H = h * s;
  const rgb = colours.map(hexToRgb);
  const lum = colours.map(luminance);
  const buf = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const ly = (y / s) | 0;
    for (let x = 0; x < W; x++) {
      const l = labels[ly * w + ((x / s) | 0)];
      const o = (y * W + x) * 4;
      if (l === OUTSIDE || l >= rgb.length) continue;
      const c = rgb[l];
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 1;
    }
  }
  // Premultiplied separable box blur, radius about one cane pixel.
  const r = Math.max(1, Math.round(s * 0.75));
  const tmp = new Float32Array(buf.length);
  const pass = (src, dst, horiz) => {
    const n = horiz ? W : H, m = horiz ? H : W;
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < n; b++) {
        let r0 = 0, g0 = 0, b0 = 0, a0 = 0, c = 0;
        for (let t = -r; t <= r; t++) {
          const bb = b + t;
          if (bb < 0 || bb >= n) continue;
          const o = (horiz ? a * W + bb : bb * W + a) * 4;
          const al = src[o + 3];
          r0 += src[o] * (horiz ? al : 1); g0 += src[o + 1] * (horiz ? al : 1); b0 += src[o + 2] * (horiz ? al : 1); a0 += al; c++;
        }
        const o = (horiz ? a * W + b : b * W + a) * 4;
        dst[o] = r0 / c; dst[o + 1] = g0 / c; dst[o + 2] = b0 / c; dst[o + 3] = a0 / c;
      }
    }
  };
  pass(buf, tmp, true);
  pass(tmp, buf, false);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const ly = (y / s) | 0;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const a = buf[o + 3];
      if (a <= 0.002) continue;
      let R = buf[o] / a, G = buf[o + 1] / a, B = buf[o + 2] / a;
      if (tex > 0) {
        const l = labels[ly * w + ((x / s) | 0)];
        const L = l < lum.length ? lum[l] : 0.5;
        const grain = (valueNoise(x * 0.35, y * 0.35, seed) - 0.5) * 0.07 + (valueNoise(x * 0.06, y * 0.06, seed + 1) - 0.5) * 0.05;
        let k = 1 + grain * tex;
        const sp = hash(x, y, seed + 2);
        if (sp > 0.9965) k *= L > 0.45 ? 0.72 : 1.45;
        R *= k; G *= k; B *= k;
        if (L < 0.3) { const lift = grain * 30 * tex; R += lift; G += lift; B += lift; }
      }
      out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = Math.min(1, a) * 255;
    }
  }
  return { width: W, height: H, data: out };
}
