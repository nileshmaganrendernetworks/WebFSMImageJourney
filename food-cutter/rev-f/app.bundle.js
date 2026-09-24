import * as THREE from './three.module.js';

/* ===== config.js ===== */
// Rev F — data-driven geometry, patterns, part and drive registry.
// All scene measurements live here (normalised units) so checks can assert
// clearances without touching rendering code. No literals scattered elsewhere.

const GEO = {
  // Blade banks -----------------------------------------------------------
  bladesPerBank: 13,           // conceptual blade lines per bank
  pitch: 0.44,                 // scene-normalised 4 mm equivalent
  bladeThickness: 0.055,
  bladeDepth: 0.42,            // vertical extent of a blade strip
  xBankY: 2.58,                // Y plane of the X-bank (blades slide along X)
  zBankY: 3.12,                // Y plane of the Z-bank (blades slide along Z)
  crosscutY: 1.24,             // Y plane of the lower crosscut knife
  xTravelMin: -3.55,           // X blade travel, origin side
  xTravelMax: 3.55,            // X blade travel, far side
  zTravelMin: -2.65,           // Z blade travel, origin side
  zTravelMax: 2.65,            // Z blade travel, far side

  // Food chamber ----------------------------------------------------------
  chamber: { w: 2.4, h: 2.2, d: 2.4, floorY: 1.62 },
  chuteTop: 6.4,               // top of feed chute

  // Pusher ----------------------------------------------------------------
  pusher: {
    faceThickness: 0.22,
    slotWidth: 0.09,           // clearance slot at every blade line
    serviceY: 5.55,            // upper service/load hard stop
    feedLimitY: 0.92,          // lower feed travel limit (purge bottom)
    contactY: 4.05,            // upper contact stop after loading
  },

  // Crosscut --------------------------------------------------------------
  crosscut: { travelMin: -1.7, travelMax: 1.7, dockX: -2.25 },

  // Cassette --------------------------------------------------------------
  cassette: {
    extractTravel: 4.6,        // +Z linear pull-out
    unfoldAngle: 2.35,         // rad, fan-open of the two wet halves
    seatZ: 0,
  },

  // Blade carrier storage (origin-side magazines, explicit — no tiny boxes)
  magazine: { xX: -4.55, xZ: -3.55, length: 1.7 },

  // Derived part extents used by both rendering and collision checks.
  // Keep the rendered scene and the assertions reading the same numbers.
  parts: {
    bladeLen: 0,               // set below (needs travel range)
    bladeTailLen: 0.22,        // drive tail hook behind the strip
    bladeParkedInset: 0.4,     // tip sits this far behind travel min when parked
    bladeOvertravel: 0.65,     // extra slide so the tip seats into the receiver
    railDepth: 0.26,           // lock-rail head width along travel axis
    railOffsetOrigin: 0.25,    // origin rail centre offset from travel min
    railOffsetFar: 0.52,       // far rail centre offset from travel max
    lockStroke: 0.28,          // rail closure travel
    combDepth: 0.14,           // receiver tooth width along travel axis
    combOffset: 0.25,          // receiver centre offset from travel max
    wiperDepth: 0.1,           // wiper block width along travel axis
    wiperOffset: 0.1,          // wiper centre offset from travel min
  },
};
// Blade strip spans magazine -> chamber -> receiver at full extension.
GEO.parts.bladeLen = (GEO.xTravelMax - GEO.xTravelMin) + 1.1;

// Derived: blade line offsets (centred), used by checks + rendering.
function bladeOffsets() {
  const n = GEO.bladesPerBank;
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => (i - mid) * GEO.pitch);
}

// Cut patterns: which blade indices are engaged per programmed size.
// every blade = 4 mm, every 2nd = 8 mm, every 3rd = 12 mm, 5th = 20 mm.
const PATTERNS = {
  '4mm':  { label: 'Dice 4 mm',  step: 1, slice: false },
  '8mm':  { label: 'Dice 8 mm',  step: 2, slice: false },  // carrot default
  '12mm': { label: 'Dice 12 mm', step: 3, slice: false },
  '20mm': { label: 'Dice 20 mm', step: 5, slice: false },
  'slice': { label: 'Slice',     step: 0, slice: true },   // crosscut only
};

function patternIndices(key) {
  const p = PATTERNS[key];
  if (!p) throw new Error(`unknown pattern ${key}`);
  if (p.slice) return [];
  const idx = [];
  for (let i = 0; i < GEO.bladesPerBank; i += p.step) idx.push(i);
  return idx;
}

// Part registry — every moving part has actuator, DOF, attachment, hard stop,
// interlock. Used by the inspection UI and the mechanism-map overlay.
const PARTS = {
  D1: { name: 'Cycle gearmotor', kind: 'drive', dof: 'rotation', attaches: ['camshaft'], note: 'Single motor drives the whole cycle. NOT one motor per blade.' },
  camshaft: { name: 'Camshaft', kind: 'drive', dof: 'rotation', drivenBy: 'D1', attaches: ['C1', 'C2', 'C3', 'C4', 'C5'] },
  C1: { name: 'Selector cam', kind: 'cam', dof: 'rotation → linear stroke', drivenBy: 'camshaft', attaches: ['selectorShuttle'] },
  C2: { name: 'Lock cam', kind: 'cam', dof: 'rotation → opposed rail closure', drivenBy: 'camshaft', attaches: ['originRail', 'farRail'] },
  C3: { name: 'Pusher drive (crank/lead screw)', kind: 'cam', dof: 'rotation → Y feed', drivenBy: 'camshaft', attaches: ['pusher'], via: 'dryWetCoupling' },
  C4: { name: 'Crosscut crank', kind: 'cam', dof: 'rotation → X sweep', drivenBy: 'camshaft', attaches: ['crosscut'] },
  C5: { name: 'Return stripper cam', kind: 'cam', dof: 'short relative stroke', drivenBy: 'camshaft', attaches: ['stripper'] },
  D2: { name: 'Cassette latch / release (manual)', kind: 'latch', dof: 'pivot', attaches: ['dryWetCoupling', 'captureRails'], note: 'Manual release, not a motor.' },
  selectorShuttle: { name: 'Common selector shuttle', kind: 'linkage', dof: 'X+Z stroke', drivenBy: 'C1', note: 'One assembly, one X arm + one Z arm. Engages only selected tails.' },
  pusher: { name: 'Slotted pusher lattice', kind: 'press', dof: 'Y', drivenBy: 'C3', hardStops: ['serviceY', 'feedLimitY'] },
  stripper: { name: 'Stripper plate', kind: 'press', dof: 'Y (relative)', drivenBy: 'C5' },
  crosscut: { name: 'Crosscut knife + carrier', kind: 'knife', dof: 'X', drivenBy: 'C4', hardStops: ['dockX'] },
  originRail: { name: 'Origin reaction rail', kind: 'lock', dof: 'normal-to-tip', drivenBy: 'C2' },
  farRail: { name: 'Far receiver lock rail', kind: 'lock', dof: 'normal-to-tip', drivenBy: 'C2' },
  cassette: { name: 'Wet cassette', kind: 'assembly', dof: 'extract(Z) + unfold(fan)', drivenBy: 'D2', note: 'All food-contact surfaces. Dishwasher-safe.' },
};

