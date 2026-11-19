
/* Screenshot helper: #tiltClicks|polarAngle|distance
   settles the camera smoothing, applies tilt-viewer steps, then renders. */
setTimeout(() => {
  const p = (location.hash || '').replace('#', '').split('|');
  const steps = parseInt(p[0] || '0', 10) || 0;
  const pol = p[1] === undefined ? 0.62 : parseFloat(p[1]);
  const dist = p[2] === undefined ? 300 : parseFloat(p[2]);
  for (let i = 0; i < steps; i++) btnTilt.click();
  cam.dist = camSmooth.dist = dist;
  cam.pol = camSmooth.pol = pol;
  cam.az = camSmooth.az = 2.35;
  cam.tx = cam.ty = cam.tz = 0;
  camSmooth.target.set(0, 0, 0);
  for (let i = 0; i < 150; i++) { updateCamera(0.016); updateBodies(); renderer.render(scene, camera); }
  updateLabels();
}, 700);
