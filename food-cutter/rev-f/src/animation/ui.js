// Rev F — inspection UI. Views, cutaway, transport, phase track, pattern
// selector, mechanism map, assertion readout, and the unvalidated-gates note.
// The UI only renders what the state machine reports; it cannot hide a
// violation because the assertion list is generated from checkState().

import { PARTS, PATTERNS, UNVALIDATED } from './config.js';
import { WORKFLOW, checkState, workflowTimeline } from './stateMachine.js';

export function buildUI(root, callbacks) {
  root.insertAdjacentHTML('beforeend', `
  <div id="hud">
    <h1>Rev F — Programmable Food Chopper <span class="tag">KINEMATIC PROTOTYPE</span></h1>
    <div id="step-label"></div>
    <div id="mech-line"></div>
    <div id="legend">
      <span><i style="background:#dde6f0"></i>Blades</span>
      <span><i style="background:#ff8c2f"></i>Cams / shuttle</span>
      <span><i style="background:#ffb020"></i>Lock clamps</span>
      <span><i style="background:#66c2ff"></i>Receivers</span>
      <span><i style="background:#2f9e6e"></i>Wipers / stripper</span>
      <span><i style="background:#39414f"></i>Cassette / mags</span>
    </div>
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
