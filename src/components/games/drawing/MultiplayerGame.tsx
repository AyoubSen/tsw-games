import { Check, Lock, MessageSquare, Palette, Pencil, Send, Trophy, Users } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import type { Reaction } from "@/lib/reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { DRAW_PACE_MS, type Guess, type PublicGameState, type Stroke } from "../../../../party/drawing"
import { GLASS, GlassButton, PartyTable, TableTopBar, TimerRing, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar } from "../party-shell/SeatRing"
import type { ScoreRow } from "../party-shell/Scoreboard"
import { Canvas, DrawingView, type DrawTool } from "./Canvas"
import { Toolbar } from "./Toolbar"
import { BeatBar, DockPanel, Easel, GameOverOverlay, STUDIO_BG, SeatColumn, fitSheet, type SeatRowData } from "./studio"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  strokes: Stroke[]
  undoPending: boolean
  canvasRevision: number
  connected: boolean
  clockOffset: number
  error: string | null
  reactions: ReactionBubbles
  onStroke: (stroke: Stroke) => void
  onClear: () => void
  onUndo: () => void
  onGuess: (text: string) => void
  onChooseWord: (index: number) => void
  onReact: (reaction: Reaction) => void
  onRestart: () => void
  onLeave: () => void
}

const SIDE_W = 240
const FEED_W = 330
const GUESS_COOLDOWN_MS = 3000

