import { Bot, Camera, ChevronLeft, ChevronRight, Crosshair, Hand, RotateCcw, ScrollText, Trophy } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { GameErrorBoundary } from "@/components/GameErrorBoundary"
import { GLASS, GlassButton, PartyTable, SidePanel, TableTopBar, TimerRing, useBeat, useNow, useSoundCue } from "@/components/games/party-shell/shell"
import { ProfileBadge } from "@/components/multiplayer/ProfileBadge"
import { ReactionBubble, type ReactionBubbles } from "@/components/multiplayer/Reactions"
import { useProfile } from "@/lib/account"
import {
  BALL_R,
  clampPlacement,
  defaultCueSpot,
  groupBalls,
  isOnEight,
  isValidPlacement,
  legalTargets,
  pocketAlong,
  POCKET_NAMES,
  traceAim,
  type PoolBall,
  type PoolGroup,
  type ShotEvent,
} from "@/lib/pool"
import type { Reaction } from "@/lib/reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { ballHex, pickBallSet, pickCloth, pickCue, type BallSet } from "../../../../convex/poolCosmetics"
import type { AimMessage, PublicGameState } from "../../../../party/pool"
import { createPoolScene, type PoolScene, type PoolSceneHandlers, type PoolSceneState } from "./poolScene"
import type { PoolAimCommand, PoolShotCommand } from "./useMultiplayerPool"

interface PoolGameProps {
  game: PublicGameState
  playerId: string
  roomLabel: string
  connected: boolean
  error: string | null
  clockOffset: number
  remoteAim: AimMessage | null
  reactions: ReactionBubbles
  isHost: boolean
  onReact: (reaction: Reaction) => void
  onAim: (turnId: number, aim: PoolAimCommand) => void
  onShoot: (turnId: number, shot: PoolShotCommand) => void
  onRestart: () => void
  onLeave: () => void
}

const CAMERA_KEY = "tsw-pool-camera"
const RESULT_MS = 3400
const NUDGE = (0.15 * Math.PI) / 180

function readCamera(): "top" | "cue" {
  try {
    const stored = localStorage.getItem(CAMERA_KEY)
    if (stored === "top" || stored === "cue") return stored
  } catch {}
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches ? "cue" : "top"
}

function PoolCanvas({ view, handlers }: { view: PoolSceneState; handlers: PoolSceneHandlers }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PoolScene | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let scene: PoolScene
    try {
      scene = createPoolScene(container, {
        onAimAt: (x, y) => handlersRef.current.onAimAt(x, y),
        onAimRotate: (radians) => handlersRef.current.onAimRotate(radians),
        onPlace: (x, y) => handlersRef.current.onPlace(x, y),
        onPocket: (index) => handlersRef.current.onPocket(index),
        onEvent: (event) => handlersRef.current.onEvent(event),
      })
    } catch {
      setFailed(true)
      return
    }
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    sceneRef.current?.update(view)
  })

  if (failed) {
    return <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/70">Your browser could not start 3D graphics, so the table can't be drawn.</div>
  }
  return <div ref={containerRef} className="absolute inset-0" />
}

function BallPip({ n, set, down, size = 18 }: { n: number; set: BallSet; down?: boolean; size?: number }) {
  const color = ballHex(set, n)
  const background = n >= 9 ? `linear-gradient(180deg, #f5f1e6 0 24%, ${color} 24% 76%, #f5f1e6 76%)` : color
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-full font-bold shadow-[inset_-2px_-3px_4px_rgba(0,0,0,.35)] transition", down && "scale-75 opacity-25")}
      style={{ width: size, height: size, background, fontSize: size * 0.48 }}
      aria-label={`${n} ball${down ? " (potted)" : ""}`}
    >
      <span className="grid size-[62%] place-items-center rounded-full bg-[#f8f5ec] leading-none text-black">{n}</span>
    </span>
  )
}

