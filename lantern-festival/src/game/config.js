export const PLAYER_IDS = ['A', 'B']

export const WORLD = {
  nodes: {
    aStart: { id: 'aStart', label: 'A Lantern Gate', x: -14, z: -4, kind: 'start', color: '#f3d7b8' },
    aLane: { id: 'aLane', label: 'A Garden Walk', x: -11, z: -4, kind: 'path', color: '#f4e2cb' },
    plaza: { id: 'plaza', label: 'Shared Plaza', x: -11, z: 0, kind: 'plaza', color: '#f7ead5' },
    bLane: { id: 'bLane', label: 'B Garden Walk', x: -11, z: 4, kind: 'path', color: '#f4e2cb' },
    bStart: { id: 'bStart', label: 'B Lantern Gate', x: -14, z: 4, kind: 'start', color: '#f3d7b8' },
    westBank: {
      id: 'westBank',
      label: 'West Bank Lantern',
      x: -8,
      z: 0,
      kind: 'lantern',
      lanternTarget: 'west',
      color: '#ffe5bb',
    },
    westEast: {
      id: 'westEast',
      label: 'Side Terrace',
      x: -4,
      z: 4,
      kind: 'control',
      controlAssembly: 'west',
      color: '#f4e6da',
    },
    safeStone: {
      id: 'safeStone',
      label: 'Moonstone Terrace',
      x: -4,
      z: -4,
      kind: 'lantern',
      lanternTarget: 'east',
      color: '#efe1ff',
    },
    eastCtrl: {
      id: 'eastCtrl',
      label: 'Crane Control Perch',
      x: 0,
      z: 4,
      kind: 'control',
      controlAssembly: 'east',
      color: '#f6dfdf',
    },
    farStone: { id: 'farStone', label: 'Far Blossom Landing', x: 4, z: 0, kind: 'path', color: '#f7e3c7' },
    beacon: {
      id: 'beacon',
      label: 'Festival Beacon',
      x: 8,
      z: 0,
      kind: 'beacon',
      beaconAction: true,
      color: '#ffe9c8',
    },
    reunion: { id: 'reunion', label: 'Lantern Reunion Court', x: 8, z: 4, kind: 'goal', color: '#fff0dc' },
  },
  permanentEdges: [
    ['aStart', 'aLane'],
    ['aLane', 'plaza'],
    ['plaza', 'bLane'],
    ['bLane', 'bStart'],
    ['plaza', 'westBank'],
    ['westEast', 'eastCtrl'],
    ['farStone', 'beacon'],
    ['beacon', 'reunion'],
  ],
  dynamicEdges: {
    moonBridge: ['westEast', 'reunion'],
  },
  assemblies: {
    west: {
      id: 'west',
      label: 'West Paper Wheel',
      center: { x: -6, z: 0 },
      orientations: [
        { key: 'side-route', label: 'Bank ↔ Side Terrace', anchors: ['westBank', 'westEast'], angle: Math.PI / 6 },
        { key: 'forward-route', label: 'Bank ↔ Moonstone Terrace', anchors: ['westBank', 'safeStone'], angle: -Math.PI / 6 },
      ],
      controlNodes: ['westBank', 'westEast'],
    },
    east: {
      id: 'east',
      label: 'East Crane Wheel',
      center: { x: 2, z: 2 },
      orientations: [
        { key: 'boarding-route', label: 'Moonstone ↔ Crane Perch', anchors: ['safeStone', 'eastCtrl'], angle: Math.PI / 3 },
        { key: 'ride-route', label: 'Crane Perch ↔ Far Blossom', anchors: ['eastCtrl', 'farStone'], angle: -Math.PI / 3 },
      ],
      controlNodes: ['eastCtrl'],
    },
  },
  checkpoints: [
    {
      key: 'side-terrace',
      label: 'Checkpoint 1 · Side Terrace discovered',
      when: (state) => state.players.B.node === 'westEast' || state.players.A.node === 'westEast',
    },
    {
      key: 'split-roles',
      label: 'Checkpoint 2 · Roles split across Moonstone and Crane Perch',
      when: (state) => state.players.A.node === 'safeStone' && state.players.B.node === 'eastCtrl',
    },
    {
      key: 'far-beacon',
      label: 'Checkpoint 3 · Far Blossom reached',
      when: (state) => state.players.A.node === 'farStone',
    },
  ],
}

export const DEMO_SCRIPT = [
  ['A', 'move', 'aLane'],
  ['A', 'move', 'plaza'],
  ['A', 'move', 'westBank'],
  ['B', 'move', 'bLane'],
  ['B', 'move', 'plaza'],
  ['B', 'move', 'westBank'],
  ['A', 'act'],
  ['B', 'move', 'west-center'],
  ['B', 'move', 'westEast'],
  ['B', 'act'],
  ['A', 'move', 'west-center'],
  ['A', 'move', 'safeStone'],
  ['B', 'move', 'eastCtrl'],
  ['A', 'act'],
  ['A', 'move', 'east-center'],
  ['B', 'act'],
  ['A', 'move', 'farStone'],
  ['A', 'move', 'beacon'],
  ['A', 'act'],
  ['A', 'move', 'reunion'],
  ['B', 'move', 'westEast'],
  ['B', 'move', 'reunion'],
]

export const GAME_COPY = {
  title: 'Lantern Festival: Shared Wheels',
  subtitle: 'A cozy cooperative route-building activity for two adults on one device.',
  objective:
    'Guide A to the Festival Beacon, then reunite in the Lantern Court. A moves the light. B rotates the paper wheels. Neither can finish alone.',
}