export function MultiplayerGame(props: MultiplayerGameProps) {
  const { gameState: state, playerId, connected, reactions } = props
  const me = state.players[playerId]
  const over = state.status === "finished"
  const stage = over ? null : state.stage
  const isDrawer = playerId === state.currentDrawerId
  const drawer = state.currentDrawerId ? state.players[state.currentDrawerId] : undefined
  const gotIt = state.correctGuessers.includes(playerId)
  const subject = state.mode === "league-of-legends" ? "champion" : state.mode === "valorant" ? "agent" : "word"

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const [playersOpen, setPlayersOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSeen, setChatSeen] = useState(0)
  const [resultsHidden, setResultsHidden] = useState(false)
  const [color, setColor] = useState("#111111")
  const [size, setSize] = useState(8)
  const [tool, setTool] = useState<DrawTool>("pen")

  // ─── Server-paced beat, measured on the server clock ─────────────────────
  const now = useNow(stage !== null, 200) + props.clockOffset
  const elapsed = state.beatStartedAt ? now - state.beatStartedAt : Infinity
  const beatLen = state.beatStartedAt && state.beatEndsAt ? state.beatEndsAt - state.beatStartedAt : 0
  const secondsLeft = (stage === "drawing" || stage === "choosing") && state.beatEndsAt ? Math.max(0, Math.ceil((state.beatEndsAt - now) / 1000)) : null
  const revealing = stage === "reveal" || stage === "score"
  const replay = useMemo(
    () => (state.beatStartedAt && stage === "reveal" ? { startAt: state.beatStartedAt - props.clockOffset + DRAW_PACE_MS.replayDelay, duration: DRAW_PACE_MS.replay } : null),
    // Pin the replay to its beat so state echoes mid-replay don't move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.beatSeq, stage],
  )

  const guesses = state.guesses
  const correctCount = state.correctGuessers.length
  const myCloses = guesses.filter((guess) => guess.kind === "close" && guess.playerId === playerId).length
  useSoundCue(stage === "handoff" ? `h${state.beatSeq}` : null, () => playSound("turn"))
  useSoundCue(stage === "drawing" && secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 0 ? `t${state.beatSeq}:${secondsLeft}` : null, () => playSound("tick"))
  useSoundCue(stage === "drawing" && correctCount ? `c${state.roundNumber}:${correctCount}` : null, () => playSound("correct"))
  useSoundCue(myCloses ? `x${state.roundNumber}:${myCloses}` : null, () => playSound("knock"))
  useSoundCue(stage === "reveal" ? `r${state.beatSeq}` : null, () => playSound("roundEnd"))
  useSoundCue(stage === "score" ? `s${state.beatSeq}` : null, () => playSound("chip"))
  useSoundCue(over ? `over${state.roundNumber}` : null, () => playSound("win"))

  // ─── Layout ──────────────────────────────────────────────────────────────
  const compact = box.w < 640 || box.h < 560
  const top = 68
  const left = wide ? 12 + SIDE_W + 12 : 12
  const right = wide ? 12 + FEED_W + 12 : 12
  const bottom = wide || !me ? 12 : 76
  const areaW = Math.max(0, box.w - left - right)
  const areaH = Math.max(0, box.h - top - bottom)
  const wordH = compact ? 46 : 56
  const myTurn = isDrawer && (stage === "choosing" || stage === "handoff" || stage === "drawing")
  const paletteH = myTurn ? (compact ? 58 : 70) : 0
  const sheet = fitSheet(areaW - 8, areaH - wordH - 12 - 34 - (paletteH ? paletteH + 12 : 0))

  // ─── Seats ───────────────────────────────────────────────────────────────
  const players = useMemo(() => Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt), [state.players])
  const seatRows: SeatRowData[] = players.map((player) => {
    const correct = state.correctGuessers.includes(player.id)
    const drawing = player.id === state.currentDrawerId && !over
    return {
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.connected !== false,
      isHost: player.id === state.hostId,
      badge: drawing ? (
        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-300 px-1.5 py-px text-[9px] font-black uppercase text-amber-950">
          <Pencil className="size-2.5" /> Drawing
        </span>
      ) : correct && !over ? (
        <span className="uno-tag flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-400 px-1.5 py-px text-[9px] font-black text-emerald-950">
          <Check className="size-2.5" strokeWidth={3} />
          {stage !== "score" && state.roundGains[player.id] ? `+${state.roundGains[player.id]}` : "Got it"}
        </span>
      ) : null,
      gain: stage === "score" ? state.roundGains[player.id] : undefined,
      glow: drawing ? "#fbbf24" : correct && !over ? "#34d399" : null,
    }
  })
  const seats = <SeatColumn rows={seatRows} meId={playerId} bubbles={reactions} floatKey={`${state.beatSeq}`} />

  // ─── Feed ────────────────────────────────────────────────────────────────
  const chatBadge = !wide && !chatOpen && guesses.length > chatSeen
  const feed = (
    <Feed
      guesses={guesses}
      playerId={playerId}
      drawerName={drawer?.name ?? "Someone"}
      roundNumber={state.roundNumber}
    />
  )
  const input = me && (
    <GuessBox
      key={state.roundNumber}
      onSend={props.onGuess}
      disabled={!connected || stage !== "drawing"}
      guessing={!isDrawer && !gotIt}
      placeholder={
        stage !== "drawing"
          ? revealing ? "Round over" : "Waiting for the drawing…"
          : isDrawer
            ? "Chat with players who got it…"
            : gotIt
              ? "Chat with the drawer and finishers…"
              : `Guess the ${subject}…`
      }
    />
  )

  const status = (
    <>
      <Palette className="size-4 shrink-0 text-amber-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{over ? "Final scores" : `Round ${state.roundNumber} / ${state.totalRounds}`}</p>
        <p className="truncate text-[11px] text-white/60">
          {stage === "choosing" ? `${isDrawer ? "You are" : `${drawer?.name ?? "Someone"} is`} choosing`
            : stage === "handoff" || stage === "drawing" ? `${isDrawer ? "You are" : `${drawer?.name ?? "Someone"} is`} drawing · ${correctCount} got it`
            : stage === "reveal" ? "The reveal" : stage === "score" ? "Points land" : over ? `${state.gallery.length} drawings` : ""}
        </p>
      </div>
      {secondsLeft !== null && <TimerRing left={secondsLeft} limit={stage === "choosing" ? DRAW_PACE_MS.choose / 1000 : state.roundTimeLimit} />}
    </>
  )

  const scoreRows: ScoreRow[] = players.map((player) => ({ id: player.id, name: player.name, score: player.score }))
  const top1 = Math.max(0, ...scoreRows.map((row) => row.score))
  const winners = scoreRows.filter((row) => row.score === top1)
  const gameOverTitle = top1 === 0
    ? "Nobody scored"
    : winners.some((row) => row.id === playerId)
      ? winners.length > 1 ? "You share the win!" : "You win!"
      : winners.length > 1 ? `Tie: ${winners.map((row) => row.name).join(" & ")}` : `${winners[0]?.name} wins`

  return (
    <PartyTable tableRef={tableRef} background={STUDIO_BG}>
      <TableTopBar
        title="Drawing"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        status={status}
        onReact={props.onReact}
        canReact={Boolean(me)}
        actions={!wide && (
          <>
            <GlassButton icon={<Users className="size-4" />} label="Players" pressed={playersOpen} onClick={() => setPlayersOpen(!playersOpen)} />
            <GlassButton
              icon={<MessageSquare className="size-4" />}
              label="Chat"
              pressed={chatOpen}
              badge={chatBadge}
              onClick={() => {
                setChatOpen(!chatOpen)
                setChatSeen(guesses.length)
              }}
            />
          </>
        )}
      />

      {props.error && connected && (
        <p className="uno-rise absolute left-1/2 top-[64px] z-40 -translate-x-1/2 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-semibold shadow-lg">{props.error}</p>
      )}

      {box.w > 0 && (
        <div className="absolute flex flex-col items-center justify-center gap-3" style={{ left, top, width: areaW, height: areaH }}>
          <WordPanel state={state} isDrawer={isDrawer} gotIt={gotIt} subject={subject} height={wordH} compact={compact} />

          <Easel
            width={sheet.width}
            glow={stage === "drawing" && isDrawer ? "rgb(251 191 36 / .55)" : null}
            overlay={
              <EaselOverlay
                state={state}
                stage={stage}
                isDrawer={isDrawer}
                gotIt={gotIt}
                subject={subject}
                drawerId={state.currentDrawerId}
                drawerName={drawer?.name ?? "Someone"}
                elapsed={elapsed}
                beatLen={beatLen}
                compact={compact}
                onChoose={props.onChooseWord}
              />
            }
          >
            {revealing ? (
              <DrawingView strokes={state.strokes} replay={replay} />
            ) : (
              <Canvas
                strokes={props.strokes}
                isDrawer={isDrawer}
                onStroke={props.onStroke}
                color={color}
                size={size}
                tool={tool}
                disabled={!connected || stage !== "drawing" || props.undoPending}
                revision={props.canvasRevision}
              />
            )}
          </Easel>

          {myTurn && (
            <Toolbar
              selectedColor={color}
              selectedSize={size}
              tool={tool}
              onColorChange={setColor}
              onSizeChange={setSize}
              onToolChange={setTool}
              onClear={props.onClear}
              onUndo={props.onUndo}
              canUndo={props.strokes.length > 0}
              disabled={!connected || stage !== "drawing" || props.undoPending}
              compact={compact}
            />
          )}
        </div>
      )}

      {/* Players */}
      {wide ? (
        <DockPanel title="Players" icon={<Users className="size-3.5 text-white/60" />} className="absolute left-3 top-[68px] z-20 max-h-[calc(100%-80px)]" style={{ width: SIDE_W }}>
          {seats}
        </DockPanel>
      ) : playersOpen && (
        <DockPanel title="Players" icon={<Users className="size-3.5 text-white/60" />} onClose={() => setPlayersOpen(false)} className="uno-rise absolute left-3 top-[68px] z-40 max-h-[calc(100%-80px)] w-[min(280px,calc(100%-24px))] bg-[#14110e]/95">
          {seats}
        </DockPanel>
      )}

      {/* Guess feed */}
      {wide ? (
        <DockPanel title="Guesses" icon={<MessageSquare className="size-3.5 text-white/60" />} className="absolute bottom-3 right-3 top-[68px] z-20" style={{ width: FEED_W }} footer={input}>
          {feed}
        </DockPanel>
      ) : (
        <>
          {chatOpen && (
            <DockPanel
              title="Guesses"
              icon={<MessageSquare className="size-3.5 text-white/60" />}
              onClose={() => setChatOpen(false)}
              className="uno-rise absolute right-3 top-[68px] z-40 w-[min(340px,calc(100%-24px))] bg-[#14110e]/95"
              style={{ bottom: bottom }}
            >
              {feed}
            </DockPanel>
          )}
          {me && (
            <div className="absolute inset-x-3 bottom-3 z-30">
              {!chatOpen && !myTurn && <Ticker guesses={guesses} playerId={playerId} />}
              {input}
            </div>
          )}
        </>
      )}

      {over && resultsHidden && (
        <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "absolute bottom-3 left-1/2 z-40 flex h-11 -translate-x-1/2 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
          <Trophy className="size-4 text-amber-300" /> Show results
        </button>
      )}

      {over && !resultsHidden && (
        <GameOverOverlay
          title={gameOverTitle}
          subtitle={`${state.totalRounds} rounds · ${state.gallery.length} drawings`}
          rows={scoreRows}
          meId={playerId}
          groups={[{
            title: "Every drawing",
            items: state.gallery.map((item) => ({
              id: item.id,
              strokes: item.strokes,
              title: item.word,
              artistId: item.artistId,
              artistName: item.artistId === playerId ? "You" : item.artistName,
              caption: `Round ${item.round}`,
            })),
          }]}
          isHost={props.isHost}
          onRestart={props.onRestart}
          onHide={() => setResultsHidden(true)}
          onLeave={props.onLeave}
        />
      )}
    </PartyTable>
  )
}

