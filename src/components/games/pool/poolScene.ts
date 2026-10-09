import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import {
  BALL_R,
  CUSHION_DEPTH,
  CUSHIONS,
  FOOT_SPOT,
  HEAD_SPOT,
  HEAD_STRING_X,
  POCKETS,
  SAMPLE_EVERY,
  SIM_DT,
  simulateShot,
  TABLE_L,
  TABLE_W,
  traceAim,
  type AimTrace,
  type BallInHand,
  type PoolBall,
  type ShotEvent,
  type ShotInput,
} from "@/lib/pool"
import { ballHex, type BallSet, type ClothStyle, type CueStyle } from "../../../../convex/poolCosmetics"

export interface PoolPlayback {
  /** A new key starts a new replay. */
  key: string
  before: PoolBall[]
  shot: ShotInput
  /** Local epoch ms the shot was struck. */
  startedAt: number
}

export interface PoolCueView {
  /** Cue ball position the stick is lined up on. */
  x: number
  y: number
  dirX: number
  dirY: number
  /** 0-1 how far the stick is drawn back. */
  pull: number
  /** Where the tip meets the ball, -1 to 1 each way (as in ShotInput). */
  spinX: number
  spinY: number
  /** Remote aims ease in more gently than your own. */
  smooth: boolean
}

export interface PoolSceneState {
  /** A new key re-spins the balls (a new rack). */
  rackKey: string
  balls: PoolBall[]
  playback: PoolPlayback | null
  /** Where the cue ball is drawn while someone has it in hand. */
  cueBall: { x: number; y: number } | null
  cue: PoolCueView | null
  guide: { from: { x: number; y: number }; trace: AimTrace; legal: boolean } | null
  /** Balls to ring as legal first contacts. */
  targets: number[]
  placing: { area: BallInHand; valid: boolean } | null
  pockets: { selectable: boolean; called: number | null }
  camera: "top" | "cue"
  interactive: boolean
  /** The shooter's cue; the cloth and ball set are this viewer's own. */
  look: { cue: CueStyle; cloth: ClothStyle; ballSet: BallSet }
}

export interface PoolSceneHandlers {
  onAimAt: (x: number, y: number) => void
  onAimRotate: (radians: number) => void
  onPlace: (x: number, y: number) => void
  onPocket: (index: number) => void
  onEvent: (event: ShotEvent) => void
}

export interface PoolScene {
  update: (state: PoolSceneState) => void
  dispose: () => void
}

