import * as THREE from 'three'
import { WORLD } from './config.js'

const LANTERN_GLOW = 0xffc86f
const SKY_TOP = 0xf7a8a0
const SKY_BOTTOM = 0xb19cff
const PLAYER_ROTATIONS = { north: Math.PI, south: 0, east: -Math.PI / 2, west: Math.PI / 2 }

function makeRoundedBox(width, height, depth, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02 }),
  )
}

function addTree(scene, x, z, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.22 * scale, 1.7 * scale, 12),
    new THREE.MeshStandardMaterial({ color: 0x7a4c2f, roughness: 1 }),
  )
  trunk.position.set(x, 0.85 * scale, z)
  trunk.castShadow = true
  scene.add(trunk)

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.2 * scale, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf8c7da, roughness: 1 }),
  )
  crown.position.set(x, 2.2 * scale, z)
  crown.castShadow = true
  scene.add(crown)
}

function addLantern(scene, x, z, color = LANTERN_GLOW) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 1.5, 12),
    new THREE.MeshStandardMaterial({ color: 0x7d5d44, roughness: 1 }),
  )
  post.position.set(x, 0.75, z)
  post.castShadow = true
  scene.add(post)

  const lightMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.35, 16),
    new THREE.MeshStandardMaterial({ color: 0xffefc7, emissive: color, emissiveIntensity: 1.15 }),
  )
  lightMesh.position.set(x, 1.55, z)
  lightMesh.castShadow = true
  scene.add(lightMesh)

  const pointLight = new THREE.PointLight(color, 1.1, 7, 2)
  pointLight.position.set(x, 1.55, z)
  scene.add(pointLight)
}

function createGradientSky() {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 512
  const context = canvas.getContext('2d')
  const gradient = context.createLinearGradient(0, 0, 0, 512)
  gradient.addColorStop(0, `#${new THREE.Color(SKY_TOP).getHexString()}`)
  gradient.addColorStop(1, `#${new THREE.Color(SKY_BOTTOM).getHexString()}`)
  context.fillStyle = gradient
  context.fillRect(0, 0, 2, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createFestivalScene() {
  const scene = new THREE.Scene()
  scene.background = createGradientSky()
  scene.fog = new THREE.Fog(0xf6d7d8, 22, 42)

  const ambient = new THREE.HemisphereLight(0xfff1dc, 0x8f6fa2, 1.7)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffd09a, 2.2)
  sun.position.set(-6, 12, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 40
  sun.shadow.camera.left = -20
  sun.shadow.camera.right = 20
  sun.shadow.camera.top = 20
  sun.shadow.camera.bottom = -20
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 24),
    new THREE.MeshStandardMaterial({ color: 0xf6eddc, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const stream = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 9),
    new THREE.MeshStandardMaterial({ color: 0x92c8df, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.78 }),
  )
  stream.rotation.x = -Math.PI / 2
  stream.position.set(-1.1, 0.03, 0.8)
  stream.receiveShadow = true
  scene.add(stream)

  const nodeMeshes = new Map()

  for (const entry of Object.values(WORLD.nodes)) {
    const tile = makeRoundedBox(2.5, 0.35, 2.5, entry.color)
    tile.position.set(entry.x, 0.18, entry.z)
    tile.receiveShadow = true
    tile.castShadow = true
    tile.userData.baseY = 0.18
    tile.userData.baseColor = new THREE.Color(entry.color)
    scene.add(tile)
    nodeMeshes.set(entry.id, tile)

    if (entry.kind === 'lantern' || entry.kind === 'beacon' || entry.kind === 'goal') {
      addLantern(scene, entry.x + 0.8, entry.z - 0.75, entry.kind === 'beacon' ? 0xffb347 : LANTERN_GLOW)
    }
  }

  const pathSegments = [
    { from: 'aStart', to: 'aLane' },
    { from: 'aLane', to: 'plaza' },
    { from: 'plaza', to: 'bLane' },
    { from: 'bLane', to: 'bStart' },
    { from: 'plaza', to: 'westBank' },
    { from: 'westEast', to: 'eastCtrl' },
    { from: 'farStone', to: 'beacon' },
    { from: 'beacon', to: 'reunion' },
  ]

  for (const segment of pathSegments) {
    const from = WORLD.nodes[segment.from]
    const to = WORLD.nodes[segment.to]
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    const bridge = makeRoundedBox(length, 0.12, 1.05, 0xe0c9a8)
    bridge.position.set((from.x + to.x) / 2, 0.08, (from.z + to.z) / 2)
    bridge.rotation.y = Math.atan2(dx, dz)
    bridge.receiveShadow = true
    scene.add(bridge)
  }

  addTree(scene, -15.5, -7, 1.2)
  addTree(scene, -14.5, 7, 1.15)
  addTree(scene, -2, -7, 1.1)
  addTree(scene, 6, 6.5, 1.1)

  const stallA = makeRoundedBox(2.6, 1.4, 1.4, 0xffdbc6)
  stallA.position.set(-9.5, 1, 7.5)
  stallA.castShadow = true
  scene.add(stallA)
  const stallB = makeRoundedBox(2.4, 1.2, 1.2, 0xf7c6d4)
  stallB.position.set(5.5, 0.9, -6.8)
  stallB.castShadow = true
  scene.add(stallB)

  const assemblyMeshes = new Map()
  for (const [assemblyId, assembly] of Object.entries(WORLD.assemblies)) {
    const base = new THREE.Group()
    const deckMaterial = new THREE.MeshStandardMaterial({ color: 0xfdf4e2, roughness: 0.65, metalness: 0.02 })
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 6), deckMaterial)
    deck.rotation.y = Math.PI / 6
    deck.castShadow = true
    deck.receiveShadow = true
    base.add(deck)

    const ribGeometry = new THREE.BoxGeometry(2.3, 0.12, 0.36)
    for (let i = 0; i < 3; i += 1) {
      const rib = new THREE.Mesh(
        ribGeometry,
        new THREE.MeshStandardMaterial({ color: 0xc28758, roughness: 0.92 }),
      )
      rib.position.y = 0.16
      rib.rotation.y = (Math.PI * i) / 3
      rib.castShadow = true
      base.add(rib)
    }

    base.position.set(assembly.center.x, 0.35, assembly.center.z)
    scene.add(base)
    assemblyMeshes.set(assemblyId, base)
  }

  const moonBridgeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1d4b0,
    transparent: true,
    opacity: 0,
    emissive: 0xf5c67e,
    emissiveIntensity: 0,
  })
  const moonBridge = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.16, 1.1), moonBridgeMaterial)
  moonBridge.position.set(2, 0.11, 4)
  moonBridge.rotation.y = Math.PI / 2
  moonBridge.scale.x = 0.01
  moonBridge.visible = false
  moonBridge.receiveShadow = true
  moonBridge.castShadow = true
  scene.add(moonBridge)

  const playerMeshes = {
    A: createPlayerMesh(0xdb8a55, 0xfff1d1),
    B: createPlayerMesh(0x9f67c7, 0xf7defc),
  }

  for (const mesh of Object.values(playerMeshes)) {
    scene.add(mesh)
  }

  return {
    scene,
    playerMeshes,
    assemblyMeshes,
    moonBridge,
    nodeMeshes,
  }
}

