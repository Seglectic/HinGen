import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { GROUPS, ALL, defaults } from './params.js';
import { createHoleEditor } from './holes.js';

// ---------- state (persisted in the URL hash so settings can be shared) ----------
const byKey = Object.fromEntries(ALL.map(p => [p.key, p]));

function coerce(p, raw) {
  if (p.type === 'bool') return raw === true || raw === '1' || raw === 'true';
  if (p.type === 'num') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.min(p.hardMax, Math.max(p.hardMin, n)) : p.def;
  }
  if (p.type === 'select') {
    const opt = p.options.find(([v]) => String(v) === String(raw));
    return opt ? opt[0] : p.def;
  }
  return raw;
}

const encHoles = hs => hs.map(([u, v]) => `${+u.toFixed(2)},${+v.toFixed(2)}`).join(';');
const decHoles = str => (str ? str.split(';').map(p => p.split(',').map(Number)).filter(h => h.length === 2 && h.every(Number.isFinite)) : []);

function loadState() {
  const s = defaults();
  const h = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of h) if (byKey[k]) s[k] = coerce(byKey[k], v);
  if (h.get('mir') === '0') s.mirror = false;
  if (h.has('hf')) s.layout = { f: decHoles(h.get('hf')), m: h.has('hm') ? decHoles(h.get('hm')) : null };
  return s;
}

function saveState() {
  const h = new URLSearchParams();
  for (const p of ALL) if (state[p.key] !== p.def) h.set(p.key, p.type === 'bool' ? (state[p.key] ? 1 : 0) : state[p.key]);
  if (!state.mirror) h.set('mir', 0);
  if (state.layout) {
    h.set('hf', encHoles(state.layout.f));
    if (!state.mirror && state.layout.m) h.set('hm', encHoles(state.layout.m));
  }
  const str = h.toString();
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}

let state = loadState();

// ---------- form ----------
const form = document.getElementById('form');
const rows = {};
const inputs = {};
let holeEditor;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.filter(k => k != null));
  return e;
}

function setParam(p, v) {
  state[p.key] = v;
  if (p.layout) state.layout = null;   // grid controls regenerate the layout
  changed();
}

function buildForm() {
  form.replaceChildren();
  for (const g of GROUPS) {
    const fs = el('fieldset', {}, el('legend', {}, g.title));
    for (const p of g.params) {
      const id = `p-${p.key}`;
      const row = el('div', { class: 'row' });
      row.append(el('label', { for: id }, p.label));
      if (p.type === 'num') {
        const box = el('input', { id, type: 'number', min: p.hardMin, max: p.hardMax, step: p.step, value: state[p.key], inputMode: 'decimal' });
        const range = el('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: state[p.key], 'aria-label': p.label });
        range.addEventListener('input', () => { box.value = range.value; setParam(p, coerce(p, range.value)); });
        const fromBox = commitNow => {
          if (box.value === '' || !Number.isFinite(parseFloat(box.value))) return;
          const v = coerce(p, box.value);
          range.value = v;                       // the slider just pins at its end for out-of-range values
          if (commitNow) box.value = v;
          setParam(p, v);
        };
        box.addEventListener('input', () => fromBox(false));
        box.addEventListener('change', () => fromBox(true));
        if (p.wire) bindWireframe(range, box);
        inputs[p.key] = { set: v => { box.value = v; range.value = v; } };
        row.append(el('div', { class: 'num' }, box, el('span', { class: 'unit' }, p.unit || '')), range);
      } else if (p.type === 'bool') {
        const cb = el('input', { id, type: 'checkbox', checked: !!state[p.key] });
        cb.addEventListener('change', () => setParam(p, cb.checked));
        inputs[p.key] = { set: v => { cb.checked = !!v; } };
        row.append(el('label', { class: 'switch' }, cb, el('span')));
      } else if (p.type === 'select') {
        const sel = el('select', { id });
        for (const [v, label] of p.options) sel.append(el('option', { value: v, selected: String(v) === String(state[p.key]) }, label));
        sel.addEventListener('change', () => setParam(p, coerce(p, sel.value)));
        inputs[p.key] = { set: v => { sel.value = v; } };
        row.append(sel);
      }
      if (p.help) row.append(el('div', { class: 'help' }, p.help));
      rows[p.key] = row;
      fs.append(row);
    }
    if (g.editor) {
      const host = el('div', {});
      fs.append(host);
      holeEditor = createHoleEditor(host, () => state, mutate => { mutate(state); changed(); });
    }
    form.append(fs);
  }
}

function applyVisibility() {
  for (const p of ALL) if (p.showIf) rows[p.key].hidden = !p.showIf(state);
}

let dirty = false;
function changed() {
  applyVisibility();
  saveState();
  holeEditor?.render();
  dirty = true;          // rebuilt on the next animation frame, so slider drags update live
}

// ---------- viewer ----------
const canvas = document.getElementById('view');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171a);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
camera.up.set(0, 0, 1);
camera.position.set(45, -70, 55);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202428, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(80, -60, 140);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
rim.position.set(-90, 100, 40);
scene.add(rim);

