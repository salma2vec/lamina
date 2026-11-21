# Changelog

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
