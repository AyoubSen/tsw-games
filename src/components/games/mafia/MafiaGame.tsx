import { ArrowLeft, Bot, Check, Crosshair, Eye, Flame, Gavel, Heart, Laugh, MessageSquare, Moon, ScrollText, Send, Shield, Skull, Sparkles, Sun, Sunrise, Trophy, Users, WifiOff, X } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import type { Reaction } from "@/lib/reactions"
import { ReactionBubble, ReactionPicker, type ReactionBubbles, type ReactionBubbleState } from "@/components/multiplayer/Reactions"
import { SoundToggle } from "@/components/multiplayer/SoundToggle"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import type { ChatChannel, ChatMessage, NightSubPhase, PublicGameState, RevealBeat, WinCondition } from "../../../../party/mafia"
import { ROLE_INFO, RoleFlip } from "./components/RoleCard"

export interface MafiaGameProps {
  state: PublicGameState
  playerId: string
  roomLabel: string
  connected: boolean
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onNightAction: (targetId: string) => void
  onWitchAction: (heal: boolean, killTargetId: string | null) => void
  onCupidAction: (lover1: string, lover2: string) => void
  onHunterKill: (targetId: string) => void
  onDayVote: (targetId: string) => void
  onChat: (text: string, channel: ChatChannel) => void
  onLeave: () => void
}

/** Inside a death beat (BEAT_MS.death on the server): the seat falls, then the role card turns. */
const FALL_MS = 1400
const FLIP_MS = 2400
const GLASS = "pointer-events-auto rounded-2xl border border-white/10 bg-black/50 shadow-2xl backdrop-blur-md"
const VOTE_HEX = "#fbbf24"
const WOLF_HEX = "#ef4444"
const SHOT_HEX = "#fb923c"

type Mood = "night" | "dawn" | "day"
type Mode = "wolf" | "seer" | "doctor" | "witch" | "cupid" | "vote" | "hunter" | null

const SKY: Record<Mood, string> = {
  night: "linear-gradient(180deg,#04060f 0%,#0a1230 48%,#151d36 100%)",
  dawn: "linear-gradient(180deg,#1d1f4a 0%,#553a66 36%,#b0605c 70%,#dd9a62 100%)",
  day: "linear-gradient(180deg,#2c5a78 0%,#4b7b84 48%,#66805c 100%)",
}

const SUB_PHASE_TEXT: Record<NightSubPhase, string> = {
  cupid: "Cupid is choosing two lovers",
  werewolves: "The werewolves are hunting",
  seer: "The seer peers into the dark",
  doctor: "The doctor makes the rounds",
  witch: "The witch is brewing",
  done: "The night is ending",
}

const WIN_INFO: Record<Exclude<WinCondition, null>, { title: string; line: string; hex: string; Icon: typeof Users }> = {
  villagers: { title: "The village wins", line: "Every werewolf has been found.", hex: "#4ade80", Icon: Users },
  werewolves: { title: "The werewolves win", line: "The pack has overrun the village.", hex: "#f87171", Icon: Moon },
  lovers: { title: "The lovers win", line: "Love outlasted everyone else.", hex: "#f472b6", Icon: Heart },
  jester: { title: "The jester wins", line: "The village voted out the fool, exactly as planned.", hex: "#facc15", Icon: Laugh },
}

function hueOf(id: string) {
  let value = 7
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) | 0
  return Math.abs(value) % 360
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

function moodOf(state: PublicGameState): Mood {
  switch (state.phase) {
    case "dawn":
      return "dawn"
    case "day-discussion":
    case "day-voting":
    case "day-elimination":
    case "hunter-revenge":
      return "day"
    case "game-over":
      return state.winner === "werewolves" ? "night" : "day"
    default:
      return "night"
  }
}

