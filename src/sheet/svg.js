/** True-scale SVG export of a cane cross-section. */
import { outlinePolygon, outlineHeight } from '../cane/outline.js';
import { traceContours, simplifyLoop, levelField } from '../cane/vectorise.js';
import { levelCounts } from '../cane/quantise.js';

/** Escape text for XML. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const f2 = (v) => (Math.round(v * 100) / 100).toString();

/**
 * Build an SVG document in millimetres at 1:1 scale.
 * @param {Object} p
 * @param {Uint8Array} p.labels G x G label image (255 = outside)
 * @param {number} p.G
 * @param {number} p.levels
 * @param {string[]} p.colours colour per level
 * @param {string} p.shape
 * @param {number} p.aspect
 * @param {number} p.size cane size D in mm
 * @param {Object} [p.sheet] computeSheet result, for the key
 * @param {string} [p.title]
 * @param {boolean} [p.standalone] include XML prolog
 * @param {boolean} [p.key] draw the clay key (default true)
 * @returns {{svg:string, width:number, height:number}}
 */
export function caneSVG(p) {
  const D = p.size, G = p.G;
  const m = 12;
  const hFrac = outlineHeight(p.shape, p.aspect);
  const caneH = D * hFrac;
  const pageW = Math.max(D, 110) + 2 * m;
  const caneX = m + (pageW - 2 * m - D) / 2;
  const caneTop = m + 9;
  const cx = caneX + D / 2, cy = caneTop + caneH / 2;
  const gx = cx - D / 2, gy = cy - D / 2;
  const k = D / G;
  const poly = outlinePolygon(p.shape, p.aspect).map(([x, y]) => [cx + x * D, cy - y * D]);
  const polyD = 'M' + poly.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(' L') + ' Z';
  const counts = levelCounts(p.labels, p.levels);
  let dominant = 0;
  counts.forEach((c, i) => { if (c > counts[dominant]) dominant = i; });
  const ink = '#1b1a18';
  const parts = [];
  parts.push(`<defs><clipPath id="cane-clip"><path d="${polyD}"/></clipPath></defs>`);
  parts.push(`<text x="${f2(m)}" y="${f2(m + 3)}" font-family="Georgia, serif" font-size="4.2" fill="${ink}">${esc(p.title || 'Cane cross-section')}</text>`);
  parts.push(`<text x="${f2(m)}" y="${f2(m + 7)}" font-family="Helvetica, Arial, sans-serif" font-size="2.6" fill="${ink}">Scale 1:1. Print at 100%. Dimensions in mm, wet, at build.</text>`);
  parts.push(`<g clip-path="url(#cane-clip)">`);
  parts.push(`<path d="${polyD}" fill="${p.colours[dominant] || '#ccc'}"/>`);
  for (let l = 0; l < p.levels; l++) {
    if (l === dominant || !counts[l]) continue;
    const loops = traceContours(levelField(p.labels, G, G, l), G, G, 0.5);
    if (!loops.length) continue;
    const d = loops.map((loop) => {
      const s = simplifyLoop(loop, 0.35);
      let out = '';
      for (let i = 0; i < s.length; i += 2) out += (i ? 'L' : 'M') + f2(gx + s[i] * k) + ' ' + f2(gy + s[i + 1] * k);
      return out + 'Z';
    }).join('');
    parts.push(`<path d="${d}" fill="${p.colours[l]}" fill-rule="evenodd" data-level="${l}"/>`);
  }
  parts.push('</g>');
  parts.push(`<path id="cane-outline" d="${polyD}" fill="none" stroke="${ink}" stroke-width="0.2"/>`);
  // Width dimension line.
  let y = caneTop + caneH + 6;
  const x0 = cx - D / 2, x1 = cx + D / 2;
  parts.push(`<g stroke="${ink}" stroke-width="0.2" fill="none"><path d="M${f2(x0)} ${f2(y - 2)}V${f2(y + 2)}M${f2(x1)} ${f2(y - 2)}V${f2(y + 2)}M${f2(x0)} ${f2(y)}H${f2(x1)}"/></g>`);
  parts.push(`<text x="${f2(cx)}" y="${f2(y - 1)}" text-anchor="middle" font-family="Menlo, monospace" font-size="2.8" fill="${ink}">${f2(D)} mm</text>`);
  if (hFrac !== 1) {
    const xh = x1 + 5;
    parts.push(`<g stroke="${ink}" stroke-width="0.2" fill="none"><path d="M${f2(xh - 2)} ${f2(caneTop)}H${f2(xh + 2)}M${f2(xh - 2)} ${f2(caneTop + caneH)}H${f2(xh + 2)}M${f2(xh)} ${f2(caneTop)}V${f2(caneTop + caneH)}"/></g>`);
    parts.push(`<text x="${f2(xh + 2.5)}" y="${f2(cy + 1)}" font-family="Menlo, monospace" font-size="2.8" fill="${ink}">${f2(caneH)} mm</text>`);
  }
  // Scale bar.
  y += 8;
  const bar = D >= 30 ? 10 : 5;
  parts.push(`<g id="scale-bar"><rect x="${f2(m)}" y="${f2(y)}" width="${bar}" height="1.2" fill="${ink}"/>`);
  parts.push(`<text x="${f2(m + bar + 2)}" y="${f2(y + 1.2)}" font-family="Menlo, monospace" font-size="2.8" fill="${ink}">${bar} mm</text></g>`);
  // Key.
  y += 7;
  const clays = p.sheet && p.key !== false ? p.sheet.clays : [];
  clays.forEach((c) => {
    parts.push(`<rect x="${f2(m)}" y="${f2(y)}" width="6" height="6" fill="${c.colour}" stroke="${ink}" stroke-width="0.15"/>`);
    parts.push(`<text x="${f2(m + 9)}" y="${f2(y + 4.2)}" font-family="Helvetica, Arial, sans-serif" font-size="3" fill="${ink}">${esc(c.name)}</text>`);
    parts.push(`<text x="${f2(pageW - m)}" y="${f2(y + 4.2)}" text-anchor="end" font-family="Menlo, monospace" font-size="3" fill="${ink}">${(c.fraction * 100).toFixed(1)}%  ${c.mass.toFixed(0)} g  ${c.shrinkage}% shrink</text>`);
    y += 8;
  });
  const pageH = y + m - 2;
  const svg = `${p.standalone ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ''}<svg xmlns="http://www.w3.org/2000/svg" width="${f2(pageW)}mm" height="${f2(pageH)}mm" viewBox="0 0 ${f2(pageW)} ${f2(pageH)}">\n<rect width="100%" height="100%" fill="#ffffff"/>\n${parts.join('\n')}\n</svg>\n`;
  return { svg, width: pageW, height: pageH };
}
