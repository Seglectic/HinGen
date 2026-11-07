// Hinge geometry built with manifold-3d (exact, watertight booleans in WASM).
//
// Frame: pin axis along +Y through the origin; leaves lie flat in z ∈ [-g, 0]; knuckles
// have radius g, so their bottoms are flush with the leaves and they stand g above the top.
// The pin leaf ("female", owns even knuckles + fused pin) sits at +x; the plain leaf
// ("male", odd knuckles) is built the same way and mirrored to −x.
//
// Design inspired by Rohin Gosling's Parametric Butt Hinge (thingiverse.com/thing:2187167).

import Module from './vendor/manifold/manifold.js';
import { effective, knuckleSpan, holeSets } from './params.js';

let wasm = null;

export async function initGeometry() {
  wasm = await Module();
  wasm.setup();
}

/** Runs fn with a tracker; every Manifold/CrossSection passed through `t()` is freed afterwards. */
function scoped(fn) {
  const live = [];
  const t = obj => (live.push(obj), obj);
  try { return fn(t); } finally { for (const o of live) o.delete(); }
}

function toMesh(man) {
  const m = man.getMesh();
  const np = m.numProp;
  const pos = new Float32Array(m.triVerts.length * 3);
  const tv = m.triVerts, vp = m.vertProperties;
  for (let i = 0; i < tv.length; i++) {
    const o = tv[i] * np;
    pos[i * 3] = vp[o]; pos[i * 3 + 1] = vp[o + 1]; pos[i * 3 + 2] = vp[o + 2];
  }
  return pos;   // non-indexed triangle soup: [x,y,z, x,y,z, ...]
}

/**
 * Build both leaves.
 * @returns {{ f: Float32Array|null, m: Float32Array|null, e: object, ms: number }}
 */
export function buildHinge(s) {
  const t0 = performance.now();
  const { Manifold, CrossSection } = wasm;
  const e = effective(s);
  const { W, H, g, R, c, filletR: r, pinD, K, sink } = e;
  const n = Math.max(12, Math.round(s.res));
  const holes = holeSets(s);

  const out = scoped(t => {
    // Cylinder of radius rad along +Y from y0 to y1.
    const cylY = (rad, y0, y1, segs = n) =>
      t(t(t(Manifold.cylinder(y1 - y0, rad, rad, segs)).rotate([-90, 0, 0])).translate([0, y0, 0]));

    // Rounded-rectangle plate, x ∈ [0, W], y ∈ [-H/2, H/2], z ∈ [-g, 0].
    let outline;
    if (r > 0.01) {
      outline = t(CrossSection.union([
        t(t(CrossSection.square([W - r, H])).translate([0, -H / 2])),
        t(t(CrossSection.square([W, Math.max(H - 2 * r, 0.001)])).translate([0, -H / 2 + r])),
        t(t(CrossSection.circle(r, n)).translate([W - r, H / 2 - r])),
        t(t(CrossSection.circle(r, n)).translate([W - r, -H / 2 + r])),
      ]));
    } else {
      outline = t(t(CrossSection.square([W, H])).translate([0, -H / 2]));
    }
    const plate = t(t(outline.extrude(g)).translate([0, 0, -g]));

    const holeCutters = list => list.map(([u, v]) => {
      const at = (man, z) => t(t(man).translate([0, 0, z]));
      const parts = [at(Manifold.cylinder(g + 2, e.thread / 2, e.thread / 2, n), -g - 1)];
      if (sink > 0 && e.head > e.thread) {
        const r0 = s.head_type === 1 ? e.thread / 2 : e.head / 2;   // countersunk cone vs counterbore
        parts.push(at(Manifold.cylinder(sink, r0, e.head / 2, n), -sink));
        parts.push(t(Manifold.cylinder(1, e.head / 2, e.head / 2, n)));   // clear the top surface
      }
      return t(t(Manifold.union(parts)).translate([u, v, 0]));
    });

    const bore = () => cylY(pinD / 2 + c / 2, -H / 2 - 1, H / 2 + 1);

    function leaf(ownParity, holeList) {
      const own = [], other = [];
      for (let i = 0; i < K; i++) {
        const [y0, y1] = knuckleSpan(e, i);
        if (i % 2 === ownParity) own.push(cylY(R, y0, y1));
        else other.push(cylY(R + c, y0 - c, y1 + c));   // swing clearance around the other leaf's knuckles
      }
      let body = t(plate.subtract(t(Manifold.union(other))));
      body = t(Manifold.union([body, ...own]));
      if (holeList.length) body = t(body.subtract(t(Manifold.union(holeCutters(holeList)))));
      return body;
    }

    let f = null, m = null;
    if (s.female) {
      f = leaf(0, holes.f);
      f = s.pin ? t(f.add(cylY(pinD / 2, -H / 2, H / 2))) : t(f.subtract(bore()));
    }
    if (s.male) {
      m = leaf(1, holes.m);
      m = t(t(m.subtract(bore())).mirror([1, 0, 0]));
    }
    return { f: f && toMesh(f), m: m && toMesh(m) };
  });

  return { ...out, e, ms: performance.now() - t0 };
}
