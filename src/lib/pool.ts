import type { BotLevel } from "./botLevel"

/**
 * 8-ball pool: table geometry, a fixed-step ball physics sim and the rules.
 * Shared by the server (which decides every shot) and the clients (which replay it).
 *
 * The sim only uses + - * / and Math.sqrt, which JavaScript defines exactly
 * (IEEE doubles, no fused ops), so every engine replays a shot to the same
 * bit. Anything needing sin/cos happens before the sim, on the server.
 *
 * Units are metres and seconds. x runs along the table (head/kitchen at -x),
 * y across it; the 3D scene maps sim y onto three.js z.
 */

export const BALL_R = 0.028575
export const TABLE_L = 2.24
export const TABLE_W = 1.12
const HL = TABLE_L / 2
const HW = TABLE_W / 2
/** Cushion depth from the nose to the wooden rail. */
export const CUSHION_DEPTH = 0.05
export const HEAD_STRING_X = -TABLE_L / 4
export const HEAD_SPOT = { x: -TABLE_L / 4, y: 0 }
export const FOOT_SPOT = { x: TABLE_L / 4, y: 0 }
/** Distance from a corner to where its cushions end (a ~118mm mouth). */
const CORNER_CUT = 0.0834
/** Side pocket mouth width. */
const SIDE_GAP = 0.13

export type PoolGroup = "solids" | "stripes"
export type BallInHand = "kitchen" | "table"

export interface PoolBall {
  /** 0 is the cue ball. */
  n: number
  x: number
  y: number
  down: boolean
}

export interface PoolPocket {
  x: number
  y: number
  /** A ball whose centre comes this close drops. */
  capture: number
  /** Radius of the hole drawn on the cloth. */
  hole: number
  /** Where bots and the auto-call aim. */
  aimX: number
  aimY: number
  corner: boolean
}

/** Order: top-left, top-middle, top-right, bottom-left, bottom-middle, bottom-right (y down on screen). */
export const POCKETS: PoolPocket[] = [
  corner(-1, -1),
  side(-1),
  corner(1, -1),
  corner(-1, 1),
  side(1),
  corner(1, 1),
]

function corner(sx: number, sy: number): PoolPocket {
  return {
    x: sx * (HL + 0.012), y: sy * (HW + 0.012), capture: 0.06, hole: 0.062,
    aimX: sx * (HL - 0.022), aimY: sy * (HW - 0.022), corner: true,
  }
}

function side(sy: number): PoolPocket {
  return { x: 0, y: sy * (HW + 0.035), capture: 0.055, hole: 0.062, aimX: 0, aimY: sy * (HW + 0.004), corner: false }
}

export const POCKET_NAMES = ["top-left corner", "top side", "top-right corner", "bottom-left corner", "bottom side", "bottom-right corner"]

interface Vec { x: number; y: number }

/** One cushion: the nose from p to q, with jaw faces running back to the rail. */
export interface Cushion { p: Vec; q: Vec; jawP: Vec; jawQ: Vec }

const B = CUSHION_DEPTH
export const CUSHIONS: Cushion[] = [
  ...[-1, 1].flatMap((sy) => [
    { p: { x: -HL + CORNER_CUT, y: sy * HW }, q: { x: -SIDE_GAP / 2, y: sy * HW }, jawP: { x: -B, y: sy * B }, jawQ: { x: 0, y: sy * B } },
    { p: { x: SIDE_GAP / 2, y: sy * HW }, q: { x: HL - CORNER_CUT, y: sy * HW }, jawP: { x: 0, y: sy * B }, jawQ: { x: B, y: sy * B } },
  ]),
  ...[-1, 1].map((sx) => ({
    p: { x: sx * HL, y: -HW + CORNER_CUT }, q: { x: sx * HL, y: HW - CORNER_CUT }, jawP: { x: sx * B, y: -B }, jawQ: { x: sx * B, y: B },
  })),
]

interface Segment { ax: number; ay: number; bx: number; by: number }

const SEGMENTS: Segment[] = CUSHIONS.flatMap(({ p, q, jawP, jawQ }) => [
  { ax: p.x, ay: p.y, bx: q.x, by: q.y },
  { ax: p.x, ay: p.y, bx: p.x + jawP.x, by: p.y + jawP.y },
  { ax: q.x, ay: q.y, bx: q.x + jawQ.x, by: q.y + jawQ.y },
])

