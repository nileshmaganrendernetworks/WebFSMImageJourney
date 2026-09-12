import './style.css'
import { DEMO_SCRIPT, GAME_COPY, WORLD } from './game/config.js'
import {
  createInitialState,
  exportStateSummary,
  getAssemblyStatus,
  getDemoLength,
  getNodeActions,
  getStartupSupportMessage,
  moveInDirection,
  moveToNeighbor,
  performAction,
  resetToLastCheckpoint,
  restartState,
  runDemoStep,
} from './game/logic.js'
import { createFestivalScene, createFollowCamera, createRenderer, syncScene, updateCamera } from './game/renderer.js'

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
          <li>Observer mode always stays side by side; portrait devices get a landscape hint instead of a silent layout swap.</li>
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

    <p class="landscape-hint">For two adults sharing one phone or small tablet, landscape orientation is strongly recommended. Observer mode will remain horizontal and scroll if necessary.</p>

    <section id="view-shell" class="view-shell observer" data-testid="view-shell">
      <article class="player-view" data-player="A" data-testid="panel-A">
        <header>
          <div>
            <p class="pane-label">A · Lantern guide</p>
            <h3>Third-person follow view</h3>
          </div>
          <div class="input-pill" id="input-A">Waiting</div>
        </header>
        <div class="viewport-wrap">
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
            <h3>Third-person follow view</h3>
          </div>
          <div class="input-pill" id="input-B">Waiting</div>
        </header>
        <div class="viewport-wrap">
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
  ui.viewShell.innerHTML = `<article class="error-card"><h2>Unable to start the lantern festival</h2><p>${message}</p></article>`
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

  function inputLocked() {
    return demo.active
  }

  function setInput(playerId, label) {
    state.players[playerId].lastInput = label
  }

  function applyAction(result, playerId, label) {
    setInput(playerId, label)
    if (!result && state.players[playerId].action === 'Waiting') {
      state.players[playerId].action = 'Action had no effect.'
    }
    if (!demo.active) demo.finished = false
    renderUi()
  }

  function pressMoveButton(playerId, targetNodeId) {
    if (inputLocked()) return
    const result = moveToNeighbor(state, playerId, targetNodeId, 'touch')
    applyAction(result, playerId, `Tap ${WORLD.nodes[targetNodeId]?.label ?? targetNodeId}`)
  }

  function pressActionButton(playerId) {
    if (inputLocked()) return
    const result = performAction(state, playerId)
    applyAction(result, playerId, 'Tap action')
  }

  function renderMoves(playerId) {
    const actions = getNodeActions(state, playerId)
    const moveActions = actions.filter((entry) => entry.type === 'move')
    const actionEntry = actions.find((entry) => entry.type === 'act')
    fullUi.actionButtons[playerId].textContent = actionEntry?.label ?? 'No festival control here'
    fullUi.actionButtons[playerId].disabled = !actionEntry || inputLocked()

    fullUi.moveGrids[playerId].innerHTML = ''
    for (const action of moveActions) {
      const button = document.createElement('button')
      button.textContent = action.label.replace('Move to ', '')
      button.dataset.player = playerId
      button.dataset.target = action.target
      button.className = 'move-button'
      button.disabled = inputLocked()
      button.addEventListener('click', () => pressMoveButton(playerId, action.target))
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
      .map(
        (entry) => `<li class="${entry.reached ? 'done' : ''}">${entry.reached ? '✓' : '○'} ${entry.label}</li>`,
      )
      .join('')
  }

  function renderUi() {
    fullUi.message.textContent = state.message
    fullUi.goalLine.textContent = state.win
      ? 'Goal complete: both players reunited after lighting the beacon.'
      : 'Goal: send A to the Festival Beacon, then bring B across the final moon bridge.'

    for (const playerId of ['A', 'B']) {
      fullUi.inputs[playerId].textContent = state.players[playerId].lastInput
      fullUi.positions[playerId].textContent = WORLD.nodes[state.players[playerId].node]?.label ?? state.players[playerId].node.replace('-center', ' wheel')
      fullUi.actions[playerId].textContent = state.players[playerId].action
      renderMoves(playerId)
    }

    renderAssemblyStatus()
    renderCheckpoints()
    syncScene(state, sceneParts)
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
    state.message = 'Running the legal-input demo. Controls stay locked until you take control.'
    for (const playerId of ['A', 'B']) {
      state.players[playerId].lastInput = 'Demo queue starting'
      state.players[playerId].action = 'Waiting for first move.'
    }
    renderUi()
  }

  function stopDemo() {
    demo.active = false
    demo.paused = false
    demo.waitUntil = 0
    updatePlaybackButtons()
  }

  function runDemoFrame(now) {
    if (!demo.active || demo.paused || now < demo.waitUntil) return
    if (demo.index >= getDemoLength()) {
      demo.active = false
      demo.finished = true
      state.message = 'Demo complete. The activity remains in its solved state until you restart or take control.'
      renderUi()
      return
    }

    const [playerId, kind, value] = DEMO_SCRIPT[demo.index]
    const success = runDemoStep(state, demo.index)
    state.players[playerId].lastInput = kind === 'move' ? `Demo move: ${WORLD.nodes[value]?.label ?? value}` : 'Demo action'
    if (!success) {
      state.players[playerId].action = 'Demo step failed; manual review required.'
      stopDemo()
    } else {
      demo.index += 1
      demo.waitUntil = now + 550
    }
    renderUi()
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

  function animate(now = 0) {
    runDemoFrame(now)
    for (const playerId of ['A', 'B']) {
      resizeRenderer(playerId)
      updateCamera(cameras[playerId], state.players[playerId])
      renderers[playerId].render(sceneParts.scene, cameras[playerId])
    }
    requestAnimationFrame(animate)
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
    renderUi()
  })
  fullUi.viewMode.addEventListener('change', () => {
    fullUi.viewShell.className = `view-shell ${fullUi.viewMode.value === 'observer' ? 'observer' : `focus-${fullUi.viewMode.value}`}`
  })

  for (const button of document.querySelectorAll('[data-kind="act"]')) {
    button.addEventListener('click', () => pressActionButton(button.dataset.player))
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
      const result = performAction(state, playerId)
      applyAction(result, playerId, `Key ${event.key}`)
    } else {
      const result = moveInDirection(state, playerId, intent, `Key ${event.key}`)
      applyAction(result, playerId, `Key ${event.key}`)
    }
  })

  renderUi()
  requestAnimationFrame(animate)
  window.__LANTERN_FESTIVAL_STATE__ = state
  window.__LANTERN_FESTIVAL_SUMMARY__ = () => exportStateSummary(state)
}
