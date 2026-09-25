// Rev F — Three.js scene builder. Constructs the dry base and the removable
// wet cassette with every named mechanism part, then maps state-machine
// variables onto node transforms. Rendering never invents motion; it only
// reflects the kinematic state produced by stateMachine.js.
//
// Layout intent (see config.js): the retractable blade grid lives INSIDE the
// chamber footprint — both banks share one cutting plane and interleave into
// a single dicer grid, like a real vegetable dicer. The pusher is a matching
// waffle of posts that passes through the grid. Magazines, wipers, receivers
// and lock clamps hug the chamber walls outside the food zone. Nothing may
// intersect anything else; tests pin the clearances.

import * as THREE from 'three';
import { GEO, PARTS, bladeOffsets } from './config.js';

const C = {
  base: 0x2a3340, baseDark: 0x1d242e, dryAccent: 0xff8c2f,
  wet: 0xd7dde5, wetDark: 0x39414f, steel: 0xb9c2cd, blade: 0xdde6f0,
  green: 0x2f9e6e, lock: 0xffb020, receiver: 0x66c2ff,
  carrot: 0xf28c28, potato: 0xcaa46a, cut: 0xe9d9b8, bin: 0xf4f7fa,
  chute: 0xf4f7fa, error: 0xff4d4d,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}