// ─── Balls ──────────────────────────────────────────────────────────────

export function groupOf(n: number): PoolGroup | null {
  if (n >= 1 && n <= 7) return "solids"
  if (n >= 9 && n <= 15) return "stripes"
  return null
}

export function otherGroup(group: PoolGroup): PoolGroup {
  return group === "solids" ? "stripes" : "solids"
}

export function groupBalls(group: PoolGroup): number[] {
  return group === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]
}

export function isOnEight(balls: PoolBall[], group: PoolGroup | null): boolean {
  if (!group) return false
  return balls.every((ball) => groupOf(ball.n) !== group || ball.down)
}

/** Balls the shooter may hit first. */
export function legalTargets(balls: PoolBall[], group: PoolGroup | null, isBreak: boolean): number[] {
  const up = balls.filter((ball) => !ball.down && ball.n !== 0).map((ball) => ball.n)
  if (isBreak) return up
  if (!group) return up.filter((n) => n !== 8)
  if (isOnEight(balls, group)) return up.filter((n) => n === 8)
  return up.filter((n) => groupOf(n) === group)
}

/** A fresh triangle: 1 on the apex, 8 in the middle, one of each group in the back corners. */
export function rackBalls(random: () => number = Math.random): PoolBall[] {
  const shuffle = <T,>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }
  const solids = shuffle([2, 3, 4, 5, 6, 7])
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15])
  const cornerSolid = solids.pop()!
  const cornerStripe = stripes.pop()!
  const rest = shuffle([...solids, ...stripes])
  const order: number[] = []
  const solidLeft = random() < 0.5
  for (let slot = 0; slot < 15; slot++) {
    if (slot === 0) order.push(1)
    else if (slot === 4) order.push(8)
    else if (slot === 10) order.push(solidLeft ? cornerSolid : cornerStripe)
    else if (slot === 14) order.push(solidLeft ? cornerStripe : cornerSolid)
    else order.push(rest.pop()!)
  }
  const gap = 0.0002
  const balls: PoolBall[] = [{ n: 0, x: HEAD_SPOT.x, y: HEAD_SPOT.y, down: false }]
  let slot = 0
  for (let row = 0; row < 5; row++) {
    for (let j = 0; j <= row; j++) {
      balls.push({
        n: order[slot++],
        x: FOOT_SPOT.x + row * Math.sqrt(3) * (BALL_R + gap / 2),
        y: (j - row / 2) * (2 * BALL_R + gap),
        down: false,
      })
    }
  }
  return balls
}

export function isValidPlacement(balls: PoolBall[], x: number, y: number, area: BallInHand): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  if (Math.abs(x) > HL - BALL_R || Math.abs(y) > HW - BALL_R) return false
  if (area === "kitchen" && x > HEAD_STRING_X) return false
  return balls.every((ball) => ball.n === 0 || ball.down || (ball.x - x) ** 2 + (ball.y - y) ** 2 >= (2 * BALL_R) ** 2)
}

/** Clamp a dragged cue ball into the allowed area (overlaps are checked separately). */
export function clampPlacement(x: number, y: number, area: BallInHand): Vec {
  const maxX = area === "kitchen" ? HEAD_STRING_X : HL - BALL_R
  return {
    x: Math.min(maxX, Math.max(-HL + BALL_R, x)),
    y: Math.min(HW - BALL_R, Math.max(-HW + BALL_R, y)),
  }
}

export function defaultCueSpot(balls: PoolBall[], area: BallInHand): Vec {
  const cue = balls.find((ball) => ball.n === 0)
  if (cue && !cue.down && isValidPlacement(balls, cue.x, cue.y, area)) return { x: cue.x, y: cue.y }
  for (let ring = 0; ring < 40; ring++) {
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2
      const x = HEAD_SPOT.x + Math.cos(angle) * ring * BALL_R
      const y = HEAD_SPOT.y + Math.sin(angle) * ring * BALL_R
      if (isValidPlacement(balls, x, y, area)) return { x, y }
    }
  }
  return { ...HEAD_SPOT }
}