function PlayerPanel({ game, seat, align, balls, ballSet, reactions, active }: {
  game: PublicGameState
  ballSet: BallSet
  seat: number
  align: "left" | "right"
  balls: PoolBall[]
  reactions: ReactionBubbles
  active: boolean
}) {
  const id = game.seatOrder[seat]
  const player = id ? game.players[id] : null
  if (!player) return null
  const group = game.groups[seat]
  const onEight = isOnEight(balls, group)
  const eightDown = balls.find((ball) => ball.n === 8)?.down
  const wins = game.wins[player.id] ?? 0
  return (
    <div className={cn(GLASS, "relative w-[min(46vw,280px)] px-3 py-2 transition", active && "border-amber-300/70 bg-black/60 ring-2 ring-amber-300/40")}>
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse text-right")}>
        <span className={cn("size-2.5 shrink-0 rounded-full", active ? "animate-pulse bg-amber-300" : "bg-white/25")} />
        <p className="min-w-0 flex-1 truncate text-sm font-bold">
          {player.isBot && <Bot className="mr-1 inline size-3.5 -translate-y-px text-white/60" />}
          {player.name}
          {player.verified && <ProfileBadge profileId={player.profileId} color={player.color} className="ml-1 inline size-3.5 -translate-y-px" />}
          {player.connected === false && <span className="ml-1 text-xs font-normal text-amber-200">away</span>}
        </p>
        {wins > 0 && <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[11px] font-semibold text-white/80">{wins} {wins === 1 ? "rack" : "racks"}</span>}
      </div>
      <div className={cn("mt-1.5 flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        {group ? (
          <>
            {groupBalls(group).map((n) => <BallPip key={n} n={n} set={ballSet} down={balls.find((ball) => ball.n === n)?.down} size={17} />)}
            <span className="mx-0.5 h-4 w-px bg-white/20" />
            <span className={cn("rounded-full", onEight && !eightDown && "ring-2 ring-amber-300")}><BallPip n={8} set={ballSet} size={17} down={!onEight} /></span>
          </>
        ) : (
          <span className="text-xs text-white/60">{game.isBreak ? "Waiting for the break" : "Open table"}</span>
        )}
      </div>
      <ReactionBubble bubble={reactions[player.id]} side="bottom" />
    </div>
  )
}

function PowerBar({ pull, onPull, onRelease, disabled }: { pull: number; onPull: (pull: number) => void; onRelease: (pull: number) => void; disabled: boolean }) {
  const start = useRef<{ y: number; height: number; id: number } | null>(null)
  const latest = useRef(0)
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== event.pointerId) return
    latest.current = Math.min(1, Math.max(0, (event.clientY - start.current.y) / (start.current.height * 0.85)))
    onPull(latest.current)
  }
  return (
    <div
      role="slider"
      aria-label="Shot power: drag down and let go to shoot"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pull * 100)}
      aria-disabled={disabled}
      className={cn(GLASS, "relative flex h-[min(300px,42dvh,calc(100dvh-257px))] w-14 touch-none select-none flex-col items-center overflow-hidden p-1.5", disabled ? "opacity-40" : "cursor-grab active:cursor-grabbing")}
      onPointerDown={(event) => {
        if (disabled) return
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { y: event.clientY, height: event.currentTarget.clientHeight, id: event.pointerId }
        latest.current = 0
        onPull(0)
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (!start.current || start.current.id !== event.pointerId) return
        start.current = null
        onRelease(latest.current)
      }}
      onPointerCancel={() => {
        start.current = null
        onPull(0)
      }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Power</span>
      <div className="relative mt-1 w-full flex-1 overflow-hidden rounded-xl bg-white/5">
        <div className="absolute inset-x-0 top-0 rounded-xl" style={{ height: `${pull * 100}%`, background: "linear-gradient(180deg, #4ade80, #facc15 55%, #ef4444)" }} />
        {[0.25, 0.5, 0.75].map((mark) => <span key={mark} className="absolute inset-x-2 h-px bg-white/20" style={{ top: `${mark * 100}%` }} />)}
        <span className="absolute inset-x-0 bottom-2 text-center text-xs font-black tabular-nums">{Math.round(pull * 100)}</span>
      </div>
      <span className="mt-1 text-[10px] text-white/50">pull ↓</span>
    </div>
  )
}

