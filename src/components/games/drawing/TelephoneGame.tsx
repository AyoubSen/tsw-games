import { ArrowRight, Check, Hourglass, MessageSquare, Pencil, Phone, SkipForward, Trophy, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import type { Reaction } from "@/lib/reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import {
  DRAW_PACE_MS,
  type PublicGameState,
  type Stroke,
  type TelephoneChain,
  type TelephoneEntry,
} from "../../../../party/drawing"
import { GLASS, GlassButton, PartyTable, TableTopBar, TimerRing, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar } from "../party-shell/SeatRing"
import { Canvas, DrawingView, type DrawTool } from "./Canvas"
import { Toolbar } from "./Toolbar"
import { BeatBar, DockPanel, Easel, GameOverOverlay, STUDIO_BG, SeatColumn, fitSheet, type GalleryGroup, type SeatRowData } from "./studio"

const REACTION_OPTIONS = [
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F92F}",
  "\u{2764}\u{FE0F}",
]

const SIDE_W = 230
/** A text entry flips over this long at the start of its beat. */
const FLIP_MS = 700

interface TelephoneGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  clockOffset: number
  error: string | null
  reactions: ReactionBubbles
  onSubmit: (submission: { text?: string; strokes?: Stroke[] }) => void
  onRevealNext: () => void
  onReact: (emoji: string) => void
  onTableReact: (reaction: Reaction) => void
  onRestart: () => void
  onLeave: () => void
}