/** The word as each seat sees it: the drawer and finishers read it, guessers get blanks and hints. */
function WordPanel({ state, isDrawer, gotIt, subject, height, compact }: {
  state: PublicGameState
  isDrawer: boolean
  gotIt: boolean
  subject: string
  height: number
  compact: boolean
}) {
  const stage = state.status === "finished" ? null : state.stage
  const known = Boolean(state.currentWord) && (isDrawer || gotIt || stage === "reveal" || stage === "score" || state.status === "finished")
  const label =
    stage === "choosing" ? (isDrawer ? `Pick a ${subject} to draw` : `A ${subject} is being chosen`)
      : stage === "reveal" || stage === "score" ? `The ${subject} was`
        : isDrawer ? "Draw this"
          : gotIt ? "You got it!"
            : state.status === "finished" ? `Last ${subject}`
              : `Guess the ${subject}`
  const tile = compact ? 15 : 20
  return (
    <div className={cn(GLASS, "flex max-w-full shrink-0 items-center gap-3 px-4")} style={{ height }}>
      <span className={cn("shrink-0 text-[10px] font-bold uppercase tracking-[0.2em]", gotIt && !isDrawer ? "text-emerald-300" : "text-white/55")}>{label}</span>
      {stage === "choosing" ? (
        <span className="text-sm text-white/60">…</span>
      ) : known ? (
        <span key={state.currentWord} className={cn("draw-word truncate font-black uppercase tracking-wider", compact ? "text-lg" : "text-2xl", gotIt && !isDrawer ? "text-emerald-200" : "text-amber-100")}>
          {state.currentWord}
        </span>
      ) : (
        <span className="flex min-w-0 items-end gap-[3px] overflow-hidden" aria-label={`${state.wordLength} letters`}>
          {state.wordMask.map((char, index) =>
            char === " " ? (
              <span key={index} style={{ width: tile * 0.6 }} />
            ) : (
              <span
                key={`${index}:${char ?? ""}`}
                className={cn("grid shrink-0 place-items-end justify-center border-b-2 font-black uppercase", char ? "draw-tile border-amber-300 text-amber-200" : "border-white/70 text-transparent")}
                style={{ width: tile, height: tile * 1.35, fontSize: tile * 0.85, lineHeight: 1 }}
              >
                {char ?? "_"}
              </span>
            ),
          )}
          <span className="ml-1.5 font-mono text-xs text-white/50">{state.wordLength}</span>
        </span>
      )}
    </div>
  )
}