/** Put the 8 back on the foot spot, or the nearest free point behind it. */
export function respotEight(balls: PoolBall[]): PoolBall[] {
  const others = balls.filter((ball) => ball.n !== 8 && !ball.down)
  let x = FOOT_SPOT.x
  while (x < HL - BALL_R && others.some((ball) => (ball.x - x) ** 2 + ball.y ** 2 < (2 * BALL_R) ** 2)) x += 0.002
  return balls.map((ball) => (ball.n === 8 ? { n: 8, x, y: 0, down: false } : ball))
}

// ─── Physics ────────────────────────────────────────────────────────────

export interface ShotInput {
  /** Unit aim vector. */
  dirX: number
  dirY: number
  /** Cue ball speed in m/s. */
  speed: number
  /** Cue tip offset across the ball, -1 (left) to 1 (right). */
  spinX: number
  /** Cue tip offset up the ball, -1 (draw) to 1 (follow). */
  spinY: number
}

export type ShotEvent =
  | { t: number; kind: "hit"; a: number; b: number; speed: number }
  | { t: number; kind: "rail"; a: number; speed: number }
  | { t: number; kind: "pot"; a: number; pocket: number }

export interface SimResult {
  balls: PoolBall[]
  events: ShotEvent[]
  /** Seconds until every ball stopped. */
  duration: number
}

/** Per-sample view of the sim, for replays. `w*` are spins in velocity units (rolling when w = v). */
export interface SimSample {
  t: number
  x: Float64Array
  y: Float64Array
  wx: Float64Array
  wy: Float64Array
  wz: Float64Array
  down: Uint8Array
}

export const SIM_DT = 0.001
export const SAMPLE_EVERY = 16
const G = 9.81
const MU_SLIDE = 0.2
const MU_ROLL = 0.012
const MU_SPIN = 0.044
const BALL_E = 0.95
const RAIL_E = 0.78
const RAIL_MU = 0.2
const MAX_STEPS = 40000
const NEAR_EDGE = 0.1
export const MAX_SHOT_SPEED = 8
const MIN_SHOT_SPEED = 0.25

/** Power slider (0-1) to cue ball speed: fine control low down, a real break at the top. */
export function speedFromPower(power: number): number {
  const p = Math.min(1, Math.max(0, power))
  return MIN_SHOT_SPEED + (MAX_SHOT_SPEED - MIN_SHOT_SPEED) * p ** 1.5
}

export function powerFromSpeed(speed: number): number {
  const s = Math.min(MAX_SHOT_SPEED, Math.max(MIN_SHOT_SPEED, speed))
  return ((s - MIN_SHOT_SPEED) / (MAX_SHOT_SPEED - MIN_SHOT_SPEED)) ** (2 / 3)
}

/**
 * Runs a shot to rest. Balls slide (friction drags the contact point to
 * rolling), roll, spin on the spot, bounce off each other and the cushions,
 * and drop into pockets.
 */
