import { ArrowLeft, BookOpen, Check, Clock, Eye, Hand, LogOut, Radio, RotateCcw, Scissors, ScrollText, ShieldCheck, TriangleAlert, X } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { GameErrorBoundary } from "@/components/GameErrorBoundary"
import { ReactionBubble, type ReactionBubbles } from "@/components/multiplayer/Reactions"
import {
  BOMB_DIFFICULTIES, BOMB_PACE_MS, BOMB_STRIKE_LIMIT, BOMB_SYMBOLS, BUTTON_HOLD_MS, MODULE_LABELS, formatBombTime,
  type BombOutcome, type BombRoundResult, type BombSubmission, type BombSymbol, type ModuleKind, type PublicBombState, type SimonColor,
} from "@/lib/bombDefusal"
import type { Reaction } from "@/lib/reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { GLASS, GlassButton, SidePanel, TableTopBar, useNow, useSoundCue } from "../party-shell/shell"
import { SIMON_HEX, createBombScene, type BombPick, type BombScene, type BombSceneHandlers, type BombSceneState } from "./bombScene"
import { ManualBinder } from "./manual"

export interface BombDefusalGameProps {
  game: PublicBombState
  playerId: string
  roomLabel: string
  connected: boolean
  error: string | null
  /** Server clock minus local clock. */
  clockOffset: number
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onSubmit: (submission: BombSubmission, revision: number) => boolean
  onNext: () => void
  onRestart: () => void
  onLeave: () => void
}

const TABLE_BG = "radial-gradient(ellipse at 62% 18%, #3d2b1b 0%, #1b120b 48%, #070403 100%)"
const RED_DIGITS = "font-mono font-black tabular-nums text-[#ff4436] [text-shadow:0_0_14px_rgb(255_59_48/.65)]"
const SWITCH_NAMES = ["A", "B", "C", "D"]

const OUTCOME_LINE: Record<BombOutcome, string> = {
  defused: "Defused", time: "Out of time", strikes: "Three strikes", "crew-left": "Crew left",
}

interface PickBook {
  mission: string | null
  /** [module revision the pick was made at, pick] — a strike clears it. */
  wire: [number, number | null]
  keys: [number, BombSymbol[]]
  simon: [number, SimonColor[]]
  /** Switches and the cover stay where the operator left them. */
  switches: boolean[]
  cover: boolean
}
const emptyBook = (mission: string | null): PickBook => ({ mission, wire: [-1, null], keys: [-1, []], simon: [-1, []], switches: [false, false, false, false], cover: false })

/** Local time `key` first appeared; a key already there on mount counts as long past, so a reconnect stays quiet. */
function useFirstSeen(key: string | null) {
  const seen = useRef<{ key: string | null | undefined; at: number }>({ key: undefined, at: -Infinity })
  if (seen.current.key === undefined) seen.current = { key, at: -Infinity }
  else if (seen.current.key !== key) seen.current = { key, at: Date.now() }
  return seen.current.at
}

