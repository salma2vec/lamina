/** 3D view: mesh or orthogonal volume slices, plus the cutting plane. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { centreSlice } from '../volume/resample.js';
import { cropOutlineInSlice } from '../cane/crop.js';
import { outlinePolygon } from '../cane/outline.js';
import { cssVar } from './dom.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class View3D {
  /**
   * @param {HTMLElement} host
   * @param {import('./app.js').App} app
   */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.ok = webglAvailable();
    if (!this.ok) {
      host.innerHTML = '<p class="empty">The 3D view needs WebGL. The other views still work.</p>';
      return;
    }
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1e6);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', () => this.render());
    this.controls.addEventListener('start', () => { this.userMoved = true; });
    this.scene.add(new THREE.HemisphereLight(0xfffaf0, 0x6f665a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(1, -1.2, 2);
    this.scene.add(key);
    this.srcGroup = new THREE.Group();
    this.planeGroup = new THREE.Group();
    this.scene.add(this.srcGroup, this.planeGroup);
    this.planeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    this.edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
    this.inkMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3 });
    this.contourMat = new THREE.LineBasicMaterial();
    this.applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.applyTheme(); this.render(); });
    new ResizeObserver(() => this.resize()).observe(host);
  }

  applyTheme() {
    const accent = new THREE.Color(cssVar('--accent-ink') || '#7a1f1f');
    const ink = new THREE.Color(cssVar('--ink') || '#1b1a18');
    this.planeMat.color = accent;
    this.edgeMat.color = accent;
    this.contourMat.color = accent;
    this.inkMat.color = ink;
  }

  resize() {
    if (!this.ok) return;
    const r = this.host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    if (!this.userMoved) this.fitCamera();
    this.render();
  }

  /** Place the camera so the source's bounding sphere fills the view. */
  fitCamera() {
    if (!this.radius) return;
    const v = (this.camera.fov * Math.PI) / 360;
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect);
    const dist = (this.radius * 1.08) / Math.sin(Math.min(v, hfov));
    const dir = new THREE.Vector3(1.25, -1.75, 1.1).normalize();
    this.camera.position.copy(dir.multiplyScalar(dist));
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  clear(group) {
    for (const c of [...group.children]) {
      group.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== this.planeMat && o.material !== this.edgeMat && o.material !== this.inkMat && o.material !== this.contourMat) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
  }

  /** Rebuild source geometry and frame the camera. */
  setSource(s) {
    if (!this.ok) return;
    this.clear(this.srcGroup);
    this.userMoved = false;
    if (!s) { this.render(); return; }
    if (s.kind === 'mesh') {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(s.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(s.mesh.indices, 1));
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ color: 0xd8cdbd, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      this.meshObj = new THREE.Mesh(g, m);
      this.srcGroup.add(this.meshObj);
    } else if (s.kind === 'volume') {
      const v = s.volume;
      const [sx, sy, sz] = s.size;
      const tex = (sl) => {
        const rgba = new Uint8Array(sl.w * sl.h * 4);
        for (let i = 0; i < sl.w * sl.h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = sl.data[i]; rgba[i * 4 + 3] = 255; }
        const t = new THREE.DataTexture(rgba, sl.w, sl.h, THREE.RGBAFormat);
        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        return t;
      };
      const mk = (w, h, sl, rot) => {
        const g = new THREE.PlaneGeometry(w, h);
        rot(g);
        const mat = new THREE.MeshBasicMaterial({ map: tex(sl), side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
        this.srcGroup.add(new THREE.Mesh(g, mat));
      };
      mk(sx, sy, centreSlice(v, 'z'), () => {});
      mk(sx, sz, centreSlice(v, 'y'), (g) => g.rotateX(Math.PI / 2));
      mk(sy, sz, centreSlice(v, 'x'), (g) => { g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); });
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), this.inkMat);
      this.srcGroup.add(box);
    } else {
      const im = s.image;
      const rgba = new Uint8Array(im.w * im.h * 4);
      for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
        const o = ((im.h - 1 - y) * im.w + x) * 4;
        const g = im.data[y * im.w + x] * 255;
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255;
      }
      const t = new THREE.DataTexture(rgba, im.w, im.h, THREE.RGBAFormat);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      this.srcGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })));
    }
    const R = Math.max(...s.size);
    this.radius = Math.hypot(...s.size) / 2;
    this.camera.near = R / 200;
    this.camera.far = R * 50;
    this.controls.target.set(0, 0, 0);
    this.fitCamera();
    this.resize();
  }

  /** Update the cutting plane, contours and crop outline. */
  updatePlane() {
    if (!this.ok) return;
    this.clear(this.planeGroup);
    const s = this.app.source, sl = this.app.d.slice;
    if (!s || !sl || s.kind === 'image') { this.render(); return; }
    const f = sl.frame;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), new THREE.Vector3(...f.n));
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    basis.setPosition(new THREE.Vector3(...f.origin));
    holder.matrix.copy(basis);
    const size = sl.half * 2;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.planeMat);
    quad.renderOrder = 2;
    holder.add(quad);
    const h = size / 2;
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-h, -h, 0), new THREE.Vector3(h, -h, 0), new THREE.Vector3(h, h, 0), new THREE.Vector3(-h, h, 0)]), this.edgeMat);
    holder.add(edge);
    if (sl.loops) {
      const pts = [];
      for (const l of sl.loops) {
        const n = l.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          pts.push(l[i * 2], l[i * 2 + 1], 0, l[j * 2], l[j * 2 + 1], 0);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(g, this.contourMat);
      lines.renderOrder = 3;
      holder.add(lines);
    }
    const o = this.app.params.outline;
    const poly = cropOutlineInSlice(o, outlinePolygon(o.shape, o.aspect), this.app.ref);
    const ol = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map(([x, y]) => new THREE.Vector3(x, y, 0))), this.inkMat);
    holder.add(ol);
    this.planeGroup.add(holder);
    this.render();
  }

  render() {
    if (!this.ok || !this.visible) return;
    this.renderer.render(this.scene, this.camera);
  }

  setVisible(v) {
    this.visible = v;
    if (v) this.resize();
  }
}
