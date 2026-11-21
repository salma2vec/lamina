# Getting fossil data

This guide tells you where to find open fossil scans, how to prepare them for Lamina, and how to credit them. Read the licence section before you sell work made from a design.

Lamina reads these inputs:

- Meshes: STL, PLY, OBJ
- Volumes: TIFF stacks, PNG/JPG slice sequences, NRRD
- Single 2D images

## 1. Sources

### MorphoSource

MorphoSource is an archive of 3D and CT data from museum specimens, run by Duke University. Many museums deposit fossil CT scans here.

**Account.** You must create an account and log in to download files. [3]

**Access levels.** Each media record has one of three publication statuses: [2]

- **Open download.** You can download without approval. This does not mean the data are public domain. You must still accept the terms of reuse and complete a short usage survey.
- **Restricted download.** Select "Request Access" on the media page and describe your intended use. A download reviewer approves, denies, or clears the request. An approval can have an expiry date. If a reviewer denies the request, you cannot request again unless the reviewer reverses the decision.
- **Private.** Only users with a role on that media can see or download it.

For a ceramics project, write the request in plain terms: the specimen, that you will slice the data into 2D patterns for handmade ceramics, and whether you intend to sell the work.

**Terms.** Every download requires you to accept a download use agreement. The contributor chooses a "permissive" or "standard" version. The standard version adds these settings: [4][5]

- **Commercial use.** Prohibited by default. The contributor can permit it.
- **Redistribution.** Do not re-archive or publish the downloaded files in another repository. Send other people to the MorphoSource page instead of sending them the files.
- **3D use.** 3D printing can be permitted, limited, or prohibited.

A media record can also carry a copyright statement, a Creative Commons licence, and an "Additional Usage Agreement". Read all three on each media page before you download. [1]

**Requirements common to all agreements:** [6]

- Name MorphoSource, the collection, and the institution as the source of the data or derivative.
- Cite the specimen catalogue number, preferably as a Darwin Core triplet (for example `MCZ:Herp:A-12345`).
- Cite the media DOI. If there is no DOI, cite the MorphoSource ARK.
- These rules apply to physical derivatives too. A ceramic piece made from a scan is a physical derivative.

**File types.** CT image series (reconstructed or cropped stacks) are uploaded as zipped open raster images, preferably lossless. TIFF is common. Meshes are uploaded unzipped in open formats such as OBJ, PLY, STL, GLB or glTF. Textured OBJ meshes come zipped with their MTL and texture files. [7] Check the "file object details" on the media page before you download. They list the format, image size, and pixel size and units. [3] Meshes derived from a CT scan appear as child media of the parent scan. [3]

Institutions set their own terms on top of MorphoSource. For example, the Florida Museum allows non-commercial use and requires written approval for commercial use. [8]

### Smithsonian 3D Digitization (3d.si.edu)

The Smithsonian Open Access programme releases 3D models under CC0. Its own page says you can use them "for art projects, educational programs, or even products." [9] The 3D site lists a "National Museum of Natural History - Paleobiology Dept." filter. [10] Check the usage field on each model. Some records are marked "Not determined" instead of CC0. [10]

### Dryad

All datasets on Dryad are published under CC0. Citation is not legally required, but Dryad asks you to cite reused data. [11] Search for "micro-CT" with a taxon name or "fossil". Some palaeontology papers deposit their TIFF stacks or meshes here.

### Zenodo

Zenodo hosts CT datasets attached to papers. Each record states its own licence, chosen by the uploader. Read it on the record page.

### DigiMorph (UT Austin)

DigiMorph shows CT data of fossils and modern specimens from the University of Texas High-Resolution X-ray CT Facility. Some specimen pages offer the original CT slices as a download. For example, one page offers a 1.1 GB zip of 1088 slices at 0.2275 mm voxel size. [12] The pages show a copyright notice and no licence. Contact UTCT or DigiMorph before you use the data for work you sell.

### Phenome10K

Phenome10K is a free repository of 3D surface and CT-derived scans, mostly vertebrate skulls, served as STL files. You must register to download. Data are under a Creative Commons licence unless the record states otherwise. [13] The site did not respond when this guide was checked (November 2026). Try it, but do not depend on it.

### Sketchfab

Sketchfab hosts downloadable models from museums and individuals. Use the licence filter on the search page to show only downloadable models with a given licence: CC0, CC BY, CC BY-NC, CC BY-ND, CC BY-SA, or store licences. [14] Many Sketchfab fossils are surface models made by photogrammetry or surface scanning. A surface model gives you an outer shape and no internal structure. Use it for silhouettes and contour slices.

### Checked and not listed

- **Digital Fish Library (UCSD).** MRI scans of modern fish, not fossils. The project page does not state that files can be downloaded, and it shows an "All Rights Reserved" notice. [15]
- **AMNH.** The AMNH palaeontology imaging pages could not be read when this guide was checked. Search MorphoSource for AMNH records and follow the terms on each record.

## 2. Preparing data for the browser

Lamina runs in your browser. A large volume uses a lot of memory. Prepare data to about 256 × 256 × 256 voxels before you load it.

