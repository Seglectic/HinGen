// Parameter schema for the UI. `scad` is the variable in models/butt_hinge.scad;
// `toScad` maps the UI value when it differs from the script's own convention.

export const SCREWS = {
  M2:   { thread: 2.2, head: 4.0 },
  'M2.5': { thread: 2.7, head: 5.0 },
  M3:   { thread: 3.3, head: 6.0 },
  M4:   { thread: 4.4, head: 8.0 },
};

export const GROUPS = [
  {
    title: 'Size',
    params: [
      { key: 'leaf_w', label: 'Leaf width (each side)', unit: 'mm', type: 'num', min: 3, max: 150, step: 0.5, def: 20,
        scad: 'hinge_width', toScad: v => v * 2,
        help: 'Measured from the pin centre to the outer edge of one leaf.' },
      { key: 'leaf_h', label: 'Leaf length (along pin)', unit: 'mm', type: 'num', min: 3, max: 300, step: 0.5, def: 20, scad: 'leaf_height' },
      { key: 'gauge', label: 'Leaf thickness', unit: 'mm', type: 'num', min: 1, max: 10, step: 0.1, def: 2, scad: 'leaf_gauge',
        help: 'The knuckle is twice this in diameter. With auto pin size, the pin equals this too.' },
      { key: 'fillet', label: 'Rounded corners', type: 'bool', def: true, scad: 'enable_fillet' },
    ],
  },
  {
    title: 'Knuckles & pin',
    params: [
      { key: 'knuckles', label: 'Knuckle count', type: 'num', min: 3, max: 15, step: 2, def: 5, scad: 'knuckle_count' },
      { key: 'clearance', label: 'Clearance', unit: 'mm', type: 'num', min: 0.1, max: 1, step: 0.05, def: 0.4, scad: 'component_clearance',
        help: 'Gap between moving parts. Raise it if the print fuses; lower it if it rattles.' },
      { key: 'pin', label: 'Fused pin (print-in-place)', type: 'bool', def: true, scad: 'enable_pin',
        help: 'Off leaves an empty shaft for a metal pin or bolt.' },
      { key: 'auto_pin', label: 'Pin size = leaf thickness', type: 'bool', def: true, scad: 'enable_auto_pin_size' },
      { key: 'pin_d', label: 'Pin diameter', unit: 'mm', type: 'num', min: 1, max: 15, step: 0.1, def: 3, scad: 'pin_diameter',
        showIf: s => !s.auto_pin },
      { key: 'gusset', label: 'Knuckle gusset', type: 'select', def: 0, scad: 'knuckle_gusset_type',
        options: [[0, 'None'], [1, 'Linear'], [2, 'Circular'], [3, 'Parabolic']] },
    ],
  },
  {
    title: 'Screw holes',
    params: [
      { key: 'fasteners', label: 'Screw holes', type: 'bool', def: true, scad: 'enable_fasteners' },
      { key: 'screw', label: 'Screw size', type: 'select', def: 'M2', ui: true,
        options: [...Object.keys(SCREWS).map(k => [k, k]), ['custom', 'Custom']], showIf: s => s.fasteners },
      { key: 'thread_d', label: 'Hole diameter', unit: 'mm', type: 'num', min: 0.5, max: 12, step: 0.1, def: 2.2, scad: 'fastener_thread_diameter',
        showIf: s => s.fasteners && s.screw === 'custom' },
      { key: 'head_d', label: 'Head diameter', unit: 'mm', type: 'num', min: 1, max: 20, step: 0.1, def: 4, scad: 'fastener_head_diameter',
        showIf: s => s.fasteners && s.screw === 'custom' },
      { key: 'head_type', label: 'Head', type: 'select', def: 1, scad: 'fstener_head_type',
        options: [[1, 'Countersunk'], [0, 'Counterbored']], showIf: s => s.fasteners },
      { key: 'sink', label: 'Countersink / bore depth', unit: 'mm', type: 'num', min: 0, max: 10, step: 0.1, def: 1, scad: 'counter_sink_depth',
        showIf: s => s.fasteners, help: 'Capped at leaf thickness minus 1 mm.' },
      { key: 'count', label: 'Holes per leaf', type: 'num', min: 3, max: 32, step: 1, def: 4, scad: 'fastener_count',
        showIf: s => s.fasteners, help: 'Minimum 3; reduced automatically if they don\'t fit.' },
      { key: 'cols', label: 'Columns', type: 'select', def: 2, scad: 'fastener_column_count',
        options: [[1, '1'], [2, '2']], showIf: s => s.fasteners },
      { key: 'margin', label: 'Edge margin', unit: 'mm', type: 'num', min: 1, max: 20, step: 0.5, def: 2, scad: 'fastener_margin',
        showIf: s => s.fasteners },
    ],
  },
  {
    title: 'Output',
    params: [
      { key: 'male', label: 'Male leaf', type: 'bool', def: true, scad: 'enable_male_leaf' },
      { key: 'female', label: 'Female leaf (with pin)', type: 'bool', def: true, scad: 'enable_female_leaf' },
      { key: 'throw', label: 'Open angle', unit: '°', type: 'num', min: -90, max: 180, step: 5, def: 0, scad: 'throw_angle',
        help: '0 = flat for printing. 180 = closed. Bake ~120 in to print it standing up.' },
      { key: 'res', label: 'Smoothness', type: 'num', min: 32, max: 256, step: 16, def: 96, scad: 'resolution' },
    ],
  },
];

export const ALL = GROUPS.flatMap(g => g.params);

export function defaults() {
  return Object.fromEntries(ALL.map(p => [p.key, p.def]));
}

/** Build OpenSCAD -D assignments from UI state. */
export function toDefines(s) {
  const st = { ...s };
  if (st.screw !== 'custom' && SCREWS[st.screw]) {
    st.thread_d = SCREWS[st.screw].thread;
    st.head_d = SCREWS[st.screw].head;
  }
  const out = [];
  for (const p of ALL) {
    if (!p.scad) continue;
    let v = st[p.key];
    if (p.toScad) v = p.toScad(v);
    if (p.type === 'bool') v = v ? 1 : 0;
    out.push(`${p.scad}=${typeof v === 'string' ? JSON.stringify(v) : v}`);
  }
  return out;
}
