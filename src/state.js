/** Default parameters and session (de)serialisation. Pure; no DOM. */
import { PRESETS } from './cane/palette.js';

export const VERSION = '0.1.0';

/** Fresh copy of the default editable parameters. */
export function defaultParams() {
  return {
    plane: { axis: 'xy', offset: 0, tiltA: 0, tiltB: 0 },
    slab: { n: 1, mode: 'mean' },
    levels: 3,
    thresholds: [],
    mapping: [],
    // 3 mm at a 60 mm build, reduced 3:1 to 20 mm, keeps every region at least 1 mm wide (the warning limit).
    clean: { median: 1, openClose: 0, smooth: 1, minFeature: 3 },
    outline: { shape: 'circle', aspect: 0.6, rotation: 0, zoom: 1, ox: 0, oy: 0 },
    palette: { preset: 'sandalwood', swatches: structuredClone(PRESETS.sandalwood.swatches) },
    cane: { size: 60, length: 150, target: 20, density: 1.9, waste: 10, minReduced: 1 },
    pattern: { layout: 'mirror', alternate: 'none', stretch: 1, stretchAngle: 0, tile: 0.26, gap: 0, jitter: false, preview: 'slab' },
  };
}

const KEYS = ['plane', 'slab', 'levels', 'thresholds', 'mapping', 'clean', 'outline', 'palette', 'cane', 'pattern'];

/**
 * Serialise parameters and a source reference to a session object.
 * Volume and mesh data are never stored. A template is stored as its id and
 * parameter values, which is all it needs to be drawn again.
 * @param {Object} params
 * @param {{kind:string, name:string, synthetic?:{id:string, seed:number}, scale?:number, id?:string, values?:Object}|null} source
 *   scale: millimetres per voxel, pixel or mesh unit, when the user set it;
 *   id and values: the template and its parameters, for kind 'template'
 */
export function toSession(params, source) {
  const out = { app: 'lamina', version: VERSION, saved: new Date().toISOString() };
  let ref = null;
  if (source && source.kind === 'template') {
    ref = { kind: 'template', name: source.name, id: source.id, values: structuredClone(source.values || {}) };
  } else if (source) {
    ref = {
      kind: source.kind,
      name: source.name,
      ...(source.synthetic ? { synthetic: source.synthetic } : { note: 'Source data is not stored. Load the same file again to restore the slice.' }),
      ...(!source.synthetic && source.scale > 0 ? { scale: source.scale } : {}),
    };
  }
  out.source = ref;
  for (const k of KEYS) out[k] = structuredClone(params[k]);
  return out;
}

const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/**
 * Validate a parsed session and merge it over defaults.
 * @param {any} obj
 * @returns {{params:Object, source:Object|null}}
 */
export function fromSession(obj) {
  if (!obj || obj.app !== 'lamina') throw new Error('This is not a Lamina session file.');
  const d = defaultParams();
  const p = d;
  const pick = (k) => (obj[k] && typeof obj[k] === 'object' ? obj[k] : {});
  const pl = pick('plane');
  p.plane = {
    axis: ['xy', 'xz', 'yz'].includes(pl.axis) ? pl.axis : 'xy',
    offset: num(pl.offset, -1e6, 1e6, 0), tiltA: num(pl.tiltA, -90, 90, 0), tiltB: num(pl.tiltB, -90, 90, 0),
  };
  const sl = pick('slab');
  p.slab = { n: Math.round(num(sl.n, 1, 32, 1)), mode: sl.mode === 'max' ? 'max' : 'mean' };
  p.levels = Math.round(num(obj.levels, 2, 6, 3));
  p.thresholds = Array.isArray(obj.thresholds) && obj.thresholds.length === p.levels - 1 ? obj.thresholds.map((t) => num(t, 0, 1, 0.5)) : [];
  const pal = pick('palette');
  if (Array.isArray(pal.swatches) && pal.swatches.length >= 2 && pal.swatches.length <= 6) {
    p.palette = {
      preset: typeof pal.preset === 'string' ? pal.preset : 'custom',
      swatches: pal.swatches.map((s, i) => ({
        name: typeof s.name === 'string' ? s.name.slice(0, 40) : `Clay ${i + 1}`,
        colour: /^#[0-9a-f]{6}$/i.test(s.colour) ? s.colour : '#888888',
        shrinkage: num(s.shrinkage, 0, 30, 12),
      })),
    };
  }
  p.mapping = Array.isArray(obj.mapping) && obj.mapping.length === p.levels && obj.mapping.every((m) => Number.isInteger(m) && m >= 0 && m < p.palette.swatches.length) ? obj.mapping.slice() : [];
  for (const k of ['clean', 'outline', 'cane', 'pattern']) {
    const src = pick(k);
    for (const [key, def] of Object.entries(d[k])) {
      const v = src[key];
      if (typeof def === 'number') p[k][key] = num(v, -1e6, 1e6, def);
      else if (typeof def === 'boolean') p[k][key] = typeof v === 'boolean' ? v : def;
      else if (typeof def === 'string') p[k][key] = typeof v === 'string' ? v : def;
    }
  }
  const s = obj.source && typeof obj.source === 'object' ? { ...obj.source } : null;
  if (s && !(typeof s.scale === 'number' && s.scale > 0 && Number.isFinite(s.scale))) delete s.scale;
  if (s && s.kind === 'template') {
    // Values are checked against the template's own ranges when it is loaded.
    if (typeof s.id !== 'string') return { params: p, source: null };
    s.values = s.values && typeof s.values === 'object' && !Array.isArray(s.values) ? { ...s.values } : {};
  }
  return { params: p, source: s };
}
