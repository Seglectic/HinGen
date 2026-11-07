// Builds hinge meshes off the main thread so sliders and drags stay smooth.
import { initGeometry, buildHinge } from './geometry.js';

const ready = initGeometry();
ready.then(() => self.postMessage({ type: 'ready' }), err => self.postMessage({ type: 'fatal', error: String(err) }));

self.onmessage = async ({ data }) => {
  await ready;
  try {
    const res = buildHinge(data.state);
    const transfer = [res.f?.buffer, res.m?.buffer].filter(Boolean);
    self.postMessage({ type: 'result', id: data.id, ...res }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', id: data.id, error: String(err?.message || err) });
  }
};
