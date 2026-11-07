#!/usr/bin/env python3
"""Vendor third-party runtime files into ./vendor.

Usage: python3 tools/vendor.py <openscad-wasm-prebuilt package dir> <three package dir>

Both arguments are unpacked npm tarballs (the folder containing package.json):
  openscad-wasm-prebuilt@1.2.0  https://registry.npmjs.org/openscad-wasm-prebuilt/-/openscad-wasm-prebuilt-1.2.0.tgz
  three@0.170.0                 https://registry.npmjs.org/three/-/three-0.170.0.tgz

openscad-wasm-prebuilt ships the .wasm inlined as base64 inside openscad.js and
decodes + compiles it on every createOpenSCAD() call. We split it out into a real
openscad.wasm (served as a binary, compiled once with compileStreaming) and patch
the JS so it no longer decodes the inline copy. The worker supplies its own
instantiateWasm() that reuses the compiled module.
"""
import base64
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "vendor"


def vendor_openscad(pkg: Path) -> None:
    src = (pkg / "dist" / "openscad.js").read_text()
    m = re.search(r"_loadWasmModule\(0, null, '([A-Za-z0-9+/=]+)'", src)
    if not m:
        sys.exit("could not find inline wasm in openscad.js")
    wasm = base64.b64decode(m.group(1))
    assert wasm[:4] == b"\0asm", "inline payload is not wasm"
    src = src[: m.start(1)] + src[m.end(1):]
    patched, n = re.subn(r"const wasmBinary = await wasm\(\);", "const wasmBinary = null; // HinGen: wasm loaded separately", src)
    if n != 1:
        sys.exit("could not patch wasmBinary line")
    out = VENDOR / "openscad"
    out.mkdir(parents=True, exist_ok=True)
    (out / "openscad.js").write_text("// openscad-wasm-prebuilt 1.2.0 (GPL-2.0-or-later), inline wasm split out by tools/vendor.py\n" + patched)
    (out / "openscad.wasm").write_bytes(wasm)
    shutil.copy(pkg / "COPYING", out / "COPYING")
    print(f"openscad: js {len(patched)//1024} KiB, wasm {len(wasm)//1024} KiB")


def vendor_three(pkg: Path) -> None:
    out = VENDOR / "three"
    (out / "addons").mkdir(parents=True, exist_ok=True)
    shutil.copy(pkg / "build" / "three.module.min.js", out / "three.module.min.js")
    shutil.copy(pkg / "examples" / "jsm" / "controls" / "OrbitControls.js", out / "addons" / "OrbitControls.js")
    shutil.copy(pkg / "examples" / "jsm" / "loaders" / "STLLoader.js", out / "addons" / "STLLoader.js")
    shutil.copy(pkg / "LICENSE", out / "LICENSE")
    print("three: 0.170.0 copied")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    vendor_openscad(Path(sys.argv[1]))
    vendor_three(Path(sys.argv[2]))
