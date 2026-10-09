import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import {
  getTokenCell,
  LUDO_BASE,
  LUDO_BASE_SLOTS,
  LUDO_BOARD_SIZE,
  LUDO_COLORS,
  LUDO_ENTRY_INDEX,
  LUDO_HOME_INDEX,
  LUDO_HOME_PATH,
  LUDO_NEST_ORIGIN,
  LUDO_SAFE_CELLS,
  LUDO_TRACK,
  ludoCellKey,
} from "@/lib/ludo"

export interface LudoSceneToken {
  seat: number
  tokenIndex: number
  position: number
  movable: boolean
}

export interface LudoSceneTarget {
  /** Legal move id, handed back when the target is picked. */
  id: string
  seat: number
  tokenIndex: number
  row: number
  col: number
  /** Short tag floated over the ghost, e.g. how far the move goes. */
  label: string
}

export interface LudoSceneState {
  tokens: LudoSceneToken[]
  targets: LudoSceneTarget[]
  activeSeats: number[]
  /** Seat whose yard is turned to face the viewer. */
  viewSeat: number | null
  turnSeat: number | null
  dice: { values: readonly [number, number] | null; rolling: boolean }
  /** "seat-tokenIndex" of the pawn the player has picked. */
  selectedPawn: string | null
  /** Most recent move, traced on the board until the next one. */
  lastMove: {
    key: string
    seat: number
    tokenIndex: number
    from: number
    to: number
  } | null
}

export interface LudoSceneHandlers {
  onSelectPawn: (seat: number, tokenIndex: number) => void
  onSelectTarget: (moveId: string) => void
}

export interface LudoScene {
  update: (state: LudoSceneState) => void
  dispose: () => void
}

const TEX_SIZE = 2432
const GRID = LUDO_BOARD_SIZE
const S = TEX_SIZE / GRID
/** World offset that puts the middle of the grid at the origin. */
const HALF = (GRID - 1) / 2
const BOARD_Y = 0.004
const FRAME_SIZE = GRID + 1.6
const NEST_SIZE = 8
const DIE_SIZE = 0.6
const DIE_REST_Y = DIE_SIZE / 2 + BOARD_Y
/** The two dice land on opposite corners of the centre square. */
const DIE_SPOTS = [
  [-0.4, 0.4],
  [0.4, -0.4],
] as const

const STACK_OFFSETS = [
  [-0.18, -0.18],
  [0.18, 0.18],
  [0.18, -0.18],
  [-0.18, 0.18],
] as const

/** Canvas angle of travel out of each colour's entry square. */
const ENTRY_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2]


/** Material order of a box: +x, -x, +y, -y, +z, -z. Opposite faces sum to 7. */
const DIE_FACE_VALUES = [2, 5, 1, 6, 3, 4]
const DIE_FACE_UP: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  2: new THREE.Euler(0, 0, Math.PI / 2),
  3: new THREE.Euler(-Math.PI / 2, 0, 0),
  4: new THREE.Euler(Math.PI / 2, 0, 0),
  5: new THREE.Euler(0, 0, -Math.PI / 2),
  6: new THREE.Euler(Math.PI, 0, 0),
}

const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.26, 0.26],
    [0.5, 0.5],
    [0.74, 0.74],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.28, 0.24],
    [0.28, 0.5],
    [0.28, 0.76],
    [0.72, 0.24],
    [0.72, 0.5],
    [0.72, 0.76],
  ],
}

/** Pawns are a shade deeper than the board's colours so they read on top of them. */
const PAWN_COLORS = ["#dc2626", "#16a34a", "#f59e0b", "#2563eb"]

function mix(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
}