export function simulateShot(start: PoolBall[], shot: ShotInput, onSample?: (sample: SimSample) => void): SimResult {
  const count = start.length
  const n = start.map((ball) => ball.n)
  const x = Float64Array.from(start, (ball) => ball.x)
  const y = Float64Array.from(start, (ball) => ball.y)
  const vx = new Float64Array(count)
  const vy = new Float64Array(count)
  const wx = new Float64Array(count)
  const wy = new Float64Array(count)
  const wz = new Float64Array(count)
  const down = Uint8Array.from(start, (ball) => (ball.down ? 1 : 0))
  const moving = new Uint8Array(count)
  const events: ShotEvent[] = []

  const cue = n.indexOf(0)
  if (cue >= 0 && !down[cue]) {
    let sx = shot.spinX
    let sy = shot.spinY
    const tip = Math.sqrt(sx * sx + sy * sy)
    if (tip > 1) {
      sx /= tip
      sy /= tip
    }
    // The tip can land up to half a radius off centre.
    const side = sx * 0.5
    const height = sy * 0.5
    vx[cue] = shot.dirX * shot.speed
    vy[cue] = shot.dirY * shot.speed
    wx[cue] = 2.5 * height * vx[cue]
    wy[cue] = 2.5 * height * vy[cue]
    wz[cue] = (-2.5 * side * shot.speed) / BALL_R
    moving[cue] = 1
  }

  const slideStep = MU_SLIDE * G * SIM_DT
  const rollStep = MU_ROLL * G * SIM_DT
  const spinStep = ((5 * MU_SPIN * G) / (2 * BALL_R)) * SIM_DT
  const minDist2 = 4 * BALL_R * BALL_R
  const sample: SimSample = { t: 0, x, y, wx, wy, wz, down }
  let step = 0

  for (; step < MAX_STEPS; step++) {
    let anyMoving = false
    for (let i = 0; i < count; i++) {
      if (!moving[i] || down[i]) continue
      const ux = vx[i] - wx[i]
      const uy = vy[i] - wy[i]
      const slip = Math.sqrt(ux * ux + uy * uy)
      if (slip > 3.5 * slideStep) {
        // Sliding: friction opposes the contact point's slip.
        const ax = (-ux / slip) * slideStep
        const ay = (-uy / slip) * slideStep
        vx[i] += ax
        vy[i] += ay
        wx[i] -= 2.5 * ax
        wy[i] -= 2.5 * ay
      } else {
        if (slip > 0) {
          vx[i] -= ux / 3.5
          vy[i] -= uy / 3.5
        }
        const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i])
        if (speed <= rollStep) {
          vx[i] = 0
          vy[i] = 0
        } else {
          vx[i] -= (vx[i] / speed) * rollStep
          vy[i] -= (vy[i] / speed) * rollStep
        }
        wx[i] = vx[i]
        wy[i] = vy[i]
      }
      if (wz[i] > spinStep) wz[i] -= spinStep
      else if (wz[i] < -spinStep) wz[i] += spinStep
      else wz[i] = 0
      if (vx[i] === 0 && vy[i] === 0 && wx[i] === 0 && wy[i] === 0) {
        moving[i] = 0
        wz[i] = 0
        continue
      }
      x[i] += vx[i] * SIM_DT
      y[i] += vy[i] * SIM_DT
      anyMoving = true
    }
    if (!anyMoving) break
    const t = (step + 1) * SIM_DT

    // Ball on ball: equal masses swap the velocity along the line of centres; spin carries on.
    for (let i = 0; i < count; i++) {
      if (down[i]) continue
      for (let j = i + 1; j < count; j++) {
        if (down[j] || (!moving[i] && !moving[j])) continue
        const dx = x[j] - x[i]
        const dy = y[j] - y[i]
        const d2 = dx * dx + dy * dy
        if (d2 >= minDist2 || d2 === 0) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const ny = dy / d
        const closing = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny
        const push = (2 * BALL_R - d) / 2
        x[i] -= nx * push
        y[i] -= ny * push
        x[j] += nx * push
        y[j] += ny * push
        if (closing <= 0) continue
        const impulse = ((1 + BALL_E) / 2) * closing
        vx[i] -= impulse * nx
        vy[i] -= impulse * ny
        vx[j] += impulse * nx
        vy[j] += impulse * ny
        moving[i] = 1
        moving[j] = 1
        events.push({ t, kind: "hit", a: n[i], b: n[j], speed: closing })
      }
    }

    for (let i = 0; i < count; i++) {
      if (!moving[i] || down[i]) continue
      const px = x[i]
      const py = y[i]
      if (Math.abs(px) < HL - BALL_R - NEAR_EDGE && Math.abs(py) < HW - BALL_R - NEAR_EDGE) continue

      // Pockets first: a ball deep in the jaws is gone.
      let potted = -1
      for (let k = 0; k < POCKETS.length; k++) {
        const pocket = POCKETS[k]
        const dx = px - pocket.x
        const dy = py - pocket.y
        if (dx * dx + dy * dy < pocket.capture * pocket.capture) {
          potted = k
          break
        }
      }
      if (potted >= 0) {
        down[i] = 1
        moving[i] = 0
        vx[i] = vy[i] = wx[i] = wy[i] = wz[i] = 0
        events.push({ t, kind: "pot", a: n[i], pocket: potted })
        continue
      }

      // Cushions are capsules around their segments, so knuckles round off naturally.
      for (const segment of SEGMENTS) {
        const sx = segment.bx - segment.ax
        const sy = segment.by - segment.ay
        const length2 = sx * sx + sy * sy
        let along = ((x[i] - segment.ax) * sx + (y[i] - segment.ay) * sy) / length2
        along = along < 0 ? 0 : along > 1 ? 1 : along
        const dx = x[i] - (segment.ax + sx * along)
        const dy = y[i] - (segment.ay + sy * along)
        const d2 = dx * dx + dy * dy
        if (d2 >= BALL_R * BALL_R || d2 === 0) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const ny = dy / d
        x[i] += nx * (BALL_R - d)
        y[i] += ny * (BALL_R - d)
        const vn = vx[i] * nx + vy[i] * ny
        if (vn >= 0) continue
        const tx = -ny
        const ty = nx
        const vt = vx[i] * tx + vy[i] * ty
        // Side spin grips the cushion: friction works against the contact point's slip.
        const slip = vt - BALL_R * wz[i]
        const normalImpulse = (1 + RAIL_E) * -vn
        const limit = Math.min(RAIL_MU * normalImpulse, Math.abs(slip) / 3.5)
        const jt = slip > 0 ? -limit : slip < 0 ? limit : 0
        const vnOut = -RAIL_E * vn
        vx[i] = nx * vnOut + tx * (vt + jt)
        vy[i] = ny * vnOut + ty * (vt + jt)
        wz[i] -= (2.5 * jt) / BALL_R
        // The nose sits above centre, so the roll into the cushion mostly turns over.
        const wn = wx[i] * nx + wy[i] * ny
        wx[i] += nx * (0.3 * vnOut - wn)
        wy[i] += ny * (0.3 * vnOut - wn)
        events.push({ t, kind: "rail", a: n[i], speed: -vn })
      }
    }

    if (onSample && (step + 1) % SAMPLE_EVERY === 0) {
      sample.t = t
      onSample(sample)
    }
  }

  const duration = step * SIM_DT
  if (onSample) {
    sample.t = duration
    onSample(sample)
  }
  return {
    balls: start.map((ball, i) => ({ n: ball.n, x: x[i], y: y[i], down: down[i] === 1 })),
    events,
    duration,
  }
}

