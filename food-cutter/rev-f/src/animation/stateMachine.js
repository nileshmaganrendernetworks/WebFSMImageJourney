// Rev F — explicit kinematic state machine with interlock assertions.
// Pure logic: no Three.js imports, so it runs identically in Node tests
// and in the browser. The renderer samples this state; it never invents motion.

import { GEO, patternIndices, bladeOffsets } from './config.js';

// The 15 mechanism phases, in order. Each has a named active mechanism,
// a duration (s), and a driver function that maps phase progress k∈[0,1]
// to state variables. Keep pure: same (state,k) → same partial state.
export const MECH_PHASES = [
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
export const WORKFLOW = [
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

export function initialState() {
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
export const ASSERTIONS = [
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

export function checkState(s) {
  return ASSERTIONS.map(a => ({ id: a.id, text: a.text, ok: !!a.check(s) }));
}

// Drive a mechanism phase into the state. k = eased progress 0..1.
// Returns a NEW state (immutability keeps provenance/teleport checks honest).
export function applyPhase(prev, step, k) {
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
export function workflowTimeline(patternKey2 = '12mm') {
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
export function sampleAt(t, patternKey2 = '12mm') {
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

export { bladeOffsets };
