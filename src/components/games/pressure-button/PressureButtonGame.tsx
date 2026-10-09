import { Check, Crown, Flame, Hourglass, LogOut, Megaphone, RotateCcw, ScrollText, Send, ThumbsDown, ThumbsUp, Trophy, X, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import type { Reaction } from "@/lib/reactions"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { GLASS, GlassButton, PartyTable, SidePanel, TableTopBar, TimerRing, useBeat, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar, Seat, SeatChip, ringLayout, viewerFirst } from "../party-shell/SeatRing"
import { PromptCard } from "../party-shell/PromptStage"
import { Podium, Scoreboard, type ScoreRow } from "../party-shell/Scoreboard"
import {
  AnswerCard, BigCountdown, ButtonCluster, DANGER, HOT, HandoffSweep, HotPotato, PassPips, ResultStamp, TargetHalo, Thumb, TurnLogEntry,
  clutchPlayer, pressureKing,
} from "./parts"
import {
  PACE_MS, PASSES_PER_GAME, tallyDuration,
  type PressureButtonPlayer, type PublicPressureButtonGameState,
} from "../../../../party/pressure-button"

export interface PressureButtonGameProps {
  state: PublicPressureButtonGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onAnswer: () => void
  onPass: () => void
  onPressure: (targetId: string) => void
  onSubmit: (answer: string, spoken: boolean) => void
  onVote: (accept: boolean) => void
  onRestart: () => void
  onLeave: () => void
}

const TABLE_BG = "radial-gradient(ellipse at 50% 40%, #4a1410 0%, #2a0b08 48%, #0b0302 100%)"
/** Flip beat: the card pops in face down, then turns over. */
const FLIP_AT = 300
/** Result beat: the stamp lands, then "+N" flies from the card to each seat. */
const TOKEN_LEAD_MS = 450
const TOKEN_MS = 650
/** Handoff beat: the spotlight leaves for the next seat once the sweep is under way. */
const SPOT_MOVE_AT = 350

const OUTCOME_LINE = {
  accepted: "Accepted!",
  rejected: "Rejected!",
  "timed-out": "Out of time!",
  passed: "Passed",
} as const

export function PressureButtonGame(props: PressureButtonGameProps) {
  const { state, playerId, isHost, connected, reactions } = props
  const me = state.players[playerId] as PressureButtonPlayer | undefined
  const decision = state.status === "decision"
  const answering = state.status === "answering"
  const over = state.status === "finished"
  const reveal = state.status === "reveal" ? state.reveal : null
  const stage = reveal?.stage ?? null
  const turnKey = `${state.startedAt}:${state.turnNumber}`
  const activeId = state.activePlayerId
  const responderId = state.responderId
  const pressurerId = state.mode === "pressure" ? state.pressuredByPlayerId : null
  const pressured = Boolean(pressurerId)
  const isActive = activeId === playerId
  const isResponder = responderId === playerId

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const [scoresPref, setScoresPref] = useState<boolean | null>(null)
  const scoresOpen = scoresPref ?? wide
  const [logOpen, setLogOpen] = useState(false)
  const [logSeen, setLogSeen] = useState(0)
  const [resultsHidden, setResultsHidden] = useState(false)

  // ─── Decision: pick the action first; pressure then lights up the seats ──
  const [targetingState, setTargetingState] = useState({ key: "", on: false })
  const targeting = decision && isActive && connected && targetingState.key === turnKey && targetingState.on
  const setTargeting = (on: boolean) => setTargetingState({ key: turnKey, on })

  // ─── Answering: the potato flies, then the clock runs ───────────────────
  const limit = state.settings.answerTimeLimit
  const now = useNow(answering)
  const flightElapsed = useBeat(answering && pressured ? `fly:${turnKey}` : null, PACE_MS.potato, 60)
  const clockStarted = state.turnStartedAt !== null && now >= state.turnStartedAt
  const potatoAtSource = answering && pressured && flightElapsed < 60 && !clockStarted
  const landed = !answering || !pressured || clockStarted || flightElapsed >= PACE_MS.potato - 100
  const secondsLeft = answering && state.turnStartedAt
    ? Math.max(0, Math.min(limit, Math.ceil((state.turnStartedAt + limit * 1000 - now) / 1000)))
    : null

  const [draftState, setDraftState] = useState({ key: "", text: "" })
  const draft = draftState.key === turnKey ? draftState.text : ""
  const canAnswer = answering && isResponder && connected
  const submit = (spoken: boolean) => {
    if (!canAnswer) return
    if (!spoken && draft.trim().length < 2) return
    props.onSubmit(draft.trim(), spoken)
  }

  // ─── Reveal beat, replayed locally from the server's pacing ─────────────
  const voterIds = state.voterIds
  const beatLen = stage === "flip" ? PACE_MS.flip
    : stage === "verdict" ? PACE_MS.verdict
    : stage === "tally" ? tallyDuration(voterIds.length)
    : stage === "result" ? PACE_MS.result
    : stage === "handoff" ? PACE_MS.handoff
    : 0
  const elapsed = useBeat(reveal ? `${reveal.seq}` : null, beatLen, stage === "tally" || stage === "result" ? 90 : stage === "verdict" ? 250 : stage === "handoff" || stage === "flip" ? 100 : 0)
  const faceUp = stage !== "flip" || elapsed >= FLIP_AT
  const verdictLeft = stage === "verdict" ? Math.max(0, Math.ceil((PACE_MS.verdict - elapsed) / 1000)) : null
  const tallied = stage === "tally" || stage === "result" || stage === "handoff"
  const thumbUp = (i: number) => stage !== "tally" || elapsed >= PACE_MS.tallyLead + i * PACE_MS.tallyStep
  const shownThumbs = tallied ? voterIds : voterIds.filter((id) => state.votedIds.includes(id))
  const flipped = tallied ? voterIds.filter((_, i) => thumbUp(i)) : []
  const acceptCount = flipped.filter((id) => state.votes[id] !== false).length
  const rejectCount = flipped.length - acceptCount
  const iVote = stage === "verdict" && voterIds.includes(playerId) && connected
  const iVoted = state.votedIds.includes(playerId)
  const [myVote, setMyVote] = useState<{ seq: number; accept: boolean } | null>(null)
  const myVoteNow = myVote && reveal && myVote.seq === reveal.seq ? myVote.accept : null
  const vote = (accept: boolean) => {
    if (!iVote || iVoted || !reveal) return
    setMyVote({ seq: reveal.seq, accept })
    props.onVote(accept)
  }
  const recipients = stage === "result" ? Object.entries(state.scoreChanges) : []
  const nextId = stage === "handoff" ? reveal?.nextPlayerId ?? null : null

  useSoundCue(decision ? `d:${turnKey}` : null, () => playSound("deal"))
  useSoundCue(answering ? `a:${turnKey}` : null, () => playSound(pressured ? "whoosh" : "lockin"))
  useSoundCue(answering && landed && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5 ? `t:${turnKey}:${secondsLeft}` : null, () => playSound("tick"))
  useSoundCue(stage === "verdict" && state.votedIds.length ? `v:${reveal?.seq}:${state.votedIds.length}` : null, () => playSound("thunk"))
  useSoundCue(reveal ? `s:${reveal.seq}` : over ? `over:${state.finishedAt}` : null, () => {
    if (over) return playSound("win")
    if (stage === "flip") playSound("flip", FLIP_AT)
    else if (stage === "tally") {
      playSound("thunk")
      voterIds.forEach((_, i) => playSound("flip", PACE_MS.tallyLead + i * PACE_MS.tallyStep))
    } else if (stage === "result") {
      const outcome = state.outcome
      playSound(outcome === "accepted" ? "accepted" : outcome === "rejected" ? "rejected" : outcome === "timed-out" ? "buzzer" : "knock")
    } else if (stage === "handoff") playSound("whoosh")
  })

  // ─── Table geometry ──────────────────────────────────────────────────────
  const players = useMemo(() => {
    const seated = state.playerOrder.filter((id) => state.players[id])
    const rest = Object.values(state.players).filter((player) => !seated.includes(player.id)).sort((left, right) => left.joinedAt - right.joinedAt).map((player) => player.id)
    return [...seated, ...rest].map((id) => state.players[id]!)
  }, [state.players, state.playerOrder])
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
  const promptW = Math.min(promptSmall ? 560 : 620, compact ? Math.max(220, innerW + 24) : (promptSmall ? 1.3 : 1.5) * rx - seatW)
  const promptHalf = promptSmall ? 50 : 70
  const promptY = cy - ry * (compact ? 0.56 : promptSmall ? 0.64 : 0.58)
  const halfW = Math.max(110, compact ? rx - seatW / 2 : Math.min(400, rx * 0.74 - seatW / 2))
  const stageTop = promptY + promptHalf + 12
  const stageBottom = cy + ry * (compact ? 0.78 : 0.72) - avatar / 2 - 18
  const stageY = (stageTop + Math.max(stageTop + 80, stageBottom)) / 2
  const cardW = Math.min(400, Math.max(240, 2 * halfW))
  const cardH = compact ? 104 : 132
  const thumbSize = compact ? 26 : 32
  const angleOf = (id: string) => Math.PI / 2 + (seatOrder.indexOf(id) * 2 * Math.PI) / Math.max(1, seatOrder.length)
  const potatoSize = compact ? 26 : 34
  const potatoAt = (id: string | null) => {
    const seat = id ? ring.seats[id] : undefined
    return seat ? { x: seat.x + avatar * 0.55, y: seat.y - avatar * 0.55 } : { x: cx, y: cy }
  }

  const spotId = stage === "handoff"
    ? (elapsed >= SPOT_MOVE_AT && nextId ? nextId : activeId)
    : decision ? activeId
    : answering || stage ? (responderId ?? activeId)
    : null
  const spotSeat = spotId ? ring.seats[spotId] : undefined

  // ─── Scores and history ──────────────────────────────────────────────────
  const history = state.history
  const lastEntry = stage === "handoff" ? history[history.length - 1] : undefined
  const scoreRows: ScoreRow[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    gained: lastEntry?.turnNumber === state.turnNumber ? lastEntry.scoreChanges[player.id] || undefined : undefined,
  }))
  const logBadge = !logOpen && history.length > logSeen

  const nameOf = (id: string | null) => (!id ? "Someone" : id === playerId ? "You" : state.players[id]?.name ?? "Someone")
  const subline = decision
    ? isActive ? (targeting ? "Pick who to pressure" : "You have the button") : `${nameOf(activeId)} has the button`
    : answering
      ? pressured ? `${nameOf(pressurerId)} pressured ${nameOf(responderId)}` : `${nameOf(responderId)} ${isResponder ? "are" : "is"} on the clock`
      : stage === "flip" ? "The answer's in"
      : stage === "verdict" ? `Room verdict · ${state.votedIds.length} / ${voterIds.length} voted`
      : stage === "tally" ? "Counting thumbs"
      : stage === "result" && state.outcome ? OUTCOME_LINE[state.outcome]
      : stage === "handoff" ? (nextId ? `Next up: ${nameOf(nextId)}` : "That was the last turn")
      : over ? `${history.length} turns played` : ""

  const status = (
    <>
      <Zap className="size-4 shrink-0 text-orange-300" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{over ? "Final scores" : <><span className="max-sm:hidden">Turn </span>{state.turnNumber} / {state.settings.turns}</>}</p>
        <p className="truncate text-[11px] text-white/60">{subline}</p>
      </div>
      {secondsLeft !== null && landed && <TimerRing left={secondsLeft} limit={limit} />}
      {verdictLeft !== null && <TimerRing left={verdictLeft} limit={PACE_MS.verdict / 1000} />}
    </>
  )

  const showCard = stage === "flip" || stage === "verdict" || stage === "tally" || stage === "result"
  const responderName = state.players[responderId ?? activeId ?? ""]?.name ?? "Someone"

  return (
    <PartyTable tableRef={tableRef} background={TABLE_BG} className="min-h-[640px]">
      {/* Stage light. */}
      <div aria-hidden="true" className="pointer-events-none absolute rounded-[50%] bg-orange-400/[.07] blur-2xl" style={{ left: cx - rx * 0.9, top: cy - ry * 0.75, width: rx * 1.8, height: ry * 1.5 }} />

      <TableTopBar
        title="Pressure Button"
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
          {/* Spotlight on the hot seat; it glides to the next seat on the handoff. */}
          {spotSeat && !over && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top] duration-[900ms] ease-in-out"
              style={{
                left: spotSeat.x,
                top: spotSeat.y,
                width: avatar * 4.2,
                height: avatar * 4.2,
                background: `radial-gradient(circle, ${answering && pressured ? DANGER : HOT}55 0%, ${HOT}22 38%, transparent 70%)`,
              }}
            />
          )}

          {state.prompt && (
            <PromptCard
              dealKey={turnKey}
              eyebrow={`Turn ${state.turnNumber} · ${activeId === playerId ? "your" : `${nameOf(activeId)}'s`} prompt`}
              tag={state.prompt.pack}
              text={state.prompt.text}
              compact={promptSmall}
              className="transition-[top,width] duration-500"
              style={{ left: cx, top: promptY, width: promptW }}
            />
          )}

          {/* Decision: the button cluster, live for the hot seat and dimmed for everyone else. */}
          {decision && (
            <div key={`cluster:${turnKey}`} className="uno-pop absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: stageY }}>
              {!isActive && (
                <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-orange-200/80">
                  <span className="animate-pulse">{nameOf(activeId)} is deciding…</span>
                </p>
              )}
              <ButtonCluster
                compact={compact}
                passesLeft={state.players[activeId ?? ""]?.passesLeft ?? 0}
                targeting={targeting}
                watching={!isActive || !connected}
                onAnswer={props.onAnswer}
                onPass={props.onPass}
                onPressure={() => setTargeting(true)}
                onCancel={() => setTargeting(false)}
              />
            </div>
          )}

          {/* Answering: the responder types or says it out loud; the room watches the clock. */}
          {answering && isResponder && (
            <form
              key={`form:${turnKey}`}
              className="uno-pop absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-orange-300/30 bg-[#1c0805]/85 p-3 shadow-[0_24px_60px_rgb(0_0_0/.55)] backdrop-blur-md"
              style={{ left: cx, top: stageY, width: Math.min(440, Math.max(260, 2 * halfW)) }}
              onSubmit={(event) => {
                event.preventDefault()
                submit(false)
              }}
            >
              <div className="flex items-center gap-2 px-1">
                <p className="flex-1 text-[10px] font-black uppercase tracking-[0.24em] text-orange-200/80">
                  {pressured ? <>{nameOf(pressurerId)} put you on the spot</> : "You're on the clock"}
                </p>
                {secondsLeft !== null && landed && <TimerRing left={secondsLeft} limit={limit} />}
              </div>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={!canAnswer}
                className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-orange-600 text-base font-black uppercase tracking-wide text-white shadow-[0_6px_0_#7c2d12,0_14px_30px_rgb(0_0_0/.5)] transition active:translate-y-1 active:shadow-[0_2px_0_#7c2d12] disabled:opacity-50"
              >
                <Megaphone className="size-5" /> Said it out loud
              </button>
              <div className="mt-2 flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraftState({ key: turnKey, text: event.target.value.slice(0, 120) })}
                  placeholder="…or type it (optional)"
                  maxLength={120}
                  autoComplete="off"
                  disabled={!canAnswer}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/95 px-3 text-base font-bold text-[#1c0805] outline-none placeholder:font-medium placeholder:text-black/35 focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!canAnswer || draft.trim().length < 2}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-sm font-black transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="size-4" /> Lock
                </button>
              </div>
              <p className="mt-2 px-1 text-[11px] text-white/55">Say it to the room, then tap — the others vote on whether it counts.</p>
            </form>
          )}
          {answering && !isResponder && (
            <div key={`clock:${turnKey}`} className="uno-pop absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center" style={{ left: cx, top: stageY }}>
              <p className="flex items-center gap-1.5 whitespace-nowrap text-xs font-black uppercase tracking-[0.2em] text-orange-200/85">
                {pressured && <Flame className="size-3.5" />}
                {pressured ? `${nameOf(pressurerId)} → ${nameOf(responderId)}` : `${nameOf(responderId)} is answering`}
              </p>
              <BigCountdown left={landed && secondsLeft !== null ? secondsLeft : limit} limit={limit} size={compact ? 84 : 124} />
              <p className="text-[11px] text-white/55">{pressured ? `Answered: they +3 · fails: ${nameOf(pressurerId)} +2` : "Answer out loud — the room judges it"}</p>
            </div>
          )}

          {/* The answer card, the judges' thumbs and the result stamp. */}
          {showCard && (
            <div className="absolute z-[14] -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: stageY }}>
              <div key={`card:${turnKey}`} className="uno-pop">
                <AnswerCard
                  width={cardW}
                  height={cardH}
                  faceUp={faceUp}
                  text={state.answer?.text ?? null}
                  spoken={state.answer?.spoken ?? false}
                  ownerId={responderId ?? activeId ?? ""}
                  ownerName={responderName}
                  title={(responderId ?? activeId) === playerId ? "Your answer" : `${responderName}'s answer`}
                  missing={!state.answer ? (state.outcome === "passed" ? "Passed" : "Out of time") : undefined}
                />
              </div>
              {shownThumbs.length > 0 && (
                <div className="absolute inset-x-0 flex justify-center gap-1.5" style={{ top: cardH - thumbSize / 2 }}>
                  {shownThumbs.map((id) => (
                    <div key={id} className="uno-pop">
                      <Thumb
                        voterId={id}
                        voterName={nameOf(id)}
                        faceUp={tallied && thumbUp(voterIds.indexOf(id))}
                        accept={state.votes[id] !== false}
                        auto={tallied && !(id in state.votes)}
                        size={thumbSize}
                      />
                    </div>
                  ))}
                </div>
              )}
              {tallied && flipped.length > 0 && stage !== "result" && (
                <p className="absolute inset-x-0 flex justify-center gap-3 text-sm font-black" style={{ top: cardH + thumbSize / 2 + 8 }}>
                  <span className="flex items-center gap-1 text-emerald-300"><ThumbsUp className="size-4" />{acceptCount}</span>
                  <span className="flex items-center gap-1 text-rose-300"><ThumbsDown className="size-4" />{rejectCount}</span>
                </p>
              )}
            </div>
          )}
          {stage === "result" && state.outcome && <ResultStamp key={`stamp:${turnKey}`} outcome={state.outcome} x={cx} y={stageY} compact={compact} />}

          {/* Handoff: who's up next. */}
          {stage === "handoff" && (
            <div key={`next:${turnKey}`} className="uno-pop pointer-events-none absolute z-[14] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center" style={{ left: cx, top: stageY }}>
              {nextId ? (
                <>
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-orange-200/80">Next up</p>
                  <div className="flex items-center gap-2 rounded-full bg-black/50 py-1 pl-1 pr-4 shadow-[0_0_30px_rgb(249_115_22/.35)]">
                    <PartyAvatar id={nextId} name={nameOf(nextId)} size={compact ? 30 : 38} />
                    <span className="text-lg font-black">{nextId === playerId ? "You!" : nameOf(nextId)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm font-black uppercase tracking-[0.3em] text-orange-200">Final scores…</p>
              )}
            </div>
          )}
          {stage === "handoff" && nextId && activeId && nextId !== activeId && ring.seats[activeId] && ring.seats[nextId] && (
            <HandoffSweep key={`sweep:${turnKey}`} cx={cx} cy={cy} rx={rx} ry={ry} from={angleOf(activeId)} to={angleOf(nextId)} />
          )}

          {seatOrder.map((id) => {
            const player = state.players[id]
            const seat = ring.seats[id]
            if (!player || !seat) return null
            const onSpot = id === spotId && !over
            const inDanger = answering && pressured && id === responderId && landed
            const voter = stage === "verdict" && voterIds.includes(id)
            const chip = decision && id === activeId
              ? <SeatChip tone="alert"><Zap className="size-2.5" />Hot seat</SeatChip>
              : answering && id === responderId
                ? <SeatChip tone="alert"><Hourglass className="size-2.5" />On the clock</SeatChip>
                : answering && id === pressurerId
                  ? <SeatChip tone="waiting"><Flame className="size-2.5" />Threw it</SeatChip>
                  : voter
                    ? state.votedIds.includes(id)
                      ? <SeatChip tone="done"><Check className="size-2.5" />Voted</SeatChip>
                      : <SeatChip tone="waiting">Judging…</SeatChip>
                    : null
            const delta = state.scoreChanges[id]
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
                glow={inDanger ? DANGER : onSpot ? HOT : null}
                bubble={reactions[id]}
                bubbleSide={seat.y < cy - ry * 0.3 ? "bottom" : "top"}
              >
                {inDanger && (
                  <>
                    <span aria-hidden="true" className="pointer-events-none absolute -inset-2 animate-ping rounded-full border-[3px] border-red-500/80" />
                    <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-red-400 shadow-[0_0_24px_rgb(239_68_68/.8)]" />
                    {secondsLeft !== null && <span className="absolute -right-6 -top-3 z-10 scale-90 rounded-full bg-black/70"><TimerRing left={secondsLeft} limit={limit} /></span>}
                  </>
                )}
                {!over && state.status !== "waiting" && <PassPips left={player.passesLeft} total={PASSES_PER_GAME} />}
                {stage === "result" && delta !== undefined && (
                  <span
                    className={cn("party-float pointer-events-none absolute bottom-full left-1/2 z-20 rounded-full px-2 py-0.5 text-sm font-black shadow-lg", delta > 0 ? "bg-emerald-400 text-emerald-950" : "bg-rose-500 text-white")}
                    style={{ animationDelay: `${TOKEN_LEAD_MS + TOKEN_MS}ms` }}
                  >
                    {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                  </span>
                )}
              </Seat>
            )
          })}

          {/* Pressure targets: every other seat lights up once PRESSURE is armed. */}
          {targeting && seatOrder.filter((id) => id !== playerId && state.players[id]?.connected !== false).map((id) => {
            const seat = ring.seats[id]
            if (!seat) return null
            return (
              <TargetHalo
                key={`target:${id}`}
                x={seat.x}
                y={seat.y}
                size={avatar}
                name={state.players[id]!.name}
                onPick={() => {
                  setTargeting(false)
                  props.onPressure(id)
                }}
              />
            )
          })}

          {/* The hot potato: flies from the pressurer to the target and burns there until the result. */}
          {pressured && (answering || (stage && stage !== "handoff")) && (() => {
            const at = potatoAtSource ? potatoAt(pressurerId) : potatoAt(responderId)
            return (
              <span
                className="pointer-events-none absolute left-0 top-0 z-[27]"
                style={{
                  transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${potatoAtSource ? 0.6 : 1})`,
                  transition: `transform ${PACE_MS.potato - 100}ms cubic-bezier(.35,.1,.25,1)`,
                }}
              >
                <HotPotato size={potatoSize} resting={landed} />
              </span>
            )
          })()}

          {/* "+N / −N" flying from the card to the seats it goes to. */}
          {recipients.map(([id, delta]) => {
            const seat = ring.seats[id]
            if (!seat) return null
            const flying = elapsed >= TOKEN_LEAD_MS && elapsed < TOKEN_LEAD_MS + TOKEN_MS
            const at = elapsed >= TOKEN_LEAD_MS ? { x: seat.x, y: seat.y - avatar / 2 } : { x: cx, y: stageY }
            return (
              <span
                key={`token:${id}`}
                className={cn("pointer-events-none absolute left-0 top-0 z-[32] rounded-full px-1.5 text-xs font-black shadow-lg", delta > 0 ? "bg-emerald-400 text-emerald-950 shadow-[0_0_14px_rgb(52_211_153/.8)]" : "bg-rose-500 text-white shadow-[0_0_14px_rgb(244_63_94/.8)]")}
                style={{
                  transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`,
                  opacity: flying ? 1 : 0,
                  transition: `transform ${TOKEN_MS}ms cubic-bezier(.4,0,.2,1), opacity 160ms`,
                }}
              >
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </span>
            )
          })}
        </>
      )}

      {/* Action dock. */}
      <div className="absolute bottom-3 z-[33] flex -translate-x-1/2 justify-center" style={{ left: box.w ? cx : "50%" }}>
        {targeting && (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            <Flame className="size-4 text-orange-300" /> Tap a glowing seat to pressure them
          </p>
        )}
        {stage === "verdict" && (iVote && !iVoted ? (
          <div className={cn(GLASS, "uno-rise flex items-center gap-2 p-1.5")}>
            <p className="hidden px-2 text-xs font-semibold text-white/70 sm:block">Does it count?</p>
            <button type="button" onClick={() => vote(true)} className="flex h-12 items-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-black text-emerald-950 shadow-[0_4px_0_#065f46] transition hover:brightness-110 active:translate-y-1 active:shadow-none">
              <ThumbsUp className="size-5" /> Accept
            </button>
            <button type="button" onClick={() => vote(false)} className="flex h-12 items-center gap-2 rounded-xl bg-rose-500 px-5 text-sm font-black text-white shadow-[0_4px_0_#881337] transition hover:brightness-110 active:translate-y-1 active:shadow-none">
              <ThumbsDown className="size-5" /> Reject
            </button>
          </div>
        ) : (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            {iVoted ? (
              <>
                {myVoteNow === false ? <ThumbsDown className="size-4 text-rose-300" /> : myVoteNow === true ? <ThumbsUp className="size-4 text-emerald-300" /> : <Check className="size-4 text-emerald-300" />}
                Voted · waiting for {Math.max(0, voterIds.length - state.votedIds.length)} more
              </>
            ) : (
              <>
                <Hourglass className="size-4 animate-pulse text-orange-200" />
                {isResponder ? "The room is judging your answer…" : "The room is judging…"}
              </>
            )}
          </p>
        ))}
        {over && resultsHidden && (
          <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
            <Trophy className="size-4 text-amber-300" /> Show results
          </button>
        )}
      </div>

      {scoresOpen && (
        <div className={cn(GLASS, "uno-rise absolute left-3 top-[68px] z-[34] w-[220px] p-2", !wide && "bg-[#140504]/90")}>
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
        <SidePanel title="Turn log" icon={<ScrollText className="size-4 text-orange-300" />} onClose={() => setLogOpen(false)}>
          {history.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-white/50">No turns played yet.</p>
          ) : (
            <ol className="space-y-3">
              {[...history].reverse().map((entry) => (
                <TurnLogEntry key={entry.turnNumber} entry={entry} players={state.players} meId={playerId} />
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

function GameOver({ state, rows, meId, isHost, onRestart, onHide, onLeave }: {
  state: PublicPressureButtonGameState
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
    ? winners.length > 1 ? "You share the crown!" : "You handled the pressure!"
    : winners.length > 1 ? `Tie: ${winners.map((row) => row.name).join(" & ")}` : `${winners[0]?.name ?? "Nobody"} wins under pressure`
  const king = pressureKing(state.history)
  const clutch = clutchPlayer(state.history)
  const nameOf = (id: string) => (id === meId ? "You" : state.players[id]?.name ?? "Someone who left")

  return (
    <div className="uno-fade-in absolute inset-0 z-40 overflow-y-auto bg-[#0b0302]/80 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-amber-300" />
          <h2 className="mt-2 text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{state.history.length} turns · {state.settings.promptPack} pack</p>
        </div>

        <Podium rows={rows} meId={meId} />

        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: "900ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
              <Crown className="size-3.5" /> Pressure king
            </p>
            {king ? (
              <div className="mt-3 flex items-center gap-3">
                <PartyAvatar id={king.id} name={nameOf(king.id)} size={48} style={{ boxShadow: `0 0 0 3px ${HOT}` }} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{nameOf(king.id)}</p>
                  <p className="text-xs text-white/65">{king.count} pressure {king.count === 1 ? "play" : "plays"} that paid off</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">Every pressure play backfired.</p>
            )}
          </div>
          <div className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: "1050ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">
              <Flame className="size-3.5" /> Ice in the veins
            </p>
            {clutch ? (
              <div className="mt-3 flex items-center gap-3">
                <PartyAvatar id={clutch.id} name={nameOf(clutch.id)} size={48} style={{ boxShadow: "0 0 0 3px #34d399" }} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{nameOf(clutch.id)}</p>
                  <p className="text-xs text-white/65">Survived pressure {clutch.count} {clutch.count === 1 ? "time" : "times"}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">Nobody survived being pressured.</p>
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
            <button type="button" onClick={onRestart} className="flex h-11 items-center gap-2 rounded-2xl bg-orange-500 px-5 text-sm font-black text-white transition hover:scale-[1.03]">
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