### DICOM series to NRRD or TIFF (3D Slicer)

1. Open the DICOM module. Drag the DICOM folder onto the window to add it to the DICOM database. [16]
2. Open the DICOM browser and double-click the series to load it. [16]
3. Open the Crop Volume module. Fit the ROI box to the part you need. Everything outside the box is removed. [17]
4. Set "Spacing scale". A value above 1.0 makes the voxels larger and the volume smaller. [17] For a 1024-voxel axis, a scale of 4 gives about 256 voxels.
5. Select interpolation. Use Linear for large volumes. Use B-spline for better quality. Use Nearest neighbor only for label maps. [17]
6. Save the cropped volume as `.nrrd` in the Save Data dialog. [18] Slicer can also write TIFF as a series of frames. [16]

NRRD stores the voxel spacing in its header. Lamina reads it. Use NRRD when you can.

### TIFF or PNG stacks (Fiji / ImageJ)

1. Use File > Import > Image Sequence to open a folder of slices. Select "Use Virtual Stack" if the stack is too large for memory. [19]
2. Use Image > Crop to remove empty space around the specimen.
3. Use Image > Scale to reduce X, Y and Z by the same factor.
4. Use File > Save As > Tiff to save one multi-page TIFF. This format keeps the pixel size. [19]

Set the voxel size in Image > Properties before you save. A TIFF without a pixel size loads in Lamina as 1 unit per voxel.

### Meshes (MeshLab or Blender)

Large meshes slow the slicer. As a starting point, reduce them to between 100 000 and 500 000 faces.

- **MeshLab:** Filters > Remeshing, Simplification and Reconstruction > Quadric Edge Collapse Decimation. Set "Target number of faces". [20]
- **Blender:** Add a Decimate modifier in Collapse mode. "Ratio" is the fraction of faces to keep. 1.0 keeps all faces. Blender counts triangles when it calculates the ratio. [21]

Export as binary STL or PLY.

### Units and voxel spacing

- CT voxel spacing is usually in millimetres. Read it on the MorphoSource media page or in the NRRD header. [3]
- When you downsample by a factor of 4, the spacing becomes 4 times larger. Slicer and Fiji update this for you.
- STL files have no unit. Most scientific meshes use millimetres. Check the specimen length in the paper against the mesh bounding box.
- The scan scale does not control the cane size. Lamina scales the slice to the cane cross-section you set on the build sheet.

## 3. Licensing and attribution

### Rules

1. Read the licence, the download agreement, and any additional agreement on each record before you download.
2. Keep a text file with each download. Write the specimen number, institution, media ID (DOI or ARK), licence, date, and the terms you accepted.
3. Credit the specimen, the institution that holds it, and the people or facility that made the scan.
4. Do not redistribute raw scan files unless the licence permits it. Share the source link instead.

### Non-commercial terms and selling ceramics

Creative Commons defines NonCommercial as "not primarily intended for or directed towards commercial advantage or monetary compensation." [22] A piece you make to sell is directed towards monetary compensation. Treat these terms as a prohibition on selling work made from that data:

- CC BY-NC, CC BY-NC-SA, CC BY-NC-ND
- MorphoSource records with commercial use prohibited (the default in the standard agreement) [5]
- Institutional policies that require written approval for commercial use [8]

If you want to sell work made from such data, ask the institution for written permission first. Some collections have a process for this. For example, the Florida Museum grants commercial exemptions case by case. [8]

Data under CC0 (Smithsonian Open Access, Dryad) can be used in work you sell. Give credit anyway.

A design is a derivative of the scan. A physical derivative is still covered by MorphoSource attribution rules. [6]

### Attribution template

Put this line on the build sheet, the product page, and any exhibition label:

```
Pattern derived from [taxon], [Darwin Core triplet, e.g. INST:COLL:12345],
[holding institution]. Scan by [scan creator or facility], [repository],
[DOI or ARK]. Licence: [licence]. Design made with Lamina.
```

Replace every bracket with the values from the record. Do not leave a field blank. If a value is missing from the record, write "not stated".

## 4. Subjects that suit nerikomi

A good subject has a strong 2D structure in one slice plane, and that structure survives quantisation into 2 to 6 colours. Look for the features below.

| Subject | Data type | What to look for in a slice |
|---|---|---|
| Bone histology (osteons) | Micro-CT of cortical bone, or thin-section images | Osteons are cylinders of 5 to 20 concentric rings around a central Haversian canal. They are about 0.25 to 0.35 mm in diameter. [23] Slice across the long axis of the bone to see rings. |
| Ammonite sutures | Mesh or CT of a shell | Sutures form where the internal chamber walls (septa) meet the shell. They are visible where the outer shell has worn away. [24] Slice across the whorl to see chambers. Use a surface model to trace the suture line. |
| Stromatolites | CT or a photo of a cut face | Successive laminae inherit the shape of earlier layers. They are often concentric or domed. [25] Slice vertically through the dome. |
| Petrified wood | CT or a photo of a polished end | Many permineralised specimens keep cell structure, and some show annual rings. [26] Slice perpendicular to the trunk for rings. |
| Ediacaran fronds (rangeomorphs) | Mesh, or photo of a cast | Branching fractal frond units. [27] Use a single 2D image or a shallow slice of a surface model. |
| Trilobites | Micro-CT or mesh | Micro-CT can show appendages, gut and the separation between body and matrix. [28] Slice across the body for the three-lobed outline. Slice horizontally for the segment rows. |
| Banded iron formations | Photo of a cut face, or CT of a core | Alternating layers of iron oxide and iron-poor chert. Typical bands are a few millimetres to a few centimetres thick. Many chert bands contain microbands under 1 mm. [29] Use a single 2D image. The layers map directly to a laminated stack. |