/** Board areas use a lighter tone of each colour; unplayed seats fade to grey. */
function seatTone(seat: number, active: boolean) {
  const hex = mix(LUDO_COLORS[seat].hex, "#ffffff", 0.18)
  return active ? hex : mix(hex, "#c8c0b0", 0.75)
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function easeOutBounce(t: number) {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

function createCanvas(size: number) {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D canvas unavailable")
  return { canvas, ctx }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  size: number,
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(-size * 0.32, -size * 0.07)
  ctx.lineTo(size * 0.06, -size * 0.07)
  ctx.lineTo(size * 0.06, -size * 0.2)
  ctx.lineTo(size * 0.32, 0)
  ctx.lineTo(size * 0.06, size * 0.2)
  ctx.lineTo(size * 0.06, size * 0.07)
  ctx.lineTo(-size * 0.32, size * 0.07)
  ctx.closePath()
  ctx.restore()
}

function drawChevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  size: number,
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(-size * 0.1, -size * 0.2)
  ctx.lineTo(size * 0.12, 0)
  ctx.lineTo(-size * 0.1, size * 0.2)
  ctx.restore()
}

function tileGradient(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  base: string,
) {
  const gradient = ctx.createLinearGradient(
    col * S,
    row * S,
    (col + 1) * S,
    (row + 1) * S,
  )
  gradient.addColorStop(0, mix(base, "#ffffff", 0.16))
  gradient.addColorStop(1, mix(base, "#000000", 0.12))
  return gradient
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  fill: string | CanvasGradient,
) {
  roundRect(ctx, col * S + S * 0.05, row * S + S * 0.05, S * 0.9, S * 0.9, S * 0.16)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = S * 0.025
  ctx.strokeStyle = "rgba(110, 80, 40, 0.16)"
  ctx.stroke()
}

function drawBoard(ctx: CanvasRenderingContext2D, activeSeats: number[]) {
  const background = ctx.createRadialGradient(
    TEX_SIZE / 2,
    TEX_SIZE / 2,
    TEX_SIZE * 0.1,
    TEX_SIZE / 2,
    TEX_SIZE / 2,
    TEX_SIZE * 0.75,
  )
  background.addColorStop(0, "#f3ead6")
  background.addColorStop(1, "#e6d8bb")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  // Nests
  LUDO_NEST_ORIGIN.forEach(([originRow, originCol], seat) => {
    const active = activeSeats.includes(seat)
    const base = seatTone(seat, active)
    const x = originCol * S
    const y = originRow * S
    const w = NEST_SIZE * S

    ctx.save()
    ctx.shadowColor = "rgba(60, 35, 10, 0.3)"
    ctx.shadowBlur = S * 0.2
    ctx.shadowOffsetY = S * 0.05
    const body = ctx.createLinearGradient(x, y, x + w, y + w)
    body.addColorStop(0, mix(base, "#ffffff", 0.2))
    body.addColorStop(1, mix(base, "#000000", 0.22))
    roundRect(ctx, x + S * 0.12, y + S * 0.12, w - S * 0.24, w - S * 0.24, S * 0.6)
    ctx.fillStyle = body
    ctx.fill()
    ctx.restore()

    // Fine inner bevel line on the coloured body.
    roundRect(ctx, x + S * 0.24, y + S * 0.24, w - S * 0.48, w - S * 0.48, S * 0.5)
    ctx.lineWidth = S * 0.03
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"
    ctx.stroke()

    const pad = S * 0.95
    ctx.save()
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)"
    ctx.shadowBlur = S * 0.3
    ctx.shadowOffsetY = S * 0.06
    roundRect(ctx, x + pad, y + pad, w - pad * 2, w - pad * 2, S * 0.48)
    ctx.fillStyle = "#fbf6ea"
    ctx.fill()
    ctx.restore()

    for (const [row, col] of LUDO_BASE_SLOTS[seat]) {
      const cx = (col + 0.5) * S
      const cy = (row + 0.5) * S
      const nest = ctx.createRadialGradient(cx, cy - S * 0.1, S * 0.05, cx, cy, S * 0.46)
      nest.addColorStop(0, mix(base, "#ffffff", 0.7))
      nest.addColorStop(1, mix(base, "#ffffff", 0.35))
      ctx.beginPath()
      ctx.arc(cx, cy, S * 0.46, 0, Math.PI * 2)
      ctx.fillStyle = nest
      ctx.fill()
      ctx.lineWidth = S * 0.08
      ctx.strokeStyle = base
      ctx.stroke()

      const hollow = ctx.createRadialGradient(cx, cy, S * 0.2, cx, cy, S * 0.42)
      hollow.addColorStop(0, "rgba(0, 0, 0, 0)")
      hollow.addColorStop(1, "rgba(0, 0, 0, 0.2)")
      ctx.beginPath()
      ctx.arc(cx, cy, S * 0.42, 0, Math.PI * 2)
      ctx.fillStyle = hollow
      ctx.fill()
    }
  })

  // Shared track
  LUDO_TRACK.forEach(([row, col], index) => {
    const entrySeat = LUDO_ENTRY_INDEX.indexOf(
      index as (typeof LUDO_ENTRY_INDEX)[number],
    )
    if (entrySeat !== -1) {
      const base = seatTone(entrySeat, activeSeats.includes(entrySeat))
      drawTile(ctx, row, col, tileGradient(ctx, row, col, base))
      ctx.beginPath()
      ctx.arc((col + 0.5) * S, (row + 0.5) * S, S * 0.36, 0, Math.PI * 2)
      ctx.lineWidth = S * 0.05
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)"
      ctx.stroke()
      drawArrow(ctx, (col + 0.5) * S, (row + 0.5) * S, ENTRY_ANGLES[entrySeat], S * 0.9)
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
      ctx.fill()
      return
    }
    drawTile(ctx, row, col, "#fffaf0")
    if (LUDO_SAFE_CELLS.has(index)) {
      const cx = (col + 0.5) * S
      const cy = (row + 0.5) * S
      ctx.beginPath()
      ctx.arc(cx, cy, S * 0.33, 0, Math.PI * 2)
      ctx.lineWidth = S * 0.07
      ctx.strokeStyle = "#c99a3e"
      ctx.stroke()
      drawStar(ctx, cx, cy, S * 0.2, S * 0.09)
      ctx.fillStyle = "#d9b25f"
      ctx.fill()
    }
  })

  // Home columns
  LUDO_HOME_PATH.forEach((path, seat) => {
    const base = seatTone(seat, activeSeats.includes(seat))
    for (const [row, col] of path.slice(0, -1)) {
      drawTile(ctx, row, col, tileGradient(ctx, row, col, base))
      drawChevron(ctx, (col + 0.5) * S, (row + 0.5) * S, ENTRY_ANGLES[seat], S)
      ctx.lineWidth = S * 0.07
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)"
      ctx.stroke()
    }
  })

  // Centre home
  const c0 = HALF * S - S
  const c1 = HALF * S + 2 * S
  const mid = (HALF + 0.5) * S
  const triangles: Array<[number, Array<[number, number]>, [number, number]]> = [
    [0, [[c0, c0], [mid, mid], [c0, c1]], [c0, mid]],
    [1, [[c0, c0], [c1, c0], [mid, mid]], [mid, c0]],
    [2, [[c1, c0], [c1, c1], [mid, mid]], [c1, mid]],
    [3, [[c0, c1], [c1, c1], [mid, mid]], [mid, c1]],
  ]
  for (const [seat, points, [ox, oy]] of triangles) {
    const base = seatTone(seat, activeSeats.includes(seat))
    const gradient = ctx.createLinearGradient(ox, oy, mid, mid)
    gradient.addColorStop(0, mix(base, "#ffffff", 0.12))
    gradient.addColorStop(1, mix(base, "#000000", 0.25))
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    ctx.lineTo(points[1][0], points[1][1])
    ctx.lineTo(points[2][0], points[2][1])
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.lineWidth = S * 0.05
    ctx.lineJoin = "round"
    ctx.strokeStyle = "rgba(255, 250, 240, 0.85)"
    ctx.stroke()
  }
  roundRect(ctx, c0, c0, c1 - c0, c1 - c0, S * 0.12)
  ctx.lineWidth = S * 0.08
  ctx.strokeStyle = "#d9b25f"
  ctx.stroke()

  roundRect(ctx, S * 0.03, S * 0.03, TEX_SIZE - S * 0.06, TEX_SIZE - S * 0.06, S * 0.3)
  ctx.lineWidth = S * 0.05
  ctx.strokeStyle = "rgba(90, 60, 25, 0.3)"
  ctx.stroke()
}

