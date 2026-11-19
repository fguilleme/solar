/* fast label-only harness (no pixel reads) */
function __snap(dist, pol, az) {
  cam.dist = camSmooth.dist = dist;
  cam.pol = camSmooth.pol = pol; cam.az = camSmooth.az = az;
  camSmooth.target.set(0, 0, 0); cam.tx = cam.ty = cam.tz = 0;
  camSmooth.targetDist = dist;
  camera.position.setFromSphericalCoords(dist, pol, az);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  updateBodies(); updateLabels();
}
function __labView(tag) {
  const vis = bodies.filter(b => parseFloat(b.labelEl.style.opacity) > 0.01);
  const rects = vis.map(b => { const r = b.labelEl.getBoundingClientRect(); return { n: b.def.name, x: r.x, y: r.y, w: r.width, h: r.height }; });
  let overlaps = 0; const pairs = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0) { overlaps++; pairs.push(a.n + '/' + b.n); }
  }
  const outside = rects.filter(r => r.x < 0 || r.y < 0 || r.x + r.w > window.innerWidth || r.y + r.h > window.innerHeight).map(r => r.n);
  return { tag, W: window.innerWidth, H: window.innerHeight, visible: vis.length + '/' + bodies.length, names: rects.map(r => r.n).join(','), overlaps, pairs, outside };
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
