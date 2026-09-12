import { DEMO_SCRIPT, WORLD } from './config.js'

const INITIAL_PLAYER_STATE = {
  A: { node: 'aStart', facing: 'east', lastInput: 'Waiting', action: 'Standing at the lantern gate.' },
  B: { node: 'bStart', facing: 'west', lastInput: 'Waiting', action: 'Standing at the lantern gate.' },
}

const INITIAL_PROGRESS = {
  sideTerraceReached: false,
  moonstoneReached: false,
  eastCtrlReached: false,
  farStoneReached: false,
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildAdjacency(edges) {
  const adjacency = new Map()
  for (const [left, right] of edges) {
    if (!adjacency.has(left)) adjacency.set(left, new Set())
    if (!adjacency.has(right)) adjacency.set(right, new Set())
    adjacency.get(left).add(right)
    adjacency.get(right).add(left)
  }
  return adjacency
}

const PERMANENT_ADJACENCY = buildAdjacency(WORLD.permanentEdges)

function node(nodeId) {
  return WORLD.nodes[nodeId]
}

function assemblyOrientation(state, assemblyId) {
  const assembly = WORLD.assemblies[assemblyId]
  return assembly.orientations[state.assemblies[assemblyId].orientation]
}

function assemblyNodeId(assemblyId) {
  return `${assemblyId}-center`
}

function playerOnAssemblyCenter(state, playerId, assemblyId) {
  return state.players[playerId].node === assemblyNodeId(assemblyId)
}

function anyPlayerOnAssemblyCenter(state, assemblyId) {
  return ['A', 'B'].some((playerId) => playerOnAssemblyCenter(state, playerId, assemblyId))
}

function setPlayerFeedback(state, playerId, lastInput, action) {
  state.players[playerId].lastInput = lastInput
  state.players[playerId].action = action
}

function copyForCheckpoint(state) {
  return deepClone({
    players: state.players,
    assemblies: state.assemblies,
    activeAssembly: state.activeAssembly,
    beaconLit: state.beaconLit,
    progress: state.progress,
    message: state.message,
    win: state.win,
  })
}

function restoreFromCheckpoint(state, snapshot) {
  state.players = deepClone(snapshot.players)
  state.assemblies = deepClone(snapshot.assemblies)
  state.activeAssembly = snapshot.activeAssembly
  state.beaconLit = snapshot.beaconLit
  state.progress = deepClone(snapshot.progress)
  state.message = snapshot.message
  state.win = snapshot.win
}

function updateProgress(state) {
  const positions = Object.values(state.players).map((player) => player.node)
  if (positions.includes('westEast')) state.progress.sideTerraceReached = true
  if (positions.includes('safeStone')) state.progress.moonstoneReached = true
  if (positions.includes('eastCtrl')) state.progress.eastCtrlReached = true
  if (positions.includes('farStone')) state.progress.farStoneReached = true
}

function refreshCheckpoint(state) {
  updateProgress(state)
  const nextIndex = state.checkpoints.findIndex((entry) => !entry.reached && entry.when(state))
  if (nextIndex === -1) return
  state.checkpoints[nextIndex].reached = true
  state.lastCheckpoint = nextIndex + 1
  state.checkpointSnapshot = copyForCheckpoint(state)
  state.message = state.checkpoints[nextIndex].label
}

function refreshWin(state) {
  if (state.players.A.node === 'reunion' && state.players.B.node === 'reunion') {
    state.win = true
    state.message = 'Lanterns released — both players reached the reunion court.'
    setPlayerFeedback(state, 'A', state.players.A.lastInput, 'Together in the reunion court.')
    setPlayerFeedback(state, 'B', state.players.B.lastInput, 'Together in the reunion court.')
  }
}

export function createInitialState() {
  return {
    players: deepClone(INITIAL_PLAYER_STATE),
    assemblies: {
      west: { orientation: 0 },
      east: { orientation: 0 },
    },
    activeAssembly: null,
    beaconLit: false,
    progress: deepClone(INITIAL_PROGRESS),
    message: 'A must light a paper wheel. B can preview wheel rotations before they become solid.',
    win: false,
    checkpoints: WORLD.checkpoints.map((checkpoint) => ({ ...checkpoint, reached: false })),
    lastCheckpoint: 0,
    checkpointSnapshot: {
      players: deepClone(INITIAL_PLAYER_STATE),
      assemblies: { west: { orientation: 0 }, east: { orientation: 0 } },
      activeAssembly: null,
      beaconLit: false,
      progress: deepClone(INITIAL_PROGRESS),
      message: 'Returned to the start.',
      win: false,
    },
  }
}

export function getReachableNeighbors(state, nodeId) {
  const neighbors = new Set(PERMANENT_ADJACENCY.get(nodeId) || [])

  if (state.beaconLit && WORLD.dynamicEdges.moonBridge.includes(nodeId)) {
    for (const endpoint of WORLD.dynamicEdges.moonBridge) {
      if (endpoint !== nodeId) neighbors.add(endpoint)
    }
  }

  for (const assemblyId of Object.keys(WORLD.assemblies)) {
    const centerId = assemblyNodeId(assemblyId)
    const active = state.activeAssembly === assemblyId
    const orientation = assemblyOrientation(state, assemblyId)
    if (!active) continue

    if (nodeId === centerId) {
      for (const anchor of orientation.anchors) neighbors.add(anchor)
    }

    if (orientation.anchors.includes(nodeId)) {
      neighbors.add(centerId)
    }
  }

  return [...neighbors]
}

export function getNodePosition(nodeId) {
  if (nodeId.endsWith('-center')) {
    const assemblyId = nodeId.replace('-center', '')
    return WORLD.assemblies[assemblyId].center
  }
  const location = node(nodeId)
  return { x: location.x, z: location.z }
}

function directionName(from, to) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'east' : 'west'
  return dz >= 0 ? 'south' : 'north'
}