export function TelephoneGame(props: TelephoneGameProps) {
  const { gameState: state, playerId, connected } = props
  const me = state.players[playerId]
  const playing = state.status === "playing"
  const revealing = state.status === "finished" && !state.telephoneRevealComplete
  const complete = state.status === "finished" && state.telephoneRevealComplete
  const assignment = state.telephoneAssignment
  const hasSubmitted = state.telephoneSubmittedIds.includes(playerId)

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const compact = box.w < 640 || box.h < 560
  const [playersOpen, setPlayersOpen] = useState(false)
  const [resultsHidden, setResultsHidden] = useState(false)

  const now = useNow(playing || revealing, 200) + props.clockOffset
  const secondsLeft = playing && state.roundStartedAt ? Math.max(0, Math.ceil((state.roundStartedAt + state.roundTimeLimit * 1000 - now) / 1000)) : null
  const elapsed = state.beatStartedAt ? now - state.beatStartedAt : Infinity
  const beatLen = state.beatStartedAt && state.beatEndsAt ? state.beatEndsAt - state.beatStartedAt : 0

  const chain = state.status === "finished" ? state.telephoneChains[state.telephoneChains.length - 1] : undefined
  const entry = chain?.entries[chain.entries.length - 1]
  useSoundCue(playing ? `s${state.telephoneStage}` : null, () => playSound("turn"))
  useSoundCue(playing && secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 0 ? `t${state.telephoneStage}:${secondsLeft}` : null, () => playSound("tick"))
  useSoundCue(revealing ? `c${state.telephoneRevealChainIndex}` : null, () => playSound("whoosh"))
  useSoundCue(revealing && state.telephoneRevealEntryIndex > 0 ? `e${state.telephoneRevealChainIndex}:${state.telephoneRevealEntryIndex}` : null, () => playSound("flip"))
  useSoundCue(complete ? `done${state.telephoneTotalStages}` : null, () => playSound("win"))

  // ─── Layout ──────────────────────────────────────────────────────────────
  const top = 68
  const left = wide ? 12 + SIDE_W + 12 : 12
  const right = 12
  const areaW = Math.max(0, box.w - left - right)
  const areaH = Math.max(0, box.h - top - 12)

  const players = useMemo(() => Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt), [state.players])
  const seatRows: SeatRowData[] = players.map((player) => {
    const done = state.telephoneSubmittedIds.includes(player.id)
    const onScreen = revealing && entry?.authorId === player.id
    return {
      id: player.id,
      name: player.name,
      connected: player.connected !== false,
      isHost: player.id === state.hostId,
      badge: playing ? (
        done
          ? <span className="uno-tag flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-400 px-1.5 py-px text-[9px] font-black text-emerald-950"><Check className="size-2.5" strokeWidth={3} />Passed</span>
          : <span className="shrink-0 rounded-full bg-black/50 px-1.5 py-px text-[9px] font-bold uppercase text-white/55">Working</span>
      ) : onScreen ? (
        <span className="shrink-0 rounded-full bg-amber-300 px-1.5 py-px text-[9px] font-black uppercase text-amber-950">On screen</span>
      ) : null,
      glow: onScreen ? "#fbbf24" : null,
      dim: playing && done,
    }
  })
  const seats = <SeatColumn rows={seatRows} meId={playerId} bubbles={props.reactions} floatKey="" ranked={false} />

  const stepLabel = state.telephoneStage === 0 ? "Write a prompt" : state.telephoneStage % 2 === 1 ? "Draw" : "Describe"
  const status = (
    <>
      <Phone className="size-4 shrink-0 text-amber-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">
          {playing ? `Turn ${state.telephoneStage + 1} / ${state.telephoneTotalStages}` : revealing ? `Chain ${state.telephoneRevealChainIndex + 1} / ${state.telephoneTotalStages}` : "Every chain revealed"}
        </p>
        <p className="truncate text-[11px] text-white/60">
          {playing ? `${stepLabel} · ${state.telephoneSubmittedIds.length} / ${state.telephoneTotalStages} passed` : revealing ? `${chain?.originPlayerName ?? ""}'s chain` : "The gallery"}
        </p>
      </div>
      {secondsLeft !== null && <TimerRing left={secondsLeft} limit={state.roundTimeLimit} />}
    </>
  )

  const groups: GalleryGroup[] = state.telephoneChains.map((item) => ({
    title: `${item.originPlayerId === playerId ? "Your" : `${item.originPlayerName}'s`} chain`,
    items: item.entries.flatMap((candidate, index) => {
      if (candidate.type !== "drawing" || candidate.strokes.length === 0) return []
      const before = item.entries[index - 1]
      const after = item.entries[index + 1]
      return [{
        id: `${item.id}:${index}`,
        strokes: candidate.strokes,
        title: before?.type === "text" ? before.text : "Untitled",
        artistId: candidate.authorId,
        artistName: candidate.authorId === playerId ? "You" : candidate.authorName,
        caption: after?.type === "text" ? <>guessed as <b className="text-white/80">“{after.text}”</b></> : undefined,
      }]
    }),
  }))

  return (
    <PartyTable tableRef={tableRef} background={STUDIO_BG}>
      <TableTopBar
        title="Drawing Telephone"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        status={status}
        onReact={props.onTableReact}
        canReact={Boolean(me)}
        actions={!wide && <GlassButton icon={<Users className="size-4" />} label="Players" pressed={playersOpen} onClick={() => setPlayersOpen(!playersOpen)} />}
      />

      {props.error && connected && (
        <p className="uno-rise absolute left-1/2 top-[64px] z-40 -translate-x-1/2 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-semibold shadow-lg">{props.error}</p>
      )}

      {box.w > 0 && (
        <div className="absolute flex flex-col items-center justify-center gap-3" style={{ left, top, width: areaW, height: areaH }}>
          {playing && (
            hasSubmitted ? (
              <PassedAlong state={state} />
            ) : assignment?.type === "draw" ? (
              <DrawTurn key={state.telephoneStage} prompt={assignment.prompt} areaW={areaW} areaH={areaH} compact={compact} disabled={!connected || secondsLeft === 0} onSubmit={(strokes) => props.onSubmit({ strokes })} />
            ) : assignment?.type === "describe" ? (
              <DescribeTurn key={state.telephoneStage} strokes={assignment.strokes} areaW={areaW} areaH={areaH} disabled={!connected || secondsLeft === 0} onSubmit={(text) => props.onSubmit({ text })} />
            ) : assignment?.type === "write-prompt" ? (
              <PromptTurn key={state.telephoneStage} disabled={!connected || secondsLeft === 0} onSubmit={(text) => props.onSubmit({ text })} />
            ) : (
              <p className={cn(GLASS, "px-5 py-4 text-sm text-white/60")}>Preparing your next turn…</p>
            )
          )}

          {(revealing || complete) && chain && entry && (
            <RevealStage
              key={`${state.telephoneRevealChainIndex}:${state.telephoneRevealEntryIndex}`}
              state={state}
              chain={chain}
              entry={entry}
              playerId={playerId}
              isHost={props.isHost}
              areaW={areaW}
              areaH={areaH}
              compact={compact}
              elapsed={elapsed}
              beatLen={beatLen}
              replayStartAt={(state.beatStartedAt ?? 0) - props.clockOffset + 400}
              onReact={props.onReact}
              onRevealNext={props.onRevealNext}
            />
          )}
        </div>
      )}

      {wide ? (
        <DockPanel title="Players" icon={<Users className="size-3.5 text-white/60" />} className="absolute left-3 top-[68px] z-20 max-h-[calc(100%-80px)]" style={{ width: SIDE_W }}>
          {seats}
        </DockPanel>
      ) : playersOpen && (
        <DockPanel title="Players" icon={<Users className="size-3.5 text-white/60" />} onClose={() => setPlayersOpen(false)} className="uno-rise absolute left-3 top-[68px] z-40 max-h-[calc(100%-80px)] w-[min(280px,calc(100%-24px))] bg-[#14110e]/95">
          {seats}
        </DockPanel>
      )}

      {complete && resultsHidden && (
        <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "absolute bottom-3 left-1/2 z-40 flex h-11 -translate-x-1/2 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
          <Trophy className="size-4 text-amber-300" /> Show gallery
        </button>
      )}
      {complete && !resultsHidden && (
        <GameOverOverlay
          title="Every chain revealed"
          subtitle={`${state.telephoneChains.length} chains · ${state.telephoneTotalStages} hands each`}
          rows={null}
          meId={playerId}
          groups={groups}
          isHost={props.isHost}
          onRestart={props.onRestart}
          onHide={() => setResultsHidden(true)}
          onLeave={props.onLeave}
        />
      )}
    </PartyTable>
  )
}

