# Constructed canes

A scan gives you a section of one specimen. A template draws the section from a few measurements, so you can design a cane that is buildable by hand and change it freely. Each template gives the same outputs as a scan: a cane image, clay masses, a 1:1 SVG and a build sheet. It also gives a parts list and assembly steps.

Sizes in the parts list are at build size, before reduction. Change the cane size and length on the build sheet and the parts list follows.

## Ammonite

A polished ammonite section is a logarithmic spiral. Curved walls (septa) divide each turn into chambers, and the chambers are often lined or filled with crystal.

### Geometry

The shell wall follows r(θ) = r<sub>c</sub> · e<sup>kθ</sup>, from the protoconch radius r<sub>c</sub> to the shell radius r<sub>s</sub> over the chosen number of whorls. Septa divide every whorl into equal angles and bow towards the aperture. A chamber is drawn only where it is deeper than two septa sheets; turns smaller than that become solid septa clay, which is also what happens to them when you build.

| Parameter | Effect |
|---|---|
| Whorls | Number of turns from the protoconch to the rim. |
| Chambers per whorl | Septa per turn. More chambers means more, smaller wedges to roll. |
| Shell size | Spiral diameter as a fraction of the cane. The rest is matrix. |
| Protoconch | Diameter of the central coil, in mm. |
| Septa sheet | Thickness of the dark sheet around each chamber wedge, in mm. |
| Lining sheet | Thickness of the pale sheet inside the septa sheet. Set 0 for none. |
| Septa curve | How far the septa bow. 0 gives straight radial walls. |
| Body chamber | Part of the last turn left unchambered and filled with matrix, as in many real specimens. |
| Chamber fill | How the three chamber clays are placed: pale centre to amber rim, alternating, or scattered. |

### Making it

1. Roll the chamber wedges listed on the build sheet: tapered "teardrop" canes in the three chamber clays, smallest about the size of the first chamber, largest about the size of the last. Make each one slightly longer than the finished cane.
2. Wrap each wedge in the lining sheet, then in the septa sheet. The septa sheet becomes the chamber wall.
3. Roll a coil of septa clay for the protoconch.
4. Lay the wedges around the coil from smallest to largest, wide end outwards, each pressed against the last.
5. Wrap the spiral in the matrix sheet. A speckled or textured stoneware reads as rock and supports the spiral during reduction.
6. Rest the cane until all clays are equally firm, then reduce from the middle outwards.

## Nerinea

Nerineoid gastropods are high-spired Mesozoic snails with folds, called plaits, inside each whorl. A polished lengthwise section shows the columella along the axis and a row of whorl chambers on each side. Plaits are named by position: columellar (from the columella), parietal (from the suture above) and palatal (from the outer wall). Many specimens hold sediment in the lower part of each chamber with clear calcite above. The flat sediment surface, a geopetal fill, shows which way was down when the rock formed.

### Geometry

The coiling axis runs across the cane. The shell tapers towards the apex. Whorl chambers on the two sides are offset by half a whorl and lean with the suture slope. Each chamber is a rounded box inset by half a wall. Each plait is a stem of wall clay ending in a rounded club. Sediment fills each chamber up to a flat level measured in the rock's frame, so the two sides fill from opposite walls.

| Parameter | Effect |
|---|---|
| Whorls shown | Number of chambers along each side. |
| Shell height | Shell height as a fraction of the cane height. |
| Taper to apex | How much the shell narrows from base to apex. |
| Suture slope | How far the chambers lean. |
| Columella | Thickness of the central shell strip, in mm. |
| Wall sheet | Thickness of the wall around each chamber, in mm. |
| Plaits | Which folds to include. |
| Plait depth | How far the folds reach into the chamber. |
| Sediment fill | Share of each chamber filled with sediment clay. |

### Making it

1. Build each whorl block from a sediment layer under calcite clay, tapering in depth from base to apex as the build sheet lists.
2. Press plait rolls of wall clay into each block at the fold positions on the template.
3. Wrap each block in the wall sheet.
4. Lay the columella strip along the middle of a loaf. Stack blocks along one side with sediment towards the columella, and along the other side with sediment towards the outer wall, offset by half a block. Lean them to the suture slope.
5. Pack matrix clay above and below and square the loaf to the template.
6. Reduce by pressing and rolling along the length. Trim the distorted ends before slicing.

## Adding a template

A template is one module in `src/templates/` that exports an object with `id`, `name`, `summary`, `outline`, `clays`, `params` and `generate(values, ctx)`. `generate` returns a label image on a G × G grid (255 outside the outline) and an assembly plan. See `src/templates/index.js` for the full contract and `tests/templates.test.js` for the checks every template must pass. Good candidates: crinoid stems, orthocone nautiloids, rugose corals, stromatolite columns.

## References

- Kollmann, H. A. (2014). The extinct Nerineoidea and Acteonelloidea (Heterobranchia, Gastropoda): a palaeobiological approach. *Geodiversitas* 36 (3): 349–383. https://doi.org/10.5252/g2014n3a2
- Nerineoidean internal fold shape analysis, dataset on Dryad: https://doi.org/10.5061/dryad.7m0cfxps4
