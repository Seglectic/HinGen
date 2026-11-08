// Parameter schema for the UI.
//   min/max      slider range (kept sane)
//   hardMin/Max  limits for typed values (default: min / max)
//   layout       changing it regenerates the hole grid

export const SCREWS = {
  M2:     { thread: 2.2, head: 4.0 },
  'M2.5': { thread: 2.7, head: 5.0 },
  M3:     { thread: 3.3, head: 6.0 },
  M4:     { thread: 4.4, head: 8.0 },
};

export const GROUPS = [
  {
    title: 'Size',
    params: [
      { key: 'leaf_w', label: 'Leaf width (each side)', unit: 'mm', type: 'num', min: 4, max: 60, hardMin: 2, hardMax: 1000, step: 0.5, def: 20,
        help: 'Pin centre to the outer edge of one leaf. Type any value; the slider covers the common range.' },
      { key: 'leaf_h', label: 'Leaf length (along pin)', unit: 'mm', type: 'num', min: 5, max: 120, hardMin: 2, hardMax: 2000, step: 0.5, def: 20 },
      { key: 'gauge', label: 'Leaf thickness', unit: 'mm', type: 'num', min: 1, max: 6, hardMin: 0.6, hardMax: 50, step: 0.1, def: 2,
        help: 'The knuckle is twice this in diameter.' },
      { key: 'corner_r', label: 'Corner radius', unit: 'mm', type: 'num', min: 0, max: 20, hardMax: 500, step: 0.5, def: 4,
        help: 'Outer corners of the leaves. 0 = square; capped at half the leaf length.' },
    ],
  },
  {
    title: 'Knuckles & pin',
    params: [
      { key: 'knuckles', label: 'Knuckle count', type: 'num', min: 3, max: 15, hardMax: 51, step: 2, def: 5 },
      { key: 'clearance', label: 'Clearance', unit: 'mm', type: 'num', min: 0.1, max: 1, hardMin: 0.05, hardMax: 3, step: 0.05, def: 0.4,
        help: 'Gap between moving parts. Raise it if the print fuses; lower it if it rattles.' },
      { key: 'pin', label: 'Fused pin (print-in-place)', type: 'bool', def: true,
        help: 'Off leaves an empty shaft for a metal pin or bolt.' },
      { key: 'auto_pin', label: 'Pin size = leaf thickness', type: 'bool', def: true },
      { key: 'pin_d', label: 'Pin diameter', unit: 'mm', type: 'num', min: 0.6, max: 10, hardMax: 100, step: 0.1, def: 2,
        showIf: s => !s.auto_pin, help: 'Limited so the knuckle keeps at least a 0.4 mm wall.' },
      { key: 'gusset', label: 'Knuckle gussets', type: 'select', def: 0,
        options: [[0, 'None'], [1, 'Linear'], [2, 'Circular'], [3, 'Parabolic']],
        help: 'Fillets between each knuckle and its leaf for extra strength. Holes keep clear of them.' },
      { key: 'gusset_w', label: 'Gusset length', unit: 'mm', type: 'num', min: 0.5, max: 15, hardMax: 200, step: 0.5, def: 3,
        showIf: s => s.gusset > 0, help: 'How far the gusset runs out onto the leaf from the knuckle.' },
    ],
  },
  {
    title: 'Screw holes',
    editor: true,
    params: [
      { key: 'fasteners', label: 'Screw holes', type: 'bool', def: true },
      { key: 'screw', label: 'Screw size', type: 'select', def: 'M2',
        options: [...Object.keys(SCREWS).map(k => [k, k]), ['custom', 'Custom']], showIf: s => s.fasteners },
      { key: 'thread_d', label: 'Hole diameter', unit: 'mm', type: 'num', min: 0.5, max: 10, hardMax: 100, step: 0.1, def: 2.2,
        showIf: s => s.fasteners && s.screw === 'custom' },
      { key: 'head_d', label: 'Head diameter', unit: 'mm', type: 'num', min: 1, max: 20, hardMax: 200, step: 0.1, def: 4,
        showIf: s => s.fasteners && s.screw === 'custom' },
      { key: 'head_type', label: 'Head', type: 'select', def: 1,
        options: [[1, 'Countersunk'], [0, 'Counterbored'], [2, 'Plain hole']], showIf: s => s.fasteners },
      { key: 'sink', label: 'Countersink / bore depth', unit: 'mm', type: 'num', min: 0, max: 5, hardMax: 50, step: 0.1, def: 1,
        showIf: s => s.fasteners && s.head_type !== 2, help: 'Capped so at least 0.6 mm of leaf remains.' },
      { key: 'rows', label: 'Grid rows', type: 'num', min: 1, max: 12, hardMax: 100, step: 1, def: 2, showIf: s => s.fasteners, layout: true },
      { key: 'cols', label: 'Grid columns', type: 'num', min: 1, max: 6, hardMax: 50, step: 1, def: 2, showIf: s => s.fasteners, layout: true },
      { key: 'margin', label: 'Edge margin', unit: 'mm', type: 'num', min: 0, max: 15, hardMax: 200, step: 0.5, def: 2,
        showIf: s => s.fasteners, layout: true, help: 'Grid inset from the leaf edges.' },
    ],
  },
  {
    title: 'Output',
    params: [
      { key: 'male', label: 'Plain leaf', type: 'bool', def: true },
      { key: 'female', label: 'Pin leaf', type: 'bool', def: true },
      { key: 'res', label: 'Smoothness', type: 'num', min: 24, max: 192, step: 8, def: 72,
        wire: true, help: 'Segments per circle. Shows wireframe while you adjust it.' },
    ],
  },
];

