import { ArrowLeft, Bot, Crown, Layers, RotateCcw, Trophy, WifiOff, X } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  canPlayUnoCard,
  UNO_COLORED_VALUES,
  UNO_COLORS,
  UNO_WILD_VALUES,
  type UnoCard,
  type UnoColor,
} from "@/lib/uno"
import { cn } from "@/lib/utils"
import type { PublicUnoGameState, UnoAction } from "../../../../party/uno"
import { cardLabel, COLOR_HEX, COLOR_NAME, UnoCardDefs, UnoCardView, valueLabel } from "./UnoCardArt"

export interface UnoGameProps {
  state: PublicUnoGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  message: string | null
  connected: boolean
  onPlayCard: (cardId: string, color?: UnoColor) => void
  onDrawCard: () => void
  onPass: () => void
  onCallUno: () => void
  onCatch: (playerId: string) => void
  onRestart: () => void
  onLeave: () => void
}

type Phase = "flying" | "landed" | "settled"
interface Reveal { action: UnoAction; snapshot: PublicUnoGameState; phase: Phase }
interface Spot { x: number; y: number; w: number; h: number }
interface Pose { x: number; y: number; rot: number; scale: number }
interface Flight { id: string; card: UnoCard | null; flip: boolean; fade: boolean; from: Pose; to: Pose; w: number; h: number; delay: number; duration: number }
interface Story { line: string; stamp?: string; sub?: string; tone?: UnoColor }

const TURN_GOLD = "#fde68a"
const GLASS = "pointer-events-auto rounded-2xl border border-white/10 bg-black/45 shadow-2xl backdrop-blur-md"
const COLOR_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 }
const VALUE_RANK: string[] = [...UNO_COLORED_VALUES, ...UNO_WILD_VALUES]

function sortHand(hand: readonly UnoCard[]) {
  return [...hand].sort((a, b) =>
    COLOR_RANK[a.color ?? "wild"]! - COLOR_RANK[b.color ?? "wild"]! ||
    VALUE_RANK.indexOf(a.value) - VALUE_RANK.indexOf(b.value) ||
    a.id.localeCompare(b.id))
}

function hash(text: string) {
  let value = 7
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) | 0
  return Math.abs(value)
}
const pileTilt = (id: string) => (hash(id) % 25) - 12
const pileShift = (id: string) => ({ x: (hash(`${id}x`) % 13) - 6, y: (hash(`${id}y`) % 11) - 5 })

/** When a revealed action lands, settles (penalty cards delivered) and hands play on. */
function timeline(action: UnoAction, me: string, reduced: boolean) {
  const motion = reduced ? 0 : 1
  if (action.type === "play") {
    const land = 540 * motion
    const draws = action.drawCount ?? 0
    const settle = draws ? land + (300 + (draws - 1) * 150 + 520) * motion + 150 : land
    const loud = action.card.color === null || action.card.value === "skip" || action.card.value === "reverse" || action.card.value === "draw-two" || action.cardsLeft <= 1
    return { land, settle, release: settle + (loud ? 1500 : 900) }
  }
  if (action.type === "draw") {
    const land = 580 * motion
    const mine = action.playerId === me
    return { land, settle: land, release: land + (mine ? (action.playable ? 250 : 1500) : action.playable ? 400 : 800) }
  }
  if (action.type === "catch") {
    const settle = ((action.drawCount - 1) * 150 + 520) * motion + 150
    return { land: 0, settle, release: settle + 1500 }
  }
  if (action.type === "pass") return { land: 0, settle: 0, release: 900 }
  if (action.type === "deal") return { land: 0, settle: 0, release: 600 }
  return { land: 0, settle: 0, release: 1400 }
}

function storyOf(action: UnoAction, me: string): Story {
  const you = action.playerId === me
  const actor = you ? "You" : action.name
  const verb = (subject: string, plain: string, third: string) => `${subject} ${subject === "You" ? plain : third}`
  switch (action.type) {
    case "deal":
      return { line: `Cards dealt · ${you ? "you go" : `${action.name} goes`} first` }
    case "play": {
      const wild = action.card.color === null
      const line = `${actor} played ${cardLabel(action.card)}${wild ? ` · ${COLOR_NAME[action.color]}` : ""}`
      const base = { line, tone: action.color }
      const victim = action.victimId === me ? "You" : action.victimName
      const skipped = action.skippedId === me ? "You" : action.skippedName
      const colorNote = wild ? ` · color is ${COLOR_NAME[action.color]}` : ""
      if (action.cardsLeft === 0) return { ...base, stamp: "Out!", sub: `${actor} played ${you ? "your" : "their"} last card` }
      const unoNote = action.cardsLeft !== 1 ? "" : action.unoCalled ? ` · ${verb(actor, "call", "calls")} UNO!` : ` · ${verb(actor, "have", "has")} one card left`
      switch (action.card.value) {
        case "draw-two":
        case "wild-draw-four":
          return { ...base, stamp: action.card.value === "draw-two" ? "+2" : "+4", sub: victim ? `${verb(victim, "draw", "draws")} ${action.drawCount ?? 0} and ${victim === "You" ? "miss" : "misses"} a turn${colorNote}${unoNote}` : undefined }
        case "skip":
          return { ...base, stamp: "Skip", sub: skipped ? `${verb(skipped, "miss", "misses")} a turn${unoNote}` : undefined }
        case "reverse":
          return { ...base, stamp: "Reverse", sub: action.reversed ? `Play changes direction${unoNote}` : skipped ? `${verb(skipped, "miss", "misses")} a turn${unoNote}` : undefined }
        case "wild":
          return { ...base, stamp: "Wild", sub: `Color is now ${COLOR_NAME[action.color]}${unoNote}` }
        default:
          if (action.cardsLeft !== 1) return base
          return action.unoCalled ? { ...base, stamp: "UNO!", sub: `${verb(actor, "have", "has")} one card left` } : { ...base, sub: `${verb(actor, "have", "has")} one card left` }
      }
    }
    case "draw":
      if (you && action.card) return { line: `You drew ${cardLabel(action.card)}`, sub: action.playable ? "It matches · play it or keep it" : "No match · your turn passes" }
      return { line: `${actor} drew a card${action.playable ? "" : " and passed"}` }
    case "pass":
      return { line: `${actor} kept the drawn card` }
    case "catch": {
      const victim = action.victimId === me ? "You" : action.victimName
      return { line: `${actor} caught ${victim === "You" ? "you" : victim}`, stamp: "Caught!", sub: `${verb(victim, "draw", "draws")} ${action.drawCount} for not calling UNO` }
    }
    case "timeout":
      return { line: `${actor} ran out of time` }
    case "leave":
      return { line: `${action.name} left the table` }
  }
}

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

