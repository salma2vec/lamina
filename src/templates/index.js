/**
 * Constructed cane templates.
 *
 * A template draws a cane cross-section from parameters instead of from a scan.
 * Each template has:
 *   id, name, summary           text for the picker
 *   outline {shape, aspect}     the outline it is designed for (the user can change it)
 *   clays [{name, colour, shrinkage}]   its palette, one clay per label
 *   params [{key, label, type:'range'|'choice', min, max, step, unit, options, default}]
 *   generate(values, {G, size, shape, aspect}) =>
 *     { labels: Uint8Array(G*G) with 255 outside the outline, levels, assembly: {parts, steps} }
 *   assembly.parts: [{name, clay: index|null, qty?, size}]   clay null means mixed clays
 *   assembly.steps: [string]
 */
import { ammonite } from './ammonite.js';
import { nerinea } from './nerinea.js';

export { defaultValues, cleanValues } from './common.js';

export const TEMPLATES = [ammonite, nerinea];

/** @param {string} id */
export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}
