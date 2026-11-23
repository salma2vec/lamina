/**
 * Soft contact shadow on the floor. The objects are rendered from below
 * into a small target as darkness that fades with height, then blurred.
 * It is redrawn only when the objects change, since the camera moves and
 * the objects do not.
 */
import * as THREE from 'three';

const BLUR = {
  uniforms: { tDiffuse: { value: null }, delta: { value: new THREE.Vector2() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 delta; varying vec2 vUv;
    void main() {
      vec4 s = texture2D( tDiffuse, vUv ) * 0.1633;
      s += ( texture2D( tDiffuse, vUv - delta ) + texture2D( tDiffuse, vUv + delta ) ) * 0.1531;
      s += ( texture2D( tDiffuse, vUv - 2.0 * delta ) + texture2D( tDiffuse, vUv + 2.0 * delta ) ) * 0.12245;
      s += ( texture2D( tDiffuse, vUv - 3.0 * delta ) + texture2D( tDiffuse, vUv + 3.0 * delta ) ) * 0.0918;
      s += ( texture2D( tDiffuse, vUv - 4.0 * delta ) + texture2D( tDiffuse, vUv + 4.0 * delta ) ) * 0.051;
      gl_FragColor = s;
    }`,
};

export class ContactShadow {
  /**
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType };
    this.rt = new THREE.WebGLRenderTarget(256, 256, opts);
    this.rtBlur = new THREE.WebGLRenderTarget(256, 256, opts);
    this.rt.texture.generateMipmaps = this.rtBlur.texture.generateMipmaps = false;
    const g = new THREE.PlaneGeometry(1, 1);
    // The shadow camera looks up from below, so its image is mirrored in y.
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.material = new THREE.MeshBasicMaterial({ map: this.rt.texture, transparent: true, depthWrite: false, color: 0x000000 });
    this.material.onBeforeCompile = (s) => {
      // Darkness lives in alpha; colour stays black.
      s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', 'diffuseColor.a *= texture2D( map, vMapUv ).a;');
    };
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.name = 'contact-shadow';
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    this.camera.rotation.x = Math.PI;
    this.depth = new THREE.MeshDepthMaterial();
    this.depth.userData.darkness = { value: 1.4 };
    this.depth.onBeforeCompile = (s) => {
      s.uniforms.darkness = this.depth.userData.darkness;
      s.fragmentShader = 'uniform float darkness;\n' + s.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * darkness );');
    };
    this.depth.side = THREE.DoubleSide;
    this.blur = new THREE.ShaderMaterial({ ...BLUR, uniforms: THREE.UniformsUtils.clone(BLUR.uniforms), depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
    this.quad.frustumCulled = false;
    this.blurScene = new THREE.Scene();
    this.blurScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Place the shadow under a footprint.
   * @param {number} cx centre x
   * @param {number} cy centre y
   * @param {number} floorZ floor height
   * @param {number} w footprint width (x)
   * @param {number} h footprint depth (y)
   * @param {number} height how far above the floor objects still cast a shadow
   * @param {number} [opacity]
   */
  place(cx, cy, floorZ, w, h, height, opacity = 0.62) {
    this.mesh.position.set(cx, cy, floorZ + height * 0.0015);
    this.mesh.scale.set(w, h, 1);
    const c = this.camera;
    c.left = -w / 2; c.right = w / 2; c.top = h / 2; c.bottom = -h / 2;
    c.near = 0; c.far = height;
    c.position.set(cx, cy, floorZ);
    c.updateProjectionMatrix();
    this.material.opacity = opacity;
    this.blurPx = 3.2;
  }

  /**
   * Redraw the shadow of everything in `scene` except the shadow itself.
   * @param {THREE.Scene} scene
   * @param {THREE.Plane[]} [clip] clipping planes to respect
   */
  update(scene, clip = []) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearAlpha();
    const prevAuto = r.autoClear;
    const hidden = [];
    scene.traverse((o) => { if (o.visible && (o === this.mesh || o.userData.noShadow)) { o.visible = false; hidden.push(o); } });
    const bg = scene.background;
    scene.background = null;
    scene.overrideMaterial = this.depth;
    this.depth.clippingPlanes = clip;
    r.autoClear = true;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, this.camera);
    scene.overrideMaterial = null;
    scene.background = bg;
    for (const o of hidden) o.visible = true;
    for (let pass = 0; pass < 2; pass++) {
      const k = pass === 0 ? this.blurPx : this.blurPx * 0.5;
      this.blurPass(this.rt, this.rtBlur, k / 256, 0);
      this.blurPass(this.rtBlur, this.rt, 0, k / 256);
    }
    r.setRenderTarget(prevTarget);
    r.setClearAlpha(prevClear);
    r.autoClear = prevAuto;
  }

  blurPass(src, dst, dx, dy) {
    this.blur.uniforms.tDiffuse.value = src.texture;
    this.blur.uniforms.delta.value.set(dx, dy);
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.blurScene, this.quadCam);
  }
}
