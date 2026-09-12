import './style.css'
import { DEMO_SCRIPT, GAME_COPY, WORLD } from './game/config.js'
import {
  createInitialState,
  exportStateSummary,
  getAssemblyStatus,
  getDemoLength,
  getNodeActions,
  getNodePosition,
  getStartupSupportMessage,
  moveInDirection,
  moveToNeighbor,
  performAction,
  resetToLastCheckpoint,
  restartState,
} from './game/logic.js'
import { createFestivalScene, createFollowCamera, createRenderer, syncScene, updateCamera } from './game/renderer.js'

const MOVE_DURATION_MS = 820
const ACTION_DURATION_MS = 760
const BETWEEN_STEPS_MS = 180
const app = document.querySelector('#app')

app.innerHTML = `
  <main class="shell">
    <header class="hero-card">
      <div>
        <p class="eyebrow">Playable local co-op · no runtime CDN requests</p>
        <h1>${GAME_COPY.title}</h1>
        <p class="subtitle">${GAME_COPY.subtitle}</p>
      </div>
      <div class="hero-copy">
        <p>${GAME_COPY.objective}</p>
        <ul class="hero-list">
          <li>A uses lantern posts to decide which paper wheel is solid.</li>
          <li>B rotates the currently useful wheel from nearby control perches.</li>
          <li>The walkthrough now animates real move/action inputs so the puzzle reads like live play from each phone POV.</li>
        </ul>
      </div>
    </header>

    <section class="toolbar" aria-label="Playback controls">
      <div class="playback-buttons">
        <button id="watch-demo" class="primary large">Watch full demo</button>
        <button id="pause-demo" class="large">Pause demo</button>
        <button id="restart-game" class="large">Restart activity</button>
        <button id="take-control" class="large">Take control</button>
      </div>
      <div class="secondary-tools">
        <button id="reset-checkpoint">Reset to last lantern rest</button>
        <label for="view-mode">View mode</label>
        <select id="view-mode">
          <option value="observer">Observer mode · side by side</option>
          <option value="A">Full view · Player A</option>
          <option value="B">Full view · Player B</option>
        </select>
      </div>
    </section>

    <section class="status-grid">
      <article>
        <h2>Festival guidance</h2>
        <p id="message" class="message"></p>
        <p id="goal-line" class="goal-line"></p>
      </article>
      <article>
        <h2>Wheel state</h2>
        <dl id="assembly-status" class="status-list"></dl>
      </article>
      <article>
        <h2>Checkpoint & honesty notes</h2>
        <ul id="checkpoint-list" class="checkpoint-list"></ul>
        <p class="note">Estimated first-play range: roughly 5–7 minutes for new pairs, unvalidated by human playtesting.</p>
      </article>
    </section>

    <p class="landscape-hint">For two adults sharing one phone or small tablet, landscape orientation is strongly recommended. Observer mode stays horizontal and each panel shows what that player is pressing and seeing.</p>

    <section id="view-shell" class="view-shell observer" data-testid="view-shell">
      <article class="player-view" data-player="A" data-testid="panel-A">
        <header>
          <div>
            <p class="pane-label">A · Lantern guide</p>
            <h3>Phone-style third-person POV</h3>
          </div>
          <div class="input-pill" id="input-A">Waiting</div>
        </header>
        <div class="viewport-wrap">
          <div class="viewport-callout-row">
            <span class="pov-chip">Phone A POV</span>
            <span class="callout-chip" id="callout-A">Waiting for input</span>
          </div>
          <canvas id="canvas-A" class="viewport" aria-label="Player A view"></canvas>
          <div class="viewport-overlay">
            <span class="chip">Character: <strong id="position-A"></strong></span>
            <span class="chip">Action: <strong id="action-A"></strong></span>
          </div>
        </div>
        <div class="control-panel">
          <button class="action-button" data-player="A" data-kind="act" id="act-A">Use nearby festival control</button>
          <div class="move-grid" id="moves-A"></div>
          <p class="control-note">Keyboard: WASD to move, F to act.</p>
        </div>
      </article>

      <article class="player-view" data-player="B" data-testid="panel-B">
        <header>
          <div>
            <p class="pane-label">B · Wheel keeper</p>
            <h3>Phone-style third-person POV</h3>
          </div>
          <div class="input-pill" id="input-B">Waiting</div>
        </header>
        <div class="viewport-wrap">
          <div class="viewport-callout-row">
            <span class="pov-chip">Phone B POV</span>
            <span class="callout-chip" id="callout-B">Waiting for input</span>
          </div>
          <canvas id="canvas-B" class="viewport" aria-label="Player B view"></canvas>
          <div class="viewport-overlay">
            <span class="chip">Character: <strong id="position-B"></strong></span>
            <span class="chip">Action: <strong id="action-B"></strong></span>
          </div>
        </div>
        <div class="control-panel">
          <button class="action-button" data-player="B" data-kind="act" id="act-B">Use nearby festival control</button>
          <div class="move-grid" id="moves-B"></div>
          <p class="control-note">Keyboard: arrow keys / IJKL to move, Enter or H to act.</p>
        </div>
      </article>
    </section>
  </main>
`

