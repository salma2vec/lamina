/** NRRD parser (raw and gzip encodings, attached data only). */

const TYPES = {
  int8: Int8Array, 'signed char': Int8Array, int8_t: Int8Array,
  uchar: Uint8Array, 'unsigned char': Uint8Array, uint8: Uint8Array, uint8_t: Uint8Array,
  short: Int16Array, 'short int': Int16Array, 'signed short': Int16Array, 'signed short int': Int16Array, int16: Int16Array, int16_t: Int16Array,
  ushort: Uint16Array, 'unsigned short': Uint16Array, 'unsigned short int': Uint16Array, uint16: Uint16Array, uint16_t: Uint16Array,
  int: Int32Array, 'signed int': Int32Array, int32: Int32Array, int32_t: Int32Array,
  uint: Uint32Array, 'unsigned int': Uint32Array, uint32: Uint32Array, uint32_t: Uint32Array,
  float: Float32Array, double: Float64Array,
};

/**
 * Parse the NRRD header.
 * @param {Uint8Array} bytes
 * @returns {{fields:Object, dataStart:number}}
 */
export function parseNRRDHeader(bytes) {
  const max = Math.min(bytes.length, 65536);
  let end = -1;
  for (let i = 0; i < max - 1; i++) {
    if (bytes[i] === 10 && bytes[i + 1] === 10) { end = i; break; }
    if (bytes[i] === 10 && bytes[i + 1] === 13 && bytes[i + 2] === 10) { end = i; break; }
  }
  if (end < 0) throw new Error('The NRRD header has no blank line before the data.');
  const text = new TextDecoder().decode(bytes.subarray(0, end));
  if (!text.startsWith('NRRD')) throw new Error('This is not a NRRD file. It must start with "NRRD".');
  const fields = {};
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([^:]+):=?\s*(.*)$/);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const dataStart = end + (bytes[end + 1] === 13 ? 3 : 2);
  return { fields, dataStart };
}

function vecLen(s) {
  const m = s.match(/\(([^)]*)\)/);
  if (!m) return NaN;
  return Math.hypot(...m[1].split(',').map(Number));
}

/** Millimetres per unit for the length units found in NRRD "space units". */
const UNIT_MM = { mm: 1, millimeter: 1, millimeters: 1, millimetre: 1, millimetres: 1, um: 1e-3, 'µm': 1e-3, 'μm': 1e-3, micron: 1e-3, microns: 1e-3, micrometer: 1e-3, micrometers: 1e-3, micrometre: 1e-3, micrometres: 1e-3, nm: 1e-6, cm: 10, m: 1000, meter: 1000, meters: 1000, metre: 1000, metres: 1000 };

/**
 * Scale factor from NRRD "space units" to millimetres. Missing or unknown
 * units count as millimetres, the usual unit for CT data.
 * @param {string|undefined} field e.g. '"microns" "microns" "microns"'
 * @returns {number}
 */
export function spaceUnitScale(field) {
  if (!field) return 1;
  const units = (field.match(/"([^"]*)"/g) || []).map((u) => u.slice(1, -1).trim().toLowerCase()).filter(Boolean);
  const k = units.map((u) => UNIT_MM[u]).find((x) => x !== undefined);
  return k === undefined ? 1 : k;
}

/**
 * Decompress gzip data with the native DecompressionStream.
 * @param {Uint8Array} bytes
 */
export async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress gzip data.');
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error('The gzip data in this file is damaged or incomplete. The file may be truncated.');
  }
}

/**
 * Parse a NRRD volume.
 * @param {ArrayBuffer} buf
 * @param {(label:string)=>void} [onStage] told when a slow step starts
 * @returns {Promise<{dims:number[], spacing:number[]|null, data:ArrayLike<number>, type:string}>}
 */
export async function parseNRRD(buf, onStage) {
  const bytes = new Uint8Array(buf);
  const { fields, dataStart } = parseNRRDHeader(bytes);
  if (fields['data file'] || fields.datafile) throw new Error('Detached NRRD (.nhdr with a separate data file) is not supported. Save as a single .nrrd file.');
  const type = (fields.type || '').toLowerCase();
  const Ctor = TYPES[type];
  if (!Ctor) throw new Error(`Unsupported NRRD type "${fields.type}".`);
  const dim = +fields.dimension;
  let sizes = (fields.sizes || '').split(/\s+/).map(Number);
  if (sizes.length !== dim || sizes.some((s) => !(s > 0))) throw new Error('The NRRD "sizes" field is invalid.');
  // Drop a leading single-component axis; reject multi-component data.
  let axisOffset = 0;
  if (dim === 4 && sizes[0] === 1) { sizes = sizes.slice(1); axisOffset = 1; }
  if (sizes.length === 2) sizes = [sizes[0], sizes[1], 1];
  if (sizes.length !== 3) throw new Error('Only 2D and 3D scalar NRRD volumes are supported.');
  const enc = (fields.encoding || 'raw').toLowerCase();
  let raw;
  if (enc === 'raw') raw = bytes.subarray(dataStart);
  else if (enc === 'gzip' || enc === 'gz') {
    if (onStage) onStage('Decompressing');
    raw = await gunzip(bytes.subarray(dataStart));
  }
  else throw new Error(`Unsupported NRRD encoding "${enc}". Use raw or gzip.`);
  const count = sizes[0] * sizes[1] * sizes[2];
  const bpe = Ctor.BYTES_PER_ELEMENT;
  if (raw.length < count * bpe) throw new Error('The NRRD data is shorter than its header says.');
  // "byte skip: -1" means the data is the last count*bpe bytes.
  const skip = fields['byte skip'] || fields.byteskip || '0';
  const start = +skip === -1 ? raw.length - count * bpe : Math.max(0, +skip || 0);
  if (start + count * bpe > raw.length) throw new Error('The NRRD data is shorter than its header says.');
  const copy = raw.slice(start, start + count * bpe);
  const big = (fields.endian || 'little').toLowerCase() === 'big';
  if (big && bpe > 1) {
    for (let i = 0; i < copy.length; i += bpe) copy.subarray(i, i + bpe).reverse();
  }
  const data = new Ctor(copy.buffer, 0, count);
  // Voxel size per axis. A 2D image gets its in-plane size repeated as the third value.
  const axes = dim - axisOffset;
  let spacing = null;
  if (fields['space directions']) {
    const parts = fields['space directions'].match(/\([^)]*\)|none/g) || [];
    const lens = parts.filter((p) => p !== 'none').map(vecLen);
    if (lens.length >= axes && lens.slice(0, axes).every((l) => l > 0)) spacing = lens.slice(0, axes);
  } else if (fields.spacings) {
    const s = fields.spacings.split(/\s+/).map(Number).slice(axisOffset);
    if (s.length >= axes && s.slice(0, axes).every((x) => x > 0)) spacing = s.slice(0, axes);
  }
  if (spacing) {
    const k = spaceUnitScale(fields['space units'] || fields.units);
    spacing = spacing.map((x) => x * k);
    if (spacing.length === 2) spacing.push(spacing[0]);
  }
  return { dims: sizes, spacing, data, type };
}
