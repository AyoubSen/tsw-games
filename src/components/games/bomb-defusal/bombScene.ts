import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import {
  BOMB_STRIKE_LIMIT, BOMB_SYMBOLS, MODULE_LABELS,
  type BombDevice, type BombSymbol, type ButtonColor, type ModuleKind, type SimonColor, type WireColor,
} from "@/lib/bombDefusal"

export type BombPick =
  | { type: "module"; index: number }
  | { type: "back" }
  | { type: "wire"; position: number }
  | { type: "key"; symbol: BombSymbol }
  | { type: "switch"; index: number }
  | { type: "cover" }
  | { type: "simon"; color: SimonColor }

export interface BombSceneModule {
  kind: ModuleKind
  device: BombDevice | null
  solved: boolean
  cut: number[]
}

export interface BombSceneState {
  /** A new key rebuilds the case (a new mission). */
  layoutKey: string
  modules: BombSceneModule[]
  serial: string
  /** Countdown text, e.g. "3:07". */
  display: string
  strikes: number
  mood: "armed" | "defused" | "exploded"
  focus: number | null
  /** The operator's own device during play; everyone else only looks. */
  interactive: boolean
  selectedWire: number | null
  keys: BombSymbol[]
  switches: boolean[]
  coverOpen: boolean
  buttonDown: boolean
  stripLit: boolean
  simonInput: SimonColor[]
  /** Changes on every strike to shake the case. */
  shakeKey: string | null
  /** Set when the boom lands. */
  boomKey: string | null
}

export interface BombSceneHandlers {
  onPick: (pick: BombPick) => void
  onButtonDown: () => void
  onButtonUp: () => void
}

export interface BombScene {
  update: (state: BombSceneState) => void
  dispose: () => void
}

/** True colours, a shade deeper than the faceplates so they read on them. */
export const WIRE_HEX: Record<WireColor, string> = {
  red: "#dc2626", blue: "#2563eb", yellow: "#facc15", green: "#16a34a", white: "#f1f5f9", purple: "#7c3aed",
}
const BUTTON_HEX: Record<ButtonColor, string> = { red: "#dc2626", blue: "#2563eb", yellow: "#facc15", white: "#e5e7eb" }
const STRIP_HEX: Record<ButtonColor, string> = { red: "#ef4444", blue: "#3b82f6", yellow: "#facc15", white: "#f8fafc" }
export const SIMON_HEX: Record<SimonColor, string> = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308" }
/** Lens positions: top, right, bottom, left. */
const SIMON_SPOTS: Record<SimonColor, [number, number]> = { red: [0, -0.25], blue: [0.25, 0], green: [0, 0.25], yellow: [-0.25, 0] }
const SIMON_STEP = 700
const SIMON_ON = 430
const SIMON_PAUSE = 1700

const SLOT = 1.25
const GAP = 0.1
const PLATE = 1.18
const TOP = 0.06
const DESK_Y = -0.6
const LED_RED = new THREE.Color("#ef4444")
const LED_GREEN = new THREE.Color("#22c55e")
const LED_AMBER = new THREE.Color("#f59e0b")
const SEGMENTS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
}

type Slot = "timer" | "blank" | number

function slotLayout(count: number): { cols: number; slots: Slot[] } {
  if (count + 1 <= 4) return { cols: 2, slots: ["timer", ...Array.from({ length: count }, (_, i) => i), ...Array(Math.max(0, 3 - count)).fill("blank")] }
  return { cols: 3, slots: [0, "timer", ...Array.from({ length: count - 1 }, (_, i) => i + 1), ...Array(Math.max(0, 5 - count)).fill("blank")] }
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function createWoodTexture() {
  const texture = canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = "#4a2f1b"
    ctx.fillRect(0, 0, 1024, 1024)
    for (let i = 0; i < 220; i++) {
      const y = Math.random() * 1024
      const shade = Math.random() < 0.5 ? "rgba(30,16,8," : "rgba(120,78,44,"
      ctx.strokeStyle = `${shade}${0.08 + Math.random() * 0.18})`
      ctx.lineWidth = 1 + Math.random() * 5
      ctx.beginPath()
      const amp = 4 + Math.random() * 10
      const freq = 0.004 + Math.random() * 0.006
      for (let x = 0; x <= 1024; x += 16) ctx.lineTo(x, y + Math.sin(x * freq + i) * amp)
      ctx.stroke()
    }
    // Planks
    ctx.fillStyle = "rgba(15,8,4,.55)"
    for (const y of [0, 256, 512, 768]) ctx.fillRect(0, y, 1024, 3)
  })
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(4, 4)
  return texture
}

function createGlowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, "rgba(255,255,255,1)")
    gradient.addColorStop(0.35, "rgba(255,255,255,.35)")
    gradient.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
  })
}

function labelTexture(text: string, { width = 512, height = 96, color = "#e5e7eb", font = "700 56px ui-sans-serif, system-ui, sans-serif", align = "left" as CanvasTextAlign, background = "" } = {}) {
  return canvasTexture(width, height, (ctx) => {
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, width, height)
    }
    ctx.fillStyle = color
    ctx.font = font
    ctx.textAlign = align
    ctx.textBaseline = "middle"
    ctx.fillText(text, align === "center" ? width / 2 : align === "right" ? width - 8 : 8, height / 2 + 2)
  })
}

