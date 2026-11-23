/* ---- consolidated self-test (injected into a scratch copy only) ---- */
const CHECKS = [];
const ok = (name, pass, detail) => CHECKS.push({ name, pass: !!pass, detail: detail === undefined ? '' : detail });

function __screenOf(b) {
  const v = b.worldPos.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
function __pe(type, x, y) {
  return new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: x, clientY: y, bubbles: true, cancelable: true });
}
/* The catalog gives planets a mean anomaly at J2000 and the named asteroids a
   perihelion passage; both are the same anomaly once converted, so one
   reference can serve either. */
function __meanAnomalyDeg(def) {
  if (def.m0 !== undefined) return def.m0;
  return 360 * (JD_J2000 - def.tpJD) / def.periodDays;
}
/* Latitude profile of the belt swarm, from the positions it was last drawn at. */
function __beltLat() {
  let max = 0, sum = 0, n = 0, over5 = 0, over12 = 0;
  for (let i = 0; i < BELT_COUNT; i++) {
    const x = beltPos[i * 3], y = beltPos[i * 3 + 1], z = beltPos[i * 3 + 2];
    /* Skip a rock sitting on the Sun itself, relative to its own shell so the guard
       does not move when the distance spread moves. */
    if (Math.hypot(x, y, z) < 0.2 * beltMeta[i].radius) continue;
    const rho = Math.hypot(x, z);
    const lat = Math.atan2(Math.abs(y), rho);
    max = Math.max(max, lat); sum += lat; n++;
    if (lat > 5 * Math.PI / 180) over5++;
    if (lat > 12 * Math.PI / 180) over12++;
  }
  const D = Math.PI / 180;
  return { max: max / D, mean: sum / n / D, over5, over12 };
}
/* The head-up distance readout, parsed through the app's thousands separators
   (fmt() renders 1 134 AU as "1,134.00", which parseFloat alone would read as 1). */
function __shownAU() {
  const m = camOutEl.textContent.match(/([-+]?[\d, ]+\.?\d*)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
}

/* Mean distance of the drawn belt from the Sun, against the shell it was told to fill. */
function __beltShell() {
  let got = 0, want = 0;
  for (let i = 0; i < BELT_COUNT; i++) {
    got += Math.hypot(beltPos[i * 3], beltPos[i * 3 + 1], beltPos[i * 3 + 2]);
    want += beltMeta[i].radius;
  }
  return { got: got / BELT_COUNT, want: want / BELT_COUNT };
}
/* Furthest drawn orbit vertex, and the radius of the ecliptic grid. */
function __orbitReach(b) {
  const p = b.line.geometry.attributes.position;
  let max = 0;
  for (let i = 0; i < p.count; i++) max = Math.max(max, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
  return max;
}
/* Both ends of the drawn ellipse: an orbit stretched out of shape loses one of them. */
function __orbitSpan(b) {
  const p = b.line.geometry.attributes.position;
  let max = 0, min = Infinity;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
    max = Math.max(max, r); min = Math.min(min, r);
  }
  return { max, min };
}
function __gridRadius() {
  const p = eclipticGrid.geometry.attributes.position;
  let max = 0;
  for (let i = 0; i < p.count; i++) max = Math.max(max, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
  return max;
}
function __snap(dist, pol) {
  cam.dist = camSmooth.dist = dist;
  cam.pol = camSmooth.pol = pol;
  camSmooth.target.set(0, 0, 0); cam.tx = cam.ty = cam.tz = 0;
  updateCamera(0.016); updateBodies(); updateLabels();
}
function __pixels() {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let sum = 0, hot = 0, mid = 0, dim = 0;
  for (let i = 0; i < w * h; i++) {
    const l = 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2];
    sum += l;
    if (l > 235) hot++; else if (l > 45) mid++; else if (l > 12) dim++;
  }
  const n = w * h;
  return { mean: sum / n, hotPct: 100 * hot / n, midPct: 100 * mid / n, dimPct: 100 * dim / n, blackPct: 100 * (n - hot - mid - dim) / n };
}
function __labelState() {
  const vis = bodies.filter(b => parseFloat(b.labelEl.style.opacity) > 0.01);
  const rects = vis.map(b => { const r = b.labelEl.getBoundingClientRect(); return { n: b.def.name, x: r.x, y: r.y, w: r.width, h: r.height }; });
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) overlaps++;
  }
  const outside = rects.filter(r => r.x < -2 || r.y < -2 || r.x + r.w > window.innerWidth + 2 || r.y + r.h > window.innerHeight + 2).map(r => r.n);
  return { visible: vis.length, total: bodies.length, overlaps, outside };
}

