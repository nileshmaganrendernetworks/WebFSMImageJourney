// Rev F — Three.js scene builder. Constructs the dry base and the removable
// wet cassette with every named mechanism part, then maps state-machine
// variables onto node transforms. Rendering never invents motion; it only
// reflects the kinematic state produced by stateMachine.js.
//
// Uses a deliberately small Three.js subset (WebGLRenderer, Scene, cameras,
// Group, Mesh, Box/Cylinder geometry, standard/phong materials, lights,
// arrows) so the bundler can inline a compact runtime.

import * as THREE from 'three';
import { GEO, PARTS, bladeOffsets } from './config.js';

const C = {
  base: 0x2a3340, baseDark: 0x1d242e, dryAccent: 0xff8c2f,
  wet: 0xd7dde5, wetDark: 0x39414f, steel: 0xb9c2cd, blade: 0x9fb4c8,
  green: 0x2f9e6e, lock: 0xffb020, receiver: 0x66c2ff,
  carrot: 0xf28c28, potato: 0xcaa46a, cut: 0xe9d9b8, bin: 0xf4f7fa,
  chute: 0xf4f7fa, error: 0xff4d4d,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}

export function buildScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10151d);
  scene.fog = new THREE.Fog(0x10151d, 40, 90);

  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 220);
  camera.position.set(9, 7.4, 12);

  // lights
  scene.add(new THREE.HemisphereLight(0xbfd0e8, 0x1a2030, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(8, 12, 8); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12; key.shadow.camera.right = 12;
  key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 0.5); rim.position.set(-8, 5, -8); scene.add(rim);

  // ground
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.3, 64), mat(0x18202c, { roughness: 0.95 }));
  ground.position.y = -0.15; ground.receiveShadow = true; scene.add(ground);

  const box = (w, h, d, m, x = 0, y = 0, z = 0, parent = scene) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true; parent.add(g); return g;
  };
  const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, parent = scene, seg = 28) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true; parent.add(g); return g;
  };

  /* ================= DRY BASE (stays behind on extraction) ============= */
  const dry = new THREE.Group(); scene.add(dry);
  box(4.6, 1.0, 4.0, mat(C.base), 0, 0.5, 0, dry);                 // plinth
  box(4.6, 0.1, 4.0, mat(C.baseDark), 0, 1.05, 0, dry);

  // D1 cycle gearmotor — motor body + shaft + reducer + coupling
  const D1 = new THREE.Group(); dry.add(D1);
  cyl(0.42, 0.42, 1.0, mat(C.dryAccent, { metalness: 0.5 }), 0, 0, 0, D1);       // motor body
  cyl(0.5, 0.5, 0.34, mat(C.baseDark), 0, -0.62, 0, D1);                          // gearbox
  cyl(0.08, 0.08, 0.7, mat(C.steel, { metalness: 0.85 }), 0, 0.85, 0, D1);        // shaft
  D1.position.set(-1.6, 1.7, -1.2);
  D1.rotation.z = Math.PI / 2; // shaft along X toward camshaft

  // camshaft driven by D1, carrying the five cam take-offs
  const camshaft = new THREE.Group(); dry.add(camshaft);
  cyl(0.07, 0.07, 3.2, mat(C.steel, { metalness: 0.85 }), 0, 0, 0, camshaft).rotation.z = Math.PI / 2;
  const cams = {};
  const camNames = ['C1', 'C2', 'C3', 'C4', 'C5'];
  camNames.forEach((id, i) => {
    const cam = new THREE.Group(); camshaft.add(cam);
    const disc = cyl(0.3, 0.3, 0.12, mat(C.dryAccent), 0, 0, 0, cam, 24);
    disc.rotation.z = Math.PI / 2;
    box(0.05, 0.16, 0.05, mat(C.baseDark), 0, 0.3, 0, cam); // cam lobe
    cam.position.set(-1.2 + i * 0.6, 0, 0);
    cams[id] = cam;
  });
  camshaft.position.set(-0.2, 1.7, -1.2);

  // D2 manual cassette latch / release on the dry base front
  const D2 = new THREE.Group(); dry.add(D2);
  box(0.16, 0.5, 0.24, mat(C.lock), 0, 0, 0, D2);
  D2.position.set(1.9, 1.4, 1.9);

  // electronics block (stays dry)
  const electronics = box(1.2, 0.5, 0.9, mat(C.baseDark), 1.4, 1.3, -1.4, dry);

  // dry→wet coupling that lifts on disengage
  const coupling = box(0.5, 0.22, 0.5, mat(C.green), -0.2, 2.0, -0.2, dry);

  /* ================= WET CASSETTE (extracts + unfolds) ================= */
  // cassette root translates on extraction; two halves fan on unfold.
  const cassette = new THREE.Group(); scene.add(cassette);
  const halfL = new THREE.Group(); cassette.add(halfL);  // pivots about rear hinge
  const halfR = new THREE.Group(); cassette.add(halfR);

  // chamber + chute (left half)
  box(GEO.chamber.w, GEO.chamber.h, GEO.chamber.d, mat(C.wet, { transparent: true, opacity: 0.16 }), 0, GEO.chamber.floorY + GEO.chamber.h / 2, 0, halfL).castShadow = false;
  const chute = cyl(0.6, 0.6, 1.6, mat(C.chute, { transparent: true, opacity: 0.3 }), 0, GEO.chuteTop - 0.8, 0, halfL);
  chute.castShadow = false;

  // --- X-bank blades (slide along X) on halfR, Z-bank (slide along Z) on halfL
  const offs = bladeOffsets();
  const xBlades = [], zBlades = [];
  offs.forEach((o) => {
    // X bank blade: thin strip spanning Z, travels along X at xBankY
    const bx = box(GEO.bladeDepth, GEO.bladeThickness, GEO.chamber.d - 0.1, mat(C.blade, { metalness: 0.7, roughness: 0.3 }),
      GEO.xTravelMin, GEO.xBankY, o, halfR);
    bx.visible = false; xBlades.push(bx);
    // Z bank blade: spans X, travels along Z at zBankY
    const bz = box(GEO.chamber.w - 0.1, GEO.bladeThickness, GEO.bladeDepth, mat(C.blade, { metalness: 0.7, roughness: 0.3 }),
      o, GEO.zBankY, GEO.zTravelMin, halfL);
    bz.visible = false; zBlades.push(bz);
  });

  // origin magazines (explicit storage length — no tiny boxes)
  box(GEO.magazine.length, 0.5, GEO.chamber.d, mat(C.wetDark), GEO.magazine.xX - 0.85, GEO.xBankY, 0, halfR).castShadow = false;
  box(GEO.chamber.w, 0.5, GEO.magazine.length, mat(C.wetDark), 0, GEO.zBankY, GEO.magazine.xZ - 0.85, halfL).castShadow = false;

  // wipers at the food-zone/storage boundary
  const xWiper = box(0.12, 0.5, GEO.chamber.d, mat(C.green), GEO.xTravelMin + 0.1, GEO.xBankY, 0, halfR);
  const zWiper = box(GEO.chamber.w, 0.5, 0.12, mat(C.green), 0, GEO.zBankY, GEO.zTravelMin + 0.1, halfL);

  // far receivers: open-through channels beyond the far lock plane
  box(0.2, 0.4, GEO.chamber.d, mat(C.receiver), GEO.xTravelMax + 0.2, GEO.xBankY, 0, halfR).castShadow = false;
  box(GEO.chamber.w, 0.4, 0.2, mat(C.receiver), 0, GEO.zBankY, GEO.zTravelMax + 0.2, halfL).castShadow = false;

  // origin + far lock rails (move normal to blade-tip support)
  const originRailX = box(0.18, 0.5, GEO.chamber.d, mat(C.lock), GEO.xTravelMin - 0.2, GEO.xBankY, 0, halfR);
  const farRailX = box(0.18, 0.5, GEO.chamber.d, mat(C.lock), GEO.xTravelMax + 0.45, GEO.xBankY, 0, halfR);
  const originRailZ = box(GEO.chamber.w, 0.5, 0.18, mat(C.lock), 0, GEO.zBankY, GEO.zTravelMin - 0.2, halfL);
  const farRailZ = box(GEO.chamber.w, 0.5, 0.18, mat(C.lock), 0, GEO.zBankY, GEO.zTravelMax + 0.45, halfL);

  // common selector shuttle: one X arm + one Z arm
  const shuttle = new THREE.Group(); dry.add(shuttle);
  const shuttleArmX = box(0.5, 0.12, GEO.chamber.d, mat(C.dryAccent), GEO.xTravelMin - 0.6, GEO.xBankY, 0, shuttle);
  const shuttleArmZ = box(GEO.chamber.w, 0.12, 0.5, mat(C.dryAccent), 0, GEO.zBankY, GEO.zTravelMin - 0.6, shuttle);

  // --- pusher: open lattice with a clearance slot at every blade line
  const pusher = new THREE.Group(); cassette.add(pusher);
  const p = GEO.pusher;
  const latticeMat = mat(C.wet, { metalness: 0.2, roughness: 0.4 });
  // frame rim
  box(GEO.chamber.w, p.faceThickness, 0.12, latticeMat, 0, 0, GEO.chamber.d / 2 - 0.06, pusher);
  box(GEO.chamber.w, p.faceThickness, 0.12, latticeMat, 0, 0, -GEO.chamber.d / 2 + 0.06, pusher);
  box(0.12, p.faceThickness, GEO.chamber.d, latticeMat, GEO.chamber.w / 2 - 0.06, 0, 0, pusher);
  box(0.12, p.faceThickness, GEO.chamber.d, latticeMat, -GEO.chamber.w / 2 + 0.06, 0, 0, pusher);
  // ribs BETWEEN blade lines so slots line up with blades (slots stay empty)
  offs.forEach((o) => {
    const gap = o - GEO.pitch / 2; // rib offset half a pitch away from each blade line
    if (Math.abs(gap) < GEO.chamber.d / 2 - 0.1) {
      box(GEO.chamber.w - 0.2, p.faceThickness * 0.8, p.slotWidth * 0.5, latticeMat, 0, 0, gap, pusher);
    }
  });
  // side guide shoes + drive collar
  box(0.1, 0.4, 0.3, mat(C.green), GEO.chamber.w / 2 + 0.05, 0, 0, pusher);
  box(0.1, 0.4, 0.3, mat(C.green), -GEO.chamber.w / 2 - 0.05, 0, 0, pusher);
  const driveCollar = cyl(0.18, 0.18, 0.3, mat(C.dryAccent, { metalness: 0.6 }), 0, 0.32, 0, pusher);
  pusher.position.set(0, p.serviceY, 0);

  // stripper plate (moves relative to pusher)
  const stripper = new THREE.Group(); cassette.add(stripper);
  box(GEO.chamber.w - 0.15, 0.08, GEO.chamber.d - 0.15, mat(C.green), 0, 0, 0, stripper);
  stripper.position.set(0, p.serviceY + 0.25, 0);

  // crosscut knife + carrier (below both banks, travels along X)
  const crosscut = new THREE.Group(); cassette.add(crosscut);
  box(GEO.chamber.w - 0.1, 0.06, 0.22, mat(C.blade, { metalness: 0.8, roughness: 0.25 }), 0, 0, 0, crosscut);
  box(0.3, 0.2, 0.34, mat(C.wetDark), -GEO.chamber.w / 2, 0, 0, crosscut); // carrier shoe
  crosscut.position.set(GEO.crosscut.dockX, GEO.crosscutY, 0);

  // output bin / food zone under the grid
  const bin = new THREE.Group(); cassette.add(bin);
  box(1.9, 0.8, 1.9, mat(C.bin, { transparent: true, opacity: 0.28 }), 0, 0, 0, bin).castShadow = false;
  box(1.9, 0.08, 1.9, mat(C.steel), 0, -0.44, 0, bin);
  bin.position.set(0, 0.85, 0);

  // produce models
  const mkCarrot = () => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.02, 1.5, 18), mat(C.carrot, { roughness: 0.6 }));
    c.castShadow = true; g.add(c);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), mat(C.green));
    leaf.position.y = 0.9; g.add(leaf); return g;
  };
  const mkPotato = () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 22, 16), mat(C.potato, { roughness: 0.85 }));
    s.scale.set(1, 0.8, 0.85); s.castShadow = true; g.add(s); return g;
  };
  const produce = { carrot: mkCarrot(), potato: mkPotato() };
  produce.carrot.position.set(0, GEO.chuteTop + 0.6, 0); produce.carrot.visible = false; cassette.add(produce.carrot);
  produce.potato.position.set(0, GEO.chuteTop + 0.6, 0); produce.potato.visible = false; cassette.add(produce.potato);

  // cut pieces pool (provenance-driven visibility)
  const PIECES = 40; const pieces = [];
  for (let i = 0; i < PIECES; i++) {
    const m = box(0.16, 0.16, 0.16, mat(C.cut), 0, 0, 0, cassette);
    m.visible = false; pieces.push(m);
  }

  // active-mechanism motion arrow (repositioned per phase)
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1.4, 0x00ff9d, 0.3, 0.18);
  scene.add(arrow);

  return {
    renderer, scene, camera,
    nodes: {
      dry, cassette, halfL, halfR, D1, camshaft, cams, D2, electronics, coupling,
      xBlades, zBlades, xWiper, zWiper, originRailX, farRailX, originRailZ, farRailZ,
      shuttle, shuttleArmX, shuttleArmZ, pusher, driveCollar, stripper, crosscut, bin,
      produce, pieces, arrow,
    },
  };
}

