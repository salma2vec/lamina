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
index.html            Page structure: the viewport, toolbars, panels and Today
styles/app.css        Interface styles (dark studio)
styles/print.css      Build sheet print layout
sw.js                 Offline cache (HTTPS only)
src/main.js           Builds the interface and wires events
src/state.js          Default parameters, session save and load
src/daily.js          Date-seeded study selection for Today
src/io/               File parsers: stl, ply, obj, nrrd, tiff, images, detect
src/geom/             Plane frames, box sections, mesh welding, mesh sections, polygon fill
src/volume/           Volume container and downsampling, resampling, isosurface, synthetic volumes
src/cane/             Quantise, clean-up (morph), outlines, crop, palette, render, vectorise
src/pattern/tile.js   Tile layouts
src/sheet/            Build-sheet arithmetic, 1:1 SVG, printable sheet
src/templates/        Constructed cane templates (see docs/TEMPLATES.md)
src/ui/               App state and pipeline, panels, flat views, loader, exports, Today
src/ui/gl/            The 3D viewport: stage, clay material, contact shadow, and the
                      Section, Cane and Pattern scenes
workers/              Volume and mesh decoding, isosurfaces, synthetic volume generation
vendor/               three.js and UTIF.js, copied from npm (see vendor/README.md)
tests/                node --test suites and fixture writers
docs/                 Data, ceramics and template guides, README images
```

Modules under `src/io`, `src/geom`, `src/volume`, `src/cane`, `src/pattern`, `src/sheet`, `src/templates`, `src/state.js` and `src/daily.js` must stay free of DOM access, so they run in Node and in workers. Browser-only code lives in `src/ui`, `src/main.js` and `src/io/images.js`.

### The pipeline

`src/ui/app.js` holds the parameters and runs a chain of stages: `slice`, `crop`, `quant`, `clean`, `render`, `sheet`, `pattern`. When a parameter changes, `app.changed(key)` marks its stage and every later stage. The chain runs on the next animation frame and emits `updated` with the stages that ran. A view redraws only when a stage it depends on has run.

Each mode runs the stages it shows at once and leaves the rest for when changes pause (`app.setHorizon`). Section needs only `slice` and `crop`, so the plane moves without waiting for clean-up. While a slider or the plane is dragged, `app.interactive` is true and clean-up skips its slowest pass (region widths); `app.settle()` runs the full pass on release. A template source replaces `quant` and `clean` with its own labels.

Heavy work that happens once per file (parsing, downsampling, generating synthetic volumes, isosurfaces) runs in `workers/`. Work that follows a slider runs on the main thread and must stay fast. Measure before you add a pass over the cane grid.

### The viewport

There is one WebGL renderer (`src/ui/gl/stage.js`) and one scene per mode. Frames are drawn only when the camera moves or something changes: call `stage.invalidate()` after you change a scene. Each scene has a contact shadow on an invisible floor; it is redrawn only when the objects change, because the camera moves and the objects do not. Clay uses a matcap generated in `clay.js`, so faces turned to the viewer show the clay colour as it is.

- **Section**: volumes are drawn as an isosurface (surface nets, `src/volume/isosurface.js`) built in `workers/surface-worker.js`; meshes as they are. The part of the specimen on the far side of the plane is clipped, and the section is laid on the cut face.
- **Cane**: a log extruded from the outline with the cane image on its ends and the edge colours along its sides, and one slice in front of it.
- **Pattern**: the tiled slices on a slab, or on a bowl mapped like a slab pressed into a mould.

The flat views (`src/ui/flat.js`) show the section or the cane front-on with a scale bar. They are also the fallback when WebGL is missing.

## Design rules

The object is the subject. The viewport fills the screen; tools sit in thin toolbars at the edges and open one small panel at a time.

- Studio background: deep warm grey, `#121110` at the edges to `#252321` at the centre, drawn in the WebGL scene. Panels `#232120` at 96 % opacity with a hairline border `rgba(255,255,255,.08)`. Text `#e9e5dc`; secondary text `#b3ada2`; quiet text `#948e83`, which still passes AA on panels.
- One accent, sang-de-boeuf: `#87292a` for active buttons and tabs, `#c4574a` for the cutting plane, the offset thumb and warning marks. Do not use it for decoration.
- Serif (`"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`) for the specimen caption and panel titles. System sans at 12–13 px for controls. Monospace with tabular figures for every number and measurement.
- Icons are hairline SVG drawings on a 20 px grid with a 1.25 px stroke (`src/ui/icons.js`). No icon fonts, no emojis.
- No gradients as decoration, no blur behind panels, no drop shadows on panels. The soft light falloff and contact shadows belong to the 3D scene.
- Few words on screen. Labels are one or two words. Explanations go in tooltips (`title`, or `data-tip` on toolbar buttons) and in the Help panel.
- One panel at a time. A panel opens beside the button that opened it and closes on a tap outside or Esc. On phones it becomes a bottom sheet.
- The print sheet stays white, at 1:1, with the 100 mm ruler.
- Colours come from the CSS variables in `styles/app.css`. Canvas code reads them with `cssVar()`.

