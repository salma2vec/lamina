/** Matte clay shading: a generated studio matcap and a material that uses it. */
import * as THREE from 'three';

let shared = null;

/**
 * A matcap of a neutral sphere under a soft key light from the upper left,
 * a cool fill from the right and a faint rim. Faces turned to the viewer
 * come out close to the base colour, so clay colours read true.
 * @param {number} [size]
 */
export function studioMatcap(size = 256) {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const key = norm([-0.36, 0.5, 0.79]);
  const fill = norm([0.75, -0.05, 0.45]);
  const half = norm([key[0], key[1], key[2] + 1]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = ((x + 0.5) / size) * 2 - 1, ny = 1 - ((y + 0.5) / size) * 2;
      const r = Math.hypot(nx, ny);
      if (r > 0.999) { nx /= r / 0.999; ny /= r / 0.999; }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const dk = nx * key[0] + ny * key[1] + nz * key[2];
      const df = nx * fill[0] + ny * fill[1] + nz * fill[2];
      const wrap = Math.max(0, (dk + 0.5) / 1.5);
      const sky = 0.5 + 0.5 * ny;
      const ground = Math.min(1, Math.max(0, (ny + 1) / 0.9));
      const rim = Math.pow(1 - nz, 3) * Math.max(0, 0.35 + 0.65 * ny);
      const spec = Math.pow(Math.max(0, nx * half[0] + ny * half[1] + nz * half[2]), 40);
      let v = 0.24 + 0.72 * wrap * wrap + 0.08 * Math.max(0, df) + 0.06 * sky + 0.1 * rim;
      v *= 0.72 + 0.28 * ground;
      const o = (y * size + x) * 4;
      img.data[o] = Math.min(255, 255 * (v * 1.0 + 0.05 * spec));
      img.data[o + 1] = Math.min(255, 255 * (v * 0.985 + 0.05 * spec));
      img.data[o + 2] = Math.min(255, 255 * (v * 0.955 + 0.05 * spec + 0.02 * Math.max(0, df)));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // The values are used as plain light multipliers, so the texture is not decoded from sRGB.
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  shared = t;
  return t;
}

/**
 * Clay material: matcap shading with a faint satin sheen, so dark clays
 * still show their form.
 * @param {Object} [opt] MeshMatcapMaterial options
 * @param {number} [sheen] strength of the sheen, 0..0.2
 */
export function clayMaterial(opt = {}, sheen = 0.06) {
  const m = new THREE.MeshMatcapMaterial({ matcap: studioMatcap(), ...opt });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSheen = { value: sheen };
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float opacity;', 'uniform float opacity;\nuniform float uSheen;')
      .replace('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;',
        'vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;\n' +
        '\tvec3 sheenH = normalize( vec3( -0.32, 0.42, 1.0 ) );\n' +
        '\toutgoingLight += uSheen * pow( max( dot( normal, sheenH ), 0.0 ), 22.0 ) * ( 1.0 - 0.6 * diffuseColor.rgb );');
  };
  m.customProgramCacheKey = () => `clay-${sheen}`;
  return m;
}

/**
 * Texture from RGBA bytes, row 0 at the top.
 * @param {Uint8ClampedArray|Uint8Array} data
 * @param {number} w
 * @param {number} h
 * @param {boolean} [srgb]
 */
export function rgbaTexture(data, w, h, srgb = true) {
  const t = new THREE.DataTexture(data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w, h, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}