// Unvalidated physical gates — must stay visible in the UI.
const UNVALIDATED = [
  'Worst-case hard-food force (beetroot, raw sweet potato) — physical test gate, not a claim',
  'Blade buckling, deflection, edge life, fatigue',
  'Optimum draw stroke / cutting speed',
  'Fibre clearing in celery / onion / herbs',
  'Dishwasher sanitation / cleanability validation',
  'Food-contact compliance, certification, materials, cost',
  'Blade storage concept: rigid-strip magazine length shown; spring-reel/ribbon stiffness UNRESOLVED',
];


/* ===== stateMachine.js ===== */
// Rev F — explicit kinematic state machine with interlock assertions.
// Pure logic: no Three.js imports, so it runs identically in Node tests
// and in the browser. The renderer samples this state; it never invents motion.


// The 15 mechanism phases, in order. Each has a named active mechanism,
// a duration (s), and a driver function that maps phase progress k∈[0,1]
// to state variables. Keep pure: same (state,k) → same partial state.
const MECH_PHASES = [
  { id: 'stored',        label: 'Stored / parked',            mech: '—',            dur: 1.0 },
  { id: 'select',        label: 'Select pattern',             mech: 'C1',           dur: 1.4 },
  { id: 'engage',        label: 'Engage tails',               mech: 'selectorShuttle', dur: 1.2 },
  { id: 'extend',        label: 'Extend blades',              mech: 'selectorShuttle', dur: 2.0 },
  { id: 'seat',          label: 'Seat receivers',             mech: 'selectorShuttle', dur: 1.2 },
  { id: 'lock',          label: 'Lock load path',             mech: 'C2',           dur: 1.2 },
  { id: 'feed',          label: 'Feed through grid',          mech: 'C3',           dur: 2.6 },
  { id: 'crosscut',      label: 'Crosscut below',             mech: 'C4',           dur: 1.8 },
  { id: 'unlock',        label: 'Release locks',              mech: 'C2',           dur: 1.0 },
  { id: 'wipe',          label: 'Wipe / retract',             mech: 'selectorShuttle', dur: 1.8 },
  { id: 'strip',         label: 'Strip pusher',               mech: 'C5',           dur: 1.2 },
  { id: 'park',          label: 'Park cutters',               mech: '—',            dur: 0.8 },
  { id: 'disengage',     label: 'Disengage dry coupling',     mech: 'D2',           dur: 1.0 },
  { id: 'extract',       label: 'Extract cassette',           mech: 'D2',           dur: 1.6 },
  { id: 'unfold',        label: 'Unfold for wash',            mech: 'D2',           dur: 1.4 },
];

// The 26-phase user workflow = two produce cycles + teardown.
// Each step references a mechanism phase and carries its own context.
const WORKFLOW = [
  { n: 1,  label: 'Load carrot',            phase: 'stored',     produce: 'carrot' },
  { n: 2,  label: 'Select carrot 8 mm',     phase: 'select',     produce: 'carrot', pattern: '8mm' },
  { n: 3,  label: 'Engage carrot tails',    phase: 'engage',     produce: 'carrot' },
  { n: 4,  label: 'Extend carrot blades',   phase: 'extend',     produce: 'carrot' },
  { n: 5,  label: 'Seat carrot receivers',  phase: 'seat',       produce: 'carrot' },
  { n: 6,  label: 'Lock carrot load path',  phase: 'lock',       produce: 'carrot' },
  { n: 7,  label: 'Cut carrot',             phase: 'feed',       produce: 'carrot' },
  { n: 8,  label: 'Crosscut carrot',        phase: 'crosscut',   produce: 'carrot' },
  { n: 9,  label: 'Release carrot locks',   phase: 'unlock',     produce: 'carrot' },
  { n: 10, label: 'Wipe/retract carrot',    phase: 'wipe',       produce: 'carrot' },
  { n: 11, label: 'Unload carrot pieces',   phase: 'strip',      produce: 'carrot' },
  { n: 12, label: 'Change size',            phase: 'select',     produce: null,  sizeChange: true },
  { n: 13, label: 'Load potato',            phase: 'stored',     produce: 'potato', load: true },
  { n: 14, label: 'Select potato size',     phase: 'select',     produce: 'potato' },
  { n: 15, label: 'Engage potato tails',    phase: 'engage',     produce: 'potato' },
  { n: 16, label: 'Extend potato blades',   phase: 'extend',     produce: 'potato' },
  { n: 17, label: 'Seat potato receivers',  phase: 'seat',       produce: 'potato' },
  { n: 18, label: 'Lock potato load path',  phase: 'lock',       produce: 'potato' },
  { n: 19, label: 'Cut potato',             phase: 'feed',       produce: 'potato' },
  { n: 20, label: 'Crosscut potato',        phase: 'crosscut',   produce: 'potato' },
  { n: 21, label: 'Release potato locks',   phase: 'unlock',     produce: 'potato' },
  { n: 22, label: 'Wipe/retract potato',    phase: 'wipe',       produce: 'potato' },
  { n: 23, label: 'Unload potato pieces',   phase: 'strip',      produce: 'potato' },
  { n: 24, label: 'Disengage dry drive',    phase: 'disengage',  produce: null },
  { n: 25, label: 'Extract wet cassette',   phase: 'extract',    produce: null },
  { n: 26, label: 'Unfold for dishwasher',  phase: 'unfold',     produce: null },
];

function initialState() {
  return {
    patternKey: null,
    selectedIndices: [],
    selectorProgress: 0,      // C1 cam
    tailEngaged: [],          // per blade index bool
    bladeExtend: 0,           // 0..1 along travel
    receiverSeated: false,
    originLock: 0, farLock: 0, // 0..1 closed
    pusherY: GEO.pusher.serviceY,
    pusherAtService: true,
    feedProgress: 0,
    crosscutX: GEO.crosscut.dockX,
    crosscutParked: true,
    stripProgress: 0,
    wiperProgress: 0,
    couplingEngaged: true,
    extractProgress: 0,
    unfoldProgress: 0,
    produce: null,            // 'carrot' | 'potato' | null
    produceLoaded: false,
    cutPieces: [],            // causal provenance: {produce, kind:'stick'|'cube'|'coin', i}
    phaseId: 'stored',
    stepN: 0,
  };
}