/** Choosing, handoff and reveal moments played over the paper. */
function EaselOverlay({ state, stage, isDrawer, gotIt, subject, drawerId, drawerName, elapsed, beatLen, compact, onChoose }: {
  state: PublicGameState
  stage: PublicGameState["stage"]
  isDrawer: boolean
  gotIt: boolean
  subject: string
  drawerId: string | null
  drawerName: string
  elapsed: number
  beatLen: number
  compact: boolean
  onChoose: (index: number) => void
}) {
  if (stage === "choosing") {
    return (
      <div className="uno-fade-in absolute inset-0 grid place-items-center bg-[#1a1612]/80 p-4 text-white backdrop-blur-[2px]">
        <div className="w-full max-w-lg text-center">
          {isDrawer ? (
            <>
              <p className={cn("font-black", compact ? "text-lg" : "text-2xl")}>Your turn — pick a {subject}</p>
              <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-3" : "grid-cols-3 gap-3")}>
                {state.wordChoices.map((word, index) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => onChoose(index)}
                    className="uno-pop rounded-xl border-2 border-amber-200/40 bg-[#fdf6e9] px-2 py-3 text-sm font-black capitalize text-[#3b2410] shadow-[0_8px_20px_rgb(0_0_0/.4)] transition hover:-translate-y-1 hover:border-amber-300 sm:text-base"
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {drawerId && <PartyAvatar id={drawerId} name={drawerName} size={compact ? 40 : 56} style={{ boxShadow: "0 0 0 3px #fbbf24" }} />}
              <p className={cn("font-black", compact ? "text-base" : "text-xl")}>
                {drawerName} is choosing a {subject}<span className="animate-pulse">…</span>
              </p>
              <Pencil className="draw-pencil size-6 text-amber-200" />
            </div>
          )}
          <BeatBar elapsed={elapsed} duration={beatLen || DRAW_PACE_MS.choose} className="mx-auto mt-4 max-w-xs" />
        </div>
      </div>
    )
  }

  if (stage === "handoff") {
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#1a1612]/55">
        <div key={state.beatSeq} className="draw-handoff flex items-center gap-3 rounded-2xl bg-[#1a1612]/90 px-5 py-3 text-white shadow-2xl" style={{ animationDuration: `${DRAW_PACE_MS.handoff}ms` }}>
          {drawerId && <PartyAvatar id={drawerId} name={drawerName} size={compact ? 36 : 48} style={{ boxShadow: "0 0 0 3px #fbbf24" }} />}
          <div className="text-left">
            <p className={cn("font-black leading-tight", compact ? "text-lg" : "text-2xl")}>{isDrawer ? "You're drawing!" : `${drawerName} is drawing`}</p>
            <p className="text-xs text-white/65">
              {isDrawer && state.currentWord ? <>Draw <b className="uppercase text-amber-200">{state.currentWord}</b></> : `${state.wordLength} letters · get guessing`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (stage === "reveal" || stage === "score") {
    const guessers = Object.keys(state.players).length - 1
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div key={state.roundNumber} className="uno-pop rounded-2xl bg-[#1a1612]/90 px-5 py-2.5 text-center text-white shadow-2xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">The {subject} was</p>
          <p className={cn("draw-word font-black uppercase text-amber-200", compact ? "text-xl" : "text-3xl")}>{state.currentWord}</p>
          <p className="text-[11px] text-white/65">{state.correctGuessers.length} of {guessers} got it</p>
        </div>
      </div>
    )
  }

  if (stage === "drawing" && gotIt && !isDrawer) {
    return (
      <span className="party-stamp pointer-events-none absolute right-3 top-6 rounded-md border-2 border-emerald-500 bg-white/85 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-emerald-600 shadow" style={{ transform: "rotate(8deg)" }}>
        ✓ Got it
      </span>
    )
  }
  return null
}

function FeedLine({ guess, playerId }: { guess: Guess; playerId: string }) {
  const name = guess.playerId === playerId ? "You" : guess.playerName
  if (guess.kind === "correct") {
    return (
      <li className="uno-rise flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2 py-1 text-sm font-semibold text-emerald-200">
        <Check className="size-3.5 shrink-0" strokeWidth={3} />
        <span className="min-w-0 flex-1 truncate">{name} got it</span>
        {guess.points ? <span className="shrink-0 font-mono text-xs">+{guess.points}</span> : null}
      </li>
    )
  }
  if (guess.kind === "close") {
    return (
      <li className="uno-rise rounded-lg bg-amber-400/15 px-2 py-1 text-sm text-amber-100">
        <span className="font-bold">“{guess.text}”</span> is so close! <span className="text-[10px] text-amber-200/60">(only you see this)</span>
      </li>
    )
  }
  if (guess.kind === "chat") {
    return (
      <li className="uno-rise flex gap-1.5 rounded-lg bg-violet-500/15 px-2 py-1 text-sm">
        <Lock className="mt-0.5 size-3 shrink-0 text-violet-300" />
        <span className="min-w-0 break-words"><span className="font-semibold text-violet-200">{name}:</span> <span className="text-white/85">{guess.text}</span></span>
      </li>
    )
  }
  return (
    <li className="uno-rise break-words px-2 py-0.5 text-sm">
      <span className={cn("font-semibold", guess.playerId === playerId ? "text-sky-200" : "text-white/90")}>{name}:</span>{" "}
      <span className="text-white/70">{guess.text}</span>
    </li>
  )
}

function Feed({ guesses, playerId, drawerName, roundNumber }: { guesses: Guess[]; playerId: string; drawerName: string; roundNumber: number }) {
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const list = listRef.current?.parentElement
    if (list) list.scrollTop = list.scrollHeight
  }, [guesses.length])
  return (
    <ol ref={listRef} className="space-y-1">
      <li className="px-2 pb-1 text-[11px] text-white/45">Round {roundNumber} · {drawerName} is up</li>
      {guesses.length === 0 && <li className="px-2 py-4 text-center text-sm text-white/40">No guesses yet…</li>}
      {guesses.map((guess, index) => <FeedLine key={`${guess.timestamp}:${index}`} guess={guess} playerId={playerId} />)}
    </ol>
  )
}

