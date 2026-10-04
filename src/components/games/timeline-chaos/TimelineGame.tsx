import { ArrowDownToLine, Check, Hourglass, Landmark, Lock, LogOut, RotateCcw, ScrollText, Settings2, Sparkles, Trophy, Undo2, X, Zap, History } from "lucide-react"
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import type { Reaction } from "@/lib/reactions"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import { playSound, type SoundName } from "@/lib/sounds"
import { countCorrectPairs, insertIntoSlots, pairCount, revealStageMs, TIMELINE_PACE_MS, type TimelineRevealStage } from "@/lib/timelineChaos"
import { cn } from "@/lib/utils"
import { GLASS, GlassButton, PartyTable, SidePanel, TableTopBar, TimerRing, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar, Seat, SeatChip } from "../party-shell/SeatRing"
import { Podium, Scoreboard, type ScoreRow } from "../party-shell/Scoreboard"
import { CATEGORY, EventCard, OrderPips, ROMAN, stageLayout, type Spot } from "./rail"
import type { PublicTimelineGameState, PublicTimelinePlayer, TimelineHistoryEntry } from "../../../../party/timeline-chaos"

export interface TimelineGameProps {
  state: PublicTimelineGameState
  playerId: string
  /** One player against the clock: no room beat, scores panel or reactions. */
  solo: boolean
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  /** Server clock minus local clock. */
  clockOffset: number
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onArrange: (roundId: string, order: string[] | null) => void
  onLock: (roundId: string, order: string[]) => void
  onRestart: () => void
  onLeave: () => void
}

const TABLE_BG = "radial-gradient(ellipse at 50% 32%, #4d3523 0%, #2c1e13 52%, #120b06 100%)"
const BRASS = "#d9b46a"
const EMERALD = "#34d399"
const GOLD = "#fcd34d"
/** Card flight between table spots; the last dealt card lands well inside TIMELINE_PACE_MS.deal. */
const FLIGHT_MS = 520
/** First card leaves the archive a beat after the state lands, so it visibly flies in. */
const DEAL_LEAD = 150
/** Sort beat: cards slide one after another, then glow/badges, then the facts, all well inside TIMELINE_PACE_MS.sort. */
const SORT_STEP = 130
const SORT_FLIGHT = 800
const SORT_SETTLE = 1300
const FACTS_AT = 1450
/** Score beat: "+N" floats, then the Historian stamp. */
const FLOAT_AT = 150
const HISTORIAN_AT = 650

const STAGE_LINE: Record<TimelineRevealStage, string> = {
  tension: "Checking the archives…",
  stamp: "Dating the events",
  sort: "The true timeline",
  room: "How the room did",
  score: "Points land",
}

interface Drag {
  id: string
  pointerId: number
  /** Grab point inside the card. */
  dx: number
  dy: number
  x: number
  y: number
  sx: number
  sy: number
  moved: boolean
}

