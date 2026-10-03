import { ArrowLeft, ArrowRight, Bot, Coffee, Crown, Flag, Pause, Play, RefreshCw, ScrollText, WifiOff, X } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { BOT_LEVEL_LABELS } from "@/lib/botLevel"
import { evaluateBestHand } from "@/lib/poker/handEvaluator"
import { calculatePots } from "@/lib/poker/potCalculator"
import { cn } from "@/lib/utils"
import type { PokerLogEntry, PublicGameState, PublicPlayer, SeatAction } from "../../../../party/poker"
import { BettingControls } from "./v2/BettingControlsV2"
import { ChipStack } from "./v2/ChipStackV2"
import { GameOverModal } from "./v2/GameOverModalV2"
import { FlipCard, SuitIcon, cardRankLabel, cardSuitOf } from "./v2/PlayingCardV2"
import { PokerHandGuide } from "./v2/PokerHandGuideV2"

export interface PokerGameProps {
  state: PublicGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  error: string | null
  connected: boolean
  onFold: () => void
  onCheck: () => void
  onCall: () => void
  onRaise: (amount: number) => void
  onAllIn: () => void
  onNextHand: () => void
  onToggleAutoDeal: () => void
  onRebuy: () => void
  onToggleSitOut: () => void
  onEndGame: () => void
  onShowCards: (cards: number[]) => void
  onMuck: () => void
  onLeave: () => void
}

const potLabel = (index: number, short = false) =>
  index === 0 ? (short ? "Main" : "Main pot") : short ? `Side ${index}` : `Side pot ${index}`

type PreAction = "check-fold" | "call-any" | "check"

const PRE_ACTIONS: { key: PreAction; label: string }[] = [
  { key: "check-fold", label: "Check / Fold" },
  { key: "call-any", label: "Call any" },
  { key: "check", label: "Check" },
]

interface Pt { x: number; y: number }
interface Ghost { id: string; from: Pt; to: Pt; amount: number; delay: number }

const GLASS = "pointer-events-auto rounded-2xl border border-white/10 bg-black/45 shadow-2xl backdrop-blur-md"
const DEAL_STEP_MS = 110
const SWEEP_MS = 520
const AVATAR_COLORS = ["#e76f51", "#2a9d8f", "#e9c46a", "#8ab17d", "#7b8cde", "#d16ba5", "#f4a261", "#5fa8d3"]
const RANK_PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"]
const STREET_LABEL: Record<string, string> = { "pre-flop": "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" }

function hash(text: string) {
  let value = 7
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) | 0
  return Math.abs(value)
}
const avatarColor = (id: string) => AVATAR_COLORS[hash(id) % AVATAR_COLORS.length]
const initials = (name: string) => name.trim().slice(0, 2).toUpperCase()

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const update = () => setReduced(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return reduced
}

/** The table is a stadium; seats sit on a superellipse that hugs its rail. */
function tableGeometry(w: number, h: number) {
  const compact = w < 640
  const portrait = h > w * 1.05
  const top = compact ? 50 : 62
  const bottom = compact ? 8 : 16
  const seatH = compact ? 54 : 92
  const seatV = compact ? 40 : 50
  const availW = Math.max(120, w - 2 * seatH)
  const availH = Math.max(120, h - top - bottom - 2 * seatV)
  let tw: number
  let th: number
  if (portrait) {
    tw = Math.min(availW, availH / 1.35)
    th = Math.min(availH, tw * 1.7)
  } else {
    th = Math.min(availH, availW / 1.9)
    tw = Math.min(availW, th * 2.2)
  }
  const a = tw / 2
  const b = th / 2
  const cardW = Math.round(Math.max(32, Math.min(78, portrait ? a * 0.27 : a * 0.24, b * 0.38)))
  const heroW = Math.round(Math.max(46, Math.min(92, cardW * 1.18)))
  return {
    compact,
    portrait,
    cx: w / 2,
    cy: top + seatV + availH / 2,
    a,
    b,
    rail: Math.max(12, Math.min(28, Math.min(a, b) * 0.11)),
    cardW,
    seatCardW: Math.round(Math.max(22, cardW * 0.6)),
    showCardW: Math.round(Math.max(30, cardW * 0.82)),
    heroW,
  }
}
type Geo = ReturnType<typeof tableGeometry>

function ring(geo: Geo, angle: number, f: number): Pt {
  const t = (angle * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const p = 2 / 3.2
  return { x: geo.cx + geo.a * f * Math.sign(c) * Math.abs(c) ** p, y: geo.cy + geo.b * f * Math.sign(s) * Math.abs(s) ** p }
}

function describeHole(cards: number[]) {
  if (cards.length !== 2) return null
  const [r1, r2] = [cards[0] % 13, cards[1] % 13]
  if (r1 === r2) return `Pocket ${RANK_PLURAL[r1]}`
  const [hi, lo] = r1 > r2 ? [cards[0], cards[1]] : [cards[1], cards[0]]
  const suited = cardSuitOf(cards[0]) === cardSuitOf(cards[1])
  return `${cardRankLabel(hi)}-${cardRankLabel(lo)} ${suited ? "suited" : "offsuit"}`
}

function actionText(action: SeatAction) {
  switch (action.kind) {
    case "sb": return "Small blind"
    case "bb": return "Big blind"
    case "check": return "Check"
    case "call": return "Call"
    case "bet": return "Bet"
    case "raise": return "Raise"
    case "all-in": return "All in"
    case "fold": return "Fold"
  }
}

const ACTION_TONE: Record<SeatAction["kind"], string> = {
  sb: "bg-slate-200/90 text-slate-900",
  bb: "bg-slate-200/90 text-slate-900",
  check: "bg-sky-300 text-sky-950",
  call: "bg-emerald-300 text-emerald-950",
  bet: "bg-amber-300 text-amber-950",
  raise: "bg-amber-300 text-amber-950",
  "all-in": "bg-gradient-to-r from-rose-500 to-orange-400 text-white",
  fold: "bg-zinc-600 text-zinc-100",
}

function MiniCards({ cards }: { cards: number[] }) {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {cards.map((card) => (
        <span key={card} className={cn("inline-flex items-center rounded-[3px] bg-white px-[3px] text-[10px] font-black leading-4", cardSuitOf(card) === 1 || cardSuitOf(card) === 2 ? "text-[#c8102e]" : "text-[#16161d]")}>
          {cardRankLabel(card)}
          <SuitIcon suit={cardSuitOf(card)} className="h-2.5 w-2.5" />
        </span>
      ))}
    </span>
  )
}