// ─── Rules ──────────────────────────────────────────────────────────────

export interface ShotContext {
  group: PoolGroup | null
  isBreak: boolean
  /** Pocket called for the 8; null accepts any. */
  calledPocket: number | null
}

export interface Judgement {
  foul: "scratch" | "no-hit" | "wrong-ball" | "no-rail" | null
  /** Object balls in the order they dropped. */
  potted: number[]
  scratch: boolean
  firstHit: number | null
  /** Group the shooter gets from this shot, if the table was open. */
  assigned: PoolGroup | null
  eight: "none" | "win" | "lose" | "respot"
  continueTurn: boolean
}

export const FOUL_TEXT: Record<NonNullable<Judgement["foul"]>, string> = {
  scratch: "scratched",
  "no-hit": "missed every ball",
  "wrong-ball": "hit the wrong ball first",
  "no-rail": "hit nothing to a cushion",
}

export function judgeShot(before: PoolBall[], result: SimResult, context: ShotContext): Judgement {
  const pots = result.events.filter((event): event is Extract<ShotEvent, { kind: "pot" }> => event.kind === "pot")
  const scratch = pots.some((event) => event.a === 0)
  const potted = pots.filter((event) => event.a !== 0).map((event) => event.a)
  const contact = result.events.find((event) => event.kind === "hit" && (event.a === 0 || event.b === 0))
  const firstHit = contact && contact.kind === "hit" ? (contact.a === 0 ? contact.b : contact.a) : null
  const railAfter = contact ? result.events.some((event) => event.kind === "rail" && event.t >= contact.t) : false
  const targets = legalTargets(before, context.group, context.isBreak)
  const onEight = isOnEight(before, context.group)

  let foul: Judgement["foul"] = null
  if (scratch) foul = "scratch"
  else if (firstHit === null) foul = "no-hit"
  else if (!context.isBreak && !targets.includes(firstHit)) foul = "wrong-ball"
  else if (!context.isBreak && potted.length === 0 && !railAfter) foul = "no-rail"

  let eight: Judgement["eight"] = "none"
  const eightPot = pots.find((event) => event.a === 8)
  if (eightPot) {
    if (context.isBreak) eight = "respot"
    else if (onEight && !foul && (context.calledPocket === null || context.calledPocket === eightPot.pocket)) eight = "win"
    else eight = "lose"
  }

  let assigned: PoolGroup | null = null
  if (!context.group && !context.isBreak && !foul) {
    const first = potted.find((ball) => groupOf(ball) !== null)
    if (first !== undefined) assigned = groupOf(first)
  }
  const group = context.group ?? assigned
  const continueTurn =
    !foul &&
    eight !== "win" &&
    eight !== "lose" &&
    (context.isBreak ? potted.length > 0 : potted.some((ball) => group !== null && groupOf(ball) === group))

  return { foul, potted, scratch, firstHit, assigned, eight, continueTurn }
}

