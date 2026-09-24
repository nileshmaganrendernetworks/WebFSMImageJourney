// Rev F — application entry. Wires the state machine, scene and UI together.
// The render loop samples the state machine and reflects it; it never
// animates parts directly, which keeps the visible motion honest.

import { buildScene, applyStateToScene } from './scene.js';
import { buildUI } from './ui.js';
import { WORKFLOW, workflowTimeline, sampleAt } from './stateMachine.js';
import { PARTS } from './config.js';

export function startApp(container) {
  const { renderer, scene, camera, nodes } = buildScene(container);

  let potatoPattern = '12mm';
  let tl = workflowTimeline(potatoPattern);
  let playing = true, t = 0, last = performance.now();
  let camAngle = 0;

  // camera views + user orbit/zoom
  const views = {
    iso:   { p: [9, 7.4, 12], l: [0, 2.6, 0] },
    front: { p: [0, 3.4, 15], l: [0, 2.6, 0] },
    top:   { p: [0, 17, 0.01], l: [0, 0, 0] },
  };
  let view = 'iso', userYaw = 0, userPitch = 0, userDist = 1;

  const ui = buildUI(container, {
    onPattern(key) { potatoPattern = key; tl = workflowTimeline(potatoPattern); },
    onView(v) { view = v; userYaw = 0; userPitch = 0; userDist = 1; },
    onCutaway(on) { nodes.halfL.visible = true; setCutaway(on); },
    onPlay(btn) { playing = !playing; btn.textContent = playing ? '⏸ Pause' : '▶ Play'; },
    onRestart() { t = 0; },
    onStep(d) { jumpStep(d); },
    onScrub(f) { t = f * tl.total; },
  });

  function setCutaway(on) {
    // cutaway hides the near wet-dry shell walls to expose the mechanism
    nodes.dry.children.forEach(c => { if (c.material) c.material.opacity = 1; });
    nodes.halfL.children.forEach(c => {
      if (c.material && c.material.transparent) c.material.opacity = on ? 0.05 : 0.16;
    });
  }

  function jumpStep(d) {
    const cur = currentMark();
    const i = Math.max(0, Math.min(tl.steps.length - 1, tl.steps.indexOf(cur) + d));
    t = tl.steps[i].start + 0.001;
  }
  function currentMark() {
    let m = tl.steps[0];
    for (const s of tl.steps) if (t >= s.start) m = s;
    return m;
  }

  // orbit / zoom
  let dragging = false, lx = 0, ly = 0;
  container.addEventListener('pointerdown', e => {
    if (e.target.closest('#bar,#panel,#track')) return;
    dragging = true; lx = e.clientX; ly = e.clientY;
  });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => {
    if (!dragging) return;
    userYaw -= (e.clientX - lx) * 0.005; userPitch -= (e.clientY - ly) * 0.003;
    userPitch = Math.max(-0.6, Math.min(0.9, userPitch));
    lx = e.clientX; ly = e.clientY;
  });
  addEventListener('wheel', e => { userDist = Math.max(0.5, Math.min(2.2, userDist + e.deltaY * 0.0008)); });
  addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  function frame(now) {
    const dt = (now - last) / 1000; last = now;
    if (playing) { t = (t + dt) % tl.total; camAngle += dt * 0.4; }

    const s = sampleAt(t, potatoPattern);
    const mark = currentMark();
    s._activeMech = mark.mech;

    applyStateToScene(nodes, s, camAngle);

    // camera: view pose + user orbit
    const v = views[view];
    const look = { x: v.l[0], y: v.l[1], z: v.l[2] };
    const off = { x: v.p[0] - look.x, y: v.p[1] - look.y, z: v.p[2] - look.z };
    const r = Math.hypot(off.x, off.z) * userDist;
    const baseTheta = Math.atan2(off.z, off.x);
    const theta = baseTheta + userYaw;
    const phi = Math.max(0.15, Math.min(1.5, Math.acos(off.y / Math.hypot(off.x, off.y, off.z)) + userPitch));
    const R = Math.hypot(off.x, off.y, off.z) * userDist;
    camera.position.set(
      look.x + R * Math.sin(phi) * Math.cos(theta),
      look.y + R * Math.cos(phi),
      look.z + R * Math.sin(phi) * Math.sin(theta));
    camera.lookAt(look.x, look.y, look.z);

    ui.setStep(mark.step, mark.mech);
    ui.setMech(mark.mech, s);
    ui.setCount(s);
    ui.setAssertions(s);
    ui.setMap(mark.mech);
    ui.setTrack(t, tl.total, tl.steps);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose a deterministic hook for smoke tests
  return { sample: (tt) => sampleAt(tt, potatoPattern), timeline: () => tl };
}
