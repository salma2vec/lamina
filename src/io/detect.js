/** Classify dropped files into a source kind. */
import { naturalCompare } from './images.js';

const MESH = { stl: 'stl', ply: 'ply', obj: 'obj' };
const RASTER = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
const TIFF = ['tif', 'tiff'];

export const ext = (name) => (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();

/**
 * Decide how to load a set of files.
 * @param {{name:string}[]} files
 * @returns {{kind:'mesh'|'nrrd'|'tiff'|'sequence'|'image', format?:string, files:Object[]}}
 */
export function classifyFiles(files) {
  const list = [...files];
  if (!list.length) throw new Error('No files were given.');
  if (list.length === 1) {
    const f = list[0];
    const e = ext(f.name);
    if (MESH[e]) return { kind: 'mesh', format: MESH[e], files: list };
    if (e === 'nrrd') return { kind: 'nrrd', files: list };
    if (e === 'nhdr') throw new Error('Detached NRRD (.nhdr) is not supported. Save as a single .nrrd file.');
    if (TIFF.includes(e)) return { kind: 'tiff', files: list };
    if (RASTER.includes(e)) return { kind: 'image', files: list };
    throw new Error(`"${f.name}" is not a supported file type.`);
  }
  const images = list.filter((f) => RASTER.includes(ext(f.name)) || TIFF.includes(ext(f.name)));
  if (images.length !== list.length) {
    throw new Error('Drop one mesh or volume file, or a set of image slices. Do not mix file types.');
  }
  images.sort((a, b) => naturalCompare(a.name, b.name));
  return { kind: 'sequence', files: images };
}
