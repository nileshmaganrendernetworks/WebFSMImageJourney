// Rev F — data-driven geometry, patterns, part and drive registry.
// All scene measurements live here (normalised units) so checks can assert
// clearances without touching rendering code. No literals scattered elsewhere.

export const GEO = {
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
export function bladeOffsets() {
  const n = GEO.bladesPerBank;
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => (i - mid) * GEO.pitch);
}

// Cut patterns: which blade indices are engaged per programmed size.
// every blade = 4 mm, every 2nd = 8 mm, every 3rd = 12 mm, 5th = 20 mm.
export const PATTERNS = {
  '4mm':  { label: 'Dice 4 mm',  step: 1, slice: false },
  '8mm':  { label: 'Dice 8 mm',  step: 2, slice: false },  // carrot default
  '12mm': { label: 'Dice 12 mm', step: 3, slice: false },
  '20mm': { label: 'Dice 20 mm', step: 5, slice: false },
  'slice': { label: 'Slice',     step: 0, slice: true },   // crosscut only
};

export function patternIndices(key) {
  const p = PATTERNS[key];
  if (!p) throw new Error(`unknown pattern ${key}`);
  if (p.slice) return [];
  const idx = [];
  for (let i = 0; i < GEO.bladesPerBank; i += p.step) idx.push(i);
  return idx;
}

// Part registry — every moving part has actuator, DOF, attachment, hard stop,
// interlock. Used by the inspection UI and the mechanism-map overlay.
export const PARTS = {
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
export const UNVALIDATED = [
  'Worst-case hard-food force (beetroot, raw sweet potato) — physical test gate, not a claim',
  'Blade buckling, deflection, edge life, fatigue',
  'Optimum draw stroke / cutting speed',
  'Fibre clearing in celery / onion / herbs',
  'Dishwasher sanitation / cleanability validation',
  'Food-contact compliance, certification, materials, cost',
  'Blade storage concept: rigid-strip magazine length shown; spring-reel/ribbon stiffness UNRESOLVED',
];