// Interlock / assertion set. Each returns true if the state is LEGAL.
// The UI lists these; tests sample every phase/pattern against them.
const ASSERTIONS = [
  { id: 'banks-parallel',   text: 'X and Z banks never intersect', check: () => GEO.zBankY - GEO.xBankY > GEO.bladeDepth + 0.05 },
  { id: 'extend-after-engage', text: 'No blade extends before tail engagement', check: s => s.bladeExtend <= 0 || s.tailEngaged.some(Boolean) },
  { id: 'seat-after-travel', text: 'Receiver seated only after tip travel completes', check: s => !s.receiverSeated || s.bladeExtend >= 0.999 },
  { id: 'lock-after-seat',  text: 'Locks close only after receiver seating (when blades are engaged)', check: s => (s.originLock <= 0 && s.farLock <= 0) || s.selectedIndices.length === 0 || s.receiverSeated },
  { id: 'feed-needs-locks', text: 'Feed progresses only while both locks are closed', check: s => s.feedProgress <= 0 || s.feedProgress >= 0.999 || (s.originLock >= 0.999 && s.farLock >= 0.999) },
  { id: 'crosscut-clear-of-purge', text: 'Crosscut never sweeps during pusher purge', check: s => !(s.stripProgress > 0 && s.crosscutX > GEO.crosscut.dockX + 0.01) },
  { id: 'unlock-after-feed', text: 'Locks may only open after feed has completed', check: s => !(s.feedProgress > 0 && s.feedProgress < 0.999 && (s.originLock < 0.999 || s.farLock < 0.999)) },
  { id: 'retract-after-unlock', text: 'Retract only after locks release', check: s => s.wiperProgress <= 0 || (s.originLock <= 0.001 && s.farLock <= 0.001) },
  { id: 'extract-safe',     text: 'Extraction only when cutters/locks/coupling inactive', check: s => s.extractProgress <= 0 || (s.bladeExtend <= 0 && s.crosscutParked && s.originLock <= 0.001 && s.farLock <= 0.001 && !s.couplingEngaged) },
  { id: 'extract-pusher-parked', text: 'Pusher at service stop before extraction', check: s => s.extractProgress <= 0 || s.pusherAtService },
  { id: 'unfold-after-extract', text: 'Unfold only after extraction complete', check: s => s.unfoldProgress <= 0 || s.extractProgress >= 0.999 },
  { id: 'load-clearance',   text: 'Pusher stays out of the produce envelope while produce is entering', check: s => !(s.produceLoaded && s.feedProgress <= 0 && (s.phaseId === 'stored' || s.phaseId === 'select' || s.phaseId === 'engage')) || s.pusherY >= GEO.pusher.contactY - 0.001 },
  { id: 'pusher-slot-clearance', text: 'Pusher slots clear every blade line', check: () => GEO.pusher.slotWidth > GEO.bladeThickness + 0.02 },
  { id: 'bank-crosscut-clearance', text: 'Crosscut clears both bank planes', check: () => (GEO.xBankY - GEO.crosscutY) > GEO.bladeDepth / 2 + 0.1 },
  { id: 'piece-provenance', text: 'Cut pieces reference modeled produce', check: s => s.cutPieces.every(p => p.produce === 'carrot' || p.produce === 'potato') },
];

function checkState(s) {
  return ASSERTIONS.map(a => ({ id: a.id, text: a.text, ok: !!a.check(s) }));
}

// Drive a mechanism phase into the state. k = eased progress 0..1.
// Returns a NEW state (immutability keeps provenance/teleport checks honest).
function applyPhase(prev, step, k) {
  const s = { ...prev, tailEngaged: [...prev.tailEngaged], cutPieces: [...prev.cutPieces] };
  s.phaseId = step.phase; s.stepN = step.n;
  const P = GEO.pusher;
  const pattern = step.pattern || s.patternKey;

  switch (step.phase) {
    case 'stored':
      s.stripProgress = 0; // stripper returns with the parked pusher between cycles
      if (step.load || step.n === 1) {
        // pusher parks above/outside chamber; produce settles below it
        s.pusherY = P.serviceY; s.pusherAtService = true;
        if (k > 0.4 && step.produce) { s.produce = step.produce; s.produceLoaded = true; }
        // then pusher advances to upper contact stop
        if (s.produceLoaded) s.pusherY = P.serviceY - (P.serviceY - P.contactY) * Math.max(0, (k - 0.5) / 0.5);
        s.pusherAtService = k < 0.5;
      }
      break;
    case 'select':
      if (step.sizeChange) { s.patternKey = s._pendingPattern || '12mm'; s.selectedIndices = patternIndices(s.patternKey); break; }
      s.patternKey = pattern; s.selectedIndices = patternIndices(pattern);
      s.wiperProgress = 0; // a new selection starts with followers reset
      s.selectorProgress = k; // C1 cam moves shuttle hub to coded position; no blade advances
      break;
    case 'engage':
      s.bladeExtend = 0; s.receiverSeated = false; // carriers parked before engagement
      s.tailEngaged = Array.from({ length: GEO.bladesPerBank }, (_, i) =>
        s.selectedIndices.includes(i) ? k > 0.3 : false);
      break;
    case 'extend':
      s.receiverSeated = false;
      // slice pattern engages no grid blades, so nothing advances
      s.bladeExtend = s.selectedIndices.length === 0 ? 0 : k;
      break;
    case 'seat':
      s.bladeExtend = s.selectedIndices.length === 0 ? 0 : 1;
      s.receiverSeated = s.selectedIndices.length > 0 && k > 0.6; // tapered open-through grooves
      break;
    case 'lock':
      s.originLock = k; s.farLock = k; // C2 closes both rails; selector off-loads
      break;
    case 'feed': {
      s.feedProgress = k;
      s.pusherY = P.contactY - (P.contactY - P.feedLimitY) * k;
      // cut pieces generated from produce profile at end of feed
      if (k >= 0.999 && s.produce) {
        const sticks = s.selectedIndices.length;
        const kind = 'stick';
        s.cutPieces = Array.from({ length: sticks * 3 }, (_, i) => ({ produce: s.produce, kind, i }));
      }
      break;
    }
    case 'crosscut': {
      s.crosscutParked = false;
      const t = GEO.crosscut;
      // sweep out then return to dock within the phase
      const half = k < 0.5 ? k / 0.5 : (1 - k) / 0.5;
      s.crosscutX = t.dockX + (t.travelMax - t.dockX) * half;
      if (k >= 0.999) {
        s.crosscutParked = true;
        if (s.produce) s.cutPieces = s.cutPieces.map(p => ({ ...p, kind: s.patternKey === 'slice' ? 'coin' : 'cube' }));
      }
      break;
    }
    case 'unlock':
      s.originLock = 1 - k; s.farLock = 1 - k;
      break;
    case 'wipe':
      s.wiperProgress = k;
      // strips retract through wipers into captured storage (none for slice)
      s.bladeExtend = s.selectedIndices.length === 0 ? 0 : 1 - k;
      s.receiverSeated = s.selectedIndices.length > 0 && k <= 0.001; // tips leave receivers as retraction starts
      if (k >= 0.999) { s.tailEngaged = s.tailEngaged.map(() => false); }
      break;
    case 'strip':
      s.stripProgress = k; // stripper moves relative to returning pusher
      s.pusherY = P.feedLimitY + (P.serviceY - P.feedLimitY) * k;
      if (k >= 0.999) { s.pusherAtService = true; s.produceLoaded = false; }
      break;
    case 'park':
      s.stripProgress = 0; s.wiperProgress = 0; s.selectorProgress = 0;
      break;
    case 'disengage':
      s.couplingEngaged = k < 0.5; // D2 lifts dry/wet interfaces
      break;
    case 'extract':
      s.extractProgress = k;
      break;
    case 'unfold':
      s.unfoldProgress = k;
      break;
  }
  return s;
}