// ─── Aiming ─────────────────────────────────────────────────────────────

export interface AimTrace {
  /** Where the cue ball's centre ends up when it first touches something. */
  x: number
  y: number
  /** The ball it hits first, if any. */
  ball: number | null
  /** Direction the object ball leaves in, and how full the hit is (1 = dead on). */
  objectDir: Vec | null
  fullness: number
  /** Tangent line the cue ball takes off a stun hit. */
  cueDir: Vec | null
}

/** Ghost-ball trace for the aiming guide: the first ball or cushion along the line. */
export function traceAim(balls: PoolBall[], from: Vec, dir: Vec): AimTrace {
  let best = Infinity
  let hit: PoolBall | null = null
  for (const ball of balls) {
    if (ball.down || ball.n === 0) continue
    const fx = ball.x - from.x
    const fy = ball.y - from.y
    const along = fx * dir.x + fy * dir.y
    if (along <= 0) continue
    const perp2 = fx * fx + fy * fy - along * along
    const reach = 4 * BALL_R * BALL_R
    if (perp2 >= reach) continue
    const t = along - Math.sqrt(reach - perp2)
    if (t < best) {
      best = t
      hit = ball
    }
  }
  const limitX = HL - BALL_R
  const limitY = HW - BALL_R
  const tx = dir.x > 0 ? (limitX - from.x) / dir.x : dir.x < 0 ? (-limitX - from.x) / dir.x : Infinity
  const ty = dir.y > 0 ? (limitY - from.y) / dir.y : dir.y < 0 ? (-limitY - from.y) / dir.y : Infinity
  const wall = Math.max(0, Math.min(tx, ty))
  if (!hit || best > wall) {
    return { x: from.x + dir.x * wall, y: from.y + dir.y * wall, ball: null, objectDir: null, fullness: 0, cueDir: null }
  }
  const gx = from.x + dir.x * Math.max(0, best)
  const gy = from.y + dir.y * Math.max(0, best)
  const ox = hit.x - gx
  const oy = hit.y - gy
  const length = Math.sqrt(ox * ox + oy * oy) || 1
  const objectDir = { x: ox / length, y: oy / length }
  const fullness = Math.max(0, dir.x * objectDir.x + dir.y * objectDir.y)
  const cx = dir.x - objectDir.x * fullness
  const cy = dir.y - objectDir.y * fullness
  const cueLength = Math.sqrt(cx * cx + cy * cy)
  return {
    x: gx, y: gy, ball: hit.n, objectDir, fullness,
    cueDir: cueLength > 0.02 ? { x: cx / cueLength, y: cy / cueLength } : null,
  }
}

/** The pocket an object ball heading along `dir` from `from` is closest to entering. */
export function pocketAlong(from: Vec, dir: Vec): number {
  let best = 0
  let bestScore = -Infinity
  POCKETS.forEach((pocket, index) => {
    const px = pocket.aimX - from.x
    const py = pocket.aimY - from.y
    const length = Math.sqrt(px * px + py * py) || 1
    const score = (px * dir.x + py * dir.y) / length
    if (score > bestScore) {
      bestScore = score
      best = index
    }
  })
  return best
}

// ─── Bots ───────────────────────────────────────────────────────────────

export interface BotContext {
  group: PoolGroup | null
  isBreak: boolean
  ballInHand: BallInHand | null
  level: BotLevel
}

export interface PlannedShot {
  dirX: number
  dirY: number
  power: number
  spinX: number
  spinY: number
  /** Cue ball placement when the bot has ball in hand. */
  cue: Vec | null
  pocket: number | null
}