export function MafiaGame({
  state,
  playerId: myId,
  roomLabel,
  connected,
  error,
  reactions,
  onReact,
  onNightAction,
  onWitchAction,
  onCupidAction,
  onHunterKill,
  onDayVote,
  onChat,
  onLeave,
}: MafiaGameProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) return
    const update = () => setBox({ w: element.clientWidth, h: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { phase, players, myRole } = state
  const me = players[myId]
  const alive = me?.alive ?? false
  const night = phase === "night" || phase === "first-night"
  const over = phase === "game-over"
  const reveal = state.reveal
  const beat = reveal?.beat ?? null
  const beatKey = reveal ? `${phase}:${state.dayNumber}:${reveal.index}` : null
  const mood = moodOf(state)
  const now = useNow(Boolean(state.phaseEndTime))
  const secondsLeft = state.phaseEndTime ? Math.max(0, Math.ceil((state.phaseEndTime - now) / 1000)) : null

  const [chatOpen, setChatOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024)
  const [logOpen, setLogOpen] = useState(false)
  const [peek, setPeek] = useState(false)
  const [roleSeen, setRoleSeen] = useState(false)
  const [summaryClosed, setSummaryClosed] = useState(false)

  // ─── What I can do right now ───────────────────────────────────────────
  let mode: Mode = null
  if (!reveal) {
    if (night && alive) {
      const sub = state.nightSubPhase
      if (sub === "werewolves" && myRole === "werewolf" && !state.werewolfVotes?.[myId]) mode = "wolf"
      else if (sub === "seer" && myRole === "seer") mode = "seer"
      else if (sub === "doctor" && myRole === "doctor") mode = "doctor"
      else if (sub === "witch" && myRole === "witch" && !state.witchActed) mode = "witch"
      else if (sub === "cupid" && myRole === "cupid") mode = "cupid"
    }
    if (phase === "day-voting" && alive) mode = "vote"
    if (state.isHunterRevenge) mode = "hunter"
  }
  const modeKey = `${mode}:${phase}:${state.nightSubPhase}:${state.dayNumber}`
  const [pickState, setPickState] = useState({ key: "", ids: [] as string[], heal: false, poison: false })
  // Picks belong to one decision; a new phase starts clean (computed here so nothing stale renders).
  const picks = pickState.key === modeKey ? pickState : { key: modeKey, ids: [] as string[], heal: false, poison: false }
  const setPicks = (patch: Partial<typeof picks>) => setPickState({ ...picks, ...patch, key: modeKey })

  const canTarget = (id: string) => {
    const player = players[id]
    if (!player?.alive || !mode) return false
    switch (mode) {
      case "wolf": return player.role !== "werewolf"
      case "seer": return id !== myId
      case "doctor": return id !== state.doctorLastTarget
      case "witch": return picks.poison && id !== myId
      case "cupid": return true
      case "vote": return id !== myId
      case "hunter": return id !== myId
    }
  }

  const tapSeat = (id: string) => {
    if (!canTarget(id)) return
    if (mode === "vote") {
      if (state.dayVotes[myId] !== id) onDayVote(id)
      return
    }
    if (mode === "cupid") {
      const ids = picks.ids.includes(id) ? picks.ids.filter((other) => other !== id) : picks.ids.length < 2 ? [...picks.ids, id] : [picks.ids[1], id]
      setPicks({ ids })
      return
    }
    setPicks({ ids: picks.ids[0] === id ? [] : [id] })
  }

  // ─── Seats around the plaza ────────────────────────────────────────────
  const compact = box.w < 640
  const dockChat = box.w >= 1024 && chatOpen
  const avatar = compact ? 42 : 54
  const seatW = compact ? 70 : 92
  const order = useMemo(() => {
    const index = state.playerOrder.indexOf(myId)
    return index < 0 ? state.playerOrder : [...state.playerOrder.slice(index), ...state.playerOrder.slice(0, index)]
  }, [state.playerOrder, myId])
  const left = 12
  const right = box.w - (dockChat ? 344 : 12)
  const top = (compact ? 64 : 80) + avatar / 2 + 6
  const bottom = box.h - (compact ? 150 : 158) - avatar / 2 - 44
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const rx = Math.max(60, (right - left) / 2 - seatW / 2)
  const ry = Math.max(50, (bottom - top) / 2)
  const seats: Record<string, { x: number; y: number }> = {}
  order.forEach((id, i) => {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / order.length
    seats[id] = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
  })
  const stageW = Math.min(400, Math.max(200, 2 * rx - seatW - 8))

  // ─── Votes as arrows and chips ─────────────────────────────────────────
  const showDayVotes = phase === "day-voting" || phase === "day-elimination"
  const arrows: { key: string; from: string; to: string; hex: string }[] = []
  const voteCounts: Record<string, number> = {}
  if (showDayVotes) {
    for (const [voter, target] of Object.entries(state.dayVotes)) {
      if (target === "abstain") continue
      arrows.push({ key: `v-${voter}-${target}`, from: voter, to: target, hex: VOTE_HEX })
      voteCounts[target] = (voteCounts[target] ?? 0) + 1
    }
  } else if (night && state.werewolfVotes) {
    for (const [voter, target] of Object.entries(state.werewolfVotes)) {
      arrows.push({ key: `w-${voter}-${target}`, from: voter, to: target, hex: WOLF_HEX })
      voteCounts[target] = (voteCounts[target] ?? 0) + 1
    }
  }
  if (beat?.kind === "death" && beat.cause === "hunter" && beat.byId) arrows.push({ key: `h-${beatKey}`, from: beat.byId, to: beat.playerId, hex: SHOT_HEX })

  // ─── Sounds ────────────────────────────────────────────────────────────
  const nightKey = night ? `night-${state.dayNumber}` : ""
  useEffect(() => {
    if (nightKey) playSound("howl")
  }, [nightKey])
  useEffect(() => {
    if (phase === "role-reveal") playSound("flip", 700)
  }, [phase])
  useEffect(() => {
    if (!beat) return
    if (beat.kind === "sunrise") playSound("dawn")
    if (beat.kind === "death") {
      if (beat.cause === "hunter") playSound("shot", 700)
      playSound("toll", FALL_MS)
      playSound("flip", FLIP_MS)
    }
    if (beat.kind === "tally") playSound("knock", 300)
    if (beat.kind === "win") playSound(state.winningPlayerIds.includes(myId) ? "win" : "toll")
    // Only when a new beat starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatKey])
  useEffect(() => {
    if (mode && mode !== "vote") playSound("turn")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeKey])
  const castVotes = showDayVotes ? Object.keys(state.dayVotes).length : 0
  const lastVotes = useRef(castVotes)
  useEffect(() => {
    if (castVotes > lastVotes.current && phase === "day-voting") playSound("knock")
    lastVotes.current = castVotes
  }, [castVotes, phase])

  useEffect(() => {
    if (!peek) return
    const timer = window.setTimeout(() => setPeek(false), 4000)
    return () => window.clearTimeout(timer)
  }, [peek])

  // ─── Chat unread marker ────────────────────────────────────────────────
  const chatTotal = state.chat.length + (state.wolfChat?.length ?? 0) + (state.ghostChat?.length ?? 0)
  const [chatSeen, setChatSeen] = useState(chatTotal)
  useEffect(() => {
    if (chatOpen) setChatSeen(chatTotal)
  }, [chatOpen, chatTotal])

  const name = (id: string | null | undefined) => (id === myId ? "You" : (id && players[id]?.name) || "Someone")
  const myTurnHex = mode && mode !== "vote" && myRole ? ROLE_INFO[myRole].hex : null

  // ─── Status line ───────────────────────────────────────────────────────
  const title = (() => {
    switch (phase) {
      case "role-reveal": return "Roles are dealt"
      case "first-night":
      case "night": return `Night ${state.dayNumber}`
      case "dawn": return `Dawn · Day ${state.dayNumber}`
      case "day-discussion": return `Day ${state.dayNumber} · Discussion`
      case "day-voting": return `Day ${state.dayNumber} · Vote`
      case "day-elimination": return `Day ${state.dayNumber} · Verdict`
      case "hunter-revenge": return "The Hunter's revenge"
      case "game-over": return state.winner ? WIN_INFO[state.winner].title : "Game over"
      default: return "Mafia"
    }
  })()
  const subtitle = night ? SUB_PHASE_TEXT[state.nightSubPhase] : null
  const PhaseIcon = night || phase === "role-reveal" ? Moon : phase === "dawn" ? Sunrise : phase === "day-voting" || phase === "day-elimination" ? Gavel : phase === "hunter-revenge" ? Crosshair : over ? Trophy : Sun

  return (
    <div ref={rootRef} className="relative h-[calc(100dvh-73px)] overflow-hidden bg-[#05070d] text-white select-none">
      <Scene mood={mood} cx={cx} cy={cy} rx={rx} ry={ry} />

      {/* Arrows: who votes for whom. */}
      <svg className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden="true">
        <defs>
          {[VOTE_HEX, WOLF_HEX, SHOT_HEX].map((hex) => (
            <marker key={hex} id={`mafia-tip-${hex.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={hex} />
            </marker>
          ))}
        </defs>
        {arrows.map((arrow) => {
          const from = seats[arrow.from]
          const to = seats[arrow.to]
          if (!from || !to) return null
          const dx = to.x - from.x
          const dy = to.y - from.y
          const length = Math.hypot(dx, dy)
          if (length < avatar) return null
          const trim = avatar / 2 + 6
          const ux = dx / length
          const uy = dy / length
          return (
            <line
              key={arrow.key}
              className="mafia-arrow"
              pathLength={1}
              x1={from.x + ux * trim}
              y1={from.y + uy * trim}
              x2={to.x - ux * (trim + 2)}
              y2={to.y - uy * (trim + 2)}
              stroke={arrow.hex}
              strokeWidth={compact ? 2 : 2.5}
              strokeLinecap="round"
              strokeOpacity={0.85}
              markerEnd={`url(#mafia-tip-${arrow.hex.slice(1)})`}
            />
          )
        })}
      </svg>

      {/* The village center: what is happening now. */}
      {box.w > 0 && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: cy, width: stageW }}>
          <Stage state={state} myId={myId} beat={beat} beatKey={beatKey} compact={compact} name={name} voteCounts={voteCounts} />
        </div>
      )}

      {/* Seats. */}
      {box.w > 0 && order.map((id) => {
        const player = players[id]
        const seat = seats[id]
        if (!player || !seat) return null
        const revealing = beat?.kind === "death" && beat.playerId === id
        const targetable = canTarget(id)
        const selected = picks.ids.includes(id) || (mode === "vote" && state.dayVotes[myId] === id)
        return (
          <Seat
            key={id}
            x={seat.x}
            y={seat.y}
            width={seatW}
            avatar={avatar}
            name={player.name}
            hue={hueOf(id)}
            you={id === myId}
            alive={player.alive}
            connected={player.connected}
            isBot={Boolean(player.isBot)}
            role={player.role}
            showRoleBadge={!player.alive || over}
            packMate={myRole === "werewolf" && player.role === "werewolf" && player.alive && id !== myId && !over}
            lover={Boolean(state.cupidLovers?.includes(id))}
            seerCheck={state.seerChecks?.[id]}
            votes={voteCounts[id] ?? 0}
            votesHex={showDayVotes ? VOTE_HEX : WOLF_HEX}
            voted={phase === "day-voting" && Boolean(state.dayVotes[id])}
            hunter={state.hunterId === id && phase === "hunter-revenge"}
            winner={over && !reveal && state.winningPlayerIds.includes(id)}
            revealKey={revealing ? beatKey : null}
            targetable={targetable}
            selected={selected}
            selectHex={mode === "vote" ? VOTE_HEX : myTurnHex ?? VOTE_HEX}
            dim={night && !over && id !== myId && !(myRole === "werewolf" && player.role === "werewolf")}
            reaction={reactions[id]}
            onTap={() => tapSeat(id)}
          />
        )
      })}

      {/* Top bar. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-40 flex items-start gap-2 lg:inset-x-6 lg:top-5">
        <button type="button" onClick={onLeave} className={cn(GLASS, "flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition hover:bg-black/65")}>
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
        <div className="hidden pl-2 lg:block">
          <p className="text-lg font-black leading-none tracking-tight">Mafia</p>
          <p className="text-xs text-white/60">Room {roomLabel}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1 lg:absolute lg:left-1/2 lg:w-[min(520px,44vw)] lg:-translate-x-1/2">
          <div
            aria-live="polite"
            className={cn(GLASS, "flex h-11 min-w-0 items-center gap-3 px-4 transition-colors duration-700")}
            style={myTurnHex ? { borderColor: `${myTurnHex}aa`, background: `${myTurnHex}22` } : undefined}
          >
            <PhaseIcon className="size-4 shrink-0 text-white/80" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{title}</p>
              {subtitle && <p className="truncate text-[11px] text-white/60">{subtitle}</p>}
            </div>
            {!connected && <span className="flex shrink-0 items-center gap-1 text-xs text-amber-200"><WifiOff className="size-3.5" />Reconnecting</span>}
            {secondsLeft !== null && (
              <span className={cn("shrink-0 font-mono text-base font-bold tabular-nums", secondsLeft <= 5 && "animate-pulse text-red-300")}>
                {secondsLeft >= 60 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : `${secondsLeft}s`}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-start gap-2">
          <button
            type="button"
            onClick={() => setChatOpen((open) => !open)}
            aria-pressed={chatOpen}
            aria-label="Chat"
            className={cn(GLASS, "relative flex h-11 items-center gap-1.5 px-3 text-sm font-semibold transition hover:bg-black/65", chatOpen && "border-white/30 bg-white/15")}
          >
            <MessageSquare className="size-4" />
            <span className="hidden sm:inline">Chat</span>
            {!chatOpen && chatTotal > chatSeen && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-black" />}
          </button>
          <button
            type="button"
            onClick={() => setLogOpen((open) => !open)}
            aria-pressed={logOpen}
            aria-label="Game log"
            className={cn(GLASS, "flex h-11 items-center gap-1.5 px-3 text-sm font-semibold transition hover:bg-black/65", logOpen && "border-white/30 bg-white/15")}
          >
            <ScrollText className="size-4" />
            <span className="hidden sm:inline">Log</span>
          </button>
          <SoundToggle />
          <ReactionPicker onReact={onReact} disabled={!connected || (!alive && !over)} side="bottom" align="end" />
        </div>
      </div>

      {logOpen && (
        <div className={cn(GLASS, "uno-rise absolute left-3 top-16 z-40 flex max-h-[min(420px,60%)] w-[min(300px,calc(100%-24px))] flex-col p-3 lg:left-6 lg:top-[84px]")}>
          <div className="flex items-center justify-between pb-2 pl-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Village log</p>
            <button type="button" onClick={() => setLogOpen(false)} aria-label="Close" className="grid size-6 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"><X className="size-3.5" /></button>
          </div>
          <ol className="min-h-0 space-y-1.5 overflow-y-auto pr-1">
            {[...state.events].reverse().map((entry, index) => (
              <li key={entry.id} className={cn("px-1 text-xs leading-snug", index === 0 ? "text-white" : "text-white/55")}>{entry.text}</li>
            ))}
          </ol>
        </div>
      )}

      {chatOpen && (
        <ChatPanel
          state={state}
          myId={myId}
          docked={dockChat}
          onClose={() => setChatOpen(false)}
          onSend={onChat}
        />
      )}

      {/* Bottom dock: my role and what I can do. */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-30 flex justify-center p-3" style={{ right: dockChat ? 344 : 0 }}>
        <div
          className={cn(GLASS, "relative flex w-full max-w-[580px] items-center gap-3 p-2.5 transition-colors duration-700")}
          style={myTurnHex ? { borderColor: `${myTurnHex}aa`, boxShadow: `0 0 32px ${myTurnHex}33` } : undefined}
        >
          {myRole && (
            <button
              type="button"
              onClick={() => setPeek((value) => !value)}
              aria-label={peek ? "Hide your role" : "Peek at your role"}
              title={peek ? "Hide your role" : "Tap to peek at your role"}
              className="relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <RoleFlip role={myRole} size="sm" faceUp={peek || over} />
              {!peek && !over && <span className="absolute inset-x-0 -bottom-1 mx-auto w-fit rounded bg-black/70 px-1 text-[8px] font-bold uppercase tracking-wide text-white/70">Peek</span>}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <Dock
              state={state}
              myId={myId}
              mode={mode}
              picks={picks}
              setPicks={setPicks}
              name={name}
              secondsLeft={secondsLeft}
              onNightAction={onNightAction}
              onWitchAction={onWitchAction}
              onCupidAction={onCupidAction}
              onHunterKill={onHunterKill}
              onDayVote={onDayVote}
              onSummary={() => setSummaryClosed(false)}
              onLeave={onLeave}
            />
          </div>
          <ReactionBubble bubble={reactions[myId]} />
        </div>
      </div>

      {error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-50 flex justify-center px-4">
          <p className="rounded-xl border border-red-400/40 bg-red-950/85 px-4 py-2 text-center text-sm text-red-100 backdrop-blur">{error}</p>
        </div>
      )}

      {phase === "role-reveal" && myRole && !roleSeen && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#03050c]/80 p-4 backdrop-blur-sm">
          <div className="uno-fade-in flex flex-col items-center gap-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Your role</p>
            <RoleFlip role={myRole} size="lg" delay={700} />
            {myRole === "werewolf" && (
              <p className="mafia-late max-w-xs text-sm text-red-200" style={{ "--d": "1400ms" } as CSSProperties}>
                {(() => {
                  const pack = state.playerOrder.filter((id) => id !== myId && players[id]?.role === "werewolf").map((id) => players[id]!.name)
                  return pack.length ? `Your pack: ${pack.join(", ")}` : "You hunt alone."
                })()}
              </p>
            )}
            <p className="text-xs text-white/50">Keep it secret. Night falls{secondsLeft ? ` in ${secondsLeft}s` : " soon"}.</p>
            <button type="button" onClick={() => setRoleSeen(true)} className="rounded-xl border border-white/15 bg-white/10 px-5 py-2 text-sm font-semibold transition hover:bg-white/20">Got it</button>
          </div>
        </div>
      )}

      {over && !reveal && !summaryClosed && (
        <Summary state={state} myId={myId} onClose={() => setSummaryClosed(true)} onChats={() => { setSummaryClosed(true); setChatOpen(true) }} onLeave={onLeave} />
      )}
    </div>
  )
}

// ─── Scene ──────────────────────────────────────────────────────────────────

function Scene({ mood, cx, cy, rx, ry }: { mood: Mood; cx: number; cy: number; rx: number; ry: number }) {
  const stars = useMemo(() => {
    let seed = 11
    const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    return Array.from({ length: 70 }, (_, i) => ({ id: i, x: next() * 100, y: next() * 55, r: 0.6 + next() * 1.3, t: 2 + next() * 4, d: next() * 4 }))
  }, [])
  const isNight = mood === "night"
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {(Object.keys(SKY) as Mood[]).map((key) => (
        <div key={key} className="absolute inset-0 transition-opacity duration-[2200ms] ease-in-out" style={{ background: SKY[key], opacity: mood === key ? 1 : 0 }} />
      ))}
      <svg className="absolute inset-0 size-full transition-opacity duration-[2200ms]" style={{ opacity: isNight ? 1 : mood === "dawn" ? 0.25 : 0 }}>
        {stars.map((star) => (
          <circle key={star.id} className="mafia-twinkle" cx={`${star.x}%`} cy={`${star.y}%`} r={star.r} fill="#e8edff" style={{ "--t": `${star.t}s`, "--d": `${star.d}s` } as CSSProperties} />
        ))}
      </svg>
      {/* Moon by night, sun by day. */}
      <div
        className="absolute right-[8%] top-[9%] size-16 rounded-full transition-all duration-[2200ms] sm:size-20"
        style={{ background: "radial-gradient(circle at 35% 35%, #fbfbf2, #d9dccb 60%, #b9bca8)", boxShadow: "0 0 60px 18px rgb(220 225 255 / .18)", opacity: isNight ? 0.95 : 0, transform: isNight ? "none" : "translateY(-40px)" }}
      />
      <div
        className="absolute left-[10%] size-20 rounded-full transition-all duration-[2200ms] sm:size-24"
        style={{ top: mood === "dawn" ? "62%" : "8%", background: "radial-gradient(circle, #fff6d8, #ffd27a 55%, #f59e0b)", boxShadow: "0 0 90px 30px rgb(255 200 110 / .35)", opacity: isNight ? 0 : mood === "dawn" ? 0.9 : 0.75 }}
      />
      {/* Rooftops on the horizon; windows glow at night. */}
      <svg className="absolute inset-x-0 bottom-0 h-[24%] w-full" viewBox="0 0 1200 160" preserveAspectRatio="none">
        <path
          d="M0 160 V96 L40 70 L80 96 V80 H130 L170 52 L210 80 V100 L250 74 L290 100 V88 H340 L380 60 L420 88 V104 L470 66 L520 104 V92 H560 L600 58 L640 92 V100 L690 70 L740 100 V84 H780 L820 54 L860 84 V98 L910 72 L960 98 V86 H1010 L1050 60 L1090 86 V100 L1140 76 L1200 100 V160 Z"
          className="transition-[fill] duration-[2200ms]"
          fill={isNight ? "#070a14" : mood === "dawn" ? "#2a1b2c" : "#2c3a2a"}
        />
        {[[60, 100], [160, 84], [200, 92], [370, 90], [400, 96], [590, 84], [620, 96], [810, 86], [840, 94], [1040, 90], [1070, 96], [1130, 104]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="10" height="12" rx="1" fill="#ffc46b" className="transition-opacity duration-[2200ms]" style={{ opacity: isNight ? 0.85 : 0.1 }} />
        ))}
      </svg>
      {/* The plaza and its fire. */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[50%] transition-[background] duration-[2200ms]"
        style={{
          left: cx,
          top: cy,
          width: rx * 2 + 40,
          height: ry * 2 + 40,
          background: isNight
            ? "radial-gradient(ellipse, rgb(70 82 120 / .32), rgb(25 32 55 / .22) 62%, transparent 71%)"
            : "radial-gradient(ellipse, rgb(214 190 150 / .28), rgb(120 110 80 / .18) 62%, transparent 71%)",
        }}
      />
      <div
        className="mafia-flicker absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-[2200ms]"
        style={{ left: cx, top: cy, width: Math.min(rx, ry) * 1.3, height: Math.min(rx, ry) * 1.3, background: "radial-gradient(circle, rgb(255 160 70 / .38), rgb(255 120 40 / .12) 45%, transparent 70%)", opacity: isNight ? 1 : 0.35 }}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / .45))" }} />
    </div>
  )
}

