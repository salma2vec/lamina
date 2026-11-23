/**
 * Section mode: the specimen in 3D, cut by the plane. The part on the far
 * side of the plane is clipped away, and the section is laid on the cut face.
 */
import * as THREE from 'three';
import { clayMaterial, rgbaTexture } from './clay.js';
import { ContactShadow } from './shadow.js';
import { planeBoxPolygon } from '../../geom/plane.js';
import { cropOutlineInSlice } from '../../cane/crop.js';
import { outlinePolygon } from '../../cane/outline.js';

const BONE = new THREE.Color('#d9cfbf');
const ACCENT = new THREE.Color('#c4574a');

/** Warm tone for a section value in 0..1: umber in the dark, ivory in the light. */
function tone(v, out, o) {
  const t = Math.min(1, Math.max(0, v));
  const k = Math.pow(t, 0.8);
  out[o] = 40 + (244 - 40) * k;
  out[o + 1] = 33 + (236 - 33) * Math.pow(k, 1.04);
  out[o + 2] = 28 + (222 - 28) * Math.pow(k, 1.1);
}

export class SectionMode {
  /**
   * @param {import('./stage.js').Stage} stage
   */
  constructor(stage) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.material = clayMaterial({ color: BONE, side: THREE.FrontSide, clippingPlanes: [this.clip] }, 0.05);
    this.specimen = null;
    this.holder = new THREE.Group();
    this.holder.matrixAutoUpdate = false;
    this.scene.add(this.holder);
    this.solidMat = clayMaterial({ alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }, 0.03);
    this.ghostMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.fillMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    this.edgeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 });
    this.cropMat = new THREE.LineDashedMaterial({ color: 0xf2ede4, transparent: true, opacity: 0.75, dashSize: 1, gapSize: 1 });
    this.shadow = new ContactShadow(stage.renderer);
    this.scene.add(this.shadow.mesh);
    this.size = null;
    this.userMoved = false;
    this.shadowDirty = false;
  }

  /** Bounding sphere of the specimen. */
  bounds() {
    if (!this.size) return null;
    return new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(...this.size) / 2);
  }

  /** Look at the cut face from slightly above. */
  viewDir() {
    const n = this.normal || new THREE.Vector3(0, 0, 1);
    const d = n.clone();
    if (Math.abs(n.z) > 0.9) d.add(new THREE.Vector3(0.42, -0.62, 0));
    else d.add(new THREE.Vector3(0, 0, 0.62)).add(new THREE.Vector3(-n.y, n.x, 0).multiplyScalar(0.42));
    return d.normalize();
  }

  disposeObject(o) {
    if (!o) return;
    o.parent && o.parent.remove(o);
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.material.map && c.material !== this.material) c.material.map.dispose();
    });
  }

  /**
   * Show a new source. Volumes get their surface later through setSurface().
   * @param {Object|null} s
   */
  setSource(s) {
    this.disposeObject(this.specimen);
    this.specimen = null;
    this.source = s;
    this.userMoved = false;
    this.clearPlane();
    if (!s || s.kind === 'template') { this.size = null; this.stage.invalidate(); return; }
    this.size = s.size.slice();
    if (s.kind === 'image') {
      // A photographed section: a thin plate carrying the image.
      const t = Math.max(s.size[0], s.size[1]) * 0.02;
      this.size = [s.size[0], s.size[1], t];
      const im = s.image;
      const rgba = new Uint8Array(im.w * im.h * 4);
      for (let i = 0; i < im.w * im.h; i++) { tone(im.data[i], rgba, i * 4); rgba[i * 4 + 3] = 255; }
      const tex = rgbaTexture(rgba, im.w, im.h);
      const geo = new THREE.BoxGeometry(s.size[0], s.size[1], t);
      // Box UVs on the top face already run 0..1; flip v because the image's row 0 is at the top.
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const side = clayMaterial({ color: new THREE.Color('#bdb2a2') });
      const top = clayMaterial({ map: tex }, 0.03);
      this.specimen = new THREE.Mesh(geo, [side, side, side, side, top, side]);
      this.normal = new THREE.Vector3(0, 0, 1);
    } else if (s.kind === 'mesh') {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(s.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(s.mesh.indices, 1));
      g.computeVertexNormals();
      this.material.side = THREE.DoubleSide;
      this.specimen = new THREE.Mesh(g, this.material);
    }
    if (this.specimen) this.root.add(this.specimen);
    const fz = -this.size[2] / 2;
    const R = Math.hypot(this.size[0], this.size[1]);
    this.shadow.place(0, 0, fz, R * 1.5, R * 1.5, Math.max(...this.size) * 0.9, 0.7);
    this.shadowDirty = true;
    this.stage.invalidate();
  }

  /**
   * Install an isosurface for the current volume.
   * @param {{positions:Float32Array, normals:Float32Array, indices:Uint32Array}} surf
   */
  setSurface(surf) {
    this.disposeObject(this.specimen);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(surf.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(surf.normals, 3));
    g.setIndex(new THREE.BufferAttribute(surf.indices, 1));
    g.computeBoundingSphere();
    this.material.side = THREE.FrontSide;
    this.specimen = new THREE.Mesh(g, this.material);
    this.root.add(this.specimen);
    // Rest the shadow under the surface itself, which may float inside its volume.
    g.computeBoundingBox();
    const b = g.boundingBox;
    const R = Math.hypot(this.size[0], this.size[1]);
    this.shadow.place((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.min.z, R * 1.5, R * 1.5, Math.max(...this.size) * 0.9, 0.7);
    this.shadowDirty = true;
    this.stage.invalidate();
  }

  clearPlane() {
    for (const c of [...this.holder.children]) this.disposeObject(c);
    this.solidMat.map = null;
    this.ghostMat.map = null;
    this.pick = null;
    this.crop = null;
  }

  /**
   * Move the cut to the current slice and lay the section on it.
   * @param {import('../app.js').App} app
   * @param {number} iso surface level, for volumes
   */
  updateSlice(app, iso) {
    const s = this.source, sl = app.d.slice;
    this.clearPlane();
    if (!s || s.kind === 'image' || s.kind === 'template') { this.clip.normal.set(0, 0, -1); this.clip.constant = 1e9; this.stage.invalidate(); return; }
    const f = app.frame;
    const n = new THREE.Vector3(...f.n);
    this.normal = n.clone();
    // Clip what lies on the +n side of the plane.
    this.clip.normal.copy(n).negate();
    this.clip.constant = f.n[0] * f.origin[0] + f.n[1] * f.origin[1] + f.n[2] * f.origin[2];
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), n);
    basis.setPosition(new THREE.Vector3(...f.origin));
    this.holder.matrix.copy(basis);
    this.holder.matrixWorldNeedsUpdate = true;
    this.stage.invalidate();
    this.shadowDirty = true;
    if (!sl) return;
    const half = sl.half;
    const lift = Math.max(...s.size) * 0.0008;
    // The plane: a faint fill and an accent edge.
    const sq = half * 1.04;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(2 * sq, 2 * sq), this.fillMat);
    fill.renderOrder = 3;
    fill.userData.noShadow = true;
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-sq, -sq], [sq, -sq], [sq, sq], [-sq, sq]].map(([x, y]) => new THREE.Vector3(x, y, lift))), this.edgeMat);
    edge.userData.noShadow = true;
    this.pick = fill;
    this.holder.add(fill, edge);
    // The cut face.
    const N = sl.w;
    const solid = new Uint8Array(N * N * 4);
    const ghost = s.kind === 'volume' ? new Uint8Array(N * N * 4) : null;
    for (let i = 0; i < N * N; i++) {
      const v = sl.data[i], o = i * 4;
      if (s.kind === 'volume') {
        tone(v, solid, o);
        solid[o + 3] = 255 * Math.min(1, Math.max(0, (v - iso) / 0.03 + 0.5));
        ghost[o] = solid[o]; ghost[o + 1] = solid[o + 1]; ghost[o + 2] = solid[o + 2];
        ghost[o + 3] = v < iso ? 52 : 0;
      } else {
        solid[o] = 206; solid[o + 1] = 193; solid[o + 2] = 174;
        solid[o + 3] = v > 0.5 ? 255 : 0;
      }
    }
    const poly = s.kind === 'volume' ? planeBoxPolygon(s.size, f) : [[-half, -half], [half, -half], [half, half], [-half, half]];
    if (poly.length >= 3) {
      const pos = [], uv = [];
      const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      const put = (x, y) => { pos.push(x, y, 0); uv.push(0.5 + x / (2 * half), 0.5 - y / (2 * half)); };
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        put(cx, cy); put(a[0], a[1]); put(b[0], b[1]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
      this.solidMat.map = rgbaTexture(solid, N, N);
      this.solidMat.needsUpdate = true;
      const face = new THREE.Mesh(g, this.solidMat);
      face.renderOrder = 1;
      this.holder.add(face);
      if (ghost) {
        this.ghostMat.map = rgbaTexture(ghost, N, N);
        this.ghostMat.needsUpdate = true;
        const gm = new THREE.Mesh(g, this.ghostMat);
        gm.renderOrder = 2;
        gm.userData.noShadow = true;
        this.holder.add(gm);
      }
      if (s.kind === 'volume') {
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(([x, y]) => new THREE.Vector3(x, y, lift))), this.edgeMat);
        outline.userData.noShadow = true;
        this.holder.add(outline);
      }
    }
    this.updateCrop(app);
  }

  /** Draw the cane window on the cut face. */
  updateCrop(app) {
    if (this.crop) { this.disposeObject(this.crop); this.crop = null; }
    const s = this.source, sl = app.d.slice;
    if (!s || s.kind === 'image' || s.kind === 'template' || !sl) { this.stage.invalidate(); return; }
    const o = app.params.outline;
    const poly = cropOutlineInSlice(o, outlinePolygon(o.shape, o.aspect), app.ref);
    const lift = Math.max(...s.size) * 0.0016;
    const pts = poly.map(([x, y]) => new THREE.Vector3(x, y, lift));
    pts.push(pts[0].clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.cropMat);
    line.computeLineDistances();
    const dash = app.ref / Math.max(0.5, o.zoom) / 60;
    this.cropMat.dashSize = dash * 1.4;
    this.cropMat.gapSize = dash;
    line.userData.noShadow = true;
    line.renderOrder = 4;
    this.crop = line;
    this.holder.add(line);
    this.stage.invalidate();
  }

  beforeRender() {
    if (this.shadowDirty) {
      this.shadowDirty = false;
      this.shadow.update(this.scene, [this.clip]);
    }
  }

  /**
   * Hit-test the plane.
   * @param {THREE.Raycaster} ray
   * @returns {THREE.Intersection|null}
   */
  pickPlane(ray) {
    if (!this.pick) return null;
    const hit = ray.intersectObject(this.pick, false);
    return hit.length ? hit[0] : null;
  }
}