export function UnoGame({ state, playerId, isHost, roomLabel, message, connected, onPlayCard, onDrawCard, onPass, onCallUno, onCatch, onRestart, onLeave }: UnoGameProps) {
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const [tableRef, table] = useElementSize<HTMLDivElement>()
  const [handRef, handArea] = useElementSize<HTMLDivElement>()
  const deckRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const seatRefs = useRef(new Map<string, HTMLDivElement>())
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const playedFrom = useRef<{ id: string; spot: Spot } | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ cardId: string | null } | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [dealing, setDealing] = useState(true)
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  const [under, setUnder] = useState<UnoCard[]>([])
  const [rootWidth, setRootWidth] = useState(1024)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setToast(message)
    if (!message) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [message])

  // ---- Reveal: hold the previous view while the newest action plays out ----
  const latest = state.log.at(-1) ?? null
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const seenId = useRef<number | null>(null)
  const previousState = useRef(state)
  const compact = rootWidth < 640
  const handCardW = compact ? 64 : 92

  const spotOf = (element: Element | null | undefined): Spot | null => {
    const root = rootRef.current
    if (!element || !root) return null
    const rect = element.getBoundingClientRect()
    const origin = root.getBoundingClientRect()
    return { x: rect.left - origin.left + rect.width / 2, y: rect.top - origin.top + rect.height / 2, w: rect.width, h: rect.height }
  }

  useEffect(() => {
    if (!latest) {
      seenId.current = null
      setReveal(null)
      return
    }
    // Joining or reconnecting shows the table as it is, without replaying.
    if (seenId.current === null) {
      seenId.current = latest.id
      return
    }
    if (seenId.current === latest.id) return
    seenId.current = latest.id
    const action = latest
    const snapshot = previousState.current
    const times = timeline(action, playerId, reduced)
    setReveal({ action, snapshot, phase: "flying" })
    if (!reduced) launchFlights(action, times.land)
    const advance = (phase: Phase) => setReveal((current) => current?.action.id === action.id ? { ...current, phase } : current)
    const timers = [
      window.setTimeout(() => advance("landed"), times.land),
      window.setTimeout(() => advance("settled"), times.settle),
      window.setTimeout(() => setReveal((current) => current?.action.id === action.id ? null : current), times.release),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
    // biome-ignore lint/correctness/useExhaustiveDependencies: replays once per new action
  }, [latest?.id])

  // Declared after the reveal effect so it still holds the pre-action state when one arrives.
  useEffect(() => {
    previousState.current = state
  }, [state])

  function launchFlights(action: UnoAction, land: number) {
    const discard = spotOf(discardRef.current)
    const deck = spotOf(deckRef.current)
    if (!discard || !deck) return
    const w = discard.w
    const h = discard.h
    const handSpot = spotOf(handRef.current)
    const handPose = (spot: Spot | null): Pose | null => spot ? { x: spot.x, y: spot.y + spot.h * 0.12, rot: 0, scale: handCardW / w } : null
    const seatPose = (id: string): Pose | null => {
      if (id === playerId) return handPose(handSpot)
      const spot = spotOf(seatRefs.current.get(id))
      return spot ? { x: spot.x, y: spot.y, rot: 0, scale: 0.3 } : null
    }
    const deckPose: Pose = { x: deck.x, y: deck.y, rot: 0, scale: 1 }
    const added: Flight[] = []
    if (action.type === "play") {
      const fromMe = action.playerId === playerId
      const stored = playedFrom.current?.id === action.card.id ? playedFrom.current.spot : null
      const from = fromMe && stored ? { x: stored.x, y: stored.y, rot: 0, scale: stored.w / w } : seatPose(action.playerId)
      if (from) added.push({ id: `p${action.id}`, card: action.card, flip: false, fade: false, from, to: { x: discard.x, y: discard.y, rot: pileTilt(action.card.id), scale: 1 }, w, h, delay: 0, duration: land })
      const victimPose = action.victimId ? seatPose(action.victimId) : null
      for (let index = 0; victimPose && index < (action.drawCount ?? 0); index++) {
        added.push({ id: `v${action.id}-${index}`, card: null, flip: false, fade: true, from: deckPose, to: victimPose, w, h, delay: land + 300 + index * 150, duration: 520 })
      }
    } else if (action.type === "catch") {
      const victimPose = seatPose(action.victimId)
      for (let index = 0; victimPose && index < action.drawCount; index++) {
        added.push({ id: `c${action.id}-${index}`, card: null, flip: false, fade: true, from: deckPose, to: victimPose, w, h, delay: index * 150, duration: 520 })
      }
    } else if (action.type === "draw") {
      const to = seatPose(action.playerId)
      if (to) added.push({ id: `d${action.id}`, card: action.card ?? null, flip: Boolean(action.card), fade: true, from: deckPose, to, w, h, delay: 0, duration: land })
    }
    if (added.length) setFlights((current) => [...current, ...added])
  }

  const arriving = latest !== null && seenId.current !== null && seenId.current !== latest.id
  const active: Reveal | null = arriving && latest ? { action: latest, snapshot: previousState.current, phase: "flying" } : reveal
  const action = active?.action ?? null
  const snapshot = active?.snapshot ?? null
  const beforeLanding = active?.phase === "flying"

  const view = {
    topCard: beforeLanding ? snapshot!.topCard : state.topCard,
    activeColor: beforeLanding ? snapshot!.activeColor : state.activeColor,
    direction: beforeLanding ? snapshot!.direction : state.direction,
    currentPlayerId: snapshot ? snapshot.currentPlayerId : state.currentPlayerId,
    status: snapshot ? snapshot.status : state.status,
    drawnCardId: snapshot ? snapshot.drawnCardId : state.drawnCardId,
    deckCount: beforeLanding ? snapshot!.deckCount : state.deckCount,
  }
  const victimId = action?.type === "play" || action?.type === "catch" ? action.victimId : undefined
  const countOf = (id: string) => {
    const live = state.players[id]?.cardCount ?? 0
    if (!snapshot) return live
    const before = snapshot.players[id]?.cardCount ?? live
    if (beforeLanding) return before
    if (id === victimId && active?.phase !== "settled") return before
    return live
  }
  const holdHand = snapshot && ((beforeLanding && action?.type === "draw" && action.playerId === playerId) || (victimId === playerId && active?.phase !== "settled"))
  const rawHand = holdHand ? snapshot.myHand : state.myHand
  const hand = useMemo(() => sortHand(rawHand.filter((card) => card.id !== pending?.cardId)), [rawHand, pending?.cardId])

  // ---- Side effects tied to what is shown ----
  useEffect(() => {
    const timer = window.setTimeout(() => setDealing(false), 1600)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver(([entry]) => entry && setRootWidth(entry.contentRect.width))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const shownHandIds = hand.map((card) => card.id).join(",")
  const knownHand = useRef<Set<string> | null>(null)
  useEffect(() => {
    const ids = new Set(hand.map((card) => card.id))
    const known = knownHand.current
    knownHand.current = ids
    if (!known) return
    const added = [...ids].filter((id) => !known.has(id))
    if (!added.length) return
    setFreshIds(new Set(added))
    const timer = window.setTimeout(() => setFreshIds(new Set()), 1800)
    return () => window.clearTimeout(timer)
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the shown ids
  }, [shownHandIds])

  const shownTop = view.topCard
  const lastTop = useRef<UnoCard | null>(null)
  useEffect(() => {
    const last = lastTop.current
    lastTop.current = shownTop
    if (last && shownTop && last.id !== shownTop.id) setUnder((pile) => [...pile.filter((card) => card.id !== shownTop.id), last].slice(-3))
  }, [shownTop])

  useEffect(() => {
    setPending(null)
  }, [latest?.id, message])
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setPending(null), 2500)
    return () => window.clearTimeout(timer)
  }, [pending])

  // ---- Turn and options ----
  const myTurn = view.currentPlayerId === playerId && view.status === "playing"
  const canAct = myTurn && !active && connected && !pending
  const isPlayable = (card: UnoCard) => Boolean(
    canAct && view.topCard && view.activeColor &&
    (!view.drawnCardId || view.drawnCardId === card.id) &&
    canPlayUnoCard(card, view.topCard, view.activeColor, state.myHand),
  )
  const hasPlayable = hand.some(isPlayable)
  const canDraw = canAct && !view.drawnCardId
  const selected = canAct ? hand.find((card) => card.id === (view.drawnCardId ?? selectedId)) ?? null : null
  const selectedPlayable = selected ? isPlayable(selected) : false

  useEffect(() => {
    if (!canAct) setSelectedId(null)
  }, [canAct])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const play = (card: UnoCard, color?: UnoColor) => {
    if (!isPlayable(card)) return
    const spot = spotOf(cardRefs.current.get(card.id))
    playedFrom.current = spot ? { id: card.id, spot } : null
    setPending({ cardId: card.id })
    setSelectedId(null)
    onPlayCard(card.id, color)
  }
  const draw = () => {
    if (!canDraw) return
    setPending({ cardId: null })
    onDrawCard()
  }
  const keep = () => {
    if (!canAct || !view.drawnCardId) return
    setPending({ cardId: null })
    onPass()
  }
  // You can call during your own play's replay; others can catch once it has played out.
  const exposed = state.status === "playing" ? state.unoExposedIds : []
  const mustCall = connected && exposed.includes(playerId)
  const canCatch = (id: string) => connected && exposed.includes(id) && !(action?.type === "play" && action.playerId === id)

  const pick = (card: UnoCard) => {
    if (!canAct || view.drawnCardId) return
    setSelectedId((current) => (current === card.id ? null : card.id))
  }

  // ---- Table geometry ----
  const order = state.seatOrder
  const myIndex = order.indexOf(playerId)
  const opponents = (myIndex < 0 ? order : [...order.slice(myIndex + 1), ...order.slice(0, myIndex)]).filter((id) => state.players[id])
  const centerX = table.w / 2
  const centerY = table.h * (compact ? 0.54 : 0.52)
  const seatSpots = new Map<string, { x: number; y: number }>()
  const span = opponents.length <= 1 ? 0 : Math.min(220, 70 * (opponents.length - 1))
  opponents.forEach((id, index) => {
    const degrees = opponents.length <= 1 ? 90 : 90 + span / 2 - (span * index) / (opponents.length - 1)
    const radians = (degrees * Math.PI) / 180
    const margin = compact ? 44 : 80
    const x = Math.min(table.w - margin, Math.max(margin, centerX + table.w * 0.44 * Math.cos(radians)))
    const y = Math.max(compact ? 52 : 70, centerY - table.h * (compact ? 0.4 : 0.42) * Math.sin(radians))
    seatSpots.set(id, { x, y })
  })
  const turnTarget = view.currentPlayerId === playerId ? { x: centerX, y: table.h + 120 } : view.currentPlayerId ? seatSpots.get(view.currentPlayerId) : undefined
  const rawAngle = turnTarget ? (Math.atan2(turnTarget.y - centerY, turnTarget.x - centerX) * 180) / Math.PI : 90
  const lastAngle = useRef<number | null>(null)
  const pointerAngle = lastAngle.current === null ? rawAngle : lastAngle.current + ((((rawAngle - lastAngle.current) % 360) + 540) % 360) - 180
  useEffect(() => {
    lastAngle.current = pointerAngle
  })

  // ---- Words ----
  const nameOf = (id: string | null) => (id === playerId ? "You" : id ? state.players[id]?.name ?? snapshot?.players[id]?.name ?? "Player" : "Player")
  const story = action ? storyOf(action, playerId) : null
  const lastStory = latest ? storyOf(latest, playerId) : null
  const winner = state.winnerId
  const finished = view.status === "finished"
  const matchText = view.topCard && view.activeColor
    ? view.topCard.color === null ? `${COLOR_NAME[view.activeColor]}` : `${COLOR_NAME[view.activeColor]} or ${valueLabel(view.topCard.value)}`
    : ""
  const statusText = finished
    ? winner === playerId ? "You won the hand!" : `${nameOf(winner)} wins the hand`
    : story
      ? story.line
      : myTurn
        ? view.drawnCardId ? "Play the card you drew, or keep it" : hasPlayable ? "Your turn · pick a card" : "Your turn · nothing matches, draw a card"
        : `${nameOf(view.currentPlayerId)}'s turn`
  const turnHex = myTurn ? TURN_GOLD : view.activeColor ? COLOR_HEX[view.activeColor].base : "#94a3b8"
  const seatTag = (id: string) => {
    if (action?.type === "catch" && action.victimId === id) return `+${action.drawCount}`
    if (!action || action.type !== "play" || beforeLanding) return null
    if (action.victimId === id) return `+${action.drawCount ?? 0}`
    if (action.skippedId === id) return "Skipped"
    return null
  }
  const logEntries = state.log
    .filter((entry) => !(active && beforeLanding && entry.id === action?.id))
    .slice(-8)
    .reverse()

  // ---- Hand fan ----
  const handCardH = handCardW * 1.5
  const count = hand.length
  const fanSpacing = count > 1 ? Math.min(handCardW * 0.62, (handArea.w - 24 - handCardW) / (count - 1)) : 0
  const crowded = count > 1 && fanSpacing < (compact ? 20 : 26)
  const middle = (count - 1) / 2
  const rotStep = Math.min(5, 36 / Math.max(count, 1))
  const dropK = 14 / Math.max(middle * middle, 1)

  const handCard = (card: UnoCard, index: number) => {
    const playable = isPlayable(card)
    const isSelected = selected?.id === card.id
    const lift = isSelected ? 38 : playable ? 12 : 0
    const offset = index - middle
    const fresh = freshIds.has(card.id)
    const style = crowded
      ? ({ "--lift": `${lift}px`, marginLeft: index === 0 ? 0 : -(handCardW - (compact ? 30 : 40)), zIndex: isSelected ? 100 : index } as CSSProperties)
      : ({
          "--lift": `${lift}px`,
          "--drop": `${offset * offset * dropK}px`,
          "--rot": `${offset * rotStep}deg`,
          left: handArea.w / 2 + offset * fanSpacing - handCardW / 2,
          zIndex: isSelected ? 100 : index,
        } as CSSProperties)
    return (
      <button
        key={card.id}
        ref={(element) => {
          if (element) cardRefs.current.set(card.id, element)
          else cardRefs.current.delete(card.id)
        }}
        type="button"
        style={{ ...style, width: handCardW, height: handCardH }}
        onClick={() => pick(card)}
        onDoubleClick={() => card.color && play(card)}
        aria-pressed={isSelected}
        aria-label={`${cardLabel(card)}${playable ? ", playable" : ""}`}
        className={cn(
          "group shrink-0 rounded-[10%/6.667%] outline-none transition-transform duration-200 ease-out focus-visible:ring-4 focus-visible:ring-amber-200 motion-reduce:transition-none",
          crowded
            ? "relative [transform:translateY(calc(0px_-_var(--lift)_-_var(--hover,0px)))]"
            : "absolute bottom-3 origin-[50%_130%] [transform:translateY(calc(var(--drop)_-_var(--lift)_-_var(--hover,0px)))_rotate(var(--rot))]",
          canAct ? "hover:[--hover:16px]" : "cursor-default hover:[--hover:6px]",
        )}
      >
        <div
          className={cn("size-full rounded-[10%/6.667%] transition-[filter,box-shadow] duration-200", dealing && "uno-deal-in", fresh && !dealing && "uno-fresh")}
          style={{ "--deal-delay": `${Math.min(index, 12) * 70}ms` } as CSSProperties}
        >
          <UnoCardView
            card={card}
            className={cn(
              "size-full transition-[filter,box-shadow] duration-200",
              canAct && !playable && "brightness-[.55] saturate-[.6]",
              playable && !isSelected && "shadow-[0_0_0_2px_#fde68a,0_0_18px_#fde68aaa]",
              isSelected && "shadow-[0_0_0_3px_#fff,0_0_28px_#fde68a]",
            )}
          />
        </div>
      </button>
    )
  }

  // ---- Option tray (only for the card that was picked) ----
  let tray: ReactNode = null
  if (finished || !canAct) tray = null
  else if (selected && view.drawnCardId) {
    tray = selected.color === null
      ? <ColorPicker label="You drew a wild · pick a color" onPick={(color) => play(selected, color)} extra={<TrayButton tone="ghost" onClick={keep}>Keep it</TrayButton>} />
      : <div className="flex items-center gap-2"><span className="px-1 text-sm font-semibold">You drew {cardLabel(selected)}</span><TrayButton onClick={() => play(selected)}>Play it</TrayButton><TrayButton tone="ghost" onClick={keep}>Keep it</TrayButton></div>
  } else if (selected && selectedPlayable && selected.color === null) {
    tray = <ColorPicker label={selected.value === "wild-draw-four" ? "Wild +4 · pick a color" : "Wild · pick a color"} onPick={(color) => play(selected, color)} extra={<IconButton label="Cancel" onClick={() => setSelectedId(null)} />} />
  } else if (selected && selectedPlayable) {
    tray = <div className="flex items-center gap-2"><span className="px-1 text-sm font-semibold">{cardLabel(selected)}</span><TrayButton onClick={() => play(selected)}>Play card</TrayButton><IconButton label="Cancel" onClick={() => setSelectedId(null)} /></div>
  } else if (selected) {
    const why = selected.value === "wild-draw-four" && view.activeColor
      ? `Wild +4 only works with no ${COLOR_NAME[view.activeColor]} cards in hand`
      : `${cardLabel(selected)} doesn't match · needs ${matchText}`
    tray = <div className="flex items-center gap-2"><span className="px-1 text-sm font-semibold text-white/80">{why}</span><IconButton label="Close" onClick={() => setSelectedId(null)} /></div>
  } else {
    tray = <div className="flex items-center gap-2">
      <span className="px-1 text-sm font-semibold">{hasPlayable ? "Pick a glowing card" : "Nothing matches"}</span>
      <TrayButton tone={hasPlayable ? "ghost" : "solid"} onClick={draw}><Layers className="size-4" />Draw</TrayButton>
    </div>
  }

  const ringSize = compact ? 196 : 300
  const pileW = compact ? 70 : 100
  const pileH = pileW * 1.5
  const pileGap = compact ? 16 : 28
  const handHeight = crowded ? handCardH + 70 : handCardH + 58
  const bottomReserve = handHeight + 64

  return (
    <div
      ref={rootRef}
      className="relative h-[calc(100dvh-73px)] min-h-[560px] w-full select-none overflow-hidden text-white"
      style={{ background: "radial-gradient(120% 95% at 50% 45%, #22364d 0%, #132133 46%, #060b13 100%)" }}
    >
      <UnoCardDefs />
      {/* Felt grain and the active-color glow. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay" style={{ backgroundImage: "repeating-radial-gradient(circle at 30% 20%, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)" }} />
      {UNO_COLORS.map((color) => (
        <div
          key={color}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{ opacity: view.activeColor === color ? 1 : 0, background: `radial-gradient(48% 46% at 50% 46%, ${COLOR_HEX[color].base}40, transparent 72%)` }}
        />
      ))}
      <div aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-72 transition-opacity duration-500", myTurn ? "opacity-100" : "opacity-0")} style={{ background: "radial-gradient(60% 100% at 50% 100%, #fde68a33, transparent 70%)" }} />

      {/* Table: opponents around the piles. */}
      <div ref={tableRef} className="absolute inset-x-0 top-20" style={{ bottom: bottomReserve }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[4%] inset-y-[2%] rounded-[50%] border border-white/[0.06] shadow-[inset_0_0_120px_rgb(0_0_0/.35)]" />
        {table.w > 0 && opponents.map((id) => {
          const player = state.players[id]!
          const spot = seatSpots.get(id)!
          const cards = countOf(id)
          return (
            <Seat
              key={id}
              refCallback={(element) => {
                if (element) seatRefs.current.set(id, element)
                else seatRefs.current.delete(id)
              }}
              name={player.name}
              x={spot.x}
              y={spot.y}
              count={cards}
              compact={compact}
              isTurn={!finished && view.currentPlayerId === id}
              isHost={id === state.hostId}
              offline={player.connected === false}
              bot={Boolean(player.isBot)}
              exposed={exposed.includes(id)}
              onCatch={canCatch(id) ? () => onCatch(id) : null}
              tag={seatTag(id)}
            />
          )
        })}

        {table.w > 0 && (
          <div className="absolute" style={{ left: centerX, top: centerY }}>
            {/* Direction ring with a pointer at whoever plays next. */}
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ width: ringSize, height: ringSize }}>
              <svg viewBox="0 0 100 100" className={cn("absolute inset-0 size-full uno-spin", view.direction === -1 && "[animation-direction:reverse]")} aria-hidden="true">
                <circle cx="50" cy="50" r="46" fill="none" stroke={turnHex} strokeOpacity="0.28" strokeWidth="0.8" strokeDasharray="1.5 3" />
                {[0, 90, 180, 270].map((degrees) => {
                  const radians = (degrees * Math.PI) / 180
                  return <path key={degrees} d="M-2.2,-3 L1.8,0 L-2.2,3" fill="none" stroke={turnHex} strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${50 + 46 * Math.cos(radians)} ${50 + 46 * Math.sin(radians)}) rotate(${degrees + (view.direction === -1 ? -90 : 90)})`} />
                })}
              </svg>
              {!finished && (
                <div className="absolute inset-0 transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `rotate(${pointerAngle}deg)` }}>
                  <svg viewBox="0 0 20 20" className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 drop-shadow-[0_0_8px_rgba(253,230,138,.9)]" aria-hidden="true">
                    <path d="M4,3 L17,10 L4,17 Z" fill={myTurn ? TURN_GOLD : "#fff"} />
                  </svg>
                </div>
              )}
            </div>

            {/* Draw pile and discard pile. */}
            <div className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center" style={{ gap: pileGap }}>
              <div className="relative" style={{ width: pileW, height: pileH }}>
                {[3, 2, 1].filter((depth) => depth < view.deckCount).map((depth) => (
                  <div key={depth} className="absolute inset-0" style={{ transform: `translate(${depth * 1.5}px, ${depth * 2.5}px)` }}>
                    <UnoCardView card={null} className="size-full brightness-[.6]" />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={draw}
                  disabled={!canDraw}
                  aria-label={`Draw a card, ${view.deckCount} left`}
                  className={cn(
                    "absolute inset-0 rounded-[10%/6.667%] outline-none transition-transform duration-200 focus-visible:ring-4 focus-visible:ring-amber-200",
                    canDraw && "cursor-pointer hover:-translate-y-2",
                    canDraw && !hasPlayable && "uno-bob shadow-[0_0_0_3px_#fde68a,0_0_30px_#fde68a]",
                  )}
                >
                  <div ref={deckRef} className="size-full"><UnoCardView card={null} className="size-full" /></div>
                </button>
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Deck · {view.deckCount}</span>
              </div>

              <div ref={discardRef} className="relative" style={{ width: pileW, height: pileH }}>
                {under.map((card) => {
                  const shift = pileShift(card.id)
                  return <div key={`u${card.id}`} className="absolute inset-0" style={{ transform: `translate(${shift.x}px, ${shift.y}px) rotate(${pileTilt(card.id)}deg)` }}><UnoCardView card={card} className="size-full brightness-[.7]" /></div>
                })}
                {view.activeColor && <div aria-hidden="true" className="absolute -inset-3 rounded-[18px] transition-[box-shadow] duration-500" style={{ boxShadow: `0 0 0 3px ${COLOR_HEX[view.activeColor].base}, 0 0 36px ${COLOR_HEX[view.activeColor].base}` }} />}
                {shownTop && (
                  <div className="absolute inset-0" style={{ transform: `rotate(${pileTilt(shownTop.id)}deg)` }}>
                    <UnoCardView card={shownTop} className="size-full" />
                  </div>
                )}
                {shownTop?.color === null && view.activeColor && !reduced && (
                  <div key={shownTop.id} aria-hidden="true" className="uno-shock pointer-events-none absolute inset-0 rounded-full border-4" style={{ borderColor: COLOR_HEX[view.activeColor].base }} />
                )}
              </div>
            </div>

            {/* What to match, plus the reveal caption. */}
            <div className="absolute left-0 flex -translate-x-1/2 flex-col items-center gap-2" style={{ top: ringSize / 2 + (compact ? 4 : 10) }}>
              {view.activeColor && !finished && (
                <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-black/50 py-1 pl-1.5 pr-3 text-xs font-bold backdrop-blur">
                  <span className="size-4 rounded-full ring-2 ring-white/80 transition-colors duration-500" style={{ background: COLOR_HEX[view.activeColor].base }} />
                  <span className="text-white/60">Match</span>
                  <span>{matchText}</span>
                </div>
              )}
            </div>
            {story?.stamp && !beforeLanding && (
              <div key={action!.id} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: pileGap / 2 + pileW * 0.85, top: -pileH * 0.48 }}>
                <div className="uno-stamp whitespace-nowrap rounded-xl border-[3px] border-white px-3 py-1 text-2xl font-black italic uppercase tracking-tight shadow-[0_10px_30px_rgb(0_0_0/.5)] sm:text-4xl" style={{ background: story.tone ? COLOR_HEX[story.tone].base : "#111", color: story.tone === "yellow" ? "#141416" : "#fff" }}>
                  {story.stamp}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top bar. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start gap-2 lg:inset-x-6 lg:top-5">
        <button type="button" onClick={onLeave} className={cn(GLASS, "flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition hover:bg-black/60")}>
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
        <div className="hidden pl-2 lg:block">
          <p className="text-lg font-black italic leading-none tracking-tight">UNO</p>
          <p className="text-xs text-white/60">Room {roomLabel}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1 lg:absolute lg:left-1/2 lg:w-[min(560px,48vw)] lg:-translate-x-1/2">
          <div
            aria-live="polite"
            className={cn(GLASS, "flex h-11 min-w-0 items-center gap-3 px-4 transition-colors duration-500", myTurn && !active && "border-amber-200/70 bg-amber-400/20")}
          >
            <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", !finished && "animate-pulse")} style={{ background: turnHex, boxShadow: `0 0 14px ${turnHex}` }} />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{statusText}</p>
            {!connected && <span className="flex shrink-0 items-center gap-1 text-xs text-amber-200"><WifiOff className="size-3.5" />Reconnecting</span>}
          </div>
          {story?.sub && !beforeLanding ? (
            <p key={action!.id} className="uno-rise self-center truncate rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">{story.sub}</p>
          ) : !active && lastStory && !finished ? (
            <p className="self-center truncate px-3 text-[11px] text-white/50 xl:hidden">Last: {lastStory.line}</p>
          ) : null}
        </div>
      </div>

      {/* Recent actions (wide screens). */}
      {logEntries.length > 0 && (
        <div className={cn(GLASS, "absolute right-6 top-24 hidden w-64 p-3 xl:block")}>
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Recent</p>
          <ol className="space-y-1.5">
            {logEntries.map((entry, index) => (
              <li key={entry.id} className={cn("flex items-center gap-2 px-1 text-xs", index === 0 ? "text-white" : "text-white/55")}>
                {entry.type === "play" ? (
                  <span className="h-[21px] w-[14px] shrink-0"><UnoCardView card={entry.card} className="size-full shadow-none" /></span>
                ) : (
                  <span className="grid h-[21px] w-[14px] shrink-0 place-items-center rounded-sm bg-white/10 text-[9px]">·</span>
                )}
                <span className="min-w-0 truncate">{storyOf(entry, playerId).line}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* My hand and the option tray. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div className="pointer-events-none flex min-h-12 w-full items-center justify-center gap-2 px-3">
          <div className={cn("items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold", tray ? "hidden sm:flex" : "flex", myTurn ? "border-amber-200/80 bg-amber-300 text-[#1a1406]" : "border-white/10 bg-black/45 text-white/80 backdrop-blur")}>
            <span>{myTurn ? "Your turn" : "You"}</span>
            <span className={cn("rounded-full px-1.5", myTurn ? "bg-black/15" : "bg-white/10")}>{rawHand.length}</span>
            {rawHand.length === 1 && !mustCall && <span className="rounded bg-[#ef3b33] px-1 italic text-[#ffd23f]">UNO!</span>}
          </div>
          {mustCall && (
            <button
              type="button"
              onClick={onCallUno}
              className="uno-bob pointer-events-auto rounded-xl border-[3px] border-[#ffd23f] bg-[#ef3b33] px-4 py-1.5 text-lg font-black italic uppercase tracking-tight text-[#ffd23f] shadow-[0_0_24px_#ef3b33cc] transition hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
            >
              UNO!
            </button>
          )}
          {tray && (
            <div className={cn(GLASS, "uno-rise flex min-h-11 max-w-[calc(100vw-24px)] items-center overflow-x-auto px-2 py-1.5 sm:max-w-[calc(100vw-180px)]")}>{tray}</div>
          )}
        </div>
        <div
          ref={handRef}
          className={cn("relative w-full max-w-5xl", crowded && "flex items-end overflow-x-auto overflow-y-hidden px-4 pb-3 pt-12")}
          style={{ height: handHeight }}
        >
          {handArea.w > 0 && hand.map(handCard)}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4" style={{ bottom: handHeight + 56 }}>
          <p className="rounded-xl border border-red-400/40 bg-red-950/80 px-4 py-2 text-center text-sm text-red-100 backdrop-blur">{toast}</p>
        </div>
      )}

      {/* Cards in flight. */}
      {flights.map((flight) => (
        <FlightCard key={flight.id} flight={flight} onDone={() => setFlights((current) => current.filter((item) => item.id !== flight.id))} />
      ))}

      {finished && (
        <Finish
          you={winner === playerId}
          name={nameOf(winner)}
          isHost={isHost}
          reduced={reduced}
          onRestart={onRestart}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}

function TrayButton({ children, onClick, tone = "solid" }: { children: ReactNode; onClick: () => void; tone?: "solid" | "ghost" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200",
        tone === "solid" ? "bg-amber-300 text-[#1a1406] hover:bg-amber-200" : "bg-white/10 text-white hover:bg-white/20",
      )}
    >
      {children}
    </button>
  )
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid size-9 shrink-0 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
      <X className="size-4" />
    </button>
  )
}

function ColorPicker({ label, onPick, extra }: { label: string; onPick: (color: UnoColor) => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="px-1 text-sm font-semibold"><span className="sm:hidden">Color</span><span className="hidden sm:inline">{label}</span></span>
      {UNO_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Play as ${COLOR_NAME[color]}`}
          className="size-9 shrink-0 rounded-full border-2 border-white/90 shadow-lg transition hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60 sm:size-10"
          style={{ background: `radial-gradient(circle at 35% 30%, ${COLOR_HEX[color].base}, ${COLOR_HEX[color].deep})` }}
        />
      ))}
      {extra}
    </div>
  )
}

