/** Hairline icons on a 20 px grid, drawn with a 1.25 px stroke (see .i in app.css). */

const P = {
  open: '<path d="M2.75 6a1.25 1.25 0 0 1 1.25-1.25h3.4l1.6 1.75h7a1.25 1.25 0 0 1 1.25 1.25v7.75a1.25 1.25 0 0 1-1.25 1.25H4a1.25 1.25 0 0 1-1.25-1.25z"/><path d="M2.75 8.75h14.5"/>',
  specimens: '<path d="M10 9.4a1.25 1.25 0 0 1 2.5 0a2.5 2.5 0 0 1-5 0a3.75 3.75 0 0 1 7.5 0a5 5 0 0 1-10 0a6.25 6.25 0 0 1 3-5.35"/>',
  today: '<circle cx="10" cy="10" r="7"/><path d="M10 6.25V10l2.6 1.6"/>',
  export: '<path d="M10 12.25V3.25M6.9 6.35 10 3.25l3.1 3.1"/><path d="M7 9.25H5.25a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h9.5a1 1 0 0 0 1-1v-5.5a1 1 0 0 0-1-1H13"/>',
  help: '<circle cx="10" cy="10" r="7"/><path d="M8.05 8.1a2 2 0 0 1 3.9.5c0 1.4-1.95 1.65-1.95 3.05"/><path d="M10 14.1h.01"/>',
  plane: '<path d="M2.75 14.25 6.75 8.5h10.5l-4 5.75z"/><path d="M11.25 11.5V3.25M9.5 5l1.75-1.75L13 5"/>',
  clays: '<circle cx="6.5" cy="7.25" r="2.75"/><circle cx="13.5" cy="7.25" r="2.75"/><circle cx="10" cy="13.5" r="2.75"/>',
  shape: '<path d="M3 10 6.5 3.95h7L17 10l-3.5 6.05h-7z"/><circle cx="10" cy="10" r="2.5"/>',
  clean: '<path d="M16 3.5 10.75 8.75"/><path d="M11.6 9.6 9.9 7.9c-1.55.05-2.85.95-3.3 2.6-.5 1.8-1.25 3.9-2.85 5.25 2.25.35 5.05-.35 6.45-1.95 1.15-1.3 1.55-2.65 1.4-4.2z"/>',
  pattern: '<rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1"/><rect x="11" y="11" width="5.5" height="5.5" rx="1"/>',
  build: '<rect x="2.75" y="6.75" width="14.5" height="6.5" rx="1"/><path d="M5.5 6.75v2.5M8.25 6.75v1.5M11 6.75v2.5M13.75 6.75v1.5"/>',
  flat: '<rect x="4" y="3.25" width="12" height="10" rx="1"/><path d="M4.25 16.5h6M4.25 15.5v2M10.25 15.5v2"/>',
  cube: '<path d="M10 2.75 16.25 6.4v7.2L10 17.25 3.75 13.6V6.4z"/><path d="M3.75 6.4 10 10l6.25-3.6M10 10v7.25"/>',
  minus: '<path d="M5 10h10"/>',
  plus: '<path d="M5 10h10M10 5v10"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  bell: '<path d="M6 13.5V9a4 4 0 0 1 8 0v4.5l1.25 1.25H4.75z"/><path d="M8.5 16.75a1.6 1.6 0 0 0 3 0"/>',
  grid: '<rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1"/><rect x="11" y="11" width="5.5" height="5.5" rx="1"/>',
  brick: '<rect x="2.5" y="4.25" width="7" height="5" rx="1"/><rect x="10.5" y="4.25" width="7" height="5" rx="1"/><rect x="6.5" y="10.75" width="7" height="5" rx="1"/><path d="M2.5 10.75h2.75v5H2.5M17.5 10.75h-2.75v5h2.75"/>',
  hex: '<circle cx="6" cy="6.75" r="2.5"/><circle cx="12" cy="6.75" r="2.5"/><circle cx="9" cy="12.25" r="2.5"/><circle cx="15" cy="12.25" r="2.5"/>',
  mirror: '<path d="M4 4h4.25L4 8.25zM16 4h-4.25L16 8.25zM4 16h4.25L4 11.75zM16 16h-4.25L16 11.75z"/>',
  radial: '<circle cx="10" cy="10" r="1.75"/><circle cx="10" cy="4.5" r="1.25"/><circle cx="14.75" cy="7.25" r="1.25"/><circle cx="14.75" cy="12.75" r="1.25"/><circle cx="10" cy="15.5" r="1.25"/><circle cx="5.25" cy="12.75" r="1.25"/><circle cx="5.25" cy="7.25" r="1.25"/>',
  slab: '<path d="M2.75 11.5 7 7.25h10.25L13 11.5z"/><path d="M2.75 11.5v1.75H13l4.25-4.25V7.25M13 11.5v1.75"/>',
  bowl: '<path d="M2.75 8.5h14.5c0 4-3.25 7-7.25 7s-7.25-3-7.25-7z"/><path d="M2.75 8.5c0 1.1 3.25 2 7.25 2s7.25-.9 7.25-2"/>',
};

/**
 * SVG markup for an icon.
 * @param {string} name
 * @returns {string}
 */
export function icon(name) {
  return `<svg class="i" viewBox="0 0 20 20" aria-hidden="true">${P[name] || ''}</svg>`;
}