const BOT_TUNING: Record<BotLevel, { tries: number; powers: number[]; spins: number[]; aimNoise: number; powerNoise: number }> = {
  easy: { tries: 3, powers: [1], spins: [0], aimNoise: 1.6, powerNoise: 0.08 },
  normal: { tries: 6, powers: [1, 1.35], spins: [0], aimNoise: 0.55, powerNoise: 0.04 },
  hard: { tries: 9, powers: [1, 1.35], spins: [0, -0.45], aimNoise: 0.15, powerNoise: 0.015 },
}

function gaussian(random: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, random()))) * Math.cos(2 * Math.PI * random())
}

function pathClear(balls: PoolBall[], from: Vec, to: Vec, ignore: number[]): boolean {
  const sx = to.x - from.x
  const sy = to.y - from.y
  const length2 = sx * sx + sy * sy || 1
  return balls.every((ball) => {
    if (ball.down || ignore.includes(ball.n)) return true
    const along = Math.min(1, Math.max(0, ((ball.x - from.x) * sx + (ball.y - from.y) * sy) / length2))
    const dx = ball.x - (from.x + sx * along)
    const dy = ball.y - (from.y + sy * along)
    return dx * dx + dy * dy >= (2 * BALL_R - 0.002) ** 2
  })
}

interface Candidate { cue: Vec; dir: Vec; speed: number; score: number; target: number; pocket: number }

function potCandidates(balls: PoolBall[], cue: Vec, targets: number[]): Candidate[] {
  const candidates: Candidate[] = []
  for (const target of targets) {
    const ball = balls.find((other) => other.n === target)
    if (!ball || ball.down) continue
    POCKETS.forEach((pocket, index) => {
      const px = pocket.aimX - ball.x
      const py = pocket.aimY - ball.y
      const toPocket = Math.sqrt(px * px + py * py)
      if (toPocket < 0.001) return
      const ux = px / toPocket
      const uy = py / toPocket
      // Side pockets refuse shallow approaches; corners refuse balls coming along the wrong rail.
      if (!pocket.corner && Math.abs(uy) < 0.55) return
      if (pocket.corner && (ux * Math.sign(pocket.x) + uy * Math.sign(pocket.y)) / Math.SQRT2 < 0.35) return
      const ghost = { x: ball.x - ux * 2 * BALL_R, y: ball.y - uy * 2 * BALL_R }
      const cx = ghost.x - cue.x
      const cy = ghost.y - cue.y
      const toGhost = Math.sqrt(cx * cx + cy * cy)
      if (toGhost < 0.001) return
      const dir = { x: cx / toGhost, y: cy / toGhost }
      const cut = dir.x * ux + dir.y * uy
      if (cut < 0.25) return
      if (!pathClear(balls, cue, ghost, [0, target])) return
      if (!pathClear(balls, { x: ball.x, y: ball.y }, { x: pocket.aimX, y: pocket.aimY }, [0, target])) return
      const objectSpeed = Math.sqrt(2 * MU_ROLL * G * toPocket) + 0.55
      const contactSpeed = objectSpeed / (cut * 0.975)
      const speed = Math.min(6, Math.max(0.6, Math.sqrt(contactSpeed * contactSpeed + 2 * MU_ROLL * G * toGhost) * 1.15 + 0.15))
      candidates.push({ cue, dir, speed, score: (cut * cut) / (1 + 0.6 * toGhost + toPocket), target, pocket: index })
    })
  }
  return candidates
}

function placementsFor(balls: PoolBall[], targets: number[], area: BallInHand): Vec[] {
  const spots: Vec[] = []
  for (const target of targets) {
    const ball = balls.find((other) => other.n === target)
    if (!ball || ball.down) continue
    for (const pocket of POCKETS) {
      const px = pocket.aimX - ball.x
      const py = pocket.aimY - ball.y
      const length = Math.sqrt(px * px + py * py) || 1
      for (const back of [0.2, 0.32]) {
        const x = ball.x - (px / length) * (2 * BALL_R + back)
        const y = ball.y - (py / length) * (2 * BALL_R + back)
        if (isValidPlacement(balls, x, y, area)) spots.push({ x, y })
      }
    }
  }
  return spots
}

function withCue(balls: PoolBall[], cue: Vec): PoolBall[] {
  return balls.map((ball) => (ball.n === 0 ? { n: 0, x: cue.x, y: cue.y, down: false } : ball))
}