function drawSevenSegment(ctx: CanvasRenderingContext2D, text: string, color: string, ghost: string, lit = true) {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = "#120404"
  ctx.fillRect(0, 0, width, height)
  const h = height * 0.74
  const w = h * 0.52
  const t = h * 0.11
  const gap = t * 0.62
  const colonWidth = w * 0.55
  const spacing = w * 0.24
  const chars = text.split("")
  const total = chars.reduce((sum, char) => sum + (char === ":" ? colonWidth : w), 0) + spacing * (chars.length - 1)
  const draw = (lit: boolean, stroke: string) => {
    let x = (width - total) / 2
    const y = (height - h) / 2
    ctx.save()
    ctx.transform(1, 0, -0.07, 1, h * 0.04, 0)
    ctx.strokeStyle = stroke
    ctx.fillStyle = stroke
    ctx.lineWidth = t
    ctx.lineCap = "round"
    if (lit) {
      ctx.shadowColor = stroke
      ctx.shadowBlur = 22
    }
    for (const char of chars) {
      if (char === ":") {
        for (const cy of [y + h * 0.32, y + h * 0.68]) {
          ctx.beginPath()
          ctx.arc(x + colonWidth / 2, cy, t * 0.6, 0, Math.PI * 2)
          ctx.fill()
        }
        x += colonWidth + spacing
        continue
      }
      const L = x + t / 2, R = x + w - t / 2, T = y + t / 2, M = y + h / 2, B = y + h - t / 2
      const lines: Record<string, [number, number, number, number]> = {
        a: [L + gap, T, R - gap, T], b: [R, T + gap, R, M - gap], c: [R, M + gap, R, B - gap], d: [L + gap, B, R - gap, B],
        e: [L, M + gap, L, B - gap], f: [L, T + gap, L, M - gap], g: [L + gap, M, R - gap, M],
      }
      for (const segment of SEGMENTS[lit ? char : "8"] ?? "") {
        const [x1, y1, x2, y2] = lines[segment]
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      x += w + spacing
    }
    ctx.restore()
  }
  draw(false, ghost)
  if (lit) draw(true, color)
}

interface Led {
  set: (color: THREE.Color | null, intensity?: number) => void
}

interface ModuleView {
  slot: Slot
  center: THREE.Vector3
  plate: THREE.Mesh
  /** Pickable controls while this module is focused on the operator's screen. */
  controls: THREE.Object3D[]
  tick: (now: number, k: number) => void
}

export function createBombScene(container: HTMLElement, handlers: BombSceneHandlers): BombScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Neutral keeps the wire and button colours true.
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
  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = 0.32
  scene.fog = new THREE.Fog(0x0d0805, 9, 22)

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
  const disposables: Array<{ dispose: () => void }> = [environment, pmrem, roomEnvironment]
  const keep = <T extends { dispose: () => void }>(item: T) => (disposables.push(item), item)

  // Lights: a warm desk lamp does the work, a cool fill keeps the shadows readable.
  const hemi = new THREE.HemisphereLight(0xb7c4d6, 0x2a1a10, 0.42)
  scene.add(hemi)
  const fill = new THREE.DirectionalLight(0xc9d8ff, 0.4)
  fill.position.set(-6, 5, 7)
  scene.add(fill)
  const lamp = new THREE.SpotLight(0xffdcae, 48, 0, 0.62, 0.65, 2)
  lamp.castShadow = true
  lamp.shadow.mapSize.set(2048, 2048)
  lamp.shadow.camera.near = 0.5
  lamp.shadow.camera.far = 14
  lamp.shadow.bias = -0.0004
  lamp.shadow.normalBias = 0.02
  lamp.shadow.radius = 5
  scene.add(lamp, lamp.target)
  const LAMP_INTENSITY = lamp.intensity

  // Desk
  const wood = keep(createWoodTexture())
  const deskGeometry = keep(new THREE.PlaneGeometry(40, 40))
  deskGeometry.rotateX(-Math.PI / 2)
  const deskMaterial = keep(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0.02, color: 0xb9a48f }))
  const desk = new THREE.Mesh(deskGeometry, deskMaterial)
  desk.position.y = DESK_Y
  desk.receiveShadow = true
  scene.add(desk)

  const glowTexture = keep(createGlowTexture())

  // Desk lamp model, placed once the case size is known.
  const lampGroup = new THREE.Group()
  scene.add(lampGroup)
  const lampMetal = keep(new THREE.MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.35, metalness: 0.7 }))
  const bulbMaterial = keep(new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false }))

  function rod(material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, radius: number, owned: Array<{ dispose: () => void }>) {
    const length = from.distanceTo(to)
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 14)
    owned.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(from).lerp(to, 0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    mesh.castShadow = true
    return mesh
  }

  let lampOwned: Array<{ dispose: () => void }> = []
  function buildLamp(caseWidth: number, caseDepth: number) {
    for (const item of lampOwned) item.dispose()
    lampOwned = []
    lampGroup.clear()
    const base = new THREE.Vector3(caseWidth / 2 + 1.5, DESK_Y, -caseDepth / 2 - 1.1)
    const elbow = new THREE.Vector3(caseWidth / 2 + 1.75, 2.1, -caseDepth / 2 - 1.6)
    const head = new THREE.Vector3(caseWidth * 0.28, 3.5, -caseDepth * 0.35)
    const baseGeometry = new THREE.CylinderGeometry(0.42, 0.48, 0.1, 32)
    lampOwned.push(baseGeometry)
    const baseMesh = new THREE.Mesh(baseGeometry, lampMetal)
    baseMesh.position.copy(base).add(new THREE.Vector3(0, 0.05, 0))
    baseMesh.castShadow = true
    lampGroup.add(baseMesh, rod(lampMetal, base, elbow, 0.045, lampOwned), rod(lampMetal, elbow, head, 0.04, lampOwned))
    const shadeGeometry = new THREE.ConeGeometry(0.42, 0.62, 32, 1, true)
    shadeGeometry.rotateX(-Math.PI / 2)
    shadeGeometry.translate(0, 0, 0.12)
    lampOwned.push(shadeGeometry)
    const shadeMaterial = new THREE.MeshStandardMaterial({ color: 0x23402f, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide })
    lampOwned.push(shadeMaterial)
    const headGroup = new THREE.Group()
    headGroup.position.copy(head)
    headGroup.lookAt(0, 0, 0)
    const shade = new THREE.Mesh(shadeGeometry, shadeMaterial)
    shade.castShadow = true
    const bulbGeometry = new THREE.SphereGeometry(0.12, 16, 12)
    lampOwned.push(bulbGeometry)
    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial)
    bulb.position.z = 0.28
    headGroup.add(shade, bulb)
    lampGroup.add(headGroup)
    lamp.position.copy(head).add(headGroup.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.3))
    lamp.target.position.set(0, 0, 0.1)
  }

  // Shared parts
  const plateGeometry = keep(new RoundedBoxGeometry(PLATE, 0.06, PLATE, 3, 0.025))
  const plateMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x5f6670, roughness: 0.48, metalness: 0.62 }))
  const screwGeometry = keep(new THREE.CylinderGeometry(0.028, 0.028, 0.016, 12))
  const screwMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.4, metalness: 0.8 }))
  const ledGeometry = keep(new THREE.SphereGeometry(0.034, 16, 12))
  const socketGeometry = keep(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20))
  const darkMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.3 }))
  const hitMaterial = keep(new THREE.MeshBasicMaterial({ visible: false }))

  let state: BombSceneState | null = null
  let layoutKey = ""
  let views: ModuleView[] = []
  let caseSize = { w: 3, d: 3 }
  const caseGroup = new THREE.Group()
  scene.add(caseGroup)
  let owned: Array<{ dispose: () => void }> = []
  const own = <T extends { dispose: () => void }>(item: T) => (owned.push(item), item)
  const pressFlash = new Map<SimonColor, number>()

  function makeLed(parent: THREE.Object3D, x: number, z: number, y = TOP): Led {
    const socket = new THREE.Mesh(socketGeometry, darkMaterial)
    socket.position.set(x, y + 0.01, z)
    const material = own(new THREE.MeshStandardMaterial({ color: 0x3a0d0d, roughness: 0.25, metalness: 0, emissive: 0x000000 }))
    const bulb = new THREE.Mesh(ledGeometry, material)
    bulb.position.set(x, y + 0.03, z)
    const glow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 })))
    glow.scale.setScalar(0.26)
    glow.position.copy(bulb.position)
    parent.add(socket, bulb, glow)
    return {
      set(color, intensity = 1) {
        if (!color) {
          material.color.set(0x2a1212)
          material.emissive.set(0x000000)
          glow.material.opacity = 0
          return
        }
        material.color.copy(color).multiplyScalar(0.5)
        material.emissive.copy(color)
        material.emissiveIntensity = 1.6 * intensity
        glow.material.color.copy(color)
        glow.material.opacity = 0.75 * intensity
      },
    }
  }

  function addPlate(group: THREE.Group, slot: Slot, label: string) {
    const plate = new THREE.Mesh(plateGeometry, plateMaterial)
    plate.position.y = 0.03
    plate.receiveShadow = true
    plate.castShadow = true
    plate.userData.pick = typeof slot === "number" ? `module:${slot}` : undefined
    group.add(plate)
    for (const [x, z] of [[-0.53, -0.53], [0.53, -0.53], [-0.53, 0.53], [0.53, 0.53]]) {
      const screw = new THREE.Mesh(screwGeometry, screwMaterial)
      screw.position.set(x, TOP + 0.006, z)
      group.add(screw)
    }
    if (label) {
      const texture = own(labelTexture(label.toUpperCase(), { color: "#d7dbe0", font: "800 46px ui-sans-serif, system-ui, sans-serif" }))
      const tag = new THREE.Mesh(own(new THREE.PlaneGeometry(0.62, 0.116)), own(new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.7 })))
      tag.rotation.x = -Math.PI / 2
      tag.position.set(-0.19, TOP + 0.002, -0.5)
      group.add(tag)
    }
    return plate
  }

  function moduleOf(index: number) {
    return state?.modules[index]
  }

  function ledFor(group: THREE.Group, index: number): (now: number) => void {
    const led = makeLed(group, 0.47, -0.47)
    return (now) => {
      const mod = moduleOf(index)
      if (state?.mood === "defused" || mod?.solved) led.set(LED_GREEN)
      else if (state?.mood === "exploded") led.set(null)
      else led.set(LED_RED, 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now * 0.004 + index)))
    }
  }

  // ─── Modules ─────────────────────────────────────────────────────────

  function buildWires(group: THREE.Group, index: number, device: Extract<BombDevice, { kind: "wires" }>): Omit<ModuleView, "slot" | "center" | "plate"> {
    const terminalGeometry = own(new RoundedBoxGeometry(0.1, 0.1, 0.94, 2, 0.02))
    for (const x of [-0.42, 0.42]) {
      const terminal = new THREE.Mesh(terminalGeometry, darkMaterial)
      terminal.position.set(x, TOP + 0.05, 0.04)
      terminal.castShadow = true
      group.add(terminal)
    }
    const numbers = own(canvasTexture(64, 512, (ctx) => {
      ctx.fillStyle = "#e5e7eb"
      ctx.font = "800 44px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (let i = 0; i < 5; i++) ctx.fillText(String(i + 1), 32, 51 + i * 102.5)
    }))
    const numberPlane = new THREE.Mesh(own(new THREE.PlaneGeometry(0.08, 0.86)), own(new THREE.MeshBasicMaterial({ map: numbers, transparent: true })))
    numberPlane.rotation.x = -Math.PI / 2
    numberPlane.position.set(-0.53, TOP + 0.002, 0.04)
    group.add(numberPlane)

    const halfCurve = (sign: number) => new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(sign * 0.18, 0.06, 0.01), new THREE.Vector3(sign * 0.42, 0.04, 0),
    ])
    const leftGeometry = own(new THREE.TubeGeometry(halfCurve(1), 20, 0.026, 10))
    const rightGeometry = own(new THREE.TubeGeometry(halfCurve(-1), 20, 0.026, 10))
    const capGeometry = own(new THREE.CylinderGeometry(0.027, 0.027, 0.02, 10))
    const copper = own(new THREE.MeshStandardMaterial({ color: 0xc77b30, metalness: 0.9, roughness: 0.3 }))
    const hitGeometry = own(new THREE.CylinderGeometry(0.075, 0.075, 0.8, 8))
    hitGeometry.rotateZ(Math.PI / 2)

    const wires = device.colors.map((color, i) => {
      const z = -0.33 + i * 0.172
      const material = own(new THREE.MeshStandardMaterial({ color: WIRE_HEX[color], roughness: 0.42, metalness: 0.05, emissive: WIRE_HEX[color], emissiveIntensity: 0 }))
      const make = (geometry: THREE.TubeGeometry, x: number) => {
        const pivot = new THREE.Group()
        pivot.position.set(x, TOP + 0.08, z)
        const tube = new THREE.Mesh(geometry, material)
        tube.castShadow = true
        const cap = new THREE.Mesh(capGeometry, copper)
        cap.rotation.z = Math.PI / 2
        cap.position.set(x < 0 ? 0.42 : -0.42, 0.04, 0)
        cap.visible = false
        pivot.add(tube, cap)
        group.add(pivot)
        return { pivot, cap }
      }
      const left = make(leftGeometry, -0.42)
      const right = make(rightGeometry, 0.42)
      const hit = new THREE.Mesh(hitGeometry, hitMaterial)
      hit.position.set(0, TOP + 0.12, z)
      hit.userData.pick = `wire:${i + 1}`
      group.add(hit)
      return { left, right, hit, material, cut: 0, lift: 0 }
    })
    const led = ledFor(group, index)
    return {
      controls: wires.map((wire) => wire.hit),
      tick(now, k) {
        led(now)
        const mod = moduleOf(index)
        wires.forEach((wire, i) => {
          const cut = mod?.cut.includes(i + 1) ?? false
          const selected = !cut && state?.interactive && state.selectedWire === i + 1
          wire.cut += ((cut ? 1 : 0) - wire.cut) * Math.min(1, k * 1.6)
          wire.lift += ((selected ? 1 : 0) - wire.lift) * k
          const droop = easeOut(wire.cut) * 0.32
          wire.left.pivot.rotation.z = -droop
          wire.right.pivot.rotation.z = droop
          wire.left.pivot.scale.x = wire.right.pivot.scale.x = 1 - wire.cut * 0.12
          wire.left.cap.visible = wire.right.cap.visible = wire.cut > 0.05
          wire.left.pivot.position.y = wire.right.pivot.position.y = TOP + 0.08 + wire.lift * 0.045
          wire.material.emissiveIntensity = wire.lift * (0.28 + 0.12 * Math.sin(now * 0.008))
          wire.hit.userData.pick = cut ? undefined : `wire:${i + 1}`
        })
      },
    }
  }

  function buildSymbols(group: THREE.Group, index: number, device: Extract<BombDevice, { kind: "symbols" }>): Omit<ModuleView, "slot" | "center" | "plate"> {
    const keyGeometry = own(new RoundedBoxGeometry(0.36, 0.12, 0.33, 3, 0.035))
    const wellGeometry = own(new RoundedBoxGeometry(0.42, 0.05, 0.39, 2, 0.02))
    const glyphGeometry = own(new THREE.PlaneGeometry(0.27, 0.27))
    const badgeGeometry = own(new THREE.PlaneGeometry(0.09, 0.09))
    const keyMaterial = own(new THREE.MeshStandardMaterial({ color: 0xe4dccb, roughness: 0.62, metalness: 0, emissive: 0xffb54a, emissiveIntensity: 0 }))
    const badges = [1, 2, 3, 4].map((n) => own(labelTexture(String(n), { width: 64, height: 64, font: "900 46px ui-monospace, monospace", align: "center", color: "#111", background: "#fbbf24" })))
    const keys = device.symbols.map((symbol, i) => {
      const x = i % 2 === 0 ? -0.23 : 0.23
      const z = i < 2 ? -0.15 : 0.31
      const well = new THREE.Mesh(wellGeometry, darkMaterial)
      well.position.set(x, TOP + 0.025, z)
      group.add(well)
      const key = new THREE.Group()
      key.position.set(x, TOP + 0.1, z)
      const material = keyMaterial.clone()
      own(material)
      const cap = new THREE.Mesh(keyGeometry, material)
      cap.castShadow = true
      cap.userData.pick = `key:${symbol}`
      const glyphTexture = own(labelTexture(BOMB_SYMBOLS[symbol].glyph, { width: 128, height: 128, align: "center", color: "#16181c", font: "700 96px 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'DejaVu Sans', sans-serif" }))
      const glyph = new THREE.Mesh(glyphGeometry, own(new THREE.MeshStandardMaterial({ map: glyphTexture, transparent: true, roughness: 0.7 })))
      glyph.rotation.x = -Math.PI / 2
      glyph.position.y = 0.061
      const badgeMaterial = own(new THREE.MeshBasicMaterial({ map: badges[0], toneMapped: false }))
      const badge = new THREE.Mesh(badgeGeometry, badgeMaterial)
      badge.rotation.x = -Math.PI / 2
      badge.position.set(0.125, 0.062, -0.115)
      badge.visible = false
      key.add(cap, glyph, badge)
      group.add(key)
      const led = makeLed(group, x, z - 0.235)
      return { symbol, key, cap, material, badge, badgeMaterial, led, press: 0, order: -1 }
    })
    const statusLed = ledFor(group, index)
    return {
      controls: keys.map((key) => key.cap),
      tick(now, k) {
        statusLed(now)
        const mod = moduleOf(index)
        const sequence = state?.interactive ? state.keys : []
        keys.forEach((key) => {
          const order = mod?.solved ? 0 : sequence.indexOf(key.symbol)
          const down = order >= 0
          key.press += ((down ? 1 : 0) - key.press) * Math.min(1, k * 2.2)
          key.key.position.y = TOP + 0.1 - key.press * 0.045
          key.material.emissiveIntensity = down && !mod?.solved ? 0.12 : 0
          key.badge.visible = down && !mod?.solved
          if (down && !mod?.solved && key.order !== order) {
            key.order = order
            key.badgeMaterial.map = badges[order]
            key.badgeMaterial.needsUpdate = true
          }
          if (mod?.solved || state?.mood === "defused") key.led.set(LED_GREEN, 0.8)
          else if (down) key.led.set(LED_AMBER)
          else key.led.set(null)
        })
      },
    }
  }

  function buildSwitches(group: THREE.Group, index: number, device: Extract<BombDevice, { kind: "switches" }>): Omit<ModuleView, "slot" | "center" | "plate"> {
    const lcdBody = new THREE.Mesh(own(new RoundedBoxGeometry(0.84, 0.05, 0.26, 2, 0.015)), darkMaterial)
    lcdBody.position.set(-0.06, TOP + 0.025, -0.25)
    group.add(lcdBody)
    const lcdTexture = own(canvasTexture(512, 160, (ctx) => {
      ctx.fillStyle = "#0b1a0f"
      ctx.fillRect(0, 0, 512, 160)
      ctx.font = "800 64px ui-monospace, monospace"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "rgba(163,230,53,.08)"
      ctx.fillText("CH 8", 24, 82)
      ctx.textAlign = "right"
      ctx.fillText("PULSING", 492, 82)
      ctx.shadowColor = "#a3e635"
      ctx.shadowBlur = 12
      ctx.fillStyle = "#b8f05a"
      ctx.textAlign = "left"
      ctx.fillText(`CH ${device.channel}`, 24, 82)
      ctx.textAlign = "right"
      ctx.fillText(device.signal.toUpperCase(), 492, 82)
    }))
    const lcd = new THREE.Mesh(own(new THREE.PlaneGeometry(0.8, 0.22)), own(new THREE.MeshBasicMaterial({ map: lcdTexture, toneMapped: false })))
    lcd.rotation.x = -Math.PI / 2
    lcd.position.set(-0.06, TOP + 0.052, -0.25)
    group.add(lcd)
    const signalLed = makeLed(group, 0.45, -0.25)

    const nutGeometry = own(new THREE.CylinderGeometry(0.07, 0.075, 0.05, 6))
    const leverGeometry = own(new THREE.CylinderGeometry(0.016, 0.022, 0.22, 12))
    leverGeometry.translate(0, 0.11, 0)
    const tipGeometry = own(new THREE.SphereGeometry(0.034, 14, 10))
    const chrome = own(new THREE.MeshStandardMaterial({ color: 0xd7dce2, roughness: 0.18, metalness: 0.95 }))
    const hitGeometry = own(new THREE.BoxGeometry(0.22, 0.3, 0.42))
    const toggles = [0, 1, 2, 3].map((i) => {
      const x = -0.36 + i * 0.24
      const nut = new THREE.Mesh(nutGeometry, chrome)
      nut.position.set(x, TOP + 0.025, 0.14)
      const pivot = new THREE.Group()
      pivot.position.set(x, TOP + 0.05, 0.14)
      const lever = new THREE.Mesh(leverGeometry, chrome)
      lever.castShadow = true
      const tip = new THREE.Mesh(tipGeometry, chrome)
      tip.position.y = 0.22
      tip.castShadow = true
      pivot.add(lever, tip)
      const hit = new THREE.Mesh(hitGeometry, hitMaterial)
      hit.position.set(x, TOP + 0.15, 0.14)
      hit.userData.pick = `switch:${i}`
      group.add(nut, pivot, hit)
      return { pivot, hit, angle: 0.55 }
    })
    const letters = own(canvasTexture(512, 64, (ctx) => {
      ctx.fillStyle = "#e5e7eb"
      ctx.font = "800 44px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ;["A", "B", "C", "D"].forEach((letter, i) => ctx.fillText(letter, 64 + i * 128, 34))
    }))
    const letterPlane = new THREE.Mesh(own(new THREE.PlaneGeometry(0.96, 0.12)), own(new THREE.MeshBasicMaterial({ map: letters, transparent: true })))
    letterPlane.rotation.x = -Math.PI / 2
    letterPlane.position.set(0, TOP + 0.002, 0.45)
    const upTexture = own(labelTexture("▲ UP", { width: 256, height: 64, color: "#cbd5e1", font: "800 36px ui-sans-serif, system-ui, sans-serif" }))
    const upPlane = new THREE.Mesh(own(new THREE.PlaneGeometry(0.3, 0.075)), own(new THREE.MeshBasicMaterial({ map: upTexture, transparent: true })))
    upPlane.rotation.x = -Math.PI / 2
    upPlane.position.set(-0.36, TOP + 0.002, -0.05)
    group.add(letterPlane, upPlane)
    const led = ledFor(group, index)
    return {
      controls: toggles.map((toggle) => toggle.hit),
      tick(now, k) {
        led(now)
        const pulsing = device.signal === "pulsing"
        signalLed.set(LED_GREEN, pulsing ? (Math.sin(now * 0.009) > 0 ? 1 : 0.08) : 0.9)
        toggles.forEach((toggle, i) => {
          const up = state?.interactive || moduleOf(index)?.solved ? state?.switches[i] ?? false : false
          toggle.angle += ((up ? -0.55 : 0.55) - toggle.angle) * Math.min(1, k * 3)
          toggle.pivot.rotation.x = toggle.angle
        })
      },
    }
  }

  function buildButton(group: THREE.Group, index: number, device: Extract<BombDevice, { kind: "button" }>): Omit<ModuleView, "slot" | "center" | "plate"> {
    const cx = -0.1
    const cz = 0.06
    const housing = new THREE.Mesh(own(new THREE.CylinderGeometry(0.37, 0.39, 0.06, 40)), darkMaterial)
    housing.position.set(cx, TOP + 0.03, cz)
    group.add(housing)
    const capGeometry = own(new THREE.CylinderGeometry(0.29, 0.3, 0.12, 40))
    const capMaterial = own(new THREE.MeshStandardMaterial({ color: BUTTON_HEX[device.color], roughness: 0.32, metalness: 0.05 }))
    const button = new THREE.Group()
    button.position.set(cx, TOP + 0.12, cz)
    const cap = new THREE.Mesh(capGeometry, capMaterial)
    cap.castShadow = true
    cap.userData.pick = "button"
    const dark = device.color === "red" || device.color === "blue"
    const labelTex = own(labelTexture(device.label, { width: 512, height: 128, align: "center", color: dark ? "#f8fafc" : "#111827", font: "900 92px ui-sans-serif, system-ui, sans-serif" }))
    const label = new THREE.Mesh(own(new THREE.PlaneGeometry(0.48, 0.12)), own(new THREE.MeshStandardMaterial({ map: labelTex, transparent: true, roughness: 0.6 })))
    label.rotation.x = -Math.PI / 2
    label.position.y = 0.061
    button.add(cap, label)
    group.add(button)

    // Hinged safety cover over the button: lift it first, then press.
    const hinge = new THREE.Group()
    hinge.position.set(cx, TOP + 0.06, cz - 0.4)
    const coverGeometry = own(new THREE.BoxGeometry(0.8, 0.24, 0.8))
    coverGeometry.translate(0, 0.12, 0.4)
    const coverMaterial = own(new THREE.MeshStandardMaterial({ color: 0xcfe3f5, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0, depthWrite: false }))
    const cover = new THREE.Mesh(coverGeometry, coverMaterial)
    cover.userData.pick = "cover"
    const edges = new THREE.LineSegments(own(new THREE.EdgesGeometry(coverGeometry)), own(new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.7 })))
    const stripe = own(canvasTexture(256, 64, (ctx) => {
      for (let x = -64; x < 256; x += 32) {
        ctx.fillStyle = "#facc15"
        ctx.beginPath()
        ctx.moveTo(x, 64)
        ctx.lineTo(x + 16, 64)
        ctx.lineTo(x + 32, 0)
        ctx.lineTo(x + 16, 0)
        ctx.fill()
      }
    }))
    const stripePlane = new THREE.Mesh(own(new THREE.PlaneGeometry(0.8, 0.07)), own(new THREE.MeshBasicMaterial({ map: stripe, transparent: true })))
    stripePlane.position.set(0, 0.2, 0.801)
    hinge.add(cover, edges, stripePlane)
    group.add(hinge)

    const strip = new THREE.Mesh(own(new RoundedBoxGeometry(0.11, 0.05, 0.84, 2, 0.02)), own(new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.3, emissive: STRIP_HEX[device.strip], emissiveIntensity: 0 })))
    strip.position.set(0.44, TOP + 0.025, 0.04)
    const stripGlow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture, color: STRIP_HEX[device.strip], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 })))
    stripGlow.scale.set(0.5, 1.2, 1)
    stripGlow.position.set(0.44, TOP + 0.08, 0.04)
    group.add(strip, stripGlow)
    let open = 0
    let press = 0
    let lit = 0
    const led = ledFor(group, index)
    return {
      controls: [cover, cap],
      tick(now, k) {
        led(now)
        const solved = moduleOf(index)?.solved
        const coverOpen = Boolean(state?.interactive && state.coverOpen && !solved)
        open += ((coverOpen ? 1 : 0) - open) * Math.min(1, k * 1.8)
        hinge.rotation.x = -1.95 * easeOut(open)
        cover.userData.pick = solved ? undefined : "cover"
        cap.userData.pick = coverOpen ? "button" : undefined
        const down = Boolean(state?.interactive && state.buttonDown)
        press += ((down ? 1 : 0) - press) * Math.min(1, k * 4)
        button.position.y = TOP + 0.12 - press * 0.045
        const stripOn = Boolean(state?.interactive && state.stripLit)
        lit += ((stripOn ? 1 : 0) - lit) * Math.min(1, k * 3)
        const flicker = 0.85 + 0.15 * Math.sin(now * 0.02)
        ;(strip.material as THREE.MeshStandardMaterial).emissiveIntensity = lit * 2.2 * flicker
        stripGlow.material.opacity = lit * 0.6
      },
    }
  }

  function buildSimon(group: THREE.Group, index: number, device: Extract<BombDevice, { kind: "simon" }>): Omit<ModuleView, "slot" | "center" | "plate"> {
    const base = new THREE.Mesh(own(new THREE.CylinderGeometry(0.46, 0.48, 0.05, 48)), darkMaterial)
    base.position.set(0, TOP + 0.025, -0.04)
    group.add(base)
    const lensGeometry = own(new THREE.SphereGeometry(0.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2))
    const lenses = (Object.keys(SIMON_SPOTS) as SimonColor[]).map((color) => {
      const [x, z] = SIMON_SPOTS[color]
      const hex = new THREE.Color(SIMON_HEX[color])
      const material = own(new THREE.MeshStandardMaterial({ color: hex.clone().multiplyScalar(0.42), roughness: 0.22, metalness: 0, emissive: hex, emissiveIntensity: 0 }))
      const lens = new THREE.Mesh(lensGeometry, material)
      lens.scale.y = 0.55
      lens.position.set(x, TOP + 0.05, z - 0.04)
      lens.castShadow = true
      lens.userData.pick = `simon:${color}`
      const glow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture, color: hex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 })))
      glow.scale.setScalar(0.62)
      glow.position.set(x, TOP + 0.14, z - 0.04)
      group.add(lens, glow)
      return { color, lens, material, glow, level: 0 }
    })
    const slotGeometry = own(new RoundedBoxGeometry(0.11, 0.03, 0.08, 2, 0.01))
    const slots = device.flashes.map((_, i) => {
      const material = own(new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, emissive: 0x000000 }))
      const slot = new THREE.Mesh(slotGeometry, material)
      slot.position.set((i - (device.flashes.length - 1) / 2) * 0.15, TOP + 0.015, 0.5)
      group.add(slot)
      return material
    })
    const led = ledFor(group, index)
    const cycle = device.flashes.length * SIMON_STEP + SIMON_PAUSE
    return {
      controls: lenses.map((lens) => lens.lens),
      tick(now, k) {
        led(now)
        const solved = moduleOf(index)?.solved || state?.mood !== "armed"
        const t = now % cycle
        const step = Math.floor(t / SIMON_STEP)
        const flashing = !solved && step < device.flashes.length && t % SIMON_STEP < SIMON_ON ? device.flashes[step] : null
        lenses.forEach((lens) => {
          const pressed = now - (pressFlash.get(lens.color) ?? -1e9) < 260
          const on = pressed || flashing === lens.color
          lens.level += ((on ? 1 : 0) - lens.level) * Math.min(1, k * 6)
          lens.material.emissiveIntensity = lens.level * 2.4
          lens.glow.material.opacity = lens.level * 0.7
        })
        const input = state?.interactive ? state.simonInput : []
        slots.forEach((material, i) => {
          const color = input[i]
          if (color) {
            material.color.set(SIMON_HEX[color]).multiplyScalar(0.6)
            material.emissive.set(SIMON_HEX[color])
            material.emissiveIntensity = 0.8
          } else {
            material.color.set(0x2a2d33)
            material.emissiveIntensity = 0
          }
        })
      },
    }
  }

  function buildTimer(group: THREE.Group): Omit<ModuleView, "slot" | "center" | "plate"> {
    const bezel = new THREE.Mesh(own(new RoundedBoxGeometry(1.02, 0.07, 0.56, 2, 0.02)), darkMaterial)
    bezel.position.set(0, TOP + 0.035, -0.12)
    group.add(bezel)
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 256
    const ctx = canvas.getContext("2d")!
    const texture = own(new THREE.CanvasTexture(canvas))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const display = new THREE.Mesh(own(new THREE.PlaneGeometry(0.94, 0.47)), own(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })))
    display.rotation.x = -Math.PI / 2
    display.position.set(0, TOP + 0.071, -0.12)
    const glow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff3b30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.32 })))
    glow.scale.set(1.5, 0.8, 1)
    glow.position.set(0, TOP + 0.12, -0.12)
    group.add(display, glow)
    const strikeTexture = own(labelTexture("STRIKES", { width: 256, height: 64, color: "#cbd5e1", font: "800 34px ui-sans-serif, system-ui, sans-serif" }))
    const strikeLabel = new THREE.Mesh(own(new THREE.PlaneGeometry(0.3, 0.075)), own(new THREE.MeshBasicMaterial({ map: strikeTexture, transparent: true })))
    strikeLabel.rotation.x = -Math.PI / 2
    strikeLabel.position.set(-0.36, TOP + 0.002, 0.33)
    group.add(strikeLabel)
    const strikeLeds = Array.from({ length: BOMB_STRIKE_LIMIT }, (_, i) => makeLed(group, 0.02 + i * 0.18, 0.33))
    let drawn = ""
    return {
      controls: [],
      tick(now) {
        const mood = state?.mood ?? "armed"
        const text = state?.display ?? "0:00"
        const blinkOff = mood === "exploded" && Math.floor(now / 350) % 2 === 1
        const key = `${text}|${mood}|${blinkOff}`
        if (key !== drawn) {
          drawn = key
          const color = mood === "defused" ? "#4ade80" : "#ff3b30"
          drawSevenSegment(ctx, text, color, mood === "defused" ? "rgba(74,222,128,.07)" : "rgba(255,59,48,.08)", !blinkOff)
          texture.needsUpdate = true
          glow.material.color.set(color)
        }
        glow.material.opacity = blinkOff ? 0.05 : 0.3
        strikeLeds.forEach((led, i) => {
          if (mood === "defused") led.set(LED_GREEN)
          else if (i < (state?.strikes ?? 0)) led.set(LED_RED)
          else led.set(null)
        })
      },
    }
  }

  function buildBlank(group: THREE.Group): Omit<ModuleView, "slot" | "center" | "plate"> {
    const ventGeometry = own(new RoundedBoxGeometry(0.7, 0.02, 0.05, 2, 0.01))
    for (let i = 0; i < 6; i++) {
      const vent = new THREE.Mesh(ventGeometry, darkMaterial)
      vent.position.set(0, TOP + 0.005, -0.3 + i * 0.12)
      group.add(vent)
    }
    return { controls: [], tick() {} }
  }

  function rebuild(next: BombSceneState) {
    for (const item of owned) item.dispose()
    owned = []
    caseGroup.clear()
    views = []
    const { cols, slots } = slotLayout(next.modules.length)
    const width = cols * SLOT + (cols - 1) * GAP + 0.36
    const depth = 2 * SLOT + GAP + 0.36
    caseSize = { w: width, d: depth }

    const shell = new THREE.Mesh(own(new RoundedBoxGeometry(width, 0.6, depth, 4, 0.09)), own(new THREE.MeshStandardMaterial({ color: 0x2c3330, roughness: 0.58, metalness: 0.45 })))
    shell.position.y = -0.3
    shell.castShadow = true
    shell.receiveShadow = true
    const bay = new THREE.Mesh(own(new THREE.PlaneGeometry(width - 0.16, depth - 0.16)), own(new THREE.MeshStandardMaterial({ color: 0x121514, roughness: 0.8 })))
    bay.rotation.x = -Math.PI / 2
    bay.position.y = 0.001
    bay.receiveShadow = true
    caseGroup.add(shell, bay)

    // Handles, latches and the serial sticker on the front.
    const handleGeometry = own(new THREE.TorusGeometry(0.2, 0.035, 10, 24, Math.PI))
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(handleGeometry, screwMaterial)
      handle.position.set(side * (width / 2 + 0.01), -0.3, 0)
      handle.rotation.set(Math.PI / 2, side * Math.PI / 2, 0, "YXZ")
      handle.castShadow = true
      caseGroup.add(handle)
    }
    const latchGeometry = own(new RoundedBoxGeometry(0.26, 0.2, 0.06, 2, 0.02))
    const latchMaterial = own(new THREE.MeshStandardMaterial({ color: 0xa8adb3, roughness: 0.3, metalness: 0.9 }))
    for (const x of [-width / 2 + 0.45, width / 2 - 0.45]) {
      const latch = new THREE.Mesh(latchGeometry, latchMaterial)
      latch.position.set(x, -0.2, depth / 2 + 0.02)
      latch.castShadow = true
      caseGroup.add(latch)
    }
    const stickerTexture = own(canvasTexture(640, 128, (ctx) => {
      ctx.fillStyle = "#f3efe4"
      ctx.fillRect(0, 0, 640, 128)
      ctx.fillStyle = "#111"
      ctx.font = "700 30px ui-sans-serif, system-ui, sans-serif"
      ctx.textBaseline = "middle"
      ctx.fillText("SERIAL NO.", 22, 64)
      ctx.font = "900 64px ui-monospace, monospace"
      ctx.fillText(next.serial, 210, 66)
      ctx.strokeStyle = "#111"
      ctx.lineWidth = 4
      ctx.strokeRect(6, 6, 628, 116)
    }))
    const sticker = new THREE.Mesh(own(new THREE.PlaneGeometry(1.5, 0.3)), own(new THREE.MeshStandardMaterial({ map: stickerTexture, roughness: 0.85 })))
    sticker.position.set(0, -0.29, depth / 2 + 0.002)
    caseGroup.add(sticker)
    // A copy on top so it reads from steep angles too.
    const topSticker = new THREE.Mesh(own(new THREE.PlaneGeometry(0.9, 0.18)), sticker.material)
    topSticker.rotation.x = -Math.PI / 2
    topSticker.position.set(width / 2 - 0.55, 0.003, depth / 2 - 0.045)
    topSticker.scale.setScalar(0.5)
    caseGroup.add(topSticker)

    slots.forEach((slot, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const center = new THREE.Vector3((col - (cols - 1) / 2) * (SLOT + GAP), 0, (row - 0.5) * (SLOT + GAP))
      const group = new THREE.Group()
      group.position.copy(center)
      caseGroup.add(group)
      const mod = typeof slot === "number" ? next.modules[slot] : null
      const plate = addPlate(group, slot, mod ? MODULE_LABELS[mod.kind] : "")
      let parts: Omit<ModuleView, "slot" | "center" | "plate">
      if (slot === "timer") parts = buildTimer(group)
      else if (!mod?.device) parts = buildBlank(group)
      else {
        const device = mod.device
        parts = device.kind === "wires" ? buildWires(group, slot as number, device)
          : device.kind === "symbols" ? buildSymbols(group, slot as number, device)
          : device.kind === "switches" ? buildSwitches(group, slot as number, device)
          : device.kind === "button" ? buildButton(group, slot as number, device)
          : buildSimon(group, slot as number, device)
      }
      views.push({ slot, center, plate, ...parts })
    })
    buildLamp(width, depth)
    fitDirty = true
  }

  // ─── Camera: a clamped orbit, and a zoom onto the tapped module ────────

  const DEFAULT_YAW = 0
  const DEFAULT_PITCH = 0.98
  let yawOffset = 0
  let pitchOffset = 0
  const camYawPitch = { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }
  const camTarget = new THREE.Vector3()
  let camDistance = 8
  let fitDirty = true
  const projected = new THREE.Vector3()
  const direction = new THREE.Vector3()

  function fitDistance(target: THREE.Vector3, yaw: number, pitch: number, points: THREE.Vector3[], margin: number) {
    direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    let low = 1
    let high = 60
    for (let i = 0; i < 22; i++) {
      const distance = (low + high) / 2
      camera.position.copy(target).addScaledVector(direction, distance)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      const fits = points.every((point) => {
        projected.copy(point).project(camera)
        return Math.abs(projected.x) <= margin && Math.abs(projected.y) <= margin
      })
      if (fits) high = distance
      else low = distance
    }
    return high
  }

  function desiredView() {
    const focusView = state?.focus != null ? views.find((view) => view.slot === state!.focus) : undefined
    if (focusView) {
      const yaw = yawOffset * 0.5
      const pitch = THREE.MathUtils.clamp(1.2 + pitchOffset * 0.5, 0.95, 1.45)
      const target = focusView.center.clone().add(new THREE.Vector3(0, 0.05, 0.04))
      const points: THREE.Vector3[] = []
      for (const x of [-0.62, 0.62]) for (const z of [-0.62, 0.62]) for (const y of [0, 0.3]) points.push(focusView.center.clone().add(new THREE.Vector3(x, y, z)))
      // Leave room for the dock under the module on narrow screens.
      return { target, yaw, pitch, points, margin: camera.aspect < 0.8 ? 0.78 : 0.72 }
    }
    const yaw = DEFAULT_YAW + yawOffset
    const pitch = THREE.MathUtils.clamp(DEFAULT_PITCH + pitchOffset, 0.72, 1.38)
    const points: THREE.Vector3[] = []
    for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [-0.6, 0.35]) points.push(new THREE.Vector3((x * caseSize.w) / 2, y, (z * caseSize.d) / 2))
    return { target: new THREE.Vector3(0, -0.1, 0.1), yaw, pitch, points, margin: 0.86 }
  }

  // ─── Interaction ─────────────────────────────────────────────────────

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let down: { x: number; y: number; id: number; dragging: boolean; lastX: number; lastY: number } | null = null
  let pressingButton = false

  function hitPick(event: PointerEvent): string | null {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const candidates: THREE.Object3D[] = []
    for (const view of views) {
      candidates.push(view.plate)
      const solved = typeof view.slot === "number" && state?.modules[view.slot]?.solved
      if (state?.interactive && state.mood === "armed" && state.focus === view.slot && !solved) candidates.push(...view.controls)
    }
    for (const hit of raycaster.intersectObjects(candidates, false)) {
      const pick = hit.object.userData.pick as string | undefined
      if (pick) return pick
    }
    return null
  }

  function toPick(raw: string | null): BombPick | null {
    if (!raw) return state?.focus != null ? { type: "back" } : null
    const [type, value] = raw.split(":")
    if (type === "module") {
      const index = Number(value)
      return index === state?.focus ? null : { type: "module", index }
    }
    if (type === "wire") return { type: "wire", position: Number(value) }
    if (type === "key") return { type: "key", symbol: value as BombSymbol }
    if (type === "switch") return { type: "switch", index: Number(value) }
    if (type === "cover") return { type: "cover" }
    if (type === "simon") return { type: "simon", color: value as SimonColor }
    return null
  }

  function handlePointerDown(event: PointerEvent) {
    if (down) return
    down = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false, lastX: event.clientX, lastY: event.clientY }
    renderer.domElement.setPointerCapture(event.pointerId)
    if (hitPick(event) === "button") {
      pressingButton = true
      handlers.onButtonDown()
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (!down || event.pointerId !== down.id) {
      if (event.pointerType === "mouse") renderer.domElement.style.cursor = hitPick(event) ? "pointer" : "grab"
      return
    }
    if (pressingButton) return
    if (!down.dragging && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) down.dragging = true
    if (down.dragging) {
      yawOffset = THREE.MathUtils.clamp(yawOffset - (event.clientX - down.lastX) * 0.004, -0.6, 0.6)
      pitchOffset = THREE.MathUtils.clamp(pitchOffset + (event.clientY - down.lastY) * 0.003, -0.3, 0.4)
      renderer.domElement.style.cursor = "grabbing"
    }
    down.lastX = event.clientX
    down.lastY = event.clientY
  }

  function handlePointerUp(event: PointerEvent) {
    if (!down || event.pointerId !== down.id) return
    const wasDragging = down.dragging
    down = null
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId)
    if (pressingButton) {
      pressingButton = false
      handlers.onButtonUp()
      return
    }
    if (wasDragging) return
    const raw = hitPick(event)
    const picked = toPick(raw)
    if (!picked) return
    if (picked.type === "simon") pressFlash.set(picked.color, performance.now())
    handlers.onPick(picked)
  }

  function handlePointerCancel(event: PointerEvent) {
    if (!down || event.pointerId !== down.id) return
    down = null
    if (pressingButton) {
      pressingButton = false
      handlers.onButtonUp()
    }
  }

  renderer.domElement.addEventListener("pointerdown", handlePointerDown)
  renderer.domElement.addEventListener("pointermove", handlePointerMove)
  renderer.domElement.addEventListener("pointerup", handlePointerUp)
  renderer.domElement.addEventListener("pointercancel", handlePointerCancel)

  function resize() {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    fitDirty = true
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  // ─── Loop ────────────────────────────────────────────────────────────

  let shakeKey: string | null = null
  let boomKey: string | null = null
  let shakeUntil = 0
  let shakeAmp = 0
  let lastFrame = performance.now()
  let fitKey = ""
  let fitted = { target: new THREE.Vector3(), yaw: 0, pitch: 1, distance: 8 }
  let first = true

  function animate(now: number) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now
    const k = 1 - Math.exp(-dt * 7)

    // Ease the orbit back toward the default when nobody is dragging.
    if (!down?.dragging) {
      yawOffset *= 1 - dt * 0.25
      pitchOffset *= 1 - dt * 0.25
    }
    const view = desiredView()
    const key = `${state?.focus}|${view.yaw.toFixed(3)}|${view.pitch.toFixed(3)}|${camera.aspect.toFixed(3)}|${caseSize.w}`
    if (fitDirty || key !== fitKey) {
      fitKey = key
      fitDirty = false
      fitted = { target: view.target, yaw: view.yaw, pitch: view.pitch, distance: fitDistance(view.target, view.yaw, view.pitch, view.points, view.margin) }
    }
    const ease = first ? 1 : 1 - Math.exp(-dt * 4)
    first = false
    camTarget.lerp(fitted.target, ease)
    camYawPitch.yaw += (fitted.yaw - camYawPitch.yaw) * ease
    camYawPitch.pitch += (fitted.pitch - camYawPitch.pitch) * ease
    camDistance += (fitted.distance - camDistance) * ease
    const sway = state?.focus == null ? Math.sin(now * 0.00025) * 0.025 : 0
    const yaw = camYawPitch.yaw + sway
    direction.set(Math.sin(yaw) * Math.cos(camYawPitch.pitch), Math.sin(camYawPitch.pitch), Math.cos(yaw) * Math.cos(camYawPitch.pitch))
    camera.position.copy(camTarget).addScaledVector(direction, camDistance)
    camera.lookAt(camTarget)

    // Shake the case on a strike, harder on the boom.
    if (state?.shakeKey && state.shakeKey !== shakeKey) {
      shakeKey = state.shakeKey
      shakeUntil = now + 520
      shakeAmp = 0.045
    }
    if (state?.boomKey && state.boomKey !== boomKey) {
      boomKey = state.boomKey
      shakeUntil = now + 950
      shakeAmp = 0.16
    }
    const shakeLeft = Math.max(0, shakeUntil - now) / 950
    caseGroup.position.set(
      (Math.random() - 0.5) * shakeAmp * shakeLeft * 2,
      Math.abs(Math.random() - 0.5) * shakeAmp * shakeLeft,
      (Math.random() - 0.5) * shakeAmp * shakeLeft * 2,
    )
    if (shakeLeft > 0) camera.position.x += (Math.random() - 0.5) * shakeAmp * shakeLeft * 0.6

    const mood = state?.mood ?? "armed"
    const lampTarget = mood === "exploded" ? LAMP_INTENSITY * (0.25 + (Math.random() < 0.08 ? 0.4 : 0)) : LAMP_INTENSITY
    lamp.intensity += (lampTarget - lamp.intensity) * k
    hemi.intensity += ((mood === "exploded" ? 0.18 : 0.42) - hemi.intensity) * k

    for (const moduleView of views) moduleView.tick(now, k)
    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(animate)

  function update(next: BombSceneState) {
    const rebuildNeeded = next.layoutKey !== layoutKey
    state = next
    if (rebuildNeeded) {
      layoutKey = next.layoutKey
      rebuild(next)
    }
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
      renderer.domElement.removeEventListener("pointercancel", handlePointerCancel)
      for (const item of owned) item.dispose()
      for (const item of lampOwned) item.dispose()
      for (const item of disposables) item.dispose()
    } finally {
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }

  return { update, dispose }
}
