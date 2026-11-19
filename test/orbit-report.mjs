// Standalone orbit report: mirrors index.html's geometry with plain math.
// 1) compares the app's convention with the textbook Keplerian convention
// 2) reports each orbit's max ecliptic latitude
// 3) reports how many pixels a tilted orbit lifts off the ecliptic grid at the
//    default camera, i.e. whether the inclination is actually visible.

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const auToUnit = au => 18 * Math.pow(au, 0.55);

const P = [
  ['Mercury', 0.387098, 0.205632, 7.004979, 48.330761, 29.126967, 174.792532],
  ['Venus',   0.723332, 0.006777, 3.394676, 76.679843, 54.922488, 50.376633],
  ['Earth',   1.000000, 0.016711, 0.00005,  0.0,       102.94719,  357.517163],
  ['Mars',    1.523679, 0.093394, 1.849691, 49.559539, 286.49691,  19.390181],
  ['Jupiter', 5.202887, 0.048386, 1.304397, 100.473909,274.254567, 19.667653],
  ['Saturn',  9.536676, 0.053862, 2.485992, 113.665503,338.766439, 317.522406],
  ['Uranus', 19.189165, 0.047257, 0.772638, 74.016925, 96.937351,  142.283828],
  ['Neptune',30.069923, 0.00859,  1.769233, 131.784226,273.187128, 259.908675],
];

function solveKepler(M, e) { let E = M; for (let i = 0; i < 14; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }

/* ---- app convention: ellipse drawn in the XZ plane of the orbit group,
        group rotated Ry(node) * Rx(inc)  (rotation order YXZ) ---- */
function appPos(def, E) {
  const [name, au, ecc] = def;
  const a = auToUnit(au), b = a * Math.sqrt(1 - ecc * ecc);
  const w = def[5] * D2R, Om = def[4] * D2R;
  const x = a * (Math.cos(E) - ecc), z = -b * Math.sin(E);
  let X = x * Math.cos(w) + z * Math.sin(w), Z = -x * Math.sin(w) + z * Math.cos(w), Y = 0;
  const ci = Math.cos(def[3] * D2R), si = Math.sin(def[3] * D2R);
  // Three.js Euler Rx then Ry, rotation order YXZ:
  //   Rx: y' = y cos i - z sin i,  z' = y sin i + z cos i
  //   Ry: x' = x cos O + z sin O,  z' = -x sin O + z cos O
  const Y1 = Y * ci - Z * si, Z1 = Y * si + Z * ci;
  const X2 = X * Math.cos(Om) + Z1 * Math.sin(Om), Z2 = -X * Math.sin(Om) + Z1 * Math.cos(Om);
  return [X2, Y1, Z2];
}

/* ---- textbook convention: perifocal -> Rz(inc) about X -> Rz(node) about Z, z-up ---- */
function refPos(def, E) {
  const [name, au, ecc] = def;
  const a = auToUnit(au), b = a * Math.sqrt(1 - ecc * ecc);
  const w = def[5] * D2R, Om = def[4] * D2R, inc = def[3] * D2R;
  const p = Math.cos(E) - ecc, q = Math.sqrt(1 - ecc * ecc) * Math.sin(E);
  let x = a * (p * Math.cos(w) - q * Math.sin(w));
  let y = a * (p * Math.sin(w) + q * Math.cos(w));
  let z = 0;
  const y2 = y * Math.cos(inc) - z * Math.sin(inc), z2 = y * Math.sin(inc) + z * Math.cos(inc);
  y = y2; z = z2;
  const x3 = x * Math.cos(Om) - y * Math.sin(Om), y3 = x * Math.sin(Om) + y * Math.cos(Om);
  return [x3, z2, -y3];   // z-up -> app's y-up frame
}

/* ---- default camera in the app ---- */
const W = 900, H = 560, fov = 46, dist = 210, pol = 1.06, az = 2.35;
const sp = Math.sin(pol);
const eye = [dist * sp * Math.cos(az), dist * Math.cos(pol), dist * sp * Math.sin(az)];
const f = eye.map(v => -v / dist);                        // look at origin
let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; // cross(f, up=(0,1,0))
const rn = Math.hypot(...r); r = r.map(v => v / rn);
const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
const tan = Math.tan(fov * 0.5 * D2R), aspect = W / H;
function project(X) {
  const v = X.map((c, i) => c - eye[i]);
  const d = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (d <= 0) return null;
  const cx = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / d / (tan * aspect);
  const cy = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / d / tan;
  return [(cx * 0.5 + 0.5) * W, (0.5 - cy * 0.5) * H];
}

console.log('planet    max ecl. lat   tilt vs textbook   px lift off ecliptic @ default camera');
let worst = 0;
for (const def of P) {
  let maxLat = 0, maxLift = 0, maxE = 0;
  for (let i = 0; i < 20000; i++) {
    const E = (i / 20000) * TAU;
    const A = appPos(def, E), R = refPos(def, E);
    const dot = (A[0] * R[0] + A[1] * R[1] + A[2] * R[2]) /
                (Math.hypot(...A) * Math.hypot(...R));
    worst = Math.max(worst, Math.acos(Math.min(1, dot)) / D2R);
    const lat = Math.asin(A[1] / Math.hypot(...A));
    if (Math.abs(lat) > maxLat) { maxLat = Math.abs(lat); maxE = E; }
  }
  const A = appPos(def, maxE);
  const rad = Math.hypot(...A);
  const flat = [A[0] / rad * rad, 0, A[2] / rad * rad];     // same point flattened onto y = 0
  const pa = project(A), pf = project(flat);
  if (pa && pf) maxLift = Math.hypot(pa[0] - pf[0], pa[1] - pf[1]);
  console.log(
    def[0].padEnd(9),
    (maxLat / D2R).toFixed(3).padStart(9) + '\u00b0',
    (def[3]).toFixed(3).padStart(12) + '\u00b0',
    maxLift.toFixed(1).padStart(16) + ' px'
  );
}
console.log('\nmax angular disagreement app vs textbook convention:', worst.toExponential(2), 'deg');

/* --- for contrast: what a broken model would look like ------------------- */
const rz = (q, a) => { const c = Math.cos(a), s = Math.sin(a); return [q[0]*c + q[2]*s, q[1], -q[0]*s + q[2]*c]; };
const rx = (q, a) => { const c = Math.cos(a), s = Math.sin(a); return [q[0], q[1]*c - q[2]*s, q[1]*s + q[2]*c]; };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = q => { const l = Math.hypot(...q); return q.map(v => v/l); };
const ellipsePoint = (def, E) => {
  const a = auToUnit(def[1]), b = a * Math.sqrt(1 - def[2]*def[2]);
  return [a*(Math.cos(E)-def[2]), 0, -b*Math.sin(E)];
};
const planeOf = (p, q) => unit(cross(p, q));
// A plane normal n reads back as: inclination = angle(n, ecliptic pole), node = azimuth of n.
const incOf = n => Math.acos(Math.min(1, Math.abs(n[1]))) / D2R;
const nodeOf = n => ((Math.atan2(n[0], n[2]) / D2R) + 360) % 360;
const angle = (a, b) => Math.acos(Math.min(1, Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))) / D2R;

