/** Printable build sheet (HTML fragment styled by styles/print.css). */
import { esc } from './svg.js';

const n = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

/**
 * Build the printable sheet markup.
 * @param {Object} p
 * @param {string} p.svg 1:1 SVG markup from caneSVG
 * @param {Object} p.sheet computeSheet result
 * @param {Object} p.params cane parameters (size, length, target, density, waste, minFeature)
 * @param {{label:string, value:string}[]} p.meta specimen and slice metadata rows
 * @param {string} p.title
 * @param {{page:string, width:number, height:number, printWidth:number, printHeight:number}} [p.fit]
 *   template size and the printable area of the page, all in mm
 * @returns {string}
 */
export function printSheetHTML(p) {
  const s = p.sheet, q = p.params;
  const rows = s.clays.map((c) => `<tr><td><span class="sw" style="background:${esc(c.colour)}"></span>${esc(c.name)}</td>` +
    `<td class="num">${n(c.fraction * 100)}</td><td class="num">${n(c.area)}</td><td class="num">${n(c.volume, 2)}</td>` +
    `<td class="num">${n(c.mass, 0)}</td><td class="num">${n(c.shrinkage)}</td><td class="num">${n(c.fired, 2)}</td></tr>`).join('');
  const warnings = [];
  if (s.featureWarn) warnings.push(`The thinnest region is ${n(s.smallestReduced, 2)} mm after reduction. This is below the ${n(q.minFeature, 1)} mm minimum.`);
  if (s.compat.warn) warnings.push(`Shrinkage differs by ${n(s.compat.spread, 1)} percentage points between clays. This can cause cracks. Test the combination first.`);
  const f = p.fit;
  const tooBig = f && (f.width > f.printWidth + 0.01 || f.height > f.printHeight + 0.01)
    ? `<p class="ps-warn ps-fit">The template is ${n(f.width, 0)} × ${n(f.height, 0)} mm. It is larger than the printable area of ${esc(f.page)} (${n(f.printWidth, 0)} × ${n(f.printHeight, 0)} mm) and will be cut off. Print the SVG on a larger sheet or in parts.</p>`
    : '';
  return `
<header class="ps-head"><h1>${esc(p.title)}</h1><p>Lamina build sheet</p></header>${tooBig}
<section class="ps-meta"><table>${p.meta.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</table></section>
<section class="ps-template">${p.svg}</section>
<section class="ps-numbers">
<table class="ps-params">
<tr><th>Cane size at build</th><td class="num">${n(q.size)} mm</td><th>Reduction ratio</th><td class="num">${n(s.ratio, 2)} : 1</td></tr>
<tr><th>Cane length at build</th><td class="num">${n(q.length)} mm</td><th>Length after reduction</th><td class="num">${n(s.reducedLength, 0)} mm</td></tr>
<tr><th>Reduced size</th><td class="num">${n(q.target)} mm</td><th>Thinnest region, reduced</th><td class="num">${n(s.smallestReduced, 2)} mm</td></tr>
<tr><th>Wet density</th><td class="num">${n(q.density, 2)} g/cm³</td><th>Thinnest region, fired</th><td class="num">${n(s.smallestFired, 2)} mm</td></tr>
<tr><th>Minimum, reduced</th><td class="num">${n(q.minFeature, 1)} mm</td><th>Fired size</th><td class="num">${Math.abs(s.firedMax - s.firedMin) < 0.005 ? n(s.firedMin, 2) : `${n(s.firedMin, 2)}–${n(s.firedMax, 2)}`} mm</td></tr>
<tr><th>Waste allowance</th><td class="num">${n(q.waste, 0)} %</td><th>Total wet clay</th><td class="num">${n(s.totalMass, 0)} g</td></tr>
</table>
<table class="ps-clays"><thead><tr><th>Clay</th><th class="num">Area %</th><th class="num">Area mm²</th><th class="num">Volume cm³</th><th class="num">Wet g</th><th class="num">Shrink %</th><th class="num">Fired mm</th></tr></thead><tbody>${rows}</tbody></table>
${warnings.length ? `<ul class="ps-warn">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
<p class="ps-note">Check the 100 mm ruler on the template with a real ruler before you cut. If it measures more or less than 100 mm, the print is scaled: print again at 100 %. Masses include the waste allowance. Fired sizes apply to the reduced cane.</p>
</section>`;
}
