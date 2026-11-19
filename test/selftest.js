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
    ok('belt populated', BELT_COUNT > 1000 && belt.some(v => v !== 0), 'asteroids ' + BELT_COUNT);

    /* ---- orbital orientation: real i, Ω, ω — checked against an independent
       Keplerian reference written with the textbook z-up convention ---- */
    const D2R = Math.PI / 180;
    const __planeOf = b => new THREE.Vector3(0, 1, 0)
      .applyQuaternion(b.orbitGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const __tiltOf = b => Math.acos(Math.min(1, Math.abs(__planeOf(b).y))) / D2R;
    function __refUnit(def, d) {                 /* z-up reference -> our y-up frame: (x,y,z)->(x,z,-y) */
      const e = def.ecc, TAU2 = 2 * Math.PI;
      const M = (((def.m0 * D2R + TAU2 * (d / def.periodDays)) % TAU2) + TAU2) % TAU2;
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
    const tilts = bodies.filter(b => !b.isSun).map(b => ({ n: b.def.name, t: __tiltOf(b) }));
    ok('mercury is the most inclined orbit',
       tilts.every(t => t.t <= __tiltOf(bodies.find(b => b.def.name === 'Mercury')) + 1e-9) &&
       tilts.filter(t => t.t > 1).length === 6,
       tilts.map(t => t.n[0] + t.t.toFixed(2)).join(' '));
    ok('orbit planes are not randomised',
       bodies.every(b => b.isSun || b.orbitGroup.rotation.z === 0), 'all orbit groups use Rx(i) only');
    btnTilt.click(); applyTiltScale(); updateBodies();
    const boosted = __tiltOf(bodies.find(b => b.def.name === 'Mercury'));
    ok('tilt viewer exaggerates faithfully', Math.abs(boosted - 7.004979 * 5) < 1e-5, boosted.toFixed(4) + '° = 5× i');
    btnTilt.click(); btnTilt.click();
    ok('tilt viewer returns to true inclinations',
       tiltScale === 1 && Math.abs(__tiltOf(bodies.find(b => b.def.name === 'Mercury')) - 7.004979) < 1e-6,
       'Mercury ' + __tiltOf(bodies.find(b => b.def.name === 'Mercury')).toFixed(4) + '°');
    let beltTiltMax = 0;
    for (let i = 0; i < BELT_COUNT; i++) {
      const x = belt[i * 3], y = belt[i * 3 + 1], z = belt[i * 3 + 2];
      beltTiltMax = Math.max(beltTiltMax, Math.abs(y) / Math.hypot(x, y, z));
    }
    ok('asteroid belt hugs the ecliptic', beltTiltMax < Math.sin(10 * D2R), 'max latitude ' + (Math.asin(beltTiltMax) / D2R).toFixed(2) + '°');

    /* ---- the belt is a 3D swarm, not a tilted pinwheel ---- */
    // Failing version: scatter height but reuse one ascending node for every asteroid.
    // Discriminator: <y^2 cos 2lon> over inclined bodies. Nodes spread over 360° makes the
    // distribution rotationally symmetric -> 0. A single shared node -> about -0.1.
    const bp = belt;
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
    const beltMaxLat = Math.asin(beltTiltMax) / D2R;
    ok('belt inclination spread is real', hi > 120 && beltMaxLat > 8 && beltMaxLat < 10,
       hi + ' of ' + BELT_COUNT + ' above 5° latitude now, max ' + beltMaxLat.toFixed(2) + '° (catalog inclination tops out at 9.6°)');
    ok('belt ascending nodes are distributed, not shared', Math.abs(nodeStat) < 0.05,
       '<y² cos 2λ> = ' + nodeStat.toFixed(4) + ' (0 = spread nodes, ≈ -0.1 = one shared node)');

    // The exaggeration viewer must fan the belt out too, and the belt caps itself at 4×
    // so it never wraps over the pole.
    const beltLatAt = scale => {
      tiltScale = scale; applyTiltScale(); updateBelt(days);
      let m = 0;
      for (let i = 0; i < BELT_COUNT; i++) {
        const x = belt[i * 3], y = belt[i * 3 + 1], z = belt[i * 3 + 2];
        const rho = Math.hypot(x, z);
        if (rho < 20) continue;
        m = Math.max(m, Math.atan2(Math.abs(y), rho));
      }
      return m / D2R;
    };
    const beltBoost4 = beltLatAt(4);
    const beltBoost5 = beltLatAt(5);
    tiltScale = 1; applyTiltScale(); updateBelt(days);
    ok('belt follows the tilt viewer', beltBoost4 > beltMaxLat * 2.5 && beltBoost4 < 40,
       'max latitude ' + beltMaxLat.toFixed(1) + '° → ' + beltBoost4.toFixed(1) + '° at ×4');
    ok('belt tilt exaggeration is capped at 4×', Math.abs(beltBoost5 - beltBoost4) < 1e-9,
       '×4 → ' + beltBoost4.toFixed(2) + '° and ×5 → ' + beltBoost5.toFixed(2) + '° (identical: the belt stops tilting at 4×)');

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
    const chips = document.querySelectorAll('.chip').length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    ok('number key focuses planet', selected === earth && following === earth, selected && selected.def.name);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const frozenAt = days;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok('escape closes card', !card.classList.contains('show'));
    ok('focus chips present', chips === 9, 'chips ' + chips);
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
