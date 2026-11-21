/** Date-seeded daily study selection (same for everyone on a given local date). */
import { SPECIMENS, mulberry32 } from './volume/synthetic.js';

/** Local date as YYYY-MM-DD. */
export function localDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** FNV-1a hash of a string to a 32-bit seed. */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Pick a specimen, plane and section window from a seed.
 * Offsets are in voxels for the 128-voxel synthetic volumes.
 * @param {number} seed
 */
export function pickStudy(seed) {
  const r = mulberry32(seed);
  const spec = SPECIMENS[Math.floor(r() * SPECIMENS.length)];
  const axes = ['xy', 'xz', 'yz'];
  const keepAxis = r() < 0.65;
  const axis = keepAxis ? spec.plane.axis : axes[Math.floor(r() * 3)];
  const plane = {
    axis,
    offset: Math.round(((keepAxis ? spec.plane.offset : 0) + (r() - 0.5) * 24) * 2) / 2,
    tiltA: Math.round((r() - 0.5) * 40),
    tiltB: Math.round((r() - 0.5) * 40),
  };
  const crop = {
    zoom: Math.round(spec.crop.zoom * (0.9 + r() * 0.35) * 100) / 100,
    rotation: Math.round(r() * 360 - 180),
    ox: keepAxis ? spec.crop.ox : 0,
    oy: keepAxis ? spec.crop.oy : 0,
  };
  return { id: spec.id, spec, plane, crop };
}
