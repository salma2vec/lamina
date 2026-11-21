/** Pattern view: tiles cane slices on a slab or a vessel silhouette. */
import { fitCanvas, cssVar, fx } from './dom.js';
import { layoutTiles, LAYOUTS } from '../pattern/tile.js';
import { outlineHeight } from '../cane/outline.js';

/**
 * Draw tiled cane slices into a context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} cane rendered cane (square, transparent outside)
 * @param {number} w
 * @param {number} h
 * @param {Object} pat pattern parameters
 * @param {number} hf outline height fraction
 * @param {string} ground colour under the tiles
 */
export function drawTiles(ctx, cane, w, h, pat, hf, ground) {
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const T = Math.max(12, pat.tile * Math.min(w, h));
  const { tiles } = layoutTiles({
    layout: pat.layout, width: w, height: h, tileW: T, tileH: T * hf,
    gap: pat.gap, stretch: pat.stretch, stretchAngle: pat.stretchAngle,
    alternate: pat.alternate, jitter: pat.jitter ? 1 : 0, seed: 11,
  });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const t of tiles) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.transform(t.m[0], t.m[1], t.m[2], t.m[3], 0, 0);
    ctx.rotate(t.rot);
    ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
    ctx.drawImage(cane, -T / 2, -T / 2, T, T);
    ctx.restore();
  }
}

export class PatternView {
  constructor(canvas, cap, app) {
    this.canvas = canvas;
    this.cap = cap;
    this.app = app;
    this.flat = document.createElement('canvas');
    new ResizeObserver(() => this.visible && this.draw()).observe(canvas);
  }

  /** Colour of the clay with the largest area: it fills gaps between slices. */
  ground() {
    const sh = this.app.d.sheet;
    if (!sh || !sh.clays.length) return '#efeae0';
    return sh.clays.reduce((a, b) => (b.fraction > a.fraction ? b : a)).colour;
  }

  draw() {
    const { ctx, w, h, dpr } = fitCanvas(this.canvas);
    ctx.clearRect(0, 0, w, h);
    const app = this.app, p = app.params, pat = p.pattern;
    if (!app.source || !app.d.labels) { this.cap.innerHTML = ''; return; }
    const lay = LAYOUTS.find((l) => l.id === pat.layout);
    this.cap.innerHTML = `<b>Pattern</b>${lay.name.toLowerCase()}${pat.stretch > 1.001 ? ` &middot; stretch ${fx(pat.stretch, 2)}&times;` : ''}`;
    const hf = outlineHeight(p.outline.shape, p.outline.aspect);
    const ground = this.ground();
    const rule = cssVar('--rule-2');
    const m = 28;
    if (pat.preview === 'vessel') {
      this.drawVessel(ctx, w, h, dpr, hf, ground, rule);
      return;
    }
    const sw = w - 2 * m, sh = h - 2 * m - 6;
    if (sw < 10 || sh < 10) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(m, m + 6, sw, sh);
    ctx.clip();
    ctx.translate(m, m + 6);
    drawTiles(ctx, app.caneCanvas, sw, sh, pat, hf, ground);
    ctx.restore();
    ctx.strokeStyle = rule;
    ctx.strokeRect(m - 0.5, m + 5.5, sw + 1, sh + 1);
  }

  /** Side view of a thrown form (or the inside of a bowl for radial layouts). */
  drawVessel(ctx, w, h, dpr, hf, ground, rule) {
    const app = this.app, pat = app.params.pattern;
    const ink = cssVar('--ink');
    if (pat.layout === 'radial') {
      const R = Math.min(w, h) / 2 - 36;
      if (R < 10) return;
      const cx = w / 2, cy = h / 2 + 4;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(cx - R, cy - R);
      drawTiles(ctx, app.caneCanvas, 2 * R, 2 * R, pat, hf, ground);
      ctx.restore();
      // Rim and foot ring.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rule;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R - 5, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    // Vase profile: half-width as a function of height t in 0..1 (top to bottom).
    const H = h - 80, Wm = Math.min(w * 0.36, H * 0.36);
    if (H < 40 || Wm < 20) return;
    const prof = (t) => Wm * (0.62 + 0.36 * Math.sin(Math.PI * (0.12 + 0.86 * t)) - 0.18 * Math.max(0, t - 0.88) / 0.12);
    const top = 44, cx = w / 2;
    // Flat pattern wide enough to wrap half the circumference at the widest point.
    const fw = Math.ceil(Wm * Math.PI * dpr), fh = Math.ceil(H * dpr);
    this.flat.width = fw; this.flat.height = fh;
    const fctx = this.flat.getContext('2d');
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTiles(fctx, app.caneCanvas, fw / dpr, fh / dpr, pat, hf, ground);
    const src = fctx.getImageData(0, 0, fw, fh).data;
    const ow = Math.ceil(2 * Wm * dpr), oh = fh;
    const out = new ImageData(ow, oh);
    for (let y = 0; y < oh; y++) {
      const t = y / oh;
      const r = prof(t) * dpr;
      for (let x = 0; x < ow; x++) {
        const dx = x + 0.5 - ow / 2;
        if (Math.abs(dx) > r) continue;
        const a = Math.asin(dx / r);
        const sx = Math.min(fw - 1, Math.max(0, Math.floor(((a / Math.PI) + 0.5) * fw)));
        const o = (y * fw + sx) * 4, q = (y * ow + x) * 4;
        // Diffuse light from the upper left.
        const shade = 0.74 + 0.3 * Math.max(0, Math.cos(a + 0.5));
        out.data[q] = src[o] * shade; out.data[q + 1] = src[o + 1] * shade; out.data[q + 2] = src[o + 2] * shade; out.data[q + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = ow; tmp.height = oh;
    tmp.getContext('2d').putImageData(out, 0, 0);
    ctx.drawImage(tmp, cx - Wm, top, 2 * Wm, H);
    // Silhouette and rim.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const t = i / 80; const x = cx - prof(t); const y = top + t * H; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    for (let i = 80; i >= 0; i--) { const t = i / 80; ctx.lineTo(cx + prof(t), top + t * H); }
    ctx.closePath();
    ctx.stroke();
    const rr = prof(0);
    ctx.fillStyle = cssVar('--bg-2');
    ctx.beginPath();
    ctx.ellipse(cx, top, rr, rr * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
