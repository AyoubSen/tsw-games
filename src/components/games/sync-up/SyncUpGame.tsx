import { Check, Combine, Heart, Hourglass, LogOut, RotateCcw, ScrollText, Shuffle, SkipForward, Sparkles, Trophy, X } from "lucide-react"
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react"
import type { Reaction } from "@/lib/reactions"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { GLASS, GlassButton, PartyTable, SidePanel, TableTopBar, TimerRing, useBeat, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar, Seat, SeatChip, ringLayout, viewerFirst } from "../party-shell/SeatRing"
import { PromptCard } from "../party-shell/PromptStage"
import { Podium, Scoreboard, type ScoreRow } from "../party-shell/Scoreboard"
import { AnswerCard, cardSize, groupLabel, groupSpellings, pileLayout, soulmates, spreadLayout, wildcard, type Board, type CardTone, type Spot } from "./board"
import {
  REVEAL_MS, flipDuration, isPerfectSync,
  type AnswerGroup, type PublicSyncUpGameState, type RoundSummary, type SyncUpPlayer,
} from "../../../../party/sync-up"

export interface SyncUpGameProps {
  state: PublicSyncUpGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  myAnswer: { roundNumber: number; text: string } | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onSubmit: (answer: string) => void
  onMerge: (from: string, into: string) => void
  onSkipMerge: () => void
  onNextRound: () => void
  onRestart: () => void
  onLeave: () => void
}

const TABLE_BG = "radial-gradient(ellipse at 50% 40%, #0f3a3e 0%, #0a2328 50%, #03090b 100%)"
const ACCENT = "#5eead4"
const GOLD = "#fcd34d"
/**
 * Inside the flip beat (REVEAL_MS.flipStep apart, REVEAL_MS.flipLand after the
 * last): take-off waits one frame so each card starts at its seat, turns face
 * up mid-flight and has landed face up before the beat ends.
 */
const LIFT_MS = 120
const FLIGHT_MS = 650
const FACE_MS = 420
/** Score beat: matching piles light up one after another, biggest first, then "+N" flies to each member. */
const LIGHT_SPREAD_MS = 1200
const TOKEN_LEAD_MS = 250
const TOKEN_MS = 800

const STAGE_LINE = {
  tension: "Answers are in…",
  flip: "Flipping answers",
  cluster: "Finding matches",
  merge: "Close calls",
  score: "Matches score",
  done: "Round over",
} as const

