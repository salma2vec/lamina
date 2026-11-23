/**
 * Cane mode: a clay log with the cane pattern on its end and the colours
 * running along its sides, and one thin slice lifted off the end.
 * World units are millimetres; the log lies along +y with its end facing -y.
 */
import * as THREE from 'three';
import { clayMaterial, rgbaTexture } from './clay.js';
import { ContactShadow } from './shadow.js';
import { outlinePolygon, outlineHeight } from '../../cane/outline.js';

/**
 * Outline as a dense loop with outward normals. Corners of polygons are
 * rounded slightly, the way a rolled cane softens them.
 * @param {string} shape
 * @param {number} aspect
 * @returns {{pts:number[][], nrm:number[][]}} unit coordinates, width 1
 */
export function softOutline(shape, aspect) {
  const poly = outlinePolygon(shape, aspect);
  if (shape === 'circle') {
    const pts = poly.map(([x, y]) => [x, y]);
    return { pts, nrm: pts.map(([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; }) };
  }
  const r = 0.035, seg = 6;
  const pts = [], nrm = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const da = [p[0] - a[0], p[1] - a[1]], db = [b[0] - p[0], b[1] - p[1]];
    const la = Math.hypot(...da), lb = Math.hypot(...db);
    const na = [da[1] / la, -da[0] / la], nb = [db[1] / lb, -db[0] / lb];
    // Corner centre: inset from both edges by r.
    const ang = Math.acos(Math.max(-1, Math.min(1, na[0] * nb[0] + na[1] * nb[1])));
    const bis = [na[0] + nb[0], na[1] + nb[1]];
    const bl = Math.hypot(...bis);
    const d = r / Math.cos(ang / 2);
    const c = [p[0] - (bis[0] / bl) * d, p[1] - (bis[1] / bl) * d];
    const a0 = Math.atan2(na[1], na[0]);
    let a1 = Math.atan2(nb[1], nb[0]);
    while (a1 < a0) a1 += Math.PI * 2;
    for (let k = 0; k <= seg; k++) {
      const t = a0 + ((a1 - a0) * k) / seg;
      nrm.push([Math.cos(t), Math.sin(t)]);
      pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
    }
  }
  return { pts, nrm };
}

/**
 * Geometry of a prism along +y from y0 to y1 with the given cross-section.
 * Sides get u = perimeter fraction, v = position along the length.
 * @returns {{side:THREE.BufferGeometry, front:THREE.BufferGeometry, back:THREE.BufferGeometry, perim:number[]}}
 */
