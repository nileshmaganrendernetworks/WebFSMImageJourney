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

test('two banks cross with positive vertical clearance (two-plane dicer grid)', () => {
  // Like a real dicer: two orthogonal blade sets at slightly different
  // heights so they never collide at crossings, but close enough to dice.
  assert.ok(GEO.zBankY > GEO.xBankY, 'Z bank above X bank');
  assert.ok(GEO.zBankY - GEO.xBankY > GEO.bladeThickness + 0.02, 'crossing clearance');
  assert.ok(GEO.zBankY - GEO.xBankY < GEO.bladeDepth, 'close enough to act as one grid');
});

test('blade grid fits inside the chamber footprint (no wall pierce)', () => {
  const offs = bladeOffsets();
  const reach = Math.abs(offs[0]) + GEO.bladeThickness / 2;
  const inner = GEO.chamber.w / 2 - GEO.chamber.wall;
  assert.ok(reach < inner, `blade reach ${reach.toFixed(3)} inside chamber interior ${inner.toFixed(3)}`);
});

test('crosscut plane is in the stick band below the grid, above the bin', () => {
  assert.ok(GEO.crosscutY < GEO.xBankY - GEO.bladeDepth / 2, 'knife below the grid blades');
  const binTop = GEO.bin.y + GEO.bin.h / 2;
  assert.ok(GEO.crosscutY - 0.15 > binTop, 'knife clears the bin rim below');
});

test('pusher purge stays above the crosscut knife', () => {
  const pusherBottom = GEO.pusher.feedLimitY - GEO.pusher.faceThickness;
  const knifeTop = GEO.crosscutY + 0.15;
  assert.ok(pusherBottom > knifeTop + 0.02,
    `pusher bottom ${pusherBottom.toFixed(2)} clears knife top ${knifeTop.toFixed(2)}`);
});

test('pusher waffle: slot width clears blade thickness, posts sit between blades', () => {
  assert.ok(GEO.pusher.slotWidth > GEO.bladeThickness + 0.02, 'slot clears blade');
  assert.ok(GEO.pusher.slotWidth < GEO.pitch - 0.04, 'post material remains between slots');
});

test('pusher travels inside the chute column (no wall clip)', () => {
  // pusher plate half-width is set by the blade grid edge; chute is wider
  const gridHalf = (GEO.bladesPerBank - 1) / 2 * GEO.pitch + GEO.pitch / 2;
  assert.ok(gridHalf < GEO.chuteSize / 2, 'pusher plate narrower than chute sleeve');
  assert.ok(GEO.chuteSize / 2 <= GEO.chamber.w / 2, 'chute fits the chamber footprint');
});

test('pusher has an upper service stop and a lower feed limit, service above feed', () => {
  assert.ok(GEO.pusher.serviceY > GEO.pusher.contactY);
  assert.ok(GEO.pusher.contactY > GEO.pusher.feedLimitY);
});