// helper self-test: a plane tilted 7° tilted then rolled 30° about the pole
const n0 = rx([0, 1, 0], 7 * D2R);
if (Math.abs(angle(n0, rz(n0, 30 * D2R)) - 3.615) > 0.02) throw new Error('helper self-test failed');

let sanity = 0, worst1 = 0, worst2 = 0;
console.log('\nplane orientation read back from the geometry (i = tilt from the ecliptic, Ω = node):');
console.log('planet      as drawn          node applied before tilt      30 deg arbitrary roll');
for (const def of P) {
  const [name, , , inc, node, peri] = def;
  const good = planeOf(appPos(def, 0), appPos(def, Math.PI / 2));
  sanity = Math.max(sanity, Math.abs(incOf(good) - inc), Math.abs(nodeOf(good) - node));

  // bug 1: node rotation applied *before* the inclination, so the tilt happens about the
  // world x axis instead of the node line — right amount of tilt, wrong plane.
  const w1 = planeOf(
    rx(rz(rz(ellipsePoint(def, 0), peri * D2R), node * D2R), inc * D2R),
    rx(rz(rz(ellipsePoint(def, Math.PI / 2), peri * D2R), node * D2R), inc * D2R));
  // bug 2: an arbitrary per-planet roll (orbitGroup.rotation.z) "for visual variety".
  const w2 = planeOf(rz(appPos(def, 0), 30 * D2R), rz(appPos(def, Math.PI / 2), 30 * D2R));

  worst1 = Math.max(worst1, angle(good, w1)); worst2 = Math.max(worst2, angle(good, w2));
  const cell = (n, ref) => (incOf(n).toFixed(2) + '° / ' + nodeOf(n).toFixed(1) + '°' +
    (angle(good, n) > 0.01 ? '  (' + angle(good, n).toFixed(2) + ' off)' : '')).padStart(24);
  console.log(name.padEnd(9), (incOf(good).toFixed(2) + '° / ' + nodeOf(good).toFixed(1) + '°').padStart(15), cell(w1), cell(w2));
}
console.log('\napp reads back i and Ω exactly (worst |drawn − catalog|:', sanity.toExponential(2), 'deg)');
console.log('worst plane error, node applied before the inclination:', worst1.toFixed(2) + '°');
console.log('worst plane error, a 30° arbitrary per-planet roll:    ', worst2.toFixed(2) + '°');