/** The last few lines floating above the input on small screens. */
function Ticker({ guesses, playerId }: { guesses: Guess[]; playerId: string }) {
  const recent = guesses.slice(-2)
  if (recent.length === 0) return null
  return (
    <ol className="pointer-events-none mb-1.5 space-y-1 [&>li]:bg-black/55 [&>li]:backdrop-blur-sm">
      {recent.map((guess, index) => <FeedLine key={`${guess.timestamp}:${index}`} guess={guess} playerId={playerId} />)}
    </ol>
  )
}

function GuessBox({ onSend, disabled, guessing, placeholder }: { onSend: (text: string) => void; disabled: boolean; guessing: boolean; placeholder: string }) {
  const [text, setText] = useState("")
  const [coolUntil, setCoolUntil] = useState(0)
  const cooling = coolUntil > 0
  useEffect(() => {
    if (!cooling) return
    const timer = window.setTimeout(() => setCoolUntil(0), Math.max(0, coolUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [cooling, coolUntil])

  return (
    <form
      className={cn(GLASS, "relative flex h-12 items-center gap-2 overflow-hidden bg-[#14110e]/90 pl-3 pr-1.5")}
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled || cooling || !text.trim()) return
        onSend(text.trim())
        setText("")
        if (guessing) setCoolUntil(Date.now() + GUESS_COOLDOWN_MS)
      }}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={100}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40 disabled:cursor-not-allowed"
      />
      <button type="submit" aria-label="Send" disabled={disabled || cooling || !text.trim()} className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-300 text-amber-950 transition disabled:bg-white/10 disabled:text-white/40">
        <Send className="size-4" />
      </button>
      {cooling && <span key={coolUntil} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-amber-300/80" style={{ animation: `mafia-bar ${GUESS_COOLDOWN_MS}ms linear reverse both` }} />}
    </form>
  )
}