const STEEL = () => mat(C.steel, { metalness: 0.85, roughness: 0.3 });
const BLADE = () => mat(C.blade, { metalness: 0.9, roughness: 0.18 });

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
  const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, parent = scene, seg = 28, open = false) => {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m);
    g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true; parent.add(g); return g;
  };
  const sph = (r, m, x = 0, y = 0, z = 0, parent = scene, w = 20, hseg = 14) => {
    const g = new THREE.Mesh(new THREE.SphereGeometry(r, w, hseg), m);
    g.position.set(x, y, z); g.castShadow = true; g.receiveShadow = true; parent.add(g); return g;
  };

  /* ---------- shared part factories (shaped, not boxes) ----------------- */

  // Knife blade: a TALL, thin strip standing in the cutting plane — like one
  // blade of a dicer grid. Substantial height + bright steel + a pale ground
  // edge make it read as a knife. Local frame: length along +X from the
  // drive tail, the strip stands vertically (height along +Y), thickness Z.
  function mkBlade(len) {
    const t = GEO.bladeThickness, D = GEO.bladeDepth;
    const g = new THREE.Group();
    // main web of the blade
    box(len, D, t, BLADE(), len / 2, D / 2, 0, g);
    // ground cutting edge: a pale triangular strip along the full top
    const edge = box(len, 0.03, t * 1.6, mat(0xf2f7fc, { metalness: 0.9, roughness: 0.1 }), len / 2, D + 0.01, 0, g);
    edge.castShadow = false;
    // drive tail hook at the origin end
    const tail = box(0.2, D * 0.8, 0.16, mat(C.wetDark), -0.08, D * 0.4, 0, g);
    tail.castShadow = false;
    return g;
  }

  // Cam: round disc with an offset lobe — the classic cam silhouette.
  function mkCam(lobeAngle = 0) {
    const g = new THREE.Group();
    const R = 0.3, T = 0.12;
    cyl(R, R, T, mat(C.dryAccent, { metalness: 0.4, roughness: 0.4 }), 0, 0, 0, g, 28);
    const ax = cyl(0.07, 0.07, T * 2.6, STEEL(), 0, 0, 0, g, 14);
    ax.castShadow = false;
    const a0 = lobeAngle - 0.45, a1 = lobeAngle + 0.45;
    const lobeShape = new THREE.Shape();
    lobeShape.moveTo(0, 0);
    lobeShape.lineTo(Math.cos(a0) * R * 0.98, Math.sin(a0) * R * 0.98);
    lobeShape.absarc(0, 0, R * 1.32, a0, a1, false);
    lobeShape.lineTo(0, 0);
    const lobe = new THREE.Mesh(new THREE.ExtrudeGeometry(lobeShape, { depth: T * 0.9, bevelEnabled: false }), mat(C.dryAccent, { metalness: 0.4, roughness: 0.4 }));
    lobe.rotation.x = -Math.PI / 2;
    lobe.position.y = -T * 0.45;
    lobe.castShadow = true;
    g.add(lobe);
    return g;
  }

  // Gear: disc with rectangular teeth standing proud of the rim.
  function mkGear(r, teeth, w, m) {
    const g = new THREE.Group();
    cyl(r, r, w, m, 0, 0, 0, g, teeth * 2);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tooth = box(r * 0.32, w, r * 0.34, m, Math.cos(a) * r * 1.05, 0, Math.sin(a) * r * 1.05, g);
      tooth.rotation.y = -a;
    }
    const hub = cyl(r * 0.3, r * 0.3, w * 1.6, STEEL(), 0, 0, 0, g, 14);
    hub.castShadow = false;
    return g;
  }

  // Slim wall-hugging magazine: a flat cassette the blade stack parks in,
  // with a mouth on the chamber side. Slimmer than a blade is deep, so it
  // reads as a blade holder, not a drum.
  function mkMagazine(len, depth) {
    const g = new THREE.Group();
    const r = GEO.magazine.r;
    const m = mat(C.wetDark, { metalness: 0.3, roughness: 0.5 });
    box(depth, r * 2, len, m, 0, 0, 0, g).castShadow = false;
    box(depth * 0.6, r * 0.4, len, mat(C.wetDark), depth * 0.55, r * 0.7, 0, g).castShadow = false; // open mouth lip
    box(depth * 0.6, r * 0.4, len, mat(C.wetDark), depth * 0.55, -r * 0.7, 0, g).castShadow = false;
    return g;
  }

  // Slotted guide/comb: teeth sit at the midpoints BETWEEN blade lines so a
  // blade passes through every slot. Used for receivers and lock clamps.
  function mkComb(len, toothH, toothD, color, alongX) {
    const g = new THREE.Group();
    const m = mat(color, { metalness: 0.4, roughness: 0.4 });
    const lines = bladeOffsets();
    const toothW = GEO.pitch * 0.36;
    const pts = [];
    for (let i = 0; i < lines.length - 1; i++) pts.push((lines[i] + lines[i + 1]) / 2);
    pts.push(lines[0] - GEO.pitch / 2, lines[lines.length - 1] + GEO.pitch / 2);
    pts.forEach(off => {
      const t = alongX ? box(toothD, toothH, toothW, m, 0, 0, off, g)
                       : box(toothW, toothH, toothD, m, off, 0, 0, g);
      t.castShadow = false;
    });
    // spine joining the teeth, on the side away from the blade path
    const spine = alongX ? box(toothD * 0.7, toothH * 0.5, len, m, -toothD * 0.6, 0, 0, g)
                         : box(len, toothH * 0.5, toothD * 0.7, m, 0, 0, -toothD * 0.6, g);
    spine.castShadow = false;
    return g;
  }

  /* ================= DRY BASE (stays behind on extraction) ============= */
  const dry = new THREE.Group(); scene.add(dry);
  box(4.6, 1.0, 4.0, mat(C.base), 0, 0.5, 0, dry);                 // plinth
  box(4.6, 0.1, 4.0, mat(C.baseDark), 0, 1.05, 0, dry);
  [[-1.9, -1.6], [1.9, -1.6], [-1.9, 1.6], [1.9, 1.6]].forEach(([x, z]) =>
    cyl(0.16, 0.2, 0.18, mat(C.baseDark), x, 0.06, z, dry, 16));

  // D1 cycle gearmotor — finned motor barrel + end cap + gearbox + shaft
  const D1 = new THREE.Group(); dry.add(D1);
  cyl(0.4, 0.4, 0.95, mat(C.dryAccent, { metalness: 0.5 }), 0, 0, 0, D1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fin = box(0.05, 0.9, 0.1, mat(C.dryAccent, { metalness: 0.5 }), Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, D1);
    fin.rotation.y = -a; fin.castShadow = false;
  }
  cyl(0.3, 0.34, 0.16, mat(C.baseDark), 0, 0.55, 0, D1);
  cyl(0.5, 0.5, 0.36, mat(C.baseDark), 0, -0.64, 0, D1);
  const dome = sph(0.5, mat(C.baseDark), 0, -0.82, 0, D1, 20, 10); dome.scale.y = 0.5;
  cyl(0.08, 0.08, 0.7, STEEL(), 0, 0.98, 0, D1);
  D1.position.set(-1.6, 1.7, -1.2);
  D1.rotation.z = Math.PI / 2;

  // camshaft driven by D1, carrying the five cam take-offs
  const camshaft = new THREE.Group(); dry.add(camshaft);
  cyl(0.07, 0.07, 3.2, STEEL(), 0, 0, 0, camshaft).rotation.z = Math.PI / 2;
  const inGear = mkGear(0.26, 10, 0.12, mat(C.steel, { metalness: 0.7, roughness: 0.35 }));
  inGear.rotation.z = Math.PI / 2; inGear.position.set(-1.72, 0, 0); camshaft.add(inGear);
  const cams = {};
  const camNames = ['C1', 'C2', 'C3', 'C4', 'C5'];
  camNames.forEach((id, i) => {
    const cam = mkCam(i * 1.13);
    cam.rotation.z = Math.PI / 2;
    cam.position.set(-1.2 + i * 0.6, 0, 0);
    camshaft.add(cam);
    cams[id] = cam;
  });
  camshaft.position.set(-0.2, 1.7, -1.2);

  // D2 manual cassette latch / release on the dry base front — lever + pivot + knob
  const D2 = new THREE.Group(); dry.add(D2);
  cyl(0.1, 0.1, 0.3, STEEL(), 0, 0, 0, D2).rotation.x = Math.PI / 2;
  box(0.09, 0.62, 0.09, mat(C.lock, { metalness: 0.4 }), 0, 0.26, 0, D2);
  sph(0.09, mat(C.lock, { metalness: 0.4, roughness: 0.4 }), 0, 0.6, 0, D2);
  D2.position.set(1.9, 1.4, 1.9);

  // electronics block (stays dry) — case + cooling slots + status LED
  const electronics = new THREE.Group(); dry.add(electronics);
  box(1.2, 0.5, 0.9, mat(C.baseDark), 0, 0, 0, electronics);
  for (let i = 0; i < 4; i++) box(0.9, 0.03, 0.06, mat(C.base), 0, 0.12 - i * 0.08, 0.46, electronics).castShadow = false;
  sph(0.045, mat(0x36e07a, { emissive: 0x1a7a40 }), -0.45, 0.16, 0.46, electronics, 10, 8).castShadow = false;
  electronics.position.set(1.4, 1.3, -1.4);

  // dry/wet coupling that lifts on disengage — splined collar
  const coupling = new THREE.Group(); dry.add(coupling);
  cyl(0.2, 0.24, 0.2, mat(C.green, { metalness: 0.5 }), 0, 0, 0, coupling, 20);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    box(0.05, 0.12, 0.05, mat(C.green, { metalness: 0.5 }), Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2, coupling).castShadow = false;
  }
  coupling.position.set(-0.2, 2.0, -0.2);

  /* ================= WET CASSETTE (extracts + unfolds) ================= */
  const cassette = new THREE.Group(); scene.add(cassette);
  const halfL = new THREE.Group(); cassette.add(halfL);
  const halfR = new THREE.Group(); cassette.add(halfR);
  // rear hinge barrel the halves fan about
  cyl(0.09, 0.09, 2.0, STEEL(), -1.15, 2.4, 0, cassette).rotation.x = Math.PI / 2;

  const W = GEO.chamber.w, H = GEO.chamber.h, D = GEO.chamber.d;
  const WALL = GEO.chamber.wall, FLOOR = GEO.chamber.floorY;

  // chamber (left half) — open-top wall shell + floor plate. The floor has a
  // central discharge opening so cut pieces fall through to the bin below.
  {
    const yc = FLOOR + H / 2;
    const wm = () => mat(C.wet, { transparent: true, opacity: 0.16, side: THREE.DoubleSide });
    const mkWall = (ww, hh, dd, x, y, z) => { const m = box(ww, hh, dd, wm(), x, y, z, halfL); m.castShadow = false; return m; };
    mkWall(W, H, WALL, 0, yc, D / 2 - WALL / 2);    // +Z wall
    mkWall(W, H, WALL, 0, yc, -D / 2 + WALL / 2);   // -Z wall
    mkWall(WALL, H, D, -W / 2 + WALL / 2, yc, 0);   // -X wall
    // floor plate as a ring around a central discharge hole
    const hole = 1.5;
    const fw = (W - hole) / 2;
    mkWall(fw, WALL, D, -(hole / 2 + fw / 2), FLOOR + WALL / 2, 0);   // floor −X
    mkWall(fw, WALL, D, hole / 2 + fw / 2, FLOOR + WALL / 2, 0);      // floor +X
    const fd = (D - hole) / 2;
    mkWall(hole, WALL, fd, 0, FLOOR + WALL / 2, -(hole / 2 + fd / 2));
    mkWall(hole, WALL, fd, 0, FLOOR + WALL / 2, hole / 2 + fd / 2);
  }

  // feed chute (left half) — a straight-through square sleeve the pusher
  // passes through, from chamber roof to the loading lip. Same width class
  // as the chamber so produce and the pusher never clip it.
  {
    const cs = GEO.chuteSize / 2;
    const topY = GEO.chuteTop, botY = FLOOR + H; // sleeve meets the chamber roof
    const h = topY - botY, yc = (topY + botY) / 2;
    const cm = () => mat(C.chute, { transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    [box(WALL, h, cs * 2, cm(), cs, yc, 0, halfL),
     box(WALL, h, cs * 2, cm(), -cs, yc, 0, halfL),
     box(cs * 2, h, WALL, cm(), 0, yc, cs, halfL),
     box(cs * 2, h, WALL, cm(), 0, yc, -cs, halfL)].forEach(m => { m.castShadow = false; });
    // loading lip ring on top
    const lip = box(cs * 2 + 0.3, 0.1, cs * 2 + 0.3, mat(C.chute, { transparent: true, opacity: 0.5 }), 0, topY + 0.02, 0, halfL);
    lip.castShadow = false;
    const lipHole = box(cs * 2, 0.12, cs * 2, mat(0x10151d), 0, topY + 0.03, 0, halfL);
    lipHole.castShadow = false;
  }

  // --- Blade banks. Both banks share the same cutting plane so the engaged
  // blades interleave into ONE dicer grid. Each blade is a tall, thin knife
  // strip; the strip is long enough to span magazine -> chamber -> receiver
  // at full extension, so blades slide, never pop.
  const offs = bladeOffsets();
  const xBlades = [], zBlades = [];
  const BLADE_LEN = GEO.parts.bladeLen;
  offs.forEach((o) => {
    // X bank: strip length along X (its travel axis) at blade line z=o.
    // The blade slides tip-first along +X from the origin magazine, across
    // the chamber, into the far receiver. Cutting edge faces up.
    const bx = mkBlade(BLADE_LEN);
    bx.position.set(GEO.xTravelMin, GEO.xBankY - GEO.bladeDepth, o);
    bx.visible = false; halfR.add(bx); xBlades.push(bx);
    // Z bank: strip length along Z (its travel axis) at blade line x=o
    const bz = mkBlade(BLADE_LEN);
    bz.rotation.y = -Math.PI / 2;      // strip length now along Z
    bz.position.set(o, GEO.zBankY - GEO.bladeDepth, GEO.zTravelMin);
    bz.visible = false; halfL.add(bz); zBlades.push(bz);
  });

  // Slim magazines hug the outer walls (X bank on halfR, Z bank on halfL)
  const xMag = mkMagazine(D + 0.2, GEO.magazine.r); halfR.add(xMag);
  xMag.rotation.y = Math.PI / 2; // magazine length along Z
  xMag.position.set(GEO.xTravelMin - GEO.magazine.r - 0.12, GEO.xBankY - GEO.bladeDepth / 2, 0);
  const zMag = mkMagazine(W + 0.2, GEO.magazine.r); halfL.add(zMag);
  zMag.position.set(0, GEO.zBankY - GEO.bladeDepth / 2, GEO.zTravelMin - GEO.magazine.r - 0.12);

  // wipers at the food-zone/storage boundary — squeegee lips
  const xWiper = box(0.1, 0.34, D, mat(C.green, { roughness: 0.7 }), GEO.xTravelMin + GEO.parts.wiperOffset, GEO.xBankY, 0, halfR);
  const xWiperLip = box(0.06, 0.12, D, mat(C.green, { roughness: 0.7 }), GEO.xTravelMin + GEO.parts.wiperOffset + 0.06, GEO.xBankY - 0.2, 0, halfR);
  const zWiper = box(W, 0.34, 0.1, mat(C.green, { roughness: 0.7 }), 0, GEO.zBankY, GEO.zTravelMin + GEO.parts.wiperOffset, halfL);
  const zWiperLip = box(W, 0.12, 0.06, mat(C.green, { roughness: 0.7 }), 0, GEO.zBankY - 0.2, GEO.zTravelMin + GEO.parts.wiperOffset + 0.06, halfL);

  // far receivers: slotted combs the blade tips seat into
  const xRecv = mkComb(D, 0.34, GEO.parts.combDepth, C.receiver, true); halfR.add(xRecv);
  xRecv.position.set(GEO.xTravelMax + GEO.parts.combOffset, GEO.xBankY - 0.17, 0);
  const zRecv = mkComb(W, 0.34, GEO.parts.combDepth, C.receiver, false); halfL.add(zRecv);
  zRecv.position.set(0, GEO.zBankY - 0.17, GEO.zTravelMax + GEO.parts.combOffset);

  // origin + far lock clamps: slotted combs that close onto the blade sides
  // through the slots — they clamp the grid, never cross a blade edge
  const mkLock = (alongX) => mkComb(alongX ? D : W, 0.4, GEO.parts.railDepth, C.lock, alongX);
  const originRailX = mkLock(true); halfR.add(originRailX);
  originRailX.position.set(GEO.xTravelMin - GEO.parts.railOffsetOrigin, GEO.xBankY - 0.2, 0);
  const farRailX = mkLock(true); halfR.add(farRailX);
  farRailX.position.set(GEO.xTravelMax + GEO.parts.railOffsetFar, GEO.xBankY - 0.2, 0);
  const originRailZ = mkLock(false); halfL.add(originRailZ);
  originRailZ.position.set(0, GEO.zBankY - 0.2, GEO.zTravelMin - GEO.parts.railOffsetOrigin);
  const farRailZ = mkLock(false); halfL.add(farRailZ);
  farRailZ.position.set(0, GEO.zBankY - 0.2, GEO.zTravelMax + GEO.parts.railOffsetFar);

  // selector shuttle: a pair of stroke arms (one per bank) that the selector
  // cam swings to the coded position. Kept visually simple — a clean bar per
  // bank — so the grid stays readable.
  const shuttle = new THREE.Group(); cassette.add(shuttle);
  const fingerM = mat(C.dryAccent, { metalness: 0.45, roughness: 0.4 });
  const shuttleArmX = new THREE.Group(); shuttle.add(shuttleArmX);
  box(0.2, 0.14, D, fingerM, 0, 0, 0, shuttleArmX);
  cyl(0.09, 0.09, 0.3, fingerM, 0.14, 0, 0, shuttleArmX).rotation.x = Math.PI / 2;
  shuttleArmX.position.set(GEO.xTravelMin - 0.55, GEO.xBankY - GEO.bladeDepth, 0);
  const shuttleArmZ = new THREE.Group(); shuttle.add(shuttleArmZ);
  box(W, 0.14, 0.2, fingerM, 0, 0, 0, shuttleArmZ);
  cyl(0.09, 0.09, 0.3, fingerM, 0, 0, 0.14, shuttleArmZ);
  shuttleArmZ.position.set(0, GEO.zBankY - GEO.bladeDepth, GEO.zTravelMin - 0.55);

  // --- pusher: a waffle of square posts. Post columns align with the GAPS
  // between blade lines; slots align with every blade line, so the pusher
  // presses produce all the way through the grid without touching a blade.
  const pusher = new THREE.Group(); cassette.add(pusher);
  const p = GEO.pusher;
  const plateM = mat(C.wet, { metalness: 0.2, roughness: 0.4 });
  const T = p.faceThickness;
  {
    const edge = (GEO.bladesPerBank - 1) / 2 * GEO.pitch + GEO.pitch / 2; // outer slot edge
    const postHalf = (GEO.pitch - p.slotWidth) / 2;
    // top plate (thin, holds the posts together)
    box(edge * 2, T * 0.55, edge * 2, plateM, 0, T * 0.45, 0, pusher);
    // waffle posts between blade lines
    for (let ix = 0; ix < GEO.bladesPerBank - 1; ix++) {
      const cx = (ix - (GEO.bladesPerBank - 2) / 2) * GEO.pitch;
      for (let iz = 0; iz < GEO.bladesPerBank - 1; iz++) {
        const cz = (iz - (GEO.bladesPerBank - 2) / 2) * GEO.pitch;
        box(postHalf * 2, T * 1.6, postHalf * 2, plateM, cx, -T * 0.4, cz, pusher).castShadow = false;
      }
    }
  }
  // guide shoes ride the front/back chute walls + a short drive collar on top
  // that stays below the chute lip at the service stop (serviceY 6.15 vs lip
  // at ~6.37), and the drive screw is short enough not to pierce the lip.
  box(0.3, 0.4, 0.08, mat(C.green), 0, 0, GEO.chuteSize / 2 + 0.03, pusher);
  box(0.3, 0.4, 0.08, mat(C.green), 0, 0, -GEO.chuteSize / 2 - 0.03, pusher);
  const driveCollar = cyl(0.16, 0.19, 0.2, mat(C.dryAccent, { metalness: 0.6 }), 0, 0.14, 0, pusher, 20);
  const driveScrew = cyl(0.06, 0.06, 0.25, STEEL(), 0, 0.3, 0, pusher, 12);
  driveScrew.castShadow = false;
  pusher.position.set(0, p.serviceY, 0);

  // stripper — a light frame that slides down the chute to strip stuck pieces
  // off the pusher posts; its opening clears the pusher plate
  const stripper = new THREE.Group(); cassette.add(stripper);
  {
    const sm = mat(C.green, { roughness: 0.6 });
    const e = GEO.chuteSize / 2 + 0.14;
    box(e * 2, 0.08, 0.12, sm, 0, 0, e - 0.06, stripper).castShadow = false;
    box(e * 2, 0.08, 0.12, sm, 0, 0, -e + 0.06, stripper).castShadow = false;
    box(0.12, 0.08, e * 2, sm, e - 0.06, 0, 0, stripper).castShadow = false;
    box(0.12, 0.08, e * 2, sm, -e + 0.06, 0, 0, stripper).castShadow = false;
  }
  stripper.position.set(0, p.serviceY + 0.25, 0);

  // crosscut knife + carrier (below the grid, travels along X)
  const crosscut = new THREE.Group(); cassette.add(crosscut);
  {
    const knife = box(GEO.chamber.w - 0.1, 0.26, 0.05, BLADE(), 0, 0, 0, crosscut);
    // ground edge along the bottom of the knife
    const edgeGeo = new THREE.CylinderGeometry(0, 0.05, GEO.chamber.w - 0.1, 4, 1);
    const edge = new THREE.Mesh(edgeGeo, BLADE());
    edge.rotation.z = Math.PI / 2; edge.rotation.x = Math.PI / 4;
    edge.position.set(0, -0.14, 0); edge.castShadow = false; crosscut.add(edge);
    const shoe = box(0.3, 0.22, 0.4, mat(C.wetDark), -GEO.chamber.w / 2 - 0.1, 0, 0, crosscut);
    shoe.castShadow = false;
    // short guide rail that travels with the knife but stays within the
    // chamber width — never long enough to reach the bin walls or plinth
    const rail = cyl(0.05, 0.05, GEO.chamber.w - 0.2, STEEL(), 0, -0.24, 0, crosscut, 12);
    rail.rotation.z = Math.PI / 2; rail.castShadow = false;
  }
  crosscut.position.set(GEO.crosscut.dockX, GEO.crosscutY, 0);

  // output bin — open-top drawer with wall shell, base plate and a handle
  const bin = new THREE.Group(); cassette.add(bin);
  {
    const bm = () => mat(C.bin, { transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const { w: bw, h: bh, d: bd } = GEO.bin;
    const wallT = 0.06;
    [[bw, bh, wallT, 0, 0, bd / 2], [bw, bh, wallT, 0, 0, -bd / 2],
     [wallT, bh, bd, bw / 2, 0, 0], [wallT, bh, bd, -bw / 2, 0, 0]].forEach(([w, h, d, x, y, z]) => {
      const m2 = box(w, h, d, bm(), x, y, z, bin); m2.castShadow = false;
    });
    box(bw, 0.08, bd, mat(C.steel, { metalness: 0.6, roughness: 0.4 }), 0, -bh / 2 - 0.04, 0, bin);
    const handle = cyl(0.04, 0.04, bw * 0.5, STEEL(), 0, bh / 2 + 0.12, bd / 2 + 0.08, bin, 12);
    handle.rotation.z = Math.PI / 2; handle.castShadow = false;
    box(0.05, 0.14, 0.05, STEEL(), -bw * 0.25, bh / 2 + 0.04, bd / 2 + 0.08, bin).castShadow = false;
    box(0.05, 0.14, 0.05, STEEL(), bw * 0.25, bh / 2 + 0.04, bd / 2 + 0.08, bin).castShadow = false;
  }
  bin.position.set(0, GEO.bin.y, 0);

  // produce models
  const mkCarrot = () => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.03, 1.6, 18), mat(C.carrot, { roughness: 0.6 }));
    c.castShadow = true; g.add(c);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 10), mat(C.carrot, { roughness: 0.6 }));
    tip.position.y = -0.86; tip.rotation.x = Math.PI; g.add(tip);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 6), mat(C.green, { roughness: 0.7 }));
      leaf.position.set((i - 1) * 0.07, 0.95, (i % 2) * 0.05 - 0.02);
      leaf.rotation.z = (i - 1) * 0.35; g.add(leaf);
    }
    return g;
  };
  const mkPotato = () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.52, 22, 16), mat(C.potato, { roughness: 0.85 }));
    s.scale.set(1, 0.78, 0.85); s.castShadow = true; g.add(s);
    [[0.3, 0.25, 0.3], [-0.25, 0.3, -0.2], [0.1, -0.3, 0.35]].forEach(([x, y, z]) =>
      sph(0.035, mat(0x9c7c4e, { roughness: 0.9 }), x, y, z, g, 8, 6).castShadow = false);
    return g;
  };
  const produce = { carrot: mkCarrot(), potato: mkPotato() };
  produce.carrot.position.set(0, GEO.chuteTop + 0.6, 0); produce.carrot.visible = false; cassette.add(produce.carrot);
  produce.potato.position.set(0, GEO.chuteTop + 0.6, 0); produce.potato.visible = false; cassette.add(produce.potato);

  // cut piece pools — sticks (grid-only), cubes (dice), coins (slice)
  const mkPool = (n, make) => {
    const arr = [];
    for (let i = 0; i < n; i++) { const m = make(); m.visible = false; cassette.add(m); arr.push(m); }
    return arr;
  };
  const sticks = mkPool(16, () => box(0.13, 0.13, 1.0, mat(C.cut, { roughness: 0.7 })));
  const cubes = mkPool(32, () => box(0.15, 0.15, 0.15, mat(C.cut, { roughness: 0.7 })));
  const coinGroups = mkPool(16, () => {
    const g = new THREE.Group();
    const c = cyl(0.16, 0.16, 0.05, mat(C.carrot, { roughness: 0.65 }), 0, 0, 0, g, 20);
    c.castShadow = false;
    return g;
  });
  const piecePools = { stick: sticks, cube: cubes, coin: coinGroups };

  // active-mechanism motion arrow (repositioned per phase)
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1.4, 0x00ff9d, 0.3, 0.18);
  scene.add(arrow);

  return {
    renderer, scene, camera,
    nodes: {
      dry, cassette, halfL, halfR, D1, camshaft, cams, D2, electronics, coupling,
      xBlades, zBlades, xWiper, zWiper, xWiperLip, zWiperLip, xMag, zMag, xRecv, zRecv,
      originRailX, farRailX, originRailZ, farRailZ,
      shuttle, shuttleArmX, shuttleArmZ, pusher, driveCollar, stripper, crosscut, bin,
      produce, piecePools, arrow,
    },
  };
}