Practical notes:

- Features below the cane's minimum feature size disappear when you reduce the cane. Check the build sheet before you choose a slice.
- High contrast between structure and matrix gives cleaner colour regions. Remove the rock matrix in Slicer or Fiji if the specimen and matrix have similar density.
- Laminated structures (stromatolites, banded iron) are the easiest to build. Branching structures (fronds, osteon networks) need more pieces and smaller reductions.

## References

1. MorphoSource, Rights, Licenses, and Usage Settings for Media: https://duke.atlassian.net/wiki/spaces/MD/pages/35422314
2. MorphoSource, Publication of Media Records: https://duke.atlassian.net/wiki/spaces/MD/pages/35422509
3. Florida Museum, Access CT scans online: https://www.floridamuseum.ufl.edu/digital-lab/resources/access-ct-scans-online/
4. MorphoSource, Download Use Agreement: https://duke.atlassian.net/wiki/spaces/MD/pages/35422298/MorphoSource+Download+Use+Agreement
5. MorphoSource, Standard Use Agreement: https://duke.atlassian.net/wiki/spaces/MD/pages/35422351/Standard+Use+Agreement
6. MorphoSource, Common Requirements of All Use Agreements: https://duke.atlassian.net/wiki/spaces/MD/pages/35422640
7. MorphoSource, CT data (file format table): https://duke.atlassian.net/wiki/spaces/MD/pages/35422839/CT+data
8. Florida Museum, MorphoSource digital data policy: https://www.floridamuseum.ufl.edu/digital-lab/digital-data-policies/morphosource-digital-data-policy/
9. Smithsonian Open Access highlights: https://si.edu/spotlight/openaccesshighlights/default
10. Smithsonian 3D, CC0 listing: https://3d.si.edu/cc0
11. Dryad, Reuse guide: https://datadryad.org/help/guides/reuse
12. DigiMorph, Pawpawsaurus campbelli: https://digimorph.ctlab.geo.utexas.edu/specimens/Pawpawsaurus_campbelli
13. Goswami Lab, launch of Phenome10K.org: https://www.goswamilab.com/post/2015/06/19/its-alive-the-official-launch-of-phenome10korg
14. Sketchfab, licence filters: https://sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters
15. Digital Fish Library, About: https://www.digitalfishlibrary.org/about
16. 3D Slicer, Data Loading and Saving: https://slicer.readthedocs.io/en/5.8/user_guide/data_loading_and_saving.html
17. 3D Slicer, Crop Volume: https://slicer.readthedocs.io/en/latest/user_guide/modules/cropvolume.html
18. 3D Slicer forum, How to convert DICOM files to NRRD: https://discourse.slicer.org/t/how-to-convert-dicom-files-to-nrrd/540
19. Bioimage Book, ImageJ files and file formats: https://bioimagebook.github.io/chapters/1-concepts/6-files/imagej.html
20. Packt, Mesh decimation with MeshLab: https://subscription.packtpub.com/book/iot_&_hardware/9781782169888/5/ch05lvl1sec67/mesh-decimation-with-meshlab
21. Blender Manual, Decimate Modifier: https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/decimate.html
22. Creative Commons, CC BY-NC 4.0 legal code: https://creativecommons.org/licenses/by-nc/4.0/legalcode.en
23. Wikipedia, Osteon: https://en.wikipedia.org/wiki/Osteon
24. Community Stories (Vancouver Island palaeontology), Under the Shell: Suture Patterns: https://www.communitystories.ca/v2/paleontology-vancouver-islnd_paleontologie-ile-vancouver/?p=347
25. Hooper Museum, Carleton University, Stromatolite laminations: https://hoopermuseum.carleton.ca/stromatolites/LAMIN1.htm
26. Petrified Wood Museum, Permineralization: https://petrifiedwoodmuseum.org/Permineralization.htm
27. Hoyal Cuthill and Conway Morris (2014), PNAS, fractal branching of rangeomorph fronds: https://ui.adsabs.harvard.edu/abs/2014PNAS..11113122H
28. University of Bristol, "Prehistoric Pompeii" trilobites (2024): https://www.bristol.ac.uk/news/2024/june/prehistoric-pompeii.html
29. Wikipedia, Banded iron formation: https://en.wikipedia.org/wiki/Banded_iron_formation