let grid, gridSize = 0;
function setGrid(size) {
  const s = Math.max(20, Math.ceil(size / 10) * 20);
  if (s === gridSize) return;
  gridSize = s;
  if (grid) { scene.remove(grid); grid.geometry.dispose(); }
  grid = new THREE.GridHelper(s, Math.round(s / 5), 0x3a3f46, 0x262a2f);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
}

// root lifts the hinge so the flat leaves sit on the plate; each pivot rotates one leaf about the pin (Y axis).
const root = new THREE.Group();
scene.add(root);
const LEAF_COLOR = 0xf2a33a;
const leaves = {
  f: { pivot: new THREE.Group(), mat: new THREE.MeshStandardMaterial({ color: LEAF_COLOR, roughness: 0.55, metalness: 0.05, flatShading: true }), mesh: null, angle: 0, sign: 1 },
  m: { pivot: new THREE.Group(), mat: new THREE.MeshStandardMaterial({ color: 0xe0952f, roughness: 0.55, metalness: 0.05, flatShading: true }), mesh: null, angle: 0, sign: -1 },
};
for (const L of Object.values(leaves)) root.add(L.pivot);

function setLeafMesh(L, pos) {
  if (L.mesh) { L.pivot.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh = null; }
  if (!pos) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  L.mesh = new THREE.Mesh(geo, L.mat);
  L.mesh.userData.leaf = L;
  L.pivot.add(L.mesh);
}

// Wireframe while a resolution control is being adjusted, so the tessellation change is visible.
let wireTimer = null, wireHeld = false;
function setWire(on) { for (const L of Object.values(leaves)) L.mat.wireframe = on; }
function wireRelease(delay) { clearTimeout(wireTimer); wireTimer = setTimeout(() => setWire(false), delay); }
function bindWireframe(range, box) {
  range.addEventListener('pointerdown', () => { wireHeld = true; clearTimeout(wireTimer); setWire(true); });
  window.addEventListener('pointerup', () => { if (wireHeld) { wireHeld = false; wireRelease(500); } });
  const pulse = () => { setWire(true); if (!wireHeld) wireRelease(900); };
  range.addEventListener('input', pulse);
  box.addEventListener('input', pulse);
}

// Opening angle per leaf, degrees: 0 = flat, positive folds the leaf up over the knuckles.
const MIN_TOTAL = -90, MAX_TOTAL = 180;
function applyPose() {
  leaves.f.pivot.rotation.y = -THREE.MathUtils.degToRad(leaves.f.angle);
  leaves.m.pivot.rotation.y = THREE.MathUtils.degToRad(leaves.m.angle);
  const total = Math.round(leaves.f.angle + leaves.m.angle);
  poseChip.hidden = total === 0;
  poseText.textContent = `Open ${total}° · exports as shown`;
  updateDims();
}