export function TimelineGame(props: TimelineGameProps) {
  const { state, playerId, solo, connected, reactions } = props
  const me = state.players[playerId] as PublicTimelinePlayer | undefined
  const n = state.events.length || 4
  const maxPairs = pairCount(n)
  const over = state.status === "finished"
  const ordering = state.status === "playing" && state.phase === "ordering"
  const reveal = state.status === "playing" && state.phase === "reveal" ? state.reveal : null
  const stage = reveal?.stage ?? null
  const roundId = state.roundId

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const [scoresPref, setScoresPref] = useState<boolean | null>(null)
  const scoresOpen = !solo && (scoresPref ?? wide)
  const [logOpen, setLogOpen] = useState(false)
  const [logSeen, setLogSeen] = useState(0)
  const [resultsHidden, setResultsHidden] = useState(false)

  // ─── Clock: the ordering timer and the reveal beats, on the server's clock ──
  const now = useNow(state.status === "playing", 100) + props.clockOffset
  const limit = state.settings.roundSeconds
  const dealStartedAt = state.roundEndsAt ? state.roundEndsAt - limit * 1000 - TIMELINE_PACE_MS.deal : 0
  const dealElapsed = ordering && state.roundEndsAt ? now - dealStartedAt : Infinity
  const secondsLeft = ordering && state.roundEndsAt ? Math.max(0, Math.min(limit, Math.ceil((state.roundEndsAt - now) / 1000))) : null
  const stageLen = stage ? revealStageMs(stage, n) : 0
  const elapsed = reveal ? Math.max(0, Math.min(stageLen, now - reveal.startedAt)) : Infinity
  /** Cards sit in the true order. */
  const sorted = over || stage === "sort" || stage === "room" || stage === "score"
  const settled = over || stage === "room" || stage === "score" || (stage === "sort" && elapsed >= SORT_SETTLE)

  // ─── My arrangement: local until locked, kept per round ─────────────────
  const [local, setLocal] = useState<{ roundId: string; slots: (string | null)[] }>({ roundId: "", slots: [] })
  const slots: (string | null)[] = local.roundId === roundId ? local.slots : (state.myOrder ?? state.myDraft ?? Array.from({ length: n }, () => null))
  const [lockSent, setLockSent] = useState("")
  const iLocked = state.submittedPlayerIds.includes(playerId) || lockSent === roundId
  const full = slots.length === n && slots.every(Boolean)
  const placed = slots.filter(Boolean).length
  const departed = (k: number) => dealElapsed >= DEAL_LEAD + k * TIMELINE_PACE_MS.dealStep
  const dealt = departed(n - 1) && dealElapsed >= DEAL_LEAD + (n - 1) * TIMELINE_PACE_MS.dealStep + FLIGHT_MS * 0.6
  const canArrange = ordering && Boolean(me) && connected && !iLocked && (secondsLeft ?? 0) > 0 && dealt

  const [selectedState, setSelectedState] = useState<{ roundId: string; id: string } | null>(null)
  const selected = canArrange && selectedState?.roundId === roundId ? selectedState.id : null
  const select = (id: string | null) => setSelectedState(id ? { roundId, id } : null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const liveDrag = canArrange && drag ? drag : null

  const place = (next: (string | null)[], sound: SoundName | null) => {
    setLocal({ roundId, slots: next })
    select(null)
    props.onArrange(roundId, next.every(Boolean) ? (next as string[]) : null)
    if (sound) playSound(sound)
  }
  const unplace = (id: string) => place(slots.map((value) => (value === id ? null : value)), "deal")
  const lock = () => {
    if (!canArrange || !full) return
    setLockSent(roundId)
    select(null)
    playSound("lockin")
    props.onLock(roundId, slots as string[])
  }

  // ─── Table geometry ──────────────────────────────────────────────────────
  const players = useMemo(() => Object.values(state.players).sort((left, right) => left.joinedAt - right.joinedAt), [state.players])
  const others = players.filter((player) => player.id !== playerId).map((player) => player.id)
  const layout = stageLayout(others, box.w, box.h, { n, insetLeft: wide && scoresOpen ? 236 : 0, insetRight: wide && logOpen ? 372 : 0 })
  const { card, compact } = layout
  const toTable = (event: ReactPointerEvent) => {
    const rect = tableRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const dragCentre = (d: Drag) => ({ x: d.x - d.dx + card.w / 2, y: d.y - d.dy + card.h / 2 })
  const hover = liveDrag?.moved ? layout.slotAt(dragCentre(liveDrag).x, dragCentre(liveDrag).y) : null
  /** Where the other cards sit while one is carried: a gap opens where it will land. */
  const preview = liveDrag?.moved && typeof hover === "number"
    ? insertIntoSlots(slots, liveDrag.id, hover)
    : liveDrag?.moved && hover === "hand" ? slots.map((value) => (value === liveDrag.id ? null : value)) : slots

  // ─── The reveal, frozen per beat ─────────────────────────────────────────
  const byId = new Map(state.events.map((event) => [event.id, event]))
  const dealIndex = new Map(state.events.map((event, index) => [event.id, index]))
  const correct = state.correctOrder
  /** My order as the reveal judges it (locked, taken at the buzzer, or just what was on the rail). */
  const judged: (string | null)[] = state.myOrder ?? slots
  const myPairs = state.myOrder && correct.length ? countCorrectPairs(state.myOrder, correct) : null
  const myResult = state.roundResults[playerId]
  const myPerfect = myPairs === maxPairs
  const showFacts = !over && ((stage === "sort" && elapsed >= FACTS_AT) || (solo && stage === "score"))

  const posOf = (id: string): Spot & { s: number } => {
    const k = dealIndex.get(id) ?? 0
    if (ordering && !departed(k)) return { ...layout.deck, s: 0.7 }
    if (liveDrag?.moved && liveDrag.id === id) return { x: liveDrag.x - liveDrag.dx, y: liveDrag.y - liveDrag.dy, r: 3, s: 1.06 }
    if (sorted && correct.includes(id)) return { ...layout.slots[correct.indexOf(id)]!, s: 1 }
    const arrangement = reveal || over ? judged : preview
    const at = arrangement.indexOf(id)
    if (at >= 0) return { ...layout.slots[at]!, s: 1 }
    return { ...layout.hand[k]!, s: 1 }
  }

  // ─── Pointer drag, tap-to-place and keys ─────────────────────────────────
  const tapCard = (id: string) => {
    if (selected === id) return select(null)
    const at = slots.indexOf(id)
    if (selected && at >= 0) return place(insertIntoSlots(slots, selected, at), "knock")
    select(id)
    playSound("flip")
  }
  const onCardDown = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canArrange || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = toTable(event)
    const at = posOf(id)
    setDrag({ id, pointerId: event.pointerId, dx: point.x - at.x, dy: point.y - at.y, x: point.x, y: point.y, sx: point.x, sy: point.y, moved: false })
  }
  const onCardMove = (id: string, event: ReactPointerEvent) => {
    if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) return
    const point = toTable(event)
    const moved = drag.moved || Math.hypot(point.x - drag.sx, point.y - drag.sy) > 6
    if (moved && !drag.moved) {
      playSound("flip")
      select(null)
    }
    setDrag({ ...drag, x: point.x, y: point.y, moved })
  }
  const onCardUp = (id: string) => {
    if (!drag || drag.id !== id) return
    setDrag(null)
    if (!canArrange) return
    if (!drag.moved) return tapCard(id)
    const centre = dragCentre(drag)
    const target = layout.slotAt(centre.x, centre.y)
    if (typeof target === "number") place(insertIntoSlots(slots, id, target), "knock")
    else if (target === "hand" && slots.includes(id)) unplace(id)
  }
  const onCardKey = (id: string, event: ReactKeyboardEvent) => {
    if (!canArrange) return
    const at = slots.indexOf(id)
    const key = event.key
    if (key === "Enter" || key === " ") tapCard(id)
    else if (/^[1-9]$/.test(key) && Number(key) <= n) place(insertIntoSlots(slots, id, Number(key) - 1), "knock")
    else if ((key === "ArrowLeft" || key === "ArrowRight") && at >= 0) {
      const to = Math.max(0, Math.min(n - 1, at + (key === "ArrowLeft" ? -1 : 1)))
      if (to !== at) place(insertIntoSlots(slots, id, to), "knock")
    } else if (key === "ArrowUp" && at < 0) {
      const free = slots.indexOf(null)
      if (free >= 0) place(insertIntoSlots(slots, id, free), "knock")
    } else if ((key === "ArrowDown" || key === "Backspace" || key === "Delete") && at >= 0) unplace(id)
    else if (key === "Escape") select(null)
    else return
    event.preventDefault()
  }

  // ─── Sound ───────────────────────────────────────────────────────────────
  const othersLocked = state.submittedPlayerIds.filter((id) => id !== playerId).length
  useSoundCue(ordering ? `deal:${roundId}` : null, () => state.events.forEach((_, k) => playSound("deal", DEAL_LEAD + k * TIMELINE_PACE_MS.dealStep + 80)))
  useSoundCue(ordering && othersLocked ? `${roundId}:locks${othersLocked}` : null, () => playSound("lockin"))
  useSoundCue(ordering && !iLocked && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5 ? `${roundId}:t${secondsLeft}` : null, () => playSound("tick"))
  useSoundCue(reveal ? `${roundId}:${reveal.seq}` : over ? `over:${state.finishedAt}` : null, () => {
    if (over) return playSound("win")
    if (stage === "tension") playSound("toll")
    else if (stage === "stamp") correct.forEach((_, k) => playSound("thunk", k * TIMELINE_PACE_MS.stampStep + 60))
    else if (stage === "sort") {
      playSound("whoosh")
      if (myPairs !== null) playSound(myPerfect ? "correct" : myPairs >= maxPairs / 2 ? "group" : "wrong", SORT_SETTLE)
    } else if (stage === "room") playSound("flip")
    else if (stage === "score") {
      if (myResult?.perfect) playSound("sync", HISTORIAN_AT)
      else if (myResult?.points) playSound("chip", FLOAT_AT)
    }
  })

  // ─── Scores, log, status ─────────────────────────────────────────────────
  const scoreRows: ScoreRow[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    gained: stage === "score" ? state.roundResults[player.id]?.points || undefined : undefined,
  }))
  const history = state.history
  const logBadge = !logOpen && history.length > logSeen
  const present = players.filter((player) => player.connected !== false)
  const lockedCount = state.submittedPlayerIds.filter((id) => state.players[id]?.connected !== false).length

  const status = (
    <>
      <History className="size-4 shrink-0 text-amber-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{over ? "Final scores" : `Round ${state.roundNumber} / ${state.settings.rounds}`}</p>
        <p className="truncate text-[11px] text-white/60">
          {ordering
            ? solo ? (iLocked ? "Locked in" : "Oldest → newest") : `${lockedCount} / ${present.length} locked in`
            : stage ? (stage === "score" && myResult?.perfect ? "A perfect timeline!" : STAGE_LINE[stage])
            : over ? `${history.length} rounds in the archive` : ""}
        </p>
      </div>
      {secondsLeft !== null && !iLocked && <TimerRing left={secondsLeft} limit={limit} />}
    </>
  )

  const railCentreY = layout.slotTop + card.h / 2
  const showTargets = Boolean(selected)
  const selectedEvent = selected ? byId.get(selected) : undefined

  return (
    <PartyTable tableRef={tableRef} background={TABLE_BG}>
      {/* Gallery wall: faint panelling and two warm spotlights over the rail. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[.07]" style={{ background: "repeating-linear-gradient(90deg, transparent 0 46px, #f4dfb2 46px 47px)" }} />
      {box.w > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[50%] bg-amber-200/[.08] blur-3xl"
          style={{ left: layout.railLeft - 60, top: railCentreY - card.h * 1.1, width: layout.railW + 120, height: card.h * 2.4 }}
        />
      )}

      <TableTopBar
        title="Timeline Chaos"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        status={status}
        onReact={props.onReact}
        canReact={!solo && Boolean(me)}
        actions={
          <>
            {!solo && <GlassButton icon={<Trophy className="size-4" />} label="Scores" pressed={scoresOpen} onClick={() => setScoresPref(!scoresOpen)} />}
            <GlassButton
              icon={<ScrollText className="size-4" />}
              label="Log"
              pressed={logOpen}
              badge={logBadge}
              onClick={() => {
                setLogOpen(!logOpen)
                setLogSeen(history.length)
              }}
            />
          </>
        }
      />

      {props.error && connected && (
        <p className="uno-rise absolute left-1/2 top-[64px] z-30 -translate-x-1/2 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-semibold shadow-lg">{props.error}</p>
      )}

      {box.w > 0 && (
        <>
          {/* Caption above the rail. */}
          <p
            className="pointer-events-none absolute z-[6] -translate-x-1/2 whitespace-nowrap font-serif text-[11px] italic tracking-wide text-[#f3e3bf]/70 sm:text-xs"
            style={{ left: layout.cx, top: layout.slotTop - 20 }}
          >
            {ordering
              ? iLocked ? "Locked in. The archive is checking…" : compact ? "Oldest → newest · drag or tap" : "Oldest → newest · drag a card onto the rail, or tap it and then a slot"
              : stage ? STAGE_LINE[stage] : ""}
          </p>

          {/* The rail: brass bar, posts and numbered plates under four plinths. */}
          <div aria-hidden="true" className="pointer-events-none absolute z-[4]" style={{ left: layout.left, top: layout.railY - 3, width: layout.right - layout.left, height: 6 }}>
            <div className="size-full rounded-full shadow-[0_3px_8px_rgb(0_0_0/.55)]" style={{ background: `linear-gradient(180deg, #f6dc9c 0%, ${BRASS} 45%, #7c5a24 100%)` }} />
            <span className="absolute -top-5 left-1 font-serif text-[10px] font-bold uppercase tracking-[0.25em] text-[#e8cf98]/70">Older</span>
            <span className="absolute -top-5 right-1 font-serif text-[10px] font-bold uppercase tracking-[0.25em] text-[#e8cf98]/70">Newer</span>
          </div>
          {layout.slots.map((slot, i) => (
            <div key={`plinth${i}`} aria-hidden="true">
              <div
                className={cn(
                  "pointer-events-none absolute z-[5] rounded-xl border-2 border-dashed transition-[border-color,background-color,box-shadow] duration-200",
                  hover === i ? "border-[#f5d58a] bg-[#f5d58a]/15 shadow-[0_0_30px_rgb(245_213_138/.35)]" : showTargets ? "border-[#f5d58a]/55 bg-[#f5d58a]/[.06]" : "border-[#d9b46a]/30 bg-black/15",
                )}
                style={{ left: slot.x, top: slot.y, width: card.w, height: card.h }}
              />
              <span className="pointer-events-none absolute z-[4] w-[3px] -translate-x-1/2 bg-[#a07c3c]" style={{ left: slot.x + card.w / 2, top: slot.y + card.h, height: layout.railY - slot.y - card.h }} />
              <span
                className="pointer-events-none absolute z-[5] -translate-x-1/2 rounded-[3px] border border-[#5c4219] px-1.5 font-serif text-[10px] font-black leading-4 text-[#3b2a0f] shadow"
                style={{ left: slot.x + card.w / 2, top: layout.railY + 5, background: `linear-gradient(180deg, #f6dc9c, ${BRASS})` }}
              >
                {ROMAN[i]}
              </span>
            </div>
          ))}

          {/* Event cards. */}
          {state.events.map((event) => {
            const k = dealIndex.get(event.id) ?? 0
            const pos = posOf(event.id)
            const dragging = Boolean(liveDrag?.moved && liveDrag.id === event.id)
            const isSelected = selected === event.id
            const rank = correct.indexOf(event.id)
            const from = judged.indexOf(event.id)
            const stamped = Boolean(event.yearLabel) && rank >= 0 && (sorted || (stage === "stamp" && elapsed >= rank * TIMELINE_PACE_MS.stampStep))
            const verdict = settled && rank >= 0 ? (from === rank ? "right" : from < 0 ? "unplaced" : rank - from) : null
            const sortDelay = stage === "sort" && rank >= 0 ? rank * SORT_STEP : 0
            const atSlot = slots.indexOf(event.id)
            return (
              <button
                key={event.id}
                type="button"
                tabIndex={canArrange ? 0 : -1}
                aria-disabled={!canArrange}
                aria-pressed={canArrange ? isSelected : undefined}
                aria-label={`${event.title}${event.yearLabel ? `, ${event.yearLabel}` : ""}. ${atSlot >= 0 && !sorted ? `Slot ${atSlot + 1} of ${n}` : sorted ? `Slot ${rank + 1} of ${n}` : "In your hand"}.${canArrange ? ` Press 1 to ${n} to place, arrows to move, Enter to pick up.` : ""}`}
                className={cn(
                  "absolute left-0 top-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  canArrange ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default",
                  verdict === "right" && "party-glow",
                )}
                style={{
                  width: card.w,
                  height: card.h,
                  transform: `translate(${pos.x}px, ${pos.y - (isSelected ? 12 : 0)}px) rotate(${pos.r}deg) scale(${pos.s})`,
                  opacity: ordering && !departed(k) ? 0 : 1,
                  zIndex: dragging ? 40 : isSelected ? 30 : 20 + Math.max(0, rank),
                  transition: dragging
                    ? "none"
                    : stage === "sort"
                      ? `transform ${SORT_FLIGHT}ms cubic-bezier(.3,.75,.2,1) ${sortDelay}ms`
                      : `transform ${FLIGHT_MS}ms cubic-bezier(.3,.75,.2,1), opacity 160ms`,
                  ["--glow" as string]: EMERALD,
                }}
                onPointerDown={(pointer) => onCardDown(event.id, pointer)}
                onPointerMove={(pointer) => onCardMove(event.id, pointer)}
                onPointerUp={() => onCardUp(event.id)}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(key) => onCardKey(event.id, key)}
              >
                <EventCard event={event} w={card.w} h={card.h} lifted={dragging || isSelected} selected={isSelected} dim={over} year={stamped ? event.yearLabel : null}>
                  {verdict !== null && verdict !== "right" && (
                    <span
                      className={cn(
                        "uno-tag absolute right-1 top-1 rounded-full px-1.5 font-mono text-[10px] font-black leading-4 shadow",
                        verdict === "unplaced" ? "bg-stone-600 text-white/80" : "bg-amber-400 text-amber-950",
                      )}
                      title={verdict === "unplaced" ? "Not placed" : `Moved ${Math.abs(verdict)} ${Math.abs(verdict) === 1 ? "slot" : "slots"} ${verdict > 0 ? "later" : "earlier"}`}
                    >
                      {verdict === "unplaced" ? "—" : `${verdict > 0 ? "→" : "←"}${Math.abs(verdict)}`}
                    </span>
                  )}
                  {verdict === "right" && (
                    <span className="uno-tag absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-emerald-400 text-emerald-950 shadow">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </EventCard>
              </button>
            )
          })}

          {/* Tap-to-place targets, shown once a card is picked up. */}
          {showTargets && selectedEvent && layout.slots.map((slot, i) => slots[i] === selected ? null : (
            <button
              key={`target${i}`}
              type="button"
              aria-label={`Place ${selectedEvent.title} in slot ${i + 1}`}
              onClick={() => place(insertIntoSlots(slots, selectedEvent.id, i), "knock")}
              className={cn(
                "uno-tag absolute z-[35] grid place-items-center rounded-xl border-2 border-[#f5d58a] text-[#fff1cf] transition hover:bg-[#f5d58a]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                slots[i] ? "bg-black/45 backdrop-blur-[1px]" : "bg-[#f5d58a]/10",
              )}
              style={{ left: slot.x, top: slot.y, width: card.w, height: card.h }}
            >
              <span className="flex flex-col items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em]">
                <ArrowDownToLine className="size-5 animate-bounce" />
                {slots[i] ? "Insert" : "Here"}
              </span>
            </button>
          ))}
          {showTargets && selected && slots.includes(selected) && (
            <button
              type="button"
              onClick={() => unplace(selected)}
              className={cn(GLASS, "uno-rise absolute z-[35] flex h-9 -translate-x-1/2 items-center gap-1.5 px-3 text-xs font-semibold hover:bg-black/65")}
              style={{ left: layout.cx, top: layout.handTop + card.h * 0.35 }}
            >
              <Undo2 className="size-3.5" /> Back to hand
            </button>
          )}

          {/* Facts under the true timeline. */}
          {showFacts && correct.map((id, i) => {
            const event = byId.get(id)
            const slot = layout.slots[i]
            if (!event?.fact || !slot) return null
            return (
              <p
                key={`fact${id}`}
                className="uno-rise pointer-events-none absolute z-[7] overflow-hidden text-center font-serif leading-snug text-[#f3e6c8]/85"
                style={{
                  left: slot.x - layout.gap / 2,
                  top: layout.handTop + 6,
                  width: card.w + layout.gap,
                  maxHeight: layout.bottom - layout.handTop - 6,
                  fontSize: compact ? 10 : 12,
                  animationDelay: solo && stage === "score" ? "0ms" : `${i * 140}ms`,
                }}
              >
                {event.fact}
              </p>
            )
          })}

          {/* Room view: everyone's order as pips. */}
          {stage === "room" && (
            <div
              className="absolute z-[8] flex flex-wrap content-start justify-center gap-1.5 overflow-y-auto"
              style={{ left: layout.railLeft - 8, top: layout.handTop, width: layout.railW + 16, maxHeight: layout.bottom - layout.handTop }}
            >
              {[...players].sort((left, right) => (left.id === playerId ? -1 : right.id === playerId ? 1 : 0)).map((player, i) => {
                const result = state.roundResults[player.id]
                return (
                  <div
                    key={player.id}
                    className={cn(GLASS, "uno-rise flex items-center gap-1.5 rounded-xl py-1 pl-1 pr-2", result?.perfect && "border-amber-200/60 bg-[#2a1c06]/70")}
                    style={{ animationDelay: `${i * Math.min(140, 1400 / Math.max(1, players.length))}ms` }}
                  >
                    <PartyAvatar id={player.id} name={player.name} size={20} className="ring-1" />
                    <span className="max-w-[72px] truncate text-[11px] font-semibold">{player.id === playerId ? "You" : player.name}</span>
                    <OrderPips order={result?.order ?? null} correctOrder={correct} size={compact ? 13 : 15} />
                    <span className={cn("font-mono text-[10px] font-bold tabular-nums", result?.perfect ? "text-amber-200" : "text-white/60")}>
                      {result?.order ? `${result.correctPairs}/${maxPairs}` : "—"}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tension hold. */}
          {stage === "tension" && (
            <p
              className="uno-pop pointer-events-none absolute z-[36] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-serif font-black uppercase tracking-[0.3em] text-[#fbe7b8] drop-shadow-[0_0_18px_rgb(245_213_138/.8)]"
              style={{ left: layout.cx, top: railCentreY, fontSize: compact ? 15 : 22 }}
            >
              <span className="animate-pulse">Consulting the archive…</span>
            </p>
          )}

          {/* My perfect timeline. */}
          {stage === "score" && myResult?.perfect && (
            <span
              role="status"
              className="party-stamp pointer-events-none absolute z-[45] flex flex-col items-center whitespace-nowrap rounded-lg border-4 border-double border-[#b3261e] bg-[#fff4e0]/90 px-4 py-1.5 font-serif font-black uppercase text-[#b3261e] shadow-[0_10px_40px_rgb(0_0_0/.5)]"
              style={{ left: layout.cx, top: railCentreY, fontSize: compact ? 20 : 30, letterSpacing: "0.2em", animationDelay: `${HISTORIAN_AT}ms` }}
            >
              Historian
              <span className="text-[10px] tracking-[0.25em] sm:text-xs">Perfect timeline</span>
            </span>
          )}

          {/* Seats. */}
          {players.map((player) => {
            const seat = player.id === playerId ? layout.me : layout.seats[player.id]
            if (!seat) return null
            const locked = state.submittedPlayerIds.includes(player.id)
            const result = state.roundResults[player.id]
            const chip = ordering
              ? locked ? <SeatChip tone="done"><Check className="size-2.5" />Locked in</SeatChip> : <SeatChip tone="waiting">Sorting…</SeatChip>
              : (stage === "room" || stage === "score") && result
                ? <SeatChip tone={result.perfect ? "done" : "waiting"}>{result.order ? `${result.correctPairs}/${maxPairs} pairs` : "No order"}</SeatChip>
                : reveal
                  ? locked ? <SeatChip tone="done"><Check className="size-2.5" />Locked in</SeatChip> : <SeatChip tone="waiting">Time's up</SeatChip>
                  : null
            const scoring = stage === "score" && result
            return (
              <Seat
                key={player.id}
                x={seat.x}
                y={seat.y}
                size={layout.avatar}
                width={layout.seatW}
                id={player.id}
                name={player.name}
                isMe={player.id === playerId}
                isHost={!solo && player.id === state.hostId}
                connected={player.connected !== false}
                chip={chip}
                score={player.score}
                glow={scoring && result.perfect ? GOLD : scoring && result.points > 0 ? EMERALD : null}
                bubble={reactions[player.id]}
                bubbleSide={player.id === playerId ? "top" : "bottom"}
              >
                {scoring && result.points > 0 && (
                  <span
                    className="party-float pointer-events-none absolute bottom-full left-1/2 z-20 whitespace-nowrap rounded-full bg-amber-300 px-2 py-0.5 text-sm font-black text-amber-950 shadow-lg"
                    style={{ animationDelay: `${FLOAT_AT}ms` }}
                  >
                    +{result.points}
                  </span>
                )}
                {scoring && result.perfect && (
                  <span
                    className="party-stamp pointer-events-none absolute left-1/2 top-1/2 z-20 whitespace-nowrap rounded-[3px] border-2 border-[#b3261e] bg-[#fff4e0] px-1 font-serif text-[9px] font-black uppercase tracking-wider text-[#b3261e] shadow"
                    style={{ animationDelay: `${HISTORIAN_AT}ms` }}
                  >
                    Historian
                  </span>
                )}
              </Seat>
            )
          })}
        </>
      )}

      {/* Action dock. */}
      <div className="absolute bottom-3 z-[38] flex -translate-x-1/2 flex-col items-center gap-1.5" style={{ left: box.w ? layout.dockX : "50%" }}>
        {ordering && me && !iLocked && (
          <>
            <p className="whitespace-nowrap text-[11px] text-[#f3e3bf]/70">{full ? "Happy with it? Lock it in." : `Place ${n - placed} more ${n - placed === 1 ? "card" : "cards"}`}</p>
            <button
              type="button"
              onClick={lock}
              disabled={!canArrange || !full}
              className="flex h-12 items-center gap-2 whitespace-nowrap rounded-2xl border border-[#5c4219] px-6 text-sm font-black text-[#2b1d08] shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/50 disabled:hover:scale-100"
              style={canArrange && full ? { backgroundImage: `linear-gradient(180deg, #f8e0a6, ${BRASS})` } : undefined}
            >
              <Lock className="size-4" /> Lock in
            </button>
          </>
        )}
        {ordering && iLocked && !solo && (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            <Check className="size-4 text-emerald-300" /> Locked in{present.length > lockedCount ? ` · waiting for ${present.length - lockedCount} more` : ""}
          </p>
        )}
        {stage === "tension" && (
          <p className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold")}>
            <Hourglass className="size-4 animate-pulse text-amber-200" /> {state.myOrder ? "Your order is in" : "No order from you this round"}
          </p>
        )}
        {settled && !over && (
          <p key={stage} className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            {myPairs === null ? (
              <span className="text-white/65">You didn't place a timeline</span>
            ) : (
              <>
                <span className={cn("font-mono font-black tabular-nums", myPerfect ? "text-amber-200" : "text-white")}>{myPairs}/{maxPairs}</span>
                <span className="text-white/70">pairs in order</span>
                {stage === "score" && myResult && <span className="rounded-full bg-amber-300 px-2 font-black text-amber-950">+{myResult.points}</span>}
              </>
            )}
          </p>
        )}
        {over && resultsHidden && (
          <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
            <Trophy className="size-4 text-amber-300" /> Show results
          </button>
        )}
      </div>

      {scoresOpen && (
        <div className={cn(GLASS, "uno-rise absolute left-3 top-[68px] z-[34] w-[220px] p-2", !wide && "bg-[#140d07]/90")}>
          <div className="mb-1.5 flex items-center gap-1.5 px-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">
            <Trophy className="size-3.5 text-amber-300" />
            <span className="flex-1">Scores</span>
            {!wide && (
              <button type="button" aria-label="Close scores" onClick={() => setScoresPref(false)} className="grid size-6 place-items-center rounded-md hover:bg-white/10">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Scoreboard rows={scoreRows} meId={playerId} />
        </div>
      )}

      {logOpen && (
        <SidePanel title="Archive log" icon={<ScrollText className="size-4 text-amber-200" />} onClose={() => setLogOpen(false)}>
          {history.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-white/50">No rounds dated yet.</p>
          ) : (
            <ol className="space-y-3">
              {[...history].reverse().map((entry) => <LogEntry key={entry.roundNumber} entry={entry} meId={playerId} maxPairs={maxPairs} />)}
            </ol>
          )}
        </SidePanel>
      )}

      {over && !resultsHidden && (
        <GameOver
          state={state}
          rows={scoreRows}
          meId={playerId}
          solo={solo}
          isHost={props.isHost}
          onRestart={props.onRestart}
          onHide={() => setResultsHidden(true)}
          onLeave={props.onLeave}
        />
      )}
    </PartyTable>
  )
}

function LogEntry({ entry, meId, maxPairs }: { entry: TimelineHistoryEntry; meId: string; maxPairs: number }) {
  const mine = entry.results[meId]
  const byId = new Map(entry.events.map((event) => [event.id, event]))
  return (
    <li className="rounded-xl border border-white/10 bg-white/[.04] p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Round {entry.roundNumber}</p>
        {mine?.perfect && <span className="rounded-[3px] border border-[#e05a4f] px-1 font-serif text-[9px] font-black uppercase tracking-wider text-[#f08a80]">Historian</span>}
        <span className="font-mono text-xs font-bold text-amber-200">{mine ? `+${mine.points}` : "—"}</span>
      </div>
      <ol className="mt-2 space-y-1">
        {entry.correctOrder.map((id, i) => {
          const event = byId.get(id)
          if (!event) return null
          const right = mine?.order?.[i] === id
          return (
            <li key={id} className="flex items-start gap-2 text-xs">
              <span className="w-[52px] shrink-0 font-mono font-bold text-amber-200/90">{event.yearLabel}</span>
              <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: CATEGORY[event.category].hex }} />
              <span className="min-w-0 flex-1 text-white/80">{event.title}</span>
              {mine?.order && (right ? <Check className="size-3.5 shrink-0 text-emerald-300" /> : <X className="size-3.5 shrink-0 text-rose-300/80" />)}
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/55">
        <span>Your order</span>
        <OrderPips order={mine?.order ?? null} correctOrder={entry.correctOrder} />
        <span className="ml-auto">{mine?.order ? `${mine.correctPairs}/${maxPairs} pairs` : "no order"}</span>
      </div>
    </li>
  )
}

function nameOf(players: Record<string, PublicTimelinePlayer>, id: string, meId: string) {
  return id === meId ? "You" : players[id]?.name ?? "Someone who left"
}

/** Best player by `value` (ties all share it); null when nobody has one. */
function award(players: PublicTimelinePlayer[], value: (player: PublicTimelinePlayer) => number | null, lowest = false) {
  const scored = players.map((player) => ({ player, value: value(player) })).filter((entry): entry is { player: PublicTimelinePlayer; value: number } => entry.value !== null)
  if (!scored.length) return null
  const best = lowest ? Math.min(...scored.map((entry) => entry.value)) : Math.max(...scored.map((entry) => entry.value))
  return { ids: scored.filter((entry) => entry.value === best).map((entry) => entry.player.id), value: best }
}

function GameOver({ state, rows, meId, solo, isHost, onRestart, onHide, onLeave }: {
  state: PublicTimelineGameState
  rows: ScoreRow[]
  meId: string
  solo: boolean
  isHost: boolean
  onRestart: () => void
  onHide: () => void
  onLeave: () => void
}) {
  const players = Object.values(state.players)
  const ranked = [...rows].sort((left, right) => right.score - left.score)
  const me = state.players[meId]
  const winners = state.winnerIds.filter((id) => state.players[id])
  const title = solo
    ? `${(me?.score ?? 0).toLocaleString()} points`
    : winners.includes(meId)
      ? winners.length > 1 ? "You share the archive!" : "You rewrote history!"
      : winners.length > 1 ? `Tie: ${winners.map((id) => nameOf(state.players, id, meId)).join(" & ")}` : `${nameOf(state.players, winners[0] ?? "", meId)} knows their history`
  const historian = award(players, (player) => (player.perfectRounds > 0 ? player.perfectRounds : null))
  const traveller = award(players, (player) => (player.correctPairs > 0 ? player.correctPairs : null))
  const fastest = award(players, (player) => player.fastestLockMs, true)
  const awards = [
    { key: "historian", label: "Historian", icon: Landmark, tone: "text-amber-300", hex: GOLD, winner: historian, line: (value: number) => `${value} perfect ${value === 1 ? "timeline" : "timelines"}`, empty: "Nobody nailed a full timeline." },
    { key: "traveller", label: "Time traveller", icon: Sparkles, tone: "text-teal-300", hex: "#5eead4", winner: traveller, line: (value: number) => `${value} pairs in order`, empty: "No pairs landed." },
    { key: "fastest", label: "Fastest lock-in", icon: Zap, tone: "text-sky-300", hex: "#7dd3fc", winner: fastest, line: (value: number) => `Locked in after ${(value / 1000).toFixed(1)}s`, empty: "Nobody locked in early." },
  ]

  return (
    <div className="uno-fade-in absolute inset-0 z-40 overflow-y-auto bg-[#0d0805]/80 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="text-center">
          <Landmark className="mx-auto size-8 text-amber-300" />
          <h2 className="mt-2 font-serif text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/60">
            {state.history.length} rounds · {state.settings.pack} pack{solo && me ? ` · ${me.perfectRounds} perfect` : ""}
          </p>
        </div>

        {!solo && <Podium rows={rows} meId={meId} />}

        <div className="grid w-full gap-3 sm:grid-cols-3">
          {awards.map((item, i) => {
            const Icon = item.icon
            const id = item.winner?.ids[0]
            return (
              <div key={item.key} className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: `${900 + i * 150}ms` }}>
                <p className={cn("flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]", item.tone)}>
                  <Icon className="size-3.5" /> {item.label}
                </p>
                {item.winner && id ? (
                  <div className="mt-3 flex items-center gap-3">
                    {!solo && <PartyAvatar id={id} name={nameOf(state.players, id, meId)} size={40} style={{ boxShadow: `0 0 0 3px ${item.hex}` }} />}
                    <div className="min-w-0">
                      {!solo && <p className="truncate font-black">{item.winner.ids.map((winner) => nameOf(state.players, winner, meId)).join(" & ")}</p>}
                      <p className={cn(solo ? "text-lg font-black" : "text-xs text-white/65")}>{item.line(item.winner.value)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-white/55">{item.empty}</p>
                )}
              </div>
            )
          })}
        </div>

        {!solo && ranked.length > 3 && (
          <ol className={cn(GLASS, "w-full max-w-sm divide-y divide-white/5 p-1.5")}>
            {ranked.slice(3).map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-5 text-right font-mono text-xs text-white/50">{1 + ranked.filter((other) => other.score > row.score).length}</span>
                <PartyAvatar id={row.id} name={row.name} size={22} className="ring-1" />
                <span className="min-w-0 flex-1 truncate">{row.id === meId ? "You" : row.name}</span>
                <span className="font-mono font-bold tabular-nums">{row.score}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {solo || isHost ? (
            <button type="button" onClick={onRestart} className="flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-black text-[#2b1d08] transition hover:scale-[1.03]" style={{ backgroundImage: `linear-gradient(180deg, #f8e0a6, ${BRASS})` }}>
              <RotateCcw className="size-4" /> Play again
            </button>
          ) : (
            <p className="text-sm text-white/60">Waiting for the host to start a rematch…</p>
          )}
          <button type="button" onClick={onHide} className={cn(GLASS, "h-11 px-4 text-sm font-semibold hover:bg-black/65")}>View table</button>
          <button type="button" onClick={onLeave} className={cn(GLASS, "flex h-11 items-center gap-1.5 px-4 text-sm font-semibold hover:bg-black/65")}>
            {solo ? <><Settings2 className="size-4" /> Settings</> : <><LogOut className="size-4" /> Leave</>}
          </button>
        </div>
      </div>
    </div>
  )
}