function PassedAlong({ state }: { state: PublicGameState }) {
  const waiting = Object.values(state.players).filter((player) => !state.telephoneSubmittedIds.includes(player.id))
  return (
    <div className={cn(GLASS, "uno-pop w-full max-w-md px-6 py-8 text-center")}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-400/20">
        <ArrowRight className="size-5 text-emerald-300" />
      </span>
      <p className="mt-3 text-xl font-black">Passed along</p>
      <p className="mt-1 text-sm text-white/60">Waiting for {waiting.length} other player{waiting.length === 1 ? "" : "s"}…</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {waiting.map((player) => (
          <span key={player.id} className="flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pl-0.5 pr-2 text-xs">
            <PartyAvatar id={player.id} name={player.name} size={20} className="ring-1" />
            {player.name}
            <Hourglass className="size-3 animate-pulse text-white/50" />
          </span>
        ))}
      </div>
    </div>
  )
}

/** An index card to start a chain. */
function PromptTurn({ disabled, onSubmit }: { disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("")
  return (
    <form
      className="uno-pop w-full max-w-lg -rotate-1 rounded-md bg-[#fdf8ec] p-6 text-[#2b1d10] shadow-[0_24px_50px_rgb(0_0_0/.55)]"
      style={{ backgroundImage: "repeating-linear-gradient(transparent 0 31px, rgb(56 120 200 / .22) 31px 32px)", backgroundPositionY: 54 }}
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim() && !disabled) onSubmit(text.trim())
      }}
    >
      <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-700/80">Start a chain</p>
      <p className="mt-1 text-sm text-[#2b1d10]/70">Write something fun for the next player to draw.</p>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={120}
        placeholder="A penguin running a bakery…"
        autoFocus
        className="mt-5 w-full border-b-2 border-[#2b1d10]/30 bg-transparent pb-1 text-xl font-bold outline-none placeholder:text-[#2b1d10]/35 focus:border-rose-600"
      />
      <button type="submit" disabled={disabled || !text.trim()} className="mt-5 w-full rounded-xl bg-[#2b1d10] py-3 text-sm font-black text-[#fdf8ec] transition hover:bg-black disabled:opacity-40">
        Start my chain
      </button>
    </form>
  )
}

