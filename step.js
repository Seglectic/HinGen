// STEP export: rebuilds the hinge as an exact B-rep with OpenCascade (via replicad), so CAD tools
// get true planes, cylinders, cones and a quadratic-Bézier parabola rather than a triangle mesh.
// It mirrors geometry.js (same frame, same parameters); keep the two in step when changing shapes.
//
// Output is a two-part STEP assembly ("Pin leaf", "Plain leaf"), placed exactly like the STL.

import opencascade from './vendor/replicad/replicad_single.js';
import { setOC, draw, makeCylinder, exportSTEP } from './vendor/replicad/replicad.js';
import { effective, knuckleSpan, holeSets } from './params.js';

let ready = null;
export function initStep() {
  ready ??= opencascade().then(OC => setOC(OC));
  return ready;
}

const fuseAll = shapes => shapes.reduce((a, b) => a.fuse(b));

/**
 * @param s      hinge settings
 * @param pose   { fa, ma, lift }: leaf angles in degrees (as in the viewer) and the z shift applied after posing
 * @returns Blob (STEP AP214, mm)
 */
export function buildStep(s, pose = { fa: 0, ma: 0, lift: 0 }) {
  const e = effective(s);
  const { W, H, g, R, c, filletR: r, pinD, K, sink } = e;
  const holes = holeSets(s);

  // Profile drawn in (x, z), swept along the pin: "XZ" maps local (u, v) to world (x, z) and extrudes along −Y.
  // (A numeric origin would be measured along the plane normal, i.e. −Y, so pass the point explicitly.)
  const sweepY = (drawing, y0, y1) => drawing.sketchOnPlane('XZ', [0, y1, 0]).extrude(y1 - y0);
  const cylY = (rad, y0, y1) => makeCylinder(rad, y1 - y0, [0, y0, 0], [0, 1, 0]);

  // Plate: x ∈ [0, W], y ∈ [−H/2, H/2], z ∈ [−g, 0], outer corners rounded.
  let pen = draw([0, -H / 2]);
  if (r > 0.01) {
    const k = r * (1 - Math.SQRT1_2);
    pen = pen.lineTo([W - r, -H / 2]).threePointsArcTo([W, -H / 2 + r], [W - k, -H / 2 + k]);
    if (H / 2 - r > 1e-6) pen = pen.lineTo([W, H / 2 - r]);
    pen = pen.threePointsArcTo([W - r, H / 2], [W - k, H / 2 - k]);
  } else {
    pen = pen.lineTo([W, -H / 2]).lineTo([W, H / 2]);
  }
  const outline = pen.lineTo([0, H / 2]).close();
  const plate = () => outline.sketchOnPlane('XY', -g).extrude(g);

  // Screw hole: thread + countersink cone / counterbore, revolved about a vertical axis.
  const holeCutter = ([u, v]) => {
    const rt = e.thread / 2;
    let p = draw([0, -g - 1]).lineTo([rt, -g - 1]);
    if (sink > 0 && e.head > e.thread) {
      const r0 = s.head_type === 1 ? rt : e.head / 2, rh = e.head / 2;
      p = p.lineTo([rt, -sink]);
      if (r0 > rt) p = p.lineTo([r0, -sink]);
      p = p.lineTo([rh, 0]).lineTo([rh, 1]);
    } else {
      p = p.lineTo([rt, 1]);
    }
    return p.lineTo([0, 1]).close().sketchOnPlane('XZ').revolve([0, 0, 1]).translate([u, v, 0]);
  };

  // Gusset profile in (x, z), matching geometry.js. Fills the corner between knuckle and leaf top.
  const d = R + e.gw;
  function gussetDrawing(flip = false) {
    const f = flip ? -1 : 1, P = ([x, z]) => [x, f * z];
    let p = draw([0, 0]).lineTo([d, 0]);
    if (s.gusset === 1) {
      const a = Math.acos(R / d);
      p = p.lineTo(P([R * Math.cos(a), R * Math.sin(a)]));
    } else if (s.gusset === 2) {
      const rho = (d * d - R * R) / (2 * R);
      const end = Math.atan2(-rho, -d), mid = (end - Math.PI / 2) / 2;
      const at = ang => P([d + rho * Math.cos(ang), rho + rho * Math.sin(ang)]);
      p = p.threePointsArcTo(at(end), at(mid));
    } else {
      // z = a (x − d)², just touching the knuckle. A parabola segment is exactly a quadratic Bézier.
      const minDist = a => {
        let best = Infinity, bx = 0;
        for (let i = 0; i <= 400; i++) {
          const x = d * i / 400, rr = Math.hypot(x, a * (x - d) ** 2);
          if (rr < best) { best = rr; bx = x; }
        }
        return [best, bx];
      };
      let lo = 0, hi = 1 / d;
      while (minDist(hi)[0] < R) hi *= 2;
      for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (minDist(m)[0] < R) lo = m; else hi = m; }
      const a = hi, xt = minDist(a)[1];
      p = p.quadraticBezierCurveTo(P([xt, a * (xt - d) ** 2]), [(d + xt) / 2, 0]);
    }
    return p.close();
  }
  const gussetDraw = e.gw > 0 ? gussetDrawing() : null;
  // The other leaf's gusset folded shut lands just under this leaf's top: cut it (plus clearance) away.
  const scoopDraw = e.gw > 0 ? gussetDrawing(true).offset(c) : null;

  function leaf(ownParity, holeList) {
    const own = [], other = [];
    for (let i = 0; i < K; i++) {
      const [y0, y1] = knuckleSpan(e, i);
      if (i % 2 === ownParity) {
        own.push(cylY(R, y0, y1));
        if (gussetDraw) own.push(sweepY(gussetDraw, y0, y1));
      } else {
        other.push(cylY(R + c, y0 - c, y1 + c));
        if (scoopDraw) other.push(sweepY(scoopDraw, y0 - c, y1 + c));
      }
    }
    let body = plate().cut(fuseAll(other));
    body = fuseAll([body, ...own]);
    if (holeList.length) body = body.cut(fuseAll(holeList.map(holeCutter)));
    return body;
  }
  const bore = () => cylY(pinD / 2 + c, -H / 2 - 1, H / 2 + 1);

  const parts = [];
  if (s.female) {
    let f = leaf(0, holes.f);
    f = s.pin ? f.fuse(cylY(pinD / 2, -H / 2, H / 2)) : f.cut(bore());
    f = f.rotate(-pose.fa, [0, 0, 0], [0, 1, 0]).translate([0, 0, pose.lift]);
    parts.push({ shape: f.simplify(), name: 'Pin leaf', color: '#f2a33a' });
  }
  if (s.male) {
    let m = leaf(1, holes.m).cut(bore()).mirror('YZ');
    m = m.rotate(pose.ma, [0, 0, 0], [0, 1, 0]).translate([0, 0, pose.lift]);
    parts.push({ shape: m.simplify(), name: 'Plain leaf', color: '#e0952f' });
  }
  return exportSTEP(parts, { unit: 'MM' });
}
