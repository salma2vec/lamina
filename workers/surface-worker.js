/**
 * Builds the 3D surface of a volume off the main thread.
 * Messages in:  { job, key, volume?, level, budget? }  (the volume is sent once per key and kept)
 * Messages out: { job, type: 'done', positions, normals, indices, step } | { job, type: 'error', message }
 */
import { isosurface } from '../src/volume/isosurface.js';

let cached = null;

self.onmessage = (e) => {
  const { job, key, volume, level, budget = 900000 } = e.data;
  try {
    if (volume) cached = { key, volume };
    if (!cached || cached.key !== key) throw new Error('The volume for this surface is no longer loaded.');
    // Coarser grids until the surface fits the triangle budget.
    let maxSide = 128, r;
    for (;;) {
      r = isosurface(cached.volume, level, { maxSide });
      const tris = r.indices.length / 3;
      if (tris <= budget || maxSide <= 48) break;
      maxSide = Math.max(48, Math.floor(maxSide * Math.sqrt(budget / tris) * 0.9));
    }
    self.postMessage({ job, type: 'done', positions: r.positions, normals: r.normals, indices: r.indices, step: r.step },
      [r.positions.buffer, r.normals.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ job, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
