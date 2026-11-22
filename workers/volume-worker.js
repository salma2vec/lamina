/**
 * Decodes volume files and downsamples them to at most 256 voxels per side.
 * Messages in:  { job, kind: 'mesh'|'nrrd'|'tiff'|'sequence'|'image', format?, files: File[] }
 * Messages out: { job, type: 'progress', p, label } | { job, type: 'done', result } | { job, type: 'error', message }
 */
import { parseNRRD } from '../src/io/nrrd.js';
import { tiffPages, decodeTiffPage, tiffMeta } from '../src/io/tiff.js';
import { decodeImageGrey } from '../src/io/images.js';
import { ext } from '../src/io/detect.js';
import { VolumeBuilder, buildVolume, imageFromPlane } from '../src/volume/volume.js';
import { parseSTL } from '../src/io/stl.js';
import { parsePLY } from '../src/io/ply.js';
import { parseOBJ } from '../src/io/obj.js';
import { weldMesh } from '../src/geom/slice-mesh.js';

const MAX = 256;

self.onmessage = async (e) => {
  const { job, kind, files } = e.data;
  const progress = (p, label) => self.postMessage({ job, type: 'progress', p, label });
  try {
    let result;
    if (kind === 'mesh') result = await loadMesh(files[0], e.data.format, progress);
    else if (kind === 'nrrd') result = await loadNRRD(files[0], progress);
    else if (kind === 'tiff') result = await loadTIFF(files[0], progress);
    else if (kind === 'sequence') result = await loadSequence(files, progress);
    else if (kind === 'image') result = await loadImage(files[0], progress);
    else throw new Error(`Unknown volume kind "${kind}".`);
    const transfer = result.type === 'mesh' ? [result.mesh.positions.buffer, result.mesh.indices.buffer]
      : [result.type === 'volume' ? result.volume.data.buffer : result.image.data.buffer];
    self.postMessage({ job, type: 'done', result }, transfer);
  } catch (err) {
    self.postMessage({ job, type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

async function loadMesh(file, format, progress) {
  progress(0.1, 'Reading mesh');
  const buf = await file.arrayBuffer();
  const warnings = [];
  const parse = { stl: parseSTL, ply: parsePLY, obj: parseOBJ }[format];
  const soup = parse(buf, (msg) => warnings.push(msg));
  for (let i = 0; i < soup.length; i++) if (!Number.isFinite(soup[i])) throw new Error('The mesh contains invalid coordinates.');
  progress(0.6, 'Welding vertices');
  const m = weldMesh(soup);
  // Centre on the bounding box.
  const c = m.min.map((v, k) => (v + m.max[k]) / 2);
  const P = m.positions;
  for (let i = 0; i < P.length; i += 3) { P[i] -= c[0]; P[i + 1] -= c[1]; P[i + 2] -= c[2]; }
  const size = m.max.map((v, k) => Math.max(v - m.min[k], 1e-6));
  return { type: 'mesh', mesh: { positions: P, indices: m.indices, size, triangles: m.indices.length / 3, vertices: P.length / 3 }, warning: warnings[0] || null };
}

/**
 * Normalise and downsample a 2D plane for the cane step. The image records
 * its source size and how many source pixels make one working pixel.
 */
function asImage(plane, w, h, sourceW = w, sourceH = h) {
  const image = imageFromPlane(plane, w, h, 1024);
  image.sourceW = sourceW;
  image.sourceH = sourceH;
  image.factor = sourceW / image.w;
  return image;
}

async function loadImage(file, progress) {
  progress(0.2, 'Decoding image');
  const g = await decodeImageGrey(file, 4096);
  progress(0.7, 'Decoding image');
  return { type: 'image', image: asImage(g.data, g.width, g.height, g.sourceWidth, g.sourceHeight), spacing: null };
}

async function loadNRRD(file, progress) {
  progress(0, 'Reading NRRD');
  const v = await parseNRRD(await file.arrayBuffer(), (label) => progress(0.02, label));
  const [nx, ny, nz] = v.dims;
  if (nz === 1) return { type: 'image', image: asImage(v.data, nx, ny), spacing: v.spacing ? v.spacing[0] : null };
  progress(0.05, 'Downsampling');
  const volume = buildVolume(v.dims, v.data, v.spacing, MAX, (p) => progress(0.05 + p * 0.95, 'Downsampling'));
  return { type: 'volume', volume, sourceType: v.type };
}

/** Decode a TIFF page, naming the page in any error. */
function tiffPage(buf, pages, z) {
  try {
    return decodeTiffPage(buf, pages[z]);
  } catch (err) {
    throw new Error(`TIFF page ${z + 1} of ${pages.length}: ${err.message}`);
  }
}

async function loadTIFF(file, progress) {
  progress(0, 'Reading TIFF');
  const buf = await file.arrayBuffer();
  const pages = tiffPages(buf);
  const meta = tiffMeta(pages[0]);
  if (meta.pages && pages.length < meta.pages) {
    throw new Error(`The TIFF file lists ${meta.pages} pages, but only ${pages.length} could be read. The file may be truncated.`);
  }
  const first = tiffPage(buf, pages, 0);
  const px = meta.pixelSize;
  if (pages.length === 1) {
    return { type: 'image', image: asImage(first.data, first.width, first.height), spacing: px };
  }
  const b = new VolumeBuilder(first.width, first.height, pages.length, MAX);
  b.addSlice(0, first.data);
  for (let z = 1; z < pages.length; z++) {
    const pg = tiffPage(buf, pages, z);
    if (pg.width !== first.width || pg.height !== first.height) throw new Error(`TIFF page ${z + 1} has a different size from page 1.`);
    b.addSlice(z, pg.data);
    pages[z].data = null;
    if ((z & 3) === 0) progress(z / pages.length, `Page ${z + 1} of ${pages.length}`);
  }
  // Without a slice spacing, the slices are taken to be as far apart as the pixels.
  return { type: 'volume', volume: b.finish(px ? [px, px, meta.zSpacing || px] : null) };
}

async function decodeAny(file) {
  const e = ext(file.name);
  if (e === 'tif' || e === 'tiff') {
    const buf = await file.arrayBuffer();
    const pages = tiffPages(buf);
    let pg;
    try { pg = decodeTiffPage(buf, pages[0]); } catch (err) { throw new Error(`"${file.name}": ${err.message}`); }
    return { width: pg.width, height: pg.height, data: pg.data, pixelSize: tiffMeta(pages[0]).pixelSize };
  }
  if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser cannot decode image slices in the background. Use a TIFF stack or NRRD.');
  return decodeImageGrey(file);
}

async function loadSequence(files, progress) {
  const first = await decodeAny(files[0]);
  const b = new VolumeBuilder(first.width, first.height, files.length, MAX);
  b.addSlice(0, first.data);
  for (let z = 1; z < files.length; z++) {
    const s = await decodeAny(files[z]);
    if (s.width !== first.width || s.height !== first.height) throw new Error(`"${files[z].name}" has a different size from "${files[0].name}". All slices must match.`);
    b.addSlice(z, s.data);
    if ((z & 3) === 0) progress(z / files.length, `Slice ${z + 1} of ${files.length}`);
  }
  const px = first.pixelSize;
  return { type: 'volume', volume: b.finish(px ? [px, px, px] : null) };
}
