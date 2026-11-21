# Vendored libraries

These files are copied from npm so that Lamina runs without a build step or network access.

| Path | Package | Version | Licence |
| --- | --- | --- | --- |
| `three/three.module.js`, `three/three.core.js` | three | 0.187.0 | MIT (`three/LICENSE`) |
| `three/addons/OrbitControls.js` | three (examples/jsm/controls) | 0.187.0 | MIT |
| `utif/utif.js` | utif | 3.1.0 | MIT (`utif/LICENSE`) |

`utif/utif.js` is wrapped as an ES module. The header comment in the file lists the changes.

To update, run `npm pack <package>@<version>`, extract the archive and copy the same files.