function SpinPicker({ spin, onSpin, disabled }: { spin: { x: number; y: number }; onSpin: (spin: { x: number; y: number }) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const set = (event: ReactPointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    let x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    let y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    x /= 0.8
    y /= 0.8
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    onSpin({ x: Math.abs(x) < 0.08 ? 0 : x, y: Math.abs(y) < 0.08 ? 0 : y })
  }
  const label = spin.y > 0.15 ? "Follow" : spin.y < -0.15 ? "Draw" : "Centre"
  const side = spin.x > 0.15 ? " · right" : spin.x < -0.15 ? " · left" : ""
  return (
    <div className={cn(GLASS, "flex flex-col items-center gap-1 p-2", disabled && "opacity-40")}>
      <div
        ref={ref}
        role="group"
        aria-label={`Cue tip position: ${label}${side}`}
        className="relative size-20 touch-none rounded-full shadow-inner"
        style={{ background: "radial-gradient(circle at 38% 32%, #ffffff, #e9e4d6 55%, #b9b3a3)" }}
        onPointerDown={(event) => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          set(event)
        }}
        onPointerMove={(event) => {
          if (!disabled && event.buttons) set(event)
        }}
        onDoubleClick={() => !disabled && onSpin({ x: 0, y: 0 })}
      >
        <span className="absolute inset-x-2 top-1/2 h-px bg-black/15" />
        <span className="absolute inset-y-2 left-1/2 w-px bg-black/15" />
        <span className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 ring-2 ring-white shadow" style={{ left: `${50 + spin.x * 40}%`, top: `${50 - spin.y * 40}%` }} />
      </div>
      <button type="button" disabled={disabled} onClick={() => onSpin({ x: 0, y: 0 })} className="-mx-2 -mb-2 h-10 self-stretch rounded-b-2xl text-xs font-semibold text-white/70 hover:text-white">
        {label}{side}
      </button>
    </div>
  )
}