export function SyncUpGame(props: SyncUpGameProps) {
  const { state, playerId, isHost, connected, reactions } = props
  const me = state.players[playerId] as SyncUpPlayer | undefined
  const submitting = state.status === "submitting"
  const over = state.status === "finished"
  const reveal = state.status === "reveal" ? state.reveal : null
  const stage = reveal?.stage ?? null
  /** Cards sit in their piles. */
  const piled = over || stage === "cluster" || stage === "merge" || stage === "score" || stage === "done"
  /** Piles have scored. */
  const lit = over || stage === "score" || stage === "done"

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const [scoresPref, setScoresPref] = useState<boolean | null>(null)
  const scoresOpen = scoresPref ?? wide
  const [logOpen, setLogOpen] = useState(false)
  const [logSeen, setLogSeen] = useState(0)
  const [resultsHidden, setResultsHidden] = useState(false)

  // ─── My answer: typed here, shown only to me, editable until the flip ───
  const roundKey = `${state.startedAt}:${state.roundNumber}`
  const locked = props.myAnswer?.roundNumber === state.roundNumber ? props.myAnswer.text : null
  const [draftState, setDraftState] = useState({ key: "", text: "" })
  const draft = draftState.key === roundKey ? draftState.text : (locked ?? "")
  const iSubmitted = state.submittedPlayerIds.includes(playerId)
  const canAnswer = submitting && Boolean(me) && connected
  const draftReady = draft.trim().length >= 2 && draft.trim() !== locked
  const submit = () => {
    if (!canAnswer || !draftReady) return
    props.onSubmit(draft.trim())
  }

  const limit = state.settings.roundTimeLimit
  const now = useNow(submitting)
  const secondsLeft = submitting && state.roundStartedAt ? Math.max(0, Math.ceil((state.roundStartedAt + limit * 1000 - now) / 1000)) : null

  // ─── Merge beat: optimistic for the host until the server's merge lands ──
  const [pending, setPending] = useState<{ from: string; into: string; n: number } | null>(null)
  const serverGroups = state.answerGroups
  const groups = useMemo(() => {
    if (!pending || stage !== "merge" || (reveal?.merge?.n ?? 0) !== pending.n) return serverGroups
    const from = serverGroups.find((group) => group.id === pending.from)
    const into = serverGroups.find((group) => group.id === pending.into)
    if (!from || !into) return serverGroups
    const merged: AnswerGroup = { ...into, answers: [...into.answers, ...from.answers], merged: [...into.merged, from.id] }
    return serverGroups.filter((group) => group !== from).map((group) => (group === into ? merged : group)).sort((left, right) => right.answers.length - left.answers.length)
  }, [pending, stage, reveal?.merge?.n, serverGroups])

  // ─── Reveal beat, replayed locally from the server's pacing ─────────────
  const answers = state.revealedAnswers
  const perfect = lit && isPerfectSync(groups, Object.keys(state.players).length)
  const beatLen = stage === "tension" ? REVEAL_MS.tension
    : stage === "flip" ? flipDuration(answers.length)
    : stage === "cluster" ? REVEAL_MS.cluster
    : stage === "merge" ? REVEAL_MS.merge
    : stage === "score" ? (perfect ? REVEAL_MS.perfect : REVEAL_MS.score)
    : 0
  const elapsed = useBeat(reveal ? `${reveal.seq}` : null, beatLen, stage === "flip" || stage === "score" ? 90 : stage === "merge" ? 250 : 0)
  const flipIndex = new Map(answers.map((answer, i) => [answer.playerId, i]))
  const departed = (id: string) => stage !== "flip" || elapsed >= LIFT_MS + (flipIndex.get(id) ?? 0) * REVEAL_MS.flipStep
  const faceUp = (id: string) => stage !== "flip" || elapsed >= LIFT_MS + (flipIndex.get(id) ?? 0) * REVEAL_MS.flipStep + FACE_MS
  const mergeLeft = stage === "merge" ? Math.max(0, Math.ceil((REVEAL_MS.merge - elapsed) / 1000)) : null

  const scoringGroups = groups.filter((group) => group.points > 0)
  const lightStep = scoringGroups.length > 1 ? Math.min(320, LIGHT_SPREAD_MS / (scoringGroups.length - 1)) : 0
  const lightDelay = (group: AnswerGroup) => Math.max(0, scoringGroups.indexOf(group)) * lightStep
  const stampDelay = scoringGroups.length * lightStep + 450
  const loners = groups.some((group) => group.answers.length === 1)

  useSoundCue(submitting && state.submittedPlayerIds.length ? `${roundKey}:${state.submittedPlayerIds.length}` : null, () => playSound("lockin"))
  useSoundCue(reveal?.merge ? `${roundKey}:merge${reveal.merge.n}` : null, () => playSound("merge"))
  useSoundCue(reveal ? `${reveal.seq}:${reveal.stage}` : over ? `over:${state.finishedAt}` : null, () => {
    if (over) return playSound("win")
    if (stage === "flip") answers.forEach((_, i) => playSound("flip", LIFT_MS + i * REVEAL_MS.flipStep + FACE_MS))
    else if (stage === "cluster") playSound("whoosh")
    else if (stage === "merge") playSound("turn")
    else if (stage === "score") {
      if (perfect) playSound("sync", 200)
      else if (scoringGroups.length) playSound("group")
      if (loners) playSound("lonewolf", stampDelay)
    } else if (stage === "done") playSound("roundEnd")
  })

  // ─── Table geometry ──────────────────────────────────────────────────────
  const players = useMemo(() => Object.values(state.players).sort((left, right) => left.joinedAt - right.joinedAt), [state.players])
  const seatOrder = useMemo(() => viewerFirst(players.map((player) => player.id), playerId), [players, playerId])
  const ring = ringLayout(seatOrder, box.w, box.h, {
    top: 64,
    bottomReserve: 72,
    insetLeft: wide && scoresOpen ? 236 : 0,
    insetRight: wide && logOpen ? 372 : 0,
  })
  const { compact, avatar, seatW, cx, cy, rx, ry } = ring
  const innerW = Math.max(200, 2 * rx - seatW - 12)
  const promptSmall = compact || reveal !== null || over
  const promptW = Math.min(promptSmall ? 560 : 640, compact ? Math.max(220, innerW + 24) : (promptSmall ? 1.3 : 1.55) * rx - seatW)
  const promptHalf = promptSmall ? 50 : 74
  const promptY = cy - ry * (promptSmall ? 0.64 : 0.56)
  const halfW = Math.max(100, compact ? rx - seatW / 2 : Math.min(400, rx * 0.74 - seatW / 2))
  const boardTop = promptY + promptHalf + 14
  const boardBottom = cy + ry * (compact ? 0.78 : 0.72) - avatar / 2 - 24
  const board: Board = { left: cx - halfW, top: boardTop, width: 2 * halfW, height: Math.max(80, boardBottom - boardTop), cx }
  const card = cardSize(compact)
  const spread = useMemo(() => spreadLayout(answers.map((answer) => answer.playerId), board, card), [answers, board.left, board.top, board.width, board.height, card.w])
  const { piles, spots: pileSpots } = useMemo(() => pileLayout(groups, board, card), [groups, board.left, board.top, board.width, board.height, card.w])
  const groupOf = (id: string) => groups.find((group) => group.answers.some((answer) => answer.playerId === id))

  // ─── Merging: drag a pile onto another, or tap two and press merge ───────
  const canMerge = stage === "merge" && isHost && connected
  const [picked, setPicked] = useState<string[]>([])
  const livePicked = canMerge ? picked.filter((id) => groups.some((group) => group.id === id)) : []
  const [drag, setDrag] = useState<{ id: string; x0: number; y0: number; px: number; py: number; moved: boolean } | null>(null)
  const liveDrag = canMerge && drag && piles[drag.id] ? drag : null
  const pileAt = (x: number, y: number, except: string) =>
    Object.entries(piles).find(([id, rect]) => id !== except && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h)?.[0] ?? null
  const dropTarget = liveDrag?.moved ? pileAt(liveDrag.px, liveDrag.py, liveDrag.id) : null
  const merge = (from: string, into: string) => {
    setPending({ from, into, n: reveal?.merge?.n ?? 0 })
    setPicked([])
    props.onMerge(from, into)
  }
  const toTable = (event: ReactPointerEvent) => {
    const rect = tableRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const pickedPair = livePicked.length === 2
    ? [...livePicked].sort((left, right) => groups.findIndex((group) => group.id === left) - groups.findIndex((group) => group.id === right))
    : null

  // ─── Scores and history ──────────────────────────────────────────────────
  const scoreRows: ScoreRow[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    gained: stage === "done" ? groupOf(player.id)?.points || undefined : undefined,
  }))
  const history = state.history
  const logBadge = !logOpen && history.length > logSeen

  const status = (
    <>
      <Shuffle className="size-4 shrink-0 text-teal-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">
          {over ? "Final scores" : <><span className="max-sm:hidden">Round </span>{state.roundNumber} / {state.settings.rounds}</>}
        </p>
        <p className="truncate text-[11px] text-white/60">
          {submitting ? `${state.submittedPlayerIds.length} / ${players.length} locked in` : stage ? (perfect && stage === "score" ? "Perfect sync!" : STAGE_LINE[stage]) : over ? `${history.length} prompts played` : ""}
        </p>
      </div>
      {secondsLeft !== null && <TimerRing left={secondsLeft} limit={limit} />}
      {mergeLeft !== null && <TimerRing left={mergeLeft} limit={REVEAL_MS.merge / 1000} />}
    </>
  )

  const toneOf = (group: AnswerGroup | undefined): CardTone =>
    !lit || !group ? "plain" : perfect ? "perfect" : group.points > 0 ? "match" : group.answers.length === 1 ? "alone" : "plain"

  return (
    <PartyTable tableRef={tableRef} background={TABLE_BG} className="min-h-[560px]">
      {/* Stage light. */}
      <div aria-hidden="true" className="pointer-events-none absolute rounded-[50%] bg-teal-300/[.06] blur-2xl" style={{ left: cx - rx * 0.9, top: cy - ry * 0.75, width: rx * 1.8, height: ry * 1.5 }} />

      <TableTopBar
        title="Sync Up"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        status={status}
        onReact={props.onReact}
        canReact={Boolean(me)}
        actions={
          <>
            <GlassButton icon={<Trophy className="size-4" />} label="Scores" pressed={scoresOpen} onClick={() => setScoresPref(!scoresOpen)} />
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
          {state.prompt && (
            <PromptCard
              dealKey={roundKey}
              eyebrow={`Prompt #${state.roundNumber}`}
              tag={state.prompt.pack}
              text={state.prompt.text}
              compact={promptSmall}
              className="transition-[top,width] duration-500"
              style={{ left: cx, top: promptY, width: promptW }}
            />
          )}

          {/* My answer, while the round is open. */}
          {submitting && me && (
            <form
              className="uno-pop absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-teal-200/25 bg-[#071a1c]/85 p-3 shadow-[0_24px_60px_rgb(0_0_0/.55)] backdrop-blur-md"
              style={{ left: cx, top: board.top + board.height / 2, width: Math.min(420, Math.max(240, board.width)) }}
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.24em] text-teal-200/70">Your answer · only you see it</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraftState({ key: roundKey, text: event.target.value.slice(0, 40) })}
                  placeholder="Think like the room…"
                  maxLength={40}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  autoFocus
                  disabled={!canAnswer}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/95 px-3 text-base font-bold text-[#0d1f1d] outline-none placeholder:font-medium placeholder:text-black/35 focus:ring-2 focus:ring-teal-300 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!canAnswer || !draftReady}
                  className="h-11 shrink-0 rounded-xl bg-teal-300 px-4 text-sm font-black text-teal-950 transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/60 disabled:hover:scale-100"
                >
                  {iSubmitted ? (draftReady ? "Update" : <span className="flex items-center gap-1"><Check className="size-4" />Locked</span>) : "Lock in"}
                </button>
              </div>
              <p className="mt-2 px-1 text-[11px] text-white/55">
                {iSubmitted && locked
                  ? <>Locked in: <span className="font-bold text-teal-100">{locked}</span> · edit until time's up or everyone locks in</>
                  : "Match the most people. Exact words count — close calls can be merged."}
              </p>
            </form>
          )}

          {stage === "tension" && (
            <p
              className="uno-pop pointer-events-none absolute z-[7] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-black uppercase tracking-[0.3em] text-white/90 drop-shadow-[0_0_18px_rgb(94_234_212/.8)]"
              style={{ left: cx, top: board.top + board.height / 2, fontSize: compact ? 14 : 20 }}
            >
              <span className="animate-pulse">Did you sync?</span>
            </p>
          )}

          {/* Pile outlines (under the cards). */}
          {piled && groups.map((group) => {
            const rect = piles[group.id]
            if (!rect) return null
            const dragging = liveDrag?.id === group.id
            const dx = liveDrag && dragging && liveDrag.moved ? liveDrag.px - liveDrag.x0 : 0
            const dy = liveDrag && dragging && liveDrag.moved ? liveDrag.py - liveDrag.y0 : 0
            const scoring = lit && group.points > 0
            return (
              <div
                key={group.id}
                className={cn(
                  "pointer-events-none absolute left-0 top-0 rounded-2xl border",
                  !dragging && "transition-[transform,width,height,border-color,background-color] duration-[650ms] ease-out",
                  scoring ? "party-glow border-teal-200/70 bg-teal-300/10" : "border-white/10 bg-white/[.04]",
                  perfect && "border-amber-200/80 bg-amber-300/10",
                  lit && group.answers.length === 1 && "border-rose-300/25 bg-rose-500/[.06]",
                  livePicked.includes(group.id) && "border-teal-200 bg-teal-300/15",
                  dropTarget === group.id && "border-white bg-white/15",
                )}
                style={{
                  width: rect.w,
                  height: rect.h,
                  transform: `translate(${rect.x + dx}px, ${rect.y + dy}px)`,
                  zIndex: dragging ? 24 : 11,
                  ["--glow" as string]: perfect ? GOLD : ACCENT,
                  animationDelay: scoring ? `${lightDelay(group)}ms` : undefined,
                }}
              >
                <div className="flex items-center gap-1 px-1.5 pt-1" style={{ height: 22 * rect.k }}>
                  <span className="rounded-full bg-black/40 px-1.5 font-mono text-[10px] font-bold leading-4 text-white/80">×{group.answers.length}</span>
                  {group.merged.length > 0 && <span className="rounded-full bg-teal-300/20 px-1.5 text-[9px] font-bold uppercase leading-4 tracking-wide text-teal-100">merged</span>}
                  {scoring && (
                    <span className="uno-tag ml-auto rounded-full bg-teal-300 px-1.5 text-[10px] font-black leading-4 text-teal-950" style={{ animationDelay: `${lightDelay(group)}ms` }}>
                      +{group.points} each
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Answer cards: fly from their seat, flip, then slide into piles. */}
          {(stage === "flip" || piled) && answers.map((answer) => {
            const player = state.players[answer.playerId]
            const seat = ring.seats[answer.playerId]
            const group = piled ? groupOf(answer.playerId) : undefined
            const target: Spot | undefined = piled ? pileSpots[answer.playerId] : spread[answer.playerId]
            if (!target) return null
            const away = departed(answer.playerId)
            const from = seat ? { x: seat.x - card.w / 2, y: seat.y - card.h / 2 } : { x: cx - card.w / 2, y: cy }
            const at = away ? target : { ...from, k: 0.35, z: 0 }
            const dragging = Boolean(liveDrag?.moved && group && liveDrag.id === group.id)
            const dx = dragging ? liveDrag!.px - liveDrag!.x0 : 0
            const dy = dragging ? liveDrag!.py - liveDrag!.y0 : 0
            return (
              <div
                key={answer.playerId}
                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                style={{
                  transform: `translate(${at.x + dx}px, ${at.y + dy}px) scale(${at.k})`,
                  opacity: away ? 1 : 0,
                  zIndex: (dragging ? 30 : 15) + at.z,
                  transition: dragging ? "none" : `transform ${FLIGHT_MS}ms cubic-bezier(.3,.75,.2,1), opacity 200ms`,
                }}
              >
                <AnswerCard
                  card={card}
                  text={answer.text}
                  ownerId={answer.playerId}
                  ownerName={player?.name ?? "?"}
                  faceUp={faceUp(answer.playerId)}
                  tone={toneOf(group)}
                  mine={answer.playerId === playerId}
                />
              </div>
            )
          })}

          {/* "Nobody's with you" stamps on unmatched piles. */}
          {lit && !over && !perfect && groups.filter((group) => group.answers.length === 1).map((group) => {
            const rect = piles[group.id]
            if (!rect) return null
            return (
              <span
                key={`stamp:${group.id}`}
                className="party-stamp pointer-events-none absolute z-[28] whitespace-nowrap rounded-md border-2 border-rose-400 bg-rose-950/85 px-1.5 py-0.5 font-black uppercase tracking-wider text-rose-200 shadow-lg"
                style={{ left: rect.x + rect.w / 2, top: rect.y + rect.h * 0.62, fontSize: compact ? 8 : 10, animationDelay: `${stampDelay}ms` }}
              >
                Nobody's with you
              </span>
            )
          })}

          {/* Merge controls on top of the piles, host only. */}
          {canMerge && groups.map((group) => {
            const rect = piles[group.id]
            if (!rect) return null
            const togglePick = () => setPicked(livePicked.includes(group.id) ? livePicked.filter((id) => id !== group.id) : [...livePicked, group.id].slice(-2))
            return (
              <button
                key={`grab:${group.id}`}
                type="button"
                aria-label={`Pile “${groupLabel(group)}” (${group.answers.length})${livePicked.includes(group.id) ? ", selected" : ""}`}
                aria-pressed={livePicked.includes(group.id)}
                className="absolute left-0 top-0 z-[29] cursor-grab touch-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing"
                style={{ width: rect.w, height: rect.h, transform: `translate(${rect.x}px, ${rect.y}px)` }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  const point = toTable(event)
                  setDrag({ id: group.id, x0: point.x, y0: point.y, px: point.x, py: point.y, moved: false })
                }}
                onPointerMove={(event) => {
                  if (!drag || drag.id !== group.id) return
                  const point = toTable(event)
                  setDrag({ ...drag, px: point.x, py: point.y, moved: drag.moved || Math.hypot(point.x - drag.x0, point.y - drag.y0) > 8 })
                }}
                onPointerUp={() => {
                  if (!drag || drag.id !== group.id) return
                  if (drag.moved) {
                    const target = pileAt(drag.px, drag.py, drag.id)
                    if (target) merge(drag.id, target)
                  } else {
                    togglePick()
                  }
                  setDrag(null)
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  togglePick()
                }}
              />
            )
          })}

          {/* Everyone sees the merge land. */}
          {stage === "merge" && reveal?.merge && piles[reveal.merge.into] && (
            <span
              key={`flash:${reveal.merge.n}`}
              aria-hidden="true"
              className="party-glow pointer-events-none absolute left-0 top-0 z-[12] rounded-2xl transition-transform duration-[650ms] ease-out"
              style={{
                width: piles[reveal.merge.into]!.w,
                height: piles[reveal.merge.into]!.h,
                transform: `translate(${piles[reveal.merge.into]!.x}px, ${piles[reveal.merge.into]!.y}px)`,
                ["--glow" as string]: ACCENT,
              }}
            />
          )}
          {stage === "merge" && reveal?.merge && piles[reveal.merge.into] && (
            <span
              key={`merged:${reveal.merge.n}`}
              className="party-float pointer-events-none absolute z-[31] whitespace-nowrap rounded-full bg-teal-300 px-2 py-0.5 text-xs font-black text-teal-950 shadow-lg"
              style={{ left: piles[reveal.merge.into]!.x + piles[reveal.merge.into]!.w / 2, top: piles[reveal.merge.into]!.y }}
            >
              Merged!
            </span>
          )}

          {seatOrder.map((id) => {
            const player = state.players[id]
            const seat = ring.seats[id]
            if (!player || !seat) return null
            const group = groupOf(id)
            const submitted = state.submittedPlayerIds.includes(id)
            const chip = submitting || stage === "tension"
              ? submitted
                ? <SeatChip tone="done"><Check className="size-2.5" />Locked in</SeatChip>
                : <SeatChip tone="waiting">{submitting ? "Thinking…" : "No answer"}</SeatChip>
              : reveal && !submitted
                ? <SeatChip tone="waiting">No answer</SeatChip>
                : null
            const arrive = group && group.points > 0 ? lightDelay(group) + TOKEN_LEAD_MS + TOKEN_MS : null
            const synced = stage === "score" && arrive !== null && elapsed >= arrive
            return (
              <Seat
                key={id}
                x={seat.x}
                y={seat.y}
                size={avatar}
                width={seatW}
                id={id}
                name={player.name}
                isMe={id === playerId}
                isHost={id === state.hostId}
                connected={player.connected !== false}
                chip={chip}
                score={player.score}
                glow={synced || (stage === "done" && group && group.points > 0) ? (perfect ? GOLD : ACCENT) : null}
                bubble={reactions[id]}
                bubbleSide={seat.y < cy - ry * 0.3 ? "bottom" : "top"}
              >
                {stage === "score" && group && arrive !== null && (
                  <span
                    className="party-float pointer-events-none absolute bottom-full left-1/2 z-20 rounded-full bg-teal-300 px-2 py-0.5 text-sm font-black text-teal-950 shadow-lg"
                    style={{ animationDelay: `${arrive}ms` }}
                  >
                    +{group.points}
                  </span>
                )}
              </Seat>
            )
          })}

          {/* "+N" tokens flying from each lit pile to its members' seats. */}
          {stage === "score" && scoringGroups.flatMap((group) => {
            const rect = piles[group.id]
            if (!rect) return []
            const start = lightDelay(group) + TOKEN_LEAD_MS
            const flying = elapsed >= start && elapsed < start + TOKEN_MS
            return group.answers.map((answer) => {
              const seat = ring.seats[answer.playerId]
              if (!seat) return null
              const at = elapsed >= start ? { x: seat.x, y: seat.y - avatar / 2 } : { x: rect.x + rect.w / 2, y: rect.y + 12 }
              return (
                <span
                  key={`token:${answer.playerId}`}
                  className="pointer-events-none absolute left-0 top-0 z-[32] rounded-full bg-teal-300 px-1.5 text-xs font-black text-teal-950 shadow-[0_0_14px_rgb(94_234_212/.8)]"
                  style={{
                    transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`,
                    opacity: flying ? 1 : 0,
                    transition: `transform ${TOKEN_MS}ms cubic-bezier(.4,0,.2,1), opacity 180ms`,
                  }}
                >
                  +{group.points}
                </span>
              )
            })
          })}

          {stage === "score" && perfect && <PerfectSync cx={cx} y={board.top - 6} compact={compact} />}
        </>
      )}

      {/* Action dock. */}
      <div className="absolute bottom-3 z-[33] flex -translate-x-1/2 justify-center" style={{ left: box.w ? cx : "50%" }}>
        {submitting && iSubmitted && (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            <Check className="size-4 text-emerald-300" /> Locked in · waiting for {Math.max(0, players.length - state.submittedPlayerIds.length)} more
          </p>
        )}
        {stage === "tension" && (
          <p className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold")}>
            <Hourglass className="size-4 animate-pulse text-teal-200" /> Revealing…
          </p>
        )}
        {stage === "merge" && (isHost ? (
          <div className={cn(GLASS, "uno-rise flex items-center gap-2 p-1.5 pl-3")}>
            <p className="hidden max-w-[220px] text-xs leading-tight text-white/70 sm:block">
              {livePicked.length === 1 ? "Tap another pile to pair it" : "Drag a pile onto another, or tap two, to merge"}
            </p>
            <button
              type="button"
              disabled={!pickedPair || !connected}
              onClick={() => pickedPair && merge(pickedPair[1]!, pickedPair[0]!)}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-teal-300 px-3 text-sm font-black text-teal-950 transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/60 disabled:hover:scale-100"
            >
              <Combine className="size-4" /> Merge
            </button>
            <button
              type="button"
              onClick={props.onSkipMerge}
              disabled={!connected}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-white/10 px-3 text-sm font-bold transition hover:bg-white/20 disabled:opacity-50"
            >
              <SkipForward className="size-4" /> Score it
            </button>
          </div>
        ) : (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm text-white/75")}>
            <Combine className="size-4 text-teal-200" /> The host is merging close calls…
          </p>
        ))}
        {stage === "done" && (isHost ? (
          <button
            type="button"
            onClick={props.onNextRound}
            disabled={!connected}
            className="uno-rise h-12 whitespace-nowrap rounded-2xl bg-teal-300 px-6 text-sm font-black text-teal-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:opacity-50"
          >
            {state.roundNumber >= state.settings.rounds ? "Finish match" : "Next prompt"}
          </button>
        ) : (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center px-4 text-sm text-white/70")}>Waiting for the host…</p>
        ))}
        {over && resultsHidden && (
          <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
            <Trophy className="size-4 text-amber-300" /> Show results
          </button>
        )}
      </div>

      {scoresOpen && (
        <div className={cn(GLASS, "uno-rise absolute left-3 top-[68px] z-[34] w-[220px] p-2", !wide && "bg-[#05110f]/90")}>
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
        <SidePanel title="Round log" icon={<ScrollText className="size-4 text-teal-200" />} onClose={() => setLogOpen(false)}>
          {history.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-white/50">No prompts scored yet.</p>
          ) : (
            <ol className="space-y-3">
              {[...history].reverse().map((entry) => (
                <LogEntry key={entry.roundNumber} entry={entry} players={state.players} meId={playerId} />
              ))}
            </ol>
          )}
        </SidePanel>
      )}

      {over && !resultsHidden && (
        <GameOver
          state={state}
          rows={scoreRows}
          meId={playerId}
          isHost={isHost}
          onRestart={props.onRestart}
          onHide={() => setResultsHidden(true)}
          onLeave={props.onLeave}
        />
      )}
    </PartyTable>
  )
}

const CONFETTI = ["#5eead4", "#fcd34d", "#f0abfc", "#93c5fd", "#ffffff"]

/** Full-room match: a banner over the board and confetti over the table. */
function PerfectSync({ cx, y, compact }: { cx: number; y: number; compact: boolean }) {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[35] overflow-hidden">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="uno-confetti absolute top-0 block h-3 w-1.5 rounded-sm"
            style={{
              left: `${(i * 37) % 100}%`,
              background: CONFETTI[i % CONFETTI.length],
              ["--fall" as string]: `${2.4 + ((i * 13) % 20) / 10}s`,
              ["--delay" as string]: `${((i * 7) % 20) / 10}s`,
              ["--drift" as string]: `${((i * 17) % 80) - 40}px`,
              ["--spin" as string]: `${360 + ((i * 53) % 360)}deg`,
            }}
          />
        ))}
      </div>
      <p
        role="status"
        className="uno-pop pointer-events-none absolute z-[36] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-amber-200/60 bg-[#1a1404]/85 px-4 py-1.5 font-black uppercase tracking-[0.25em] text-amber-200 shadow-[0_0_40px_rgb(252_211_77/.45)]"
        style={{ left: cx, top: y, fontSize: compact ? 12 : 16 }}
      >
        <Sparkles className="size-4" /> Perfect sync <Sparkles className="size-4" />
      </p>
    </>
  )
}

function nameOf(players: Record<string, SyncUpPlayer>, id: string, meId: string) {
  return id === meId ? "You" : players[id]?.name ?? "Someone who left"
}

function LogEntry({ entry, players, meId }: { entry: RoundSummary; players: Record<string, SyncUpPlayer>; meId: string }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/[.04] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Round {entry.roundNumber}</p>
      <p className="mt-1 text-sm font-semibold leading-snug">“{entry.prompt.text}”</p>
      <ul className="mt-2 space-y-1.5 text-xs">
        {entry.groups.map((group) => {
          const [label, ...others] = groupSpellings(group)
          return (
            <li key={group.id} className="flex gap-2">
              <span className={cn("w-[96px] shrink-0 break-words font-bold", group.points ? "text-teal-200" : "text-white/60")}>
                {label}
                {others.length > 0 && <span className="block text-[10px] font-medium text-white/40">≈ {others.join(", ")}</span>}
              </span>
              <span className="min-w-0 flex-1 text-white/75">
                {group.answers.map((answer) => nameOf(players, answer.playerId, meId)).join(", ")}
                <span className={cn("ml-1.5 font-bold", group.points ? "text-emerald-300" : "text-rose-300")}>
                  {group.points ? `+${group.points}` : "nobody"}
                </span>
              </span>
            </li>
          )
        })}
        {entry.missingIds.length > 0 && (
          <li className="text-white/45">No answer: {entry.missingIds.map((id) => nameOf(players, id, meId)).join(", ")}</li>
        )}
      </ul>
    </li>
  )
}

function GameOver({ state, rows, meId, isHost, onRestart, onHide, onLeave }: {
  state: PublicSyncUpGameState
  rows: ScoreRow[]
  meId: string
  isHost: boolean
  onRestart: () => void
  onHide: () => void
  onLeave: () => void
}) {
  const ranked = [...rows].sort((left, right) => right.score - left.score)
  const top = ranked[0]?.score ?? 0
  const winners = ranked.filter((row) => row.score === top)
  const title = winners.some((row) => row.id === meId)
    ? winners.length > 1 ? "You share the crown!" : "You're the most in sync!"
    : winners.length > 1 ? `Tie: ${winners.map((row) => row.name).join(" & ")}` : `${winners[0]?.name ?? "Nobody"} reads minds best`
  const pair = soulmates(state.history)
  const wild = wildcard(state.history)

  return (
    <div className="uno-fade-in absolute inset-0 z-40 overflow-y-auto bg-[#030a0b]/80 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-amber-300" />
          <h2 className="mt-2 text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{state.history.length} prompts · {state.settings.promptPack} pack</p>
        </div>

        <Podium rows={rows} meId={meId} />

        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: "900ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-teal-300">
              <Heart className="size-3.5" /> Soulmates
            </p>
            {pair ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex -space-x-3">
                  <PartyAvatar id={pair.a} name={nameOf(state.players, pair.a, meId)} size={46} style={{ boxShadow: `0 0 0 3px ${ACCENT}` }} />
                  <PartyAvatar id={pair.b} name={nameOf(state.players, pair.b, meId)} size={46} style={{ boxShadow: `0 0 0 3px ${ACCENT}` }} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{nameOf(state.players, pair.a, meId)} & {nameOf(state.players, pair.b, meId)}</p>
                  <p className="text-xs text-white/65">Matched each other {pair.count} {pair.count === 1 ? "time" : "times"}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">Nobody ever matched. Impressive.</p>
            )}
          </div>
          <div className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: "1050ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-rose-300">
              <Shuffle className="size-3.5" /> Wildcard
            </p>
            {wild ? (
              <div className="mt-3 flex items-center gap-3">
                <PartyAvatar id={wild.id} name={nameOf(state.players, wild.id, meId)} size={48} style={{ boxShadow: "0 0 0 3px #fb7185" }} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{nameOf(state.players, wild.id, meId)}</p>
                  <p className="text-xs text-white/65">Alone on {wild.count} {wild.count === 1 ? "answer" : "answers"}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">Everyone always had company.</p>
            )}
          </div>
        </div>

        {ranked.length > 3 && (
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
          {isHost ? (
            <button type="button" onClick={onRestart} className="flex h-11 items-center gap-2 rounded-2xl bg-teal-300 px-5 text-sm font-black text-teal-950 transition hover:scale-[1.03]">
              <RotateCcw className="size-4" /> Play again
            </button>
          ) : (
            <p className="text-sm text-white/60">Waiting for the host to start a rematch…</p>
          )}
          <button type="button" onClick={onHide} className={cn(GLASS, "h-11 px-4 text-sm font-semibold hover:bg-black/65")}>View table</button>
          <button type="button" onClick={onLeave} className={cn(GLASS, "flex h-11 items-center gap-1.5 px-4 text-sm font-semibold hover:bg-black/65")}>
            <LogOut className="size-4" /> Leave
          </button>
        </div>
      </div>
    </div>
  )
}