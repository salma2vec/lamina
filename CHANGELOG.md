# Changelog

## Unreleased

- New interface: the viewport fills the screen, with thin toolbars at the edges and one small panel open at a time. Panels become a bottom sheet on phones.
- Three modes, all in 3D: Section (the specimen cut by the plane, with the section on the cut face), Cane (a clay log with a slice lifted off its end) and Pattern (the slices on a slab or a bowl). Section and Cane also have a flat view with a scale bar.
- Volumes are shown as a surface at an adjustable level, built in a worker.
- Clay chips for the cane sit under the scene. Thresholds, clean-up and the build numbers are in panels.
- Cane templates (ammonite and Nerinea) with parameters, parts and assembly steps on the build sheet. Sessions store the template and its values.
- The slice averaging control is now called Thickness; Slab names only the pattern form.
- `?still=section|cane|pattern` hides the interface for still images.

## 0.1.0 (2026-11-22)

First release.

- Load STL, PLY and OBJ meshes; NRRD volumes (raw and gzip); multi-page TIFF stacks; numbered image slices; single images; session files.
- Downsample large volumes to at most 256 voxels per side in a worker.
- Five synthetic study volumes: osteon bone, ammonite, stromatolite, petrified wood, rangeomorph frond.
- 3D view with orthogonal volume slices, mesh rendering and a movable cutting plane.
- Exact mesh sections and trilinear volume resampling with average or maximum slabs.
- Cane design: thresholds, clean-up to a minimum feature width, five outlines, clay palettes with shrinkage.
- Pattern view with five layouts, rotation alternation, stretch, jitter, slab and vessel previews.
- Build sheet with reduction, clay masses, thinnest region, fired size and a shrinkage compatibility warning.
- Exports: 1:1 SVG, PNG, printable build sheet (A4 and Letter), session JSON.
- Today: a date-seeded study with a timer.