setTimeout(() => {
  try {
    const jupiter = bodies.find(b => b.def.name === 'Jupiter');
    const earth = bodies.find(b => b.def.name === 'Earth');
    const sun = bodies.find(b => b.isSun);

    /* geometry / dynamics */
    bodies.forEach(b => {
      if (b.isSun) return;
      const d = b.worldPos.length();
      ok('orbit-radius ' + b.def.name, Math.abs(d - b.a) < b.a * 0.35, d.toFixed(2) + ' vs ' + b.a.toFixed(2));
    });
    ok('kepler ordering', CATALOG[0].periodDays < CATALOG[4].periodDays && CATALOG[4].periodDays < CATALOG[7].periodDays);

    const ePos0 = earth.worldPos.clone();
    const jPos0 = jupiter.worldPos.clone();
    const daysBefore = days;
    days += 200; updateBodies();
    const dEarth = ePos0.angleTo(earth.worldPos), dJup = jPos0.angleTo(jupiter.worldPos);
    ok('orbit advances with time', dEarth > 0.5, 'Earth swept ' + dEarth.toFixed(2) + ' rad / 200 d');
    ok('inner planets sweep faster', dEarth > dJup * 3, 'Earth ' + dEarth.toFixed(2) + ' vs Jupiter ' + dJup.toFixed(2));
    days = daysBefore; updateBodies();
    ok('time model reversible', earth.worldPos.distanceTo(ePos0) < 1e-6);
    ok('belt populated', BELT_COUNT > 1000 && beltPos.some(v => v !== 0), 'asteroids ' + BELT_COUNT);

    /* ---- orbital orientation: real i, Ω, ω — checked against an independent
       Keplerian reference written with the textbook z-up convention ---- */
    const D2R = Math.PI / 180;
    const __planeOf = b => new THREE.Vector3(0, 1, 0)
      .applyQuaternion(b.orbitGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const __tiltOf = b => Math.acos(Math.min(1, Math.abs(__planeOf(b).y))) / D2R;
    function __refUnit(def, d) {                 /* z-up reference -> our y-up frame: (x,y,z)->(x,z,-y) */
      const e = def.ecc, TAU2 = 2 * Math.PI;
      const M = (((__meanAnomalyDeg(def) * D2R + TAU2 * (d / def.periodDays)) % TAU2) + TAU2) % TAU2;
      let E = e < 0.8 ? M : Math.PI;
      for (let i = 0; i < 14; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const p = Math.cos(E) - e, q = Math.sqrt(1 - e * e) * Math.sin(E);
      const cw = Math.cos(def.peri * D2R), sw = Math.sin(def.peri * D2R);
      let x = p * cw - q * sw, y = p * sw + q * cw, z = 0;          /* Rz(ω) */
      const ci = Math.cos(def.inc * D2R), si = Math.sin(def.inc * D2R);
      const y2 = y * ci - z * si, z2 = y * si + z * ci; y = y2; z = z2;   /* Rx(i) */
      const cO = Math.cos(def.node * D2R), sO = Math.sin(def.node * D2R);
      const x3 = x * cO - y * sO, y3 = x * sO + y * cO;             /* Rz(Ω) */
      return { v: new THREE.Vector3(x3, z2, -y3).normalize(), z2, r: Math.hypot(x3, y3, z2) };
    }
    for (const b of bodies) {
      if (b.isSun) continue;
      const def = b.def;
      const ref = __refUnit(def, days);
      const angDir = Math.acos(Math.min(1, b.worldPos.clone().normalize().dot(ref.v))) / D2R;
      ok('heliocentric direction ' + def.name, angDir < 1e-5,
         angDir === 0 ? 'exact' : angDir.toExponential(1) + '° off real ephemeris');
      const tilt = __tiltOf(b);
      ok('plane tilt ' + def.name, Math.abs(tilt - def.inc * tiltScale) < 1e-6,
         tilt.toFixed(6) + '° = i ' + def.inc + '° × viewer ' + tiltScale + '×');
      const n = __planeOf(b);
      const nodeDir = new THREE.Vector3(0, 1, 0).cross(n).normalize();
      const wantNode = new THREE.Vector3(Math.cos(def.node * D2R), 0, -Math.sin(def.node * D2R));
      const angNode = Math.acos(Math.min(1, nodeDir.dot(wantNode))) / D2R;
      ok('ascending node ' + def.name, angNode < 1e-5,
         (angNode === 0 ? 'exact' : angNode.toExponential(1)) + '° (Ω ' + def.node + '°)');
      b.line.updateMatrixWorld(true);
      const attr = b.line.geometry.attributes.position, probe = new THREE.Vector3();
      let off = 0;
      for (let i = 0; i < attr.count; i += 7) {
        probe.fromBufferAttribute(attr, i).applyMatrix4(b.line.matrixWorld);
        off = Math.max(off, Math.abs(probe.dot(n)));
      }
      ok('drawn orbit lies in its plane ' + def.name, off < 1e-6 * b.a, 'out-of-plane ' + off.toExponential(1));
    }
    ok('earth orbit defines the ecliptic',
       Math.abs(earth.orbitGroup.rotation.x) < 1e-6 && earth.orbitGroup.rotation.y === 0 && earth.orbitGroup.rotation.z === 0,
       'i ' + earth.def.inc + '° Ω ' + earth.def.node + '°');
    const tilts = bodies.filter(b => !b.isSun && !b.isRock).map(b => ({ n: b.def.name, t: __tiltOf(b) }));
    ok('mercury is the most inclined planet',
       tilts.every(t => t.t <= __tiltOf(bodies.find(b => b.def.name === 'Mercury')) + 1e-9) &&
       tilts.filter(t => t.t > 1).length === 6,
       tilts.map(t => t.n[0] + t.t.toFixed(2)).join(' '));
    ok('named asteroids keep their own inclinations',
       Math.abs(__tiltOf(bodies.find(b => b.def.name === 'Pallas')) - 34.9) < 1e-4 &&
       Math.abs(__tiltOf(bodies.find(b => b.def.name === 'Vesta')) - 7.14) < 1e-4,
       'Pallas 34.9° · Vesta 7.14°, straight from the Small-Body Database');
    ok('orbit planes are not randomised',
       bodies.every(b => b.isSun || b.orbitGroup.rotation.z === 0), 'all orbit groups use Rx(i) only');
    btnTilt.click(); applyTiltScale(); updateBodies();
    const boosted = __tiltOf(bodies.find(b => b.def.name === 'Mercury'));
    ok('tilt viewer exaggerates faithfully', Math.abs(boosted - 7.004979 * 5) < 1e-5, boosted.toFixed(4) + '° = 5× i');
    btnTilt.click(); btnTilt.click();
    ok('tilt viewer returns to true inclinations',
       tiltScale === 1 && Math.abs(__tiltOf(bodies.find(b => b.def.name === 'Mercury')) - 7.004979) < 1e-6,
       'Mercury ' + __tiltOf(bodies.find(b => b.def.name === 'Mercury')).toFixed(4) + '°');
    updateBelt(days);
    const beltLat = __beltLat();
    ok('asteroid belt hugs the ecliptic', beltLat.mean < 6 && beltLat.max <= 24.001,
       'mean latitude ' + beltLat.mean.toFixed(2) + '° · max ' + beltLat.max.toFixed(2) +
       '°, inside the 24° belt envelope');

    /* ---- the belt is a 3D swarm, not a tilted pinwheel ---- */
    // Failing version: scatter height but reuse one ascending node for every asteroid.
    // Discriminator: <y^2 cos 2lon> over inclined bodies. Nodes spread over 360° makes the
    // distribution rotationally symmetric -> 0. A single shared node -> about -0.1.
    const bp = beltPos;
    let hi = 0, nodeSum = 0, nodeWeight = 0;
    for (let i = 0; i < bp.length; i += 3) {
      const x = bp[i], y = bp[i + 1], z = bp[i + 2];
      const rho = Math.hypot(x, z);
      if (rho < 20) continue;
      const lat = Math.atan2(Math.abs(y), rho);
      if (lat > 5 * D2R) hi++;
      if (lat > 1 * D2R) { nodeSum += y * y * Math.cos(2 * Math.atan2(-z, x)); nodeWeight += y * y; }
    }
    const nodeStat = nodeSum / nodeWeight;
    ok('belt inclination spread is real', hi > 120 && beltLat.max > 15 && beltLat.over12 > 40,
       hi + ' of ' + BELT_COUNT + ' above 5° latitude, ' + beltLat.over12 + ' above 12°, max '
       + beltLat.max.toFixed(2) + '° (resonance-pumped belt tops out at 24°)');
    ok('belt ascending nodes are distributed, not shared', Math.abs(nodeStat) < 0.05,
       '<y² cos 2λ> = ' + nodeStat.toFixed(4) + ' (0 = spread nodes, ≈ -0.1 = one shared node)');

    // The exaggeration viewer must fan the belt out too, and the belt caps itself at 4×
    // so it never wraps over the pole.
    const __beltHeights = scale => {
      tiltScale = scale; applyTiltScale(); updateBelt(days);
      const out = [];
      for (let i = 0; i < BELT_COUNT; i++) out.push(Math.abs(beltPos[i * 3 + 1]));
      return out;
    };
    const flatY = __beltHeights(1), pumpedY = __beltHeights(4), cappedY = __beltHeights(5);
    let flatSum = 0, pumpedSum = 0, cappedSum = 0, moved = 0;
    for (let i = 0; i < BELT_COUNT; i++) {
      flatSum += flatY[i]; pumpedSum += pumpedY[i]; cappedSum += cappedY[i];
      if (pumpedY[i] !== cappedY[i]) moved++;
    }
    const beltGain = pumpedSum / flatSum, cappedGain = cappedSum / flatSum;
    tiltScale = 1; applyTiltScale(); updateBelt(days);
    ok('belt follows the tilt viewer', beltGain > 3 && beltGain < 4.05,
       'mean swarm height at ×4 is ' + beltGain.toFixed(3) + '× the flat case (1.00 would mean the belt ignores the viewer)');
    ok('belt tilt exaggeration is capped at 4×', moved === 0,
       '×5 moves ' + moved + ' of ' + BELT_COUNT + ' rocks: mean height ' + beltGain.toFixed(3)
       + '× flat at ×4 against ' + cappedGain.toFixed(3) + '× at ×5');

    /* ---- ecliptic reference grid ---- */
    ok('ecliptic reference grid present', eclipticGrid.isLineSegments === true && eclipticGrid.visible === true);
    const gp = eclipticGrid.geometry.attributes.position.array;
    let flat = true;
    for (let i = 1; i < gp.length; i += 3) if (gp[i] !== 0) flat = false;
    ok('ecliptic grid is perfectly flat', flat, gp.length / 3 + ' vertices at y = 0');
    ok('ecliptic grid defines the plane every orbit is measured from',
       eclipticGrid.matrixWorld.elements[9] === 0 && eclipticGrid.matrixWorld.elements[5] === 1,
       'grid normal = +Y = ecliptic pole');
    const __lum = () => { for (let i = 0; i < 60; i++) updateCamera(0.016); renderer.render(scene, camera); return __pixels().mean; };
    const lumGridOn = __lum();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    const lumGridOff = __lum();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    ok('grid toggles with G key', eclipticGrid.visible === true && btnGrid.classList.contains('on'),
       'mean luminance on ' + lumGridOn.toFixed(4) + ' off ' + lumGridOff.toFixed(4));
    ok('ecliptic grid stays subtle', Math.abs(lumGridOn - lumGridOff) < 0.55,
       'added luminance ' + (lumGridOn - lumGridOff).toFixed(4));
    let starCount = 0, starSystems = 0, twinklers = 0, otherPoints = 0;
    scene.traverse(o => {
      if (!o.isPoints) return;
      const u = o.material.uniforms;
      if (u && u.uTime) {
        starSystems++;
        starCount += o.geometry.attributes.position.count;
        const g = o.geometry.attributes;
        if (g.aPhase && g.aSpeed && g.aSize) twinklers++;
      } else otherPoints++;
    });
    ok('starfield present', starSystems >= 2 && starCount > 4000, 'systems ' + starSystems + ' stars ' + starCount);
    ok('twinkling star layer', twinklers === starSystems && twinklers >= 2, 'twinklers ' + twinklers + '/' + starSystems);
    ok('asteroid points layer', otherPoints >= 1, 'other point layers ' + otherPoints);

    /* picking: planet */
    const jp = __screenOf(jupiter);
    canvas.dispatchEvent(__pe('pointermove', jp.x, jp.y));
    ok('hover raycast hits Jupiter', hovered === jupiter, 'screen ' + Math.round(jp.x) + ',' + Math.round(jp.y));
    ok('tooltip shown', tipEl.classList.contains('show') && !/NaN/.test(tipEl.style.top), 'top ' + tipEl.style.top);
    canvas.dispatchEvent(__pe('pointerdown', jp.x, jp.y));
    canvas.dispatchEvent(__pe('pointerup', jp.x, jp.y));
    ok('click selects', selected === jupiter, selected && selected.def.name);
    ok('card visible', card.classList.contains('show'));
    ok('card name', els.name.textContent === 'Jupiter');
    ok('card stats filled', [els.dia, els.rel, els.dist, els.year, els.day, els.moons].every(e => e.textContent.trim().length > 2));
    ok('card fact populated', els.fact.textContent.length > 60);
    ok('following engaged', following === jupiter && cam.dist > MIN_DIST, 'dist ' + cam.dist.toFixed(1));
    deselect(); hideTip();

    /* picking: the Sun */
    __snap(210, 1.06);
    const sp = __screenOf(sun);
    canvas.dispatchEvent(__pe('pointerdown', sp.x, sp.y));
    canvas.dispatchEvent(__pe('pointerup', sp.x, sp.y));
    ok('sun clickable (same record)', selected === sun, els.name.textContent);
    ok('sun focus keeps camera finite', Number.isFinite(cam.dist) && Number.isFinite(camera.position.x), 'dist ' + cam.dist.toFixed(1));
    canvas.dispatchEvent(__pe('pointermove', sp.x, sp.y));
    ok('sun hover tooltip sane', tipEl.classList.contains('show') && !/NaN/.test(tipEl.style.top), 'top ' + tipEl.style.top);
    deselect(); hideTip();

    /* camera interaction */
    const az0 = cam.az, pol0 = cam.pol;
    canvas.dispatchEvent(__pe('pointerdown', 200, 220));
    canvas.dispatchEvent(__pe('pointermove', 320, 270));
    canvas.dispatchEvent(__pe('pointerup', 320, 270));
    ok('drag rotates', Math.abs(cam.az - az0) > 0.1 && Math.abs(cam.pol - pol0) > 0.05,
       'az ' + (cam.az - az0).toFixed(3) + ' pol ' + (cam.pol - pol0).toFixed(3));
    ok('drag does not select', selected === null);
    const d0 = cam.dist;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, bubbles: true, cancelable: true }));
    ok('wheel zoom in', cam.dist < d0, d0.toFixed(1) + ' -> ' + cam.dist.toFixed(1));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 60000, bubbles: true, cancelable: true }));
    ok('wheel zoom out clamped', cam.dist <= MAX_DIST + 1e-6 && cam.dist >= MIN_DIST - 1e-6, cam.dist.toFixed(1));
    ok('camera stays finite', Number.isFinite(camera.position.x) && Number.isFinite(camera.position.y) && Number.isFinite(camera.position.z));

    /* controls */
    speedInput.value = '12'; speedInput.dispatchEvent(new Event('input'));
    ok('speed slider live', speed === 12 && !paused && statusText.textContent === 'LIVE');
    btnPause.click();
    ok('pause holds time', paused && statusText.textContent === 'HELD' && btnPause.textContent === 'Resume');
    speedInput.value = '0'; speedInput.dispatchEvent(new Event('input'));
    ok('zero speed readout', /paused/.test(speedOut.textContent));
    btnPause.click();
    ok('resume restores speed', !paused && speed === 12 && speedInput.value === '12' && statusText.textContent === 'LIVE', 'speed ' + speed);
    btnOrbits.click();
    const orbitsOff = bodies.every(b => !b.line || b.line.visible === false);
    btnOrbits.click();
    ok('orbit toggle hides and restores', orbitsOff && bodies.every(b => !b.line || b.line.visible === true));
    btnLabels.click(); updateLabels();
    const labelsOff = bodies.every(b => b.labelEl.style.opacity === '0');
    btnLabels.click(); updateLabels();
    ok('labels toggle', labelsOff && bodies.some(b => parseFloat(b.labelEl.style.opacity) > 0));
    const chips = document.querySelectorAll('.chip').length;    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    ok('number key focuses planet', selected === earth && following === earth, selected && selected.def.name);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const frozenAt = days;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('escape closes card', !card.classList.contains('show'));
    ok('focus chips present', chips === 13, 'chips ' + chips);
    ok('paused freezes time', Math.abs(days - frozenAt) < 1e-9);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    btnReset.click();
    ok('reset camera', following === null && Math.abs(cam.dist - 210) < 1e-6 && cam.tx === 0 && cam.ty === 0 && cam.tz === 0, 'dist ' + cam.dist);
    ok('loop running live', !paused && speed > 0 && frames >= 1, 'frames ' + frames);
    ok('render calls sane', renderer.info.render.calls > 8 && renderer.info.render.calls < 130, 'calls ' + renderer.info.render.calls);
    ok('scene populated', renderer.info.memory.geometries > 25, 'geometries ' + renderer.info.memory.geometries);

    /* rendering + label legibility across zoom levels */
    const views = [];
    for (const dist of [540, 210, 120, 55, 24]) {
      deselect(); __snap(dist, 1.06); renderer.render(scene, camera); updateLabels();
      const px = __pixels(), lab = __labelState();
      views.push({ dist, mean: +px.mean.toFixed(2), hotPct: +px.hotPct.toFixed(3), litPct: +(px.midPct + px.dimPct).toFixed(1),
        labels: lab.visible + '/' + lab.total, overlaps: lab.overlaps, outside: lab.outside });
      ok('frame lit at dist ' + dist, px.mean > 2 && px.hotPct < 1.5,
         'mean ' + px.mean.toFixed(2) + ' hot ' + px.hotPct.toFixed(3) + '% black ' + px.blackPct.toFixed(1) + '%');
      ok('no label overlaps at dist ' + dist, lab.overlaps === 0, JSON.stringify(lab));
      ok('labels inside viewport at dist ' + dist, lab.outside.length === 0, JSON.stringify(lab.outside));
      ok('label coverage at dist ' + dist, lab.visible >= (dist > 400 ? 3 : 4), lab.visible + '/' + lab.total);
    }
    const jupView = (() => { selectBody(jupiter, true); for (let i = 0; i < 120; i++) updateCamera(0.016); renderer.render(scene, camera); updateLabels(); const p = __screenOf(jupiter); const px = __pixels(); const lab = __labelState(); deselect(); return { dist: +camSmooth.dist.toFixed(1), onScreen: p.x > 0 && p.x < window.innerWidth && p.y > 0 && p.y < window.innerHeight, mean: +px.mean.toFixed(2), labels: lab.visible + '/' + lab.total, overlaps: lab.overlaps }; })();
    ok('follow view keeps target on screen', jupView.onScreen, JSON.stringify(jupView));
    ok('follow view renders', jupView.mean > 2 && jupView.overlaps === 0, JSON.stringify(jupView));

    /* ---- the label you point at always survives decluttering ---- */
    // Crowding is amplified by inflating every body's screen radius: the label fans then
    // collapse onto the viewport edges, so culling is guaranteed to happen. Without that
    // inflation the test would pass vacuously — hence the 'exercised' assertion below.
    const __onScreen = b => { const v = b.worldPos.clone().project(camera); return v.z <= 1 && Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02; };
    const __visible = b => b.labelEl && parseFloat(b.labelEl.style.opacity || '0') > 0;
    let culledHover = 0, culledSelect = 0, crowded = 0;
    const labelLayer = document.getElementById('labels');
    const styleSave = labelLayer.style.fontSize;
    labelLayer.style.fontSize = '74px';           // labels become ~7× wider than the viewport
    for (const b of bodies) { b._rSave = b.r; b._lw = 0; b._lh = 0; }
    for (const [dist, pol] of [[540, 1.06], [210, 1.06], [55, 1.06], [900, 0.18], [1050, 0.04]]) {
      __snap(dist, pol);
      for (const b of bodies) b.r = b._rSave * 4;
      for (const b of bodies) {
        if (!b.labelEl) continue;
        if (!__onScreen(b)) continue;
        hovered = null; selected = null; updateLabels();
        if (!__visible(b)) crowded++;
        hovered = b; updateLabels();
        if (!__visible(b)) culledHover++;
        selected = b; hovered = null; updateLabels();
        if (!__visible(b)) culledSelect++;
      }
      hovered = null; selected = null; updateLabels();
    }
    for (const b of bodies) { b.r = b._rSave; b._lw = 0; b._lh = 0; }
    labelLayer.style.fontSize = styleSave;
    ok('decluttering is actually exercised', crowded >= 10, crowded + ' labels culled when nothing is hovered');
    ok('hovered label is never decluttered away', culledHover === 0,
       culledHover + ' hovered labels hidden out of ' + crowded + ' that would have been');
    ok('selected label is never decluttered away', culledSelect === 0, culledSelect + ' selected labels hidden');

    /* ---- the Distance spread setting -------------------------------------
       Scene distances are a compressed power of the real semi-major axis so the
       inner system stays legible. The setting changes that exponent and nothing
       else: the drawn ellipses, the belt shell, the grid and the framing follow
       it, while every real number the app reports stays what the ephemeris gave.
       Failing versions: a slider that only moves a readout; a rescale that
       stretches old geometry; a rescale that also touches the angles. */
    const planetsOnly = bodies.filter(b => !b.isSun && !b.isRock);
    const mercuryB = bodies.find(b => b.def.name === 'Mercury');
    const neptuneB = bodies.find(b => b.def.name === 'Neptune');
    const earthB = bodies.find(b => b.def.name === 'Earth');
    const outerAu = Math.max(...CATALOG.map(c => c.au));
    const outerB = planetsOnly.find(b => Math.abs(b.def.au - outerAu) < 1e-12);
    const auRatio = outerB.def.au / mercuryB.def.au;
    const unitRatio = () => neptuneB.a / mercuryB.a;
    const __dir = b => { const p = b.worldPos, n = p.length(); return [p.x / n, p.y / n, p.z / n]; };
    const dirsBefore = bodies.filter(b => !b.isSun).map(__dir);
    const planesBefore = bodies.filter(b => !b.isSun).map(__planeOf);
    const gridAtDefault = __gridRadius();
    const gridRatioDefault = gridAtDefault / auToUnit(outerAu);   /* grid span / outer orbit */
    const fitAtDefault = 210 / auToUnit(outerAu);                 /* overview camera / outer orbit */
    const cardJupiter = (() => { selectBody(jupiter, true); const t = els.dist.textContent; deselect(); return t; })();

    const reachAt = {};
    let earthDrift = 0;
    for (let p = DIST_POWER_MIN; p <= DIST_POWER_MAX + 1e-9; p += DIST_POWER_STEP) {
      setDistancePower(p);
      reachAt[p.toFixed(2)] = unitRatio();
      earthDrift = Math.max(earthDrift, Math.abs(earthB.a - 18 * earthB.def.au));
    }
    ok('Earth orbit is the fixed yardstick at every spread', earthDrift < 1e-9,
       "Earth stays at 18.0 units from a^0.40 to a^1.00");
    ok('lower spread squeezes the outer system inward',
       reachAt['0.40'] < reachAt['0.55'] && reachAt['0.55'] < reachAt['1.00'] &&
       Math.abs(reachAt['1.00'] / auRatio - 1) < 1e-9,
       'Neptune/Mercury ' + reachAt['1.00'].toFixed(1) + ' units = the real AU ratio, '
       + reachAt['0.55'].toFixed(1) + ' at a^0.55, ' + reachAt['0.40'].toFixed(1) + ' at a^0.40');

    setDistancePower(1);
    let worstProportional = 0;
    for (const b of planetsOnly)
      worstProportional = Math.max(worstProportional, Math.abs((b.a / earthB.a) / (b.def.au / earthB.def.au) - 1));
    ok('spread 1.00 is true proportional spacing', worstProportional < 1e-9,
       'Mercury ' + mercuryB.a.toFixed(2) + ' · Neptune ' + neptuneB.a.toFixed(2) + ' units, every orbit ratio'
       + ' matches its AU ratio to ' + worstProportional.toExponential(1));

    let worstApoapsis = 0, worstPeriapsis = 0;
    for (const b of bodies) {
      if (b.isSun || !b.line) continue;
      const span = __orbitSpan(b);
      worstApoapsis = Math.max(worstApoapsis, Math.abs(span.max / (b.a * (1 + b.def.ecc)) - 1));
      worstPeriapsis = Math.max(worstPeriapsis, Math.abs(span.min / (b.a * (1 - b.def.ecc)) - 1));
    }
    ok('orbit lines are re-solved at the new spread, not stretched',
       worstApoapsis < 1e-6 && worstPeriapsis < 1e-6,
       'every drawn line still reaches a(1+e) and a(1−e) at ' + (bodies.length - 1)
       + ' orbits to ' + worstApoapsis.toExponential(1) + ' / ' + worstPeriapsis.toExponential(1)
       + ' (float32 vertex buffers)');

    /* Sweep the control and compare what the scene does against what the distance law
       predicts — computed here in the test from the AU values and the exponent, never
       from the app's own conversion, because a bug in a conversion agrees with itself. */
    const POWERS = [DIST_POWER_MIN, DIST_POWER_DEFAULT, 0.70, DIST_POWER_MAX];
    const lawUnits = (au, p) => 18 * Math.pow(au, p);            // the scene law under test
    const shellWant = p => beltMeta.reduce((s, m) => s + Math.pow(m.au, p), 0) / beltMeta.length * 18;
    const seen = {};
    for (const p of POWERS) {
      setDistancePower(p);
      const lat = __beltLat();
      seen[p.toFixed(2)] = { rocks: __beltShell().got, grid: __gridRadius(), latMax: lat.max, latMean: lat.mean };
    }
    const key = p => p.toFixed(2);

    ok('the belt follows the same distance law as the planets',
       POWERS.every(p => Math.abs(seen[key(p)].rocks / shellWant(p) - 1) < 0.04),
       POWERS.map(p => 'a^' + key(p) + ' mean rock shell ' + seen[key(p)].rocks.toFixed(1)
         + ' u against ' + shellWant(p).toFixed(1) + ' u predicted from 4 600 real au').join(' · '));

    ok('the ecliptic grid keeps its span to the outer orbit at every spread',
       POWERS.every(p => { const r = seen[key(p)].grid / lawUnits(outerAu, p);
         return Math.abs(r / gridRatioDefault - 1) < 2e-3 && r > 1.05 && r < 1.6; }),
       POWERS.map(p => 'a^' + key(p) + ' grid ' + seen[key(p)].grid.toFixed(1) + ' u around a '
         + lawUnits(outerAu, p).toFixed(1) + ' u orbit (' + (seen[key(p)].grid / lawUnits(outerAu, p)).toFixed(3)
         + '×)').join(' · '));

    ok('belt latitudes are untouched by the spread',
       POWERS.every(p => Math.abs(seen[key(p)].latMax - seen['0.55'].latMax) < 1e-4 &&
                         Math.abs(seen[key(p)].latMean - seen['0.55'].latMean) < 1e-4),
       POWERS.map(p => 'a^' + key(p) + ' ' + seen[key(p)].latMean.toFixed(4) + '° mean / '
         + seen[key(p)].latMax.toFixed(3) + '° max').join(' · ') + ' — identical to 1e-4° (float32 floor)'),

    resetView();
    ok('reset frames the system at whatever spread is set',
       Math.abs(cam.dist / lawUnits(outerAu, distPower) - fitAtDefault) < 1e-6 && cam.dist <= MAX_DIST,
       'camera ' + cam.dist.toFixed(1) + ' units from the Sun against an outer orbit at '
       + lawUnits(outerAu, distPower).toFixed(1));

    /* A spread change must not throw the view you are looking at. Sit in the overview,
       change the setting four times without touching the camera, and project the outer
       orbit through the live camera each time: the same arc of the system has to land on
       the same arc of the frame. Ratio alone is not proof — the projection is. */
    const __frameReach = b => {
      scene.updateMatrixWorld(true);
      const attr = b.line.geometry.attributes.position, v = new THREE.Vector3();
      let far = 0;
      for (let i = 0; i < attr.count; i += 3) {
        v.set(attr.getX(i), attr.getY(i), attr.getZ(i));
        b.orbitGroup.localToWorld(v); v.project(camera);
        far = Math.max(far, Math.abs(v.x), Math.abs(v.y));
      }
      return far;
    };
    resetView();
    for (let i = 0; i < 90; i++) updateCamera(0.016);
    const framed = {};
    for (const p of [DIST_POWER_MIN, DIST_POWER_DEFAULT, 0.70, DIST_POWER_MAX]) {
      setDistancePower(p);
      for (let i = 0; i < 90; i++) updateCamera(0.016);
      framed[p.toFixed(2)] = { reach: __frameReach(outerB), fit: cam.dist / auToUnit(outerAu), dist: cam.dist };
    }
    const reaches = Object.values(framed).map(f => f.reach), fits = Object.values(framed).map(f => f.fit);
    ok('the view you are looking at survives a spread change',
       Math.max(...reaches) - Math.min(...reaches) < 0.02 &&
       Math.max(...fits) - Math.min(...fits) < 1e-6,
       Object.keys(framed).map(k => 'a^' + k + ' cam ' + framed[k].dist.toFixed(0)).join(' · ') +
       ' \u00b7 outer orbit reaches ' + reaches.map(r => r.toFixed(2)).join(' / ') + ' of the frame');

    /* Park the overview camera at a fixed 300 units from the Sun at every spread and
       read what the head-up display claims in AU. The expectation is computed here from
       the pin (18 u = 1 au) and the exponent, so a readout that keeps inverting the
       default exponent — or reports scene units — fails. */
    const readoutAt = {};
    for (const p of POWERS) {
      setDistancePower(p);
      resetView();
      cam.dist = camSmooth.dist = 300;
      cam.pol = camSmooth.pol = 1.06; camSmooth.target.set(0, 0, 0); cam.tx = cam.ty = cam.tz = 0;
      for (let i = 0; i < 40; i++) updateCamera(0.016);
      updateReadouts();
      readoutAt[key(p)] = __shownAU();
    }
    ok('the AU readout inverts the live spread, not a hard-coded one',
       POWERS.every(p => Math.abs(readoutAt[key(p)] / Math.pow(300 / 18, 1 / p) - 1) < 0.02),
       POWERS.map(p => 'a^' + key(p) + ' reads ' + readoutAt[key(p)].toFixed(1)
         + ' au at 300 u, ' + Math.pow(300 / 18, 1 / p).toFixed(1) + ' au expected').join(' · '));

    setDistancePower(DIST_POWER_MAX);
    cam.dist = camSmooth.dist = 18 * outerAu;                 /* Neptune's own orbit at true spacing */
    camSmooth.target.set(0, 0, 0); cam.tx = cam.ty = cam.tz = 0;
    for (let i = 0; i < 12; i++) updateCamera(0.016);
    updateReadouts();
    const auShown = __shownAU();
    ok('parked on Neptune at true spacing the readout says Neptune', Math.abs(auShown - outerAu) < 0.05,
       'readout ' + auShown + ' AU at ' + cam.dist.toFixed(0) + ' units');

    selectBody(jupiter, true);
    const cardAfter = els.dist.textContent;
    deselect();
    ok('the setting never touches a reported number', cardAfter === cardJupiter,
       'Jupiter card at a^1.00 reads ' + cardAfter.replace(/\s+/g, ' '));

    let dirDrift = 0, planeDrift = 0;
    bodies.filter(b => !b.isSun).forEach((b, i) => {
      const d = __dir(b), p = __planeOf(b), d0 = dirsBefore[i], n0 = planesBefore[i];
      dirDrift = Math.max(dirDrift, Math.abs(d[0] - d0[0]) + Math.abs(d[1] - d0[1]) + Math.abs(d[2] - d0[2]));
      planeDrift = Math.max(planeDrift, Math.abs(p.x - n0.x) + Math.abs(p.y - n0.y) + Math.abs(p.z - n0.z));
    });
    ok('no angle of any orbit moves with the spread', dirDrift < 1e-12 && planeDrift < 1e-12,
       'directions and orbit planes identical before and after: ' + dirDrift.toExponential(1) + ' / ' + planeDrift.toExponential(1));

    /* ---- the size ruler rides the same dial -------------------------------
       Radii are a second calibrated ruler, and the setting moves it too: the km law
       keeps its exponent 0.42 at the built spread and leans toward the true ratio as
       the spread opens, while the whole ruler rises with the frame (span^0.3). Two
       ceilings hold the picture: the star stays inside the innermost orbit, and the
       star stays the largest disc. Every expectation below is re-derived from the raw
       calibration numbers (18 u per au, 4.6 u for the star, km^0.42, 6 371 km), never
       from the page's own size functions, because a bug in a law agrees with itself. */
    const R_KM = 6371, R_GAIN = 1.25, R_EXP = 0.42, R_EXP_TRACK = 0.12,
          R_RULER = 0.3, R_STAR_CAP = 0.9, R_STAR_UNITS = 4.6, R_ROCK_GAIN = 1.8;
    const spanGainAt = p => Math.pow(outerAu, p) / Math.pow(outerAu, DIST_POWER_DEFAULT);
    const rulerAt = p => Math.min(Math.pow(spanGainAt(p), R_RULER),
                                  (R_STAR_CAP * 18 * Math.pow(mercuryB.def.au, p)) / R_STAR_UNITS);
    const sizeAt = (km, p) => R_GAIN * Math.pow(km / R_KM, R_EXP + (p - DIST_POWER_DEFAULT) * R_EXP_TRACK) * rulerAt(p);
    const rockAt = (km, p) => sizeAt(km, p) * R_ROCK_GAIN * Math.pow(spanGainAt(p), 0.7);
    const sunB = bodies.find(b => b.isSun);
    const namedRocks = bodies.filter(b => b.isRock);
    const meanRubble = () => beltMeta.reduce((s, m) => s + m.rU, 0) / beltMeta.length;

    setDistancePower(DIST_POWER_DEFAULT);
    let builtLaw = 0;
    for (const b of bodies) if (!b.isSun)
      builtLaw = Math.max(builtLaw, Math.abs(b.r / (b.isRock ? 1.8 : 1) / (1.25 * Math.pow(b.def.radiusKm / 6371, 0.42)) - 1));
    ok('the built size ruler is the documented km^0.42 ruler',
       builtLaw < 1e-12 && sunB.r === 4.6 && sunGroup.scale.x === 1,
       'every disc within ' + builtLaw.toExponential(1) + ' of 1.25\u00b7(km/6371)^0.42, star ' + sunB.r.toFixed(1)
       + ' u, ' + namedRocks.length + ' named rocks at 1.8\u00d7 that law');

    const sized = {};
    const __mp = new THREE.Vector3(), __mc = new THREE.Vector3(), __ws = new THREE.Vector3();
    for (const p of POWERS) {
      setDistancePower(p);
      scene.updateMatrixWorld(true);
      let worstLaw = 0, tightestOrbitOverDisc = Infinity, largestPlanet = 0, widestRockOverShell = 0;
      for (const b of bodies) {
        if (b.isSun) continue;
        const want = b.isRock ? rockAt(b.def.radiusKm, p) : sizeAt(b.def.radiusKm, p);
        worstLaw = Math.max(worstLaw, Math.abs(b.r / want - 1));
        tightestOrbitOverDisc = Math.min(tightestOrbitOverDisc, b.a / b.r);
        largestPlanet = Math.max(largestPlanet, b.r);
      }
      for (const m of beltMeta) widestRockOverShell = Math.max(widestRockOverShell, m.rU / m.radius);
      earth.pivot.getWorldPosition(__mp);
      earth.moon.getWorldPosition(__mc);
      const moonR = earth.moon.getWorldScale(__ws).x * earth.moon.geometry.parameters.radius;
      sized[key(p)] = {
        law: worstLaw,
        jup: jupiter.r,
        sunR: sunB.r,
        sunShown: sunMesh.getWorldScale(__ws).x * sunMesh.geometry.parameters.radius,
        jupShown: jupiter.mesh.getWorldScale(__ws).x * jupiter.mesh.geometry.parameters.radius,
        ceres: (namedRocks.find(b => b.def.name === 'Ceres') || namedRocks[0]).r,
        rubble: meanRubble(),
        planetOverStar: largestPlanet / sunB.r,
        starOverInnerOrbit: sunB.r / lawUnits(mercuryB.def.au, p),
        orbitOverDisc: tightestOrbitOverDisc,
        rockOverShell: widestRockOverShell,
        dots: beltMat.uniforms.uScale.value / (renderer.domElement.height * 0.5),
        note: scaleNoteEl.textContent,
        moonRatio: earth.moonPivot.scale.x / earth.tiltGroup.scale.x,
        moonClear: __mc.distanceTo(__mp) - moonR - earth.r,
      };
    }
    setDistancePower(DIST_POWER_DEFAULT);

    ok('every body\u2019s radius follows the size law the spread sets',
       POWERS.every(p => sized[key(p)].law < 1e-9),
       POWERS.map(p => 'a^' + key(p) + ' worst disc vs law ' + sized[key(p)].law.toExponential(1)
         + ' (Jupiter ' + sized[key(p)].jup.toFixed(2) + ' u, Ceres ' + sized[key(p)].ceres.toFixed(2) + ' u)').join(' \u00b7 '));

    ok('the size ruler rises with the spread instead of being left behind by the frame',
       POWERS.every((p, i) => i === 0 || sized[key(p)].jup > sized[key(POWERS[i - 1])].jup * 1.02) &&
       sized['1.00'].jup / sized['0.55'].jup > 1.15 &&
       sized['1.00'].rubble / sized['0.55'].rubble > 1.5 &&
       sized['1.00'].ceres > sized['0.55'].ceres,
       'Jupiter ' + sized['0.40'].jup.toFixed(2) + ' \u2192 ' + sized['0.55'].jup.toFixed(2) + ' \u2192 '
       + sized['1.00'].jup.toFixed(2) + ' u, mean belt rock ' + sized['0.55'].rubble.toFixed(3) + ' \u2192 '
       + sized['1.00'].rubble.toFixed(3) + ' u, Ceres ' + sized['0.55'].ceres.toFixed(2) + ' \u2192 '
       + sized['1.00'].ceres.toFixed(2) + ' u as the spread opens a^0.55 \u2192 a^1.00');

    ok('the discs drawn are the discs the ruler claims',
       POWERS.every(p => Math.abs(sized[key(p)].sunShown / sized[key(p)].sunR - 1) < 1e-6 &&
                         Math.abs(sized[key(p)].jupShown / sized[key(p)].jup - 1) < 1e-6),
       POWERS.map(p => 'a^' + key(p) + ' star mesh ' + sized[key(p)].sunShown.toFixed(2)
         + ' u vs ' + sized[key(p)].sunR.toFixed(2) + ' u claimed, Jupiter mesh '
         + sized[key(p)].jupShown.toFixed(2) + ' u vs ' + sized[key(p)].jup.toFixed(2)).join(' \u00b7 '));

    ok('the star stays the largest disc at every spread',
       POWERS.every(p => sized[key(p)].planetOverStar < 0.95),
       POWERS.map(p => 'a^' + key(p) + ' largest planet / star ' + sized[key(p)].planetOverStar.toFixed(3)).join(' \u00b7 '));

    ok('the star never swallows the orbit its planets ride',
       POWERS.every(p => sized[key(p)].starOverInnerOrbit <= 0.9 + 1e-9 && sized[key(p)].starOverInnerOrbit < 1),
       POWERS.map(p => 'a^' + key(p) + ' star ' + (sized[key(p)].starOverInnerOrbit * 100).toFixed(1)
         + '% of Mercury\u2019s orbit').join(' \u00b7 '));

    ok('no disc approaches the orbit it rides',
       POWERS.every(p => sized[key(p)].orbitOverDisc > 5) && sized['1.00'].rockOverShell < 0.05,
       POWERS.map(p => 'a^' + key(p) + ' tightest orbit/disc ' + sized[key(p)].orbitOverDisc.toFixed(1)
         + '\u00d7, widest belt rock ' + (sized[key(p)].rockOverShell * 100).toFixed(2) + '% of its shell').join(' \u00b7 '));

    ok('the belt point layer is compensated for the camera the spread forces',
       POWERS.every(p => Math.abs(sized[key(p)].dots / spanGainAt(p) - 1) < 0.02),
       POWERS.map(p => 'a^' + key(p) + ' glyph scale ' + sized[key(p)].dots.toFixed(2)
         + '\u00d7 screen height, camera pulled back ' + spanGainAt(p).toFixed(2) + '\u00d7').join(' \u00b7 '));

    ok('the Earth-Moon system grows as a system',
       POWERS.every(p => Math.abs(sized[key(p)].moonRatio - 1) < 1e-9 && sized[key(p)].moonClear > 0.25),
       POWERS.map(p => 'a^' + key(p) + ' moon pivot ' + sized[key(p)].moonRatio.toFixed(3)
         + '\u00d7 the disc group, moon clears Earth by ' + sized[key(p)].moonClear.toFixed(2) + ' u').join(' \u00b7 '));

    ok('the scale note states the live size law',
       POWERS.every(p => {
         const m = /km\^(\d\.\d+), ruler (\d\.\d+)\u00d7/.exec(sized[key(p)].note);
         return m && Math.abs(parseFloat(m[1]) - (0.42 + (p - 0.55) * 0.12)) < 0.011 &&
                Math.abs(parseFloat(m[2]) - rulerAt(p)) < 0.011;
       }),
       POWERS.map(p => 'a^' + key(p) + ' "' + (/body sizes follow the spread \([^)]*\)/.exec(sized[key(p)].note) || ['not stated'])[0] + '"]').join(' \u00b7 '));

    /* Riding a body: the camera sits at a multiple of that body's own radius, and this
       setting moves that radius. The ride has to scale with it, not leave you inside the
       planet you are following. */
    setDistancePower(DIST_POWER_DEFAULT);
    startFollowing(jupiter);
    const rideBefore = cam.dist / jupiter.r;
    setDistancePower(DIST_POWER_MAX);
    for (let i = 0; i < 30; i++) updateCamera(0.016);
    const rideAfter = cam.dist / jupiter.r;
    ok('riding a body keeps its framing when the ruler rises',
       Math.abs(rideAfter / rideBefore - 1) < 0.03 && cam.dist > MIN_DIST,
       'camera ' + rideBefore.toFixed(2) + '\u00d7 Jupiter radius before, ' + rideAfter.toFixed(2)
       + '\u00d7 after (radius ' + sized['0.55'].jup.toFixed(2) + ' \u2192 ' + sized['1.00'].jup.toFixed(2)
       + ' u, MIN_DIST ' + MIN_DIST.toFixed(1) + ')');
    stopFollowing();
    setDistancePower(DIST_POWER_DEFAULT);
    for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
    ok('] opens the spread one step', distPower === 0.65 && parseFloat(spreadInput.value) === 0.65 &&
       neptuneB.a / mercuryB.a > reachAt['0.55'], 'a^' + distPower);
    for (let i = 0; i < 8; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    ok('[ clamps at the tightest spread', distPower === DIST_POWER_MIN && parseFloat(spreadInput.value) === DIST_POWER_MIN,
       'a^' + distPower + ' \u00b7 readout ' + spreadOut.textContent.trim());
    spreadInput.value = '0.85';
    spreadInput.dispatchEvent(new Event('input'));
    ok('the slider drives the scene', Math.abs(distPower - 0.85) < 1e-12 &&
       spreadOut.textContent.includes('0.85') && Math.abs(unitRatio() / Math.pow(auRatio, 0.85) - 1) < 1e-9,
       'slider ' + spreadInput.value + ' \u00b7 power ' + distPower + ' \u00b7 readout "' + spreadOut.textContent.trim()
       + '" \u00b7 Neptune/Mercury ' + unitRatio().toFixed(2) + ' units, AU ratio^0.85 = ' + Math.pow(auRatio, 0.85).toFixed(2));
    ok('the scale note states the live setting', /a\^0\.85/.test(scaleNoteEl.textContent), scaleNoteEl.textContent.trim());

    setDistancePower(DIST_POWER_DEFAULT);
    resetView();
    ok('the built compression is the default view',
       distPower === DIST_POWER_DEFAULT && Math.abs(unitRatio() - reachAt['0.55']) < 1e-9 &&
       Math.abs(__gridRadius() - gridAtDefault) < 1e-6 && Math.abs(cam.dist - 210) < 1e-6,
       'a^0.55 \u00b7 grid ' + __gridRadius().toFixed(1) + ' \u00b7 camera ' + cam.dist.toFixed(1));

    const failed = CHECKS.filter(c => !c.pass);
    const pre = document.createElement('pre'); pre.id = 'results';
    pre.textContent = 'RESULT ' + JSON.stringify({ total: CHECKS.length, failed: failed.length,
      detail: CHECKS.map(c => (c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.detail !== '' ? ' [' + c.detail + ']' : '')), views, jupView }, null, 1);
    document.body.appendChild(pre);
  } catch (err) {
    const pre = document.createElement('pre'); pre.id = 'results';
    pre.textContent = 'RESULT EXCEPTION ' + String((err && err.stack) || err);
    document.body.appendChild(pre);
  }
}, 1000);
