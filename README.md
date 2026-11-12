# Portland — portfolio

Personal portfolio of Pedro Jesús Muñoz Cifuentes. A single illustration of a
floating island with a windmill, brought to life: the sails turn, clouds drift,
water flows, trees sway, gulls fly, and each landmark opens a section of the CV.

Static site, no build step and no runtime dependencies: HTML, CSS, ES modules
and one WebGL2 shader.

## Run locally

ES modules need HTTP, so serve the folder with any static server:

```bash
python -m http.server 5173 --bind 127.0.0.1
```

Then open <http://localhost:5173>.

## Structure

| Path | What it is |
| --- | --- |
| `index.html` | Page shell (strict Content-Security-Policy, no third-party requests) |
| `src/main.js` | App: asset loading, camera, pins, panel, day/night and pause toggles |
| `src/scene.js`, `src/shaders.js` | WebGL2 renderer and GLSL for the living scene |
| `src/life.js` | 2D overlay: gulls, falling leaves, fireflies |
| `src/content.js` | All portfolio copy and where each section is anchored on the island |
| `assets/` | Generated layers, masks, fonts and `scene.json` |
| `resources/` | Source illustration and CV |
| `tools/build_layers.py` | Splits the illustration into the layers in `assets/` |

## Editing content

Text lives in `src/content.js`. Each section has an `anchor` in the pixel
coordinates of the 2048×2048 source illustration.

## Regenerating the layers

Only needed if the illustration changes. Requires Python 3 with `opencv-python`,
`numpy` and `scipy`:

```bash
python tools/build_layers.py
```

The script paints the sails and gulls out of the base image, un-projects the
sails to a frontal view (the shader re-projects them while they spin, so they
keep the painting's perspective), lifts cloud sprites, and writes the masks
that drive water, foliage and window lights.

## Fonts

Fraunces and DM Sans, self-hosted under the SIL Open Font License.