// Map a kinematic state onto the scene graph.
export function applyStateToScene(nodes, s, camAngle) {
  const {
    cassette, halfL, halfR, cams, coupling, D2,
    xBlades, zBlades, originRailX, farRailX, originRailZ, farRailZ,
    shuttle, pusher, stripper, crosscut, produce, pieces, arrow, camshaft,
  } = nodes;
  const P = GEO.pusher;

  // camshaft + cams rotate with selector/cycle progress
  camshaft.rotation.x = (s.selectorProgress + s.feedProgress + camAngle) * Math.PI * 2;

  // selector shuttle stroke (C1)
  shuttle.position.x = s.selectorProgress * 0.0; // hub stays; arms advance carriers
  shuttle.position.z = 0;

  // blades: only engaged indices extend; travel along their axis
  const engaged = new Set(s.selectedIndices);
  xBlades.forEach((b, i) => {
    const on = engaged.has(i) && s.tailEngaged[i];
    b.visible = on && s.bladeExtend > 0.001;
    const x = GEO.xTravelMin + (GEO.xTravelMax - GEO.xTravelMin) * s.bladeExtend;
    b.position.x = on ? x : GEO.xTravelMin;
  });
  zBlades.forEach((b, i) => {
    const on = engaged.has(i) && s.tailEngaged[i];
    b.visible = on && s.bladeExtend > 0.001;
    const z = GEO.zTravelMin + (GEO.zTravelMax - GEO.zTravelMin) * s.bladeExtend;
    b.position.z = on ? z : GEO.zTravelMin;
  });

  // lock rails close normal to blade tips
  const lockIn = 0.28;
  originRailX.position.x = GEO.xTravelMin - 0.2 + s.originLock * lockIn;
  farRailX.position.x = GEO.xTravelMax + 0.45 - s.farLock * lockIn;
  originRailZ.position.z = GEO.zTravelMin - 0.2 + s.originLock * lockIn;
  farRailZ.position.z = GEO.zTravelMax + 0.45 - s.farLock * lockIn;

  // pusher + stripper
  pusher.position.y = s.pusherY;
  stripper.position.y = s.pusherY + 0.25 - s.stripProgress * 0.3;

  // crosscut
  crosscut.position.x = s.crosscutX;

  // produce: visible while loaded and not yet fed
  ['carrot', 'potato'].forEach((kind) => {
    const m = produce[kind];
    if (s.produce === kind && s.produceLoaded && s.feedProgress < 0.999) {
      m.visible = true;
      const settle = Math.min(1, s.feedProgress * 3 + 0.4);
      m.position.y = GEO.chuteTop + 0.6 - (1 - Math.min(1, s.bladeExtend)) * 0 - (s.produceLoaded ? 2.0 : 0);
      m.position.y = GEO.chamber.floorY + 0.9 + (1 - s.feedProgress) * 1.6; // sink as fed
    } else m.visible = false;
  });

  // cut pieces: shown after feed, count from state provenance
  pieces.forEach((m, i) => {
    const on = i < s.cutPieces.length && s.feedProgress >= 0.999 && s.extractProgress <= 0;
    m.visible = on;
    if (on) {
      const col = i % 7, row = Math.floor(i / 7) % 3, lay = Math.floor(i / 21);
      m.position.set((col - 3) * 0.24, 0.55 + lay * 0.2, (row - 1) * 0.3);
    }
  });

  // dry→wet coupling lifts on disengage; D2 latch pivots
  coupling.position.y = 2.0 + (s.couplingEngaged ? 0 : 0.35);
  coupling.visible = s.extractProgress <= 0.001;
  D2.rotation.z = -(s.couplingEngaged ? 0 : 0.6) - s.extractProgress * 0.2;

  // cassette extraction (+Z) then unfold (fan of halves about rear edge)
  cassette.position.z = GEO.cassette.seatZ + s.extractProgress * GEO.cassette.extractTravel;
  const a = s.unfoldProgress * GEO.cassette.unfoldAngle;
  halfL.rotation.z = a * 0.5;
  halfR.rotation.z = -a * 0.5;

  // hide dry-side-only context when the cassette is out
  shuttle.visible = s.extractProgress <= 0.001;

  // active-mechanism arrow: point along the active DOF at the active part
  const mechPos = {
    C1: [GEO.xTravelMin - 0.6, GEO.xBankY, 0, 1, 0, 0],
    selectorShuttle: [GEO.xTravelMin - 0.6, GEO.zBankY, 0, 0, 0, 1],
    C2: [GEO.xTravelMax + 0.45, GEO.xBankY, 0, -1, 0, 0],
    C3: [0, s.pusherY, 0, 0, -1, 0],
    C4: [s.crosscutX, GEO.crosscutY, 0, 1, 0, 0],
    C5: [0, s.pusherY + 0.2, 0, 0, -1, 0],
    D2: [0, 1.4, 2.0 + s.extractProgress * GEO.cassette.extractTravel, 0, 0, 1],
  }[s._activeMech];
  if (mechPos) {
    arrow.visible = true;
    arrow.position.set(mechPos[0], mechPos[1], mechPos[2]);
    arrow.setDirection(new THREE.Vector3(mechPos[3], mechPos[4], mechPos[5]));
  } else arrow.visible = false;
}
