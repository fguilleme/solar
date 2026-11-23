#!/usr/bin/env python3
"""
Negative controls for the orrery test suite.

A green suite means nothing if it stays green against broken code.  Every load-bearing
assertion here was written against a *deliberately wrong* copy of index.html, and this
script re-checks that each wrong copy is actually caught.

Each variant is a list of exact string patches applied to a scratch copy of index.html
(index.html itself is never touched).  The variant is then run through the same headless
Chrome + harness path as `./test/run.sh selftest`, and:

  * a variant that FAILS is a working test   (the suite sees the bug)
  * a variant that PASSES is a blind spot    (the suite is blind to that bug)

The exit code is non-zero if any variant slips through.

  ./test/run.sh negatives            every variant, self-test harness
  ./test/run.sh negatives labels     only the label variants, label-test harness
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import shutil

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
testdir = os.path.join(root, "test")
build = os.path.join(testdir, "build")
MARK = "scene.updateMatrixWorld(true);"


class BadPatch(Exception):
    pass

# name -> (harness, [(old, new), ...])
# name -> (harness, [(old, new), ...]).  Every `old` is an exact snippet of index.html
# and must appear exactly once — the script refuses to run a variant that does not match.
PLANET_PLANE = """        const orbitGroup = new THREE.Group();
        orbitGroup.rotation.order = "YXZ";
        orbitGroup.rotation.y = deg2rad(def.node);
        orbitGroup.rotation.x = incRad * tiltScale;
        scene.add(orbitGroup);

        const pts = [];"""

VARIANTS = {
    # --- orbital orientation ---------------------------------------------------
    "planet-roll-added": ("selftest.js", [
        (PLANET_PLANE,
         PLANET_PLANE.replace("orbitGroup.rotation.x = incRad * tiltScale;",
                             "orbitGroup.rotation.x = incRad * tiltScale;\n        orbitGroup.rotation.z = def.node * 0.5;   /* NEGATIVE CONTROL: arbitrary per-planet roll */")),
    ]),
    "node-applied-before-tilt": ("selftest.js", [
        (PLANET_PLANE,
         PLANET_PLANE.replace('orbitGroup.rotation.order = "YXZ";',
                              'orbitGroup.rotation.order = "XYZ";   /* NEGATIVE CONTROL: node applied before the tilt */')),
    ]),
    # --- the asteroid belt -----------------------------------------------------
    "belt-inclinations-zeroed": ("selftest.js", [
        ("          ecc += g.ecc * f; // resonant rocks are the eccentric ones\n          incDeg += g.pump * f; // ... and the tilted ones",
         "          ecc += g.ecc * f; // resonant rocks are the eccentric ones\n          incDeg += 0; // NEGATIVE CONTROL: belt inclinations flattened"),
    ]),
    "one-shared-belt-node": ("selftest.js", [
        ("        const inc = deg2rad(incDeg),\n          node = beltRand() * TAU,\n          argp = beltRand() * TAU;",
         "        const inc = deg2rad(incDeg),\n          node = 0.3, // NEGATIVE CONTROL: every rock shares one ascending node\n          argp = beltRand() * TAU;"),
    ]),
    "belt-tilt-clamp-removed": ("selftest.js", [
        ("  const k = Math.min(tiltScale, 4);",
         "  const k = tiltScale;   /* NEGATIVE CONTROL: no 4x cap on the rocks */"),
    ]),
    "belt-ignores-spread": ("selftest.js", [
        ("        for (const m of beltMeta) {\n          m.radius = auToUnit(m.au); // belt orbits: the distance law, unchanged",
         "        for (const m of beltMeta) {\n          m.radius = AU_GAIN * Math.pow(m.au, DIST_POWER_DEFAULT); // NEGATIVE CONTROL: belt stuck at the default law"),
    ]),
    # --- distance spread -------------------------------------------------------
    "readout-only-spread": ("selftest.js", [
        ("const auToUnit = (au) => AU_GAIN * Math.pow(au, distPower);",
         "const auToUnit = (au) => AU_GAIN * Math.pow(au, DIST_POWER_DEFAULT);   /* NEGATIVE CONTROL: the slider only changes the label */"),
    ]),
    "stretched-not-resolved": ("selftest.js", [
        ("            b.a = auToUnit(b.def.au);\n            repaintOrbit(b);",
         "            b.a = auToUnit(b.def.au);   /* NEGATIVE CONTROL: new semi-major axis, drawn ellipse never re-solved */"),
    ]),
    "camera-left-behind": ("selftest.js", [
        ("        const ratio = spanGain();",
         "        const ratio = 1;   /* NEGATIVE CONTROL: camera never adjusts to the new span */"),
    ]),
    "spread-touches-angles": ("selftest.js", [
        ("            b.a = auToUnit(b.def.au);\n            repaintOrbit(b);",
         "            b.orbitGroup.rotation.z += distPower - DIST_POWER_DEFAULT;   /* NEGATIVE CONTROL: the spread drags the orbital planes */\n            b.a = auToUnit(b.def.au);\n            repaintOrbit(b);"),
    ]),
    "reset-ignores-spread": ("selftest.js", [
        ("        cam.dist = 210 * spanRatio;",
         "        cam.dist = 210;   /* NEGATIVE CONTROL: fixed overview distance */"),
    ]),
    "grid-ignores-spread": ("selftest.js", [
        ("        sizeEclipticGrid(auToUnit(OUTER_AU) * GRID_SPAN_RATIO);",
         "        sizeEclipticGrid(SPAN_AT_DEFAULT * GRID_SPAN_RATIO);   /* NEGATIVE CONTROL: the grid keeps its default size */"),
    ]),
    "readout-hard-coded-power": ("selftest.js", [
        ("const unitToAu = (units) =>\n        Math.pow(Math.max(1e-6, units) / AU_GAIN, 1 / distPower);",
         "const unitToAu = (units) =>\n        Math.pow(Math.max(1e-6, units) / AU_GAIN, 1 / DIST_POWER_DEFAULT);   /* NEGATIVE CONTROL: inverted with the old exponent */"),
    ]),
    # --- the size ruler that rides the spread -----------------------------------
    "size-exponent-ignores-spread": ("selftest.js", [
        ("      const sizeExp = () =>\n        SIZE_EXP_BASE + (distPower - DIST_POWER_DEFAULT) * SIZE_POWER_TRACK;",
         "      const sizeExp = () => SIZE_EXP_BASE;   /* NEGATIVE CONTROL: the km law never leans toward the true ratio */"),
    ]),
    "ruler-height-ignores-spread": ("selftest.js", [
        ("      const sizeGain = () =>\n        Math.min(\n          Math.pow(spanGain(), SIZE_SPAN_TRACK),\n          (SIZE_FRAME_CAP * auToUnit(INNER_AU)) / SUN_RADIUS,\n        );",
         "      const sizeGain = () => 1;   /* NEGATIVE CONTROL: the ruler stands at one height whatever the spread */"),
    ]),
    "sizes-computed-never-applied": ("selftest.js", [
        ("          applySize(b);",
         "          /* NEGATIVE CONTROL: the new ruler is computed, the geometry is left as built */"),
    ]),
    "star-cap-removed": ("selftest.js", [
        ("      const SIZE_FRAME_CAP = 0.9; // star radius as a fraction of the innermost orbit",
         "      const SIZE_FRAME_CAP = 1.4; // NEGATIVE CONTROL: the star may overrun the innermost orbit"),
    ]),
    "sun-display-frozen": ("selftest.js", [
        ("          sunGroup.scale.setScalar(g);",
         "          sunGroup.scale.setScalar(1);   /* NEGATIVE CONTROL: the star's own size ignores the ruler */"),
    ]),
    "belt-rubble-ignores-spread": ("selftest.js", [
        ("          m.rU = rockSize(m.km / 2); // belt rubble: the size law riding it",
         "          m.rU = 1.25 * Math.pow(m.km / 2 / EARTH_RADIUS_KM, 0.42) * ROCK_GAIN; // NEGATIVE CONTROL: rubble frozen"),
    ]),
    "belt-dots-ignore-frame": ("selftest.js", [
        ("        beltMat.uniforms.uScale.value =\n          renderer.domElement.height * 0.5 * Math.pow(spanGain(), BELT_DOT_TRACK);",
         "        beltMat.uniforms.uScale.value =\n          renderer.domElement.height * 0.5;   /* NEGATIVE CONTROL: the point layer thins out at a¹ */"),
    ]),
    "moon-system-frozen": ("selftest.js", [
        ("        if (b.moonPivot) b.moonPivot.scale.setScalar(f);",
         "        if (b.moonPivot) b.moonPivot.scale.setScalar(1);   /* NEGATIVE CONTROL: the Moon keeps its built distance */"),
    ]),
    "ride-not-rescaled": ("selftest.js", [
        ("          const f = following.r / rideBefore;",
         "          const f = 1;   /* NEGATIVE CONTROL: the ride ignores the radius it moved */"),
    ]),
    # --- labels ----------------------------------------------------------------
    "label-exemptions-removed": ("labeltest.js", [
        ("            if (!clashes || c.rank) {\n              placed = s;\n              break;\n            }",
         "            if (!clashes) {\n              placed = s;\n              break;\n            }   /* NEGATIVE CONTROL: no exemption */"),
        ("            prio: rank * 1e9 + screenR * 1000 + (b.isSun ? 500 : 0),\n          });",
         "            prio: screenR * 1000 + (b.isSun ? 500 : 0),\n          });   /* NEGATIVE CONTROL: hovered/selected no longer sorted first */"),
    ]),
}


def build_variant(name, harness, patches):
    src = open(os.path.join(root, "index.html")).read()
    assert src.count(MARK) == 1, "injection marker no longer unique"
    blk = open(os.path.join(testdir, harness)).read()
    for old, new in patches:
        if src.count(old) != 1:
            raise BadPatch("patch matches %d times, expected exactly 1:\n%s" % (src.count(old), old))
        src = src.replace(old, new, 1)
    out = os.path.join(build, "neg-%s.html" % name)
    open(out, "w").write(src.replace(MARK, blk + MARK, 1))
    return out


def run_headless(path, budget):
    profile = tempfile.mkdtemp(prefix="orrery-neg.")
    chrome = os.environ.get("CHROME", "google-chrome")
    try:
        dom = subprocess.run([chrome,
                              "--headless=new", "--no-sandbox", "--disable-gpu",
                              "--use-gl=angle", "--use-angle=swiftshader",
                              "--enable-unsafe-swiftshader",
                              "--user-data-dir=" + profile, "--no-first-run",
                              "--disable-extensions",
                              "--window-size=%s" % os.environ.get("SIZE", "500,320"),
                              "--virtual-time-budget=%s" % budget,
                              "--dump-dom", "file://" + path],
                             capture_output=True, text=True, timeout=400).stdout
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    m = re.search(r'<pre id="results">(.*?)</pre>', dom, re.S)
    if not m:
        return None, "harness never ran (script or render error)"
    txt = html.unescape(m.group(1))
    i = txt.find("RESULT ")
    if i < 0:
        return None, txt[:300]
    payload = json.loads(txt[i + 7:])
    if isinstance(payload, list):
        # The label test emits one record per camera view.
        bad = [v for v in payload if v["overlaps"] or v["outside"] or v.get("mustHave")]
        res = {"total": len(payload), "failed": len(bad), "exception": None}
        fails = ["%s: %s" % (v["tag"], v.get("mustHave") or ("%d overlapping labels" % v["overlaps"]))
                 for v in bad]
        return res, fails
    fails = [l.strip().strip('",') for l in txt.splitlines() if "FAIL" in l]
    return payload, fails


def main(argv):
    only = argv[1] if len(argv) > 1 else ""
    os.makedirs(build, exist_ok=True)
    budget = os.environ.get("BUDGET", "3500")
    blind, errors, ran = [], [], 0
    for name, (harness, patches) in VARIANTS.items():
        if only == "labels" and harness != "labeltest.js":
            continue
        if only and only != "labels" and only != name:
            continue
        try:
            path = build_variant(name, harness, patches)
        except BadPatch as e:
            errors.append(name)
            print("%-28s ERROR  %s" % (name, e))
            continue
        res, info = run_headless(path, os.environ.get("NEG_BUDGET", budget))
        ran += 1
        if res is None:
            errors.append(name)
            print("%-28s ERROR  %s" % (name, str(info)[:200]))
            continue
        if res["failed"] == 0 and not res.get("exception"):
            blind.append(name)
            print("%-28s SURVIVED  the suite did not notice  (total %s)" % (name, res["total"]))
        else:
            print("%-28s caught  failed %d/%s" % (name, res["failed"], res["total"]))
            for f in info[:3]:
                print("    %s" % f[:200])
    print("\n%d variants run · %d caught · %d blind · %d errored"
          % (ran, ran - len(blind) - len(errors), len(blind), len(errors)))
    if blind:
        print("BLIND SPOTS — the suite passes even though the code is wrong: " + ", ".join(blind))
    return 1 if (blind or errors) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