function NudgeButton({ direction, onNudge, disabled }: { direction: -1 | 1; onNudge: (amount: number) => void; disabled: boolean }) {
  const timer = useRef<number | null>(null)
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={direction < 0 ? "Fine aim left" : "Fine aim right"}
      className={cn(GLASS, "grid size-11 touch-none place-items-center transition hover:bg-black/65 disabled:opacity-40")}
      onPointerDown={() => {
        onNudge(direction * NUDGE)
        stop()
        timer.current = window.setInterval(() => onNudge(direction * NUDGE), 70)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {direction < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  )
}

export function PoolGame({ game, playerId, roomLabel, connected, error, clockOffset, remoteAim, reactions, isHost, onReact, onAim, onShoot, onRestart, onLeave }: PoolGameProps) {
  const [camera, setCamera] = useState<"top" | "cue">(readCamera)
  const [angle, setAngle] = useState(0)
  const [pull, setPull] = useState(0)
  const [spin, setSpin] = useState({ x: 0, y: 0 })
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null)
  const [called, setCalled] = useState<{ pocket: number; manual: boolean } | null>(null)
  const [sentTurn, setSentTurn] = useState<number | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [, rerender] = useState(0)
  const lastClack = useRef(0)

  const me = game.players[playerId]
  const { profile } = useProfile()
  const ballSet = pickBallSet(profile?.cosmetics.pool?.ballSet)
  const mySeat = me?.seat ?? null
  const playing = game.status === "playing"
  /** It's this player's shot; `myTurn` drops once the shot is sent, while `mine` holds until the balls roll. */
  const mine = playing && game.phase === "aim" && mySeat !== null && mySeat === game.turnSeat
  const myTurn = mine && sentTurn !== game.turnId
  const shooter = game.seatOrder[game.turnSeat] ? game.players[game.seatOrder[game.turnSeat]!] : null
  const myGroup: PoolGroup | null = mySeat !== null ? game.groups[mySeat] : null

  // Replay the last shot until it has finished rolling on this screen.
  const shot = game.shot
  const replayEnd = shot ? shot.startedAt - clockOffset + shot.durationMs + 150 : 0
  const replaying = Boolean(shot && (game.phase === "rolling" || Date.now() < replayEnd))
  useEffect(() => {
    if (!replaying || game.phase === "rolling") return
    const timer = window.setTimeout(() => rerender((n) => n + 1), Math.max(0, replayEnd - Date.now()) + 20)
    return () => window.clearTimeout(timer)
  }, [replaying, replayEnd, game.phase])
  const playback = useMemo(
    () =>
      replaying && shot
        ? {
            key: `${game.rack}:${shot.id}`,
            before: shot.before,
            shot: { dirX: shot.dirX, dirY: shot.dirY, speed: shot.speed, spinX: shot.spinX, spinY: shot.spinY },
            startedAt: shot.startedAt - clockOffset,
          }
        : null,
    // clockOffset drifts a little with every state; the key pins the replay.
    [replaying, shot?.id, game.rack],
  )
  const balls = playback ? playback.before : game.balls
  const cueBall = balls.find((ball) => ball.n === 0)
  const area = game.ballInHand

  // A fresh turn of your own: aim at something sensible and reset the controls.
  useEffect(() => {
    if (!mine) return
    setPull(0)
    setSpin({ x: 0, y: 0 })
    setCalled(null)
    const start = area ? defaultCueSpot(game.balls, area) : cueBall ? { x: cueBall.x, y: cueBall.y } : defaultCueSpot(game.balls, "table")
    setPlace(area ? start : null)
    const targets = legalTargets(game.balls, myGroup, game.isBreak)
    let aimAt = game.isBreak ? { x: 0.56, y: 0 } : null
    let best = Infinity
    for (const ball of game.balls) {
      if (game.isBreak || !targets.includes(ball.n)) continue
      const distance = Math.hypot(ball.x - start.x, ball.y - start.y)
      if (distance < best) {
        best = distance
        aimAt = { x: ball.x, y: ball.y }
      }
    }
    if (aimAt) setAngle(Math.atan2(aimAt.y - start.y, aimAt.x - start.x))
  }, [mine, game.turnId])

  useEffect(() => setSentTurn(null), [error])
  // A shot the server never took (a stale turn): hand the controls back.
  useEffect(() => {
    if (sentTurn === null || sentTurn !== game.turnId || game.phase !== "aim") return
    const timer = window.setTimeout(() => setSentTurn(null), 4000)
    return () => window.clearTimeout(timer)
  }, [sentTurn, game.turnId, game.phase])

  const placement = mine && area && place ? place : null
  const placementValid = placement && area ? isValidPlacement(game.balls, placement.x, placement.y, area) : true
  const cueSpot = placement ?? (cueBall && !cueBall.down ? { x: cueBall.x, y: cueBall.y } : null)
  const dir = { x: Math.cos(angle), y: Math.sin(angle) }
  const targets = myTurn ? legalTargets(game.balls, myGroup, game.isBreak) : []
  const trace = myTurn && cueSpot ? traceAim(game.balls.map((ball) => (ball.n === 0 ? { ...ball, ...cueSpot, down: false } : ball)), cueSpot, dir) : null
  const mustCall = myTurn && !game.isBreak && isOnEight(game.balls, myGroup)

  // Auto-call the pocket the 8 is heading for, until a pocket is picked by hand.
  const eight = game.balls.find((ball) => ball.n === 8)
  const autoPocket = mustCall && trace?.ball === 8 && trace.objectDir && eight ? pocketAlong(eight, trace.objectDir) : null
  const calledPocket = mustCall ? (called?.manual ? called.pocket : (autoPocket ?? called?.pocket ?? null)) : null
  useEffect(() => {
    if (autoPocket !== null && !called?.manual && called?.pocket !== autoPocket) setCalled({ pocket: autoPocket, manual: false })
  }, [autoPocket, called])

  // Share the aim so the table can watch the cue line up.
  useEffect(() => {
    if (!myTurn) return
    onAim(game.turnId, { dirX: dir.x, dirY: dir.y, pull, spinX: spin.x, spinY: spin.y, ...(placement ? { x: placement.x, y: placement.y } : {}) })
  }, [myTurn, angle, pull, spin.x, spin.y, placement?.x, placement?.y])

  const shoot = useCallback((power: number) => {
    if (!myTurn || power < 0.03 || !cueSpot) {
      setPull(0)
      return
    }
    if (placement && !placementValid) {
      setPull(0)
      return
    }
    onShoot(game.turnId, {
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      power,
      spinX: spin.x,
      spinY: spin.y,
      ...(placement ? { x: placement.x, y: placement.y } : {}),
      ...(mustCall ? { pocket: calledPocket } : {}),
    })
    setSentTurn(game.turnId)
    setPull(0)
  }, [myTurn, cueSpot, placement, placementValid, onShoot, game.turnId, angle, spin, mustCall, calledPocket])

  // Keyboard: hold an arrow to turn (shift for fine, it speeds up the longer you hold),
  // hold space to draw the cue back and let go to shoot. Bound once per turn and read
  // `shoot` through a ref, so re-renders mid-charge can't cancel it.
  const shootRef = useRef(shoot)
  shootRef.current = shoot
  useEffect(() => {
    if (!myTurn) return
    let charge: number | null = null
    const held = { left: false, right: false, fine: false, since: 0 }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const turning = (held.right ? 1 : 0) - (held.left ? 1 : 0)
      if (turning !== 0) {
        const heldFor = (now - held.since) / 1000
        const degreesPerSecond = held.fine ? 2.5 : Math.min(40, 10 + heldFor * 25)
        setAngle((value) => value + (turning * degreesPerSecond * dt * Math.PI) / 180)
      }
      if (charge !== null) setPull(Math.min(1, (now - charge) / 1600))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const typing = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      return Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))
    }
    const down = (event: KeyboardEvent) => {
      if (typing(event)) return
      held.fine = event.shiftKey
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        if (!held.left && !held.right) held.since = performance.now()
        if (event.key === "ArrowLeft") held.left = true
        else held.right = true
      } else if (event.key === " ") {
        // Also stops a focused button from being clicked by the space bar.
        event.preventDefault()
        if (charge === null) charge = performance.now()
      } else if (event.key === "Escape" && charge !== null) {
        charge = null
        setPull(0)
      }
    }
    const up = (event: KeyboardEvent) => {
      held.fine = event.shiftKey
      if (event.key === "ArrowLeft") held.left = false
      else if (event.key === "ArrowRight") held.right = false
      else if (event.key === " ") {
        event.preventDefault()
        if (charge === null) return
        const power = Math.min(1, (performance.now() - charge) / 1600)
        charge = null
        shootRef.current(power)
      }
    }
    const reset = () => {
      held.left = held.right = false
      if (charge !== null) {
        charge = null
        setPull(0)
      }
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", reset)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", reset)
    }
  }, [myTurn])

  // Watching someone else: their live aim, or the bot lining up and drawing back before it plays.
  const botTurn = playing && game.phase === "aim" && Boolean(game.botAim)
  const now = useNow(botTurn || myTurn || (playing && game.phase === "aim"), botTurn ? 50 : 500)
  const serverNow = now + clockOffset
  const secondsLeft = game.turnDeadline ? Math.max(0, Math.ceil((game.turnDeadline - serverNow) / 1000)) : 0
  const remote = remoteAim && remoteAim.turnId === game.turnId && playing && game.phase === "aim" ? remoteAim : null
  const handSpot = area && cueBall?.down ? defaultCueSpot(game.balls, area) : null
  const watchedCue = game.botAim && game.botAim.x !== null && game.botAim.y !== null
    ? { x: game.botAim.x, y: game.botAim.y }
    : remote && remote.x !== null && remote.y !== null
      ? { x: remote.x, y: remote.y }
      : handSpot
  const displayCue = playback ? null : mine ? placement : watchedCue

  let cue: PoolSceneState["cue"] = null
  if (!playback && playing && game.phase === "aim") {
    const at = displayCue ?? (cueBall && !cueBall.down ? cueBall : null)
    // Once sent, the stick drives through to the ball while the shot comes back.
    if (at && mine) cue = { x: at.x, y: at.y, dirX: dir.x, dirY: dir.y, pull: myTurn ? pull : 0, spinX: spin.x, spinY: spin.y, smooth: false }
    else if (at && game.botAim) {
      const ramp = game.turnDeadline ? Math.min(1, Math.max(0, 1 - (game.turnDeadline - serverNow) / 1100)) : 0
      cue = { x: at.x, y: at.y, dirX: game.botAim.dirX, dirY: game.botAim.dirY, pull: Math.sin(ramp * Math.PI * 0.85) * 0.55, spinX: 0, spinY: game.botAim.spinY, smooth: true }
    } else if (at && remote) cue = { x: at.x, y: at.y, dirX: remote.dirX, dirY: remote.dirY, pull: remote.pull, spinX: remote.spinX, spinY: remote.spinY, smooth: true }
  }

  const view: PoolSceneState = {
    rackKey: `${game.roundId}`,
    balls: game.balls,
    playback,
    cueBall: displayCue,
    cue,
    guide: trace && cueSpot ? { from: cueSpot, trace, legal: trace.ball === null || targets.includes(trace.ball) } : null,
    targets,
    placing: mine && area ? { area, valid: placementValid } : null,
    pockets: { selectable: mustCall, called: playback ? null : calledPocket },
    camera,
    interactive: myTurn,
    look: {
      cue: pickCue(game.players[game.seatOrder[playback && shot ? shot.seat : game.turnSeat] ?? ""]?.cue),
      cloth: pickCloth(profile?.cosmetics.pool?.cloth),
      ballSet,
    },
  }

  const handlers: PoolSceneHandlers = {
    onAimAt: (x, y) => {
      if (!cueSpot) return
      const dx = x - cueSpot.x
      const dy = y - cueSpot.y
      if (Math.hypot(dx, dy) > BALL_R * 0.6) setAngle(Math.atan2(dy, dx))
    },
    onAimRotate: (radians) => setAngle((value) => value + radians),
    onPlace: (x, y) => {
      if (!area) return
      setPlace(clampPlacement(x, y, area))
    },
    onPocket: (index) => setCalled({ pocket: index, manual: true }),
    onEvent: (event: ShotEvent) => {
      if (event.kind === "hit") {
        const at = performance.now()
        if (at - lastClack.current < 28) return
        lastClack.current = at
        playSound(event.speed > 1.1 ? "clack" : "clackSoft")
      } else if (event.kind === "rail") {
        if (event.speed > 0.35) playSound("cushion")
      } else playSound("pocket")
    },
  }

  useSoundCue(playback?.key ?? null, () => playSound("cueHit"))
  useSoundCue(mine ? `turn-${game.turnId}` : null, () => playSound("turn"))
  useSoundCue(game.status === "finished" && game.winner ? `win-${game.rack}` : null, () => playSound(game.winner?.id === playerId ? "win" : "roundEnd"))

  const resultKey = !playback && game.result ? `${game.rack}:${game.result.shotId}` : null
  const resultAge = useBeat(resultKey, RESULT_MS)
  const showResult = resultKey !== null && resultAge < RESULT_MS && game.status === "playing"
  useSoundCue(showResult && game.result?.foul ? resultKey : null, () => playSound("wrong"))

  const toggleCamera = () => {
    const next = camera === "top" ? "cue" : "top"
    setCamera(next)
    try {
      localStorage.setItem(CAMERA_KEY, next)
    } catch {}
  }

  const spectating = !me
  const status = (() => {
    if (game.status === "finished") return <span className="truncate text-sm font-bold">{game.winner ? `${game.winner.name} wins the rack` : "Rack over"}</span>
    if (playback) return <span className="truncate text-sm font-semibold text-white/80">{shooter ? `${shooter.name}'s shot` : "Shot"} - balls rolling…</span>
    const label = mine
      ? game.isBreak ? "Your break" : area ? "Ball in hand" : isOnEight(game.balls, myGroup) ? "You're on the 8" : "Your shot"
      : `${shooter?.name ?? "Opponent"} ${game.isBreak ? "is breaking" : "is aiming"}…`
    const groupLabel = mine && myGroup ? ` · ${myGroup}` : ""
    return (
      <>
        {playing && game.turnDeadline && !game.botAim && <TimerRing left={secondsLeft} limit={60} />}
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{label}<span className="font-normal text-white/60">{groupLabel}</span></span>
      </>
    )
  })()

  const hint = (() => {
    if (!myTurn || playback) return null
    const parts: string[] = []
    if (area) parts.push(area === "kitchen" ? "Drag the cue ball anywhere behind the line" : "Drag the cue ball anywhere")
    parts.push(camera === "cue" && !area ? "Drag sideways to aim" : "Drag around the cue ball to aim, or tap a spot")
    parts.push("pull the power bar down and let go")
    return parts.join(" · ")
  })()

  const winnerIsMe = game.winner?.id === playerId
  const seated = [0, 1].map((seat) => game.seatOrder[seat]).filter(Boolean).length

  return (
    <PartyTable tableRef={null} background="radial-gradient(ellipse at 50% 40%, #16201b 0%, #07090a 70%)">
      <GameErrorBoundary><PoolCanvas view={view} handlers={handlers} /></GameErrorBoundary>

      <TableTopBar
        title="Pool"
        roomLabel={roomLabel}
        onLeave={onLeave}
        connected={connected}
        status={status}
        onReact={onReact}
        canReact={!spectating}
        actions={
          <>
            <GlassButton icon={camera === "top" ? <Crosshair className="size-4" /> : <Camera className="size-4" />} label={camera === "top" ? "Cue view" : "Top view"} onClick={toggleCamera} />
            <GlassButton icon={<ScrollText className="size-4" />} label="Log" pressed={logOpen} onClick={() => setLogOpen((open) => !open)} />
          </>
        }
      />

      <div className="pointer-events-none absolute inset-x-3 top-[68px] z-20 flex items-start justify-between gap-2">
        <div className="pointer-events-auto"><PlayerPanel game={game} seat={0} align="left" balls={balls} ballSet={ballSet} reactions={reactions} active={playing && game.turnSeat === 0} /></div>
        <div className="pointer-events-auto"><PlayerPanel game={game} seat={1} align="right" balls={balls} ballSet={ballSet} reactions={reactions} active={playing && game.turnSeat === 1} /></div>
      </div>

      {showResult && game.result && (
        <div className="pointer-events-none absolute inset-x-0 top-[140px] z-20 flex justify-center px-4">
          <p key={resultKey} className={cn(GLASS, "uno-rise max-w-md px-4 py-2 text-center text-sm font-semibold", game.result.foul && "border-red-400/40 bg-red-950/70")}>{game.result.text}</p>
        </div>
      )}

      {myTurn && !playback && (
        <>
          <div className="absolute bottom-3 left-3 z-20">
            <SpinPicker spin={spin} onSpin={setSpin} disabled={!myTurn} />
          </div>
          <div className="absolute bottom-3 right-3 z-20 flex flex-col items-center gap-2">
            <PowerBar pull={pull} onPull={setPull} onRelease={shoot} disabled={!myTurn || !placementValid} />
            <div className="flex gap-1.5">
              <NudgeButton direction={-1} onNudge={(amount) => setAngle((value) => value + amount)} disabled={!myTurn} />
              <NudgeButton direction={1} onNudge={(amount) => setAngle((value) => value + amount)} disabled={!myTurn} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-1.5 px-28 text-center">
            {mustCall && (
              <p className={cn(GLASS, "px-3 py-1.5 text-xs font-semibold")}>
                {calledPocket !== null ? <>Calling the 8 in the <span className="text-amber-300">{POCKET_NAMES[calledPocket]}</span></> : "Aim at the 8 to call a pocket"}
                <span className="text-white/60"> · tap a pocket (top view) to change</span>
              </p>
            )}
            {area && !placementValid && <p className={cn(GLASS, "border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-200")}><Hand className="mr-1 inline size-3.5" />The cue ball can't go there</p>}
            {hint && <p className="hidden max-w-xl text-xs text-white/60 sm:block">{hint}</p>}
          </div>
        </>
      )}

      {logOpen && (
        <SidePanel title="Shot log" icon={<ScrollText className="size-4" />} onClose={() => setLogOpen(false)}>
          {game.log.length === 0 ? (
            <p className="text-sm text-white/60">Nothing yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {[...game.log].reverse().map((entry, index) => (
                <li key={`${entry.shotId}-${index}`} className={cn("rounded-lg px-2.5 py-1.5 text-sm", entry.tone === "foul" ? "bg-red-500/10 text-red-100" : entry.tone === "win" ? "bg-amber-400/15 text-amber-100" : entry.tone === "pot" ? "bg-emerald-500/10 text-emerald-100" : "text-white/75")}>
                  {entry.text}
                </li>
              ))}
            </ol>
          )}
        </SidePanel>
      )}

      {game.status === "finished" && game.winner && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className={cn(GLASS, "uno-rise w-full max-w-sm bg-[#0b111a]/90 p-6 text-center")}>
            <Trophy className={cn("mx-auto size-10", winnerIsMe ? "text-amber-300" : "text-white/70")} />
            <h2 className="mt-3 text-2xl font-black tracking-tight">{winnerIsMe ? "You win the rack!" : `${game.winner.name} wins`}</h2>
            <p className="mt-1 text-sm text-white/70">{game.winner.reason}</p>
            <div className="mt-4 flex justify-center gap-6">
              {game.seatOrder.map((id) => {
                const player = id ? game.players[id] : null
                if (!player || !id) return null
                return (
                  <div key={id} className="text-center">
                    <p className="text-3xl font-black tabular-nums">{game.wins[id] ?? 0}</p>
                    <p className="max-w-28 truncate text-xs text-white/60">{player.name}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 flex flex-col gap-2">
              {isHost ? (
                <button type="button" onClick={onRestart} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 font-bold text-black transition hover:bg-emerald-400">
                  <RotateCcw className="size-4" />
                  {seated === 2 ? "Rack 'em again" : "Back to the lobby"}
                </button>
              ) : (
                <p className="text-sm text-white/60">Waiting for the host to rack again…</p>
              )}
              <button type="button" onClick={onLeave} className="h-11 rounded-xl border border-white/15 font-semibold text-white/80 transition hover:bg-white/10">Leave table</button>
            </div>
          </div>
        </div>
      )}
    </PartyTable>
  )
}
