import { Calculator, Check, Lock, LogOut, RotateCcw, Send, Timer, Trophy, X, Zap } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Reaction } from "@/lib/reactions"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import { QUICK_MATH_LEVELS, QUICK_MATH_POINTS, quickMathFill, splitQuickMath } from "@/lib/quickMath"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { GLASS, GlassButton, PartyTable, TableTopBar, TimerRing, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar, Seat, SeatChip, ringLayout, viewerFirst } from "../party-shell/SeatRing"
import { PromptCard } from "../party-shell/PromptStage"
import { Podium, Scoreboard, type ScoreRow } from "../party-shell/Scoreboard"
import type { PublicQuickMathPlayer, PublicQuickMathRound, PublicQuickMathState } from "../../../../party/quick-math"

export interface QuickMathGameProps {
  state: PublicQuickMathState
  phaseEndsAt: number | null
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onAnswer: (value: string) => boolean
  onRestart: () => void
  onLeave: () => void
}

const TABLE_BG = "radial-gradient(ellipse at 50% 42%, #173322 0%, #0c1b12 52%, #050a07 100%)"

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export function QuickMathGame(props: QuickMathGameProps) {
  const { state, playerId, isHost, connected, reactions } = props
  const me = state.players[playerId] as PublicQuickMathPlayer | undefined
  const round = state.round
  const over = state.status === "finished"
  const question = state.status === "playing" && state.phase === "question"
  const reveal = state.status === "playing" && state.phase === "reveal"
  const countdown = state.status === "playing" && state.phase === "countdown"
  const answered = Boolean(round?.answeredIds.includes(playerId))
  const canAnswer = question && Boolean(me) && !answered && connected
  const options = round?.options ?? null

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const [scoresPref, setScoresPref] = useState<boolean | null>(null)
  const scoresOpen = scoresPref ?? wide
  const [resultsHidden, setResultsHidden] = useState(false)

  const now = useNow(state.status === "playing", 200)
  const msLeft = props.phaseEndsAt === null ? 0 : Math.max(0, props.phaseEndsAt - now)
  const secondsLeft = Math.ceil(msLeft / 1000)

  // The typed answer belongs to one question.
  const roundKey = `${state.startedAt}:${round?.number ?? 0}`
  const [draft, setDraft] = useState({ key: "", value: "" })
  const value = draft.key === roundKey ? draft.value : ""
  // What this player locked in, shown in the dock until the reveal.
  const [sent, setSent] = useState({ key: "", value: "" })
  const lockedIn = sent.key === roundKey ? sent.value : ""
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (canAnswer && !options) inputRef.current?.focus()
  }, [canAnswer, options, roundKey])

  const mine = reveal ? round?.answers?.[playerId] : undefined
  useSoundCue(question ? roundKey : null, () => playSound("deal"))
  useSoundCue(answered && question ? `${roundKey}:lock` : null, () => playSound("lockin"))
  useSoundCue(reveal ? `${roundKey}:reveal` : null, () => {
    if (mine?.correct) playSound("correct")
    else if (mine) playSound("wrong")
    else playSound("buzzer")
  })
  useSoundCue(over ? `over:${state.finishedAt}` : null, () => playSound("win"))

  // ─── Table geometry ──────────────────────────────────────────────────────
  const players = useMemo(() => Object.values(state.players).sort((left, right) => left.joinedAt - right.joinedAt), [state.players])
  const seatOrder = useMemo(() => viewerFirst(players.map((player) => player.id), playerId), [players, playerId])
  const ring = ringLayout(seatOrder, box.w, box.h, { top: 64, bottomReserve: 84, insetLeft: wide && scoresOpen ? 236 : 0 })
  const { compact, avatar, seatW, cx, cy, rx } = ring
  const promptW = Math.min(520, Math.max(220, 1.5 * rx - seatW))
  const correct = reveal && round?.answers
    ? Object.entries(round.answers).filter(([, answer]) => answer.correct).sort(([, left], [, right]) => left.ms - right.ms)
    : []
  const fastest = correct[0] ? state.players[correct[0][0]] : undefined

  const scoreRows: ScoreRow[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    gained: (reveal && round?.answers?.[player.id]?.points) || undefined,
  }))

  const send = (answer: string, shown: string) => {
    if (!canAnswer) return
    if (props.onAnswer(answer)) {
      setDraft({ key: roundKey, value: "" })
      setSent({ key: roundKey, value: shown })
    }
  }
  const submit = () => {
    if (value.trim()) send(value.trim(), value.trim())
  }

  // Keys 1-4 pick an option.
  useEffect(() => {
    if (!canAnswer || !options) return
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1
      if (Number.isInteger(index) && index >= 0 && index < options.length) send(String(index), options[index]!)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const status = (
    <>
      <Calculator className="size-4 shrink-0 text-lime-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">
          {over ? "Final scores" : round ? <><span className="max-sm:hidden">Question </span>{round.number} / {state.settings.rounds}</> : "Get ready"}
        </p>
        <p className="truncate text-[11px] text-white/60">
          {round && !over ? `${QUICK_MATH_LEVELS[round.level]}${round.double ? " · Double points" : ""}` : over ? `${state.history.length} questions` : `Fastest right answers score ${QUICK_MATH_POINTS.join(" · ")}`}
        </p>
      </div>
      {question && <TimerRing left={secondsLeft} limit={state.settings.questionTime} />}
    </>
  )

  return (
    <PartyTable tableRef={tableRef} background={TABLE_BG} className="min-h-[560px]">
      <div aria-hidden="true" className="pointer-events-none absolute rounded-[50%] bg-lime-300/[.05] blur-2xl" style={{ left: cx - rx * 0.8, top: cy - ring.ry * 0.7, width: rx * 1.6, height: ring.ry * 1.4 }} />

      <TableTopBar
        title="Quick Math"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        status={status}
        onReact={props.onReact}
        canReact={Boolean(me)}
        actions={<GlassButton icon={<Trophy className="size-4" />} label="Scores" pressed={scoresOpen} onClick={() => setScoresPref(!scoresOpen)} />}
      />

      {props.error && connected && (
        <p className="uno-rise absolute left-1/2 top-[64px] z-30 -translate-x-1/2 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-semibold shadow-lg">{props.error}</p>
      )}

      {box.w > 0 && (
        <>
          {countdown && (
            <p
              key={secondsLeft}
              className="uno-pop pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-1/2 font-mono font-black tabular-nums text-lime-200 drop-shadow-[0_0_30px_rgb(190_242_100/.6)]"
              style={{ left: cx, top: cy, fontSize: compact ? 72 : 112 }}
            >
              {Math.max(1, secondsLeft)}
            </p>
          )}

          {round && !countdown && !over && (
            <PromptCard
              dealKey={roundKey}
              eyebrow={round.double ? "Final · ×2" : `Question ${round.number}`}
              tag={QUICK_MATH_LEVELS[round.level]}
              text=""
              compact={compact}
              className={round.double ? "ring-4 ring-amber-300/80" : undefined}
              style={{ left: cx, top: cy, width: promptW }}
            >
              <p className="-mt-1 text-xs font-bold uppercase tracking-wider text-[#1b1712]/60">{round.prompt}</p>
              <ProblemText round={round} compact={compact} />
              {reveal && round.note && <p className="uno-rise mt-1 font-mono text-xs font-bold text-[#1b1712]/55">{round.note}</p>}
              {reveal && (
                <p className="uno-rise mt-3 flex items-center justify-center gap-2 text-sm font-bold">
                  {fastest ? (
                    <>
                      <Zap className="size-4 text-amber-500" />
                      <PartyAvatar id={fastest.id} name={fastest.name} size={22} className="ring-1" />
                      {fastest.id === playerId ? "You" : fastest.name}
                      <span className="font-mono text-[#1b1712]/55">{seconds(correct[0]![1].ms)}</span>
                      <span className="text-[#1b1712]/55">· {correct.length}/{players.length} right</span>
                    </>
                  ) : (
                    <span className="text-[#1b1712]/55">Nobody got it</span>
                  )}
                </p>
              )}
            </PromptCard>
          )}

          {seatOrder.map((id) => {
            const player = state.players[id]
            const seat = ring.seats[id]
            if (!player || !seat) return null
            const answer = reveal ? round?.answers?.[id] : undefined
            const won = Boolean(answer?.correct)
            const chip = question && round?.answeredIds.includes(id)
              ? <SeatChip tone="waiting"><Lock className="size-2.5" />Locked</SeatChip>
              : answer?.correct
                ? <SeatChip tone="done"><Check className="size-2.5" />{seconds(answer.ms)}</SeatChip>
                : answer && round
                  ? <SeatChip tone="alert"><X className="size-2.5" />{quickMathFill(round.options, answer.value)}</SeatChip>
                  : null
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
                glow={won ? "#a3e635" : null}
                bubble={reactions[id]}
                bubbleSide={seat.y < cy - ring.ry * 0.3 ? "bottom" : "top"}
              >
                {answer?.points ? (
                  <span className="party-float pointer-events-none absolute bottom-full left-1/2 z-20 rounded-full bg-lime-400 px-2 py-0.5 text-sm font-black text-lime-950 shadow-lg">+{answer.points}</span>
                ) : null}
              </Seat>
            )
          })}
        </>
      )}

      {/* Answer dock. */}
      <div className="absolute bottom-3 z-30 flex -translate-x-1/2 justify-center" style={{ left: box.w ? cx : "50%" }}>
        {question && me && !answered && options && (
          <div className="uno-rise flex items-center gap-2">
            {options.map((option, index) => (
              <button
                key={option}
                type="button"
                onClick={() => send(String(index), option)}
                disabled={!connected}
                aria-label={`Answer ${option}`}
                className={cn(
                  "h-12 rounded-2xl bg-lime-400 px-3 font-mono font-black tabular-nums text-lime-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.04] disabled:bg-white/20 disabled:text-white/60",
                  option.length > 3 ? "min-w-16 text-sm sm:min-w-20 sm:text-base" : "min-w-14 text-xl sm:min-w-16 sm:text-2xl",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {question && me && !answered && !options && (
          <form
            className="uno-rise flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setDraft({ key: roundKey, value: event.target.value.replace(/\D/g, "").slice(0, 6) })}
              inputMode="numeric"
              autoComplete="off"
              aria-label="Your answer"
              placeholder="Answer"
              disabled={!connected}
              className="h-12 w-40 rounded-2xl border border-white/15 bg-black/55 px-4 text-center font-mono text-base font-black tabular-nums text-white shadow-[0_10px_30px_rgb(0_0_0/.5)] outline-none backdrop-blur-md placeholder:text-white/35 focus:border-lime-300/70 sm:text-xl"
            />
            <button
              type="submit"
              disabled={!value || !connected}
              aria-label="Submit answer"
              className="grid size-12 place-items-center rounded-2xl bg-lime-400 text-lime-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.04] disabled:bg-white/20 disabled:text-white/60 disabled:hover:scale-100"
            >
              <Send className="size-5" />
            </button>
          </form>
        )}
        {question && answered && (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            <Lock className="size-4 text-lime-200" /> Locked in{lockedIn && <span className="font-mono font-black">{lockedIn}</span>}<span className="text-white/55 max-sm:hidden">· waiting for the others</span>
          </p>
        )}
        {countdown && (
          <p className={cn(GLASS, "flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold max-sm:text-xs")}>
            <Timer className="size-4 text-lime-200" /> {state.settings.rounds} questions · one answer each · last one ×2
          </p>
        )}
        {over && resultsHidden && (
          <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
            <Trophy className="size-4 text-amber-300" /> Show results
          </button>
        )}
      </div>

      {scoresOpen && (
        <div className={cn(GLASS, "uno-rise absolute left-3 top-[68px] z-30 w-[220px] p-2", !wide && "bg-[#06100a]/90")}>
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
  state: PublicQuickMathState
  rows: ScoreRow[]
  meId: string
  isHost: boolean
  onRestart: () => void
  onHide: () => void
  onLeave: () => void
}) {
  const ranked = [...rows].sort((left, right) => right.score - left.score)
  const winners = ranked.filter((row) => state.winnerIds.includes(row.id))
  const title = winners.length === 0
    ? "Nobody scored"
    : winners.some((row) => row.id === meId)
      ? winners.length > 1 ? "You share the win!" : "Fastest brain at the table!"
      : winners.length > 1 ? `Tie: ${winners.map((row) => row.name).join(" & ")}` : `${winners[0]!.name} wins`
  let fastest: { id: string; ms: number; text: string; answer: string } | null = null
  for (const entry of state.history) {
    for (const [id, answer] of Object.entries(entry.answers)) {
      if (answer.correct && (!fastest || answer.ms < fastest.ms)) {
        fastest = { id, ms: answer.ms, text: entry.text, answer: quickMathFill(entry.options, entry.answer) }
      }
    }
  }
  const fastestPlayer = fastest ? state.players[fastest.id] : undefined

  return (
    <div className="uno-fade-in absolute inset-0 z-40 overflow-y-auto bg-[#040905]/80 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-amber-300" />
          <h2 className="mt-2 text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{state.history.length} questions · {state.settings.questionTime}s each</p>
        </div>

        <Podium rows={rows} meId={meId} unit={(score) => (score === 1 ? "pt" : "pts")} />

        {fastest && fastestPlayer && (
          <div className={cn(GLASS, "uno-pop w-full max-w-sm p-4")} style={{ animationDelay: "900ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-lime-300">
              <Zap className="size-3.5" /> Fastest answer
            </p>
            <div className="mt-3 flex items-center gap-3">
              <PartyAvatar id={fastestPlayer.id} name={fastestPlayer.name} size={44} style={{ boxShadow: "0 0 0 3px #a3e635" }} />
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{fastestPlayer.id === meId ? "You" : fastestPlayer.name}</p>
                <p className="font-mono text-xs text-white/65">{fastest.text.replace("?", fastest.answer)} in {seconds(fastest.ms)}</p>
              </div>
            </div>
          </div>
        )}

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
            <button type="button" onClick={onRestart} className="flex h-11 items-center gap-2 rounded-2xl bg-lime-400 px-5 text-sm font-black text-lime-950 transition hover:scale-[1.03]">
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

/** The expression, with its blank showing "?" until the answer is revealed. */
function ProblemText({ round, compact }: { round: PublicQuickMathRound; compact: boolean }) {
  const [before, after] = splitQuickMath(round.text)
  const long = round.text.length > 14
  return (
    <p className={cn("mt-1 whitespace-nowrap font-mono font-black tabular-nums tracking-tight", compact ? (long ? "text-2xl" : "text-4xl") : long ? "text-4xl" : "text-6xl")}>
      {before}
      {round.answer === null
        ? <span className="text-[#1b1712]/30">?</span>
        : <span className="uno-pop inline-block text-emerald-700">{quickMathFill(round.options, round.answer)}</span>}
      {after}
    </p>
  )
}