// Convenience: full timeline duration and phase start times.
function workflowTimeline(patternKey2 = '12mm') {
  const steps = WORKFLOW.map(st => ({ ...st }));
  // inject the selectable potato pattern into the size-change + potato select
  const sel = steps.find(s => s.n === 14); if (sel) sel.pattern = patternKey2;
  const chg = steps.find(s => s.n === 12); if (chg) chg._pending = patternKey2;
  let t = 0; const marks = [];
  for (const st of steps) {
    const ph = MECH_PHASES.find(p => p.id === st.phase);
    marks.push({ step: st, start: t, dur: ph.dur, mech: ph.mech });
    t += ph.dur;
  }
  return { steps: marks, total: t };
}

// Sample state at absolute time t for a given potato pattern.
function sampleAt(t, patternKey2 = '12mm') {
  const { steps } = workflowTimeline(patternKey2);
  let s = initialState();
  s._pendingPattern = patternKey2;
  for (const m of steps) {
    const local = Math.min(1, Math.max(0, (t - m.start) / m.dur));
    if (t < m.start) break;
    s._pendingPattern = patternKey2;
    s = applyPhase(s, { ...m.step, _pendingPattern: patternKey2 }, local);
    s._pendingPattern = patternKey2;
  }
  return s;
}



/* ===== scene.js ===== */
// Rev F — Three.js scene builder. Constructs the dry base and the removable
// wet cassette with every named mechanism part, then maps state-machine
// variables onto node transforms. Rendering never invents motion; it only
// reflects the kinematic state produced by stateMachine.js.
//
// Uses a deliberately small Three.js subset (WebGLRenderer, Scene, cameras,
// Group, Mesh, Box/Cylinder/Sphere/Cone/Shape/Extrude geometry,
// standard materials, lights, arrows) so the bundler can inline a compact
// runtime. Parts are shaped to read as what they are — blades are tapered
// knife strips, the camshaft carries cam lobes, the chute is a hopper —
// not placeholder boxes.



const C = {
  base: 0x2a3340, baseDark: 0x1d242e, dryAccent: 0xff8c2f,
  wet: 0xd7dde5, wetDark: 0x39414f, steel: 0xb9c2cd, blade: 0xcfd9e4,
  green: 0x2f9e6e, lock: 0xffb020, receiver: 0x66c2ff,
  carrot: 0xf28c28, potato: 0xcaa46a, cut: 0xe9d9b8, bin: 0xf4f7fa,
  chute: 0xf4f7fa, error: 0xff4d4d,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}
const STEEL = () => mat(C.steel, { metalness: 0.85, roughness: 0.3 });
const BLADE = () => mat(C.blade, { metalness: 0.85, roughness: 0.25 });