function logLine(entry: PokerLogEntry, me: string): { text: ReactNode; tone?: string } {
  const who = entry.playerId === me ? "You" : entry.name ?? "Someone"
  const n = (value?: number) => (value ?? 0).toLocaleString()
  switch (entry.kind) {
    case "hand": return { text: `Hand #${entry.amount} · ${entry.playerId === me ? "you have" : `${who} has`} the button`, tone: "text-white/80 font-semibold" }
    case "blinds-up": return { text: `Blinds go up to ${n(entry.amount)}/${n((entry.amount ?? 0) * 2)}`, tone: "text-amber-200" }
    case "sb": return { text: `${who} posted the small blind ${n(entry.amount)}` }
    case "bb": return { text: `${who} posted the big blind ${n(entry.amount)}` }
    case "fold": return { text: `${who} folded`, tone: "text-white/45" }
    case "check": return { text: `${who} checked` }
    case "call": return { text: `${who} called ${n(entry.amount)}${entry.allIn ? " and is all in" : ""}` }
    case "bet": return { text: `${who} bet ${n(entry.amount)}`, tone: "text-amber-100" }
    case "raise": return { text: `${who} raised to ${n(entry.amount)}`, tone: "text-amber-100" }
    case "all-in": return { text: `${who} went all in · ${n(entry.amount)}`, tone: "text-rose-200" }
    case "street": return { text: <>{STREET_LABEL[entry.round ?? ""] ?? "Board"} <MiniCards cards={entry.cards ?? []} /></>, tone: "text-emerald-200 font-semibold" }
    case "show": return { text: <>{who} showed <MiniCards cards={entry.cards ?? []} />{entry.hand && <> · {entry.hand}</>}</> }
    case "muck": return { text: `${who} mucked`, tone: "text-white/45" }
    case "win": return { text: `${who} won ${n(entry.amount)}${entry.hand ? ` with ${entry.hand}` : ""}`, tone: "text-amber-300 font-semibold" }
    case "timeout": return { text: `${who} ran out of time`, tone: "text-rose-300" }
    case "rebuy": return { text: `${who} bought back in for ${n(entry.amount)}`, tone: "text-sky-200" }
    case "sit-out": return { text: `${who} ${entry.playerId === me ? "are" : "is"} sitting out`, tone: "text-white/45" }
    case "sit-in": return { text: `${who} ${entry.playerId === me ? "are" : "is"} back in`, tone: "text-white/65" }
  }
}

