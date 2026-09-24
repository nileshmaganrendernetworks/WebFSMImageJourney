// Rev F — automated checks. Samples every workflow phase and every pattern,
// asserts architecture invariants, clearances, hard stops, provenance,
// extraction/unfold gates, and no impossible transitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEO, PATTERNS, patternIndices, PARTS, UNVALIDATED,
} from '../src/animation/config.js';
import {
  MECH_PHASES, WORKFLOW, ASSERTIONS, initialState, applyPhase,
  checkState, workflowTimeline, sampleAt, bladeOffsets,
} from '../src/animation/stateMachine.js';

// ---- static geometry / architecture invariants --------------------------

test('X and Z banks are in different Y planes with positive clearance', () => {
  assert.ok(GEO.zBankY > GEO.xBankY, 'Z bank above X bank');
  assert.ok(GEO.zBankY - GEO.xBankY > GEO.bladeDepth, 'bank planes clear of blade depth');
});

test('crosscut plane is below both banks with positive clearance', () => {
  assert.ok(GEO.crosscutY < GEO.xBankY && GEO.crosscutY < GEO.zBankY);
  assert.ok(GEO.xBankY - GEO.crosscutY > GEO.bladeDepth / 2 + 0.1);
});

test('pusher slot clears every blade line (slot wider than blade + margin)', () => {
  assert.ok(GEO.pusher.slotWidth > GEO.bladeThickness + 0.02);
});

test('pusher has an upper service stop and a lower feed limit, service above feed', () => {
  assert.ok(GEO.pusher.serviceY > GEO.pusher.contactY);
  assert.ok(GEO.pusher.contactY > GEO.pusher.feedLimitY);
});

test('blade travel ranges are ordered', () => {
  assert.ok(GEO.xTravelMin < GEO.xTravelMax);
  assert.ok(GEO.zTravelMin < GEO.zTravelMax);
});

test('13 blade lines per bank, offsets centred and evenly pitched', () => {
  const off = bladeOffsets();
  assert.equal(off.length, 13);
  assert.ok(Math.abs(off[6]) < 1e-9, 'centre blade at 0');
  assert.ok(Math.abs((off[1] - off[0]) - GEO.pitch) < 1e-9);
});

test('cassette has separate extraction and unfold travel', () => {
  assert.ok(GEO.cassette.extractTravel > 0);
  assert.ok(GEO.cassette.unfoldAngle > 0);
});

// ---- pattern logic ------------------------------------------------------

test('patterns: 4/8/12/20mm and slice produce expected index counts', () => {
  assert.equal(patternIndices('4mm').length, 13);
  assert.equal(patternIndices('8mm').length, 7);
  assert.equal(patternIndices('12mm').length, 5);
  assert.equal(patternIndices('20mm').length, 3);
  assert.equal(patternIndices('slice').length, 0);
});

test('carrot is fixed at 8mm in the default workflow', () => {
  const carrotSelect = WORKFLOW.find(s => s.n === 2);
  assert.equal(carrotSelect.pattern, '8mm');
});

test('potato pattern is selectable (workflow injects it)', () => {
  const tl = workflowTimeline('20mm');
  const potatoSelect = tl.steps.find(s => s.step.n === 14);
  assert.equal(potatoSelect.step.pattern, '20mm');
});

// ---- part registry coverage --------------------------------------------

test('every drive/cam/latch is registered with an actuator and DOF', () => {
  for (const id of ['D1', 'camshaft', 'C1', 'C2', 'C3', 'C4', 'C5', 'D2', 'selectorShuttle', 'pusher', 'stripper', 'crosscut', 'originRail', 'farRail', 'cassette']) {
    assert.ok(PARTS[id], `part ${id} registered`);
    assert.ok(PARTS[id].dof, `part ${id} has a DOF`);
  }
});

test('every mechanism phase names an active mechanism that exists', () => {
  for (const p of MECH_PHASES) {
    if (p.mech === '—') continue;
    assert.ok(PARTS[p.mech], `phase ${p.id} mechanism ${p.mech} is a registered part`);
  }
});

test('no per-blade motor: only D1 is a motor, cams branch from one camshaft', () => {
  const motors = Object.values(PARTS).filter(p => p.kind === 'drive' && /motor/i.test(p.name));
  assert.equal(motors.length, 1, 'exactly one motor (D1)');
  assert.deepEqual(PARTS.camshaft.attaches, ['C1', 'C2', 'C3', 'C4', 'C5']);
});

// ---- workflow structure --------------------------------------------------

test('workflow has exactly 26 phases in order', () => {
  assert.equal(WORKFLOW.length, 26);
  WORKFLOW.forEach((s, i) => assert.equal(s.n, i + 1));
});

test('every workflow step maps to a defined mechanism phase', () => {
  const ids = new Set(MECH_PHASES.map(p => p.id));
  for (const s of WORKFLOW) assert.ok(ids.has(s.phase), `step ${s.n} phase ${s.phase}`);
});