function createWoodTexture() {
  const { canvas, ctx } = createCanvas(1024)
  const base = ctx.createLinearGradient(0, 0, 1024, 1024)
  base.addColorStop(0, "#7a4526")
  base.addColorStop(0.5, "#5e3219")
  base.addColorStop(1, "#4a2612")
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 1024, 1024)
  let seed = 7
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 260; i++) {
    const y0 = random() * 1024
    const amplitude = 4 + random() * 14
    const frequency = 0.004 + random() * 0.01
    const phase = random() * Math.PI * 2
    ctx.beginPath()
    for (let x = 0; x <= 1024; x += 16) {
      const y = y0 + Math.sin(x * frequency + phase) * amplitude
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineWidth = 0.8 + random() * 3
    ctx.strokeStyle =
      random() > 0.3
        ? `rgba(30, 12, 2, ${0.08 + random() * 0.2})`
        : `rgba(190, 120, 70, ${0.05 + random() * 0.12})`
    ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createGlowTexture() {
  const { canvas, ctx } = createCanvas(512)
  ctx.strokeStyle = "#ffffff"
  ctx.shadowColor = "#ffffff"
  ctx.lineWidth = 12
  for (const blur of [48, 24, 8]) {
    ctx.shadowBlur = blur
    roundRect(ctx, 50, 50, 412, 412, 40)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(canvas)
}

function createDieFaceTexture(value: number) {
  const { canvas, ctx } = createCanvas(256)
  const face = ctx.createLinearGradient(0, 0, 256, 256)
  face.addColorStop(0, "#ffffff")
  face.addColorStop(1, "#ece6da")
  ctx.fillStyle = face
  ctx.fillRect(0, 0, 256, 256)
  const radius = value === 1 ? 34 : 24
  for (const [px, py] of PIPS[value]) {
    const cx = px * 256
    const cy = py * 256
    const pip = ctx.createRadialGradient(cx, cy - radius * 0.3, 2, cx, cy, radius)
    if (value === 1) {
      pip.addColorStop(0, "#7f1d1d")
      pip.addColorStop(1, "#dc2626")
    } else {
      pip.addColorStop(0, "#020617")
      pip.addColorStop(1, "#334155")
    }
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = pip
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createPawnGeometries() {
  const profile = new THREE.SplineCurve(
    [
      [0, 0],
      [0.32, 0],
      [0.345, 0.035],
      [0.325, 0.08],
      [0.255, 0.12],
      [0.195, 0.18],
      [0.155, 0.28],
      [0.13, 0.39],
      [0.13, 0.46],
      [0.185, 0.5],
      [0.185, 0.535],
      [0.12, 0.57],
      [0.09, 0.61],
      [0, 0.62],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  ).getPoints(90)
  const body = new THREE.LatheGeometry(profile, 56)
  const head = new THREE.SphereGeometry(0.165, 48, 32)
  head.translate(0, 0.74, 0)
  return { body, head }
}

interface Segment {
  from: THREE.Vector3
  to: THREE.Vector3
  height: number
  duration: number
  start: number
  wait: boolean
}

interface QueuedStep {
  to: THREE.Vector3
  height: number
  duration: number
  wait?: boolean
}

interface Pawn {
  id: string
  seat: number
  tokenIndex: number
  group: THREE.Group
  material: THREE.MeshPhysicalMaterial
  hit: THREE.Mesh
  halo: THREE.Mesh
  haloMaterial: THREE.MeshBasicMaterial
  position: number | null
  /** Where the pawn will be once its queued hops finish. */
  dest: THREE.Vector3
  current: THREE.Vector3
  queue: QueuedStep[]
  segment: Segment | null
  landedAt: number
  scale: number
  targetScale: number
  movable: boolean
  selected: boolean
  phase: number
}

interface TargetMarker {
  id: string
  pawnId: string
  group: THREE.Group
  disk: THREE.Mesh
  ring: THREE.Mesh
  ghostMaterial: THREE.MeshStandardMaterial
  disposables: Array<{ dispose: () => void }>
}

function createLabelTexture(text: string, color: string) {
  const { canvas, ctx } = createCanvas(128)
  ctx.beginPath()
  ctx.arc(64, 64, 54, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = "#ffffff"
  ctx.stroke()
  ctx.fillStyle = "#ffffff"
  ctx.font = `900 ${text.length > 2 ? 40 : 54}px system-ui, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, 64, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface TrailDot {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  appearAt: number
}

interface Effect {
  start: number
  ring: THREE.Mesh
  ringMaterial: THREE.MeshBasicMaterial
  label: THREE.Sprite | null
  labelMaterial: THREE.SpriteMaterial | null
  labelTexture: THREE.Texture | null
}

interface BlockadeMarker {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
}

export function createLudoScene(
  container: HTMLElement,
  handlers: LudoSceneHandlers,
): LudoScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Neutral keeps the four colours true; ACES pushed yellow toward orange and washed out the rest.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = "block"
  renderer.domElement.style.width = "100%"
  renderer.domElement.style.height = "100%"
  renderer.domElement.style.touchAction = "manipulation"
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.4

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200)

  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x3b2614, 0.55))
  const sun = new THREE.DirectionalLight(0xfff6ea, 2.1)
  sun.position.set(7, 22, 12)
  sun.castShadow = true
  sun.shadow.mapSize.set(3072, 3072)
  sun.shadow.camera.left = -16
  sun.shadow.camera.right = 16
  sun.shadow.camera.top = 16
  sun.shadow.camera.bottom = -16
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 50
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 4
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0xdde8ff, 0.45)
  rim.position.set(-10, 8, -12)
  scene.add(rim)

  const disposables: Array<{ dispose: () => void }> = [
    environment,
    pmrem,
    roomEnvironment,
  ]

  // Table shadow catcher, so the board casts onto whatever sits behind the canvas.
  const floorGeometry = new THREE.PlaneGeometry(80, 80)
  floorGeometry.rotateX(-Math.PI / 2)
  const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.35 })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.position.y = -0.8
  floor.receiveShadow = true
  scene.add(floor)
  disposables.push(floorGeometry, floorMaterial)

  const board = new THREE.Group()
  scene.add(board)

  const woodTexture = createWoodTexture()
  const frameGeometry = new RoundedBoxGeometry(FRAME_SIZE, 0.8, FRAME_SIZE, 5, 0.38)
  const frameMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.38,
    metalness: 0.05,
  })
  const frame = new THREE.Mesh(frameGeometry, frameMaterial)
  frame.position.y = -0.4
  frame.castShadow = true
  frame.receiveShadow = true
  board.add(frame)
  disposables.push(woodTexture, frameGeometry, frameMaterial)

  const { canvas: boardCanvas, ctx: boardCtx } = createCanvas(TEX_SIZE)
  const boardTexture = new THREE.CanvasTexture(boardCanvas)
  boardTexture.colorSpace = THREE.SRGBColorSpace
  boardTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const surfaceGeometry = new THREE.PlaneGeometry(GRID, GRID)
  surfaceGeometry.rotateX(-Math.PI / 2)
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: boardTexture,
    roughness: 0.62,
    metalness: 0,
  })
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
  surface.position.y = BOARD_Y
  surface.receiveShadow = true
  board.add(surface)
  disposables.push(boardTexture, surfaceGeometry, surfaceMaterial)

  // Turn glow around each nest.
  const glowTexture = createGlowTexture()
  const glowGeometry = new THREE.PlaneGeometry(NEST_SIZE * 1.2, NEST_SIZE * 1.2)
  glowGeometry.rotateX(-Math.PI / 2)
  disposables.push(glowTexture, glowGeometry)
  const glows = LUDO_NEST_ORIGIN.map(([row, col], seat) => {
    const material = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: LUDO_COLORS[seat].hex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(glowGeometry, material)
    mesh.position.set(
      col + NEST_SIZE / 2 - 0.5 - HALF,
      BOARD_Y + 0.006,
      row + NEST_SIZE / 2 - 0.5 - HALF,
    )
    mesh.renderOrder = 1
    board.add(mesh)
    disposables.push(material)
    return material
  })

  // Shared pawn pieces.
  const pawnGeometry = createPawnGeometries()
  const hitGeometry = new THREE.CylinderGeometry(0.44, 0.44, 1.1, 12)
  hitGeometry.translate(0, 0.55, 0)
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const haloGeometry = new THREE.RingGeometry(0.4, 0.5, 48)
  haloGeometry.rotateX(-Math.PI / 2)
  const diskGeometry = new THREE.CircleGeometry(0.44, 48)
  diskGeometry.rotateX(-Math.PI / 2)
  disposables.push(
    pawnGeometry.body,
    pawnGeometry.head,
    hitGeometry,
    hitMaterial,
    haloGeometry,
    diskGeometry,
  )

  const pawns = new Map<string, Pawn>()

  function createPawn(seat: number, tokenIndex: number): Pawn {
    const color = PAWN_COLORS[seat]
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      emissive: color,
      emissiveIntensity: 0,
    })
    const group = new THREE.Group()
    const body = new THREE.Mesh(pawnGeometry.body, material)
    const head = new THREE.Mesh(pawnGeometry.head, material)
    body.castShadow = true
    head.castShadow = true
    body.receiveShadow = true
    const hit = new THREE.Mesh(hitGeometry, hitMaterial)
    const id = `${seat}-${tokenIndex}`
    hit.userData.pick = `pawn:${id}`
    group.add(body, head, hit)
    board.add(group)

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    })
    const halo = new THREE.Mesh(haloGeometry, haloMaterial)
    halo.renderOrder = 2
    board.add(halo)

    const pawn: Pawn = {
      id,
      seat,
      tokenIndex,
      group,
      material,
      hit,
      halo,
      haloMaterial,
      position: null,
      dest: new THREE.Vector3(),
      current: new THREE.Vector3(),
      queue: [],
      segment: null,
      landedAt: 0,
      scale: 1,
      targetScale: 1,
      movable: false,
      selected: false,
      phase: Math.random() * Math.PI * 2,
    }
    pawns.set(id, pawn)
    return pawn
  }

  function removePawn(pawn: Pawn) {
    board.remove(pawn.group, pawn.halo)
    pawn.material.dispose()
    pawn.haloMaterial.dispose()
    pawns.delete(pawn.id)
  }

  function cellPoint(row: number, col: number) {
    return new THREE.Vector3(col - HALF, BOARD_Y, row - HALF)
  }

  function stepsBetween(pawn: Pawn, from: number, to: number, dest: THREE.Vector3) {
    const steps: QueuedStep[] = []
    const hopTo = (position: number) => {
      const [row, col] = getTokenCell(pawn.seat, pawn.tokenIndex, position)
      return cellPoint(row, col)
    }
    if (from === LUDO_BASE) {
      steps.push({ to: hopTo(0), height: 1, duration: 420 })
      for (let p = 1; p <= to; p++) {
        steps.push({ to: hopTo(p), height: 0.45, duration: 170 })
      }
    } else if (to > from) {
      // Bonus runs of 10-20 squares speed up so they do not drag.
      const hop = to - from > 8 ? 105 : 160
      for (let p = from + 1; p <= to; p++) {
        steps.push({ to: hopTo(p), height: 0.4, duration: hop })
      }
    } else {
      steps.push({ to: dest, height: 2.4, duration: 650 })
    }
    steps[steps.length - 1].to = dest
    return steps
  }

  // Targets
  let targets: TargetMarker[] = []
  let targetsKey = ""

  function rebuildTargets(list: LudoSceneTarget[]) {
    for (const target of targets) {
      board.remove(target.group)
      for (const item of target.disposables) item.dispose()
    }
    targets = list.map((target) => {
      const color = LUDO_COLORS[target.seat].hex
      const group = new THREE.Group()
      group.position.copy(cellPoint(target.row, target.col))
      const diskMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        toneMapped: false,
      })
      const disk = new THREE.Mesh(diskGeometry, diskMaterial)
      disk.position.y = 0.012
      disk.renderOrder = 2
      disk.userData.pick = `move:${target.id}`
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      })
      const ring = new THREE.Mesh(haloGeometry, ringMaterial)
      ring.position.y = 0.014
      ring.renderOrder = 3
      const ghostMaterial = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        roughness: 0.4,
      })
      const ghostBody = new THREE.Mesh(pawnGeometry.body, ghostMaterial)
      const ghostHead = new THREE.Mesh(pawnGeometry.head, ghostMaterial)
      const labelTexture = createLabelTexture(target.label, color)
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        depthTest: false,
        toneMapped: false,
      })
      const label = new THREE.Sprite(labelMaterial)
      label.position.y = 1.25
      label.scale.setScalar(0.5)
      label.renderOrder = 5
      group.add(disk, ring, ghostBody, ghostHead, label)
      board.add(group)
      return {
        id: target.id,
        pawnId: `${target.seat}-${target.tokenIndex}`,
        group,
        disk,
        ring,
        ghostMaterial,
        disposables: [diskMaterial, ringMaterial, ghostMaterial, labelTexture, labelMaterial],
      }
    })
  }

  // Last move: a dotted trail along the squares it crossed, laid down behind the pawn.
  const trailGeometry = new THREE.CircleGeometry(0.13, 24)
  trailGeometry.rotateX(-Math.PI / 2)
  const trailStartGeometry = new THREE.RingGeometry(0.2, 0.28, 32)
  trailStartGeometry.rotateX(-Math.PI / 2)
  disposables.push(trailGeometry, trailStartGeometry)
  let trail: TrailDot[] = []
  let trailKey = ""

  function clearTrail() {
    for (const dot of trail) {
      board.remove(dot.mesh)
      dot.material.dispose()
    }
    trail = []
  }

  function buildTrail(move: NonNullable<LudoSceneState["lastMove"]>, start: number) {
    clearTrail()
    const color = PAWN_COLORS[move.seat]
    const cells: Array<{ position: number; geometry: THREE.BufferGeometry }> = []
    if (move.from !== LUDO_BASE) cells.push({ position: move.from, geometry: trailStartGeometry })
    const first = move.from === LUDO_BASE ? 0 : move.from + 1
    // The landing square holds the pawn itself.
    for (let position = first; position < move.to; position++) {
      cells.push({ position, geometry: trailGeometry })
    }
    const hop = move.to - move.from > 8 ? 105 : 160
    trail = cells.map(({ position, geometry }, index) => {
      const [row, col] = getTokenCell(move.seat, move.tokenIndex, position)
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(cellPoint(row, col))
      mesh.position.y = BOARD_Y + 0.009
      mesh.renderOrder = 2
      board.add(mesh)
      return { mesh, material, appearAt: start + index * hop }
    })
  }

  // Bursts for captures and pawns reaching home.
  const burstGeometry = new THREE.RingGeometry(0.35, 0.5, 48)
  burstGeometry.rotateX(-Math.PI / 2)
  disposables.push(burstGeometry)
  let effects: Effect[] = []

  function spawnEffect(
    at: THREE.Vector3,
    color: string,
    text: string | null,
    start: number,
  ) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    })
    const ring = new THREE.Mesh(burstGeometry, ringMaterial)
    ring.position.set(at.x, BOARD_Y + 0.02, at.z)
    ring.renderOrder = 4
    board.add(ring)
    let label: THREE.Sprite | null = null
    let labelMaterial: THREE.SpriteMaterial | null = null
    let labelTexture: THREE.Texture | null = null
    if (text) {
      labelTexture = createLabelTexture(text, color)
      labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        depthTest: false,
        transparent: true,
        opacity: 0,
        toneMapped: false,
      })
      label = new THREE.Sprite(labelMaterial)
      label.position.set(at.x, 1, at.z)
      label.scale.setScalar(0.85)
      label.renderOrder = 6
      board.add(label)
    }
    effects.push({ start, ring, ringMaterial, label, labelMaterial, labelTexture })
  }

  function removeEffect(effect: Effect) {
    board.remove(effect.ring)
    effect.ringMaterial.dispose()
    if (effect.label) board.remove(effect.label)
    effect.labelMaterial?.dispose()
    effect.labelTexture?.dispose()
  }

  // Blockades: two pawns of one colour on a square get a ring in their colour.
  const blockadeGeometry = new THREE.RingGeometry(0.5, 0.62, 48)
  blockadeGeometry.rotateX(-Math.PI / 2)
  disposables.push(blockadeGeometry)
  let blockades: BlockadeMarker[] = []

  function rebuildBlockades(cells: Array<{ seat: number; row: number; col: number }>) {
    for (const blockade of blockades) {
      board.remove(blockade.mesh)
      blockade.material.dispose()
    }
    blockades = cells.map(({ seat, row, col }) => {
      const material = new THREE.MeshBasicMaterial({
        color: LUDO_COLORS[seat].hex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(blockadeGeometry, material)
      mesh.position.copy(cellPoint(row, col))
      mesh.position.y = BOARD_Y + 0.011
      mesh.renderOrder = 2
      board.add(mesh)
      return { mesh, material }
    })
  }

  // Dice
  const dieGeometry = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 5, 0.1)
  const dieMaterials = DIE_FACE_VALUES.map((value) => {
    const map = createDieFaceTexture(value)
    disposables.push(map)
    return new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.32,
      clearcoat: 0.7,
      clearcoatRoughness: 0.15,
    })
  })
  disposables.push(dieGeometry, ...dieMaterials)
  const dice = DIE_SPOTS.map(([x, z], index) => {
    const mesh = new THREE.Mesh(dieGeometry, dieMaterials)
    mesh.castShadow = true
    mesh.position.set(x, DIE_REST_Y, z)
    mesh.quaternion.setFromEuler(DIE_FACE_UP[index === 0 ? 6 : 5])
    scene.add(mesh)
    return {
      mesh,
      spinAxis: new THREE.Vector3(),
      fromQuat: new THREE.Quaternion(),
      toQuat: new THREE.Quaternion(),
      fromY: DIE_REST_Y,
      phase: index * 1.7,
    }
  })

  let dieMode: "rest" | "rolling" | "settling" = "rest"
  let diceKey = ""
  let dieStart = 0

  function faceUpQuaternion(value: number) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (Math.random() - 0.5) * 1.2,
    )
    return new THREE.Quaternion().setFromEuler(DIE_FACE_UP[value]).premultiply(yaw)
  }

  // View
  let boardKey = ""
  let yaw = Math.PI / 2
  let targetYaw = yaw
  let yawInitialised = false
  let turnSeat: number | null = null
  let hoveredId: string | null = null
  let blockadeKey = ""
  let pawnsSynced = false

  function update(state: LudoSceneState) {
    const activeKey = state.activeSeats.join(",")
    if (activeKey !== boardKey) {
      boardKey = activeKey
      drawBoard(boardCtx, state.activeSeats)
      boardTexture.needsUpdate = true
    }

    // Turn the board so the viewer's yard sits bottom-left.
    targetYaw = (((state.viewSeat ?? 3) + 1) % 4) * (Math.PI / 2)
    if (!yawInitialised) {
      yaw = targetYaw
      yawInitialised = true
    }
    turnSeat = state.turnSeat

    const counts = new Map<string, number>()
    const placements = state.tokens.map((token) => {
      const [row, col] = getTokenCell(token.seat, token.tokenIndex, token.position)
      const key = ludoCellKey(row, col)
      const stackIndex = counts.get(key) ?? 0
      counts.set(key, stackIndex + 1)
      return { token, row, col, key, stackIndex }
    })

    const now = performance.now()
    const seen = new Set<string>()
    const captured: Array<{ pawn: Pawn; dest: THREE.Vector3 }> = []
    let moverDuration = 0
    for (const { token, row, col, key, stackIndex } of placements) {
      const id = `${token.seat}-${token.tokenIndex}`
      seen.add(id)
      const pawn = pawns.get(id) ?? createPawn(token.seat, token.tokenIndex)
      const shared = (counts.get(key) ?? 1) > 1
      const [offsetX, offsetZ] = shared ? STACK_OFFSETS[stackIndex % 4] : [0, 0]
      const dest = cellPoint(row, col).add(new THREE.Vector3(offsetX, 0, offsetZ))
      pawn.targetScale = shared ? 0.78 : 1
      pawn.movable = token.movable
      pawn.selected = token.movable && state.selectedPawn === id

      const previous = pawn.position
      pawn.position = token.position
      if (previous === null) {
        pawn.current.copy(dest)
        pawn.dest.copy(dest)
        continue
      }
      if (previous === token.position) {
        if (!pawn.dest.equals(dest)) {
          pawn.queue.push({ to: dest, height: 0, duration: 220 })
          pawn.dest.copy(dest)
        }
        continue
      }
      if (token.position === LUDO_BASE) {
        captured.push({ pawn, dest })
        continue
      }
      const steps = stepsBetween(pawn, previous, token.position, dest)
      const travel = steps.reduce((total, step) => total + step.duration, 0)
      if (token.position === LUDO_HOME_INDEX && previous !== LUDO_HOME_INDEX) {
        spawnEffect(dest, "#f59e0b", "+10", now + travel)
      }
      pawn.queue.push(...steps)
      pawn.dest.copy(dest)
      moverDuration = Math.max(moverDuration, travel)
    }
    // Knocked-out tokens fly home once the capturer has landed.
    for (const { pawn } of captured) {
      spawnEffect(pawn.dest, PAWN_COLORS[pawn.seat], "+20", now + moverDuration)
    }
    for (const { pawn, dest } of captured) {
      if (moverDuration > 0) {
        pawn.queue.push({ to: dest, height: 0, duration: moverDuration, wait: true })
      }
      pawn.queue.push({ to: dest, height: 2.6, duration: 700 })
      pawn.dest.copy(dest)
    }
    for (const pawn of [...pawns.values()]) {
      if (!seen.has(pawn.id)) removePawn(pawn)
    }

    const nextTargetsKey = state.targets
      .map((target) => `${target.id}@${target.row}:${target.col}:${target.label}`)
      .join("|")
    if (nextTargetsKey !== targetsKey) {
      targetsKey = nextTargetsKey
      rebuildTargets(state.targets)
    }

    const blockadeCells = [...counts.entries()].flatMap(([key, count]) => {
      if (count !== 2) return []
      const pair = placements.filter((placement) => placement.key === key)
      const [first, second] = pair
      if (
        first.token.seat !== second.token.seat ||
        first.token.position === LUDO_HOME_INDEX
      ) {
        return []
      }
      return [{ seat: first.token.seat, row: first.row, col: first.col }]
    })
    const nextBlockadeKey = blockadeCells
      .map((cell) => `${cell.seat}@${cell.row}:${cell.col}`)
      .join("|")
    if (nextBlockadeKey !== blockadeKey) {
      blockadeKey = nextBlockadeKey
      rebuildBlockades(blockadeCells)
    }

    const nextTrailKey = state.lastMove?.key ?? ""
    if (nextTrailKey !== trailKey) {
      // The first sync of a game shows nothing, rather than an old move.
      const firstSync = trailKey === "" && pawnsSynced === false
      trailKey = nextTrailKey
      if (state.lastMove && !firstSync) buildTrail(state.lastMove, now)
      else clearTrail()
    }
    pawnsSynced = true

    const { values, rolling } = state.dice
    if (rolling) {
      if (dieMode !== "rolling") {
        dieMode = "rolling"
        dieStart = now
        for (const die of dice) die.fromY = die.mesh.position.y
      }
    } else if (dieMode === "rolling") {
      dieMode = "settling"
      dieStart = now
      diceKey = values?.join(",") ?? ""
      dice.forEach((die, index) => {
        die.fromQuat.copy(die.mesh.quaternion)
        die.toQuat.copy(faceUpQuaternion(values?.[index] ?? 6))
        die.fromY = die.mesh.position.y
      })
    } else if (dieMode === "rest" && values && values.join(",") !== diceKey) {
      diceKey = values.join(",")
      dice.forEach((die, index) => {
        die.mesh.quaternion.copy(faceUpQuaternion(values[index]))
      })
    }
  }

  // Interaction
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let pointerDown: { x: number; y: number } | null = null

  function pick(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, camera)
    const candidates: THREE.Object3D[] = [
      ...[...pawns.values()].filter((pawn) => pawn.movable).map((pawn) => pawn.hit),
      ...targets.map((target) => target.disk),
    ]
    const hit = raycaster.intersectObjects(candidates, false)[0]
    return (hit?.object.userData.pick as string | undefined) ?? null
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return
    hoveredId = pick(event)
    renderer.domElement.style.cursor = hoveredId ? "pointer" : "default"
  }

  function handlePointerDown(event: PointerEvent) {
    pointerDown = { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: PointerEvent) {
    if (!pointerDown) return
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
    pointerDown = null
    if (moved > 10) return
    const picked = pick(event)
    if (!picked) return
    if (picked.startsWith("move:")) {
      handlers.onSelectTarget(picked.slice("move:".length))
      return
    }
    const [seat, tokenIndex] = picked.slice("pawn:".length).split("-").map(Number)
    handlers.onSelectPawn(seat, tokenIndex)
  }

  function handlePointerLeave() {
    hoveredId = null
    pointerDown = null
    renderer.domElement.style.cursor = "default"
  }

  renderer.domElement.addEventListener("pointermove", handlePointerMove)
  renderer.domElement.addEventListener("pointerdown", handlePointerDown)
  renderer.domElement.addEventListener("pointerup", handlePointerUp)
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave)

  // Framing: back the camera off until the whole board fits the canvas.
  const fitPoints: THREE.Vector3[] = []
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      for (const y of [-0.8, 1.1]) {
        fitPoints.push(new THREE.Vector3((x * FRAME_SIZE) / 2, y, (z * FRAME_SIZE) / 2))
      }
    }
  }
  const projected = new THREE.Vector3()

  function resize() {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()

    const elevation = THREE.MathUtils.degToRad(camera.aspect < 1 ? 66 : 58)
    const direction = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation))
    const lookAt = new THREE.Vector3(0, 0, 0.3)
    let low = 5
    let high = 120
    for (let i = 0; i < 24; i++) {
      const distance = (low + high) / 2
      camera.position.copy(lookAt).addScaledVector(direction, distance)
      camera.lookAt(lookAt)
      camera.updateMatrixWorld()
      const fits = fitPoints.every((point) => {
        projected.copy(point).project(camera)
        return Math.abs(projected.x) <= 0.97 && Math.abs(projected.y) <= 0.97
      })
      if (fits) high = distance
      else low = distance
    }
    camera.position.copy(lookAt).addScaledVector(direction, high)
    camera.lookAt(lookAt)
  }

  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  let lastFrame = performance.now()
  function animate(now: number) {
    const delta = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now

    // Ease the board round to the viewer's seat by the shortest way.
    let turn = targetYaw - yaw
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    yaw += turn * Math.min(1, delta * 4)
    board.rotation.y = yaw

    const pulse = 0.5 + 0.5 * Math.sin(now * 0.005)
    glows.forEach((material, seat) => {
      const goal = seat === turnSeat ? 0.4 + 0.3 * pulse : 0
      material.opacity += (goal - material.opacity) * Math.min(1, delta * 6)
    })

    const anySelected = [...pawns.values()].some((pawn) => pawn.movable && pawn.selected)

    // Hovering a target lights up the pawn it belongs to, and the reverse.
    const hoveredTarget = targets.find((target) => `move:${target.id}` === hoveredId)
    const hoveredPawn = hoveredTarget
      ? hoveredTarget.pawnId
      : hoveredId?.startsWith("pawn:")
        ? hoveredId.slice("pawn:".length)
        : null

    for (const pawn of pawns.values()) {
      if (!pawn.segment && pawn.queue.length > 0) {
        const step = pawn.queue.shift() as QueuedStep
        pawn.segment = {
          from: pawn.current.clone(),
          to: step.to,
          height: step.height,
          duration: step.duration,
          start: now,
          wait: step.wait ?? false,
        }
      }
      let lift = 0
      const segment = pawn.segment
      if (segment) {
        const t = Math.min(1, (now - segment.start) / segment.duration)
        if (!segment.wait) {
          pawn.current.lerpVectors(segment.from, segment.to, easeInOut(t))
          lift = 4 * segment.height * t * (1 - t)
        }
        if (t >= 1) {
          if (!segment.wait) pawn.current.copy(segment.to)
          if (segment.height > 0) pawn.landedAt = now
          pawn.segment = null
        }
      }

      const idle = !pawn.segment && pawn.queue.length === 0
      const active = pawn.movable && idle
      const picked = active && pawn.selected
      // Once a pawn is picked, the others step back.
      const muted = active && !picked && anySelected
      if (picked) {
        lift += 0.32 + 0.05 * Math.sin(now * 0.008)
      } else if (active && !muted) {
        lift += 0.12 * (0.5 + 0.5 * Math.sin(now * 0.006 + pawn.phase))
      }
      const hovered = active && hoveredPawn === pawn.id
      const goalScale = pawn.targetScale * (picked ? 1.18 : hovered ? 1.12 : 1)
      pawn.scale += (goalScale - pawn.scale) * Math.min(1, delta * 12)

      // Squash a little on each landing.
      const sinceLanding = now - pawn.landedAt
      const squash = sinceLanding < 180 ? Math.sin((Math.PI * sinceLanding) / 180) * 0.16 : 0

      pawn.group.position.set(pawn.current.x, pawn.current.y + lift, pawn.current.z)
      pawn.group.scale.set(
        pawn.scale * (1 + squash * 0.5),
        pawn.scale * (1 - squash),
        pawn.scale * (1 + squash * 0.5),
      )

      const glowGoal = picked
        ? 0.5
        : muted
          ? hovered
            ? 0.3
            : 0.05
          : active
            ? hovered
              ? 0.5
              : 0.15 + 0.2 * pulse
            : 0
      pawn.material.emissiveIntensity +=
        (glowGoal - pawn.material.emissiveIntensity) * Math.min(1, delta * 10)
      pawn.halo.position.set(pawn.current.x, BOARD_Y + 0.01, pawn.current.z)
      pawn.halo.scale.setScalar(pawn.scale * (picked ? 1.35 : 1 + 0.12 * pulse))
      const haloGoal = picked ? 1 : muted ? 0.25 : active ? 0.55 + 0.4 * pulse : 0
      pawn.haloMaterial.opacity +=
        (haloGoal - pawn.haloMaterial.opacity) * Math.min(1, delta * 10)
      pawn.halo.visible = pawn.haloMaterial.opacity > 0.01
    }

    for (const target of targets) {
      const hovered = hoveredTarget === target || hoveredPawn === target.pawnId
      target.ring.scale.setScalar(1 + 0.1 * pulse)
      target.ghostMaterial.opacity = hovered ? 0.65 : 0.22 + 0.12 * pulse
    }
    for (const blockade of blockades) {
      blockade.material.opacity = 0.65 + 0.3 * pulse
    }
    for (const dot of trail) {
      const shown = now >= dot.appearAt
      const goal = shown ? 0.7 : 0
      dot.material.opacity += (goal - dot.material.opacity) * Math.min(1, delta * 10)
      dot.mesh.visible = dot.material.opacity > 0.01
    }
    effects = effects.filter((effect) => {
      const t = (now - effect.start) / 1400
      if (t >= 1) {
        removeEffect(effect)
        return false
      }
      if (t < 0) return true
      const ringT = Math.min(1, t * 2)
      effect.ring.scale.setScalar(0.6 + ringT * 2.4)
      effect.ringMaterial.opacity = (1 - ringT) * 0.95
      if (effect.label && effect.labelMaterial) {
        effect.label.position.y = 1 + t * 1.2
        effect.labelMaterial.opacity = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1
      }
      return true
    })

    // Dice
    if (dieMode === "rolling") {
      const t = (now - dieStart) / 1000
      const rise = Math.min(1, t / 0.25)
      for (const die of dice) {
        die.mesh.position.y =
          THREE.MathUtils.lerp(die.fromY, DIE_REST_Y + 1.5, easeInOut(rise)) +
          Math.sin(t * 9 + die.phase) * 0.12 * rise
        die.spinAxis
          .set(
            Math.sin(t * 2.3 + die.phase),
            0.6 + Math.cos(t * 1.7 + die.phase) * 0.4,
            Math.cos(t * 3.1 + die.phase),
          )
          .normalize()
        die.mesh.rotateOnWorldAxis(die.spinAxis, delta * 15)
      }
    } else if (dieMode === "settling") {
      let settled = true
      dice.forEach((die, index) => {
        // The second die lands a beat after the first.
        const t = Math.min(1, Math.max(0, (now - dieStart - index * 120) / 600))
        if (t < 1) settled = false
        die.mesh.quaternion.slerpQuaternions(
          die.fromQuat,
          die.toQuat,
          easeInOut(Math.min(1, t * 1.6)),
        )
        die.mesh.position.y = THREE.MathUtils.lerp(die.fromY, DIE_REST_Y, easeOutBounce(t))
      })
      if (settled) dieMode = "rest"
    }

    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(animate)

  function dispose() {
    renderer.setAnimationLoop(null)
    // The GPU side is released even if tearing down the scene graph throws
    // (e.g. after a crash left it half-built), so a remount doesn't leak a context.
    try {
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener("pointermove", handlePointerMove)
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown)
      renderer.domElement.removeEventListener("pointerup", handlePointerUp)
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave)
      for (const pawn of [...pawns.values()]) removePawn(pawn)
      rebuildTargets([])
      rebuildBlockades([])
      clearTrail()
      for (const effect of effects) removeEffect(effect)
      for (const item of disposables) item.dispose()
    } finally {
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }

  return { update, dispose }
}