// Scatter pieces loosely in the bin — deterministic spiral layout per index.
function pileInBin(m, i, n) {
  const golden = 2.39996;
  const r = 0.1 + 0.55 * Math.sqrt((i + 0.5) / Math.max(1, n));
  const a = i * golden;
  m.position.set(Math.cos(a) * r, GEO.bin.y - GEO.bin.h / 2 + 0.12 + Math.floor(i / 10) * 0.12, Math.sin(a) * r);
  m.rotation.set((i * 0.7) % 1.2 - 0.6, a, (i * 1.1) % 0.9 - 0.45);
}

// Map a kinematic state onto the scene graph.
export function applyStateToScene(nodes, s, camAngle) {
  const {
    cassette, halfL, halfR, coupling, D2, D1,
    xBlades, zBlades, originRailX, farRailX, originRailZ, farRailZ,
    shuttle, shuttleArmX, shuttleArmZ, pusher, stripper, crosscut, produce, piecePools, arrow, camshaft,
  } = nodes;
  const P = GEO.pusher;

  // camshaft + cams rotate with cycle progress; D1 shaft counter-rotates
  camshaft.rotation.x = (s.selectorProgress + s.feedProgress + camAngle) * Math.PI * 2;
  D1.rotation.x = -camshaft.rotation.x * 2.5;

  // blades: engaged blades slide tip-first out of the origin magazine,
  // through the wiper, across the chamber, and seat into the far receiver.
  // Parked (non-engaged) blades stay visible inside the magazines so the
  // storage reads as loaded, not empty.
  const engaged = new Set(s.selectedIndices);
  const travelX = GEO.xTravelMax - GEO.xTravelMin;
  const travelZ = GEO.zTravelMax - GEO.zTravelMin;
  xBlades.forEach((b, i) => {
    const on = engaged.has(i) && s.tailEngaged[i];
    const ext = on ? s.bladeExtend : 0;
    b.visible = true; // parked blades sit inside the magazine
    b.position.x = GEO.xTravelMin - GEO.parts.bladeParkedInset + (travelX + GEO.parts.bladeOvertravel) * ext;
  });
  zBlades.forEach((b, i) => {
    const on = engaged.has(i) && s.tailEngaged[i];
    const ext = on ? s.bladeExtend : 0;
    b.visible = true;
    b.position.z = GEO.zTravelMin - GEO.parts.bladeParkedInset + (travelZ + GEO.parts.bladeOvertravel) * ext;
  });

  // lock clamps close onto the blade sides through the comb slots
  const lockIn = GEO.parts.lockStroke;
  originRailX.position.x = GEO.xTravelMin - GEO.parts.railOffsetOrigin + s.originLock * lockIn;
  farRailX.position.x = GEO.xTravelMax + GEO.parts.railOffsetFar - s.farLock * lockIn;
  originRailZ.position.z = GEO.zTravelMin - GEO.parts.railOffsetOrigin + s.originLock * lockIn;
  farRailZ.position.z = GEO.zTravelMax + GEO.parts.railOffsetFar - s.farLock * lockIn;

  // pusher + stripper
  pusher.position.y = s.pusherY;
  stripper.position.y = s.pusherY + 0.35 - s.stripProgress * 0.5;

  // crosscut
  crosscut.position.x = s.crosscutX;

  // produce: rests on the grid plane while loaded; sinks as it is pushed
  // through. Pusher contacts its TOP — never clips through it.
  ['carrot', 'potato'].forEach((kind) => {
    const m = produce[kind];
    if (s.produce === kind && s.produceLoaded && s.feedProgress < 0.999) {
      m.visible = true;
      const restY = GEO.xBankY + 0.1;          // rests on the grid
      m.position.y = restY + (1 - s.feedProgress) * 0.9;
      m.rotation.y = kind === 'carrot' ? 0.2 : 0;
    } else m.visible = false;
  });

  // cut pieces: kind from state provenance. They spawn at the grid and DROP
  // through the floor opening into the bin over the crosscut/strip phases.
  const counts = { stick: 0, cube: 0, coin: 0 };
  s.cutPieces.forEach(pc => { counts[pc.kind] = (counts[pc.kind] || 0) + 1; });
  const drop = Math.min(1, s.stripProgress * 1.5 + (s.phaseId === 'park' || s.phaseId === 'disengage' ? 1 : 0));
  Object.entries(piecePools).forEach(([kind, pool]) => {
    const n = counts[kind] || 0;
    pool.forEach((m, i) => {
      const on = i < n && s.feedProgress >= 0.999 && s.extractProgress <= 0;
      m.visible = on;
      if (on) {
        pileInBin(m, i, Math.max(n, 1));
        // raise toward the grid before drop completes (falling path)
        const gy = GEO.crosscutY - 0.2 - i * 0.03;
        const by = m.position.y;
        m.position.y = gy + (by - gy) * drop;
      }
    });
  });

  // dry/wet coupling lifts on disengage; D2 latch lever swings
  coupling.position.y = 2.0 + (s.couplingEngaged ? 0 : 0.35);
  coupling.visible = s.extractProgress <= 0.001;
  coupling.rotation.y = camAngle * 2;
  D2.rotation.x = -(s.couplingEngaged ? 0 : 0.6) - s.extractProgress * 0.2;

  // cassette extraction (+Z) then unfold. The halves fan about the REAR
  // HINGE axis (hingeX, hingeY), not the cassette origin: for rotation by
  // angle A about point (hx,hy), the group's new position is
  //   p' = h − R(A)·h  (so geometry at the hinge stays fixed).
  // The shallow fan angle keeps every part above the ground plane.
  cassette.position.z = GEO.cassette.seatZ + s.extractProgress * GEO.cassette.extractTravel;
  const a = s.unfoldProgress * GEO.cassette.unfoldAngle;
  const hx = -1.15, hy = 2.4; // hinge axis (matches the hinge barrel mesh)
  const setFan = (half, A) => {
    half.rotation.z = A;
    half.position.set(
      hx - (hx * Math.cos(A) - hy * Math.sin(A)),
      hy - (hx * Math.sin(A) + hy * Math.cos(A)),
      0);
  };
  setFan(halfL, a / 2);
  setFan(halfR, -a / 2);

  // shuttle rides on the cassette, so it extracts with it (no cross-collision)
  shuttle.visible = true;
  // selector cam swings the finger arms into the coded tail positions
  shuttleArmX.rotation.y = -s.selectorProgress * 0.5;
  shuttleArmZ.rotation.y = s.selectorProgress * 0.5;

  // active-mechanism arrow: point along the active DOF at the active part
  const mechPos = {
    C1: [GEO.xTravelMin - 0.55, GEO.xBankY - GEO.bladeDepth, 0, 1, 0, 0],
    selectorShuttle: [GEO.xTravelMin - 0.55, GEO.zBankY - GEO.bladeDepth, 0, 0, 0, 1],
    C2: [GEO.xTravelMax + GEO.parts.railOffsetFar, GEO.xBankY, 0, -1, 0, 0],
    C3: [0, s.pusherY, 0, 0, -1, 0],
    C4: [s.crosscutX, GEO.crosscutY, 0, 1, 0, 0],
    C5: [0, s.pusherY + 0.3, 0, 0, -1, 0],
    D2: [0, 1.4, 2.0 + s.extractProgress * GEO.cassette.extractTravel, 0, 0, 1],
  }[s._activeMech];
  if (mechPos) {
    arrow.visible = true;
    arrow.position.set(mechPos[0], mechPos[1], mechPos[2]);
    arrow.setDirection(new THREE.Vector3(mechPos[3], mechPos[4], mechPos[5]));
  } else arrow.visible = false;
}