const HL = TABLE_L / 2
const HW = TABLE_W / 2
const RAIL_WIDTH = 0.12
const OUTER_X = HL + CUSHION_DEPTH + RAIL_WIDTH
const OUTER_Y = HW + CUSHION_DEPTH + RAIL_WIDTH
const CUSHION_H = 0.04
const RAIL_H = 0.046
const FLOOR_Y = -0.76
const CUE_LENGTH = 1.45
const CUE_ELEVATION = (5 * Math.PI) / 180
const SINK_S = 0.26
/** Pockets are real holes: a leather cup this deep under each one. */
const CUP_DEPTH = 0.094
/** Potted balls sit in the cup for a beat, then roll into the tray along the near rail. */
const CUP_HOLD_S = 0.45
const TRAY_ROLL_S = 0.75
const TRAY_Z = OUTER_Y + 0.055
const TRAY_LIFT = -0.079
const TRAY_IN_X = 0.52
const trayX = (slot: number) => -0.48 + slot * (BALL_R * 2 + 0.002)
/** Cue-view players watch the first moments of a shot from behind the cue before the camera rises. */
const SHOT_CAM_S = 1.1

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext("2d")!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function ballTexture(n: number, set: BallSet) {
  return canvasTexture(512, 256, (ctx) => {
    const color = ballHex(set, n)
    const stripe = n >= 9
    ctx.fillStyle = stripe ? "#f5f1e6" : color
    ctx.fillRect(0, 0, 512, 256)
    if (stripe) {
      ctx.fillStyle = color
      ctx.fillRect(0, 128 - 54, 512, 108)
    }
    if (n === 0) {
      // Measle dots so the spin reads.
      ctx.fillStyle = "#c81e1e"
      for (const [x, y] of [[64, 128], [192, 128], [320, 128], [448, 128], [128, 52], [384, 204]]) {
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    for (const cx of [128, 384]) {
      ctx.fillStyle = "#f8f5ec"
      ctx.beginPath()
      ctx.arc(cx, 128, 38, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#111"
      ctx.font = `bold ${n >= 10 ? 38 : 46}px system-ui, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(n), cx, 131)
      if (n === 6 || n === 9) ctx.fillRect(cx - 11, 152, 22, 4)
    }
  })
}

/** Near-white speckle that multiplies into the cloth colour, so the nap shows up close. */
function clothTexture() {
  const texture = canvasTexture(512, 512, (ctx) => {
    const image = ctx.createImageData(512, 512)
    for (let i = 0; i < image.data.length; i += 4) {
      const shade = 226 + Math.random() * 29
      image.data[i] = image.data[i + 1] = image.data[i + 2] = shade
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  })
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(10, 5)
  return texture
}

function woodTexture(base: string, light: string, dark: string, repeat: number) {
  const texture = canvasTexture(1024, 256, (ctx) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, 1024, 256)
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * 256
      ctx.strokeStyle = Math.random() < 0.5 ? dark : light
      ctx.globalAlpha = 0.06 + Math.random() * 0.16
      ctx.lineWidth = 1 + Math.random() * 3
      ctx.beginPath()
      const amp = 2 + Math.random() * 6
      const freq = 0.003 + Math.random() * 0.006
      for (let x = 0; x <= 1024; x += 16) ctx.lineTo(x, y + Math.sin(x * freq + i) * amp)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  })
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat / 2)
  return texture
}

/** Rectangle traced at the rail line, with each pocket's circle bitten out of it. */
function railOutline(): THREE.Vector2[] {
  const X = HL + CUSHION_DEPTH
  const Y = HW + CUSHION_DEPTH
  const corners = [[-X, -Y], [X, -Y], [X, Y], [-X, Y]]
  const points: THREE.Vector2[] = []
  for (let side = 0; side < 4; side++) {
    const [ax, ay] = corners[side]
    const [bx, by] = corners[(side + 1) % 4]
    const length = Math.hypot(bx - ax, by - ay)
    const steps = Math.ceil(length / 0.004)
    for (let s = 0; s < steps; s++) {
      let x = ax + ((bx - ax) * s) / steps
      let y = ay + ((by - ay) * s) / steps
      for (const pocket of POCKETS) {
        const dx = x - pocket.x
        const dy = y - pocket.y
        const d = Math.hypot(dx, dy)
        if (d < pocket.hole) {
          x = pocket.x + (dx / d) * pocket.hole
          y = pocket.y + (dy / d) * pocket.hole
        }
      }
      points.push(new THREE.Vector2(x, y))
    }
  }
  return points
}

function roundedRect(shape: THREE.Shape | THREE.Path, x: number, y: number, radius: number) {
  shape.moveTo(-x + radius, -y)
  shape.lineTo(x - radius, -y)
  shape.quadraticCurveTo(x, -y, x, -y + radius)
  shape.lineTo(x, y - radius)
  shape.quadraticCurveTo(x, y, x - radius, y)
  shape.lineTo(-x + radius, y)
  shape.quadraticCurveTo(-x, y, -x, y - radius)
  shape.lineTo(-x, -y + radius)
  shape.quadraticCurveTo(-x, -y, -x + radius, -y)
}

/** Extrudes a shape drawn in sim (x, y) coordinates up from `base` to `base + height`. */
function extrudeUp(shape: THREE.Shape, height: number, base: number, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  })
  // Shape y becomes three.js z; the extrusion runs downward, so lift it back up.
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, base + height - bevel, 0)
  return geometry
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3
}

interface Replay {
  key: string
  count: number
  numbers: number[]
  sampleDt: number
  /** Per sample: x, z for every ball. */
  positions: Float32Array[]
  /** Per sample: three.js angular velocity for every ball. */
  spins: Float32Array[]
  events: ShotEvent[]
  pots: Map<number, { t: number; pocket: number }>
  /** Tray slot each newly potted ball rolls to. */
  slots: Map<number, number>
  /** Cue ball path, one point per sample, for the trail. */
  trail: Float32Array
  duration: number
  startedAt: number
  lastElapsed: number
  eventIndex: number
}

export function createPoolScene(container: HTMLElement, handlers: PoolSceneHandlers): PoolScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = "block"
  renderer.domElement.style.width = "100%"
  renderer.domElement.style.height = "100%"
  renderer.domElement.style.touchAction = "none"
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07090a)
  scene.fog = new THREE.Fog(0x07090a, 8, 16)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.28

  const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 60)
  const disposables: Array<{ dispose: () => void }> = [environment, pmrem, roomEnvironment]
  const keep = <T extends { dispose: () => void }>(item: T) => (disposables.push(item), item)

  // ─── Lights: a pool of warm light on the cloth, the room falls away ───
  scene.add(new THREE.HemisphereLight(0xc8d6ff, 0x1a120a, 0.35))
  const key = new THREE.DirectionalLight(0xfff1dc, 1.4)
  key.position.set(0.25, 5, 0.35)
  key.target.position.set(0, 0, 0)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -OUTER_X - 0.1
  key.shadow.camera.right = OUTER_X + 0.1
  key.shadow.camera.top = OUTER_Y + 0.1
  key.shadow.camera.bottom = -OUTER_Y - 0.1
  key.shadow.camera.near = 3
  key.shadow.camera.far = 7
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.01
  key.shadow.radius = 4
  scene.add(key, key.target)
  const pool = new THREE.SpotLight(0xffe2b8, 6, 0, 0.62, 0.85, 1.6)
  pool.position.set(0, 2.6, 0)
  pool.target.position.set(0, 0, 0)
  scene.add(pool, pool.target)

  // ─── Table ───
  const cloth = keep(clothTexture())
  const feltMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x1f7f50, map: cloth, roughness: 0.95, metalness: 0 }))
  const cushionMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x1a6c42, map: cloth, roughness: 0.92, metalness: 0 }))
  const railWood = keep(woodTexture("#5b2410", "#8a4a26", "#2a0d04", 3))
  const railMaterial = keep(new THREE.MeshPhysicalMaterial({ map: railWood, color: 0xd8b49a, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 }))
  const bodyWood = keep(woodTexture("#3a160a", "#5e2c14", "#1a0702", 2))
  const bodyMaterial = keep(new THREE.MeshStandardMaterial({ map: bodyWood, color: 0xb59a88, roughness: 0.6 }))

  // The cloth runs under the rails far enough to hold every pocket as a whole hole.
  const bedShape = new THREE.Shape()
  bedShape.moveTo(-(HL + 0.09), -(HW + 0.11))
  bedShape.lineTo(HL + 0.09, -(HW + 0.11))
  bedShape.lineTo(HL + 0.09, HW + 0.11)
  bedShape.lineTo(-(HL + 0.09), HW + 0.11)
  for (const pocket of POCKETS) {
    const hole = new THREE.Path()
    hole.absarc(pocket.x, pocket.y, pocket.hole, 0, Math.PI * 2, true)
    bedShape.holes.push(hole)
  }
  // Pockets sit symmetrically, so the flip in y from laying the shape flat changes nothing.
  const bedGeometry = keep(new THREE.ShapeGeometry(bedShape, 32))
  bedGeometry.rotateX(-Math.PI / 2)
  const bed = new THREE.Mesh(bedGeometry, feltMaterial)
  bed.receiveShadow = true
  scene.add(bed)

  const cupMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x24170e, roughness: 0.85, side: THREE.DoubleSide }))
  const cupBottomMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x090605, roughness: 1 }))
  for (const pocket of POCKETS) {
    const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(pocket.hole - 0.003, pocket.hole - 0.01, CUP_DEPTH, 40, 1, true)), cupMaterial)
    wall.position.set(pocket.x, -CUP_DEPTH / 2, pocket.y)
    wall.receiveShadow = true
    scene.add(wall)
    const bottomGeometry = keep(new THREE.CircleGeometry(pocket.hole - 0.01, 40))
    bottomGeometry.rotateX(-Math.PI / 2)
    const bottom = new THREE.Mesh(bottomGeometry, cupBottomMaterial)
    bottom.position.set(pocket.x, -CUP_DEPTH, pocket.y)
    bottom.receiveShadow = true
    scene.add(bottom)
  }

  for (const cushion of CUSHIONS) {
    const shape = new THREE.Shape([
      new THREE.Vector2(cushion.p.x, cushion.p.y),
      new THREE.Vector2(cushion.q.x, cushion.q.y),
      new THREE.Vector2(cushion.q.x + cushion.jawQ.x, cushion.q.y + cushion.jawQ.y),
      new THREE.Vector2(cushion.p.x + cushion.jawP.x, cushion.p.y + cushion.jawP.y),
    ])
    const mesh = new THREE.Mesh(keep(extrudeUp(shape, CUSHION_H, 0)), cushionMaterial)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  const railShape = new THREE.Shape()
  roundedRect(railShape, OUTER_X, OUTER_Y, 0.05)
  railShape.holes.push(new THREE.Path(railOutline()))
  // The rails reach down past the cups, so their pocket bites line the outer half of each hole.
  const rails = new THREE.Mesh(keep(extrudeUp(railShape, RAIL_H + 0.1, -0.1, 0.006)), railMaterial)
  rails.castShadow = true
  rails.receiveShadow = true
  scene.add(rails)

  const apronShape = new THREE.Shape()
  roundedRect(apronShape, OUTER_X - 0.004, OUTER_Y - 0.004, 0.05)
  const apron = new THREE.Mesh(keep(extrudeUp(apronShape, 0.075, -0.172, 0.01)), bodyMaterial)
  apron.receiveShadow = true
  scene.add(apron)
  const legGeometry = keep(new THREE.BoxGeometry(0.15, -0.17 - FLOOR_Y, 0.15))
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(legGeometry, bodyMaterial)
    leg.position.set(sx * (OUTER_X - 0.2), (FLOOR_Y - 0.17) / 2, sy * (OUTER_Y - 0.16))
    scene.add(leg)
  }

  // Ball tray hung off the near rail.
  const brassMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.32, metalness: 0.85 }))
  const trayLength = trayX(14) - trayX(0) + 0.16
  const trayCentre = (trayX(0) + trayX(14)) / 2 + 0.03
  const trayPart = (width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(width, height, depth)), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
  }
  trayPart(trayLength, 0.01, 0.07, trayCentre, TRAY_LIFT - 0.005, TRAY_Z, bodyMaterial)
  trayPart(trayLength, 0.032, 0.006, trayCentre, TRAY_LIFT + 0.012, TRAY_Z + 0.036, brassMaterial)
  trayPart(trayLength, 0.05, 0.02, trayCentre, TRAY_LIFT + 0.02, OUTER_Y + 0.01, bodyMaterial)
  for (const end of [-1, 1]) trayPart(0.006, 0.032, 0.07, trayCentre + (end * trayLength) / 2, TRAY_LIFT + 0.012, TRAY_Z, brassMaterial)

  // Sights: mother-of-pearl diamonds along the rails.
  const pearlMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.25, metalness: 0.1 }))
  const diamondGeometry = keep(new THREE.CircleGeometry(0.009, 4))
  diamondGeometry.rotateX(-Math.PI / 2)
  const sightLine = CUSHION_DEPTH + RAIL_WIDTH * 0.48
  const addSight = (x: number, z: number, rotate: boolean) => {
    const sight = new THREE.Mesh(diamondGeometry, pearlMaterial)
    sight.position.set(x, RAIL_H + 0.0006, z)
    if (rotate) sight.rotation.y = Math.PI / 2
    scene.add(sight)
  }
  for (let k = 1; k < 8; k++) {
    if (k === 4) continue
    const x = -HL + (k * TABLE_L) / 8
    addSight(x, -(HW + sightLine), false)
    addSight(x, HW + sightLine, false)
  }
  for (let k = 1; k < 4; k++) {
    const z = -HW + (k * TABLE_W) / 4
    addSight(-(HL + sightLine), z, true)
    addSight(HL + sightLine, z, true)
  }

  const spotMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }))
  const spotGeometry = keep(new THREE.CircleGeometry(0.006, 16))
  spotGeometry.rotateX(-Math.PI / 2)
  for (const spot of [HEAD_SPOT, FOOT_SPOT]) {
    const mesh = new THREE.Mesh(spotGeometry, spotMaterial)
    mesh.position.set(spot.x, 0.001, spot.y)
    scene.add(mesh)
  }

  // Floor and an overhead lamp hood.
  const floorWood = keep(woodTexture("#1d140d", "#2e2117", "#0b0705", 10))
  const floorGeometry = keep(new THREE.PlaneGeometry(24, 24))
  floorGeometry.rotateX(-Math.PI / 2)
  const floor = new THREE.Mesh(floorGeometry, keep(new THREE.MeshStandardMaterial({ map: floorWood, roughness: 0.85 })))
  floor.position.y = FLOOR_Y
  floor.receiveShadow = true
  scene.add(floor)
  const hoodMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x173b2a, roughness: 0.45, metalness: 0.5 }))
  // Only seen from the low cue view; overhead it would sit between the camera and the cloth.
  const lamp = new THREE.Group()
  scene.add(lamp)
  const hood = new THREE.Mesh(keep(new THREE.BoxGeometry(1.7, 0.1, 0.36)), hoodMaterial)
  hood.position.set(0, 1.25, 0)
  lamp.add(hood)
  const glowGeometry = keep(new THREE.PlaneGeometry(1.6, 0.28))
  glowGeometry.rotateX(Math.PI / 2)
  const glow = new THREE.Mesh(glowGeometry, keep(new THREE.MeshBasicMaterial({ color: 0xfff3dc, toneMapped: false })))
  glow.position.set(0, 1.199, 0)
  lamp.add(glow)
  const chainGeometry = keep(new THREE.CylinderGeometry(0.004, 0.004, 2, 6))
  for (const x of [-0.7, 0.7]) {
    const chain = new THREE.Mesh(chainGeometry, hoodMaterial)
    chain.position.set(x, 2.3, 0)
    lamp.add(chain)
  }

  // ─── Balls ───
  const ballGeometry = keep(new THREE.SphereGeometry(BALL_R, 48, 32))
  const ballMeshes = new Map<number, THREE.Mesh>()
  const ballMaterials: THREE.MeshPhysicalMaterial[] = []
  for (let n = 0; n <= 15; n++) {
    const material = keep(new THREE.MeshPhysicalMaterial({ roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }))
    ballMaterials.push(material)
    const mesh = new THREE.Mesh(ballGeometry, material)
    mesh.castShadow = true
    mesh.visible = false
    scene.add(mesh)
    ballMeshes.set(n, mesh)
  }

  // ─── Overlays on the cloth ───
  const overlay = (color: number, opacity: number) => keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
  const ribbonGeometry = keep(new THREE.PlaneGeometry(1, 1))
  ribbonGeometry.rotateX(-Math.PI / 2)
  const ribbon = (material: THREE.MeshBasicMaterial) => {
    const mesh = new THREE.Mesh(ribbonGeometry, material)
    mesh.visible = false
    mesh.renderOrder = 2
    scene.add(mesh)
    return mesh
  }
  const setRibbon = (mesh: THREE.Mesh, ax: number, ay: number, bx: number, by: number, width: number, lift = 0.0016) => {
    const length = Math.hypot(bx - ax, by - ay)
    mesh.visible = length > 0.001
    mesh.position.set((ax + bx) / 2, lift, (ay + by) / 2)
    mesh.scale.set(length, 1, width)
    mesh.rotation.y = -Math.atan2(by - ay, bx - ax)
  }
  const aimMaterial = overlay(0xffffff, 0.55)
  const objectMaterial = overlay(0xffffff, 0.7)
  const deflectMaterial = overlay(0xffffff, 0.32)
  const aimLine = ribbon(aimMaterial)
  const objectLine = ribbon(objectMaterial)
  const deflectLine = ribbon(deflectMaterial)
  const ghostMaterial = overlay(0xffffff, 0.75)
  const ghostGeometry = keep(new THREE.RingGeometry(BALL_R * 0.9, BALL_R, 48))
  ghostGeometry.rotateX(-Math.PI / 2)
  const ghost = new THREE.Mesh(ghostGeometry, ghostMaterial)
  ghost.visible = false
  ghost.renderOrder = 2
  scene.add(ghost)

  const targetGeometry = keep(new THREE.RingGeometry(BALL_R * 1.08, BALL_R * 1.32, 40))
  targetGeometry.rotateX(-Math.PI / 2)
  const targetMaterial = overlay(0xfde68a, 0.5)
  const targetRings = Array.from({ length: 15 }, () => {
    const ring = new THREE.Mesh(targetGeometry, targetMaterial)
    ring.visible = false
    ring.renderOrder = 1
    scene.add(ring)
    return ring
  })

  const handGeometry = keep(new THREE.RingGeometry(BALL_R * 1.35, BALL_R * 1.65, 40))
  handGeometry.rotateX(-Math.PI / 2)
  const handMaterial = overlay(0x4ade80, 0.8)
  const handRing = new THREE.Mesh(handGeometry, handMaterial)
  handRing.visible = false
  handRing.renderOrder = 2
  scene.add(handRing)
  const kitchenGeometry = keep(new THREE.PlaneGeometry(HEAD_STRING_X + HL, TABLE_W))
  kitchenGeometry.rotateX(-Math.PI / 2)
  const kitchen = new THREE.Mesh(kitchenGeometry, overlay(0xffffff, 0.06))
  kitchen.position.set((-HL + HEAD_STRING_X) / 2, 0.0012, 0)
  kitchen.visible = false
  scene.add(kitchen)
  const headLine = ribbon(overlay(0xffffff, 0.4))

  // Faint trail behind the cue ball for the last shot.
  const trailMaterial = overlay(0xffffff, 0)
  const trailMesh = new THREE.Mesh(new THREE.BufferGeometry(), trailMaterial)
  trailMesh.renderOrder = 1
  trailMesh.visible = false
  scene.add(trailMesh)
  disposables.push({ dispose: () => trailMesh.geometry.dispose() })

  const pocketRingGeometry = keep(new THREE.RingGeometry(0.068, 0.082, 48))
  pocketRingGeometry.rotateX(-Math.PI / 2)
  const pocketRings = POCKETS.map((pocket) => {
    const ring = new THREE.Mesh(pocketRingGeometry, overlay(0xffffff, 0.45))
    ring.position.set(pocket.x, RAIL_H + 0.002, pocket.y)
    ring.visible = false
    ring.renderOrder = 3
    scene.add(ring)
    return ring
  })

  // ─── Cue stick: tip at the origin, pointing down +x ───
  const cueGroup = new THREE.Group()
  const shaftMaterial = keep(new THREE.MeshStandardMaterial({ roughness: 0.35 }))
  const buttMaterial = keep(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }))
  const wrapMaterial = keep(new THREE.MeshStandardMaterial({ roughness: 0.8 }))
  const ferruleMaterial = keep(new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.3 }))
  const tipMaterial = keep(new THREE.MeshStandardMaterial({ roughness: 0.9 }))
  const cuePart = (radiusTip: number, radiusButt: number, from: number, to: number, material: THREE.Material) => {
    const geometry = keep(new THREE.CylinderGeometry(radiusTip, radiusButt, to - from, 24))
    geometry.rotateZ(-Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.x = -(from + to) / 2
    mesh.castShadow = true
    cueGroup.add(mesh)
  }
  const radiusAt = (d: number) => 0.0062 + (0.0145 - 0.0062) * (d / CUE_LENGTH)
  cuePart(0.006, 0.006, 0, 0.008, tipMaterial)
  cuePart(0.0062, 0.0063, 0.008, 0.03, ferruleMaterial)
  cuePart(radiusAt(0.03), radiusAt(0.9), 0.03, 0.9, shaftMaterial)
  cuePart(radiusAt(0.9), radiusAt(1.05), 0.9, 1.05, buttMaterial)
  cuePart(radiusAt(1.05), radiusAt(1.3), 1.05, 1.3, wrapMaterial)
  cuePart(radiusAt(1.3), 0.0145, 1.3, CUE_LENGTH, buttMaterial)
  cueGroup.visible = false
  scene.add(cueGroup)

  // ─── Looks: cue, cloth and balls swap in place when a pick changes ───
  const shown = { cue: "", cloth: "", ballSet: "" }
  disposables.push({ dispose: () => [shaftMaterial, ...ballMaterials].forEach((material) => material.map?.dispose()) })
  function applyLook(look: PoolSceneState["look"]) {
    if (look.cue.id !== shown.cue) {
      shown.cue = look.cue.id
      shaftMaterial.map?.dispose()
      shaftMaterial.map = woodTexture(...look.cue.shaft, 1)
      shaftMaterial.needsUpdate = true
      buttMaterial.color.set(look.cue.butt)
      wrapMaterial.color.set(look.cue.wrap)
      tipMaterial.color.set(look.cue.tip)
    }
    if (look.cloth.id !== shown.cloth) {
      shown.cloth = look.cloth.id
      feltMaterial.color.set(look.cloth.felt)
      cushionMaterial.color.set(look.cloth.cushion)
    }
    if (look.ballSet.id !== shown.ballSet) {
      shown.ballSet = look.ballSet.id
      ballMaterials.forEach((material, n) => {
        material.map?.dispose()
        material.map = ballTexture(n, look.ballSet)
        material.needsUpdate = true
      })
    }
  }

  // ─── State ───
  let state: PoolSceneState | null = null
  let rackKey = ""
  let replay: Replay | null = null
  const displayed = new Map<number, { x: number; y: number; lift: number; visible: boolean }>()
  const cueAim = { dirX: 1, dirY: 0, pull: 0, spinX: 0, spinY: 0, x: 0, y: 0, ready: false }
  let stroke: { at: number; fromPull: number } | null = null
  /** Potted balls in the order they reached the tray. */
  let trayOrder: number[] = []
  const trayRolledTo = new Map<number, number>()
  let trail: { replay: Replay; fadeFrom: number } | null = null

  /** Keep the tray in step with the table: drop re-spotted balls, add any we never saw drop (a reconnect). */
  function syncTray(balls: PoolBall[]) {
    const down = new Set(balls.filter((ball) => ball.down && ball.n !== 0).map((ball) => ball.n))
    trayOrder = trayOrder.filter((n) => down.has(n))
    for (const n of [...down].sort((a, b) => a - b)) if (!trayOrder.includes(n)) trayOrder.push(n)
  }

  function spinBalls() {
    for (const mesh of ballMeshes.values()) {
      mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2))
    }
  }

  function buildReplay(playback: PoolPlayback): Replay {
    const numbers = playback.before.map((ball) => ball.n)
    const count = numbers.length
    const positions: Float32Array[] = []
    const spins: Float32Array[] = []
    const result = simulateShot(playback.before, playback.shot, (sample) => {
      const position = new Float32Array(count * 2)
      const spin = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        position[i * 2] = sample.x[i]
        position[i * 2 + 1] = sample.y[i]
        spin[i * 3] = sample.wy[i] / BALL_R
        spin[i * 3 + 1] = -sample.wz[i]
        spin[i * 3 + 2] = -sample.wx[i] / BALL_R
      }
      positions.push(position)
      spins.push(spin)
    })
    const pots = new Map<number, { t: number; pocket: number }>()
    for (const event of result.events) if (event.kind === "pot") pots.set(event.a, { t: event.t, pocket: event.pocket })
    syncTray(playback.before)
    const slots = new Map<number, number>()
    for (const [n] of [...pots].sort((a, b) => a[1].t - b[1].t)) {
      if (n === 0) continue
      slots.set(n, trayOrder.length)
      trayOrder.push(n)
    }
    const cueIndex = numbers.indexOf(0)
    const cueStart = playback.before[cueIndex]
    const trailPoints = new Float32Array(cueStart ? (positions.length + 1) * 2 : 0)
    if (cueStart) {
      trailPoints[0] = cueStart.x
      trailPoints[1] = cueStart.y
      positions.forEach((position, k) => {
        trailPoints[(k + 1) * 2] = position[cueIndex * 2]
        trailPoints[(k + 1) * 2 + 1] = position[cueIndex * 2 + 1]
      })
    }
    const elapsed = (Date.now() - playback.startedAt) / 1000
    // Joining mid-shot: skip the sounds that already happened.
    const eventIndex = result.events.findIndex((event) => event.t >= elapsed - 0.25)
    return {
      key: playback.key, count, numbers, sampleDt: SAMPLE_EVERY * SIM_DT, positions, spins,
      events: result.events, pots, slots, trail: trailPoints, duration: result.duration, startedAt: playback.startedAt,
      lastElapsed: Math.max(0, elapsed), eventIndex: eventIndex === -1 ? result.events.length : eventIndex,
    }
  }

  const spinAxis = new THREE.Vector3()
  const spinQuat = new THREE.Quaternion()
  const zAxis = new THREE.Vector3(0, 0, 1)

  function stepReplay(active: Replay) {
    const elapsed = Math.max(0, (Date.now() - active.startedAt) / 1000)
    const frameDt = Math.max(0, Math.min(0.1, elapsed - active.lastElapsed))
    active.lastElapsed = elapsed
    const t = Math.min(elapsed, active.duration)
    const last = active.positions.length - 1
    // Samples are taken at k * sampleDt (the final one at `duration`).
    const raw = t / active.sampleDt - 1
    const index = Math.max(0, Math.min(last, Math.floor(raw)))
    const next = Math.min(last, index + 1)
    const blend = Math.min(1, raw - index)
    const from = active.positions[index]
    const to = active.positions[next]
    // Before the first sample, ease out of the starting layout.
    const opening = raw < 0 ? t / active.sampleDt : 1
    const spin = active.spins[index]
    for (let i = 0; i < active.count; i++) {
      const n = active.numbers[i]
      const mesh = ballMeshes.get(n)
      if (!mesh) continue
      const before = state?.playback?.before[i]
      if (before?.down) {
        const slot = trayOrder.indexOf(n)
        displayed.set(n, slot >= 0 ? { x: trayX(slot), y: TRAY_Z, lift: TRAY_LIFT, visible: true } : { x: 0, y: 0, lift: 0, visible: false })
        continue
      }
      let x = from[i * 2] + (to[i * 2] - from[i * 2]) * blend
      let y = from[i * 2 + 1] + (to[i * 2 + 1] - from[i * 2 + 1]) * blend
      if (before && opening < 1) {
        x = before.x + (from[i * 2] - before.x) * opening
        y = before.y + (from[i * 2 + 1] - before.y) * opening
      }
      let lift = 0
      let visible = true
      const pot = active.pots.get(n)
      if (pot && elapsed >= pot.t) {
        const since = elapsed - pot.t
        const pocket = POCKETS[pot.pocket]
        const slot = active.slots.get(n)
        if (since < SINK_S + CUP_HOLD_S || slot === undefined) {
          // Into the hole and down onto the bottom of the cup.
          const k = Math.min(1, since / SINK_S)
          x += (pocket.x - x) * easeOut(k)
          y += (pocket.y - y) * easeOut(k)
          lift = -k * k * (CUP_DEPTH - 0.004)
          // The cue ball comes back out for ball in hand, so it just goes.
          visible = slot !== undefined || since < SINK_S + CUP_HOLD_S
        } else {
          // Out of the ball return and along the tray to its slot.
          const k = Math.min(1, (since - SINK_S - CUP_HOLD_S) / TRAY_ROLL_S)
          x = TRAY_IN_X + (trayX(slot) - TRAY_IN_X) * easeOut(k)
          y = TRAY_Z
          lift = TRAY_LIFT
          const rolledFrom = trayRolledTo.get(n) ?? TRAY_IN_X
          trayRolledTo.set(n, x)
          spinQuat.setFromAxisAngle(zAxis, (rolledFrom - x) / BALL_R)
          mesh.quaternion.premultiply(spinQuat)
        }
      }
      displayed.set(n, { x, y, lift, visible })
      if (frameDt > 0 && !(pot && elapsed >= pot.t)) {
        spinAxis.set(spin[i * 3], spin[i * 3 + 1], spin[i * 3 + 2])
        const rate = spinAxis.length()
        if (rate > 1e-6) {
          spinQuat.setFromAxisAngle(spinAxis.divideScalar(rate), rate * frameDt)
          mesh.quaternion.premultiply(spinQuat)
        }
      }
    }
    while (active.eventIndex < active.events.length && active.events[active.eventIndex].t <= elapsed) {
      handlers.onEvent(active.events[active.eventIndex])
      active.eventIndex++
    }
  }

  function placeStatic(current: PoolSceneState) {
    syncTray(current.balls)
    for (const ball of current.balls) {
      const override = ball.n === 0 ? current.cueBall : null
      const slot = ball.down ? trayOrder.indexOf(ball.n) : -1
      if (override) displayed.set(0, { x: override.x, y: override.y, lift: 0, visible: true })
      else if (slot >= 0) displayed.set(ball.n, { x: trayX(slot), y: TRAY_Z, lift: TRAY_LIFT, visible: true })
      else displayed.set(ball.n, { x: ball.x, y: ball.y, lift: 0, visible: !ball.down })
    }
  }

  /** Grows the cue ball's trail with the replay, then lets it fade. */
  function updateTrail(nowMs: number) {
    if (!trail || trail.replay.trail.length < 4) {
      trailMesh.visible = false
      return
    }
    const active = trail.replay
    const elapsed = (Date.now() - active.startedAt) / 1000
    if (elapsed > active.duration && trail.fadeFrom === 0) trail.fadeFrom = nowMs
    const fade = trail.fadeFrom === 0 ? 1 : Math.max(0, 1 - (nowMs - trail.fadeFrom) / 2600)
    trailMaterial.opacity = 0.42 * fade
    const points = active.trail.length / 2
    const shown = Math.max(0, Math.min(points, Math.floor(Math.min(elapsed, active.duration) / active.sampleDt) + 2))
    trailMesh.visible = fade > 0 && shown >= 2
    if (!trailMesh.visible) return
    const geometry = trailMesh.geometry
    if (geometry.userData.key !== active.key) {
      const vertices = new Float32Array(points * 6)
      const half = 0.0028
      for (let k = 0; k < points; k++) {
        const a = Math.max(0, k - 1)
        const b = Math.min(points - 1, k + 1)
        let dx = active.trail[b * 2] - active.trail[a * 2]
        let dy = active.trail[b * 2 + 1] - active.trail[a * 2 + 1]
        const length = Math.hypot(dx, dy)
        if (length > 1e-6) {
          dx /= length
          dy /= length
        } else {
          dx = 1
          dy = 0
        }
        const x = active.trail[k * 2]
        const y = active.trail[k * 2 + 1]
        vertices.set([x - dy * half, 0.0012, y + dx * half, x + dy * half, 0.0012, y - dx * half], k * 6)
      }
      const indices: number[] = []
      for (let k = 0; k < points - 1; k++) {
        const i = k * 2
        indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3))
      geometry.setIndex(indices)
      geometry.userData.key = active.key
    }
    geometry.setDrawRange(0, (shown - 1) * 6)
  }

  // ─── Camera ───
  const camPosition = new THREE.Vector3(0, 4, 1)
  const camTarget = new THREE.Vector3()
  const camUp = new THREE.Vector3(0, 0, -1)
  const wantPosition = new THREE.Vector3()
  const wantTarget = new THREE.Vector3()
  const wantUp = new THREE.Vector3()
  let wantFov = 38
  let firstFrame = true

  function topView() {
    const aspect = camera.aspect
    const portrait = aspect < 0.85
    const halfLong = HL + CUSHION_DEPTH + RAIL_WIDTH + 0.04
    // The extra on the short axis keeps the ball tray in frame.
    const halfShort = HW + CUSHION_DEPTH + RAIL_WIDTH + 0.1
    const halfW = portrait ? halfShort : halfLong
    const halfH = portrait ? halfLong : halfShort
    const fov = 38
    const tan = Math.tan(((fov / 2) * Math.PI) / 180)
    // Leave room for the top bar and the controls along the edges.
    const distance = Math.max((halfH * 1.22) / tan, (halfW * 1.12) / (tan * aspect))
    wantFov = fov
    wantTarget.set(0, 0, 0)
    if (portrait) {
      wantUp.set(1, 0, 0)
      wantPosition.set(-distance * 0.16, distance, 0)
      wantTarget.set(0.03, 0, 0)
    } else {
      wantUp.set(0, 0, -1)
      wantPosition.set(0, distance, distance * 0.16)
      wantTarget.set(0, 0, 0.02)
    }
  }

  function cueView(x: number, y: number, dirX: number, dirY: number) {
    wantFov = 46
    wantUp.set(0, 1, 0)
    wantPosition.set(x - dirX * 0.82, 0.3, y - dirY * 0.82)
    wantTarget.set(x + dirX * 0.55, 0, y + dirY * 0.55)
  }

  // ─── Input ───
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_R)
  const hitPoint = new THREE.Vector3()
  let drag: { mode: "aim" | "place" | "rotate"; id: number; lastX: number; startX: number; startY: number; moved: boolean; lastAngle: number | null } | null = null

  function tablePoint(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    return raycaster.ray.intersectPlane(tablePlane, hitPoint) ? { x: hitPoint.x, y: hitPoint.z } : null
  }

  function effectiveCamera(current: PoolSceneState) {
    return current.playback || current.placing ? "top" : current.camera
  }

  function cuePosition(current: PoolSceneState) {
    return current.cueBall ?? current.balls.find((ball) => ball.n === 0) ?? null
  }

  /** Angle from the cue ball to a point, or null when the point is too close for a steady reading. */
  function angleFromCue(current: PoolSceneState, point: { x: number; y: number }) {
    const cue = cuePosition(current)
    if (!cue || Math.hypot(point.x - cue.x, point.y - cue.y) < BALL_R * 2.5) return null
    return Math.atan2(point.y - cue.y, point.x - cue.x)
  }

  function handlePointerDown(event: PointerEvent) {
    const current = state
    if (drag || !current?.interactive || current.playback) return
    const point = tablePoint(event)
    const start = { id: event.pointerId, lastX: event.clientX, startX: event.clientX, startY: event.clientY, moved: false, lastAngle: null }
    if (effectiveCamera(current) === "cue") {
      drag = { mode: "rotate", ...start }
    } else {
      if (!point) return
      if (current.pockets.selectable) {
        const index = POCKETS.findIndex((pocket) => Math.hypot(pocket.x - point.x, pocket.y - point.y) < 0.11)
        if (index >= 0) {
          handlers.onPocket(index)
          return
        }
      }
      const cue = cuePosition(current)
      if (current.placing && cue && Math.hypot(cue.x - point.x, cue.y - point.y) < BALL_R * 3.2) {
        drag = { mode: "place", ...start }
        handlers.onPlace(point.x, point.y)
      } else {
        // Dragging turns the aim by how far the finger swings around the cue ball, so it never jumps;
        // a plain tap aims straight at the spot.
        drag = { mode: "aim", ...start, lastAngle: angleFromCue(current, point) }
      }
    }
    renderer.domElement.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId || !state?.interactive) return
    if (drag.mode === "rotate") {
      const dx = event.clientX - drag.lastX
      drag.lastX = event.clientX
      handlers.onAimRotate(dx * (event.shiftKey ? 0.0006 : 0.003))
      return
    }
    const point = tablePoint(event)
    if (!point) return
    if (drag.mode === "place") {
      handlers.onPlace(point.x, point.y)
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return
    drag.moved = true
    const angle = angleFromCue(state, point)
    if (angle !== null && drag.lastAngle !== null) {
      let delta = angle - drag.lastAngle
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      handlers.onAimRotate(delta * (event.shiftKey ? 0.25 : 1))
    }
    drag.lastAngle = angle
  }

  function handlePointerUp(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return
    if (drag.mode === "aim" && !drag.moved && state?.interactive) {
      const point = tablePoint(event)
      if (point) handlers.onAimAt(point.x, point.y)
    }
    drag = null
  }

  renderer.domElement.addEventListener("pointerdown", handlePointerDown)
  renderer.domElement.addEventListener("pointermove", handlePointerMove)
  renderer.domElement.addEventListener("pointerup", handlePointerUp)
  renderer.domElement.addEventListener("pointercancel", handlePointerUp)

  function resize() {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  // ─── Loop ───
  let lastFrame = performance.now()
  const cueDirection = new THREE.Vector3()
  const xAxis = new THREE.Vector3(1, 0, 0)

  function animate(now: number) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now
    const current = state
    if (!current) {
      renderer.render(scene, camera)
      return
    }

    if (current.playback) {
      if (!replay || replay.key !== current.playback.key) {
        replay = buildReplay(current.playback)
        trail = { replay, fadeFrom: 0 }
        trayRolledTo.clear()
        stroke = { at: performance.now(), fromPull: cueAim.pull }
        cueAim.dirX = current.playback.shot.dirX
        cueAim.dirY = current.playback.shot.dirY
        cueAim.spinX = current.playback.shot.spinX
        cueAim.spinY = current.playback.shot.spinY
      }
      stepReplay(replay)
    } else {
      replay = null
      placeStatic(current)
    }

    updateTrail(now)

    for (const [n, mesh] of ballMeshes) {
      const shown = displayed.get(n)
      mesh.visible = Boolean(shown?.visible)
      if (shown) mesh.position.set(shown.x, BALL_R + shown.lift, shown.y)
    }

    // Cue stick: eases onto the aim, strikes when a shot starts, then lifts away.
    const cue = current.cue
    const cueBall = displayed.get(0)
    let stickVisible = false
    if (cue && !current.playback) {
      const k = cue.smooth ? 1 - Math.exp(-dt * 9) : 1 - Math.exp(-dt * 16)
      if (!cueAim.ready) {
        Object.assign(cueAim, { dirX: cue.dirX, dirY: cue.dirY, pull: cue.pull, spinX: cue.spinX, spinY: cue.spinY, ready: true })
      } else {
        cueAim.dirX += (cue.dirX - cueAim.dirX) * k
        cueAim.dirY += (cue.dirY - cueAim.dirY) * k
        cueAim.pull += (cue.pull - cueAim.pull) * k
        cueAim.spinX += (cue.spinX - cueAim.spinX) * k
        cueAim.spinY += (cue.spinY - cueAim.spinY) * k
      }
      cueAim.x = cue.x
      cueAim.y = cue.y
      stickVisible = true
    } else if (current.playback && stroke) {
      const since = (performance.now() - stroke.at) / 1000
      if (since < 0.5) {
        cueAim.pull = since < 0.07 ? stroke.fromPull * (1 - since / 0.07) - 0.04 * (since / 0.07) : -0.04 - (since - 0.07) * 0.5
        stickVisible = cueAim.ready
      }
      const before = current.playback.before.find((ball) => ball.n === 0)
      if (before) {
        cueAim.x = before.x
        cueAim.y = before.y
      }
    }
    if (!cue && !current.playback) cueAim.ready = false
    cueGroup.visible = stickVisible
    if (stickVisible) {
      const length = Math.hypot(cueAim.dirX, cueAim.dirY) || 1
      const dx = cueAim.dirX / length
      const dy = cueAim.dirY / length
      const back = BALL_R + 0.012 + cueAim.pull * 0.3
      cueDirection.set(dx * Math.cos(CUE_ELEVATION), -Math.sin(CUE_ELEVATION), dy * Math.cos(CUE_ELEVATION))
      cueGroup.quaternion.setFromUnitVectors(xAxis, cueDirection)
      // The tip sits where it will strike: off to the side for english, up or down for follow and draw.
      const side = cueAim.spinX * BALL_R * 0.5
      const height = cueAim.spinY * BALL_R * 0.5
      cueGroup.position.set(
        cueAim.x - cueDirection.x * back - dy * side,
        BALL_R - cueDirection.y * back + height,
        cueAim.y - cueDirection.z * back + dx * side,
      )
    }

    // Guides.
    const guide = !current.playback ? current.guide : null
    if (guide) {
      const { from } = guide
      // Trace along the stick's eased direction so the guide glides with it instead of jumping ahead.
      let trace = guide.trace
      let legal = guide.legal
      if (cueAim.ready) {
        const length = Math.hypot(cueAim.dirX, cueAim.dirY) || 1
        const balls = current.balls.map((ball) => (ball.n === 0 ? { n: 0, x: from.x, y: from.y, down: false } : ball))
        trace = traceAim(balls, from, { x: cueAim.dirX / length, y: cueAim.dirY / length })
        legal = trace.ball === null || current.targets.includes(trace.ball)
      }
      setRibbon(aimLine, from.x, from.y, trace.x, trace.y, 0.0035)
      const warn = trace.ball !== null && !legal
      aimMaterial.color.set(warn ? 0xf87171 : 0xffffff)
      ghostMaterial.color.set(warn ? 0xf87171 : 0xffffff)
      ghost.visible = true
      ghost.position.set(trace.x, 0.0018, trace.y)
      const target = trace.ball !== null ? displayed.get(trace.ball) : null
      if (target && trace.objectDir) {
        const reach = 0.06 + 0.32 * trace.fullness
        objectMaterial.color.set(warn ? 0xf87171 : 0xffffff)
        setRibbon(objectLine, target.x, target.y, target.x + trace.objectDir.x * reach, target.y + trace.objectDir.y * reach, 0.004)
      } else objectLine.visible = false
      if (trace.cueDir) {
        const reach = 0.05 + 0.2 * (1 - trace.fullness)
        setRibbon(deflectLine, trace.x, trace.y, trace.x + trace.cueDir.x * reach, trace.y + trace.cueDir.y * reach, 0.003)
      } else deflectLine.visible = false
    } else {
      aimLine.visible = objectLine.visible = deflectLine.visible = ghost.visible = false
    }

    const pulse = 0.5 + Math.sin(now * 0.005) * 0.5
    targetMaterial.opacity = 0.3 + pulse * 0.35
    const ringTargets = current.interactive && !current.playback ? current.targets : []
    targetRings.forEach((ring, index) => {
      const n = ringTargets[index]
      const shown = n !== undefined ? displayed.get(n) : null
      ring.visible = Boolean(shown?.visible)
      if (shown) ring.position.set(shown.x, 0.0014, shown.y)
    })

    const placing = !current.playback ? current.placing : null
    handRing.visible = Boolean(placing && cueBall?.visible)
    if (placing && cueBall) {
      handRing.position.set(cueBall.x, 0.002, cueBall.y)
      handMaterial.color.set(placing.valid ? 0x4ade80 : 0xf87171)
      handMaterial.opacity = 0.55 + pulse * 0.35
    }
    kitchen.visible = placing?.area === "kitchen"
    if (kitchen.visible) setRibbon(headLine, HEAD_STRING_X, -HW, HEAD_STRING_X, HW, 0.003, 0.0015)
    else headLine.visible = false

    pocketRings.forEach((ring, index) => {
      const selectable = current.pockets.selectable && !current.playback
      const called = current.pockets.called === index
      ring.visible = selectable || (called && !current.playback)
      const material = ring.material as THREE.MeshBasicMaterial
      material.color.set(called ? 0xfacc15 : 0xffffff)
      material.opacity = called ? 0.7 + pulse * 0.3 : 0.3
    })

    // Camera.
    let mode = effectiveCamera(current)
    const shotStart = current.playback?.before.find((ball) => ball.n === 0)
    const shotElapsed = replay ? (Date.now() - replay.startedAt) / 1000 : Infinity
    if (current.playback && current.camera === "cue" && shotStart && shotElapsed < SHOT_CAM_S) {
      // Hold the shooter's eye line for the first moments of the shot, then rise to the overview.
      mode = "cue"
      cueView(shotStart.x, shotStart.y, current.playback.shot.dirX, current.playback.shot.dirY)
    } else if (mode === "cue" && cueBall && cueAim.ready) {
      cueView(cueBall.x, cueBall.y, cueAim.dirX, cueAim.dirY)
    } else {
      topView()
      // A gentle drift toward the cue ball while it runs.
      if (replay && cueBall?.visible && shotElapsed < replay.duration) {
        const pullX = (cueBall.x - wantTarget.x) * 0.12
        const pullZ = (cueBall.y - wantTarget.z) * 0.12
        wantTarget.x += pullX
        wantTarget.z += pullZ
        wantPosition.x += pullX
        wantPosition.z += pullZ
      }
    }
    const ease = firstFrame ? 1 : 1 - Math.exp(-dt * (mode === "cue" ? 7 : 4))
    firstFrame = false
    camPosition.lerp(wantPosition, ease)
    camTarget.lerp(wantTarget, ease)
    camUp.lerp(wantUp, ease).normalize()
    camera.fov += (wantFov - camera.fov) * ease
    camera.updateProjectionMatrix()
    camera.position.copy(camPosition)
    camera.up.copy(camUp)
    camera.lookAt(camTarget)
    lamp.visible = camPosition.y < 0.9

    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(animate)

  function update(next: PoolSceneState) {
    if (next.rackKey !== rackKey) {
      rackKey = next.rackKey
      spinBalls()
      trayOrder = []
      trail = null
    }
    applyLook(next.look)
    state = next
  }

  function dispose() {
    renderer.setAnimationLoop(null)
    // The GPU side is released even if tearing down the scene graph throws
    // (e.g. after a crash left it half-built), so a remount doesn't leak a context.
    try {
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown)
      renderer.domElement.removeEventListener("pointermove", handlePointerMove)
      renderer.domElement.removeEventListener("pointerup", handlePointerUp)
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp)
      for (const item of disposables) item.dispose()
    } finally {
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }

  return { update, dispose }
}