function prism(loop, D, y0, y1, capScale) {
  const { pts, nrm } = loop;
  const n = pts.length;
  const perim = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1], b = pts[i % n];
    perim.push(perim[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = perim[n];
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n], q = nrm[i % n], u = perim[i] / total;
    pos.push(p[0] * D, y0, p[1] * D, p[0] * D, y1, p[1] * D);
    nor.push(q[0], 0, q[1], q[0], 0, q[1]);
    uv.push(u, 0, u, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.setIndex(idx);
  const cap = (y, facing) => {
    const P = [0, y, 0], N = [0, facing, 0], U = [0.5, 0.5];
    for (const [x, z] of pts) { P.push(x * D, y, z * D); N.push(0, facing, 0); U.push(0.5 + x * capScale, 0.5 - z * capScale); }
    const I = [];
    for (let i = 0; i < n; i++) {
      const a = 1 + i, b = 1 + ((i + 1) % n);
      if (facing < 0) I.push(0, a, b); else I.push(0, b, a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    return g;
  };
  return { side, front: cap(y0, -1), back: cap(y1, 1), perim: perim.map((v) => v / total) };
}

function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class CaneMode {
  /**
   * @param {import('./stage.js').Stage} stage
   */
  constructor(stage) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.endMat = clayMaterial({}, 0.05);
    this.sideMat = clayMaterial({}, 0.05);
    this.shadow = new ContactShadow(stage.renderer);
    this.scene.add(this.shadow.mesh);
    this.key = '';
    this.userMoved = false;
    this.box = null;
    this.margin = 1.05;
  }

  bounds() {
    if (!this.box) return null;
    const s = this.box.getBoundingSphere(new THREE.Sphere());
    return s;
  }

  /** Three-quarter view onto the end face. */
  viewDir() { return new THREE.Vector3(0.5, -1, 0.46); }

  /**
   * Rebuild the log for the current outline and sizes when they change.
   * @param {import('../app.js').App} app
   */
  build(app) {
    const p = app.params;
    const D = p.cane.size;
    // Shown shorter than a real cane, so the end stays the subject.
    const ratio = Math.min(1.7, Math.max(1.1, p.cane.length / D));
    const key = `${p.outline.shape}:${p.outline.aspect}:${D}:${ratio}`;
    if (key === this.key) return false;
    this.key = key;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const loop = softOutline(p.outline.shape, p.outline.aspect);
    this.loop = loop;
    const hf = outlineHeight(p.outline.shape, p.outline.aspect);
    const L = D * ratio;
    // Sample the cane slightly inside the edge so the caps never show the transparent border.
    const capScale = 0.985;
    const log = prism(loop, D, 0, L, capScale);
    this.perim = log.perim;
    const t = Math.max(2.2, D * 0.05);
    const sl = prism(loop, D, -t / 2, t / 2, capScale);
    const logGroup = new THREE.Group();
    logGroup.add(new THREE.Mesh(log.side, this.sideMat), new THREE.Mesh(log.front, this.endMat), new THREE.Mesh(log.back, this.endMat));
    const slice = new THREE.Group();
    slice.add(new THREE.Mesh(sl.side, this.sideMat), new THREE.Mesh(sl.front, this.endMat), new THREE.Mesh(sl.back, this.endMat));
    // The slice stands a little in front of the end, turned and leaning, as if just cut.
    const zBottom = -hf * D / 2;
    slice.position.set(-D * 0.62, -D * 0.48, 0);
    slice.rotation.set(-0.14, 0, -0.3);
    slice.updateMatrixWorld();
    const sb = new THREE.Box3().setFromObject(slice);
    slice.position.z += zBottom - sb.min.z + D * 0.012;
    this.group.add(logGroup, slice);
    this.group.updateMatrixWorld(true);
    this.box = new THREE.Box3().setFromObject(this.group);
    const c = this.box.getCenter(new THREE.Vector3()), sz = this.box.getSize(new THREE.Vector3());
    this.shadow.place(c.x, c.y, zBottom, sz.x * 1.9, sz.y * 1.6, Math.max(sz.z, D) * 1.2, 0.85);
    this.shadowDirty = true;
    this.stage.invalidate();
    return true;
  }

  /**
   * Put the rendered cane on the ends and its edge colours on the sides.
   * @param {import('../app.js').App} app
   */
  updateTexture(app) {
    const img = app.d.caneImage;
    if (!img) return;
    this.build(app);
    if (this.endMat.map) this.endMat.map.dispose();
    this.endMat.map = rgbaTexture(img.data, img.width, img.height);
    this.endMat.map.anisotropy = this.stage.renderer.capabilities.getMaxAnisotropy();
    this.endMat.needsUpdate = true;
    // Side strip: the colour at each point of the edge, carried along the length with a faint grain.
    const U = 1024, V = 64, W = img.width;
    const side = new Uint8Array(U * V * 4);
    const { pts, nrm } = this.loop;
    const n = pts.length;
    const inset = 6 / W;
    let seg = 0;
    for (let x = 0; x < U; x++) {
      const u = (x + 0.5) / U;
      while (seg < n - 1 && this.perim[seg + 1] < u) seg++;
      const t = (u - this.perim[seg]) / Math.max(1e-9, this.perim[seg + 1] - this.perim[seg]);
      const a = pts[seg], b = pts[(seg + 1) % n], na = nrm[seg], nb = nrm[(seg + 1) % n];
      const px = a[0] + (b[0] - a[0]) * t - (na[0] + nb[0]) * 0.5 * inset;
      const py = a[1] + (b[1] - a[1]) * t - (na[1] + nb[1]) * 0.5 * inset;
      // Average a small patch, so a single speck in the clay texture does not become a stripe.
      const cx = (0.5 + px * 0.985) * W, cy = (0.5 - py * 0.985) * img.height;
      let r = 0, g = 0, bl = 0, cnt = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const ix = Math.min(W - 1, Math.max(0, Math.round(cx + dx))), iy = Math.min(img.height - 1, Math.max(0, Math.round(cy + dy)));
        const o = (iy * W + ix) * 4;
        if (img.data[o + 3] < 128) continue;
        r += img.data[o]; g += img.data[o + 1]; bl += img.data[o + 2]; cnt++;
      }
      if (cnt) { r /= cnt; g /= cnt; bl /= cnt; }
      for (let y = 0; y < V; y++) {
        const k = 1 + (hash(x >> 1, y) - 0.5) * 0.05 + (hash(x >> 3, 99) - 0.5) * 0.04;
        const q = (y * U + x) * 4;
        side[q] = Math.min(255, r * k); side[q + 1] = Math.min(255, g * k); side[q + 2] = Math.min(255, bl * k); side[q + 3] = 255;
      }
    }
    if (this.sideMat.map) this.sideMat.map.dispose();
    this.sideMat.map = rgbaTexture(side, U, V);
    this.sideMat.map.wrapS = THREE.RepeatWrapping;
    this.sideMat.needsUpdate = true;
    this.shadowDirty = true;
    this.stage.invalidate();
  }

  beforeRender() {
    if (this.shadowDirty) {
      this.shadowDirty = false;
      this.shadow.update(this.scene);
    }
  }
}