export function moveToNeighbor(state, playerId, targetNodeId, source = 'touch') {
  const currentNodeId = state.players[playerId].node
  const neighbors = getReachableNeighbors(state, currentNodeId)
  if (!neighbors.includes(targetNodeId)) {
    setPlayerFeedback(state, playerId, `${source} move`, `Blocked: ${nodeLabel(targetNodeId)} is not reachable from here.`)
    state.message = `${playerId} cannot reach ${nodeLabel(targetNodeId)} from ${nodeLabel(currentNodeId)}.`
    return false
  }

  const from = getNodePosition(currentNodeId)
  const to = getNodePosition(targetNodeId)
  state.players[playerId].node = targetNodeId
  state.players[playerId].facing = directionName(from, to)
  setPlayerFeedback(state, playerId, `${source} move`, `Walking to ${nodeLabel(targetNodeId)}.`)
  state.message = `${playerId} moved to ${nodeLabel(targetNodeId)}.`
  refreshCheckpoint(state)
  refreshWin(state)
  return true
}

export function moveInDirection(state, playerId, direction, source = 'keyboard') {
  const currentNodeId = state.players[playerId].node
  const currentPos = getNodePosition(currentNodeId)
  const axis = {
    north: { x: 0, z: -1 },
    south: { x: 0, z: 1 },
    east: { x: 1, z: 0 },
    west: { x: -1, z: 0 },
  }[direction]

  let bestNodeId = null
  let bestScore = 0.35
  for (const neighborId of getReachableNeighbors(state, currentNodeId)) {
    const neighborPos = getNodePosition(neighborId)
    const dx = neighborPos.x - currentPos.x
    const dz = neighborPos.z - currentPos.z
    const length = Math.hypot(dx, dz) || 1
    const score = (dx / length) * axis.x + (dz / length) * axis.z
    if (score > bestScore) {
      bestScore = score
      bestNodeId = neighborId
    }
  }

  if (!bestNodeId) {
    setPlayerFeedback(state, playerId, `${source} ${direction}`, 'No walkway continues in that direction.')
    state.message = `${playerId} found no route to the ${direction}.`
    return false
  }

  return moveToNeighbor(state, playerId, bestNodeId, `${source} ${direction}`)
}

function nodeLabel(nodeId) {
  if (nodeId.endsWith('-center')) {
    const assemblyId = nodeId.replace('-center', '')
    return `${WORLD.assemblies[assemblyId].label} center`
  }
  return node(nodeId)?.label ?? nodeId
}

function currentLanternTarget(state, playerId) {
  const currentNode = node(state.players[playerId].node)
  if (playerId !== 'A') return null
  if (currentNode?.lanternTarget) return currentNode.lanternTarget
  return currentNode?.beaconAction ? 'beacon' : null
}

function rotateAssembly(state, playerId, assemblyId) {
  const assembly = WORLD.assemblies[assemblyId]
  const playerNode = state.players[playerId].node
  if (!assembly.controlNodes.includes(playerNode)) {
    setPlayerFeedback(state, playerId, 'Action', `Blocked: ${playerId} must stand at a control perch for ${assembly.label}.`)
    state.message = `${playerId} is too far from the ${assembly.label} controls.`
    return false
  }

  state.assemblies[assemblyId].orientation = (state.assemblies[assemblyId].orientation + 1) % assembly.orientations.length
  const orientation = assemblyOrientation(state, assemblyId)
  setPlayerFeedback(state, playerId, 'Action', `Rotating ${assembly.label} to ${orientation.label}.`)
  state.message = `${assembly.label} rotated to ${orientation.label}.`
  refreshCheckpoint(state)
  return true
}

function lightAssembly(state, playerId, assemblyId) {
  if (playerId !== 'A') {
    setPlayerFeedback(state, playerId, 'Action', 'Only A can guide the lantern light.')
    state.message = 'Only A can guide the lantern light.'
    return false
  }

  if (state.activeAssembly === assemblyId) {
    setPlayerFeedback(state, playerId, 'Action', `${WORLD.assemblies[assemblyId].label} is already illuminated.`)
    state.message = `${WORLD.assemblies[assemblyId].label} is already illuminated.`
    return false
  }

  if (state.activeAssembly && anyPlayerOnAssemblyCenter(state, state.activeAssembly)) {
    setPlayerFeedback(state, playerId, 'Action', `Blocked: someone is still riding the ${WORLD.assemblies[state.activeAssembly].label}.`)
    state.message = 'Move everyone off the lit wheel before transferring the light.'
    return false
  }

  state.activeAssembly = assemblyId
  setPlayerFeedback(state, playerId, 'Action', `Illuminating ${WORLD.assemblies[assemblyId].label}.`)
  state.message = `${WORLD.assemblies[assemblyId].label} becomes solid under the lantern light.`
  refreshCheckpoint(state)
  return true
}

