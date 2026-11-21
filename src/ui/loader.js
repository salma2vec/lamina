/** Loads sources through workers, with progress and friendly errors. */
import { classifyFiles } from '../io/detect.js';
import { decodeImageGrey } from '../io/images.js';
import { imageFromPlane } from '../volume/volume.js';

let jobId = 0;
const workers = {};

function worker(name) {
  if (!workers[name]) workers[name] = new Worker(new URL(`../../workers/${name}.js`, import.meta.url), { type: 'module' });
  return workers[name];
}

/**
 * Run one job on a module worker.
 * @param {string} name worker file name without extension
 * @param {Object} msg message (job id is added)
 * @param {(p:number, label?:string)=>void} [onProgress]
 */
export function runJob(name, msg, onProgress) {
  const w = worker(name);
  const job = ++jobId;
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.data.job !== job) return;
      if (e.data.type === 'progress') { onProgress && onProgress(e.data.p, e.data.label); return; }
      w.removeEventListener('message', handler);
      w.removeEventListener('error', onErr);
      if (e.data.type === 'done') resolve(e.data);
      else reject(new Error(e.data.message || 'The file could not be read.'));
    };
    const onErr = (ev) => {
      ev.preventDefault();
      w.removeEventListener('message', handler);
      w.removeEventListener('error', onErr);
      delete workers[name];
      reject(new Error('The background worker stopped. The file may be too large for this browser.'));
    };
    w.addEventListener('message', handler);
    w.addEventListener('error', onErr);
    w.postMessage({ ...msg, job });
  });
}

const synthCache = new Map();

/**
 * Generate (or fetch from cache) a synthetic study volume.
 * @param {string} id
 * @param {number} [seed]
 * @param {(p:number)=>void} [onProgress]
 */
export async function syntheticVolume(id, seed = 1, onProgress) {
  const key = `${id}:${seed}`;
  if (!synthCache.has(key)) {
    const p = runJob('synthetic-worker', { id, seed, size: 128 }, onProgress).then((r) => r.volume);
    synthCache.set(key, p);
    p.catch(() => synthCache.delete(key));
  }
  return synthCache.get(key);
}

/**
 * Load dropped or picked files into a source description.
 * @param {File[]} files
 * @param {(p:number, label?:string)=>void} onProgress
 * @returns {Promise<{kind:'mesh'|'volume'|'image'|'session', name:string, ...}>}
 */
export async function loadFiles(files, onProgress) {
  const list = [...files];
  if (list.length === 1 && /\.json$/i.test(list[0].name)) {
    let obj;
    try { obj = JSON.parse(await list[0].text()); } catch { throw new Error('The session file is not valid JSON.'); }
    return { kind: 'session', name: list[0].name, session: obj };
  }
  const c = classifyFiles(list);
  const name = c.kind === 'sequence' ? `${c.files[0].name} (+${c.files.length - 1})` : c.files[0].name;
  if (c.kind === 'mesh') {
    const r = await runJob('volume-worker', { kind: 'mesh', format: c.format, files: c.files }, onProgress);
    return { kind: 'mesh', name, mesh: r.result.mesh };
  }
  if (c.kind === 'image') {
    onProgress(0.2, 'Decoding image');
    const g = await decodeImageGrey(c.files[0], 4096);
    return { kind: 'image', name, image: imageFromPlane(g.data, g.width, g.height, 1024) };
  }
  const r = await runJob('volume-worker', { kind: c.kind, files: c.files }, onProgress);
  if (r.result.type === 'image') return { kind: 'image', name, image: r.result.image, spacing: r.result.spacing || null };
  return { kind: 'volume', name, volume: r.result.volume, count: c.files.length };
}
