/**
 * Pattern mode: tiled slices on a slab or a bowl. The bowl is mapped like a
 * patterned slab pressed into a mould: distance along the wall from the
 * centre sets the distance from the centre of the pattern.
 */
import * as THREE from 'three';
import { clayMaterial } from './clay.js';
import { ContactShadow } from './shadow.js';
import { drawPattern } from '../pattern-texture.js';

const SLAB = { w: 240, h: 150, t: 9, r: 9, bevel: 2.4 };
const BOWL = { R: 112, H: 50, wall: 4.6, foot: 38, seg: 160 };

function roundedRect(w, h, r, seg = 8) {
  const pts = [], nrm = [];
  const cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2]];
  for (const [cx, cy, a0] of cs) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      nrm.push([Math.cos(a), Math.sin(a)]);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return { pts, nrm };
}

/** A slab with softened top edges, lying on z = 0. */
function slabGeometry() {
  const { w, h, t, r, bevel } = SLAB;
  const loop = roundedRect(w, h, r);
  const n = loop.pts.length;
  const pos = [], nor = [], uv = [], idx = [];
  const put = (x, y, z, nx, ny, nz) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(x / w + 0.5, y / h + 0.5); return pos.length / 3 - 1; };
  // Top face: fan from the centre.
  const c = put(0, 0, t, 0, 0, 1);
  const ring = (k, steps) => {
    const th = (k / steps) * (Math.PI / 2);
    const inset = bevel * (1 - Math.sin(th));
    const z = t - bevel + bevel * Math.cos(th);
    return loop.pts.map(([x, y], i) => {
      const [nx, ny] = loop.nrm[i];
      return put(x - nx * inset, y - ny * inset, z, nx * Math.sin(th), ny * Math.sin(th), Math.cos(th));
    });
  };
  const steps = 4;
  const rings = [];
  for (let k = 0; k <= steps; k++) rings.push(ring(k, steps));
  const top = rings[0];
  for (let i = 0; i < n; i++) idx.push(c, top[i], top[(i + 1) % n]);
  const bottomRing = loop.pts.map(([x, y], i) => put(x, y, 0, loop.nrm[i][0], loop.nrm[i][1], 0));
  rings.push(bottomRing);
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(A[i], B[i], B[j], A[i], B[j], A[j]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Profile of a thrown bowl: points {r, z, nr, nz, s} from the inside centre over the rim to the foot. */
function bowlProfile() {
  const { R, H, wall, foot } = BOWL;
  const Ri = R - wall / 2;
  const base = wall * 1.25;
  const inner = [];
  const M = 48;
  for (let i = 0; i <= M; i++) {
    const r = (i / M) * Ri;
    const z = base + (H - base) * Math.pow(r / Ri, 2.1);
    inner.push([r, z]);
  }
  const withNormals = (pts, flip) => pts.map(([r, z], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tr = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(tr, tz) || 1;
    tr /= l; tz /= l;
    // Inside surface faces up and in; outside faces down and out.
    return flip ? { r, z, nr: tz, nz: -tr } : { r, z, nr: -tz, nz: tr };
  });
  const inn = withNormals(inner, false);
  let s = 0;
  inn.forEach((p, i) => { if (i) s += Math.hypot(p.r - inn[i - 1].r, p.z - inn[i - 1].z); p.s = s; });
  const S = s;
  // Outside: the inside pushed out by the wall thickness, flattened into a foot.
  const out = inn.map((p) => ({ r: p.r - p.nr * wall, z: p.z - p.nz * wall, s: p.s }));
  const outer = [];
  for (const p of out) if (p.r >= foot) outer.push([Math.max(p.r, 0), Math.max(p.z, 0), p.s]);
  const outerN = withNormals(outer.map(([r, z]) => [r, z]), true).map((p, i) => ({ ...p, s: outer[i][2] }));
  // Rim: a half round from the inside lip to the outside lip.
  const a = inn[inn.length - 1], b = outerN[outerN.length - 1];
  const rim = [];
  const cr = (a.r + b.r) / 2, cz = (a.z + b.z) / 2, rr = Math.hypot(a.r - b.r, a.z - b.z) / 2;
  const a0 = Math.atan2(a.z - cz, a.r - cr);
  for (let k = 1; k < 8; k++) {
    const t = a0 - (k / 8) * Math.PI;
    rim.push({ r: cr + rr * Math.cos(t), z: cz + rr * Math.sin(t), nr: Math.cos(t), nz: Math.sin(t), s: S });
  }
  const footPts = [{ r: outerN[0].r, z: 0, nr: 0, nz: -1, s: outerN[0].s }, { r: 0, z: 0, nr: 0, nz: -1, s: 0 }];
  return { pts: [...inn, ...rim, ...outerN.slice().reverse(), ...footPts], S };
}

function bowlGeometry() {
  const { pts, S } = bowlProfile();
  const seg = BOWL.seg;
  const pos = [], nor = [], uv = [], idx = [];
  const k = 0.5 / (S * 1.03);
  for (const p of pts) {
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(p.r * c, p.r * s, p.z);
      nor.push(p.nr * c, p.nr * s, p.nz);
      uv.push(0.5 + p.s * k * c, 0.5 + p.s * k * s);
    }
  }
  const W = seg + 1;
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class PatternMode {
  /**
   * @param {import('./stage.js').Stage} stage
   */
  constructor(stage) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.canvas = document.createElement('canvas');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = stage.renderer.capabilities.getMaxAnisotropy();
    this.material = clayMaterial({ map: this.texture, side: THREE.DoubleSide }, 0.05);
    this.forms = { slab: new THREE.Mesh(slabGeometry(), this.material), vessel: new THREE.Mesh(bowlGeometry(), this.material) };
    for (const m of Object.values(this.forms)) { m.visible = false; this.scene.add(m); }
    this.shadow = new ContactShadow(stage.renderer);
    this.scene.add(this.shadow.mesh);
    this.form = null;
    this.userMoved = false;
    this.margin = 1.08;
  }

  bounds() {
    const m = this.forms[this.form];
    if (!m) return null;
    m.geometry.computeBoundingSphere();
    return m.geometry.boundingSphere.clone();
  }

  viewDir() { return this.form === 'vessel' ? new THREE.Vector3(-0.3, -1, 1.25) : new THREE.Vector3(-0.38, -1, 0.92); }

  /**
   * Show the slab or the bowl.
   * @param {'slab'|'vessel'} form
   */
  setForm(form) {
    if (form === this.form) return false;
    this.form = form;
    for (const [k, m] of Object.entries(this.forms)) m.visible = k === form;
    if (form === 'vessel') this.shadow.place(0, 0, 0, BOWL.R * 3.2, BOWL.R * 3.2, BOWL.H * 1.1, 0.75);
    else this.shadow.place(0, 0, 0, SLAB.w * 1.5, SLAB.h * 1.9, SLAB.t * 6, 0.8);
    this.shadowDirty = true;
    this.textureDirty = true;
    this.stage.invalidate();
    return true;
  }

  /**
   * Redraw the tiled pattern into the form's texture.
   * @param {import('../app.js').App} app
   */
  updateTexture(app) {
    if (!app.d.labels) return;
    const big = Math.min(2048, this.stage.renderer.capabilities.maxTextureSize);
    if (this.form === 'vessel') drawPattern(app, this.canvas, big, big);
    else drawPattern(app, this.canvas, big, Math.round((big * SLAB.h) / SLAB.w));
    // A new canvas size needs a new texture; otherwise the upload reuses it.
    if (this.texture.image.width !== this.lastW || this.texture.image.height !== this.lastH) {
      this.texture.dispose();
      this.lastW = this.canvas.width; this.lastH = this.canvas.height;
    }
    this.texture.needsUpdate = true;
    this.textureDirty = false;
    this.stage.invalidate();
  }

  beforeRender() {
    if (this.shadowDirty) {
      this.shadowDirty = false;
      this.shadow.update(this.scene);
    }
  }
}
