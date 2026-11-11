#!/usr/bin/env python3
"""Vendor third-party runtime files into ./vendor.

Usage: python3 tools/vendor.py <manifold-3d dir> <three dir> [<replicad dir> <replicad-opencascadejs dir>]

Both arguments are unpacked npm tarballs (the folder containing package.json):
  manifold-3d@3.5.4  https://registry.npmjs.org/manifold-3d/-/manifold-3d-3.5.4.tgz
  three@0.170.0      https://registry.npmjs.org/three/-/three-0.170.0.tgz
  replicad@1.1.0     https://registry.npmjs.org/replicad/-/replicad-1.1.0.tgz
  replicad-opencascadejs@1.1.0
                     https://registry.npmjs.org/replicad-opencascadejs/-/replicad-opencascadejs-1.1.0.tgz
"""
import shutil
import sys
from pathlib import Path

VENDOR = Path(__file__).resolve().parent.parent / "vendor"


def copy(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 5):
        sys.exit(__doc__)
    m, t = Path(sys.argv[1]), Path(sys.argv[2])
    for f in ("manifold.js", "manifold.wasm", "LICENSE"):
        copy(m / f, VENDOR / "manifold" / f)
    copy(t / "build" / "three.module.min.js", VENDOR / "three" / "three.module.min.js")
    copy(t / "examples/jsm/controls/OrbitControls.js", VENDOR / "three/addons/OrbitControls.js")
    copy(t / "LICENSE", VENDOR / "three" / "LICENSE")
    print("vendored manifold-3d + three")
    if len(sys.argv) == 5:
        rep, oc = Path(sys.argv[3]) / "dist", Path(sys.argv[4])
        dst = VENDOR / "replicad"
        shutil.rmtree(dst, ignore_errors=True)
        # replicad.js imports one hashed chunk (casting-*.js); copy all ES-module .js files.
        for f in rep.glob("*.js"):
            copy(f, dst / f.name)
        for f in ("replicad_single.js", "replicad_single.wasm"):
            copy(oc / "dist" / f, dst / f)
        copy(rep.parent / "LICENSE", dst / "LICENSE-replicad")
        copy(oc / "LICENSE", dst / "LICENSE-opencascadejs")
        print("vendored replicad + replicad-opencascadejs")