let framed = false;
const dims = document.getElementById('dims');
function updateDims() {
  const box = new THREE.Box3().setFromObject(root, true);
  if (box.isEmpty()) { dims.textContent = ''; return; }
  const size = box.getSize(new THREE.Vector3());
  dims.innerHTML = `<b>${size.x.toFixed(1)}</b> × <b>${size.y.toFixed(1)}</b> × <b>${size.z.toFixed(1)}</b> mm`;
}

const statusBox = document.getElementById('status');
const statusText = document.getElementById('status-text');
const btnDl = document.getElementById('btn-dl');
function setStatus(kind, text) { statusBox.className = kind; statusText.textContent = text; }

// Builds run in a worker; while one is in flight, further changes coalesce into a single follow-up build.
const worker = new Worker(new URL('./geometry-worker.js', import.meta.url), { type: 'module' });
let workerReady = false, building = false, buildSeq = 0;
worker.onmessage = ({ data }) => {
  if (data.type === 'ready') { workerReady = true; dirty = true; return; }
  if (data.type === 'fatal') { setStatus('err', `Failed to load Manifold: ${data.error}`); return; }
  building = false;
  if (data.type === 'error') { setStatus('err', `Build failed: ${data.error}`); return; }
  applyBuild(data);
};
worker.onerror = e => setStatus('err', `Worker error: ${e.message || e}`);

function rebuild() {
  if (!workerReady || building) return;
  dirty = false;
  building = true;
  worker.postMessage({ id: ++buildSeq, state: JSON.parse(JSON.stringify(state)) });
}

function applyBuild(res) {
  setLeafMesh(leaves.f, res.f);
  setLeafMesh(leaves.m, res.m);
  root.position.z = res.e.g;
  const span = Math.max(2 * res.e.W, res.e.H);
  setGrid(span);
  if (!framed) {
    controls.target.set(0, 0, res.e.g);
    const d = span * 2.4 + 10;
    camera.position.set(d * 0.45, -d * 0.75, d * 0.6);
    framed = true;
  }
  applyPose();
  const tris = ((res.f?.length || 0) + (res.m?.length || 0)) / 9;
  setStatus('ok', `Built in ${res.ms < 10 ? res.ms.toFixed(1) : Math.round(res.ms)} ms · ${tris.toLocaleString()} tris`);
  btnDl.disabled = !(res.f || res.m);
}

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- hover + drag a leaf around the pin ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = null, dragging = null;