function createPlayerMesh(cloakColor, trimColor) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 1.15, 6, 12),
    new THREE.MeshStandardMaterial({ color: cloakColor, roughness: 0.92 }),
  )
  body.castShadow = true
  body.position.y = 1.05
  group.add(body)

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    new THREE.MeshStandardMaterial({ color: trimColor, roughness: 1 }),
  )
  head.position.y = 2.0
  head.castShadow = true
  group.add(head)

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff4cc, emissive: 0xffc86f, emissiveIntensity: 1.1 }),
  )
  lantern.position.set(0.4, 1.15, 0.35)
  lantern.castShadow = true
  group.add(lantern)

  return group
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  return renderer
}

export function createFollowCamera() {
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100)
  camera.position.set(0, 6, 10)
  return camera
}

export function syncScene(presentation, sceneParts) {
  for (const [playerId, mesh] of Object.entries(sceneParts.playerMeshes)) {
    const player = presentation.players[playerId]
    mesh.position.set(player.x, player.y, player.z)
    mesh.rotation.y = PLAYER_ROTATIONS[player.facing] ?? 0
  }

  for (const assemblyId of Object.keys(WORLD.assemblies)) {
    const visual = presentation.assemblies[assemblyId]
    const mesh = sceneParts.assemblyMeshes.get(assemblyId)
    mesh.rotation.y = visual.angle
    mesh.position.y = visual.lift
    mesh.children[0].material.emissive = new THREE.Color(0xffc86f)
    mesh.children[0].material.emissiveIntensity = visual.glow
  }

  for (const [nodeId, mesh] of sceneParts.nodeMeshes.entries()) {
    const isTarget = presentation.focus.kind === 'move' && presentation.focus.target === nodeId
    const targetScale = isTarget ? 1.08 : 1
    mesh.scale.set(targetScale, 1, targetScale)
    mesh.position.y = mesh.userData.baseY + (isTarget ? 0.06 : 0)
    mesh.material.emissive = new THREE.Color(isTarget ? 0xffcc7a : 0x000000)
    mesh.material.emissiveIntensity = isTarget ? 0.3 : 0
  }

  sceneParts.moonBridge.visible = presentation.bridge.progress > 0.01
  sceneParts.moonBridge.scale.x = Math.max(0.01, presentation.bridge.progress)
  sceneParts.moonBridge.material.opacity = presentation.bridge.progress
  sceneParts.moonBridge.material.emissiveIntensity = 0.5 * presentation.bridge.progress
}

export function updateCamera(camera, playerVisual) {
  const offsets = {
    north: { x: 0, z: 5.6 },
    south: { x: 0, z: -5.6 },
    east: { x: -5.6, z: 0 },
    west: { x: 5.6, z: 0 },
  }
  const offset = offsets[playerVisual.facing] ?? offsets.south
  camera.position.set(playerVisual.x + offset.x, 5.3, playerVisual.z + offset.z)
  camera.lookAt(playerVisual.x, 1.2, playerVisual.z)
}
