#!/usr/bin/env bash
# Headless test runner for the orrery.
#
#   ./test/run.sh              run the full self-test (118 assertions) + label test
#   ./test/run.sh selftest     only the full self-test
#   ./test/run.sh labels       only the label decluttering test
#   ./test/run.sh shots        write test/shot-true.png and test/shot-tilt.png
#   ./test/run.sh docs         regenerate docs/*.png (the images in README.md)
#
# Scratch copies (index.html + injected harness) are generated into test/build/.
# index.html itself is never modified.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
testdir="$root/test"
build="$testdir/build"
mode="${1:-all}"
size="${SIZE:-500,320}"
budget="${BUDGET:-3500}"
chrome_bin="${CHROME:-google-chrome}"

mkdir -p "$build"

# Inject a harness block right after the first scene settle, without touching index.html.
build_variant() {  # $1 = harness js  $2 = output html
  python3 - "$root/index.html" "$testdir/$1" "$2" <<'PY'
import sys
src = open(sys.argv[1]).read()
blk = open(sys.argv[2]).read()
mark = 'scene.updateMatrixWorld(true);'
assert src.count(mark) == 1, 'injection marker no longer unique: %d' % src.count(mark)
open(sys.argv[3], 'w').write(src.replace(mark, blk + mark, 1))
PY
}

run_headless() {  # $1 = html  $2 = out dom dump  $3 = virtual time budget
  local profile
  profile="$(mktemp -d /tmp/orrery-test.XXXXXX)"
  timeout 400 "$chrome_bin" \
    --headless=new --no-sandbox --disable-gpu \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --user-data-dir="$profile" --no-first-run --disable-extensions \
    --window-size="$size" --virtual-time-budget="$3" \
    --dump-dom "file://$1" > "$2" 2>/dev/null
  local status=$?
  rm -rf "$profile"
  return $status
}

summarise() {  # $1 = dom dump  $2 = expected kind (selftest prints counts, labels prints a list)
  python3 - "$1" <<'PY'
import re, html, json, sys
dom = open(sys.argv[1]).read()
m = re.search(r'<pre id="results">(.*?)</pre>', dom, re.S)
if not m:
    print('  no results block — the harness never ran (rendering or script error)')
    sys.exit(1)
txt = html.unescape(m.group(1))
i = txt.find('RESULT {')
if i < 0:
    print(txt[:800]); sys.exit(1)
res = json.loads(txt[i + 7:])
fails = [l for l in txt.splitlines() if 'FAIL' in l]
if fails:
    print('  failures:')
    for f in fails: print('   ', f.strip().strip('",'))
print('  total %s · failed %s · exception %s' % (res.get('total'), res.get('failed'), res.get('exception')))
sys.exit(1 if res.get('failed') else 0)
PY
}

summarise_labels() {
  python3 - "$1" <<'PY'
import re, html, json, sys
dom = open(sys.argv[1]).read()
m = re.search(r'<pre id="results">(.*?)</pre>', dom, re.S)
txt = html.unescape(m.group(1))
i = txt.find('RESULT ')
if i < 0: print('  no results block'); sys.exit(1)
data = json.loads(txt[i + 7:])
bad = 0
for v in data:
    ok = not v['overlaps'] and not v['outside'] and not v.get('mustHave')
    bad += 0 if ok else 1
    print('  %-28s visible %-6s overlaps %-2s outside %s%s' %
          (v['tag'], v['visible'], v['overlaps'], v['outside'] or '—',
           ('  MUST HAVE ' + ','.join(v['mustHave'])) if v.get('mustHave') else ''))
    if ok is False: print('    names: ' + v['names'])
print('  views %d · broken %d' % (len(data), bad))
sys.exit(1 if bad else 0)
PY
}

shot() {  # $1 = name  $2 = tilt clicks  $3 = polar angle  $4 = distance  $5 = out dir
  local profile png="$build/$1.png" out="$5/$1.png" tries=0
  build_variant view_block.js "$build/view-$1.html"
  rm -f "$png"          # never report a stale capture as a fresh one
  while [ "$tries" -lt "${SHOT_TRIES:-3}" ]; do
    tries=$((tries + 1))
    profile="$(mktemp -d /tmp/orrery-shot.XXXXXX)"
    timeout "${SHOT_TIMEOUT:-120}" "$chrome_bin" \
      --headless=new --no-sandbox --disable-gpu \
      --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
      --user-data-dir="$profile" --no-first-run --disable-extensions \
      --window-size="${SHOT_SIZE:-480,300}" --virtual-time-budget="${SHOT_BUDGET:-2400}" \
      --screenshot="$png" "file://$build/view-$1.html#$2|$3|$4" >/dev/null 2>&1 || true
    rm -rf "$profile"
    [ -s "$png" ] && break
    rm -f "$png"
  done
  if [ -s "$png" ]; then
    mkdir -p "$5"; cp "$png" "$out"
    dims=$(python3 -c "import struct,sys;d=open(sys.argv[1],'rb').read();print('%dx%d' % struct.unpack('>II',d[16:24]))" "$png")
    echo "  wrote ${out#"$root"/} $dims"
  else
    echo "  screenshot $1 failed after $tries tries (headless capture stalls — try a smaller SHOT_SIZE or BUDGET)"; return 1
  fi
}

rc=0

if [ "$mode" = "all" ] || [ "$mode" = "selftest" ]; then
  build_variant selftest.js "$build/selftest.html"
  n=$(grep -o 'ok(' "$testdir/selftest.js" | wc -l)
  echo "== self-test ($((n - 1)) check sites) =="
  run_headless "$build/selftest.html" "$build/selftest-dom.html" "$budget" || { echo "  chrome exited $?"; rc=1; }
  summarise "$build/selftest-dom.html" || rc=1
fi

if [ "$mode" = "all" ] || [ "$mode" = "labels" ]; then
  build_variant labeltest.js "$build/labeltest.html"
  echo "== label decluttering =="
  run_headless "$build/labeltest.html" "$build/labeltest-dom.html" 1400 || { echo "  chrome exited $?"; rc=1; }
  summarise_labels "$build/labeltest-dom.html" || rc=1
fi

if [ "$mode" = "shots" ]; then
  echo "== screenshots (${SHOT_SIZE:-480,300}) =="
  shot shot-true 0 0.62 300 "$testdir" || rc=1
  shot shot-tilt 2 0.62 300 "$testdir" || rc=1
  echo "  (best effort: SwiftShader frame capture is slow; see README)"
fi

if [ "$mode" = "docs" ]; then
  # Regenerate the two images embedded in README.md (docs/).
  export SHOT_SIZE="${SHOT_SIZE:-1280,800}" SHOT_BUDGET="${SHOT_BUDGET:-1600}" SHOT_TIMEOUT="${SHOT_TIMEOUT:-180}"
  echo "== README screenshots ($SHOT_SIZE) =="
  shot shot-orbits 0 0.62 300 "$root/docs" || rc=1
  shot shot-tilt 2 0.62 300 "$root/docs" || rc=1
fi

exit $rc
