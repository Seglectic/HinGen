// Renders the hinge with OpenSCAD (WASM) off the main thread.
// The wasm is compiled once; each render gets a fresh instance, since
// OpenSCAD's main() isn't designed to be re-entered.
import { createOpenSCAD } from './vendor/openscad/openscad.js';

const wasmUrl = new URL('./vendor/openscad/openscad.wasm', import.meta.url);
const scadUrl = new URL('./models/butt_hinge.scad', import.meta.url);

const modP = WebAssembly.compileStreaming(fetch(wasmUrl)).catch(async () =>
  WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer()));
const scadP = fetch(scadUrl).then(r => r.text());

modP.then(() => self.postMessage({ type: 'ready' }), e => self.postMessage({ type: 'fatal', error: String(e) }));

async function render(defines) {
  const [mod, scad] = await Promise.all([modP, scadP]);
  const log = [];
  const o = await createOpenSCAD({
    print: s => log.push(s),
    printErr: s => log.push(s),
    instantiateWasm(imports, receive) {
      WebAssembly.instantiate(mod, imports).then(inst => receive(inst, mod));
      return {};
    },
  });
  const m = o.getInstance();
  m.FS.writeFile('/hinge.scad', scad);
  const args = ['/hinge.scad', '-o', '/out.stl', '--backend=Manifold', '--export-format=binstl'];
  for (const d of defines) args.push('-D', d);
  let rc;
  try { rc = m.callMain(args); } catch (e) { rc = e?.status ?? -1; log.push(String(e)); }
  let stl = null;
  try { stl = m.FS.readFile('/out.stl', { encoding: 'binary' }); } catch { /* no output */ }
  return { rc, stl, log };
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'render') return;
  const t0 = performance.now();
  try {
    const { rc, stl, log } = await render(data.defines);
    const ms = Math.round(performance.now() - t0);
    if (!stl || !stl.length) {
      self.postMessage({ type: 'error', id: data.id, error: `OpenSCAD exited with ${rc}`, log, ms });
      return;
    }
    const buf = stl.slice().buffer;
    self.postMessage({ type: 'result', id: data.id, stl: buf, log, ms }, [buf]);
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, error: String(e), log: [], ms: 0 });
  }
};