const ui = {
  message: document.querySelector('#message'),
  viewShell: document.querySelector('#view-shell'),
}

function renderStartupError(message) {
  ui.viewShell.innerHTML = ''
  const card = document.createElement('article')
  card.className = 'error-card'
  const heading = document.createElement('h2')
  heading.textContent = 'Unable to start the lantern festival'
  const body = document.createElement('p')
  body.textContent = message
  card.append(heading, body)
  ui.viewShell.append(card)
  ui.message.textContent = message
  window.__LANTERN_FESTIVAL_STARTUP_ERROR__ = message
}

function hasUsableWebGL() {
  const canvas = document.createElement('canvas')
  return !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
}

const startupError = getStartupSupportMessage({
  hasWebGLRenderingContext: !!window.WebGLRenderingContext,
  hasUsableWebGL: hasUsableWebGL(),
})

if (startupError) {
  renderStartupError(startupError)
} else {
  try {
    startApp()
  } catch (error) {
    console.error(error)
    renderStartupError('This activity could not create a working WebGL scene. Try a current browser with hardware acceleration enabled.')
  }
}

function startApp() {
  const state = createInitialState()
  const sceneParts = createFestivalScene()
  const cameras = {
    A: createFollowCamera(),
    B: createFollowCamera(),
  }
  if (window.__LANTERN_FESTIVAL_FORCE_RENDERER_ERROR__) {
    throw new Error('Forced renderer startup failure')
  }
  const renderers = {
    A: createRenderer(document.querySelector('#canvas-A')),
    B: createRenderer(document.querySelector('#canvas-B')),
  }

  const fullUi = {
    ...ui,
    goalLine: document.querySelector('#goal-line'),
    assemblyStatus: document.querySelector('#assembly-status'),
    checkpointList: document.querySelector('#checkpoint-list'),
    inputs: {
      A: document.querySelector('#input-A'),
      B: document.querySelector('#input-B'),
    },
    callouts: {
      A: document.querySelector('#callout-A'),
      B: document.querySelector('#callout-B'),
    },
    positions: {
      A: document.querySelector('#position-A'),
      B: document.querySelector('#position-B'),
    },
    actions: {
      A: document.querySelector('#action-A'),
      B: document.querySelector('#action-B'),
    },
    moveGrids: {
      A: document.querySelector('#moves-A'),
      B: document.querySelector('#moves-B'),
    },
    actionButtons: {
      A: document.querySelector('#act-A'),
      B: document.querySelector('#act-B'),
    },
    panels: {
      A: document.querySelector('[data-testid="panel-A"]'),
      B: document.querySelector('[data-testid="panel-B"]'),
    },
    watchDemo: document.querySelector('#watch-demo'),
    pauseDemo: document.querySelector('#pause-demo'),
    restartGame: document.querySelector('#restart-game'),
    takeControl: document.querySelector('#take-control'),
    resetCheckpoint: document.querySelector('#reset-checkpoint'),
    viewMode: document.querySelector('#view-mode'),
  }

  const demo = {
    active: false,
    paused: false,
    index: 0,
    waitUntil: 0,
    finished: false,
  }

  const canvasSizes = {
    A: { width: 0, height: 0 },
    B: { width: 0, height: 0 },
  }
  let animationFrameId = 0
  let renderFailed = false

  const presentation = createPresentationState(state)

  function createPresentationState(currentState) {
    const players = {}
    for (const playerId of ['A', 'B']) {
      const pos = getNodePosition(currentState.players[playerId].node)
      players[playerId] = {
        x: pos.x,
        z: pos.z,
        y: 0,
        facing: currentState.players[playerId].facing,
        moving: false,
        motion: null,
      }
    }

    const assemblies = {}
    for (const assemblyId of Object.keys(WORLD.assemblies)) {
      assemblies[assemblyId] = getAssemblyVisualTargets(currentState, assemblyId)
      assemblies[assemblyId].motion = null
    }

    return {
      players,
      assemblies,
      bridge: { progress: currentState.beaconLit ? 1 : 0, motion: null },
      focus: {
        playerId: null,
        kind: null,
        label: '',
        target: null,
      },
      holdUntil: 0,
    }
  }

  function getAssemblyVisualTargets(currentState, assemblyId) {
    return {
      angle: WORLD.assemblies[assemblyId].orientations[currentState.assemblies[assemblyId].orientation].angle,
      lift: currentState.activeAssembly === assemblyId ? 0.35 : 0.18,
      glow: currentState.activeAssembly === assemblyId ? 0.45 : 0,
    }
  }

  function inputLocked() {
    return demo.active || hasPresentationMotion(performance.now())
  }

  function setInput(playerId, label) {
    state.players[playerId].lastInput = label
  }

  function startFocus(playerId, kind, label, target = null) {
    presentation.focus = { playerId, kind, label, target }
    presentation.holdUntil = performance.now() + 220
  }

  function clearFocusIfIdle(now) {
    if (presentation.focus.playerId && !hasPresentationMotion(now) && now >= presentation.holdUntil) {
      presentation.focus = { playerId: null, kind: null, label: '', target: null }
      return true
    }
    return false
  }

  function applyActionResult(result, playerId, label) {
    setInput(playerId, label)
    if (!result && state.players[playerId].action === 'Waiting') {
      state.players[playerId].action = 'Action had no effect.'
    }
    if (!demo.active) demo.finished = false
    renderUi()
  }

  function animateMove(playerId, previousNodeId, nextNodeId) {
    const current = presentation.players[playerId]
    const from = getNodePosition(previousNodeId)
    const to = getNodePosition(nextNodeId)
    current.motion = {
      startTime: performance.now(),
      duration: MOVE_DURATION_MS,
      from,
      to,
      endFacing: state.players[playerId].facing,
    }
    current.moving = true
  }

  function animateWorldAfterAction(beforeSnapshot) {
    const now = performance.now()
    let changed = false
    for (const assemblyId of Object.keys(WORLD.assemblies)) {
      const visuals = presentation.assemblies[assemblyId]
      const next = getAssemblyVisualTargets(state, assemblyId)
      if (
        Math.abs(visuals.angle - next.angle) > 0.001 ||
        Math.abs(visuals.lift - next.lift) > 0.001 ||
        Math.abs(visuals.glow - next.glow) > 0.001
      ) {
        visuals.motion = {
          startTime: now,
          duration: ACTION_DURATION_MS,
          from: { angle: visuals.angle, lift: visuals.lift, glow: visuals.glow },
          to: next,
        }
        changed = true
      }
    }

    if (beforeSnapshot.beaconLit !== state.beaconLit) {
      presentation.bridge.motion = {
        startTime: now,
        duration: ACTION_DURATION_MS,
        from: presentation.bridge.progress,
        to: state.beaconLit ? 1 : 0,
      }
      changed = true
    }

    if (changed) presentation.holdUntil = now + ACTION_DURATION_MS
  }

  function queueMove(playerId, targetNodeId, source, label, force = false) {
    if (!force && inputLocked()) return
    const previousNodeId = state.players[playerId].node
    const result = moveToNeighbor(state, playerId, targetNodeId, source)
    if (result) {
      startFocus(playerId, 'move', label, targetNodeId)
      animateMove(playerId, previousNodeId, targetNodeId)
    }
    applyActionResult(result, playerId, label)
  }

  function queueAction(playerId, source, label, force = false) {
    if (!force && inputLocked()) return
    const beforeSnapshot = {
      beaconLit: state.beaconLit,
    }
    for (const assemblyId of Object.keys(WORLD.assemblies)) {
      beforeSnapshot[assemblyId] = getAssemblyVisualTargets(state, assemblyId)
    }
    const result = performAction(state, playerId)
    if (result) {
      startFocus(playerId, 'act', label)
      animateWorldAfterAction(beforeSnapshot)
    }
    applyActionResult(result, playerId, label)
  }

  function renderMoves(playerId) {
    const actions = getNodeActions(state, playerId)
    const moveActions = actions.filter((entry) => entry.type === 'move')
    const actionEntry = actions.find((entry) => entry.type === 'act')
    const actionButton = fullUi.actionButtons[playerId]
    actionButton.textContent = actionEntry?.label ?? 'No festival control here'
    actionButton.disabled = !actionEntry || inputLocked()
    actionButton.classList.toggle('demo-active', presentation.focus.playerId === playerId && presentation.focus.kind === 'act')

    fullUi.moveGrids[playerId].innerHTML = ''
    for (const action of moveActions) {
      const button = document.createElement('button')
      button.textContent = action.label.replace('Move to ', '')
      button.dataset.player = playerId
      button.dataset.target = action.target
      button.className = 'move-button'
      button.disabled = inputLocked()
      if (presentation.focus.playerId === playerId && presentation.focus.kind === 'move' && presentation.focus.target === action.target) {
        button.classList.add('demo-active')
      }
      button.addEventListener('click', () => queueMove(playerId, action.target, 'touch', `Tap ${button.textContent}`))
      fullUi.moveGrids[playerId].append(button)
    }
  }

  function renderAssemblyStatus() {
    const assemblies = ['west', 'east'].map((assemblyId) => getAssemblyStatus(state, assemblyId))
    fullUi.assemblyStatus.innerHTML = assemblies
      .map(
        (entry) => `
        <div>
          <dt>${entry.label}</dt>
          <dd>${entry.lit ? 'Lit and solid' : 'Preview only'} · ${entry.orientation}</dd>
        </div>
      `,
      )
      .join('')
  }

  function renderCheckpoints() {
    fullUi.checkpointList.innerHTML = state.checkpoints
      .map((entry) => `<li class="${entry.reached ? 'done' : ''}">${entry.reached ? '✓' : '○'} ${entry.label}</li>`)
      .join('')
  }

  function renderUi() {
    fullUi.message.textContent = state.message
    fullUi.goalLine.textContent = state.win
      ? 'Goal complete: both players reunited after lighting the beacon.'
      : 'Goal: send A to the Festival Beacon, then bring B across the final moon bridge.'

    for (const playerId of ['A', 'B']) {
      fullUi.inputs[playerId].textContent = state.players[playerId].lastInput
      fullUi.callouts[playerId].textContent = presentation.focus.playerId === playerId ? presentation.focus.label : 'Waiting for input'
      fullUi.positions[playerId].textContent = WORLD.nodes[state.players[playerId].node]?.label ?? state.players[playerId].node.replace('-center', ' wheel')
      fullUi.actions[playerId].textContent = state.players[playerId].action
      fullUi.panels[playerId].classList.toggle('is-focused', presentation.focus.playerId === playerId)
      renderMoves(playerId)
    }

    renderAssemblyStatus()
    renderCheckpoints()
    updatePlaybackButtons()
  }

  function updatePlaybackButtons() {
    fullUi.watchDemo.textContent = demo.finished ? 'Replay full demo' : demo.active ? 'Demo running…' : 'Watch full demo'
    fullUi.pauseDemo.textContent = demo.paused ? 'Resume demo' : 'Pause demo'
    fullUi.pauseDemo.disabled = !demo.active
    fullUi.takeControl.textContent = demo.active ? 'Take control' : 'Manual control active'
  }

  function startDemo() {
    restartState(state)
    demo.active = true
    demo.paused = false
    demo.index = 0
    demo.waitUntil = 0
    demo.finished = false
    resetPresentationToState()
    state.message = 'Running the legal-input demo. Inputs, movement, and wheel changes animate like live play.'
    for (const playerId of ['A', 'B']) {
      state.players[playerId].lastInput = 'Demo queue starting'
      state.players[playerId].action = 'Waiting for first move.'
    }
    renderUi()
  }

  function resetPresentationToState() {
    for (const playerId of ['A', 'B']) {
      const pos = getNodePosition(state.players[playerId].node)
      presentation.players[playerId].x = pos.x
      presentation.players[playerId].z = pos.z
      presentation.players[playerId].y = 0
      presentation.players[playerId].facing = state.players[playerId].facing
      presentation.players[playerId].moving = false
      presentation.players[playerId].motion = null
    }
    for (const assemblyId of Object.keys(WORLD.assemblies)) {
      const next = getAssemblyVisualTargets(state, assemblyId)
      Object.assign(presentation.assemblies[assemblyId], next, { motion: null })
    }
    presentation.bridge.progress = state.beaconLit ? 1 : 0
    presentation.bridge.motion = null
    presentation.focus = { playerId: null, kind: null, label: '', target: null }
    presentation.holdUntil = 0
    syncScene(presentation, sceneParts)
  }

  function stopDemo() {
    demo.active = false
    demo.paused = false
    demo.waitUntil = 0
    updatePlaybackButtons()
  }

  function runDemoFrame(now) {
    if (!demo.active || demo.paused || now < demo.waitUntil || hasPresentationMotion(now)) return
    if (demo.index >= getDemoLength()) {
      demo.active = false
      demo.finished = true
      state.message = 'Demo complete. The activity remains in its solved state until you restart or take control.'
      renderUi()
      return
    }

    const [playerId, kind, value] = DEMO_SCRIPT[demo.index]
    if (kind === 'move') {
      queueMove(playerId, value, 'demo', `Demo tap · ${WORLD.nodes[value]?.label ?? value}`, true)
    } else {
      queueAction(playerId, 'demo', 'Demo tap · use nearby festival control', true)
    }
    demo.index += 1
    demo.waitUntil = performance.now() + BETWEEN_STEPS_MS
  }

  function visiblePlayers() {
    return fullUi.viewMode.value === 'observer' ? ['A', 'B'] : [fullUi.viewMode.value]
  }

  function resizeRenderer(playerId) {
    const canvas = document.querySelector(`#canvas-${playerId}`)
    const { clientWidth, clientHeight } = canvas
    if (clientWidth === 0 || clientHeight === 0) return
    const cached = canvasSizes[playerId]
    if (cached.width === clientWidth && cached.height === clientHeight) return
    cached.width = clientWidth
    cached.height = clientHeight
    const renderer = renderers[playerId]
    renderer.setSize(clientWidth, clientHeight, false)
    cameras[playerId].aspect = clientWidth / clientHeight
    cameras[playerId].updateProjectionMatrix()
  }

  function smoothstep(value) {
    return value * value * (3 - 2 * value)
  }

  function hasPresentationMotion(now) {
    if (now < presentation.holdUntil) return true
    for (const playerId of ['A', 'B']) {
      if (presentation.players[playerId].motion) return true
    }
    for (const assemblyId of Object.keys(WORLD.assemblies)) {
      if (presentation.assemblies[assemblyId].motion) return true
    }
    return Boolean(presentation.bridge.motion)
  }

  function tickPresentation(now) {
    let needsUiRefresh = false
    for (const playerId of ['A', 'B']) {
      const player = presentation.players[playerId]
      const motion = player.motion
      if (!motion) continue
      const raw = Math.min(1, (now - motion.startTime) / motion.duration)
      const eased = smoothstep(Math.max(0, raw))
      player.x = motion.from.x + (motion.to.x - motion.from.x) * eased
      player.z = motion.from.z + (motion.to.z - motion.from.z) * eased
      player.y = Math.sin(eased * Math.PI) * 0.22
      player.facing = motion.endFacing
      player.moving = eased < 1
      if (raw >= 1) {
        player.x = motion.to.x
        player.z = motion.to.z
        player.y = 0
        player.facing = motion.endFacing
        player.moving = false
        player.motion = null
        needsUiRefresh = true
      }
    }

    for (const assemblyId of Object.keys(WORLD.assemblies)) {
      const assembly = presentation.assemblies[assemblyId]
      const motion = assembly.motion
      if (!motion) continue
      const raw = Math.min(1, (now - motion.startTime) / motion.duration)
      const eased = smoothstep(Math.max(0, raw))
      assembly.angle = motion.from.angle + (motion.to.angle - motion.from.angle) * eased
      assembly.lift = motion.from.lift + (motion.to.lift - motion.from.lift) * eased
      assembly.glow = motion.from.glow + (motion.to.glow - motion.from.glow) * eased
      if (raw >= 1) {
        assembly.angle = motion.to.angle
        assembly.lift = motion.to.lift
        assembly.glow = motion.to.glow
        assembly.motion = null
        needsUiRefresh = true
      }
    }

    if (presentation.bridge.motion) {
      const raw = Math.min(1, (now - presentation.bridge.motion.startTime) / presentation.bridge.motion.duration)
      const eased = smoothstep(Math.max(0, raw))
      presentation.bridge.progress = presentation.bridge.motion.from + (presentation.bridge.motion.to - presentation.bridge.motion.from) * eased
      if (raw >= 1) {
        presentation.bridge.progress = presentation.bridge.motion.to
        presentation.bridge.motion = null
        needsUiRefresh = true
      }
    }

    if (clearFocusIfIdle(now)) needsUiRefresh = true
    if (needsUiRefresh) renderUi()
  }

  function handleRenderFailure(error) {
    if (renderFailed) return
    renderFailed = true
    if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
    console.error(error)
    renderStartupError('This activity could not create a working WebGL scene. Try a current browser with hardware acceleration enabled.')
  }

  function animate(now = performance.now()) {
    if (renderFailed) return
    try {
      if (window.__LANTERN_FESTIVAL_FORCE_RENDER_ERROR__) {
        throw new Error('Forced render loop failure')
      }
      runDemoFrame(now)
      tickPresentation(now)
      syncScene(presentation, sceneParts)
      for (const playerId of visiblePlayers()) {
        resizeRenderer(playerId)
        updateCamera(cameras[playerId], presentation.players[playerId])
        renderers[playerId].render(sceneParts.scene, cameras[playerId])
      }
      animationFrameId = window.requestAnimationFrame(animate)
    } catch (error) {
      handleRenderFailure(error)
    }
  }

  fullUi.watchDemo.addEventListener('click', startDemo)
  fullUi.pauseDemo.addEventListener('click', () => {
    if (!demo.active) return
    demo.paused = !demo.paused
    state.message = demo.paused
      ? 'Demo paused. Playback is frozen; press Take control if you want manual input.'
      : 'Demo resumed.'
    renderUi()
  })
  fullUi.restartGame.addEventListener('click', () => {
    stopDemo()
    restartState(state)
    resetPresentationToState()
    state.message = 'Activity restarted from the lantern gates.'
    renderUi()
  })
  fullUi.takeControl.addEventListener('click', () => {
    if (demo.active) {
      stopDemo()
      state.message = 'Manual control returned to both players.'
    } else {
      state.message = 'Manual control is already active.'
    }
    renderUi()
  })
  fullUi.resetCheckpoint.addEventListener('click', () => {
    stopDemo()
    resetToLastCheckpoint(state)
    resetPresentationToState()
    renderUi()
  })
  fullUi.viewMode.addEventListener('change', () => {
    fullUi.viewShell.classList.remove('observer', 'focus-A', 'focus-B')
    fullUi.viewShell.classList.add(fullUi.viewMode.value === 'observer' ? 'observer' : `focus-${fullUi.viewMode.value}`)
  })

  for (const button of document.querySelectorAll('[data-kind="act"]')) {
    button.addEventListener('click', () => queueAction(button.dataset.player, 'touch', 'Tap action'))
  }

  const keyMap = {
    w: ['A', 'north'],
    a: ['A', 'west'],
    s: ['A', 'south'],
    d: ['A', 'east'],
    f: ['A', 'act'],
    ArrowUp: ['B', 'north'],
    ArrowLeft: ['B', 'west'],
    ArrowDown: ['B', 'south'],
    ArrowRight: ['B', 'east'],
    Enter: ['B', 'act'],
    i: ['B', 'north'],
    j: ['B', 'west'],
    k: ['B', 'south'],
    l: ['B', 'east'],
    h: ['B', 'act'],
  }

  document.addEventListener('keydown', (event) => {
    const element = event.target
    if (element instanceof HTMLElement && element.closest('button, a, input, select, textarea')) return
    const mapping = keyMap[event.key]
    if (!mapping) return
    event.preventDefault()
    if (inputLocked()) return
    const [playerId, intent] = mapping
    if (intent === 'act') {
      queueAction(playerId, 'keyboard', `Key ${event.key}`)
    } else {
      const beforeNodeId = state.players[playerId].node
      const result = moveInDirection(state, playerId, intent, `Key ${event.key}`)
      if (result) {
        startFocus(playerId, 'move', `Key ${event.key}`)
        animateMove(playerId, beforeNodeId, state.players[playerId].node)
      }
      applyActionResult(result, playerId, `Key ${event.key}`)
    }
  })

  resetPresentationToState()
  renderUi()
  animationFrameId = window.requestAnimationFrame(animate)
  window.__LANTERN_FESTIVAL_STATE__ = state
  window.__LANTERN_FESTIVAL_SUMMARY__ = () => exportStateSummary(state)
  window.__LANTERN_FESTIVAL_PRESENTATION__ = () => ({
    focus: { ...presentation.focus },
    players: {
      A: { ...presentation.players.A },
      B: { ...presentation.players.B },
    },
    bridge: { progress: presentation.bridge.progress },
  })
}