function DeviceCanvas({ view, handlers }: { view: BombSceneState; handlers: BombSceneHandlers }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BombScene | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let scene: BombScene
    try {
      scene = createBombScene(container, {
        onPick: (pick) => handlersRef.current.onPick(pick),
        onButtonDown: () => handlersRef.current.onButtonDown(),
        onButtonUp: () => handlersRef.current.onButtonUp(),
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

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {failed && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">Your browser could not start the 3D device.</div>}
    </div>
  )
}

function StrikePips({ strikes, size = "sm" }: { strikes: number; size?: "sm" | "lg" }) {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label={`${strikes} of ${BOMB_STRIKE_LIMIT} strikes`}>
      {Array.from({ length: BOMB_STRIKE_LIMIT }, (_, index) => (
        <span
          key={index}
          className={cn(
            "rounded-full border transition",
            size === "lg" ? "size-5" : "size-2.5",
            index < strikes ? "border-red-300 bg-red-500 shadow-[0_0_10px_rgb(239_68_68/.9)]" : "border-white/25 bg-black/40",
          )}
        />
      ))}
    </span>
  )
}

function OutcomeIcon({ outcome }: { outcome: BombOutcome | undefined }) {
  if (outcome === "time") return <Clock className="size-4 text-red-300" />
  if (outcome === "strikes") return <TriangleAlert className="size-4 text-red-300" />
  if (outcome === "crew-left") return <LogOut className="size-4 text-white/60" />
  return <ShieldCheck className="size-4 text-emerald-300" />
}

function RoundSummary({ history }: { history: BombRoundResult[] }) {
  return (
    <ol className="space-y-2">
      {history.map((result) => (
        <li key={result.round} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-black/40 font-mono text-sm font-bold">{result.round}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-bold"><OutcomeIcon outcome={result.outcome ?? (result.defused ? "defused" : undefined)} />{result.operatorName}</p>
            <p className="mt-0.5 text-xs text-white/60">
              {result.difficulty ? `${BOMB_DIFFICULTIES[result.difficulty].label} · ` : ""}
              {result.solvedModules}/{result.moduleCount ?? 3} modules · {result.strikes} strike{result.strikes === 1 ? "" : "s"} · {formatBombTime(result.secondsLeft)} left
            </p>
          </div>
          <span className={cn("shrink-0 text-xs font-black uppercase tracking-wide", result.defused ? "text-emerald-300" : "text-red-300")}>
            {result.outcome ? OUTCOME_LINE[result.outcome] : result.defused ? "Defused" : "Lost"}
          </span>
        </li>
      ))}
    </ol>
  )
}

function DockButton({ children, onClick, disabled, tone = "primary" }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40",
        tone === "primary" && "bg-amber-300 text-[#1c1206] hover:bg-amber-200",
        tone === "danger" && "bg-red-500 text-white hover:bg-red-400",
        tone === "ghost" && "border border-white/15 bg-white/5 text-white hover:bg-white/10",
      )}
    >
      {children}
    </button>
  )
}

