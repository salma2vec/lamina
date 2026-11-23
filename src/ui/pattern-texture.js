/** Flat pattern drawing: cane slices tiled into a 2D canvas. */
import { layoutTiles } from '../pattern/tile.js';
import { outlineHeight, outlinePolygon } from '../cane/outline.js';

/**
 * Draw tiled cane slices into a context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} cane rendered cane (square, transparent outside)
 * @param {number} w
 * @param {number} h
 * @param {Object} pat pattern parameters
 * @param {number} hf outline height fraction
 * @param {string} ground colour under the tiles
 * @param {number[][]} [poly] outline polygon in unit coordinates
 */
export function drawTiles(ctx, cane, w, h, pat, hf, ground, poly) {
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  const T = Math.max(12, pat.tile * Math.min(w, h));
  const { tiles } = layoutTiles({
    layout: pat.layout, width: w, height: h, tileW: T, tileH: T * hf,
    gap: pat.gap, stretch: pat.stretch, stretchAngle: pat.stretchAngle,
    alternate: pat.alternate, jitter: pat.jitter ? 1 : 0, seed: 11, poly,
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

/** Colour of the clay with the largest area: it fills the gaps between slices. */
export function groundColour(app) {
  const sh = app.d.sheet;
  if (!sh || !sh.clays.length) return '#efeae0';
  return sh.clays.reduce((a, b) => (b.fraction > a.fraction ? b : a)).colour;
}

/**
 * Draw the current pattern into a canvas of the given size.
 * @param {import('./app.js').App} app
 * @param {HTMLCanvasElement} canvas
 * @param {number} w
 * @param {number} h
 */
export function drawPattern(app, canvas, w, h) {
  const p = app.params;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawTiles(ctx, app.caneCanvas, w, h, p.pattern, outlineHeight(p.outline.shape, p.outline.aspect), groundColour(app), outlinePolygon(p.outline.shape, p.outline.aspect));
  return canvas;
}