test('default demonstration is the complete kitchen sequence', () => {
  const labels = WORKFLOW.map(s => s.label.toLowerCase());
  assert.ok(labels[0].includes('carrot'), 'starts by loading carrot');
  assert.ok(labels.some(l => l.includes('change size')), 'size change without wet die swap');
  assert.ok(labels.some(l => l.includes('potato')), 'potato cycle present');
  assert.ok(labels[25].includes('unfold'), 'ends with unfold for dishwasher');
});

// ---- interlock assertions hold across sampled timeline -------------------

test('assertions hold at sampled points across the whole timeline, every potato pattern', () => {
  for (const pat of Object.keys(PATTERNS)) {
    const { total } = workflowTimeline(pat);
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * total;
      const s = sampleAt(t, pat);
      const bad = checkState(s).filter(a => !a.ok);
      assert.deepEqual(bad, [], `pattern=${pat} t=${t.toFixed(2)} violations: ${bad.map(b => b.id).join(',')}`);
    }
  }
});

// ---- targeted illegal-transition rejection --------------------------------

test('rejects blade extension before tail engagement', () => {
  const s = { ...initialState(), bladeExtend: 0.5, tailEngaged: [] };
  const r = checkState(s).find(a => a.id === 'extend-after-engage');
  assert.equal(r.ok, false);
});

test('rejects receiver seated before tip travel completes', () => {
  const s = { ...initialState(), bladeExtend: 0.6, receiverSeated: true };
  assert.equal(checkState(s).find(a => a.id === 'seat-after-travel').ok, false);
});

test('rejects lock before receiver seating when blades are engaged', () => {
  const s = { ...initialState(), selectedIndices: patternIndices('8mm'), originLock: 1, farLock: 1, receiverSeated: false };
  assert.equal(checkState(s).find(a => a.id === 'lock-after-seat').ok, false);
});

test('permits locking with no blades engaged (slice mode)', () => {
  const s = { ...initialState(), selectedIndices: [], originLock: 1, farLock: 1, receiverSeated: false };
  assert.equal(checkState(s).find(a => a.id === 'lock-after-seat').ok, true);
});

test('rejects feed without both locks', () => {
  const s = { ...initialState(), feedProgress: 0.3, originLock: 1, farLock: 0.2 };
  assert.equal(checkState(s).find(a => a.id === 'feed-needs-locks').ok, false);
});

test('rejects crosscut sweep during pusher purge', () => {
  const s = { ...initialState(), stripProgress: 0.4, crosscutX: 0 };
  assert.equal(checkState(s).find(a => a.id === 'crosscut-clear-of-purge').ok, false);
});

test('rejects retract before locks release', () => {
  const s = { ...initialState(), wiperProgress: 0.5, originLock: 1, farLock: 1 };
  assert.equal(checkState(s).find(a => a.id === 'retract-after-unlock').ok, false);
});

test('rejects extraction while coupling engaged / cutters active', () => {
  const s = { ...initialState(), extractProgress: 0.5, couplingEngaged: true, crosscutParked: true, bladeExtend: 0, originLock: 0, farLock: 0 };
  assert.equal(checkState(s).find(a => a.id === 'extract-safe').ok, false);
});

test('rejects extraction when pusher not at service stop', () => {
  const s = { ...initialState(), extractProgress: 0.5, couplingEngaged: false, crosscutParked: true, bladeExtend: 0, originLock: 0, farLock: 0, pusherAtService: false };
  assert.equal(checkState(s).find(a => a.id === 'extract-pusher-parked').ok, false);
});

test('rejects unfold before extraction completes', () => {
  const s = { ...initialState(), unfoldProgress: 0.4, extractProgress: 0.6 };
  assert.equal(checkState(s).find(a => a.id === 'unfold-after-extract').ok, false);
});

test('rejects cut pieces with no modeled produce provenance', () => {
  const s = { ...initialState(), cutPieces: [{ produce: 'ghost', kind: 'cube', i: 0 }] };
  assert.equal(checkState(s).find(a => a.id === 'piece-provenance').ok, false);
});

// ---- provenance: pieces derive from the loaded produce -------------------

test('after carrot feed+crosscut, cut pieces reference carrot and become cubes', () => {
  const { total, steps } = workflowTimeline('12mm');
  const cross = steps.find(s => s.step.n === 8);
  const s = sampleAt(cross.start + cross.dur + 0.01, '12mm');
  assert.ok(s.cutPieces.length > 0);
  assert.ok(s.cutPieces.every(p => p.produce === 'carrot'));
  assert.ok(s.cutPieces.every(p => p.kind === 'cube'));
  assert.ok(total > 0);
});

// ---- honesty gates stay visible ------------------------------------------

test('unvalidated physical gates are declared and non-empty', () => {
  assert.ok(UNVALIDATED.length >= 6);
  assert.ok(UNVALIDATED.some(u => /beetroot|sweet potato/i.test(u)), 'hard-produce gate declared as unvalidated');
});