// ─── Seat ───────────────────────────────────────────────────────────────────

function Seat(props: {
  x: number
  y: number
  width: number
  avatar: number
  name: string
  hue: number
  you: boolean
  alive: boolean
  connected: boolean
  isBot: boolean
  role: PublicGameState["myRole"]
  showRoleBadge: boolean
  packMate: boolean
  lover: boolean
  seerCheck: boolean | undefined
  votes: number
  votesHex: string
  voted: boolean
  hunter: boolean
  winner: boolean
  revealKey: string | null
  targetable: boolean
  selected: boolean
  selectHex: string
  dim: boolean
  reaction: ReactionBubbleState | undefined
  onTap: () => void
}) {
  const { avatar, alive, role, revealKey } = props
  const info = role ? ROLE_INFO[role] : null
  const deadLook: CSSProperties = alive ? {} : { filter: "grayscale(1) brightness(0.6)", opacity: 0.65 }
  const ring = props.selected ? props.selectHex : props.winner ? "#fcd34d" : null
  return (
    <div
      className="absolute z-20 flex -translate-x-1/2 flex-col items-center"
      style={{ left: props.x, top: props.y - avatar / 2, width: props.width }}
    >
      <button
        type="button"
        onClick={props.onTap}
        disabled={!props.targetable}
        aria-label={`${props.name}${props.you ? " (you)" : ""}${alive ? "" : ", dead"}${info && props.showRoleBadge ? `, ${info.label}` : ""}`}
        className={cn(
          "group relative rounded-full transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          props.targetable ? "cursor-pointer hover:scale-110" : "cursor-default",
        )}
        style={{ width: avatar, height: avatar }}
      >
        {revealKey && <span key={revealKey} className="mafia-spot absolute -inset-1 rounded-full" />}
        <span
          key={revealKey ?? "still"}
          className={cn("relative grid size-full place-items-center rounded-full border-2 font-black transition-[opacity,filter,box-shadow] duration-500", revealKey && "mafia-die", props.dim && alive && "opacity-80")}
          style={{
            ...deadLook,
            "--d": `${FALL_MS}ms`,
            fontSize: avatar * 0.42,
            background: `radial-gradient(circle at 35% 30%, hsl(${props.hue} 55% 58%), hsl(${props.hue} 45% 32%))`,
            borderColor: ring ?? (props.you ? "#ffffffcc" : "#ffffff33"),
            boxShadow: ring ? `0 0 0 3px ${ring}66, 0 0 22px ${ring}aa` : props.targetable ? "0 0 0 2px #ffffff55" : "0 6px 16px rgb(0 0 0 / .45)",
          } as CSSProperties}
        >
          {props.name.charAt(0).toUpperCase()}
        </span>
        {!alive && (
          <span key={`skull-${revealKey ?? "still"}`} className={cn("absolute inset-0 grid place-items-center", revealKey && "mafia-pop")} style={{ "--d": `${FALL_MS}ms` } as CSSProperties}>
            <Skull className="size-1/2 text-white/90 drop-shadow" />
          </span>
        )}
        {props.targetable && !props.selected && <span className="absolute -inset-1 rounded-full border-2 border-dashed border-white/40 opacity-0 transition group-hover:opacity-100" />}
        {props.votes > 0 && (
          <span key={props.votes} className="mafia-pop absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full border border-black/40 px-1 text-[11px] font-black text-black" style={{ background: props.votesHex }}>
            {props.votes}
          </span>
        )}
        <span className="absolute -bottom-1 -left-1.5 flex gap-0.5">
          {props.isBot && <Badge title="Bot" className="bg-slate-700 text-white"><Bot className="size-2.5" /></Badge>}
          {props.packMate && <Badge title="Your pack" className="bg-red-600 text-white"><Moon className="size-2.5" /></Badge>}
          {props.lover && <Badge title="Lover" className="bg-pink-500 text-white"><Heart className="size-2.5" /></Badge>}
          {props.seerCheck !== undefined && (
            <Badge title={props.seerCheck ? "You saw a werewolf" : "You saw no werewolf"} className={props.seerCheck ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}><Eye className="size-2.5" /></Badge>
          )}
          {props.hunter && <Badge title="The Hunter" className="bg-orange-500 text-white"><Crosshair className="size-2.5" /></Badge>}
          {props.winner && <Badge title="Winner" className="bg-amber-300 text-black"><Trophy className="size-2.5" /></Badge>}
        </span>
        {props.voted && <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-300 text-black"><Check className="size-2.5" /></span>}
        {!props.connected && !props.isBot && <span title="Disconnected" className="absolute -right-1 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full bg-black/80"><WifiOff className="size-2.5 text-amber-200" /></span>}
        <ReactionBubble bubble={props.reaction} />
      </button>
      <span className={cn("mt-1.5 max-w-full truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold backdrop-blur", props.you ? "text-white" : "text-white/85", !alive && "text-white/50 line-through decoration-white/30")}>
        {props.you ? "You" : props.name}
      </span>
      {props.showRoleBadge && info && (
        <span
          key={`role-${revealKey ?? "still"}`}
          className={cn("mt-1 flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-bold", revealKey && "mafia-pop")}
          style={{ color: info.hex, borderColor: `${info.hex}66`, background: "rgb(0 0 0 / .6)", "--d": `${FLIP_MS}ms` } as CSSProperties}
        >
          <info.Icon className="size-2.5" />
          {info.label}
        </span>
      )}
    </div>
  )
}

function Badge({ title, className, children }: { title: string; className: string; children: ReactNode }) {
  return <span title={title} className={cn("grid size-4 place-items-center rounded-full ring-2 ring-black/60", className)}>{children}</span>
}

// ─── Stage: the plaza center ────────────────────────────────────────────────

function Stage({ state, myId, beat, beatKey, compact, name, voteCounts }: {
  state: PublicGameState
  myId: string
  beat: RevealBeat | null
  beatKey: string | null
  compact: boolean
  name: (id: string | null | undefined) => string
  voteCounts: Record<string, number>
}) {
  const { phase, players } = state
  const card = (children: ReactNode, key: string, tone?: string) => (
    <div key={key} className="uno-pop flex flex-col items-center gap-2 rounded-3xl border border-white/10 bg-black/55 px-4 py-4 text-center shadow-2xl backdrop-blur-md" style={tone ? { borderColor: `${tone}55`, boxShadow: `0 0 50px ${tone}22` } : undefined}>
      {children}
    </div>
  )

  if (beat && beatKey) {
    switch (beat.kind) {
      case "sunrise":
        return card(<>
          <Sunrise className="size-9 text-amber-200" />
          <p className="text-xl font-black">Day {state.dayNumber}</p>
          <p className="text-sm text-white/70">The sun rises over the village…</p>
        </>, beatKey, "#fbbf24")
      case "peaceful":
        return card(<>
          <Sun className="size-9 text-amber-200" />
          <p className="text-lg font-black">A peaceful night</p>
          <p className="text-sm text-white/70">Everyone wakes up. No one died.</p>
        </>, beatKey, "#fbbf24")
      case "death": {
        const player = players[beat.playerId]
        const role = player?.role ?? null
        const headline = {
          night: `${name(beat.playerId)} ${beat.playerId === myId ? "were" : "was"} found dead`,
          vote: `${name(beat.playerId)} ${beat.playerId === myId ? "are" : "is"} eliminated`,
          hunter: `${name(beat.byId)} ${beat.byId === myId ? "shoot" : "shoots"} ${beat.playerId === myId ? "you" : name(beat.playerId)}`,
          heartbreak: `${name(beat.playerId)} ${beat.playerId === myId ? "die" : "dies"} of a broken heart`,
        }[beat.cause]
        const CauseIcon = beat.cause === "heartbreak" ? Heart : beat.cause === "hunter" ? Crosshair : beat.cause === "vote" ? Gavel : Skull
        return card(<>
          <CauseIcon className={cn("size-7", beat.cause === "heartbreak" ? "text-pink-300" : beat.cause === "hunter" ? "text-orange-300" : "text-white/80")} />
          <p className="text-base font-black leading-tight sm:text-lg">{headline}</p>
          <RoleFlip role={role} size={compact ? "sm" : "md"} delay={FLIP_MS} className={compact ? "scale-125 my-2" : undefined} />
          {role && (
            <p className="mafia-late text-sm text-white/80" style={{ "--d": `${FLIP_MS + 400}ms` } as CSSProperties}>
              {beat.playerId === myId ? "You were" : "They were"} <span className="font-bold" style={{ color: ROLE_INFO[role].hex }}>{ROLE_INFO[role].phrase}</span>.
            </p>
          )}
        </>, beatKey, role ? ROLE_INFO[role].hex : undefined)
      }
      case "tally": {
        const rows = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
        const abstained = Object.values(state.dayVotes).filter((target) => target === "abstain").length
        const voters = Math.max(1, Object.keys(state.dayVotes).length)
        const tie = rows.length > 1 && rows[0][1] === rows[1][1]
        const verdictAt = 400 + rows.length * 350 + 500
        return card(<>
          <Gavel className="size-7 text-amber-200" />
          <p className="text-base font-black">The votes are in</p>
          <div className="w-full space-y-1.5">
            {rows.length === 0 && <p className="text-sm text-white/60">No one voted.</p>}
            {rows.map(([id, count], i) => (
              <div key={id} className="flex items-center gap-2 text-xs">
                <span className="w-16 truncate text-right font-semibold">{name(id)}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="mafia-bar h-full rounded-full" style={{ width: `${(count / voters) * 100}%`, background: VOTE_HEX, "--d": `${400 + i * 350}ms` } as CSSProperties} />
                </div>
                <span className="mafia-late w-4 font-black tabular-nums" style={{ "--d": `${700 + i * 350}ms` } as CSSProperties}>{count}</span>
              </div>
            ))}
            {abstained > 0 && <p className="text-[11px] text-white/50">{abstained} abstained</p>}
          </div>
          <p className="mafia-late text-sm font-bold" style={{ "--d": `${verdictAt}ms` } as CSSProperties}>
            {beat.eliminatedId ? `${name(beat.eliminatedId)} ${beat.eliminatedId === myId ? "have" : "has"} the most votes` : tie ? "It's a tie" : "No one stands out"}
          </p>
        </>, beatKey, VOTE_HEX)
      }
      case "spared":
        return card(<>
          <Users className="size-8 text-sky-200" />
          <p className="text-lg font-black">{beat.tie ? "A tied vote" : "No one is eliminated"}</p>
          <p className="text-sm text-white/70">The village goes home uneasy.</p>
        </>, beatKey)
      case "win": {
        const info = WIN_INFO[beat.winner]
        const winners = state.winningPlayerIds.map((id) => name(id)).join(", ")
        return card(<>
          <div className="relative">
            {beat.winner === "lovers" && [0, 0.5, 1, 1.5, 2].map((delay, i) => (
              <Heart key={i} className="mafia-float absolute size-5 fill-pink-400 text-pink-400" style={{ left: `${-30 + i * 18}px`, top: 0, "--d": `${delay}s` } as CSSProperties} />
            ))}
            <info.Icon className={cn("size-12", beat.winner === "jester" && "mafia-wobble")} style={{ color: info.hex }} />
          </div>
          <p className="text-2xl font-black" style={{ color: info.hex }}>{info.title}</p>
          <p className="text-sm text-white/75">{info.line}</p>
          {winners && <p className="mafia-late text-xs text-white/60" style={{ "--d": "900ms" } as CSSProperties}>{winners}</p>}
        </>, beatKey, info.hex)
      }
    }
  }

  switch (phase) {
    case "role-reveal":
      return card(<><Moon className="size-8 text-indigo-200" /><p className="font-bold">Roles are being dealt</p></>, "deal")
    case "first-night":
    case "night":
      return card(<>
        <Flame className="mafia-flicker size-8 text-amber-300" />
        <p className="text-lg font-black">Night {state.dayNumber}</p>
        <p className="text-sm text-white/70">{SUB_PHASE_TEXT[state.nightSubPhase]}…</p>
      </>, `night-${state.dayNumber}`, "#6366f1")
    case "day-discussion":
      return card(<>
        <Sun className="size-8 text-amber-200" />
        <p className="text-lg font-black">Day {state.dayNumber}</p>
        <p className="text-sm text-white/70">Talk it over. Who's lying?</p>
      </>, `day-${state.dayNumber}`)
    case "day-voting": {
      const alive = state.playerOrder.filter((id) => players[id]?.alive).length
      const cast = Object.keys(state.dayVotes).length
      return card(<>
        <Gavel className="size-8 text-amber-200" />
        <p className="text-lg font-black">The village votes</p>
        <p className="text-sm text-white/70">{cast} of {alive} have voted</p>
      </>, `vote-${state.dayNumber}`, VOTE_HEX)
    }
    case "hunter-revenge":
      return card(<>
        <Crosshair className="size-8 animate-pulse text-orange-300" />
        <p className="text-lg font-black">{name(state.hunterId)} {state.hunterId === myId ? "take" : "takes"} aim</p>
        <p className="text-sm text-white/70">The Hunter takes one last shot…</p>
      </>, "hunter", SHOT_HEX)
    case "game-over": {
      if (!state.winner) return null
      const info = WIN_INFO[state.winner]
      return card(<><info.Icon className="size-8" style={{ color: info.hex }} /><p className="text-lg font-black" style={{ color: info.hex }}>{info.title}</p></>, "over", info.hex)
    }
    default:
      return null
  }
}

// ─── Dock: my action ────────────────────────────────────────────────────────

function Dock({ state, myId, mode, picks, setPicks, name, secondsLeft, onNightAction, onWitchAction, onCupidAction, onHunterKill, onDayVote, onSummary, onLeave }: {
  state: PublicGameState
  myId: string
  mode: Mode
  picks: { ids: string[]; heal: boolean; poison: boolean }
  setPicks: (patch: Partial<{ ids: string[]; heal: boolean; poison: boolean }>) => void
  name: (id: string | null | undefined) => string
  secondsLeft: number | null
  onNightAction: (targetId: string) => void
  onWitchAction: (heal: boolean, killTargetId: string | null) => void
  onCupidAction: (lover1: string, lover2: string) => void
  onHunterKill: (targetId: string) => void
  onDayVote: (targetId: string) => void
  onSummary: () => void
  onLeave: () => void
}) {
  const { phase, myRole } = state
  const alive = state.players[myId]?.alive ?? false
  const night = phase === "night" || phase === "first-night"
  const target = picks.ids[0]
  const hint = (text: ReactNode, sub?: ReactNode) => (
    <div className="min-w-0 leading-tight">
      <p className="text-sm font-semibold">{text}</p>
      {sub && <p className="mt-0.5 text-xs text-white/60">{sub}</p>}
    </div>
  )
  const action = (label: string, onClick: () => void, hex: string, disabled = false, Icon?: typeof Check) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-black shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: hex }}
    >
      {Icon && <Icon className="size-4" />}
      {label}
    </button>
  )
  const row = (left: ReactNode, right?: ReactNode) => (
    <div className="flex min-h-11 items-center justify-between gap-3">{left}{right}</div>
  )

  if (state.reveal) {
    return row(hint(phase === "game-over" ? "The game is over" : "Watch the village…", phase === "dawn" ? "Morning news is coming in" : undefined))
  }

  if (phase === "role-reveal") return row(hint("Memorize your role", "Tap the card on the left any time to peek."))

  if (phase === "game-over") {
    return row(
      hint(state.winningPlayerIds.includes(myId) ? "You won!" : "Better luck next time", "Every role and chat is now revealed."),
      <div className="flex gap-2">
        <button type="button" onClick={onSummary} className="h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold transition hover:bg-white/20">Summary</button>
        <button type="button" onClick={onLeave} className="h-10 rounded-xl bg-white px-3 text-sm font-bold text-black transition hover:bg-white/85">Leave</button>
      </div>,
    )
  }

  if (!alive && phase !== "hunter-revenge") return row(hint("You are a ghost", "Watch on. Only the dead can read the ghost chat."))

  const hex = myRole ? ROLE_INFO[myRole].hex : VOTE_HEX
  switch (mode) {
    case "wolf":
      return row(
        hint(target ? <>Hunt <b>{name(target)}</b>?</> : "Tap a villager to hunt", "Your pack's picks show as red arrows."),
        action("Hunt", () => target && onNightAction(target), hex, !target, Moon),
      )
    case "seer":
      return row(hint(target ? <>Inspect <b>{name(target)}</b>?</> : "Tap a player to inspect"), action("Inspect", () => target && onNightAction(target), hex, !target, Eye))
    case "doctor":
      return row(
        hint(target ? <>Protect <b>{name(target)}</b> tonight?</> : "Tap a player to protect", state.doctorLastTarget ? `Not ${name(state.doctorLastTarget)} again.` : "You may protect yourself."),
        action("Protect", () => target && onNightAction(target), hex, !target, Shield),
      )
    case "witch": {
      const attacked = state.witchWerewolfTarget
      const canHeal = !state.witchHealUsed && Boolean(attacked)
      const canPoison = !state.witchKillUsed
      const toggle = (on: boolean, label: ReactNode, onClick: () => void, tone: string) => (
        <button type="button" onClick={onClick} className="h-9 rounded-lg border px-2.5 text-xs font-bold transition" style={on ? { background: tone, color: "#000", borderColor: tone } : { borderColor: `${tone}88`, color: tone }}>
          {label}
        </button>
      )
      return (
        <div className="space-y-2">
          <p className="text-xs text-white/65">
            {attacked ? <>The wolves attacked <b className="text-white">{name(attacked)}</b>.</> : "The wolves attacked no one."}
            {picks.poison && (target ? <> Poison <b className="text-white">{name(target)}</b>.</> : " Tap a player to poison.")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canHeal && toggle(picks.heal, picks.heal ? "Will heal" : `Heal ${name(attacked)}`, () => setPicks({ heal: !picks.heal }), "#34d399")}
            {canPoison && toggle(picks.poison, picks.poison ? "Poison on" : "Poison", () => setPicks({ poison: !picks.poison, ids: [] }), "#f87171")}
            {!canHeal && !canPoison && <span className="text-xs text-white/50">No potions left.</span>}
            <span className="flex-1" />
            {action(picks.heal || (picks.poison && target) ? "Brew" : "Do nothing", () => onWitchAction(picks.heal, picks.poison ? target ?? null : null), hex, picks.poison && !target, Sparkles)}
          </div>
        </div>
      )
    }
    case "cupid":
      return row(
        hint(picks.ids.length === 2 ? <>Link <b>{name(picks.ids[0])}</b> and <b>{name(picks.ids[1])}</b>?</> : `Tap two players to fall in love (${picks.ids.length}/2)`, "If one lover dies, so does the other."),
        action("Link", () => picks.ids.length === 2 && onCupidAction(picks.ids[0], picks.ids[1]), hex, picks.ids.length !== 2, Heart),
      )
    case "hunter":
      return row(
        hint(target ? <>Shoot <b>{name(target)}</b>?</> : "You fell! Tap someone to take down with you", secondsLeft !== null ? `${secondsLeft}s to decide` : undefined),
        action("Shoot", () => target && onHunterKill(target), SHOT_HEX, !target, Crosshair),
      )
    case "vote": {
      const mine = state.dayVotes[myId]
      return row(
        hint(mine ? (mine === "abstain" ? "You abstained" : <>You vote for <b>{name(mine)}</b></>) : "Tap a player to vote them out", mine ? "Tap another player to change your vote." : "Votes are public."),
        <button
          type="button"
          onClick={() => onDayVote("abstain")}
          disabled={mine === "abstain"}
          className="h-10 shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold transition hover:bg-white/20 disabled:opacity-40"
        >
          Abstain
        </button>,
      )
    }
  }

  if (night) {
    if (state.seerResult) {
      const { targetId, isWerewolf } = state.seerResult
      return row(hint(<><b>{name(targetId)}</b> is <span className={isWerewolf ? "font-black text-red-300" : "font-black text-emerald-300"}>{isWerewolf ? "a Werewolf!" : "not a Werewolf"}</span></>, "Keep it to yourself, or don't."))
    }
    if (myRole === "werewolf" && state.werewolfVotes?.[myId]) return row(hint(<>You chose <b>{name(state.werewolfVotes[myId])}</b></>, "Waiting for the rest of the pack."))
    return row(hint("You are asleep…", `${SUB_PHASE_TEXT[state.nightSubPhase]}.`))
  }
  if (phase === "day-discussion") return row(hint("Discuss with the village", secondsLeft !== null ? `Voting opens in ${secondsLeft}s` : undefined))
  if (phase === "hunter-revenge") return row(hint(`${name(state.hunterId)} the Hunter is choosing a target…`))
  return row(hint("…"))
}

