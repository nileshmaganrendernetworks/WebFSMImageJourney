import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createInitialState,
  exportStateSummary,
  getStartupSupportMessage,
  moveToNeighbor,
  performAction,
  resetToLastCheckpoint,
  runDemoStep,
} from '../src/game/logic.js'
import { DEMO_SCRIPT } from '../src/game/config.js'

function solveFestival(state) {
  moveToNeighbor(state, 'A', 'aLane')
  moveToNeighbor(state, 'A', 'plaza')
  moveToNeighbor(state, 'A', 'westBank')
  moveToNeighbor(state, 'B', 'bLane')
  moveToNeighbor(state, 'B', 'plaza')
  moveToNeighbor(state, 'B', 'westBank')
  performAction(state, 'A')
  moveToNeighbor(state, 'B', 'west-center')
  moveToNeighbor(state, 'B', 'westEast')
  performAction(state, 'B')
  moveToNeighbor(state, 'A', 'west-center')
  moveToNeighbor(state, 'A', 'safeStone')
  moveToNeighbor(state, 'B', 'eastCtrl')
  performAction(state, 'A')
  moveToNeighbor(state, 'A', 'east-center')
  performAction(state, 'B')
  moveToNeighbor(state, 'A', 'farStone')
  moveToNeighbor(state, 'A', 'beacon')
  performAction(state, 'A')
  moveToNeighbor(state, 'A', 'reunion')
  moveToNeighbor(state, 'B', 'westEast')
  moveToNeighbor(state, 'B', 'reunion')
}

test('requires both roles and reaches the solved state', () => {
  const state = createInitialState()
  solveFestival(state)
  assert.deepEqual(exportStateSummary(state), {
    players: { A: 'reunion', B: 'reunion' },
    activeAssembly: 'east',
    westOrientation: 1,
    eastOrientation: 1,
    beaconLit: true,
    win: true,
    checkpoint: 3,
    progress: {
      sideTerraceReached: true,
      moonstoneReached: true,
      eastCtrlReached: true,
      farStoneReached: true,
    },
  })
})

test('prevents A from transferring light while B is riding the lit wheel', () => {
  const state = createInitialState()
  moveToNeighbor(state, 'A', 'aLane')
  moveToNeighbor(state, 'A', 'plaza')
  moveToNeighbor(state, 'A', 'westBank')
  performAction(state, 'A')
  moveToNeighbor(state, 'B', 'bLane')
  moveToNeighbor(state, 'B', 'plaza')
  moveToNeighbor(state, 'B', 'westBank')
  moveToNeighbor(state, 'B', 'west-center')
  moveToNeighbor(state, 'A', 'west-center')
  moveToNeighbor(state, 'A', 'westBank')
  const transferred = performAction(state, 'A')
  assert.equal(transferred, false)
  assert.equal(state.activeAssembly, 'west')
})

test('reset keeps durable split-role progress when players reach checkpoint 2 out of order', () => {
  const state = createInitialState()
  moveToNeighbor(state, 'A', 'aLane')
  moveToNeighbor(state, 'A', 'plaza')
  moveToNeighbor(state, 'A', 'westBank')
  moveToNeighbor(state, 'B', 'bLane')
  moveToNeighbor(state, 'B', 'plaza')
  moveToNeighbor(state, 'B', 'westBank')
  performAction(state, 'A')
  moveToNeighbor(state, 'B', 'west-center')
  moveToNeighbor(state, 'B', 'westEast')
  performAction(state, 'B')
  moveToNeighbor(state, 'A', 'west-center')
  moveToNeighbor(state, 'A', 'safeStone')
  performAction(state, 'A')
  moveToNeighbor(state, 'A', 'east-center')
  moveToNeighbor(state, 'B', 'eastCtrl')
  assert.equal(state.lastCheckpoint, 2)
  moveToNeighbor(state, 'B', 'westEast')
  resetToLastCheckpoint(state)
  assert.equal(state.players.A.node, 'east-center')
  assert.equal(state.players.B.node, 'eastCtrl')
  assert.equal(state.activeAssembly, 'east')
})

test('demo script completes the level using legal moves only', () => {
  const state = createInitialState()
  for (let index = 0; index < DEMO_SCRIPT.length; index += 1) {
    assert.equal(runDemoStep(state, index), true)
  }
  assert.equal(state.win, true)
})

test('startup support message reports unusable WebGL contexts', () => {
  assert.match(
    getStartupSupportMessage({ hasWebGLRenderingContext: true, hasUsableWebGL: false }),
    /WebGL-enabled browser support/i,
  )
})