export function BombDefusalGame(props: BombDefusalGameProps) {
  const { game, playerId, connected, clockOffset, reactions } = props
  const { status, pace, outcome } = game
  const now = useNow(true, 100)
  const serverNow = now + clockOffset
  const isOperator = game.operatorId === playerId
  const operator = game.players[game.operatorId ?? ""]
  const live = status === "playing" || status === "resolving"
  const reveal = status === "round-end" || status === "finished"
  const crew = Object.values(game.players).sort((a, b) => a.joinedAt - b.joinedAt)
  const away = crew.filter((player) => player.connected === false)
  const byKind = (kind: ModuleKind) => game.modules.find((module) => module.kind === kind)

  // ─── Clock ──────────────────────────────────────────────────────────
  const msLeft = status === "playing" && game.deadline ? Math.max(0, game.deadline - serverNow) : 0
  const seconds = status === "playing" ? Math.ceil(msLeft / 1000) : status === "handoff" ? game.timeLimit : game.frozenSecondsLeft ?? 0
  const display = formatBombTime(seconds)
  const secondsRef = useRef(seconds)
  secondsRef.current = seconds

  // ─── Beats, measured on the server clock so every screen agrees ─────
  const boomLead = outcome === "strikes" ? BOMB_PACE_MS.boomDelay : 0
  const paceTotal = !pace ? 0 : pace.stage === "handoff" ? BOMB_PACE_MS.handoff : pace.stage === "defused" ? BOMB_PACE_MS.defused : BOMB_PACE_MS.exploded + boomLead
  const paceElapsed = pace ? paceTotal - Math.max(0, pace.endsAt - serverNow) : Infinity
  const defusing = status === "resolving" && pace?.stage === "defused"
  const exploding = status === "resolving" && pace?.stage === "exploded"
  const boomed = exploding && paceElapsed >= boomLead

  const actionKey = game.lastAction && game.missionId ? `${game.missionId}:${game.lastAction.seq}` : null
  const actionAge = now - useFirstSeen(actionKey)
  const striking = Boolean(game.lastAction && !game.lastAction.correct && actionAge < BOMB_PACE_MS.strike)
  const solving = Boolean(game.lastAction?.correct && actionAge < BOMB_PACE_MS.solve)

  useSoundCue(actionKey, () => playSound(game.lastAction?.correct ? "chime" : "buzzer"))
  useSoundCue(pace ? `${pace.seq}:${pace.stage}` : null, () => {
    if (pace?.stage === "defused") playSound("defuse")
    else if (pace?.stage === "exploded") playSound("explode", boomLead)
    else if (pace?.stage === "handoff") playSound("turn")
  })
  // The beep quickens in the last 30 seconds, and again in the last 10.
  const beepTick = status === "playing" && msLeft > 0
    ? msLeft > 30_000 ? `s${Math.ceil(msLeft / 1000)}` : msLeft > 10_000 ? `h${Math.ceil(msLeft / 500)}` : `q${Math.ceil(msLeft / 250)}`
    : null
  useSoundCue(beepTick, () => playSound("beep"))

  // ─── Operator picks: selecting never submits ────────────────────────
  const [bookState, setBook] = useState<PickBook>(() => emptyBook(game.missionId))
  const book = bookState.mission === game.missionId ? bookState : emptyBook(game.missionId)
  const rev = (kind: ModuleKind) => byKind(kind)?.revision ?? 0
  const wire = book.wire[0] === rev("wires") ? book.wire[1] : null
  const keys = book.keys[0] === rev("symbols") ? book.keys[1] : []
  const simon = book.simon[0] === rev("simon") ? book.simon[1] : []
  const edit = (change: (current: PickBook) => Partial<PickBook>) =>
    setBook((previous) => {
      const current = previous.mission === game.missionId ? previous : emptyBook(game.missionId)
      return { ...current, ...change(current) }
    })

  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setPending(null), 3000)
    return () => window.clearTimeout(timer)
  }, [pending])
  const canTouch = (kind: ModuleKind) => {
    const module = byKind(kind)
    return Boolean(isOperator && status === "playing" && connected && module && !module.solved && pending !== `${kind}:${module.revision}`)
  }
  const submit = (submission: BombSubmission) => {
    const module = byKind(submission.kind)
    if (!module || !canTouch(submission.kind)) return
    if (props.onSubmit(submission, module.revision)) setPending(`${submission.kind}:${module.revision}`)
  }

  const [focus, setFocus] = useState<number | null>(null)
  useEffect(() => setFocus(null), [game.missionId])
  const focused = focus !== null ? game.modules[focus] : undefined

  // The Button: the press and the release are the commit, once the cover is up.
  const [hold, setHold] = useState<{ lit: boolean } | null>(null)
  const holdStart = useRef<number | null>(null)
  useEffect(() => {
    if (!hold || hold.lit) return
    const timer = window.setTimeout(() => setHold((current) => current && { lit: true }), BUTTON_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [hold])

  const handlers: BombSceneHandlers = {
    onPick(pick: BombPick) {
      if (pick.type === "module") return setFocus(pick.index)
      if (pick.type === "back") return setFocus(null)
      if (pick.type === "wire" && canTouch("wires")) {
        playSound("deal")
        edit(() => ({ wire: [rev("wires"), wire === pick.position ? null : pick.position] }))
      } else if (pick.type === "key" && canTouch("symbols") && !keys.includes(pick.symbol) && keys.length < 4) {
        playSound("keycap")
        edit(() => ({ keys: [rev("symbols"), [...keys, pick.symbol]] }))
      } else if (pick.type === "switch" && canTouch("switches")) {
        playSound("toggle")
        edit((current) => ({ switches: current.switches.map((up, index) => index === pick.index ? !up : up) }))
      } else if (pick.type === "cover" && canTouch("button") && !hold) {
        playSound("knock")
        edit((current) => ({ cover: !current.cover }))
      } else if (pick.type === "simon" && canTouch("simon")) {
        const device = byKind("simon")?.device
        if (device?.kind !== "simon" || simon.length >= device.flashes.length) return
        playSound("keycap")
        edit(() => ({ simon: [rev("simon"), [...simon, pick.color]] }))
      }
    },
    onButtonDown() {
      if (!canTouch("button") || !book.cover) return
      holdStart.current = Date.now()
      setHold({ lit: false })
      playSound("thunk")
    },
    onButtonUp() {
      const startedAt = holdStart.current
      if (startedAt === null) return
      holdStart.current = null
      setHold(null)
      playSound("toggle")
      const held = Date.now() - startedAt
      submit(held < BUTTON_HOLD_MS ? { kind: "button", action: "tap" } : { kind: "button", action: "hold", secondsLeft: secondsRef.current })
    },
  }

  // ─── Panels ─────────────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false)
  const logCount = game.log.length + game.history.length
  const [logSeen, setLogSeen] = useState(logCount)
  useEffect(() => { if (logOpen) setLogSeen(logCount) }, [logOpen, logCount])
  const [resultsHidden, setResultsHidden] = useState(false)
  const [manualsOpen, setManualsOpen] = useState(false)
  useEffect(() => {
    setResultsHidden(false)
    setManualsOpen(false)
  }, [status])

  const showDevice = Boolean(game.serial && game.modules.length && game.modules.every((module) => module.device)) && (live ? isOperator : reveal)
  const mood: BombSceneState["mood"] = defusing || (reveal && outcome === "defused") ? "defused"
    : boomed || (reveal && (outcome === "time" || outcome === "strikes")) ? "exploded" : "armed"
  const sceneState: BombSceneState = {
    layoutKey: game.missionId ?? "",
    modules: game.modules.map((module) => ({ kind: module.kind, device: module.device, solved: module.solved, cut: module.cut })),
    serial: game.serial ?? "",
    display, strikes: game.strikes, mood, focus,
    interactive: isOperator && status === "playing",
    selectedWire: wire, keys, switches: book.switches, coverOpen: book.cover,
    buttonDown: Boolean(hold), stripLit: Boolean(hold?.lit), simonInput: simon,
    shakeKey: striking ? actionKey : null,
    boomKey: boomed ? `boom:${pace?.seq}` : null,
  }

  const expertsOf = (id: string) => game.modules.filter((module) => module.expertId === id)
  const statusLine = status === "handoff" ? `${operator?.name ?? "Next operator"} takes the device`
    : status === "playing" ? isOperator ? "You have the device" : `Guide ${operator?.name ?? "the operator"}`
    : status === "resolving" ? defusing ? "Defused!" : "Detonation"
    : status === "round-end" ? "Device secured" : "Mission over"
  const lastEntry = game.log.at(-1)

  return (
    <div className="relative h-[calc(100dvh-73px)] overflow-hidden text-white select-none" style={{ background: TABLE_BG }}>
      {showDevice && <GameErrorBoundary><DeviceCanvas view={sceneState} handlers={handlers} /></GameErrorBoundary>}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/.55)_100%)]" />

      <TableTopBar
        title="Bomb Defusal"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        onReact={props.onReact}
        canReact={connected}
        status={<>
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider", isOperator ? "bg-amber-300 text-[#1c1206]" : "bg-sky-300 text-[#06121c]")}>{isOperator ? "Operator" : "Expert"}</span>
          <span className={cn(RED_DIGITS, "text-lg", mood === "defused" && "text-emerald-300 [text-shadow:0_0_14px_rgb(74_222_128/.6)]")}>{display}</span>
          <StrikePips strikes={game.strikes} />
          <span className="min-w-0 truncate text-xs text-white/70">{statusLine}</span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-white/45">{game.round}/{game.totalRounds}</span>
        </>}
        actions={<GlassButton icon={<ScrollText className="size-4" />} label="Log" pressed={logOpen} onClick={() => setLogOpen((open) => !open)} badge={!logOpen && logCount > logSeen} />}
      />

      {/* Crew */}
      <ul className={cn("absolute left-3 top-[68px] z-20 flex flex-col gap-1.5", !isOperator && (live || status === "handoff") && "max-sm:hidden")}>
        {crew.map((player) => {
          const assigned = expertsOf(player.id)
          return (
            <li key={player.id} className={cn(GLASS, "relative flex max-w-[210px] items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs")}>
              <span className={cn("size-2 shrink-0 rounded-full", player.connected === false ? "bg-white/30" : "bg-emerald-400")} />
              {player.id === game.operatorId ? <Hand className="size-3.5 shrink-0 text-amber-300" /> : <BookOpen className="size-3.5 shrink-0 text-sky-300" />}
              <span className="min-w-0 truncate">
                <span className="font-bold">{player.name}{player.id === playerId ? " (you)" : ""}</span>
                <span className="hidden text-white/55 sm:inline">
                  {" · "}{player.id === game.operatorId ? "operator" : assigned.length ? assigned.map((module) => `${module.solved ? "✓ " : ""}${MODULE_LABELS[module.kind]}`).join(", ") : "expert"}
                </span>
              </span>
              <ReactionBubble bubble={reactions[player.id]} side="right" />
            </li>
          )
        })}
      </ul>

      {(props.error || (live && away.length > 0)) && (
        <div className="pointer-events-none absolute inset-x-0 top-[68px] z-20 flex flex-col items-center gap-2 px-3">
          {props.error && <p role="alert" className={cn(GLASS, "uno-rise max-w-md px-4 py-2 text-center text-sm text-amber-100")}>{props.error}</p>}
          {live && away.length > 0 && <p role="status" className={cn(GLASS, "max-w-md px-4 py-2 text-center text-xs text-white/75")}>Waiting for {away.map((player) => player.name).join(", ")} to reconnect. Roles are saved; the timer keeps running.</p>}
        </div>
      )}

      {/* Expert desk: the manual, never the device */}
      {!isOperator && (live || status === "handoff") && (
        <div className="absolute inset-0 flex flex-col items-center gap-3 px-3 pb-3 pt-[68px] sm:pl-[232px] xl:pl-3">
          <div className={cn(GLASS, "flex w-full max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3")}>
            <div className="rounded-lg border border-white/10 bg-[#120404] px-3 py-1">
              <span role="timer" aria-label="Time remaining" className={cn(RED_DIGITS, "text-3xl sm:text-4xl", mood === "defused" && "text-emerald-300")}>{display}</span>
            </div>
            <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">Strikes</p><StrikePips strikes={game.strikes} size="lg" /></div>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {game.modules.map((module) => (
                <li key={module.kind} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-xs", module.solved ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-white/5 text-white/70")}>
                  {module.solved ? <Check className="size-3.5" /> : <span className="size-2 rounded-full bg-red-500 shadow-[0_0_6px_rgb(239_68_68)]" />}
                  {MODULE_LABELS[module.kind]}
                  {module.expertId === playerId && <span className="text-[10px] font-bold text-sky-300">yours</span>}
                </li>
              ))}
            </ul>
          </div>
          {lastEntry && status === "playing" && (
            <p className="max-w-3xl text-center text-xs text-white/60">
              Last move: <span className="font-semibold text-white/85">{MODULE_LABELS[lastEntry.kind]}</span> · {lastEntry.text} · {lastEntry.correct ? <span className="text-emerald-300">solved</span> : <span className="text-red-300">strike</span>}
            </p>
          )}
          <div key={striking ? actionKey : "calm"} className={cn("min-h-0 w-full max-w-3xl flex-1", striking && "bomb-shake")}>
            {status === "handoff" || !game.modules.some((module) => module.manual)
              ? <div className={cn(GLASS, "grid h-full place-items-center p-6 text-center text-sm text-white/60")}>The manual opens when the clock starts.</div>
              : <ManualBinder key={game.missionId} modules={game.modules.filter((module) => module.expertId === playerId)} strikes={game.strikes} className="h-full" />}
          </div>
          <p className="text-center text-[11px] text-white/45">Describe nothing. Ask questions. You can’t see the device — {operator?.name ?? "the operator"} can.</p>
        </div>
      )}

      {/* Operator dock */}
      {isOperator && status === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
          <div className={cn(GLASS, "pointer-events-auto uno-rise w-full max-w-xl p-3")}>
            {!focused ? (
              <>
                <p className="mb-2 text-center text-xs text-white/60">Tap a module to zoom in · drag to tilt · describe what you see</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {game.modules.map((module, index) => (
                    <button key={module.kind} type="button" onClick={() => setFocus(index)}
                      className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                        module.solved ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-white/15 bg-white/5 hover:bg-white/10")}>
                      {module.solved ? <Check className="size-3.5" /> : <span className="size-2 rounded-full bg-red-500" />}
                      {MODULE_LABELS[module.kind]}
                      <span className="font-normal text-white/50">· {game.players[module.expertId]?.name ?? "—"}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <OperatorDock
                module={focused}
                expertName={game.players[focused.expertId]?.name ?? "your expert"}
                locked={!canTouch(focused.kind)}
                wire={wire}
                keys={keys}
                switches={book.switches}
                simon={simon}
                coverOpen={book.cover}
                holding={hold}
                onBack={() => setFocus(null)}
                onPick={handlers.onPick}
                onClearKeys={() => edit(() => ({ keys: [rev("symbols"), []] }))}
                onClearSimon={() => edit(() => ({ simon: [rev("simon"), []] }))}
                onCommit={() => {
                  if (focused.kind === "wires" && wire !== null) {
                    playSound("snip")
                    submit({ kind: "wires", position: wire })
                  } else if (focused.kind === "symbols" && keys.length === 4) submit({ kind: "symbols", sequence: keys })
                  else if (focused.kind === "switches") {
                    playSound("thunk")
                    submit({ kind: "switches", positions: book.switches })
                  } else if (focused.kind === "simon") submit({ kind: "simon", sequence: simon })
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Operator waiting through the reveal */}
      {isOperator && status === "resolving" && focused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <button type="button" onClick={() => setFocus(null)} className={cn(GLASS, "pointer-events-auto flex h-11 items-center gap-2 px-4 text-sm font-bold")}><ArrowLeft className="size-4" />Whole device</button>
        </div>
      )}

      {/* ─── Beats ─── */}
      {striking && (
        <>
          <div key={`flash-${actionKey}`} className="bomb-flash pointer-events-none absolute inset-0 z-40 bg-red-600" />
          <div className="pointer-events-none absolute inset-x-0 top-[128px] z-40 flex justify-center">
            <p className="uno-rise rounded-xl border border-red-300/50 bg-red-600/90 px-4 py-2 text-sm font-black uppercase tracking-wider shadow-2xl">
              Strike {game.strikes} of {BOMB_STRIKE_LIMIT}{game.lastAction ? ` · ${MODULE_LABELS[game.lastAction.kind]}` : ""}
            </p>
          </div>
        </>
      )}
      {solving && !defusing && (
        <>
          <div key={`solve-${actionKey}`} className="bomb-solve pointer-events-none absolute inset-0 z-40" />
          <div className="pointer-events-none absolute inset-x-0 top-[128px] z-40 flex justify-center">
            <p className="uno-rise flex items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-600/90 px-4 py-2 text-sm font-black uppercase tracking-wider shadow-2xl">
              <Check className="size-4" />{game.lastAction ? MODULE_LABELS[game.lastAction.kind] : "Module"} defused
            </p>
          </div>
        </>
      )}

      {status === "handoff" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
          <div className={cn(GLASS, "uno-pop w-full max-w-md overflow-hidden bg-[#0d0906]/90 p-6 text-center")}>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-200/70">Device {game.round} of {game.totalRounds} · {BOMB_DIFFICULTIES[game.difficulty].label}</p>
            <div className="mx-auto mt-4 grid size-16 place-items-center rounded-2xl bg-amber-300 text-[#1c1206] shadow-[0_0_40px_rgb(252_211_77/.45)]"><Hand className="size-8" /></div>
            <h2 className="mt-4 text-3xl font-black tracking-tight">{isOperator ? "You have the device." : `${operator?.name ?? "The operator"} takes the device.`}</h2>
            <p className="mt-2 text-sm text-white/70">
              {isOperator
                ? `${game.modules.length} modules, ${formatBombTime(game.timeLimit)} on the clock. Describe everything — you’ll never see the manual.`
                : `You hold the manual for ${expertsOf(playerId).map((module) => MODULE_LABELS[module.kind]).join(", ") || "nothing this round"}. Ask, listen, instruct.`}
            </p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-300" style={{ width: `${Math.min(100, Math.max(0, (paceElapsed / paceTotal) * 100))}%`, transition: "width 100ms linear" }} />
            </div>
          </div>
        </div>
      )}

      {defusing && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgb(34_197_94/.28),transparent_70%)]">
          <div className="bomb-relief text-center">
            <ShieldCheck className="mx-auto size-16 text-emerald-300 drop-shadow-[0_0_24px_rgb(74_222_128/.8)]" />
            <p className="mt-2 text-6xl font-black tracking-tight text-emerald-200 drop-shadow-[0_4px_30px_rgb(0_0_0/.8)] sm:text-7xl">DEFUSED</p>
            <p className="mt-2 font-mono text-lg text-emerald-100/90">{display} left on the clock · {game.strikes} strike{game.strikes === 1 ? "" : "s"}</p>
          </div>
        </div>
      )}

      {boomed && (
        <>
          <div key={`white-${pace?.seq}`} className="bomb-white pointer-events-none absolute inset-0 z-50 bg-[#fff7e6]" />
          <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgb(120_20_0/.55),rgb(0_0_0/.75)_75%)]">
            <div className="bomb-boom text-center" style={{ animationDelay: "250ms" }}>
              <p className="text-8xl font-black tracking-tighter text-orange-300 [text-shadow:0_0_40px_rgb(251_146_60/.9),0_6px_0_rgb(124_45_18)] sm:text-9xl">BOOM</p>
              <p className="mt-3 text-lg font-bold text-white/85">{outcome === "strikes" ? "Three strikes." : "Out of time."}</p>
            </div>
          </div>
        </>
      )}

      {/* ─── Results ─── */}
      {reveal && !resultsHidden && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/45 p-3 pt-[68px]">
          <div className={cn(GLASS, "uno-pop flex max-h-full w-full max-w-lg flex-col bg-[#0d0906]/92")}>
            <div className="border-b border-white/10 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-white/50">{status === "finished" ? "Mission report" : `Device ${game.round} of ${game.totalRounds}`}</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">
                {status === "round-end" ? "Device secured. Swap roles."
                  : outcome === "defused" ? "Every device defused. The whole crew made it."
                  : outcome === "time" ? "Out of time."
                  : outcome === "strikes" ? "Three strikes. Device lost."
                  : "A crew member left."}
              </h2>
              <p className="mt-1 text-sm text-white/65">
                {status === "round-end" ? `${game.players[game.nextOperatorId ?? ""]?.name ?? "The next player"} takes the device next.`
                  : outcome === "crew-left" ? "This mission needs its full crew. Head back to the lobby to regroup."
                  : outcome === "defused" ? "Everyone took a turn on the device." : "Open the manuals and compare them with the device."}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4"><RoundSummary history={game.history} /></div>
            <div className="flex flex-wrap gap-2 border-t border-white/10 p-4">
              {game.canControl
                ? <DockButton onClick={status === "round-end" ? props.onNext : props.onRestart} disabled={!connected || (status === "round-end" && away.length > 0)}>
                    {status === "round-end" ? <><RotateCcw className="size-4" />Rotate roles & start</> : "Return to lobby"}
                  </DockButton>
                : <p className="flex h-11 items-center px-1 text-sm text-white/60">Waiting for the host…</p>}
              <DockButton tone="ghost" onClick={() => setResultsHidden(true)}><Eye className="size-4" />View device</DockButton>
              <DockButton tone="ghost" onClick={() => setManualsOpen(true)}><BookOpen className="size-4" />Manuals</DockButton>
            </div>
          </div>
        </div>
      )}
      {reveal && resultsHidden && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center gap-2">
          <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "pointer-events-auto flex h-11 items-center gap-2 px-4 text-sm font-bold")}><ScrollText className="size-4" />Results</button>
          <button type="button" onClick={() => setManualsOpen(true)} className={cn(GLASS, "pointer-events-auto flex h-11 items-center gap-2 px-4 text-sm font-bold")}><BookOpen className="size-4" />Manuals</button>
        </div>
      )}
      {reveal && manualsOpen && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/40 p-3 pt-[68px]">
          <div className="uno-rise flex h-full w-full max-w-2xl flex-col gap-2">
            <div className="flex justify-end">
              <button type="button" onClick={() => setManualsOpen(false)} aria-label="Close manuals" className={cn(GLASS, "grid size-10 place-items-center")}><X className="size-4" /></button>
            </div>
            <ManualBinder key={game.missionId} modules={game.modules} strikes={game.strikes} className="min-h-0 flex-1" />
          </div>
        </div>
      )}

      {logOpen && (
        <SidePanel title="Mission log" icon={<ScrollText className="size-4 text-amber-200" />} onClose={() => setLogOpen(false)}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Device {game.round} · {operator?.name ?? "—"}</p>
          {game.log.length === 0
            ? <p className="mb-4 text-sm text-white/50">No moves yet.</p>
            : <ol className="mb-5 space-y-1.5">
                {[...game.log].reverse().map((entry) => (
                  <li key={entry.seq} className={cn("rounded-lg border-l-2 bg-white/5 px-3 py-2 text-xs", entry.correct ? "border-emerald-400" : "border-red-400")}>
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-white/50">{formatBombTime(entry.secondsLeft)}</span>
                      <span className="font-bold">{MODULE_LABELS[entry.kind]}</span>
                      <span className={cn("ml-auto font-black uppercase", entry.correct ? "text-emerald-300" : "text-red-300")}>{entry.correct ? "Solved" : `Strike ${entry.strikes}`}</span>
                    </p>
                    <p className="mt-0.5 text-white/70">{operator?.name ?? "Operator"}: {entry.text}</p>
                  </li>
                ))}
              </ol>}
          {game.history.length > 0 && <>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Rounds</p>
            <RoundSummary history={game.history} />
          </>}
        </SidePanel>
      )}
    </div>
  )
}