function Seat({ refCallback, name, x, y, count, compact, isTurn, isHost, offline, bot, exposed, onCatch, tag }: {
  refCallback: (element: HTMLDivElement | null) => void
  name: string
  x: number
  y: number
  count: number
  compact: boolean
  isTurn: boolean
  isHost: boolean
  offline: boolean
  bot: boolean
  exposed: boolean
  onCatch: (() => void) | null
  tag: string | null
}) {
  const shown = Math.min(count, compact ? 7 : 10)
  const backW = compact ? 13 : 17
  const backH = backW * 1.5
  const step = compact ? 5 : 6.5
  const fanW = shown > 0 ? backW + (shown - 1) * step : backW
  const hue = hash(name) % 360
  return (
    <div
      ref={refCallback}
      className={cn("absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-opacity", offline && "opacity-55")}
      style={{ left: x, top: y, width: compact ? 84 : 120 }}
    >
      <div className="relative" style={{ width: fanW, height: backH + 4 }}>
        {Array.from({ length: shown }, (_, index) => (
          <span
            key={index}
            className="absolute bottom-0 overflow-hidden rounded-[3px] border border-[#fbf8f1] bg-[#151517] shadow-[0_2px_4px_rgb(0_0_0/.5)]"
            style={{ left: index * step, width: backW, height: backH, transform: `rotate(${(index - (shown - 1) / 2) * 5}deg)`, transformOrigin: "50% 120%" }}
          >
            <span className="absolute inset-[2px] rotate-[30deg] rounded-[50%] bg-[#ef3b33]" />
          </span>
        ))}
      </div>
      <div className="relative">
        {isTurn && <span aria-hidden="true" className="uno-turn-ring absolute -inset-[5px] rounded-full" style={{ background: `conic-gradient(${TURN_GOLD}, transparent 35%, transparent 60%, ${TURN_GOLD})` }} />}
        <span
          className={cn("relative grid place-items-center rounded-full border-2 font-black text-white transition-[border-color,box-shadow] duration-300", compact ? "size-10 text-sm" : "size-12 text-base")}
          style={{
            background: `radial-gradient(circle at 35% 30%, hsl(${hue} 45% 62%), hsl(${hue} 40% 30%) 70%)`,
            borderColor: isTurn ? TURN_GOLD : "rgba(255,255,255,.2)",
            boxShadow: isTurn ? `0 0 24px ${TURN_GOLD}aa` : "none",
          }}
        >
          {bot ? <Bot className={compact ? "size-4" : "size-5"} /> : name.slice(0, 1).toUpperCase()}
        </span>
        <span className="absolute -bottom-1 -right-2 min-w-[22px] rounded-full bg-[#fbf8f1] px-1.5 text-center text-[11px] font-black leading-[18px] text-[#141416] shadow">{count}</span>
        {count === 1 && !exposed && <span className="uno-bob absolute -left-5 -top-2 -rotate-12 rounded-md bg-[#ef3b33] px-1.5 text-[10px] font-black italic leading-4 text-[#ffd23f] ring-2 ring-[#ffd23f]">UNO!</span>}
      </div>
      <p className={cn("flex max-w-full items-center gap-1 truncate text-xs font-bold", isTurn ? "text-amber-100" : "text-white/85")}>
        {isHost && <Crown className="size-3 shrink-0 text-amber-300" />}
        <span className="truncate">{name}</span>
        {offline && <WifiOff className="size-3 shrink-0" />}
      </p>
      {onCatch ? (
        <button type="button" onClick={onCatch} className="uno-bob rounded-full bg-[#ffd23f] px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-[#141416] shadow-[0_0_16px_#ffd23faa] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          Catch!
        </button>
      ) : tag ? (
        <span className="uno-tag rounded-full bg-[#ef3b33] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">{tag}</span>
      ) : isTurn ? (
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#1a1406]">Playing</span>
      ) : null}
    </div>
  )
}