## Interface

| Area | Holds |
| --- | --- |
| Left toolbar | Open, Study volumes, Cane templates, Today, Export, Help |
| Right toolbar | Template (when a template is open), Plane, Clays, Shape, Clean-up, Pattern, Build sheet; the flat view toggle above it |
| Right edge | Plane offset, in Section |
| Bottom | Clay chips in Cane and Pattern; the Section · Cane · Pattern control |
| Top left | Specimen caption; click it for source details and the voxel or pixel size |
| Bottom left | Loading progress, errors and notes, with Cancel |

Keys are handled in `src/ui/shortcuts.js` and listed in the Help panel (`index.html`). If you change a key, change the Help panel and the README table too.

`?still=section|cane|pattern` hides the interface for a still image. Add `&specimen=<id>` or `&template=<id>` to choose the subject. `docs/hero.png` is `?still=cane&template=ammonite` at 1600 × 1000.

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
2. The app loads each synthetic volume and both templates and shows Section, Cane and Pattern, in 3D and flat, with no console errors or warnings.
3. No network request leaves the page. Check the network panel. New third-party code goes into `vendor/` with its licence.
4. The layout holds at desktop, tablet and phone widths, and every panel fits on screen.
5. New public functions have a short JSDoc comment. There is no dead code and no commented-out code.
6. Exports still produce a 1:1 SVG: print it and measure the scale bar if you touched `src/sheet/`.

## Submitting a change

- Make one branch per change, named for what it does: `fix-ply-big-endian`, `add-dicom-notes`.
- Keep commits small, with short plain messages in the imperative: "Add NRRD parser", "Fix slice plane drift".
- Open a pull request that says what changed, why, and how you tested it. Include before and after screenshots for any visible change. Link the issue if there is one.
- Expect review comments on wording as well as code. Copy is part of the interface.
- Issues labelled `ready` are scoped and open to work on. Take the oldest one unless another is marked `priority`.

## Open work

In rough order:

1. NRRD orientation: resample volumes whose space directions are oblique or flipped, so sections keep the specimen's true handedness.
2. More formats: Deflate-compressed TIFF, BigTIFF and detached `.nhdr` files.
3. Print checks in Firefox and Safari. Chrome prints the build sheet at 1:1 on A4 and Letter; the other browsers are untested.
4. Speed: keep a full redraw under 150 ms at 256³. Clean-up computes region widths twice, and mesh welding uses string keys, which slows large meshes.
5. Mesh sections with more than two clays, for example by distance from the outer surface.
6. The isosurface of a volume is limited to about 900 000 triangles and a 128-voxel grid. Fine structure in large scans shows only on the cut face.
