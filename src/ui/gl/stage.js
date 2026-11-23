/**
 * The 3D viewport: one renderer, a studio background, an orbit camera and
 * one scene per mode. Frames are drawn only when something changed.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const BACKDROP = {
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.9999, 1.0 ); }',
  fragmentShader: `uniform vec3 inner; uniform vec3 outer; uniform vec2 aspect; uniform float lift;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec2 p = ( vUv - vec2( 0.5, 0.5 + lift ) ) * aspect;
      float t = smoothstep( 0.0, 1.05, length( p ) );
      gl_FragColor = vec4( mix( inner, outer, t ), 1.0 );
      #include <colorspace_fragment>
      gl_FragColor.rgb += ( hash( gl_FragCoord.xy ) - 0.5 ) / 255.0;
    }`,
};

/** True when a WebGL context can be created. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} host element whose size the canvas follows
   */
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    r.autoClear = false;
    this.renderer = r;
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      ...BACKDROP,
      uniforms: {
        inner: { value: new THREE.Color('#252321') },
        outer: { value: new THREE.Color('#121110') },
        aspect: { value: new THREE.Vector2(1, 1) },
        lift: { value: 0.04 },
      },
      depthTest: false, depthWrite: false,
    }));
    this.backdrop.frustumCulled = false;
    this.backScene = new THREE.Scene();
    this.backScene.add(this.backdrop);
    this.backCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1e5);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.9;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.addEventListener('start', () => { canvas.classList.add('dragging'); if (this.mode) this.mode.userMoved = true; });
    this.controls.addEventListener('end', () => canvas.classList.remove('dragging'));
    this.modes = {};
    this.mode = null;
    this.dirty = true;
    this.active = true;
    this.anim = null;
    canvas.addEventListener('dblclick', () => this.frame(true));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = (t) => {
      requestAnimationFrame(loop);
      if (!this.active) return;
      let moved = false;
      if (this.anim) moved = this.stepAnim(t) || moved;
      moved = this.controls.update() || moved;
      if (moved || this.dirty) this.draw();
    };
    requestAnimationFrame(loop);
  }

  /** Ask for a redraw on the next frame. */
  invalidate() { this.dirty = true; }

  /**
   * Register a mode scene. A mode has {scene, bounds(), viewDir(), shadow?, userMoved}.
   * @param {string} name
   * @param {Object} mode
   */
  add(name, mode) { this.modes[name] = mode; }

  /** Show a mode, keeping each mode's own camera. */
  show(name) {
    if (this.mode) this.mode.view = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.mode = this.modes[name];
    this.anim = null;
    if (this.mode.view && this.mode.userMoved) {
      this.camera.position.copy(this.mode.view.pos);
      this.controls.target.copy(this.mode.view.target);
      this.fitClip();
      this.controls.update();
    } else {
      this.frame(false);
    }
    this.invalidate();
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    // Lift the image a little: the bottom edge holds the mode control.
    this.camera.setViewOffset(r.width, r.height, 0, Math.round(r.height * 0.035), r.width, r.height);
    this.camera.updateProjectionMatrix();
    const a = r.width / r.height;
    this.backdrop.material.uniforms.aspect.value.set(a > 1 ? a : 1, a > 1 ? 1 : 1 / a);
    if (this.mode && !this.mode.userMoved) this.frame(false);
    this.invalidate();
  }

  /** Camera distance that fits a sphere of radius R in the view. */
  fitDistance(R, margin = 1.18) {
    const v = (this.camera.fov * Math.PI) / 360;
    const hf = Math.atan(Math.tan(v) * this.camera.aspect);
    return (R * margin) / Math.sin(Math.min(v, hf));
  }

  /** Near and far planes that suit the current object and distance. */
  fitClip() {
    const b = this.mode && this.mode.bounds();
    if (!b) return;
    const d = this.camera.position.distanceTo(b.center);
    this.camera.near = Math.max(b.radius * 0.01, d - b.radius * 6);
    this.camera.far = d + b.radius * 12;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = b.radius * 0.6;
    this.controls.maxDistance = b.radius * 12;
  }

  /**
   * Frame the current mode's object.
   * @param {boolean} animate keep the viewing direction and ease the camera in
   */
  frame(animate) {
    const m = this.mode;
    const b = m && m.bounds();
    if (!b) return;
    const dist = this.fitDistance(b.radius, m.margin || 1.18);
    let dir;
    if (animate) dir = this.camera.position.clone().sub(this.controls.target).normalize();
    else dir = m.viewDir().clone().normalize();
    const pos = b.center.clone().addScaledVector(dir, dist);
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(b.center);
      m.userMoved = false;
      this.fitClip();
      this.controls.update();
      this.invalidate();
      return;
    }
    this.anim = { t0: performance.now(), dur: 380, p0: this.camera.position.clone(), p1: pos, q0: this.controls.target.clone(), q1: b.center.clone() };
  }

  stepAnim(t) {
    const a = this.anim;
    const k = Math.min(1, (t - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - k, 3);
    this.camera.position.lerpVectors(a.p0, a.p1, e);
    this.controls.target.lerpVectors(a.q0, a.q1, e);
    if (k >= 1) { this.anim = null; this.fitClip(); }
    return true;
  }

  draw() {
    this.dirty = false;
    const r = this.renderer;
    r.setRenderTarget(null);
    r.clear(true, true, true);
    r.render(this.backScene, this.backCam);
    if (!this.mode) return;
    if (this.mode.beforeRender) this.mode.beforeRender(this.camera);
    r.clearDepth();
    r.render(this.mode.scene, this.camera);
  }
}
