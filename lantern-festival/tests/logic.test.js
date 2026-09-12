import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createInitialState,
  exportStateSummary,
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

test('restores the latest checkpoint without losing recovered progress', () => {
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
  assert.equal(state.lastCheckpoint, 1)
  moveToNeighbor(state, 'B', 'west-center')
  resetToLastCheckpoint(state)
  assert.equal(state.players.B.node, 'westEast')
  assert.equal(state.activeAssembly, 'west')
})

test('demo script completes the level using legal moves only', () => {
  const state = createInitialState()
  for (let index = 0; index < DEMO_SCRIPT.length; index += 1) {
    assert.equal(runDemoStep(state, index), true)
    }
  assert.equal(state.win, true)
})