function TurnRing({ deadline, total, offset, size }: { deadline: number; total: number; offset: number; size: number }) {
  const remaining = Math.max(0, deadline - (Date.now() + offset))
  const elapsed = Math.max(0, total - remaining)
  const r = size / 2 + 3
  const length = 2 * Math.PI * r
  return (
    <svg key={deadline} className="pointer-events-none absolute -rotate-90" width={size + 10} height={size + 10} style={{ left: -5, top: -5 }} aria-hidden="true">
      <circle
        cx={size / 2 + 5}
        cy={size / 2 + 5}
        r={r}
        fill="none"
        strokeWidth={3.5}
        strokeLinecap="round"
        className="poker-timer"
        style={{ strokeDasharray: length, ["--len" as string]: `${length}`, animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` } as CSSProperties}
      />
    </svg>
  )
}

function SeatPlate({ player, isMe, active, winner, compact, deadline, total, offset }: {
  player: PublicPlayer
  isMe: boolean
  active: boolean
  winner: boolean
  compact: boolean
  deadline: number | null
  total: number
  offset: number
}) {
  const avatar = compact ? 30 : 40
  const out = player.chips <= 0 && !player.hasCards
  const away = player.sittingOut && !player.hasCards
  return (
    <div
      className={cn(
        "relative flex items-center rounded-full border py-1 pl-1 shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-md transition-all duration-300",
        compact ? "w-[104px] gap-1.5 pr-2" : "w-[156px] gap-2 pr-3",
        active ? "border-amber-200/80 bg-[#2a2210]/90 shadow-[0_0_0_3px_rgba(253,230,138,0.25),0_0_28px_rgba(253,230,138,0.35)]" : "border-white/12 bg-[#0c0f0e]/85",
        winner && "poker-win-glow border-amber-300 bg-[#3a2c0a]/95",
        (player.folded || out || away) && !winner && "opacity-50 grayscale",
      )}
    >
      <div className="relative shrink-0" style={{ width: avatar, height: avatar }}>
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-black text-black/80 ring-2 ring-black/40"
          style={{ background: `linear-gradient(145deg, ${avatarColor(player.id)}, color-mix(in srgb, ${avatarColor(player.id)} 55%, black))`, fontSize: compact ? 11 : 14 }}
        >
          {player.isBot ? <Bot className={compact ? "h-4 w-4" : "h-5 w-5"} /> : initials(player.name)}
        </div>
        {active && deadline && <TurnRing deadline={deadline} total={total} offset={offset} size={avatar} />}
        {winner && <Crown className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2 fill-amber-300 text-amber-300 drop-shadow" />}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1">
          <span className={cn("truncate font-semibold text-white/90", compact ? "text-[10px]" : "text-xs")}>{isMe ? "You" : player.name}</span>
          {!player.connected && <WifiOff className="h-3 w-3 shrink-0 text-rose-400" />}
          {player.isBot && player.botLevel && (
            <span title={`${BOT_LEVEL_LABELS[player.botLevel]} bot`} className="shrink-0 rounded-full bg-white/10 px-1 text-[9px] font-bold uppercase text-white/60">
              {compact ? BOT_LEVEL_LABELS[player.botLevel][0] : BOT_LEVEL_LABELS[player.botLevel]}
            </span>
          )}
          {player.sittingOut && <Coffee aria-label="Sitting out" className="h-3 w-3 shrink-0 text-sky-300" />}
          {player.rebuys > 0 && (
            <span title={`Rebought ${player.rebuys}×`} className="flex shrink-0 items-center gap-px rounded-full bg-white/10 px-1 font-mono text-[9px] font-bold text-white/60">
              <RefreshCw className="h-2 w-2" />{player.rebuys}
            </span>
          )}
        </div>
        <div className={cn("font-mono font-bold tabular-nums", compact ? "text-[11px]" : "text-sm", player.allIn || out ? "text-rose-300" : away ? "text-sky-200" : "text-amber-200")}>
          {player.allIn ? "ALL IN" : out ? "Busted" : player.chips.toLocaleString()}
        </div>
      </div>
    </div>
  )
}

export function PokerGame({ state, playerId, isHost, roomLabel, error, connected, onFold, onCheck, onCall, onRaise, onAllIn, onNextHand, onToggleAutoDeal, onRebuy, onToggleSitOut, onEndGame, onShowCards, onMuck, onLeave }: PokerGameProps) {
  const reduced = useReducedMotion()
  const [stageRef, stage] = useElementSize<HTMLDivElement>()
  const geo = tableGeometry(stage.w || 1024, stage.h || 640)
  const { compact } = geo

  const [initialHand] = useState(state.handNumber)
  const [initialBoard] = useState(() => new Set(state.communityCards.map((card) => `${state.handNumber}:${card}`)))
  const [initialBets] = useState(() => new Set(Object.values(state.players).map((p) => `${state.handNumber}:${p.id}:${p.currentBet}`)))
  const [logOpen, setLogOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280)
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [dealLock, setDealLock] = useState(false)
  const clockOffset = useRef(0)
  clockOffset.current = state.serverNow - Date.now()

  useEffect(() => {
    setToast(error)
    if (!error) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [error])

  // ---- Seats ----
  const order = state.seatOrder.filter((id) => state.players[id])
  const n = order.length
  const myIndex = order.indexOf(playerId)
  const me = state.players[playerId]
  const angleOf = useMemo(() => {
    const map = new Map<string, number>()
    order.forEach((id, index) => map.set(id, 90 + (((index - Math.max(0, myIndex) + n) % n) * 360) / n))
    return map
  }, [order.join(","), myIndex, n])

  const heroH = geo.heroW * 1.4
  const heroY = geo.cy + geo.b - heroH * 0.42
  const boardY = geo.cy - geo.cardW * (geo.portrait ? 0.45 : 0.32)
  const potSpot: Pt = { x: geo.cx, y: boardY + geo.cardW * 0.7 + (compact ? 22 : 30) }
  const seatSpot = (id: string): Pt => {
    const spot = ring(geo, angleOf.get(id) ?? 90, 1)
    if (id === playerId) return { x: geo.cx, y: geo.cy + geo.b + (compact ? 10 : 14) }
    const half = compact ? 54 : 80
    return { x: Math.min(stage.w - half, Math.max(half, spot.x)), y: spot.y }
  }
  const cardSpot = (id: string): Pt => {
    if (id === playerId) return { x: geo.cx, y: heroY }
    const angle = angleOf.get(id) ?? 90
    return ring(geo, angle, 0.74 + 0.06 * Math.abs(Math.cos((angle * Math.PI) / 180)))
  }
  const betSpot = (id: string): Pt => {
    if (id === playerId) return { x: geo.cx - geo.heroW * 1.25 - (compact ? 34 : 54), y: heroY + heroH * 0.05 }
    const angle = angleOf.get(id) ?? 90
    return ring(geo, angle, 0.5 + 0.12 * Math.abs(Math.cos((angle * Math.PI) / 180)))
  }
  const buttonSpot = (id: string): Pt => {
    if (id === playerId) return { x: geo.cx + geo.heroW * 1.25 + (compact ? 18 : 28), y: heroY + heroH * 0.2 }
    return ring(geo, (angleOf.get(id) ?? 90) - (geo.portrait ? 16 : 11), 0.72)
  }
  const spots = useRef({ seatSpot, betSpot, potSpot })
  spots.current = { seatSpot, betSpot, potSpot }

  // ---- Hand-level derived state ----
  const dealtLive = state.handNumber !== initialHand && !reduced
  const dealerIndex = state.dealerPlayerId ? order.indexOf(state.dealerPlayerId) : 0
  const dealOrder = (id: string) => (order.indexOf(id) - dealerIndex - 1 + 2 * n) % n
  const dealDelay = (id: string, round: number) => (round * n + dealOrder(id)) * DEAL_STEP_MS
  const dealDuration = (2 * n + 2) * DEAL_STEP_MS + 600

  useLayoutEffect(() => {
    if (state.handNumber === initialHand || reduced) return
    setDealLock(true)
    const timer = window.setTimeout(() => setDealLock(false), dealDuration)
    return () => window.clearTimeout(timer)
    // biome-ignore lint/correctness/useExhaustiveDependencies: replays once per hand
  }, [state.handNumber])

  const showdown = state.showdownPlayers.length > 0
  const handOver = !state.handInProgress && state.winners.length > 0
  const winnerIds = new Set(state.winners.map((w) => w.playerId))
  const winningCards = new Set(state.winners.flatMap((w) => w.handResult?.cards ?? []))
  const highlightBoard = handOver && winningCards.size > 0
  const collected = state.pot - order.reduce((sum, id) => sum + (state.players[id]?.currentBet ?? 0), 0)
  // Split what is already in the middle into main and side pots. Bets still in front of seats join next sweep.
  const pots = calculatePots(order.flatMap((id) => {
    const p = state.players[id]
    return p ? [{ playerId: id, amount: p.totalBetThisHand - p.currentBet, folded: p.folded, allIn: p.allIn && p.currentBet === 0 }] : []
  }))

  const myCards = state.myHoleCards
  const iHaveCards = myCards.length === 2
  const myHand = useMemo(() => {
    if (!iHaveCards) return null
    if (state.communityCards.length < 3) return describeHole(myCards)
    return evaluateBestHand(myCards, state.communityCards).description
  }, [iHaveCards, myCards.join(","), state.communityCards.join(",")])

  // ---- Chip flights: bets swept into the pot, the pot pushed to the winners ----
  const previous = useRef(state)
  useEffect(() => {
    const prev = previous.current
    previous.current = state
    if (prev === state || reduced || prev.handNumber !== state.handNumber) return
    const { seatSpot: seat, betSpot: bet, potSpot: pot } = spots.current
    const added: Ghost[] = []
    let swept = false
    for (const id of prev.seatOrder) {
      const before = prev.players[id]?.currentBet ?? 0
      const now = state.players[id]?.currentBet ?? 0
      if (before > 0 && now === 0 && state.players[id]) {
        added.push({ id: `s${state.handNumber}-${id}-${state.log.at(-1)?.id}`, from: bet(id), to: pot, amount: before, delay: 0 })
        swept = true
      }
    }
    if (prev.winners.length === 0 && state.winners.length > 0) {
      state.winners.forEach((w, index) => {
        if (!state.players[w.playerId] || w.amount <= 0) return
        added.push({ id: `w${state.handNumber}-${w.playerId}-${index}`, from: pot, to: seat(w.playerId), amount: w.amount, delay: (swept ? SWEEP_MS + 120 : 250) + index * 160 })
      })
    }
    if (!added.length) return
    setGhosts((current) => [...current, ...added])
    const ids = new Set(added.map((ghost) => ghost.id))
    const longest = Math.max(...added.map((ghost) => ghost.delay)) + SWEEP_MS + 900
    window.setTimeout(() => setGhosts((current) => current.filter((ghost) => !ids.has(ghost.id))), longest)
  }, [state, reduced])

  // ---- Turn ----
  const isMyTurn = state.currentPlayerId === playerId
  const canAct = isMyTurn && state.handInProgress && !!me && !me.folded && !me.allIn && connected && !dealLock

  // ---- Advance actions, queued before your turn ----
  const [preAction, setPreAction] = useState<PreAction | null>(null)
  const canQueue = !isMyTurn && state.handInProgress && !!me && me.hasCards && !me.folded && !me.allIn && connected
  const toCall = me ? state.currentBetToMatch - me.currentBet : 0
  useEffect(() => setPreAction(null), [state.handNumber])
  useEffect(() => {
    if (!canAct || !preAction || !me) return
    setPreAction(null)
    if (toCall <= 0) onCheck()
    else if (preAction === "check-fold") onFold()
    else if (preAction === "call-any") (toCall >= me.chips ? onAllIn : onCall)()
  }, [canAct]) // eslint-disable-line react-hooks/exhaustive-deps
  const turnTotal = state.settings.turnTimeLimit * 1000
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!state.turnDeadline && !state.nextHandAt && !state.showOffer) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [state.turnDeadline, state.nextHandAt, state.showOffer])
  const secondsLeft = state.turnDeadline ? Math.max(0, Math.ceil((state.turnDeadline - (now + clockOffset.current)) / 1000)) : null
  const nextHandIn = state.nextHandAt ? Math.max(0, Math.ceil((state.nextHandAt - (now + clockOffset.current)) / 1000)) : null

  // ---- Showing cards after a fold win, or mucking a beaten hand at showdown ----
  const canShow = !!me && iHaveCards && state.showOffer?.playerId === playerId && state.showOffer.until > now + clockOffset.current
  const canMuck = iHaveCards && state.muckable.includes(playerId)
  const myShown = me?.shownCards ?? []

  const nameOf = (id: string | null) => (id === playerId ? "You" : id ? state.players[id]?.name ?? "Player" : "Player")
  const hostName = state.players[state.hostId]?.name ?? "the host"
  const bigBlind = state.settings.smallBlind * 2
  const recentLog = [...state.log].reverse()
  const showGameOver = state.status === "finished"

  // ---- Rebuys and sitting out ----
  const { rebuys: rebuysOn, rebuyCap, startingChips } = state.settings
  const canRebuy = (p: PublicPlayer) => rebuysOn && p.chips <= 0 && (rebuyCap === 0 || p.rebuys < rebuyCap)
  const iHoldLiveCards = !!me && state.handInProgress && me.hasCards && !me.folded
  const iAmBusted = !!me && me.chips <= 0 && !iHoldLiveCards
  const iCanRebuy = !!me && iAmBusted && canRebuy(me) && state.status === "playing"
  const rebuysLeft = me && rebuyCap > 0 ? rebuyCap - me.rebuys : null
  const readyCount = order.filter((id) => {
    const p = state.players[id]!
    return (p.chips > 0 && !p.sittingOut) || (p.isBot && canRebuy(p))
  }).length
  const waitingForPlayers = state.status === "playing" && !state.handInProgress && !state.nextHandAt && readyCount < 2

  // ---- Status line under the board ----
  const payouts = (() => {
    const byPot = new Map<number, typeof state.winners>()
    for (const w of state.winners) byPot.set(w.potIndex, [...(byPot.get(w.potIndex) ?? []), w])
    if (byPot.size < 2) return []
    return [...byPot.entries()].sort(([a], [b]) => a - b).map(([index, ws]) => ({
      label: potLabel(index),
      names: ws.map((w) => (w.playerId === playerId ? "You" : w.playerName)).join(" & "),
      amount: ws.reduce((sum, w) => sum + w.amount, 0),
      hand: ws[0].handResult?.description ?? "",
    }))
  })()

  const headline = (() => {
    if (handOver) {
      const first = state.winners[0]
      if (!first) return null
      const split = new Set(state.winners.map((w) => w.playerId)).size > 1
      const who = first.playerId === playerId ? "You" : first.playerName
      if (split) return { big: payouts.length ? "Pots awarded" : "Split pot", small: payouts.length ? "" : first.handResult?.description ?? "" }
      return { big: `${who} ${who === "You" ? "win" : "wins"} ${state.winners.reduce((sum, w) => sum + w.amount, 0).toLocaleString()}`, small: payouts.length ? "" : first.handResult?.description ?? "Everyone else folded" }
    }
    if (showdown) return { big: "Showdown", small: "" }
    return null
  })()

  return (
    <div className="relative flex h-[calc(100dvh-73px)] flex-col overflow-hidden bg-[#0b0907] text-white">
      {showGameOver && <GameOverModal players={state.players} settings={state.settings} isHost={isHost} onRestart={onNextHand} onLeave={onLeave} />}

      {/* Room */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 70% at 50% 45%, #2b2219 0%, #17120d 50%, #070605 100%)" }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(255,214,150,0.12), transparent 70%)" }} />

      {/* Stage */}
      <div ref={stageRef} className="relative min-h-0 flex-1">
        {stage.w > 0 && (
          <>
            {/* Rail */}
            <div
              className="absolute rounded-full"
              style={{
                left: geo.cx - geo.a,
                top: geo.cy - geo.b,
                width: geo.a * 2,
                height: geo.b * 2,
                background: "linear-gradient(180deg, #3a2f2a 0%, #1b1513 45%, #0b0807 100%)",
                boxShadow: "0 40px 90px rgba(0,0,0,0.75), 0 10px 24px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.14), inset 0 -3px 8px rgba(0,0,0,0.6)",
              }}
            >
              <div className="absolute rounded-full border border-dashed border-white/[0.08]" style={{ inset: geo.rail * 0.42 }} />
              {/* Wood trim */}
              <div className="absolute rounded-full" style={{ inset: geo.rail - 4, background: "linear-gradient(180deg, #9a6634, #5c3618 60%, #3b220f)", boxShadow: "inset 0 1px 0 rgba(255,220,170,0.35)" }} />
              {/* Felt */}
              <div
                className="absolute overflow-hidden rounded-full"
                style={{
                  inset: geo.rail,
                  background: "radial-gradient(ellipse 70% 65% at 50% 42%, #23845a 0%, #176845 45%, #0c4429 85%, #093520 100%)",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.5), inset 0 12px 40px rgba(0,0,0,0.55), inset 0 -6px 30px rgba(0,0,0,0.35)",
                }}
              >
                <div className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
                <div className="absolute rounded-full border-[1.5px] border-[#f6d98b]/20" style={{ inset: `${geo.portrait ? 9 : 14}% ${geo.portrait ? 12 : 9}%` }} />
                <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 45% at 50% 30%, rgba(255,240,200,0.12), transparent 70%)" }} />
              </div>
            </div>

            {/* Felt print */}
            <div className="pointer-events-none absolute flex items-center gap-2 text-[#f6d98b]/[0.13]" style={{ left: geo.cx, top: geo.cy - geo.b * (geo.portrait ? 0.42 : 0.52), transform: "translate(-50%, -50%)" }}>
              <SuitIcon suit={3} className="h-4 w-4" />
              <span className={cn("whitespace-nowrap font-serif font-bold uppercase tracking-[0.35em]", compact ? "text-[10px]" : "text-sm")}>Texas Hold'em</span>
              <SuitIcon suit={2} className="h-4 w-4" />
            </div>

            {/* Street label / result */}
            <div className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: geo.cx, top: boardY - geo.cardW * 0.7 - (compact ? 16 : 22) }}>
              {headline ? (
                <div key={`${state.handNumber}-${headline.big}`} className="poker-pop flex flex-col items-center rounded-2xl border border-amber-300/40 bg-black/70 px-4 py-1.5 text-center shadow-[0_0_30px_rgba(252,211,77,0.25)] backdrop-blur">
                  <span className={cn("font-black tracking-tight text-amber-200", compact ? "text-sm" : "text-lg")}>{headline.big}</span>
                  {headline.small && <span className="text-[11px] font-medium text-white/70">{headline.small}</span>}
                  {handOver && payouts.length > 0 && (
                    <div className="mt-1 flex flex-col gap-0.5 border-t border-white/10 pt-1 text-[11px]">
                      {payouts.map((payout) => (
                        <div key={payout.label} className="flex items-baseline justify-center gap-1.5 whitespace-nowrap">
                          <span className="font-bold uppercase tracking-wider text-white/45">{payout.label}</span>
                          <span className="font-semibold text-white/85">{payout.names}</span>
                          <span className="font-mono font-bold tabular-nums text-amber-200">+{payout.amount.toLocaleString()}</span>
                          {payout.hand && <span className="text-white/50">· {payout.hand}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/45">{state.handInProgress ? STREET_LABEL[state.bettingRound] : ""}</span>
              )}
            </div>

            {/* Board */}
            <div className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2" style={{ left: geo.cx, top: boardY, gap: Math.max(4, geo.cardW * 0.09) }}>
              {Array.from({ length: 5 }, (_, i) => {
                const card = state.communityCards[i]
                if (card === undefined) {
                  return <div key={`slot-${i}`} className="rounded-[0.75em] border border-dashed border-white/[0.12] bg-black/10" style={{ width: geo.cardW, height: geo.cardW * 1.4, fontSize: geo.cardW / 10 }} />
                }
                const fresh = !reduced && !initialBoard.has(`${state.handNumber}:${card}`)
                return (
                  <FlipCard
                    key={`${state.handNumber}-${card}`}
                    card={card}
                    faceUp
                    width={geo.cardW}
                    flipIn={fresh}
                    delay={fresh ? 260 + (i < 3 ? i * 170 : 0) : 0}
                    highlighted={highlightBoard && winningCards.has(card)}
                    dimmed={highlightBoard && !winningCards.has(card)}
                    className={cn(highlightBoard && winningCards.has(card) && "-translate-y-1.5")}
                  />
                )
              })}
            </div>

            {/* Pot */}
            {collected > 0 && pots.length < 2 && (
              <div key={collected} className="poker-pot-in absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: potSpot.x, top: potSpot.y, animationDelay: reduced ? "0ms" : `${SWEEP_MS - 80}ms` }}>
                <ChipStack amount={collected} chip={compact ? 16 : 22} label="none" />
                <span className="rounded-full bg-black/65 px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-amber-100 ring-1 ring-amber-200/25">
                  Pot {state.pot.toLocaleString()}
                </span>
              </div>
            )}
            {collected > 0 && pots.length >= 2 && (
              <div key={collected} className={cn("poker-pot-in absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-end", compact ? "gap-2" : "gap-4")} style={{ left: potSpot.x, top: potSpot.y, animationDelay: reduced ? "0ms" : `${SWEEP_MS - 80}ms` }}>
                {pots.map((pot, index) => (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <ChipStack amount={pot.amount} chip={compact ? 13 : 18} label="none" />
                    <span className={cn("whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ring-1", index === 0 ? "text-amber-100 ring-amber-200/25" : "text-sky-100 ring-sky-200/25")}>
                      {potLabel(index, true)} {pot.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Dealer button */}
            {state.dealerPlayerId && state.players[state.dealerPlayerId] && (() => {
              const spot = buttonSpot(state.dealerPlayerId)
              return (
                <div
                  className="absolute z-10 flex items-center justify-center rounded-full border-2 border-zinc-300 bg-gradient-to-b from-white to-zinc-200 font-black text-zinc-900 shadow-[0_3px_6px_rgba(0,0,0,0.5)] transition-[left,top] duration-700 ease-out"
                  style={{ left: spot.x - (compact ? 10 : 13), top: spot.y - (compact ? 10 : 13), width: compact ? 20 : 26, height: compact ? 20 : 26, fontSize: compact ? 10 : 12 }}
                >
                  D
                </div>
              )
            })()}

            {/* Bets */}
            {order.map((id) => {
              const player = state.players[id]!
              if (player.currentBet <= 0) return null
              const spot = betSpot(id)
              const seat = id === playerId ? cardSpot(id) : seatSpot(id)
              const key = `${state.handNumber}:${id}:${player.currentBet}`
              const fresh = !reduced && !initialBets.has(key)
              const blindDelay = player.lastAction?.kind === "sb" || player.lastAction?.kind === "bb"
              return (
                <div
                  key={key}
                  className={cn("absolute z-10 -translate-x-1/2 -translate-y-1/2", fresh && "poker-chip-in")}
                  style={{ left: spot.x, top: spot.y, ["--fx" as string]: `${seat.x - spot.x}px`, ["--fy" as string]: `${seat.y - spot.y}px`, animationDelay: fresh && blindDelay && dealtLive ? "250ms" : "0ms" } as CSSProperties}
                >
                  <ChipStack amount={player.currentBet} chip={compact ? 13 : 17} label={geo.portrait ? "below" : "right"} />
                </div>
              )
            })}

            {/* Ghost chips in flight */}
            {ghosts.map((ghost) => (
              <div
                key={ghost.id}
                className="poker-fly pointer-events-none absolute left-0 top-0 z-30"
                style={{ ["--fx" as string]: `${ghost.from.x}px`, ["--fy" as string]: `${ghost.from.y}px`, ["--tx" as string]: `${ghost.to.x}px`, ["--ty" as string]: `${ghost.to.y}px`, animationDelay: `${ghost.delay}ms`, animationDuration: `${SWEEP_MS}ms` } as CSSProperties}
              >
                <div className="-translate-x-1/2 -translate-y-1/2">
                  <ChipStack amount={ghost.amount} chip={compact ? 14 : 18} label="none" />
                </div>
              </div>
            ))}

            {/* Opponent cards */}
            {order.map((id) => {
              if (id === playerId) return null
              const player = state.players[id]!
              if (!player.hasCards) return null
              const spot = cardSpot(id)
              const revealed = player.holeCards && player.holeCards.length === 2 ? player.holeCards : null
              const faces = revealed ?? player.shownCards
              const anyUp = !!faces?.some((card) => card !== null)
              const w = anyUp ? geo.showCardW : geo.seatCardW
              const dealer = state.dealerPlayerId ? buttonSpot(state.dealerPlayerId) : { x: geo.cx, y: geo.cy }
              const hand = revealed && state.communityCards.length >= 5 ? evaluateBestHand(revealed, state.communityCards).description : null
              const isWinner = winnerIds.has(id)
              return (
                <div key={`${state.handNumber}-${id}`} className={cn("absolute z-10 -translate-x-1/2 -translate-y-1/2", player.folded && "poker-muck")} style={{ left: spot.x, top: spot.y }}>
                  <div className="flex items-end" style={{ gap: anyUp ? 3 : 0 }}>
                    {[0, 1].map((index) => (
                      <div
                        key={index}
                        className={cn(dealtLive && "poker-deal")}
                        style={{
                          ["--dx" as string]: `${dealer.x - spot.x}px`,
                          ["--dy" as string]: `${dealer.y - spot.y}px`,
                          animationDelay: `${dealDelay(id, index)}ms`,
                          marginLeft: index === 1 && !anyUp ? -w * 0.45 : 0,
                        } as CSSProperties}
                      >
                        <div className="transition-transform duration-500" style={{ transform: anyUp ? undefined : `rotate(${index === 0 ? -8 : 8}deg)` }}>
                        <FlipCard
                          card={faces?.[index] ?? null}
                          faceUp={faces?.[index] != null}
                          width={w}
                          delay={index * 140}
                          highlighted={handOver && revealed !== null && winningCards.has(revealed[index]) && isWinner}
                          dimmed={handOver && revealed !== null && !isWinner}
                        />
                        </div>
                      </div>
                    ))}
                  </div>
                  {hand && (
                    <div className={cn("poker-pop absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold shadow", isWinner && handOver ? "bg-amber-300 text-amber-950" : "bg-black/75 text-white/85 ring-1 ring-white/15")} style={{ animationDelay: "450ms" }}>
                      {hand}
                    </div>
                  )}
                </div>
              )
            })}

            {/* My cards */}
            {me && (iHaveCards || me.hasCards) && (() => {
              const dealer = state.dealerPlayerId ? buttonSpot(state.dealerPlayerId) : { x: geo.cx, y: geo.cy }
              const spot = cardSpot(playerId)
              const iWin = winnerIds.has(playerId) && handOver
              return (
                <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: spot.x, top: spot.y }}>
                  <div className={cn("flex items-end transition-[opacity,transform,filter] duration-500", me.folded && "opacity-40 grayscale")} style={{ transform: me.folded ? "translateY(14px)" : undefined }}>
                    {[0, 1].map((index) => (
                      <div
                        key={`${state.handNumber}-${index}`}
                        className={cn(dealtLive && "poker-deal")}
                        style={{
                          ["--dx" as string]: `${dealer.x - spot.x}px`,
                          ["--dy" as string]: `${dealer.y - spot.y}px`,
                          animationDelay: `${dealDelay(playerId, index)}ms`,
                          marginLeft: index === 1 ? -geo.heroW * 0.18 : 0,
                        } as CSSProperties}
                      >
                        <div className="transition-transform duration-300" style={{ transform: `rotate(${index === 0 ? -6 : 6}deg) translateY(${(index === 0 ? 2 : 0) - (myShown[index] != null ? geo.heroW * 0.12 : 0)}px)` }}>
                        <FlipCard
                          card={myCards[index] ?? null}
                          faceUp={iHaveCards}
                          width={geo.heroW}
                          flipIn={dealtLive}
                          delay={dealtLive ? dealDelay(playerId, 1) + 420 + index * 120 : 0}
                          highlighted={iWin && winningCards.has(myCards[index])}
                          dimmed={handOver && !iWin && showdown}
                        />
                        </div>
                      </div>
                    ))}
                  </div>
                  {(canShow || canMuck) && (
                    <div className={cn(GLASS, "poker-rise absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap p-1")}>
                      <span className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">{canMuck ? "Beaten" : "Show"}</span>
                      {canMuck ? (
                        <>
                          <button type="button" onClick={() => onShowCards([0, 1])} className="rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/85 ring-1 ring-white/15 transition-colors hover:bg-white/[0.14]">
                            Show
                          </button>
                          <button type="button" onClick={onMuck} className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/55 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] hover:text-white">
                            Muck
                          </button>
                        </>
                      ) : (
                        <>
                          {[0, 1].map((index) => myShown[index] == null && (
                            <button key={index} type="button" aria-label={`Show ${cardRankLabel(myCards[index])}`} onClick={() => onShowCards([index])} className="rounded-lg bg-white/[0.06] px-1.5 py-1 ring-1 ring-white/15 transition-colors hover:bg-white/[0.14]">
                              <MiniCards cards={[myCards[index]]} />
                            </button>
                          ))}
                          {myShown.every((card) => card == null) && (
                            <button type="button" onClick={() => onShowCards([0, 1])} className="rounded-lg bg-gradient-to-b from-amber-300 to-amber-500 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-[#2a1a00] ring-1 ring-amber-200/60 transition-all hover:from-amber-200">
                              Show both
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Seats */}
            {order.map((id) => {
              const player = state.players[id]!
              const spot = seatSpot(id)
              const active = state.currentPlayerId === id && state.handInProgress
              const isWinner = handOver && winnerIds.has(id)
              const won = state.winners.filter((w) => w.playerId === id).reduce((sum, w) => sum + w.amount, 0)
              const sector = (angleOf.get(id) ?? 90) % 360
              const tagAbove = sector > 0 && sector < 180
              return (
                <div key={id} className="absolute z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: spot.x, top: spot.y }}>
                  <SeatPlate
                    player={player}
                    isMe={id === playerId}
                    active={active}
                    winner={isWinner}
                    compact={compact}
                    deadline={active ? state.turnDeadline : null}
                    total={Math.max(turnTotal, (state.turnDeadline ?? 0) - (Date.now() + clockOffset.current))}
                    offset={clockOffset.current}
                  />
                  {player.lastAction && player.lastAction.kind !== "fold" && !handOver && (
                    <div
                      key={`${player.lastAction.kind}-${player.lastAction.amount ?? 0}`}
                      className={cn(
                        "poker-tag absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-lg",
                        id === playerId ? "left-full top-1/2 ml-2 -translate-y-1/2 translate-x-0" : tagAbove ? "bottom-full mb-1.5" : "top-full mt-1.5",
                        ACTION_TONE[player.lastAction.kind],
                      )}
                    >
                      {actionText(player.lastAction)}
                    </div>
                  )}
                  {player.folded && player.hasCards && !handOver && (
                    <div className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-700/90 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-200", id === playerId ? "left-full top-1/2 ml-2 -translate-y-1/2 translate-x-0" : tagAbove ? "bottom-full mb-1.5" : "top-full mt-1.5")}>
                      Fold
                    </div>
                  )}
                  {!player.hasCards && (canRebuy(player) || (player.sittingOut && player.chips > 0)) && (
                    <div className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", player.chips <= 0 ? "bg-rose-900/90 text-rose-100" : "bg-sky-900/90 text-sky-100", id === playerId ? "left-full top-1/2 ml-2 -translate-y-1/2 translate-x-0" : tagAbove ? "bottom-full mb-1.5" : "top-full mt-1.5")}>
                      {player.chips <= 0 ? "Can rebuy" : "Sitting out"}
                    </div>
                  )}
                  {isWinner && won > 0 && (
                    <div className="poker-float-up absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-lg font-black text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" style={{ bottom: "100%", animationDelay: `${SWEEP_MS + 200}ms` }}>
                      +{won.toLocaleString()}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-2 sm:p-3">
          <div className={cn(GLASS, "flex items-center gap-1 py-1 pl-1 pr-3")}>
            <button type="button" onClick={onLeave} className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Leave</span>
            </button>
            <div className="h-6 w-px bg-white/10" />
            <div className="pl-2 leading-tight">
              <div className="text-xs font-bold text-white/90">Texas Hold'em</div>
              <div className="font-mono text-[10px] text-white/45">
                {roomLabel} · Hand {state.handNumber} · {state.settings.smallBlind}/{bigBlind}
              </div>
            </div>
            {!connected && <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">Reconnecting…</span>}
          </div>
          <div className={cn(GLASS, "flex items-center gap-0.5 p-1 [&>button]:text-white/60")}>
            <PokerHandGuide currentCategory={iHaveCards && state.communityCards.length >= 3 ? evaluateBestHand(myCards, state.communityCards).category : null} />
            <button
              type="button"
              onClick={() => setLogOpen((open) => !open)}
              className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/5 hover:text-white/80", logOpen && "bg-white/10 text-white")}
            >
              <ScrollText size={13} />
              <span>Log</span>
            </button>
          </div>
        </div>

        {/* Log */}
        {logOpen && (
          <div className={cn(GLASS, "poker-rise absolute right-2 top-14 z-40 flex max-h-[min(420px,calc(100%-80px))] w-[min(300px,calc(100%-16px))] flex-col overflow-hidden sm:right-3")}>
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Hand log</span>
              <button type="button" aria-label="Close log" onClick={() => setLogOpen(false)} className="rounded-md p-0.5 text-white/40 hover:bg-white/10 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[11px] leading-snug">
              {recentLog.length === 0 && <li className="text-white/35">Nothing yet.</li>}
              {recentLog.map((entry) => {
                const line = logLine(entry, playerId)
                return (
                  <li key={entry.id} className={cn("text-white/65", entry.kind === "hand" && "mt-2 border-t border-white/10 pt-2 first:mt-0 first:border-0 first:pt-0", line.tone)}>
                    {line.text}
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {toast && (
          <div className="poker-rise absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl border border-rose-400/30 bg-rose-950/85 px-4 py-2 text-xs font-medium text-rose-100 shadow-xl backdrop-blur">
            {toast}
          </div>
        )}
      </div>

      {/* Dock */}
      <div className="relative z-40 shrink-0 border-t border-white/[0.08] bg-black/55 px-3 pb-3 pt-2.5 backdrop-blur-md sm:px-5">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:w-[260px] sm:shrink-0 sm:flex-col sm:items-start sm:gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Stack</span>
              <span className="font-mono text-lg font-black tabular-nums text-amber-200">{(me?.chips ?? 0).toLocaleString()}</span>
              {!!me?.currentBet && <span className="font-mono text-xs tabular-nums text-white/45">+{me.currentBet.toLocaleString()} in</span>}
            </div>
            {myHand && !me?.folded && (
              <span className="truncate rounded-full bg-emerald-400/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-300/25">{myHand}</span>
            )}
            {me && state.status === "playing" && (
              <div className="flex shrink-0 items-center gap-1.5">
                {iCanRebuy && (
                  <button
                    type="button"
                    onClick={onRebuy}
                    className="flex h-8 items-center gap-1.5 rounded-xl bg-gradient-to-b from-sky-300 to-sky-500 px-3 text-[11px] font-black uppercase tracking-wider text-sky-950 shadow ring-1 ring-sky-200/60 transition-all hover:from-sky-200 active:scale-[0.98]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rebuy {startingChips.toLocaleString()}
                    {rebuysLeft !== null && <span className="font-mono text-[10px] opacity-70">({rebuysLeft} left)</span>}
                  </button>
                )}
                {!iAmBusted && (
                  <button
                    type="button"
                    onClick={onToggleSitOut}
                    aria-pressed={me.sittingOut}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold uppercase tracking-wider ring-1 transition-all active:scale-[0.98]",
                      me.sittingOut ? "bg-sky-300/15 text-sky-200 ring-sky-300/50 hover:bg-sky-300/25" : "bg-white/[0.05] text-white/55 ring-white/12 hover:bg-white/[0.09] hover:text-white",
                    )}
                  >
                    <Coffee className="h-3.5 w-3.5" />
                    {me.sittingOut ? "Sit in" : "Sit out"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex min-h-14 flex-1 items-center justify-end">
            {waitingForPlayers ? (
              <div className="flex w-full items-center justify-end gap-3">
                <p className="flex-1 text-center text-sm text-white/55 sm:text-right">
                  {iCanRebuy ? "Rebuy to keep playing" : me?.sittingOut ? "Sit in to deal the next hand" : `Waiting for players to ${rebuysOn ? "rebuy or " : ""}sit back in…`}
                </p>
                {isHost && (
                  <button
                    type="button"
                    onClick={onEndGame}
                    className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-4 text-xs font-bold uppercase tracking-wider text-white/70 ring-1 ring-white/15 transition-all hover:bg-rose-500/15 hover:text-rose-100 hover:ring-rose-300/40 active:scale-[0.98]"
                  >
                    <Flag className="h-4 w-4" />
                    End game
                  </button>
                )}
              </div>
            ) : handOver && state.status !== "finished" ? (
              isHost ? (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={onEndGame}
                    aria-label="End game"
                    title="End game"
                    className="flex h-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] px-4 text-white/60 ring-1 ring-white/15 transition-all hover:bg-rose-500/15 hover:text-rose-100 hover:ring-rose-300/40 active:scale-[0.98]"
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleAutoDeal}
                    aria-label={state.autoDealPaused ? "Resume auto-deal" : "Pause auto-deal"}
                    className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white/[0.06] px-4 text-xs font-bold uppercase tracking-wider text-white/70 ring-1 ring-white/15 transition-all hover:bg-white/[0.1] hover:text-white active:scale-[0.98]"
                  >
                    {state.autoDealPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {state.autoDealPaused ? "Resume" : nextHandIn !== null ? <span className="font-mono tabular-nums">{nextHandIn}s</span> : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={onNextHand}
                    className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 px-8 text-sm font-black uppercase tracking-wider text-[#2a1a00] shadow-lg ring-1 ring-amber-200/60 transition-all hover:from-amber-200 active:scale-[0.98] sm:flex-none"
                  >
                    {state.autoDealPaused ? "Deal next hand" : "Deal now"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="w-full text-center text-sm text-white/45 sm:text-right">
                  {nextHandIn !== null
                    ? <>Next hand in <span className="font-mono text-white/75">{nextHandIn}s</span></>
                    : state.autoDealPaused
                      ? <>{hostName} paused dealing</>
                      : <>Waiting for {hostName} to deal the next hand…</>}
                </p>
              )
            ) : canAct && me ? (
              <div className="w-full sm:max-w-[520px]">
                <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-[0.2em]">
                  <span className="text-amber-300">Your turn</span>
                  {secondsLeft !== null && <span className={cn("font-mono tabular-nums", secondsLeft <= 5 ? "text-rose-300" : "text-white/45")}>{secondsLeft}s</span>}
                </div>
                <BettingControls
                  currentBet={me.currentBet}
                  currentBetToMatch={state.currentBetToMatch}
                  myChips={me.chips}
                  minRaise={state.minRaise}
                  pot={state.pot}
                  onFold={onFold}
                  onCheck={onCheck}
                  onCall={onCall}
                  onRaise={onRaise}
                  onAllIn={onAllIn}
                />
              </div>
            ) : canQueue && !dealLock ? (
              <div className="w-full sm:max-w-[520px]">
                <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
                  {state.currentPlayerId
                    ? <>Waiting for <span className="text-white/70">{nameOf(state.currentPlayerId)}</span>{secondsLeft !== null && <span className="ml-1.5 font-mono">{secondsLeft}s</span>}</>
                    : "Dealing…"}
                </div>
                <div className="flex gap-2">
                  {PRE_ACTIONS.map(({ key, label }) => {
                    const on = preAction === key
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPreAction(on ? null : key)}
                        className={cn(
                          "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wider ring-1 transition-all active:scale-[0.98]",
                          on ? "bg-amber-300/15 text-amber-200 ring-amber-300/60" : "bg-white/[0.05] text-white/60 ring-white/12 hover:bg-white/[0.09] hover:text-white",
                        )}
                      >
                        <span className={cn("h-3 w-3 shrink-0 rounded-[4px] ring-1", on ? "bg-amber-300 ring-amber-200" : "ring-white/30")} />
                        <span className="truncate">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="w-full text-center text-sm text-white/45 sm:text-right">
                {me && !me.hasCards && state.handInProgress && iAmBusted
                  ? iCanRebuy ? "You're busted · rebuy to play the next hand" : "You're out of chips · watching"
                  : me && !me.hasCards && state.handInProgress && me.sittingOut
                    ? "You're sitting out · sit in to play the next hand"
                  : me?.folded && state.handInProgress
                  ? "You folded · watching the hand"
                  : me?.allIn && state.handInProgress
                    ? "You're all in · good luck"
                    : state.currentPlayerId && state.handInProgress
                      ? <>Waiting for <span className="font-semibold text-white/75">{nameOf(state.currentPlayerId)}</span>{secondsLeft !== null && <span className="ml-1.5 font-mono text-white/35">{secondsLeft}s</span>}</>
                      : dealLock
                        ? "Dealing…"
                        : showdown
                          ? "Showdown"
                          : state.handInProgress
                            ? "Dealing…"
                            : ""}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