function DrawTurn({ prompt, areaW, areaH, compact, disabled, onSubmit }: {
  prompt: string
  areaW: number
  areaH: number
  compact: boolean
  disabled: boolean
  onSubmit: (strokes: Stroke[]) => void
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState("#111111")
  const [size, setSize] = useState(8)
  const [tool, setTool] = useState<DrawTool>("pen")
  const promptH = compact ? 46 : 56
  const paletteH = compact ? 58 : 70
  const sheet = fitSheet(areaW - 8, areaH - promptH - 34 - paletteH - 56 - 36)
  return (
    <>
      <div className={cn(GLASS, "flex max-w-full items-center gap-3 px-4")} style={{ height: promptH }}>
        <Pencil className="size-4 shrink-0 text-amber-200" />
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Draw this</span>
        <span className={cn("truncate font-black text-amber-100", compact ? "text-base" : "text-xl")}>{prompt}</span>
      </div>
      <Easel width={sheet.width}>
        <Canvas strokes={strokes} isDrawer onStroke={(stroke) => setStrokes((current) => [...current, stroke])} color={color} size={size} tool={tool} disabled={disabled} />
      </Easel>
      <Toolbar
        selectedColor={color}
        selectedSize={size}
        tool={tool}
        onColorChange={setColor}
        onSizeChange={setSize}
        onToolChange={setTool}
        onClear={() => setStrokes([])}
        onUndo={() => setStrokes((current) => current.slice(0, -1))}
        canUndo={strokes.length > 0}
        disabled={disabled}
        compact={compact}
      />
      <button type="button" disabled={disabled} onClick={() => onSubmit(strokes)} className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-amber-300 px-6 text-sm font-black text-amber-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:opacity-40">
        Pass it on <ArrowRight className="size-4" />
      </button>
    </>
  )
}

function DescribeTurn({ strokes, areaW, areaH, disabled, onSubmit }: {
  strokes: Stroke[]
  areaW: number
  areaH: number
  disabled: boolean
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState("")
  const sheet = fitSheet(areaW - 8, areaH - 50 - 34 - 56 - 36)
  return (
    <>
      <div className={cn(GLASS, "flex h-[50px] max-w-full items-center gap-2 px-4")}>
        <MessageSquare className="size-4 shrink-0 text-amber-200" />
        <span className="truncate text-sm font-semibold">What do you think this is? <span className="text-white/50">Describe only what you see.</span></span>
      </div>
      <Easel width={sheet.width}>
        {strokes.length > 0 ? (
          <DrawingView strokes={strokes} />
        ) : (
          <p className="grid h-full place-items-center text-sm text-black/45">The previous player handed in a blank page.</p>
        )}
      </Easel>
      <form
        className={cn(GLASS, "flex h-12 w-full max-w-xl shrink-0 items-center gap-2 bg-[#14110e]/90 pl-3 pr-1.5")}
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() && !disabled) onSubmit(text.trim())
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={120}
          placeholder="Type your interpretation…"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        <button type="submit" disabled={disabled || !text.trim()} className="h-9 shrink-0 rounded-xl bg-amber-300 px-4 text-sm font-black text-amber-950 disabled:bg-white/10 disabled:text-white/40">
          Pass it on
        </button>
      </form>
    </>
  )
}

/**
 * One entry of one chain at a time, paced by the server: text flips in,
 * drawings replay stroke by stroke and then hold. The chain so far sits
 * underneath so the room can see where it drifted.
 */
function RevealStage({ state, chain, entry, playerId, isHost, areaW, areaH, compact, elapsed, beatLen, replayStartAt, onReact, onRevealNext }: {
  state: PublicGameState
  chain: TelephoneChain
  entry: TelephoneEntry
  playerId: string
  isHost: boolean
  areaW: number
  areaH: number
  compact: boolean
  elapsed: number
  beatLen: number
  replayStartAt: number
  onReact: (emoji: string) => void
  onRevealNext: () => void
}) {
  const [skipPending, setSkipPending] = useState(false)
  useEffect(() => {
    if (!skipPending) return
    const timer = window.setTimeout(() => setSkipPending(false), 2000)
    return () => window.clearTimeout(timer)
  }, [skipPending])

  const live = !state.telephoneRevealComplete
  const index = chain.entries.length - 1
  const earlier = chain.entries.slice(0, -1)
  const stripH = earlier.length && !compact ? 78 : 0
  const sheet = fitSheet(Math.min(areaW - 8, 900), areaH - 48 - 34 - 60 - (stripH ? stripH + 12 : 0) - 24)
  const author = entry.authorId === playerId ? "You" : entry.authorName
  // Pin the replay to this beat, so reconnect echoes don't restart it.
  const [replay] = useState(() => ({ startAt: replayStartAt, duration: DRAW_PACE_MS.telephoneReplay }))

  return (
    <>
      <div className={cn(GLASS, "flex h-12 max-w-full shrink-0 items-center gap-3 px-3")}>
        <PartyAvatar id={chain.originPlayerId} name={chain.originPlayerName} size={28} />
        <p className="truncate text-sm font-black">{chain.originPlayerId === playerId ? "Your" : `${chain.originPlayerName}'s`} chain</p>
        <span className="flex shrink-0 gap-1" aria-label={`Step ${index + 1} of ${state.telephoneTotalStages}`}>
          {Array.from({ length: state.telephoneTotalStages }, (_, step) => (
            <span key={step} className={cn("size-2 rounded-full transition", step < index ? "bg-white/60" : step === index ? "scale-125 bg-amber-300" : "bg-white/15")} />
          ))}
        </span>
      </div>

      {entry.type === "text" ? (
        <div className="grid place-items-center [perspective:1200px]" style={{ width: sheet.width, height: sheet.height + 14 }}>
          <div className="mafia-flip w-full max-w-xl -rotate-1 rounded-md bg-[#fdf8ec] px-6 py-8 text-center text-[#2b1d10] shadow-[0_24px_50px_rgb(0_0_0/.55)]" style={{ animationDuration: `${FLIP_MS}ms` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-700/80">{index === 0 ? "The prompt" : "Guessed as"}</p>
            <p className={cn("mt-2 font-black leading-tight", compact ? "text-2xl" : "text-4xl")}>“{entry.text}”</p>
            <p className="mt-3 text-xs text-[#2b1d10]/60">— {author}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Easel width={sheet.width}>
            {entry.strokes.length > 0 ? (
              <DrawingView strokes={entry.strokes} replay={live ? replay : null} />
            ) : (
              <p className="grid h-full place-items-center text-sm text-black/45">No drawing submitted</p>
            )}
          </Easel>
          <p className="mt-1 text-xs text-white/60">drawn by <b className="text-white/85">{author}</b></p>
        </div>
      )}

      {stripH > 0 && (
        <ol className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-1" style={{ height: stripH }}>
          {earlier.map((item, step) => (
            <li key={step} className="flex shrink-0 items-center gap-2">
              {item.type === "text" ? (
                <span className="grid h-16 w-28 place-items-center rounded bg-[#fdf8ec] px-2 text-center text-[11px] font-bold leading-tight text-[#2b1d10] shadow">
                  <span className="line-clamp-3">“{item.text}”</span>
                </span>
              ) : (
                <span className="block h-16 w-24 overflow-hidden rounded shadow">
                  <DrawingView strokes={item.strokes} resolution={0.2} />
                </span>
              )}
              <ArrowRight className="size-3.5 text-white/40" />
            </li>
          ))}
          <li className="grid h-16 w-16 shrink-0 place-items-center rounded border-2 border-dashed border-amber-300/60 text-[10px] font-bold uppercase text-amber-200">Now</li>
        </ol>
      )}

      {live && (
        <div className="flex w-full max-w-xl shrink-0 flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {REACTION_OPTIONS.map((emoji) => {
              const matching = state.telephoneReactions.filter((reaction) => reaction.emoji === emoji)
              const selected = matching.some((reaction) => reaction.playerId === playerId)
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  title={matching.map((reaction) => reaction.playerName).join(", ")}
                  aria-label={`React with ${emoji}`}
                  aria-pressed={selected}
                  className={cn(GLASS, "flex h-10 min-w-12 items-center justify-center gap-1 px-3 text-lg transition hover:scale-105", selected && "border-amber-300/70 bg-amber-300/20")}
                >
                  <span>{emoji}</span>
                  {matching.length > 0 && <span key={matching.length} className="uno-tag text-xs font-bold">{matching.length}</span>}
                </button>
              )
            })}
            {isHost && (
              <button
                type="button"
                disabled={skipPending}
                onClick={() => {
                  setSkipPending(true)
                  onRevealNext()
                }}
                className={cn(GLASS, "flex h-10 items-center gap-1.5 px-3 text-xs font-bold transition hover:bg-black/65 disabled:opacity-50")}
              >
                <SkipForward className="size-3.5" /> Next
              </button>
            )}
          </div>
          <BeatBar elapsed={elapsed} duration={beatLen || DRAW_PACE_MS.telephoneText} className="w-full max-w-xs" />
        </div>
      )}
    </>
  )
}