export const ALL = GROUPS.flatMap(g => g.params);
for (const p of ALL) {
  if (p.type === 'num') { p.hardMin ??= p.min; p.hardMax ??= p.max; }
}

export function defaults() {
  return { ...Object.fromEntries(ALL.map(p => [p.key, p.def])), layout: null, mirror: true };
}

export const clip = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Derived, clamped dimensions shared by the geometry and the hole editor. */
export function effective(s) {
  let thread = s.thread_d, head = s.head_d;
  if (s.screw !== 'custom' && SCREWS[s.screw]) ({ thread, head } = SCREWS[s.screw]);
  const W = Math.max(s.leaf_w, 1);
  const H = Math.max(s.leaf_h, 1);
  const g = clip(s.gauge, 0.4, W / 2);           // leaf thickness = knuckle radius
  const R = g;
  const c = clip(s.clearance, 0.02, R / 2);
  head = clip(head, 0.2, W - R - c);
  thread = clip(thread, 0.1, head);
  if (s.head_type === 2) head = thread;
  const sink = s.head_type === 2 ? 0 : clip(s.sink, 0, g - 0.6);
  const margin = Math.max(0, s.margin);
  const filletR = clip(s.corner_r, 0, Math.min(H / 2, W - R - c));
  const gw = s.gusset > 0 ? clip(s.gusset_w, 0.3, W - R - c - 0.3) : 0;   // gusset reach past the knuckle
  const keepOut = Math.max(c, gw);   // holes stay this far outside the knuckle
  const pinD = s.auto_pin ? g : clip(s.pin_d, 0.4, 2 * R - c - 0.8);
  let K = Math.max(3, Math.round(s.knuckles) | 1);
  while (K > 3 && (H - (K - 1) * c) / K < 1) K -= 2;   // keep knuckles at least 1 mm long
  const Lk = (H - (K - 1) * c) / K;
  return { W, H, g, R, c, head, thread, sink, margin, filletR, pinD, K, Lk, gw, keepOut };
}

/** Knuckle i spans [y0, y1] along the pin. Even indices belong to the pin leaf. */
export function knuckleSpan(e, i) {
  const y0 = -e.H / 2 + i * (e.Lk + e.c);
  return [y0, y0 + e.Lk];
}

/** Even grid of hole centres in leaf coords [u, v] (u from pin axis, v along pin). */
export function gridHoles(s) {
  const e = effective(s);
  let u0 = e.R + e.keepOut + e.head / 2 + e.margin, u1 = e.W - e.head / 2 - e.margin;
  const v1 = e.H / 2 - e.head / 2 - e.margin, v0 = -v1;
  const R = Math.max(1, Math.round(s.rows)), C = Math.max(1, Math.round(s.cols));
  const at = (a, b, i, n) => (n === 1 ? (a + b) / 2 : a + (b - a) * i / (n - 1));
  if (u1 < u0) { const mid = (u0 + u1) / 2; u0 = u1 = mid; }   // leaf too narrow for columns
  const out = [];
  for (let r = 0; r < R; r++) for (let k = 0; k < C; k++) out.push(clampHole(s, [at(u0, u1, k, C), at(v1, v0, r, R)]));
  return out;
}

/** Clamp a hole centre so the head stays on the leaf, clear of the knuckles and rounded corners. */
export function clampHole(s, [u, v]) {
  const e = effective(s);
  const rh = e.head / 2;
  const uMin = e.R + e.keepOut + rh, uMax = Math.max(uMin, e.W - rh);
  const vMax = Math.max(0, e.H / 2 - rh);
  u = clip(u, uMin, uMax); v = clip(v, -vMax, vMax);
  const r = e.filletR;
  if (r > rh) {
    const cu = e.W - r, cv = Math.sign(v || 1) * (e.H / 2 - r);
    if (u > cu && Math.abs(v) > Math.abs(cv)) {
      const du = u - cu, dv = v - cv, d = Math.hypot(du, dv), lim = r - rh;
      if (d > lim) { u = cu + du / d * lim; v = cv + dv / d * lim; }
    }
  }
  return [u, v];
}

/** Hole centres per leaf, after clamping. f = pin leaf (+x), m = plain leaf (−x, mirrored). */
export function holeSets(s) {
  if (!s.fasteners) return { f: [], m: [] };
  const f = (s.layout ? s.layout.f : gridHoles(s)).map(h => clampHole(s, h));
  const m = (!s.mirror && s.layout?.m ? s.layout.m : f).map(h => clampHole(s, h));
  return { f, m };
}
