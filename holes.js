// Top-down hole layout editor (SVG). Drag holes, click a leaf to add, double-click / right-click to remove.
import { effective, knuckleSpan, gridHoles, clampHole, holeSets } from './params.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/**
 * @param host     element to render into
 * @param getState () => state
 * @param commit   (mutator) => void   apply a state change and re-render everything
 */
export function createHoleEditor(host, getState, commit) {
  host.classList.add('hole-editor');
  const bar = document.createElement('div');
  bar.className = 'he-bar';
  const mirrorLbl = document.createElement('label');
  mirrorLbl.className = 'he-mirror';
  const mirrorCb = Object.assign(document.createElement('input'), { type: 'checkbox' });
  mirrorLbl.append(mirrorCb, ' Same on both leaves');
  const mode = document.createElement('span');
  mode.className = 'he-mode';
  const resetBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Reset to grid', className: 'he-reset' });
  bar.append(mirrorLbl, mode, resetBtn);

  const svg = svgEl('svg', { class: 'he-svg' });
  const world = svgEl('g');          // y flipped so +v points up, matching the 3D top view
  svg.append(world);
  const caption = document.createElement('div');
  caption.className = 'he-caption';
  caption.innerHTML = '<span>◂ Plain leaf</span><span class="he-count"></span><span>Pin leaf ▸</span>';
  const hint = document.createElement('div');
  hint.className = 'help';
  hint.textContent = 'Drag to move · click a leaf to add · double-click to remove · hold Shift for fine moves.';
  host.append(bar, svg, caption, hint);

  mirrorCb.addEventListener('change', () => commit(s => {
    const sets = holeSets(s);
    s.layout = { f: sets.f.map(h => [...h]), m: mirrorCb.checked ? null : sets.m.map(h => [...h]) };
    s.mirror = mirrorCb.checked;
  }));
  resetBtn.addEventListener('click', () => commit(s => { s.layout = null; s.mirror = true; }));

  // Ensure the state has an explicit, editable layout before a manual edit.
  function editable(s) {
    if (!s.layout) s.layout = { f: gridHoles(s), m: null };
    if (!s.mirror && !s.layout.m) s.layout.m = s.layout.f.map(h => [...h]);
    return s.layout;
  }
  const listFor = (s, side) => (side === 'm' && !s.mirror ? editable(s).m : editable(s).f);

  function toLeaf(evt) {
    const p = svg.createSVGPoint();
    p.x = evt.clientX; p.y = evt.clientY;
    const q = p.matrixTransform(world.getScreenCTM().inverse());
    return { x: q.x, y: q.y };
  }
  const snap = (v, fine) => { const st = fine ? 0.1 : 0.5; return Math.round(v / st) * st; };

  let drag = null;

  svg.addEventListener('pointerdown', evt => {
    if (evt.button !== 0) return;
    const s = getState();
    const hit = evt.target.closest('[data-hole]');
    if (hit) {
      const [side, idx] = hit.dataset.hole.split(':');
      drag = { side, idx: +idx, id: evt.pointerId };
      svg.setPointerCapture(evt.pointerId);
      evt.preventDefault();
      return;
    }
    const leafHit = evt.target.closest('[data-leaf]');
    if (leafHit && s.fasteners) {
      const side = leafHit.dataset.leaf;
      const { x, y } = toLeaf(evt);
      commit(st => {
        listFor(st, side).push(clampHole(st, [snap(Math.abs(x), evt.shiftKey), snap(y, evt.shiftKey)]));
      });
    }
  });
  svg.addEventListener('pointermove', evt => {
    if (!drag || evt.pointerId !== drag.id) return;
    const { x, y } = toLeaf(evt);
    commit(st => {
      const list = listFor(st, drag.side);
      if (list[drag.idx]) list[drag.idx] = clampHole(st, [snap(Math.abs(x), evt.shiftKey), snap(y, evt.shiftKey)]);
    });
  });
  const endDrag = () => { drag = null; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  const remove = evt => {
    const hit = evt.target.closest('[data-hole]');
    if (!hit) return;
    evt.preventDefault();
    const [side, idx] = hit.dataset.hole.split(':');
    commit(st => { listFor(st, side).splice(+idx, 1); });
  };
  svg.addEventListener('dblclick', remove);
  svg.addEventListener('contextmenu', remove);

  function leafPath(e, sign) {
    // Outline of one leaf in world XY (x = sign * u), rounded outer corners.
    const { W, H, filletR: r } = e;
    const X = u => sign * u;
    const sw = sign > 0 ? 1 : 0;   // arc sweep flips with the mirror
    if (r <= 0.01) return `M${X(0)},${-H / 2}H${X(W)}V${H / 2}H${X(0)}Z`;
    return `M${X(0)},${-H / 2}H${X(W - r)}A${r},${r} 0 0 ${sw} ${X(W)},${-H / 2 + r}` +
      `V${H / 2 - r}A${r},${r} 0 0 ${sw} ${X(W - r)},${H / 2}H${X(0)}Z`;
  }

  function render() {
    const s = getState();
    const e = effective(s);
    mirrorCb.checked = s.mirror;
    mode.textContent = s.layout ? 'Custom layout' : 'Grid layout';
    resetBtn.hidden = !s.layout;
    host.classList.toggle('disabled', !s.fasteners);

    const pad = Math.max(e.W, e.H) * 0.06 + 0.5;
    svg.setAttribute('viewBox', `${-e.W - pad} ${-e.H / 2 - pad} ${2 * (e.W + pad)} ${e.H + 2 * pad}`);
    world.setAttribute('transform', 'scale(1,-1)');
    world.replaceChildren();

    // stroke widths in mm scaled to the drawing
    const sw = Math.max(e.W, e.H) / 160;
    for (const [side, sign] of [['m', -1], ['f', 1]]) {
      const on = side === 'f' ? s.female : s.male;
      world.append(svgEl('path', { d: leafPath(e, sign), class: `he-leaf${on ? '' : ' off'}`, 'data-leaf': side, 'stroke-width': sw }));
    }
    for (let i = 0; i < e.K; i++) {
      const [y0, y1] = knuckleSpan(e, i);
      world.append(svgEl('rect', { x: -e.R, y: y0, width: 2 * e.R, height: y1 - y0, rx: e.R * 0.25,
        class: `he-knuckle ${i % 2 ? 'm' : 'f'}`, 'stroke-width': sw }));
    }
    world.append(svgEl('line', { x1: 0, y1: -e.H / 2 - pad / 2, x2: 0, y2: e.H / 2 + pad / 2, class: 'he-axis', 'stroke-width': sw * 0.8 }));

    if (!s.fasteners) { caption.querySelector('.he-count').textContent = 'No holes'; return; }
    const sets = holeSets(s);
    const all = [...sets.f.map(h => ['f', h]), ...sets.m.map(h => ['m', h])];
    const overlaps = (side, h) => (side === 'f' ? sets.f : sets.m).some(o => o !== h && Math.hypot(o[0] - h[0], o[1] - h[1]) < e.head - 1e-6);
    all.forEach(([side, h]) => {
      const idx = (side === 'f' ? sets.f : sets.m).indexOf(h);
      const x = (side === 'f' ? 1 : -1) * h[0];
      const g = svgEl('g', { 'data-hole': `${side}:${idx}`, class: `he-hole${overlaps(side, h) ? ' bad' : ''}` });
      g.append(svgEl('circle', { cx: x, cy: h[1], r: e.head / 2, class: 'head', 'stroke-width': sw }));
      g.append(svgEl('circle', { cx: x, cy: h[1], r: e.thread / 2, class: 'thru' }));
      g.append(svgEl('circle', { cx: x, cy: h[1], r: Math.max(e.head / 2, e.W / 14), class: 'grab' }));
      world.append(g);
    });
    caption.querySelector('.he-count').textContent =
      s.mirror ? `${sets.f.length} per leaf` : `${sets.m.length} · ${sets.f.length}`;
  }

  return { render };
}