function lightBeacon(state, playerId) {
  if (playerId !== 'A') {
    setPlayerFeedback(state, playerId, 'Action', 'Only A can ignite the festival beacon.')
    state.message = 'Only A can ignite the festival beacon.'
    return false
  }

  if (state.beaconLit) {
    setPlayerFeedback(state, playerId, 'Action', 'The festival beacon is already lit.')
    state.message = 'The festival beacon is already guiding the moon bridge.'
    return false
  }

  state.beaconLit = true
  setPlayerFeedback(state, playerId, 'Action', 'Igniting the festival beacon and unfurling the moon bridge.')
  state.message = 'The moon bridge unfurls from the side terrace to the reunion court.'
  refreshCheckpoint(state)
  refreshWin(state)
  return true
}

export function performAction(state, playerId) {
  if (state.win) {
    setPlayerFeedback(state, playerId, 'Action', 'The festival is already complete.')
    return false
  }

  if (playerId === 'A') {
    const target = currentLanternTarget(state, playerId)
    if (target === 'beacon') return lightBeacon(state, playerId)
    if (target) return lightAssembly(state, playerId, target)
  }

  if (playerId === 'B') {
    const currentNode = node(state.players[playerId].node)
    if (currentNode?.controlAssembly) return rotateAssembly(state, playerId, currentNode.controlAssembly)
  }

  setPlayerFeedback(state, playerId, 'Action', 'Nothing here responds to that action.')
  state.message = `${playerId} found no interactive festival control here.`
  return false
}

export function resetToLastCheckpoint(state) {
  restoreFromCheckpoint(state, state.checkpointSnapshot)
  state.message = `Restored ${state.lastCheckpoint === 0 ? 'the start' : WORLD.checkpoints[state.lastCheckpoint - 1].label}.`
  for (const playerId of ['A', 'B']) {
    setPlayerFeedback(state, playerId, 'Checkpoint reset', 'Returned to the latest lantern rest.')
  }
}

export function restartState(state) {
  const fresh = createInitialState()
  Object.assign(state, fresh)
}

export function getNodeActions(state, playerId) {
  const actions = []
  for (const neighborId of getReachableNeighbors(state, state.players[playerId].node)) {
    actions.push({ type: 'move', target: neighborId, label: `Move to ${nodeLabel(neighborId)}` })
  }

  const currentNode = node(state.players[playerId].node)
  if (playerId === 'A' && (currentNode?.lanternTarget || currentNode?.beaconAction)) {
    actions.push({ type: 'act', label: currentNode.beaconAction ? 'Ignite festival beacon' : `Illuminate ${WORLD.assemblies[currentNode.lanternTarget].label}` })
  }
  if (playerId === 'B' && currentNode?.controlAssembly) {
    const assembly = WORLD.assemblies[currentNode.controlAssembly]
    const nextOrientation = assembly.orientations[(state.assemblies[currentNode.controlAssembly].orientation + 1) % assembly.orientations.length]
    actions.push({ type: 'act', label: `Rotate ${assembly.label} to ${nextOrientation.label}` })
  }

  return actions
}

export function getAssemblyStatus(state, assemblyId) {
  const assembly = WORLD.assemblies[assemblyId]
  const orientation = assemblyOrientation(state, assemblyId)
  return {
    label: assembly.label,
    lit: state.activeAssembly === assemblyId,
    orientation: orientation.label,
    anchors: orientation.anchors,
  }
}

export function runDemoStep(state, index) {
  const step = DEMO_SCRIPT[index]
  if (!step) return false
  const [playerId, kind, value] = step
  if (kind === 'move') return moveToNeighbor(state, playerId, value, 'demo')
  if (kind === 'act') return performAction(state, playerId)
  return false
}

export function getDemoLength() {
  return DEMO_SCRIPT.length
}

export function getStartupSupportMessage({ hasWebGLRenderingContext = true, hasUsableWebGL = true } = {}) {
  if (!hasWebGLRenderingContext || !hasUsableWebGL) {
    return 'This activity needs WebGL-enabled browser support. Try current Chrome, Edge, Firefox, or Safari with hardware acceleration enabled.'
  }
  return ''
}

export function exportStateSummary(state) {
  return {
    players: {
      A: state.players.A.node,
      B: state.players.B.node,
    },
    activeAssembly: state.activeAssembly,
    westOrientation: state.assemblies.west.orientation,
    eastOrientation: state.assemblies.east.orientation,
    beaconLit: state.beaconLit,
    win: state.win,
    checkpoint: state.lastCheckpoint,
    progress: { ...state.progress },
  }
}
