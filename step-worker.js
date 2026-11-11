// Builds STEP files off the main thread. OpenCascade (~23 MB wasm) only loads on the first STEP export.
import { initStep, buildStep } from './step.js';

const ready = initStep();

self.onmessage = async ({ data }) => {
  try {
    await ready;
    const blob = buildStep(data.state, data.pose);
    self.postMessage({ id: data.id, blob });
  } catch (err) {
    self.postMessage({ id: data.id, error: String(err?.message || err) });
  }
};