// ─── Chat ───────────────────────────────────────────────────────────────────

function ChatPanel({ state, myId, docked, onClose, onSend }: {
  state: PublicGameState
  myId: string
  docked: boolean
  onClose: () => void
  onSend: (text: string, channel: ChatChannel) => void
}) {
  const { phase, myRole } = state
  const alive = state.players[myId]?.alive ?? false
  const night = phase === "night" || phase === "first-night"
  const over = phase === "game-over"
  const playing = state.status === "playing"
  const dayOpen = phase === "day-discussion" || phase === "day-voting"

  const tabs: { id: ChatChannel; label: string; messages: ChatMessage[]; canSend: boolean; closed: string; hex: string }[] = [
    {
      id: "day",
      label: "Village",
      messages: over ? state.chat : state.chat.filter((message) => message.dayNumber === state.dayNumber),
      canSend: playing && alive && dayOpen,
      closed: !alive ? "The dead can't speak to the village" : over ? "The game is over" : "The village talks by day",
      hex: "#fde68a",
    },
  ]
  if (state.wolfChat) {
    tabs.push({
      id: "wolf",
      label: "Pack",
      messages: state.wolfChat,
      canSend: playing && alive && myRole === "werewolf" && night,
      closed: over ? "The game is over" : !alive ? "Dead wolves howl in the ghost chat" : "The pack talks at night",
      hex: "#fca5a5",
    })
  }
  if (state.ghostChat) {
    tabs.push({ id: "ghost", label: "Ghosts", messages: state.ghostChat, canSend: playing && !alive, closed: "The game is over", hex: "#c4b5fd" })
  }

  const preferred: ChatChannel = !alive && state.ghostChat && !over ? "ghost" : night && state.wolfChat && alive ? "wolf" : "day"
  const contextKey = `${phase}:${alive}`
  const [picked, setPicked] = useState<{ key: string; tab: ChatChannel }>({ key: "", tab: "day" })
  const tabId = picked.key === contextKey && tabs.some((tab) => tab.id === picked.tab) ? picked.tab : preferred
  const tab = tabs.find((candidate) => candidate.id === tabId) ?? tabs[0]

  const [text, setText] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [tab.id, tab.messages.length])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() || !tab.canSend) return
    onSend(text.trim(), tab.id)
    setText("")
  }

  return (
    <div className={cn(GLASS, "z-40 flex flex-col overflow-hidden", docked ? "absolute bottom-3 right-3 top-[84px] w-[320px]" : "uno-rise absolute right-3 top-16 h-[min(440px,58%)] w-[min(340px,calc(100%-24px))]")}>
      <div className="flex items-center gap-1 border-b border-white/10 p-1.5">
        {tabs.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setPicked({ key: contextKey, tab: candidate.id })}
            className={cn("rounded-lg px-2.5 py-1 text-xs font-bold transition", candidate.id === tab.id ? "bg-white/15" : "text-white/55 hover:bg-white/10")}
            style={candidate.id === tab.id ? { color: candidate.hex } : undefined}
          >
            {candidate.label}
            {candidate.messages.length > 0 && <span className="ml-1 text-[10px] text-white/40">{candidate.messages.length}</span>}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close chat" className="grid size-7 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white"><X className="size-3.5" /></button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 select-text">
        {tab.messages.length === 0 && <p className="text-center text-xs text-white/40">No messages yet</p>}
        {tab.messages.map((message, index) => {
          const newDay = index === 0 || tab.messages[index - 1].dayNumber !== message.dayNumber
          const showDay = newDay && (over || tab.id !== "day")
          return (
            <div key={message.id}>
              {showDay && <p className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-white/35">{tab.id === "wolf" ? "Night" : "Day"} {message.dayNumber}</p>}
              <p className="text-[13px] leading-snug">
                <span className="font-bold" style={{ color: `hsl(${hueOf(message.playerId)} 70% 72%)` }}>{message.playerId === myId ? "You" : message.playerName}</span>
                <span className="text-white/85"> {message.text}</span>
              </p>
            </div>
          )
        })}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
          disabled={!tab.canSend}
          placeholder={tab.canSend ? (tab.id === "wolf" ? "Whisper to the pack…" : tab.id === "ghost" ? "Speak to the dead…" : "Say something…") : tab.closed}
          className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none disabled:opacity-60"
        />
        <button type="submit" disabled={!tab.canSend || !text.trim()} aria-label="Send" className="grid size-9 place-items-center rounded-lg bg-white/15 transition hover:bg-white/25 disabled:opacity-40">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}

// ─── Game over summary ──────────────────────────────────────────────────────

function Summary({ state, myId, onClose, onChats, onLeave }: { state: PublicGameState; myId: string; onClose: () => void; onChats: () => void; onLeave: () => void }) {
  const info = state.winner ? WIN_INFO[state.winner] : null
  const won = state.winningPlayerIds.includes(myId)
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className={cn(GLASS, "uno-pop flex max-h-full w-full max-w-md flex-col gap-4 overflow-hidden p-5")}>
        <div className="text-center">
          {info && <info.Icon className="mx-auto size-10" style={{ color: info.hex }} />}
          <h2 className="mt-2 text-2xl font-black" style={info ? { color: info.hex } : undefined}>{info?.title ?? "Game over"}</h2>
          <p className={cn("mt-1 flex items-center justify-center gap-1.5 text-sm", won ? "text-amber-200" : "text-white/60")}>
            {won && <Trophy className="size-4" />}
            {won ? "You won!" : "Better luck next time."}
          </p>
        </div>
        <ul className="min-h-0 space-y-1 overflow-y-auto">
          {state.playerOrder.map((id) => {
            const player = state.players[id]
            if (!player) return null
            const role = player.role ? ROLE_INFO[player.role] : null
            return (
              <li key={id} className={cn("flex items-center gap-2 rounded-xl px-3 py-2", state.winningPlayerIds.includes(id) ? "bg-white/10" : "bg-white/[.03]")}>
                <span className={cn("min-w-0 flex-1 truncate text-sm", !player.alive && "text-white/50")}>{player.name}{id === myId && <span className="text-white/40"> (you)</span>}</span>
                {!player.alive && <Skull className="size-3.5 text-white/40" />}
                {role && <span className="flex items-center gap-1 text-xs font-bold" style={{ color: role.hex }}><role.Icon className="size-3" />{role.label}</span>}
                {state.winningPlayerIds.includes(id) && <Trophy className="size-3.5 text-amber-300" />}
              </li>
            )
          })}
        </ul>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-white/15 bg-white/10 text-sm font-semibold transition hover:bg-white/20">Table</button>
          <button type="button" onClick={onChats} className="h-10 rounded-xl border border-white/15 bg-white/10 text-sm font-semibold transition hover:bg-white/20">All chats</button>
          <button type="button" onClick={onLeave} className="h-10 rounded-xl bg-white text-sm font-bold text-black transition hover:bg-white/85">Leave</button>
        </div>
      </div>
    </div>
  )
}