function OperatorDock({ module, expertName, locked, wire, keys, switches, simon, coverOpen, holding, onBack, onPick, onClearKeys, onClearSimon, onCommit }: {
  module: PublicBombState["modules"][number]
  expertName: string
  locked: boolean
  wire: number | null
  keys: BombSymbol[]
  switches: boolean[]
  simon: SimonColor[]
  coverOpen: boolean
  holding: { lit: boolean } | null
  onBack: () => void
  onPick: (pick: BombPick) => void
  onClearKeys: () => void
  onClearSimon: () => void
  onCommit: () => void
}) {
  const device = module.device
  const flashes = device?.kind === "simon" ? device.flashes.length : 0
  return (
    <div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back to the whole device" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10"><ArrowLeft className="size-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{MODULE_LABELS[module.kind]}</p>
          <p className="truncate text-xs text-white/55"><Radio className="mr-1 inline size-3" />{expertName} has this manual</p>
        </div>
        {module.solved && <span className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-black text-emerald-200"><Check className="size-3.5" />Safe</span>}
      </div>

      {!module.solved && (
        <div className="mt-3">
          {module.kind === "wires" && <>
            <p className="text-xs text-white/60">{wire ? <>Wire <strong className="text-white">{wire}</strong> selected. Cut it?</> : "Tap a wire to select it. Read the colours top to bottom."}</p>
            <div className="mt-2 flex gap-2"><DockButton tone="danger" disabled={locked || wire === null} onClick={onCommit}><Scissors className="size-4" />{wire ? `Cut wire ${wire}` : "Cut wire"}</DockButton></div>
          </>}
          {module.kind === "symbols" && <>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 4 }, (_, index) => (
                <span key={index} className={cn("grid size-10 place-items-center rounded-lg border text-xl", keys[index] ? "border-amber-300/70 bg-amber-300/15" : "border-white/10 bg-black/30 text-white/25")}>
                  {keys[index] ? BOMB_SYMBOLS[keys[index]].glyph : index + 1}
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <DockButton tone="ghost" disabled={locked || keys.length === 0} onClick={onClearKeys}>Clear</DockButton>
              <DockButton disabled={locked || keys.length !== 4} onClick={onCommit}>Enter sequence</DockButton>
            </div>
          </>}
          {module.kind === "switches" && <>
            <p className="font-mono text-sm">{switches.map((up, index) => `${SWITCH_NAMES[index]}${up ? "▲" : "▼"}`).join("  ")}</p>
            <div className="mt-2 flex gap-2"><DockButton disabled={locked} onClick={onCommit}>Apply switches</DockButton></div>
          </>}
          {module.kind === "button" && (
            <p className={cn("rounded-lg px-3 py-2 text-xs", holding?.lit ? "bg-amber-300/15 text-amber-100" : "bg-white/5 text-white/70")}>
              {holding?.lit ? "Strip lit — tell your expert its colour, and let go on the right digit."
                : holding ? "Pressed…"
                : coverOpen ? "Cover up. Tap the button, or press and hold it. Letting go commits."
                : "Lift the clear cover first. Describe the button’s colour and label."}
            </p>
          )}
          {module.kind === "simon" && <>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: flashes }, (_, index) => (
                <span key={index} className="size-8 rounded-lg border border-white/10" style={{ background: simon[index] ? SIMON_HEX[simon[index]] : "rgb(0 0 0 / .3)" }} />
              ))}
              <span className="ml-1 text-xs text-white/55">Count the flashes, then press the colours your expert gives you.</span>
            </div>
            <div className="mt-2 flex gap-2">
              <DockButton tone="ghost" disabled={locked || simon.length === 0} onClick={onClearSimon}>Clear</DockButton>
              <DockButton disabled={locked || simon.length !== flashes} onClick={onCommit}>Enter colours</DockButton>
            </div>
          </>}
        </div>
      )}

      {/* Keyboard and screen-reader access to the same picks as the 3D device. */}
      <div className="sr-only">
        {device?.kind === "wires" && device.colors.map((color, index) => !module.cut.includes(index + 1) && <button key={index} type="button" onClick={() => onPick({ type: "wire", position: index + 1 })}>Select wire {index + 1}, {color}</button>)}
        {device?.kind === "symbols" && device.symbols.map((symbol) => <button key={symbol} type="button" onClick={() => onPick({ type: "key", symbol })}>Press {BOMB_SYMBOLS[symbol].label}</button>)}
        {device?.kind === "switches" && SWITCH_NAMES.map((name, index) => <button key={name} type="button" onClick={() => onPick({ type: "switch", index })}>Flip switch {name}</button>)}
        {device?.kind === "button" && <button type="button" onClick={() => onPick({ type: "cover" })}>{coverOpen ? "Close" : "Lift"} the cover</button>}
        {device?.kind === "simon" && (["red", "blue", "green", "yellow"] as const).map((color) => <button key={color} type="button" onClick={() => onPick({ type: "simon", color })}>Press {color}</button>)}
      </div>
    </div>
  )
}