function buildScene(container) {
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
  // Extrude a flat 2D outline (array of [x,y]) along a tapered path.
  // shapePts outline the part face-on (X=length, Y=vertical);
  // profilePts [alongZ, verticalY] taper the thickness toward an edge.
  const extrudeZ = (shapePts, profilePts, m) => {
    const sh = new THREE.Shape();
    shapePts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {
      steps: 1, bevelEnabled: true,
      bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1,
      extrudePath: new THREE.CatmullRomCurve3(
        profilePts.map(([z, y]) => new THREE.Vector3(0, y, z))),
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };

  /* ---------- shared part factories (shaped, not boxes) ----------------- */

  // Knife blade: long strip with a tapered cutting edge. Built with length
  // along X, depth along Y, thickness along Z; the group origin sits at the
  // blade's drive-tail end so bank translation reads as tip travel.
  function mkBlade(len) {
    const t = GEO.bladeThickness, D = GEO.bladeDepth, L = len;
    const b = extrudeZ(
      [[0, -D / 2], [L, -D / 2], [L, D / 2], [0, D / 2]],
      [[-t * 0.45, D / 2], [t * 0.3, D / 2], [t * 0.3, -D * 0.15], [-t * 0.06, -D / 2], [-t * 0.45, -D / 2]],
      BLADE());
    const g = new THREE.Group(); g.add(b);
    const tail = box(0.16, D * 0.55, 0.26, mat(C.wetDark), -0.06, 0, 0, g); // drive tail hook
    tail.castShadow = false;
    return g;
  }

  // Cam: round disc with an offset lobe — the classic cam silhouette.
  // Disc axis is Y in local space; caller orients.
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
    lobe.rotation.x = -Math.PI / 2; // shape XY plane -> flat, extrusion along Y
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

  // Drum magazine: half-round cradle that visibly holds the blade stack.
  function mkDrum(len) {
    const g = new THREE.Group();
    const shell = cyl(0.36, 0.36, len, mat(C.wetDark, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 0, 0, 0, g, 24, true);
    shell.castShadow = false;
    const cap1 = cyl(0.36, 0.36, 0.05, mat(C.wetDark), 0, len / 2, 0, g, 24);
    const cap2 = cyl(0.36, 0.36, 0.05, mat(C.wetDark), 0, -len / 2, 0, g, 24);
    cap1.castShadow = cap2.castShadow = false;
    return g;
  }

  // Receiver comb: a rail of open slots that blade tips slide into.
  function mkComb(len, slotEvery, alongX) {
    const g = new THREE.Group();
    const m = mat(C.receiver, { metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.9 });
    // teeth at midpoints BETWEEN blade lines (plus one past each end) so the
    // open slots line up exactly with blade lines and blades slide through
    const toothW = slotEvery * 0.42;
    const lines = bladeOffsets();
    const pts = [];
    for (let i = 0; i < lines.length - 1; i++) pts.push((lines[i] + lines[i + 1]) / 2);
    pts.push(lines[0] - slotEvery / 2, lines[lines.length - 1] + slotEvery / 2);
    pts.forEach(off => {
      if (Math.abs(off) > len / 2 + slotEvery * 0.3) return;
      if (alongX) box(0.14, 0.34, toothW, m, 0, 0, off, g);
      else box(toothW, 0.34, 0.14, m, off, 0, 0, g);
    });
    g.children.forEach(c => { c.castShadow = false; });
    return g;
  }

  /* ================= DRY BASE (stays behind on extraction) ============= */
  const dry = new THREE.Group(); scene.add(dry);
  box(4.6, 1.0, 4.0, mat(C.base), 0, 0.5, 0, dry);                 // plinth
  box(4.6, 0.1, 4.0, mat(C.baseDark), 0, 1.05, 0, dry);
  // feet
  [[-1.9, -1.6], [1.9, -1.6], [-1.9, 1.6], [1.9, 1.6]].forEach(([x, z]) =>
    cyl(0.16, 0.2, 0.18, mat(C.baseDark), x, 0.06, z, dry, 16));

  // D1 cycle gearmotor — finned motor barrel + end cap + gearbox + shaft
  const D1 = new THREE.Group(); dry.add(D1);
  cyl(0.4, 0.4, 0.95, mat(C.dryAccent, { metalness: 0.5 }), 0, 0, 0, D1);          // barrel
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fin = box(0.05, 0.9, 0.1, mat(C.dryAccent, { metalness: 0.5 }), Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, D1);
    fin.rotation.y = -a; fin.castShadow = false;
  }
  cyl(0.3, 0.34, 0.16, mat(C.baseDark), 0, 0.55, 0, D1);                            // end cap
  cyl(0.5, 0.5, 0.36, mat(C.baseDark), 0, -0.64, 0, D1);                            // gearbox
  const dome = sph(0.5, mat(C.baseDark), 0, -0.82, 0, D1, 20, 10); dome.scale.y = 0.5;
  cyl(0.08, 0.08, 0.7, STEEL(), 0, 0.98, 0, D1);                                    // shaft
  D1.position.set(-1.6, 1.7, -1.2);
  D1.rotation.z = Math.PI / 2; // shaft along X toward camshaft

  // camshaft driven by D1, carrying the five cam take-offs
  const camshaft = new THREE.Group(); dry.add(camshaft);
  cyl(0.07, 0.07, 3.2, STEEL(), 0, 0, 0, camshaft).rotation.z = Math.PI / 2;
  // input gear where D1's shaft meets the camshaft
  const inGear = mkGear(0.26, 10, 0.12, mat(C.steel, { metalness: 0.7, roughness: 0.35 }));
  inGear.rotation.z = Math.PI / 2; inGear.position.set(-1.72, 0, 0); camshaft.add(inGear);
  const cams = {};
  const camNames = ['C1', 'C2', 'C3', 'C4', 'C5'];
  camNames.forEach((id, i) => {
    const cam = mkCam(i * 1.13);         // each lobe keyed to its phase angle
    cam.rotation.z = Math.PI / 2;        // disc plane perpendicular to the shaft (X)
    cam.position.set(-1.2 + i * 0.6, 0, 0);
    camshaft.add(cam);
    cams[id] = cam;
  });
  camshaft.position.set(-0.2, 1.7, -1.2);

  // D2 manual cassette latch / release on the dry base front — lever + pivot + knob
  const D2 = new THREE.Group(); dry.add(D2);
  cyl(0.1, 0.1, 0.3, STEEL(), 0, 0, 0, D2).rotation.x = Math.PI / 2;     // pivot barrel
  box(0.09, 0.62, 0.09, mat(C.lock, { metalness: 0.4 }), 0, 0.26, 0, D2);
  sph(0.09, mat(C.lock, { metalness: 0.4, roughness: 0.4 }), 0, 0.6, 0, D2); // knob
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
  // cassette root translates on extraction; two halves fan on unfold.
  const cassette = new THREE.Group(); scene.add(cassette);
  const halfL = new THREE.Group(); cassette.add(halfL);  // pivots about rear hinge
  const halfR = new THREE.Group(); cassette.add(halfR);
  // rear hinge barrel the halves fan about
  cyl(0.09, 0.09, 2.0, STEEL(), -1.15, 2.4, 0, cassette).rotation.x = Math.PI / 2;

  // chamber (left half) — open-top wall shell + floor plate, not a solid block
  {
    const { w, h, d, floorY } = GEO.chamber;
    const wall = 0.07, yc = floorY + h / 2;
    const wm = () => mat(C.wet, { transparent: true, opacity: 0.16, side: THREE.DoubleSide });
    const mkWall = (ww, hh, dd, x, y, z) => { const m = box(ww, hh, dd, wm(), x, y, z, halfL); m.castShadow = false; return m; };
    mkWall(w, h, wall, 0, yc, d / 2 - wall / 2);    // +Z wall
    mkWall(w, h, wall, 0, yc, -d / 2 + wall / 2);   // -Z wall
    mkWall(wall, h, d, -w / 2 + wall / 2, yc, 0);   // -X wall
    mkWall(w, wall, d, 0, floorY + wall / 2, 0);    // floor plate
  }
  // feed chute (left half) — square hopper: four neck walls + flared mouth + lip
  {
    const hop = () => mat(C.chute, { transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const neckY = GEO.chuteTop - 1.5;
    [box(0.07, 1.5, 1.36, hop(), 0.68, neckY, 0, halfL),
     box(0.07, 1.5, 1.36, hop(), -0.68, neckY, 0, halfL),
     box(1.36, 1.5, 0.07, hop(), 0, neckY, 0.68, halfL),
     box(1.36, 1.5, 0.07, hop(), 0, neckY, -0.68, halfL)].forEach(m => { m.castShadow = false; });
    const flare = cyl(1.0, 0.72, 0.55, hop(), 0, GEO.chuteTop - 0.32, 0, halfL, 4, true);
    flare.rotation.y = Math.PI / 4; flare.castShadow = false;
    const lip = cyl(1.04, 1.04, 0.09, mat(C.chute, { transparent: true, opacity: 0.5 }), 0, GEO.chuteTop - 0.04, 0, halfL, 4, true);
    lip.rotation.y = Math.PI / 4; lip.castShadow = false;
  }

  // --- X-bank blades (slide along X) on halfR, Z-bank (slide along Z) on halfL.
  // Each blade strip is long enough that at full extension it spans from the
  // origin magazine, through the wiper, across the chamber, and into the far
  // receiver comb — so it never pops in/out; it slides.
  const offs = bladeOffsets();
  const xBlades = [], zBlades = [];
  const BLADE_LEN = GEO.parts.bladeLen;
  offs.forEach((o) => {
    // X bank blade: strip spanning Z, travels along X at xBankY, edge down
    const bx = mkBlade(BLADE_LEN);
    bx.rotation.y = -Math.PI / 2;   // length along Z
    bx.rotation.x = Math.PI / 2;    // taper points down (cutting edge)
    bx.position.set(GEO.xTravelMin, GEO.xBankY, o);
    bx.visible = false; halfR.add(bx); xBlades.push(bx);
    // Z bank blade: spans X, travels along Z at zBankY
    const bz = mkBlade(BLADE_LEN);
    bz.rotation.x = Math.PI / 2;
    bz.position.set(o, GEO.zBankY, GEO.zTravelMin);
    bz.visible = false; halfL.add(bz); zBlades.push(bz);
  });

  // origin magazines — half-round drums the blade stacks live in
  const xMag = mkDrum(GEO.chamber.d + 0.2); halfR.add(xMag);
  xMag.rotation.x = Math.PI / 2; // drum axis along Z (blade length)
  xMag.position.set(GEO.magazine.xX - 0.5, GEO.xBankY, 0);
  const zMag = mkDrum(GEO.chamber.w + 0.2); halfL.add(zMag);
  zMag.rotation.z = Math.PI / 2; // drum axis along X
  zMag.position.set(0, GEO.zBankY, GEO.magazine.xZ - 0.5);

  // wipers at the food-zone/storage boundary — squeegee blocks with lips
  const xWiper = box(0.1, 0.34, GEO.chamber.d, mat(C.green, { roughness: 0.7 }), GEO.xTravelMin + GEO.parts.wiperOffset, GEO.xBankY, 0, halfR);
  const xWiperLip = box(0.06, 0.12, GEO.chamber.d, mat(C.green, { roughness: 0.7 }), GEO.xTravelMin + GEO.parts.wiperOffset + 0.06, GEO.xBankY - 0.2, 0, halfR);
  const zWiper = box(GEO.chamber.w, 0.34, 0.1, mat(C.green, { roughness: 0.7 }), 0, GEO.zBankY, GEO.zTravelMin + GEO.parts.wiperOffset, halfL);
  const zWiperLip = box(GEO.chamber.w, 0.12, 0.06, mat(C.green, { roughness: 0.7 }), 0, GEO.zBankY - 0.2, GEO.zTravelMin + GEO.parts.wiperOffset + 0.06, halfL);

  // far receivers: open-through combs the blade tips seat into
  const xRecv = mkComb(GEO.chamber.d, GEO.pitch, true); halfR.add(xRecv);
  xRecv.position.set(GEO.xTravelMax + GEO.parts.combOffset, GEO.xBankY, 0);
  const zRecv = mkComb(GEO.chamber.w, GEO.pitch, false); halfL.add(zRecv);
  zRecv.position.set(0, GEO.zBankY, GEO.zTravelMax + GEO.parts.combOffset);

  // origin + far lock rails (move normal to blade-tip support). Both are
  // combs: blades pass through the slots; the rail teeth bear on the blade
  // side faces between slots, so the rail can close without colliding.
  const railM = () => mat(C.lock, { metalness: 0.4, roughness: 0.4 });
  const mkLockRail = (alongX) => {
    const g = mkComb(GEO.chamber.d, GEO.pitch, alongX);
    g.children.forEach(c => { c.material = railM(); });
    const back = alongX
      ? box(0.1, 0.4, GEO.chamber.d, railM(), alongX ? -0.12 : 0, -0.02, 0, g)
      : box(GEO.chamber.w, 0.4, 0.1, railM(), 0, -0.02, -0.12, g);
    back.castShadow = false;
    return g;
  };
  const originRailX = mkLockRail(true); halfR.add(originRailX);
  originRailX.position.set(GEO.xTravelMin - GEO.parts.railOffsetOrigin, GEO.xBankY, 0);
  const farRailX = mkLockRail(true); halfR.add(farRailX);
  farRailX.position.set(GEO.xTravelMax + GEO.parts.railOffsetFar, GEO.xBankY, 0);
  const originRailZ = mkLockRail(false); halfL.add(originRailZ);
  originRailZ.position.set(0, GEO.zBankY, GEO.zTravelMin - GEO.parts.railOffsetOrigin);
  const farRailZ = mkLockRail(false); halfL.add(farRailZ);
  farRailZ.position.set(0, GEO.zBankY, GEO.zTravelMax + GEO.parts.railOffsetFar);

  // common selector shuttle: one X arm + one Z arm, shaped as finger combs
  // that hook the drive tails of the selected blades
  const shuttle = new THREE.Group(); dry.add(shuttle);
  const fingerM = mat(C.dryAccent, { metalness: 0.45, roughness: 0.4 });
  const shuttleArmX = new THREE.Group(); shuttle.add(shuttleArmX);
  box(0.34, 0.12, GEO.chamber.d, fingerM, 0, 0, 0, shuttleArmX);
  offs.forEach(o => { box(0.3, 0.1, 0.1, fingerM, 0.3, 0, o, shuttleArmX).castShadow = false; });
  shuttleArmX.position.set(GEO.xTravelMin - 0.6, GEO.xBankY, 0);
  const shuttleArmZ = new THREE.Group(); shuttle.add(shuttleArmZ);
  box(GEO.chamber.w, 0.12, 0.34, fingerM, 0, 0, 0, shuttleArmZ);
  offs.forEach(o => { box(0.1, 0.1, 0.3, fingerM, o, 0, 0.3, shuttleArmZ).castShadow = false; });
  shuttleArmZ.position.set(0, GEO.zBankY, GEO.zTravelMin - 0.6);

  // --- pusher: slotted plate — fingers pass between blade lines so the
  // plate can drive produce all the way through the grid. A slot (gap)
  // aligns with every blade line; material sits between lines.
  const pusher = new THREE.Group(); cassette.add(pusher);
  const p = GEO.pusher;
  const plateM = mat(C.wet, { metalness: 0.2, roughness: 0.4 });
  const T = p.faceThickness;
  {
    const mid = (GEO.bladesPerBank - 1) / 2;
    const edge = GEO.chamber.w / 2;
    for (let i = 0; i <= GEO.bladesPerBank; i++) {
      const a = (i - mid - 0.5) * GEO.pitch;           // slot centred on blade line i
      const b2 = i === GEO.bladesPerBank ? edge : (i - mid + 0.5) * GEO.pitch;
      const c0 = Math.max(-edge, a + GEO.bladeThickness / 2 + 0.02);
      const c1 = Math.min(edge, b2 - GEO.bladeThickness / 2 - 0.02);
      if (c1 - c0 > 0.05) box(GEO.chamber.w - 0.1, T, c1 - c0, plateM, 0, 0, (c0 + c1) / 2, pusher);
    }
    // rim
    box(GEO.chamber.w, T * 1.1, 0.1, plateM, 0, 0.02, GEO.chamber.d / 2 - 0.05, pusher);
    box(GEO.chamber.w, T * 1.1, 0.1, plateM, 0, 0.02, -GEO.chamber.d / 2 + 0.05, pusher);
  }
  // underside ribs between blade lines stiffen the plate
  offs.forEach((o) => {
    const gap = o - GEO.pitch / 2;
    if (Math.abs(gap) < GEO.chamber.d / 2 - 0.1) {
      box(GEO.chamber.w - 0.2, T * 0.8, GEO.pitch * 0.3, plateM, 0, -(T / 2 + T * 0.4), gap, pusher).castShadow = false;
    }
  });
  // side guide shoes + drive screw collar on top
  box(0.1, 0.4, 0.3, mat(C.green), GEO.chamber.w / 2 + 0.05, 0, 0, pusher);
  box(0.1, 0.4, 0.3, mat(C.green), -GEO.chamber.w / 2 - 0.05, 0, 0, pusher);
  const driveCollar = cyl(0.16, 0.19, 0.34, mat(C.dryAccent, { metalness: 0.6 }), 0, 0.34, 0, pusher, 20);
  const driveScrew = cyl(0.06, 0.06, 1.1, STEEL(), 0, 1.0, 0, pusher, 12);
  driveScrew.castShadow = false;
  pusher.position.set(0, p.serviceY, 0);

  // stripper plate — perforated plate that strips stuck pieces off the
  // pusher fingers as it returns
  const stripper = new THREE.Group(); cassette.add(stripper);
  {
    const sm = mat(C.green, { roughness: 0.6 });
    const w2 = GEO.chamber.w - 0.15, d2 = GEO.chamber.d - 0.15;
    box(w2, 0.07, 0.5, sm, 0, 0, d2 / 2 - 0.25, stripper);
    box(w2, 0.07, 0.5, sm, 0, 0, -d2 / 2 + 0.25, stripper);
    const mid = (GEO.bladesPerBank - 1) / 2;
    for (let i = 0; i <= GEO.bladesPerBank; i += 2) {
      const c0 = (i - mid - 0.5) * GEO.pitch, c1 = (i - mid + 0.5) * GEO.pitch;
      if (Math.abs((c0 + c1) / 2) < d2 / 2 - 0.5)
        box(w2, 0.07, Math.min(0.34, c1 - c0 - 0.12), sm, 0, 0, (c0 + c1) / 2, stripper).castShadow = false;
    }
  }
  stripper.position.set(0, p.serviceY + 0.25, 0);

  // crosscut knife + carrier (below both banks, travels along X) —
  // long knife with a ground bevel edge, held by a carrier shoe on a rail
  const crosscut = new THREE.Group(); cassette.add(crosscut);
  {
    const knife = extrudeZ(
      [[-(GEO.chamber.w / 2 - 0.05), -0.11], [GEO.chamber.w / 2 - 0.05, -0.11], [GEO.chamber.w / 2 - 0.05, 0.11], [-(GEO.chamber.w / 2 - 0.05), 0.11]],
      [[-0.05, 0.11], [0.045, 0.11], [0.045, -0.04], [-0.02, -0.11], [-0.05, -0.11]],
      BLADE());
    crosscut.add(knife);
    const shoe = box(0.3, 0.22, 0.4, mat(C.wetDark), -GEO.chamber.w / 2 - 0.1, 0, 0, crosscut);
    shoe.castShadow = false;
    const rail = cyl(0.05, 0.05, 4.6, STEEL(), 0, -0.2, 0, crosscut, 12);
    rail.rotation.z = Math.PI / 2; rail.castShadow = false;
  }
  crosscut.position.set(GEO.crosscut.dockX, GEO.crosscutY, 0);

  // output bin — open-top tub with wall shell, base plate and a handle
  const bin = new THREE.Group(); cassette.add(bin);
  {
    const bm = () => mat(C.bin, { transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const wallT = 0.06, bw = 1.9, bh = 0.8, bd = 1.9;
    [[bw, bh, wallT, 0, 0, bd / 2], [bw, bh, wallT, 0, 0, -bd / 2],
     [wallT, bh, bd, bw / 2, 0, 0], [wallT, bh, bd, -bw / 2, 0, 0]].forEach(([w, h, d, x, y, z]) => {
      const m2 = box(w, h, d, bm(), x, y, z, bin); m2.castShadow = false;
    });
    box(bw, 0.08, bd, mat(C.steel, { metalness: 0.6, roughness: 0.4 }), 0, -bh / 2 - 0.04, 0, bin);
    // handle across the front wall
    const handle = cyl(0.04, 0.04, bw * 0.5, STEEL(), 0, bh / 2 + 0.12, bd / 2 + 0.08, bin, 12);
    handle.rotation.z = Math.PI / 2; handle.castShadow = false;
    box(0.05, 0.14, 0.05, STEEL(), -bw * 0.25, bh / 2 + 0.04, bd / 2 + 0.08, bin).castShadow = false;
    box(0.05, 0.14, 0.05, STEEL(), bw * 0.25, bh / 2 + 0.04, bd / 2 + 0.08, bin).castShadow = false;
  }
  bin.position.set(0, 0.72, 0);

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

  // cut piece pools — sticks (grid-only), cubes (dice), coins (slice);
  // visibility is provenance-driven from state
  const mkPool = (n, make) => {
    const arr = [];
    for (let i = 0; i < n; i++) { const m = make(); m.visible = false; cassette.add(m); arr.push(m); }
    return arr;
  };
  const sticks = mkPool(16, () => box(0.3, 0.3, 1.05, mat(C.cut, { roughness: 0.7 })));
  const cubes = mkPool(32, () => box(0.24, 0.24, 0.24, mat(C.cut, { roughness: 0.7 })));
  const coins = mkPool(16, () => cyl(0.24, 0.24, 0.07, mat(C.carrot, { roughness: 0.65 }), 0, 0, 0, new THREE.Group(), 20));
  coins.forEach(c => { const g = new THREE.Group(); g.add(c); cassette.add(g); });
  const coinGroups = coins.map(c => c.parent);
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
  const r = 0.12 + 0.62 * Math.sqrt((i + 0.5) / Math.max(1, n));
  const a = i * golden;
  m.position.set(Math.cos(a) * r, 0.62 + Math.floor(i / 9) * 0.17, Math.sin(a) * r);
  m.rotation.set((i * 0.7) % 1.2 - 0.6, a, (i * 1.1) % 0.9 - 0.45);
}

// Map a kinematic state onto the scene graph.
function applyStateToScene(nodes, s, camAngle) {
  const {
    cassette, halfL, halfR, coupling, D2, D1,
    xBlades, zBlades, originRailX, farRailX, originRailZ, farRailZ,
    shuttle, pusher, stripper, crosscut, produce, piecePools, arrow, camshaft,
  } = nodes;
  const P = GEO.pusher;

  // camshaft + cams rotate with cycle progress; D1 shaft counter-rotates
  camshaft.rotation.x = (s.selectorProgress + s.feedProgress + camAngle) * Math.PI * 2;
  D1.rotation.x = -camshaft.rotation.x * 2.5;

  // blades: engaged blades slide out of the origin magazine, through the
  // wiper, across the chamber, and into the far receiver comb. They are
  // visible while any part of the strip has left the magazine (no pop-in).
  const engaged = new Set(s.selectedIndices);
  const travelX = GEO.xTravelMax - GEO.xTravelMin;
  const travelZ = GEO.zTravelMax - GEO.zTravelMin;
  xBlades.forEach((b, i) => {
    const on = engaged.has(i) && s.tailEngaged[i];
    const ext = on ? s.bladeExtend : 0;
    b.visible = ext > 0.001;
    b.position.x = GEO.xTravelMin - GEO.parts.bladeParkedInset + (travelX + GEO.parts.bladeOvertravel) * ext;
  });
  zBlades.forEach((b, i) => {
    const on = engaged.has(i) && s.tailEngaged[i];
    const ext = on ? s.bladeExtend : 0;
    b.visible = ext > 0.001;
    b.position.z = GEO.zTravelMin - GEO.parts.bladeParkedInset + (travelZ + GEO.parts.bladeOvertravel) * ext;
  });

  // lock rails close normal to blade tips
  const lockIn = GEO.parts.lockStroke;
  originRailX.position.x = GEO.xTravelMin - GEO.parts.railOffsetOrigin + s.originLock * lockIn;
  farRailX.position.x = GEO.xTravelMax + GEO.parts.railOffsetFar - s.farLock * lockIn;
  originRailZ.position.z = GEO.zTravelMin - GEO.parts.railOffsetOrigin + s.originLock * lockIn;
  farRailZ.position.z = GEO.zTravelMax + GEO.parts.railOffsetFar - s.farLock * lockIn;

  // pusher + stripper
  pusher.position.y = s.pusherY;
  stripper.position.y = s.pusherY + 0.25 - s.stripProgress * 0.3;

  // crosscut
  crosscut.position.x = s.crosscutX;

  // produce: visible while loaded and not yet fed; sinks as it is pushed
  ['carrot', 'potato'].forEach((kind) => {
    const m = produce[kind];
    if (s.produce === kind && s.produceLoaded && s.feedProgress < 0.999) {
      m.visible = true;
      m.position.y = GEO.chamber.floorY + 0.9 + (1 - s.feedProgress) * 1.6;
      m.rotation.y = kind === 'carrot' ? 0.2 : 0;
    } else m.visible = false;
  });

  // cut pieces: kind from state provenance; shown after feed, binned until wash
  const counts = { stick: 0, cube: 0, coin: 0 };
  s.cutPieces.forEach(pc => { counts[pc.kind] = (counts[pc.kind] || 0) + 1; });
  Object.entries(piecePools).forEach(([kind, pool]) => {
    const n = counts[kind] || 0;
    pool.forEach((m, i) => {
      const on = i < n && s.feedProgress >= 0.999 && s.extractProgress <= 0;
      m.visible = on;
      if (on) pileInBin(m, i, Math.max(n, 1));
    });
  });

  // dry/wet coupling lifts on disengage; D2 latch lever swings
  coupling.position.y = 2.0 + (s.couplingEngaged ? 0 : 0.35);
  coupling.visible = s.extractProgress <= 0.001;
  coupling.rotation.y = camAngle * 2;
  D2.rotation.x = -(s.couplingEngaged ? 0 : 0.6) - s.extractProgress * 0.2;

  // cassette extraction (+Z) then unfold (fan of halves about the rear hinge)
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
    C2: [GEO.xTravelMax + GEO.parts.railOffsetFar, GEO.xBankY, 0, -1, 0, 0],
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


/* ===== ui.js ===== */
// Rev F — inspection UI. Views, cutaway, transport, phase track, pattern
// selector, mechanism map, assertion readout, and the unvalidated-gates note.
// The UI only renders what the state machine reports; it cannot hide a
// violation because the assertion list is generated from checkState().



function buildUI(root, callbacks) {
  root.insertAdjacentHTML('beforeend', `
  <div id="hud">
    <h1>Rev F — Programmable Food Chopper <span class="tag">KINEMATIC PROTOTYPE</span></h1>
    <div id="step-label"></div>
    <div id="mech-line"></div>
  </div>

  <div id="panel">
    <div class="sec">
      <div class="sec-h">Views</div>
      <div class="row">
        <button data-view="iso">Iso</button>
        <button data-view="front">Front</button>
        <button data-view="top">Top</button>
        <button id="cutaway">Cutaway: off</button>
      </div>
    </div>
    <div class="sec">
      <div class="sec-h">Potato size (selectable)</div>
      <div class="row" id="pattern-row"></div>
      <div id="count-line"></div>
    </div>
    <div class="sec">
      <div class="sec-h">Active mechanism</div>
      <div id="mech-name">—</div>
      <div id="mech-detail"></div>
    </div>
    <div class="sec">
      <div class="sec-h">Mechanism map</div>
      <div id="map"></div>
    </div>
    <div class="sec">
      <div class="sec-h">Model assertions</div>
      <div id="assert"></div>
    </div>
    <div class="sec warn">
      <div class="sec-h">Unvalidated physical gates</div>
      <ul id="gates">${UNVALIDATED.map(u => `<li>${u}</li>`).join('')}</ul>
    </div>
  </div>

  <div id="bar">
    <button id="prev">⟨</button>
    <button id="play">⏸ Pause</button>
    <button id="next">⟩</button>
    <button id="restart">↺</button>
    <input id="scrub" type="range" min="0" max="1000" value="0">
    <span id="tcode"></span>
  </div>
  <div id="track"></div>
  `);

  // pattern buttons
  const row = root.querySelector('#pattern-row');
  Object.entries(PATTERNS).forEach(([key, p]) => {
    const b = document.createElement('button');
    b.textContent = p.label; b.dataset.pattern = key;
    if (key === '12mm') b.classList.add('on');
    b.onclick = () => {
      row.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      callbacks.onPattern(key);
    };
    row.appendChild(b);
  });

  root.querySelectorAll('[data-view]').forEach(b => {
    b.onclick = () => callbacks.onView(b.dataset.view);
  });
  const cut = root.querySelector('#cutaway');
  cut.onclick = () => {
    const on = cut.textContent.endsWith('off');
    cut.textContent = `Cutaway: ${on ? 'on' : 'off'}`;
    callbacks.onCutaway(on);
  };

  root.querySelector('#play').onclick = (e) => callbacks.onPlay(e.target);
  root.querySelector('#restart').onclick = () => callbacks.onRestart();
  root.querySelector('#prev').onclick = () => callbacks.onStep(-1);
  root.querySelector('#next').onclick = () => callbacks.onStep(1);
  root.querySelector('#scrub').oninput = (e) => callbacks.onScrub(e.target.value / 1000);

  return {
    setStep(st, mech) {
      root.querySelector('#step-label').textContent = `Phase ${st.n}/26 — ${st.label}`;
      root.querySelector('#mech-line').textContent =
        `Active mechanism: ${mech === '—' ? 'none (manual/parked)' : PARTS[mech]?.name || mech}`;
    },
    setMech(mech, s) {
      const el = root.querySelector('#mech-name');
      const det = root.querySelector('#mech-detail');
      if (!mech || mech === '—') { el.textContent = '— parked / manual'; det.textContent = ''; return; }
      const p = PARTS[mech];
      el.textContent = `${mech} — ${p?.name || mech}`;
      det.innerHTML = p ? [
        `DOF: ${p.dof}`,
        p.drivenBy ? `Driven by: ${p.drivenBy}` : 'Manual / primary',
        p.attaches ? `Drives: ${p.attaches.join(', ')}` : '',
        p.note ? p.note : '',
      ].filter(Boolean).join('<br>') : '';
    },
    setCount(s) {
      const pl = s.patternKey ? PATTERNS[s.patternKey]?.label : '—';
      root.querySelector('#count-line').textContent =
        `Pattern: ${pl} · engaged blades/bank: ${s.selectedIndices.length} · pieces: ${s.cutPieces.length}`;
    },
    setAssertions(s) {
      const res = checkState(s);
      const bad = res.filter(r => !r.ok);
      const el = root.querySelector('#assert');
      el.innerHTML = bad.length === 0
        ? `<span class="ok">✓ ${res.length} assertions hold</span>`
        : bad.map(b => `<span class="bad">✗ ${b.text}</span>`).join('<br>');
      el.classList.toggle('has-bad', bad.length > 0);
    },
    setMap(activeMech) {
      const ids = ['D1', 'camshaft', 'C1', 'C2', 'C3', 'C4', 'C5', 'D2', 'selectorShuttle', 'pusher', 'stripper', 'crosscut', 'originRail', 'farRail', 'cassette'];
      root.querySelector('#map').innerHTML = ids.map(id =>
        `<span class="chip ${id === activeMech ? 'live' : ''}" title="${PARTS[id].name}">${id}</span>`).join('');
    },
    setTrack(t, total, marks) {
      root.querySelector('#tcode').textContent = `${t.toFixed(1)}s / ${total.toFixed(0)}s`;
      const tr = root.querySelector('#track');
      tr.innerHTML = marks.map(m =>
        `<div class="ph ${t >= m.start && t < m.start + m.dur ? 'now' : ''}" style="left:${m.start / total * 100}%;width:${m.dur / total * 100}%" title="${m.step.n}. ${m.step.label}"></div>`).join('');
      root.querySelector('#scrub').value = Math.round(t / total * 1000);
    },
  };
}


/* ===== app.js ===== */
// Rev F — application entry. Wires the state machine, scene and UI together.
// The render loop samples the state machine and reflects it; it never
// animates parts directly, which keeps the visible motion honest.





function startApp(container) {
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

startApp(document.getElementById('app'));