/** Picks the bot's shot: geometric pot candidates, checked against the real sim, then aimed with level-sized noise. */
export function chooseBotShot(balls: PoolBall[], context: BotContext, random: () => number = Math.random): PlannedShot {
  const tuning = BOT_TUNING[context.level]
  const finish = (dir: Vec, speed: number, spinY: number, cue: Vec | null, pocket: number | null): PlannedShot => {
    const angle = Math.atan2(dir.y, dir.x) + (gaussian(random) * tuning.aimNoise * Math.PI) / 180
    const power = Math.min(1, Math.max(0.03, powerFromSpeed(speed) * (1 + gaussian(random) * tuning.powerNoise)))
    return { dirX: Math.cos(angle), dirY: Math.sin(angle), power, spinX: 0, spinY, cue, pocket }
  }

  const cueBall = balls.find((ball) => ball.n === 0)
  if (context.isBreak) {
    const cue = { x: HEAD_SPOT.x, y: (random() - 0.5) * 0.25 }
    const dx = FOOT_SPOT.x - cue.x
    const dy = FOOT_SPOT.y - cue.y
    const length = Math.sqrt(dx * dx + dy * dy)
    return finish({ x: dx / length, y: dy / length }, context.level === "easy" ? 6 : 7.6, 0, cue, null)
  }

  const targets = legalTargets(balls, context.group, false)
  const cues: Vec[] = context.ballInHand
    ? [defaultCueSpot(balls, context.ballInHand), ...placementsFor(balls, targets, context.ballInHand)]
    : cueBall && !cueBall.down
      ? [{ x: cueBall.x, y: cueBall.y }]
      : [defaultCueSpot(balls, "table")]

  const candidates = cues.flatMap((cue) => potCandidates(withCue(balls, cue), cue, targets)).sort((a, b) => b.score - a.score)
  for (const candidate of candidates.slice(0, tuning.tries)) {
    const start = withCue(balls, candidate.cue)
    for (const spinY of tuning.spins) {
      for (const scale of tuning.powers) {
        const speed = Math.min(MAX_SHOT_SPEED, candidate.speed * scale)
        const result = simulateShot(start, { dirX: candidate.dir.x, dirY: candidate.dir.y, speed, spinX: 0, spinY })
        const judged = judgeShot(start, result, { group: context.group, isBreak: false, calledPocket: candidate.target === 8 ? candidate.pocket : null })
        if (judged.foul || judged.eight === "lose") continue
        if (judged.eight === "win" || judged.continueTurn) {
          return finish(candidate.dir, speed, spinY, context.ballInHand ? candidate.cue : null, candidate.target === 8 ? candidate.pocket : null)
        }
      }
    }
  }
  if (candidates.length > 0 && context.level !== "hard") {
    const best = candidates[0]
    return finish(best.dir, best.speed, 0, context.ballInHand ? best.cue : null, best.target === 8 ? best.pocket : null)
  }

  // No pot on: find any legal contact, softly, and prefer leaving no scratch.
  const cue = cues[0]
  const start = withCue(balls, cue)
  const options = targets
    .map((target) => start.find((ball) => ball.n === target))
    .filter((ball): ball is PoolBall => Boolean(ball))
  let fallback: PlannedShot | null = null
  for (let attempt = 0; attempt < 14 && options.length > 0; attempt++) {
    const ball = options[attempt % options.length]
    const spread = attempt < options.length ? 0 : (random() - 0.5) * 3.2 * BALL_R
    const dx = ball.x - cue.x + spread * (cue.y - ball.y > 0 ? 1 : -1)
    const dy = ball.y - cue.y + spread
    const length = Math.sqrt(dx * dx + dy * dy) || 1
    const dir = { x: dx / length, y: dy / length }
    const speed = 1.4 + random() * 1.2
    const result = simulateShot(start, { dirX: dir.x, dirY: dir.y, speed, spinX: 0, spinY: 0 })
    const judged = judgeShot(start, result, { group: context.group, isBreak: false, calledPocket: null })
    const shot = { ...finish(dir, speed, 0, context.ballInHand ? cue : null, null) }
    if (!judged.foul && judged.eight !== "lose") return shot
    fallback ??= shot
  }
  return fallback ?? finish({ x: 1, y: 0 }, 2, 0, context.ballInHand ? cue : null, null)
}
