# Contributing to Lamina

Thank you for helping. Lamina is a small tool with a narrow purpose: help a ceramicist turn a fossil section into a cane they can build. Changes should serve that purpose and keep the tool quiet, exact and easy to read.

## Setup

You need a browser, Python 3 (or any static file server) and Node 20 or later for the tests. There is nothing to install.

```sh
python3 -m http.server 8000     # then open http://localhost:8000
npm test                        # node --test tests/*.test.js
```

Use a static server. ES modules and workers do not load from `file://` URLs.

## Folder map

```
index.html            Page structure and all static controls
styles/app.css        Interface styles, light and dark
styles/print.css      Build sheet print layout
sw.js                 Offline cache (HTTPS only)
src/main.js           Builds the interface and wires events
src/state.js          Default parameters, session save and load
src/daily.js          Date-seeded study selection for Today
src/io/               File parsers: stl, ply, obj, nrrd, tiff, images, detect
src/geom/             Plane frames, mesh welding, mesh sections, polygon fill
src/volume/           Volume container and downsampling, resampling, synthetic volumes
src/cane/             Quantise, clean-up (morph), outlines, crop, palette, render, vectorise
src/pattern/tile.js   Tile layouts
src/sheet/            Build-sheet arithmetic, 1:1 SVG, printable sheet
src/ui/               App state and pipeline, views, panels, loader, exports, Today
workers/              Volume and mesh decoding, synthetic volume generation
vendor/               three.js and UTIF.js, copied from npm (see vendor/README.md)
tests/                node --test suites and fixture writers
docs/                 Data and ceramics guides, screenshot
```

Modules under `src/io`, `src/geom`, `src/volume`, `src/cane`, `src/pattern`, `src/sheet`, `src/state.js` and `src/daily.js` must stay free of DOM access, so they run in Node and in workers. Browser-only code lives in `src/ui`, `src/main.js` and `src/io/images.js`.

### The pipeline

`src/ui/app.js` holds the parameters and runs a chain of stages: `slice`, `crop`, `quant`, `clean`, `render`, `sheet`, `pattern`. When a parameter changes, `app.changed(key)` marks its stage and every later stage. The chain runs once on the next animation frame, then emits `updated` with the stages that ran. Views redraw only when a stage they depend on has run and they are visible.

Heavy work that happens once per file (parsing, downsampling, generating synthetic volumes) runs in `workers/`. Work that follows a slider runs on the main thread and must stay fast. Measure before you add a pass over the cane grid.

## Design rules

- Paper background `#f4f1ea`, ink `#1b1a18`, hairline rules. Dark mode uses `#121110` and paper-coloured text through `prefers-color-scheme`.
- One accent, sang-de-boeuf `#7a1f1f`. Use it for the cutting plane, thresholds, the active specimen, the thinnest-region marker and warnings. Do not use it for decoration.
- Serif (`"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`) for headings and specimen names. System sans for controls. Monospace with tabular figures for every number and measurement.
- No emojis, no icon fonts, no gradients, no drop shadows on panels, no hero sections. Shape icons are hairline SVG drawings of the outline itself.
- Colours come from the CSS variables in `styles/app.css`. Canvas code reads them with `cssVar()` so dark mode works.

## Copy rules

Write the way a careful maker describes her own tool.

- Short sentences. One instruction per sentence. Plain verbs: "Drop", "Choose", "Move".
- Say what happened and what to do next. An error names the problem and the fix: "Detached NRRD (.nhdr with a separate data file) is not supported. Save as a single .nrrd file."
- No marketing words, no superlatives, no exclamation marks.
- Units always: "60.0 mm", "12 %", "4 vox".
- Never name a real specimen, museum record or download link in the app or in sample data. Bundled specimens are procedural and are labelled "synthetic study volume".

## Build-sheet maths

The formulas are in the README under "How the build sheet works" and are implemented in `src/sheet/quantities.js` and `src/cane/outline.js`. If you change one, change all three places and the tests in `tests/sheet.test.js`. Keep `docs/CERAMICS.md` consistent with them.

## Tests

Pure modules have tests in `tests/`. Fixtures are generated in code (`tests/helpers.js`), so no binary files are committed. Add a test with every parser change, every change to the maths and every bug fix in a pure module. Geometric tests compare against analytic values, for example a sphere section against π(r² − h²).

## Definition of done

A change is ready when:

1. `npm test` passes.
2. The app loads each synthetic volume and shows all four views with no console errors or warnings.
3. No network request leaves the page. Check the network panel. New third-party code goes into `vendor/` with its licence.
4. Light and dark mode both look right, and the layout holds at tablet and phone widths.
5. New public functions have a short JSDoc comment. There is no dead code and no commented-out code.
6. Exports still produce a 1:1 SVG: print it and measure the scale bar if you touched `src/sheet/`.

## Submitting a change

- Make one branch per change, named for what it does: `fix-ply-big-endian`, `add-dicom-notes`.
- Keep commits small, with short plain messages in the imperative: "Add NRRD parser", "Fix slice plane drift".
- Open a pull request that says what changed, why, and how you tested it. Include before and after screenshots for any visible change, in light and dark mode. Link the issue if there is one.
- Expect review comments on wording as well as code. Copy is part of the interface.
- Issues labelled `ready` are scoped and open to work on. Take the oldest one unless another is marked `priority`.

## Open work

In rough order:

1. NRRD orientation: resample volumes whose space directions are oblique or flipped, so sections keep the specimen's true handedness.
2. More formats: Deflate-compressed TIFF, BigTIFF and detached `.nhdr` files.
3. Print checks in Firefox and Safari. Chrome prints the build sheet at 1:1 on A4 and Letter; the other browsers are untested.
4. Speed: keep a full redraw under 150 ms at 256³. Clean-up computes region widths twice, and mesh welding uses string keys, which slows large meshes.
5. Mesh sections with more than two clays, for example by distance from the outer surface.
6. Touch: wheel zoom on the Slice and Cane canvases takes over page scrolling on tablets and phones.
7. Naming: "Slab" labels both the slice averaging control and the pattern preview surface. One of them needs a new name.