function FlightCard({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const { from, to, delay, duration } = flight
    const dx = from.x - to.x
    const dy = from.y - to.y
    const peak = Math.max(from.scale, to.scale) * 1.08
    const animation = element.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${from.rot}deg) scale(${from.scale})`, opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 36}px) rotate(${(from.rot + to.rot) / 2 - 8}deg) scale(${peak})`, offset: 0.5 },
        { opacity: 1, offset: 0.85 },
        { transform: `translate(0px, 0px) rotate(${to.rot}deg) scale(${to.scale})`, opacity: flight.fade ? 0 : 1 },
      ],
      { duration, delay, easing: "cubic-bezier(.3,.7,.25,1)", fill: "both" },
    )
    const flip = flight.flip && innerRef.current
      ? innerRef.current.animate([{ transform: "rotateY(180deg)" }, { transform: "rotateY(180deg)", offset: 0.25 }, { transform: "rotateY(0deg)" }], { duration, delay, easing: "ease-in-out", fill: "both" })
      : null
    animation.onfinish = () => window.setTimeout(() => done.current(), 60)
    return () => {
      animation.cancel()
      flip?.cancel()
    }
  }, [flight])
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute z-30 [perspective:800px]"
      style={{ left: flight.to.x - flight.w / 2, top: flight.to.y - flight.h / 2, width: flight.w, height: flight.h, opacity: 0 }}
    >
      {flight.flip && flight.card ? (
        <div ref={innerRef} className="relative size-full [transform-style:preserve-3d]">
          <div className="absolute inset-0 [backface-visibility:hidden]"><UnoCardView card={flight.card} className="size-full" /></div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"><UnoCardView card={null} className="size-full" /></div>
        </div>
      ) : (
        <UnoCardView card={flight.card} className="size-full shadow-[0_24px_40px_-10px_rgb(0_0_0/.8)]" />
      )}
    </div>
  )
}