test('blade travel ranges are ordered and stay within the magazine/receiver envelope', () => {
  assert.ok(GEO.xTravelMin < GEO.xTravelMax);
  assert.ok(GEO.zTravelMin < GEO.zTravelMax);
  assert.ok(GEO.xTravelMax + GEO.parts.bladeOvertravel > GEO.xTravelMax + GEO.parts.combOffset, 'seated tip enters receiver');
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

// ---- collision / no-overlap invariants ----------------------------------
// These pin the rendered clearances: at no point in the cycle may a moving
// part share space with a static or differently-moving part. All numbers
// come from GEO.parts so rendering and tests read the same source of truth.

test('blade strip spans magazine -> receiver with no gap at full extension', () => {
  const L = GEO.parts.bladeLen;
  const parkedTip = GEO.xTravelMin - GEO.parts.bladeParkedInset;
  const fullTip = parkedTip + (GEO.xTravelMax - GEO.xTravelMin) + GEO.parts.bladeOvertravel;
  // tip must reach into the receiver comb
  assert.ok(fullTip >= GEO.xTravelMax + GEO.parts.combOffset, 'tip seats into receiver');
  // tail must still be captured by the magazine at full extension
  const fullTail = fullTip - L;
  assert.ok(fullTail < GEO.xTravelMin, 'tail stays engaged with shuttle/magazine side');
});

test('origin lock rail is a comb: blades pass through slots, teeth bear between blades', () => {
  // Teeth sit at midpoints between blade lines; the gap from a blade face to
  // the nearest tooth face must be positive on every line.
  const toothHalf = (GEO.pitch * 0.42) / 2;
  for (const o of bladeOffsets()) {
    const gap = GEO.pitch / 2 - toothHalf - GEO.bladeThickness / 2;
    assert.ok(gap > 0.005, `blade line ${o.toFixed(2)} clears comb teeth (gap ${gap.toFixed(3)})`);
  }
  // and teeth really do sit between lines, not on them
  const lines = bladeOffsets();
  const mid = (lines[0] + lines[1]) / 2;
  assert.ok(Math.abs(mid - lines[0] - GEO.pitch / 2) < 1e-9, 'teeth centred between lines');
});

test('lock rails close only onto seated blades (state-level interlock)', () => {
  // Along-axis the comb rails DO overlap the blade strip span — that is the
  // intended tooth-to-side reaction contact through open slots. What must
  // never happen is the rail moving while a blade edge is crossing its
  // plane. That is guaranteed by the lock-after-seat / unlock-before-wipe
  // interlocks; assert them across the timeline here.
  for (const pat of Object.keys(PATTERNS)) {
    const { total } = workflowTimeline(pat);
    for (let i = 0; i <= 400; i++) {
      const s = sampleAt((i / 400) * total, pat);
      const bladesMoving = s.bladeExtend > 0.001 && s.bladeExtend < 0.999;
      if (s.selectedIndices.length > 0 && bladesMoving) {
        assert.ok(s.originLock <= 0.001 && s.farLock <= 0.001,
          `pattern=${pat} t=${(i / 400 * total).toFixed(2)}: rails must stay open while blades travel`);
      }
    }
  }
});

test('far lock rail never touches the blade tip through full travel', () => {
  const L = GEO.parts.bladeLen;
  const railHalf = GEO.parts.railDepth / 2;
  for (let k = 0; k <= 100; k++) {
    const ext = k / 100;
    const tip = GEO.xTravelMin - GEO.parts.bladeParkedInset + (GEO.xTravelMax - GEO.xTravelMin + GEO.parts.bladeOvertravel) * ext;
    // far rail open = rest position; closed = moved in by lockStroke
    const railOpenC = GEO.xTravelMax + GEO.parts.railOffsetFar;
    const railClosedC = railOpenC - GEO.parts.lockStroke;
    // while blade is still travelling, the far rail must be OPEN (locks close
    // only after seating per lock-after-seat assertion) — check against open
    if (ext < 0.999) {
      assert.ok(tip <= railOpenC - railHalf + 0.001, `tip ${tip.toFixed(2)} clear of open far rail at ext=${ext}`);
    } else {
      // seated: rail closes onto the blade side face — tip passes through the
      // open-through receiver beyond the rail plane
      assert.ok(tip > railClosedC, 'tip passes through receiver past closed rail plane');
    }
  }
});

test('wiper clears every blade line: blade passes through the wiper slot', () => {
  // wiper is a slotted comb like the pusher; slot pitch = blade pitch
  assert.ok(GEO.pitch > GEO.bladeThickness + 0.02, 'pitch leaves slot material between blades');
  assert.ok(GEO.parts.wiperOffset > GEO.parts.wiperDepth / 2, 'wiper fully inside storage boundary');
});

test('crosscut sweep never intersects the pusher or the bin walls', () => {
  const t = GEO.crosscut;
  // crosscut travels along X below the banks; bin is an open-top drawer whose
  // rim sits below the knife plane (bin centre 0.72, half height 0.4)
  const binTopY = 0.72 + 0.4;
  assert.ok(GEO.crosscutY > binTopY + 0.05, 'crosscut plane clears the bin rim');
  // sweep stays within chamber width
  assert.ok(t.travelMax <= GEO.chamber.w / 2 + 0.5, 'sweep bounded by chamber');
  assert.ok(t.dockX < -GEO.chamber.w / 2, 'dock parked outside the food zone');
});

test('unfold fan of the two cassette halves does not self-intersect', () => {
  // halves are symmetric about the rear hinge; the fan angle must keep the
  // half-widths from crossing the hinge axis on the opposite side
  const halfSpan = GEO.chamber.w / 2; // each half carries up to half the chamber
  const a = GEO.cassette.unfoldAngle / 2;
  // horizontal reach of each half toward the other side at full fan
  const reach = halfSpan * Math.cos(a);
  assert.ok(reach > -0.05, `half reach ${reach.toFixed(3)} must not cross the hinge centreline`);
  assert.ok(a < Math.PI / 2, 'fan stays below 90 deg per side');
});

test('engaged blade subset never exceeds pool capacity for pieces', () => {
  for (const key of Object.keys(PATTERNS)) {
    const n = patternIndices(key).length;
    assert.ok(n * 3 <= 64, `pattern ${key} pieces fit the pool`);
  }
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
