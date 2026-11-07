import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { STLLoader } from 'three/addons/STLLoader.js';
import { GROUPS, ALL, defaults, toDefines } from './params.js';

// ---------- state (persisted in the URL hash so settings can be shared) ----------
const byKey = Object.fromEntries(ALL.map(p => [p.key, p]));

function coerce(p, raw) {
  if (p.type === 'bool') return raw === true || raw === '1' || raw === 'true';
  if (p.type === 'num') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, n)) : p.def;
  }
  if (p.type === 'select') {
    const opt = p.options.find(([v]) => String(v) === String(raw));
    return opt ? opt[0] : p.def;
  }
  return raw;
}

function loadState() {
  const s = defaults();
  const h = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of h) if (byKey[k]) s[k] = coerce(byKey[k], v);
  return s;
}

function saveState() {
  const h = new URLSearchParams();
  for (const p of ALL) if (state[p.key] !== p.def) h.set(p.key, p.type === 'bool' ? (state[p.key] ? 1 : 0) : state[p.key]);
  const str = h.toString();
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}

let state = loadState();

// ---------- form ----------
const form = document.getElementById('form');
const rows = {};

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

function buildForm() {
  form.replaceChildren();
  for (const g of GROUPS) {
    const fs = el('fieldset', {}, el('legend', {}, g.title));
    for (const p of g.params) {
      const id = `p-${p.key}`;
      const row = el('div', { class: 'row' });
      row.append(el('label', { for: id }, p.label));
      if (p.type === 'num') {
        const box = el('input', { id, type: 'number', min: p.min, max: p.max, step: p.step, value: state[p.key] });
        const range = el('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: state[p.key], 'aria-label': p.label });
        const sync = (v, from) => {
          state[p.key] = coerce(p, v);
          if (from !== box) box.value = state[p.key];
          if (from !== range) range.value = state[p.key];
          changed();
        };
        range.addEventListener('input', () => sync(range.value, range));
        box.addEventListener('change', () => sync(box.value, null));
        row.append(el('div', { class: 'num' }, box, el('span', { class: 'unit' }, p.unit || '')), range);
      } else if (p.type === 'bool') {
        const cb = el('input', { id, type: 'checkbox', checked: !!state[p.key] });
        cb.addEventListener('change', () => { state[p.key] = cb.checked; changed(); });
        row.append(el('label', { class: 'switch' }, cb, el('span')));
      } else if (p.type === 'select') {
        const sel = el('select', { id });
        for (const [v, label] of p.options) sel.append(el('option', { value: v, selected: String(v) === String(state[p.key]) }, label));
        sel.addEventListener('change', () => { state[p.key] = coerce(p, sel.value); changed(); });
        row.append(sel);
      }
      if (p.help) row.append(el('div', { class: 'help' }, p.help));
      rows[p.key] = row;
      fs.append(row);
    }
    form.append(fs);
  }
  applyVisibility();
}

function applyVisibility() {
  for (const p of ALL) if (p.showIf) rows[p.key].hidden = !p.showIf(state);
}

let debounce;
function changed() {
  applyVisibility();
  saveState();
  clearTimeout(debounce);
  debounce = setTimeout(requestRender, 300);
}

// ---------- viewer ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171a);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(60, -90, 70);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202428, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(80, -60, 140);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
rim.position.set(-90, 100, 40);
scene.add(rim);

let grid;
function setGrid(size) {
  if (grid) scene.remove(grid);
  const s = Math.max(20, Math.ceil(size / 10) * 10 * 2);
  grid = new THREE.GridHelper(s, s / 5, 0x3a3f46, 0x262a2f);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
}
setGrid(60);

const material = new THREE.MeshStandardMaterial({ color: 0xf2a33a, roughness: 0.55, metalness: 0.05, flatShading: false });
let mesh = null;
let framed = false;
const loader = new STLLoader();

function showStl(buf) {
  const geo = loader.parse(buf);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  // sit the part on the plate (z = 0), centred in XY
  const c = bb.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -bb.min.z);
  geo.computeBoundingBox();
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);
  const size = geo.boundingBox.getSize(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z);
  setGrid(r);
  if (!framed) {
    controls.target.set(0, 0, size.z / 2);
    const d = r * 2.6 + 10;
    camera.position.set(d * 0.45, -d * 0.7, d * 0.6);
    framed = true;
  }
  return { size, tris: geo.attributes.position.count / 3 };
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---------- rendering via worker ----------
const statusBox = document.getElementById('status');
const statusText = document.getElementById('status-text');
const dims = document.getElementById('dims');
const logPre = document.getElementById('log');
const btnDl = document.getElementById('btn-dl');

function setStatus(kind, text) {
  statusBox.className = kind;
  statusText.textContent = text;
}

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let busy = false, pending = false, seq = 0, lastStl = null, lastState = null;

function requestRender() {
  if (busy) { pending = true; return; }
  busy = true; pending = false;
  lastState = { ...state };
  setStatus('busy', 'Rendering…');
  worker.postMessage({ type: 'render', id: ++seq, defines: toDefines(state) });
}

worker.onmessage = ({ data }) => {
  if (data.type === 'ready') return;
  if (data.type === 'fatal') { setStatus('err', `Failed to load OpenSCAD: ${data.error}`); return; }
  busy = false;
  logPre.textContent = (data.log || []).join('\n');
  if (data.type === 'result') {
    lastStl = data.stl;
    const { size, tris } = showStl(data.stl);
    dims.innerHTML = `<b>${size.x.toFixed(1)}</b> × <b>${size.y.toFixed(1)}</b> × <b>${size.z.toFixed(1)}</b> mm`;
    setStatus('ok', `Rendered in ${(data.ms / 1000).toFixed(1)} s · ${tris.toLocaleString()} tris`);
    btnDl.disabled = false;
  } else {
    setStatus('err', `Render failed: ${data.error}. See log.`);
    document.getElementById('logbox').open = true;
  }
  if (pending) requestRender();
};
worker.onerror = e => setStatus('err', `Worker error: ${e.message || e}`);

// ---------- actions ----------
function fileName(s) {
  const n = v => String(+(+v).toFixed(2));
  const holes = s.fasteners ? (s.screw === 'custom' ? `holes${n(s.thread_d)}` : s.screw) : 'plain';
  return `hinge_${n(s.leaf_w)}x${n(s.leaf_h)}_t${n(s.gauge)}_${holes}.stl`;
}

btnDl.addEventListener('click', () => {
  if (!lastStl) return;
  const a = el('a', { href: URL.createObjectURL(new Blob([lastStl], { type: 'model/stl' })), download: fileName(lastState) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  state = defaults();
  buildForm();
  changed();
});

document.getElementById('btn-link').addEventListener('click', async e => {
  try {
    await navigator.clipboard.writeText(location.href);
    e.target.textContent = 'Copied';
  } catch {
    e.target.textContent = 'Copy failed';
  }
  setTimeout(() => (e.target.textContent = 'Copy link'), 1200);
});

buildForm();
requestRender();
