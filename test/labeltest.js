/* fast label-only harness (no pixel reads) */
const name_of = b => b.info.name;
function __snap(dist, pol, az) {
  cam.dist = camSmooth.dist = dist;
  cam.pol = camSmooth.pol = pol; cam.az = camSmooth.az = az;
  camSmooth.target.set(0, 0, 0); cam.tx = cam.ty = cam.tz = 0;
  camSmooth.targetDist = dist;
  camera.position.setFromSphericalCoords(dist, pol, az);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  updateBodies(); updatePoints(); updateLabels();
}
function __screen(b) {
  const v = b.worldPos.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}
function __labView(tag) {
  const vis = bodies.filter(b => parseFloat(b.labelEl.style.opacity) > 0.01);
  const rects = vis.map(b => { const r = b.labelEl.getBoundingClientRect(); return { n: name_of(b), x: r.x, y: r.y, w: r.width, h: r.height }; });
  let overlaps = 0; const pairs = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0) { overlaps++; pairs.push(a.n + '/' + b.n); }
  }
  const outside = rects.filter(r => r.x < 0 || r.y < 0 || r.x + r.w > window.innerWidth || r.y + r.h > window.innerHeight).map(r => r.n);
  let broken = 0;
  const degenerate = vis.filter(b => { const r = b.labelEl.getBoundingClientRect(); return r.width < 2 || r.height < 2; }).map(name_of);
  /* The tie between a tag and the position it names.
     A label is placed to dodge other labels, not to sit on its planet, and once a planet is
     only a point of light a tag 20-40px away reads as a body parked off its own orbit. So the
     app draws a hairline from tag to body and a reticle on the body: measure that the line
     exists where it is needed, runs from its own tag, reaches the body, and that the reticle
     sits on the body. */
  const TIE = 6;                       /* closer than this and the tag needs no line anyway */
  let touching = 0, led = 0, marked = 0; const bad = [];
  for (const b of bodies) {
    const op = parseFloat(b.labelEl.style.opacity || '0');
    const mOp = parseFloat(b.markEl && b.markEl.style.opacity || '0');
    const lOp = parseFloat(b.leadEl && b.leadEl.style.opacity || '0');
    if (op <= 0.01) {                  /* a hidden tag may not leave a line or a mark behind */
      if (mOp > 0.01 || lOp > 0.01) bad.push(name_of(b) + ' mark left behind with its tag hidden');
      continue;
    }
    const s = __screen(b), r = b.labelEl.getBoundingClientRect();
    /* how far the tag is from its body at the closest point of the tag, which is what you
       actually see, rather than how far its centre happens to sit */
    const edge = Math.hypot(
      Math.max(r.x - s.x, 0, s.x - r.x - r.width),
      Math.max(r.y - s.y, 0, s.y - r.y - r.height));
    if (edge <= TIE) { touching++; continue; }
    if (lOp <= 0.01) { bad.push(name_of(b) + ' tag ' + edge.toFixed(1) + 'px away with no leader'); continue; }
    const lr = b.leadEl.getBoundingClientRect();
    const reaches = s.x >= lr.x - 2 && s.x <= lr.x + lr.width + 2 &&
                    s.y >= lr.y - 2 && s.y <= lr.y + lr.height + 2;
    const leaves = lr.x < r.x + r.width + 3 && lr.x + lr.width > r.x - 3 &&
                   lr.y < r.y + r.height + 3 && lr.y + lr.height > r.y - 3;
    if (!reaches) { bad.push(name_of(b) + ' leader stops ' + edge.toFixed(1) + 'px short of the body'); continue; }
    if (!leaves) { bad.push(name_of(b) + ' leader does not start at its own tag'); continue; }
    led++;
    if (mOp > 0.01) {
      const mr = b.markEl.getBoundingClientRect();
      const off = Math.hypot(mr.x + mr.width / 2 - s.x, mr.y + mr.height / 2 - s.y);
      if (off > 0.75) bad.push(name_of(b) + ' reticle ' + off.toFixed(2) + 'px off the body');
      else marked++;
    }
  }
  return { tag, W: window.innerWidth, H: window.innerHeight, visible: vis.length + '/' + bodies.length,
           names: rects.map(r => r.n).join(','), overlaps, pairs, outside, broken, degenerate,
           touching, led, marked, bad };
}
const OUT = [];
renderer.setPixelRatio(1); renderer.setSize(160, 100, false); paused = true; speed = 0;
setTimeout(() => {
 try {
  deselect();
  for (const [dist, pol, az] of [[540, 1.06, 2.35], [300, 1.06, 2.35], [210, 1.06, 2.35], [120, 1.06, 2.35], [55, 1.1, 1.2], [24, 1.15, 0.4]]) {
    __snap(dist, pol, az);
    OUT.push(__labView('d' + dist));
  }
  // top-down map view
  __snap(420, 0.12, 0.4); OUT.push(__labView('topdown-420'));
  // hovered + selected must survive
  __snap(210, 1.06, 2.35);
  const jupiter = bodies.find(b => b.def.name === 'Jupiter');
  const mercury = bodies.find(b => b.def.name === 'Mercury');
  selectBody(mercury, false);
  hovered = jupiter; updateLabels();
  const hotView = __labView('hot-mercury-sel-jup-hover');
  hotView.mustHave = ['Mercury', 'Jupiter'].filter(n => !hotView.names.includes(n));
  OUT.push(hotView);
  hovered = null; deselect();
  const pre = document.createElement('pre'); pre.id = 'results';
  pre.textContent = 'RESULT ' + JSON.stringify(OUT);
  document.body.appendChild(pre);
 } catch (err) {
  const pre = document.createElement('pre'); pre.id = 'results';
  pre.textContent = 'RESULT EXC ' + String((err && err.stack) || err);
  document.body.appendChild(pre);
 }
}, 600);