const CONFETTI = Array.from({ length: 36 }, (_, index) => ({
  left: (index * 37) % 100,
  color: COLOR_HEX[UNO_COLORS[index % 4]!].base,
  delay: (index % 9) * 0.35,
  fall: 2.6 + (index % 5) * 0.4,
  drift: ((index % 7) - 3) * 30,
  spin: 360 + (index % 4) * 180,
}))

function Finish({ you, name, isHost, reduced, onRestart, onLeave }: { you: boolean; name: string; isHost: boolean; reduced: boolean; onRestart: () => void; onLeave: () => void }) {
  return (
    <div className="uno-fade-in absolute inset-0 z-50 grid place-items-center bg-[#060b13]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="uno-winner">
      {!reduced && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              className="uno-confetti absolute top-0 h-5 w-3.5 rounded-[2px] border border-white/70"
              style={{ left: `${piece.left}%`, background: piece.color, "--delay": `${piece.delay}s`, "--fall": `${piece.fall}s`, "--drift": `${piece.drift}px`, "--spin": `${piece.spin}deg` } as CSSProperties}
            />
          ))}
        </div>
      )}
      <div className="uno-pop relative w-full max-w-sm rounded-3xl border border-white/15 bg-black/60 p-8 text-center shadow-2xl backdrop-blur-md">
        <Trophy className="mx-auto size-12 text-amber-300 drop-shadow-[0_0_18px_rgba(253,230,138,.7)]" />
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.3em] text-amber-200/80">Hand over</p>
        <h2 id="uno-winner" className="mt-2 break-words text-4xl font-black italic tracking-tight">{you ? "You win!" : `${name} wins`}</h2>
        <div className="mt-7 flex flex-col gap-2">
          {isHost ? (
            <button type="button" onClick={onRestart} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-300 font-bold text-[#1a1406] transition hover:bg-amber-200">
              <RotateCcw className="size-4" />Play again
            </button>
          ) : (
            <p className="text-sm text-white/60">Waiting for the host to start another hand</p>
          )}
          <button type="button" onClick={onLeave} className="h-11 rounded-xl text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">Leave table</button>
        </div>
      </div>
    </div>
  )
}