function pick(evt) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((evt.clientX - r.left) / r.width) * 2 - 1, -((evt.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const meshes = Object.values(leaves).map(L => L.mesh).filter(Boolean);
  return ray.intersectObjects(meshes, false)[0] || null;
}

function setHover(L) {
  if (hovered === L) return;
  if (hovered) hovered.mat.emissive.setHex(0x000000);
  hovered = L;
  if (L) L.mat.emissive.setHex(0x5a3200);
  canvas.style.cursor = dragging ? 'grabbing' : L ? 'grab' : '';
}

// Angle of the pointer around the pin, measured in the leaf's own sense (0 = flat, + = folding up).
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPt = new THREE.Vector3();
function pointerAngle(evt, L) {
  pick(evt);   // updates the ray
  if (!ray.ray.intersectPlane(plane, hitPt)) return null;
  const local = root.worldToLocal(hitPt.clone());
  return THREE.MathUtils.radToDeg(Math.atan2(local.z, L.sign * local.x));
}

stage.addEventListener('pointerdown', evt => {
  if (evt.button !== 0 || !evt.target.isSameNode(canvas)) return;
  const hit = pick(evt);
  if (!hit) return;
  evt.stopPropagation();           // keep OrbitControls from rotating the camera
  const L = hit.object.userData.leaf;
  plane.constant = -hit.point.y;   // plane through the grab point, perpendicular to the pin
  dragging = { L, id: evt.pointerId, last: pointerAngle(evt, L), lastY: evt.clientY };
  canvas.setPointerCapture(evt.pointerId);
  setHover(L);
  canvas.style.cursor = 'grabbing';
}, { capture: true });

canvas.addEventListener('pointermove', evt => {
  if (!dragging) { setHover(pick(evt)?.object.userData.leaf || null); return; }
  const { L } = dragging;
  const other = L === leaves.f ? leaves.m : leaves.f;
  const a = pointerAngle(evt, L);
  let delta;
  if (a == null || dragging.last == null) {
    delta = (dragging.lastY - evt.clientY) * 0.5;   // edge-on view: fall back to vertical motion
  } else {
    delta = a - dragging.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
  }
  dragging.last = a; dragging.lastY = evt.clientY;
  L.angle = THREE.MathUtils.clamp(L.angle + delta, MIN_TOTAL - other.angle, MAX_TOTAL - other.angle);
  applyPose();
});
const endDrag = () => { if (!dragging) return; dragging = null; canvas.style.cursor = hovered ? 'grab' : ''; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { if (!dragging) setHover(null); });

const poseChip = document.getElementById('pose');
const poseText = document.getElementById('pose-text');
document.getElementById('btn-flat').addEventListener('click', () => { leaves.f.angle = leaves.m.angle = 0; applyPose(); });

renderer.setAnimationLoop(() => {
  if (dirty) rebuild();
  controls.update();
  renderer.render(scene, camera);
});

// ---------- export ----------
function exportStl() {
  root.updateMatrixWorld(true);
  const parts = [];
  for (const L of Object.values(leaves)) {
    if (!L.mesh) continue;
    const g = L.mesh.geometry.clone().applyMatrix4(L.mesh.matrixWorld);
    parts.push(g);
  }
  let minZ = Infinity;
  for (const g of parts) { g.computeBoundingBox(); minZ = Math.min(minZ, g.boundingBox.min.z); }
  const nTri = parts.reduce((n, g) => n + g.attributes.position.count / 3, 0);
  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);
  const header = 'HinGen binary STL';
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, nTri, true);
  let o = 84;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      a.z -= minZ; b.z -= minZ; c.z -= minZ;
      nrm.subVectors(c, b).cross(tmp.subVectors(a, b)).normalize();
      for (const v of [nrm, a, b, c]) { dv.setFloat32(o, v.x, true); dv.setFloat32(o + 4, v.y, true); dv.setFloat32(o + 8, v.z, true); o += 12; }
      o += 2;
    }
    g.dispose();
  }
  return buf;
}

function fileName(s) {
  const n = v => String(+(+v).toFixed(2));
  const holes = !s.fasteners ? 'plain' : s.screw === 'custom' ? `holes${n(s.thread_d)}` : s.screw;
  const total = Math.round(leaves.f.angle + leaves.m.angle);
  return `hinge_${n(s.leaf_w)}x${n(s.leaf_h)}_t${n(s.gauge)}_${holes}${total ? `_${total}deg` : ''}.stl`;
}

btnDl.addEventListener('click', () => {
  const a = el('a', { href: URL.createObjectURL(new Blob([exportStl()], { type: 'model/stl' })), download: fileName(state) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  state = defaults();
  for (const p of ALL) inputs[p.key]?.set(state[p.key]);
  leaves.f.angle = leaves.m.angle = 0;
  changed();
});

document.getElementById('btn-link').addEventListener('click', async e => {
  try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'Copied'; }
  catch { e.target.textContent = 'Copy failed'; }
  setTimeout(() => (e.target.textContent = 'Copy link'), 1200);
});

// ---------- boot ----------
buildForm();
applyVisibility();
holeEditor.render();
setStatus('busy', 'Loading geometry engine…');
