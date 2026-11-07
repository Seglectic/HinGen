# HinGen

A browser-based generator for parametric, print-in-place butt hinges. Set the leaf size, thickness, knuckles, clearance and screw holes, then download an STL.

Everything runs locally in your browser. The geometry is built with [Manifold](https://github.com/elalish/manifold) (WebAssembly) in a Web Worker, and nothing is uploaded. It's a static site, so it works on GitHub Pages, any static file server, or offline.

## Using it

- **Leaf width** is measured from the pin centre to the outer edge of one leaf, so overall width = 2 × leaf width. Sliders cover the usual range, and you can type larger values into the number boxes.
- With the hinge flat, the leaf bottoms are flush with the knuckles, so it lies flat on the bed. The knuckles stand one leaf thickness above the leaves.
- **Hole layout:** the grid controls (rows, columns, margin) set a starting layout. In the editor you can drag holes, click a leaf to add one, and double-click to remove one. Overlapping holes turn red. Untick *Same on both leaves* to lay out each leaf separately.
- **Pose:** hover a leaf in the 3D view and drag it to swing it on the pin; the other leaf stays put. The STL is exported in the pose shown. Use *Flatten* to go back to flat.
- The settings, including custom hole layouts, live in the URL hash. **Copy link** shares an exact configuration.
- If a print-in-place hinge comes out fused, raise **Clearance**. A good starting point is 0.4 mm.

## Running locally

ES-module workers don't work over `file://`, so serve the folder:

```sh
python3 -m http.server 8765
# open http://localhost:8765
```

## Layout

| Path | What |
| --- | --- |
| `index.html`, `style.css`, `app.js` | UI, three.js viewer, leaf dragging, URL-hash state, STL export |
| `params.js` | Parameter schema, derived dimensions, hole-grid and clamping logic |
| `geometry.js` | Hinge construction with Manifold; `geometry-worker.js` runs it off the main thread |
| `holes.js` | SVG hole layout editor |
| `vendor/` | manifold-3d and three.js, copied by `tools/vendor.py` |

### Geometry

The pin runs along +Y through the origin, and the leaves occupy z ∈ [−t, 0], where t is the leaf thickness. The knuckles have radius t, and there are an odd number of them. The pin leaf owns the even-numbered knuckles and the fused pin; the plain leaf is built the same way and mirrored. Each leaf has its plate cut back to radius t + clearance around the other leaf's knuckles, so the two leaves can swing past each other. The plain leaf's knuckles are bored to pin diameter + clearance.

### Updating vendored files

```sh
mkdir -p /tmp/mf /tmp/three
curl -sL https://registry.npmjs.org/manifold-3d/-/manifold-3d-3.5.4.tgz | tar xz -C /tmp/mf
curl -sL https://registry.npmjs.org/three/-/three-0.170.0.tgz | tar xz -C /tmp/three
python3 tools/vendor.py /tmp/mf/package /tmp/three/package
```

## Credits & licences

- **HinGen**: MIT, see [LICENSE](LICENSE). The hinge design is inspired by Rohin Gosling's [Parametric Butt Hinge](https://www.thingiverse.com/thing:2187167) for OpenSCAD.
- **manifold-3d** `vendor/manifold/`: Apache-2.0 ([LICENSE](vendor/manifold/LICENSE)), v3.5.4.
- **three.js** `vendor/three/`: MIT ([LICENSE](vendor/three/LICENSE)), v0.170.0.
