import { Check, Crown, Pencil, Trophy, Users, Vote } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import type { Reaction } from "@/lib/reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { DRAW_PACE_MS, type PublicDrawVoteState, type PublicGameState, type Stroke } from "../../../../party/drawing"
import { GLASS, GlassButton, PartyTable, TableTopBar, TimerRing, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar } from "../party-shell/SeatRing"
import type { ScoreRow } from "../party-shell/Scoreboard"
import { Canvas, DrawingView, type DrawTool } from "./Canvas"
import { Toolbar } from "./Toolbar"
import { BeatBar, DockPanel, Easel, GameOverOverlay, STUDIO_BG, SeatColumn, fitSheet, type SeatRowData } from "./studio"

interface DrawVoteGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  clockOffset: number
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onStroke: (stroke: Stroke) => void
  onUndo: () => void
  onClear: () => void
  onSubmit: () => void
  onVote: (entryId: string) => void
  onNext: () => void
  onRestart: () => void
  onLeave: () => void
}

const SIDE_W = 230
/** Inside a reveal beat: the frame lands, then the artist, then the votes one by one. */
const ARTIST_AT_MS = 600
const CHIPS_AT_MS = 1000
const CHIP_STAGGER_MS = 220

type Entry = PublicDrawVoteState["entries"][number]

export function DrawVoteGame(props: DrawVoteGameProps) {
  const { gameState: state, playerId, connected } = props
  const round = state.drawVote
  const me = state.players[playerId]
  const over = state.status === "finished"
  const phase = round?.phase
  const reveal = round?.reveal ?? null
  const revealing = phase === "results" && Boolean(reveal) && !reveal!.done
  const done = phase === "results" && !revealing

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const compact = box.w < 640 || box.h < 560
  const [playersOpen, setPlayersOpen] = useState(false)
  const [resultsHidden, setResultsHidden] = useState(false)
  const [color, setColor] = useState("#111111")
  const [size, setSize] = useState(8)
  const [tool, setTool] = useState<DrawTool>("pen")
  const [selection, setSelection] = useState<{ round: number; id: string | null }>({ round: 0, id: null })
  const picked = selection.round === state.roundNumber ? selection.id : null

  const now = useNow(phase === "drawing" || phase === "voting" || revealing, 200) + props.clockOffset
  const secondsLeft = round?.deadline && !over ? Math.max(0, Math.ceil((round.deadline - now) / 1000)) : null
  const elapsed = state.beatStartedAt ? now - state.beatStartedAt : Infinity

  const entryById = new Map((round?.entries ?? []).map((entry) => [entry.id, entry]))
  const currentEntry = revealing && reveal && reveal.step < reveal.order.length ? entryById.get(reveal.order[reveal.step]!) : undefined
  const mostVotes = Math.max(0, ...(round?.entries ?? []).map((entry) => entry.votes ?? 0))
  const winners = (round?.entries ?? []).filter((entry) => mostVotes > 0 && entry.votes === mostVotes)

  useSoundCue(phase === "drawing" ? `d${state.roundNumber}` : null, () => playSound("turn"))
  useSoundCue(secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 0 && !done ? `t${phase}:${secondsLeft}` : null, () => playSound("tick"))
  useSoundCue(phase === "voting" && round?.votedCount ? `v${state.roundNumber}:${round.votedCount}` : null, () => playSound("lockin"))
  useSoundCue(currentEntry ? `e${state.beatSeq}` : null, () => {
    playSound("flip")
    for (let i = 0; i < (currentEntry?.votes ?? 0); i++) playSound("chip", CHIPS_AT_MS + i * CHIP_STAGGER_MS + 300)
  })
  useSoundCue(reveal?.spotlight ? `s${state.beatSeq}` : null, () => playSound("group"))
  useSoundCue(done && !over ? `done${state.roundNumber}` : null, () => playSound("roundEnd"))
  useSoundCue(over ? `over${state.roundNumber}` : null, () => playSound("win"))

  // ─── Layout ──────────────────────────────────────────────────────────────
  const top = 68
  const left = wide ? 12 + SIDE_W + 12 : 12
  const areaW = Math.max(0, box.w - left - 12)
  const areaH = Math.max(0, box.h - top - 12)

  const players = useMemo(() => Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt), [state.players])
  const seatRows: SeatRowData[] = players.map((player) => {
    const ready = round?.submittedIds.includes(player.id)
    return {
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.connected !== false,
      isHost: player.id === state.hostId,
      badge: phase === "drawing" ? (
        ready
          ? <span className="uno-tag flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-400 px-1.5 py-px text-[9px] font-black text-emerald-950"><Check className="size-2.5" strokeWidth={3} />Ready</span>
          : <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-px text-[9px] font-bold uppercase text-white/55"><Pencil className="size-2.5" />Drawing</span>
      ) : null,
      gain: done && !over ? state.roundGains[player.id] : undefined,
      glow: reveal?.spotlight && winners.some((entry) => entry.authorId === player.id) ? "#fbbf24" : currentEntry?.authorId === player.id && elapsed >= ARTIST_AT_MS ? "#fde68a" : null,
    }
  })
  const seats = <SeatColumn rows={seatRows} meId={playerId} bubbles={props.reactions} floatKey={`${state.beatSeq}`} />

  const status = (
    <>
      <Vote className="size-4 shrink-0 text-amber-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{over ? "Final scores" : `Round ${state.roundNumber} / ${state.totalRounds}`}</p>
        <p className="truncate text-[11px] text-white/60">
          {phase === "drawing" ? `Everyone draws · ${round?.submittedCount ?? 0} / ${round?.participantCount ?? 0} ready`
            : phase === "voting" ? `Anonymous vote · ${round?.votedCount ?? 0} cast`
              : revealing ? (reveal?.spotlight ? "Round favourite" : "The artists revealed") : over ? "The gallery" : "Round results"}
        </p>
      </div>
      {secondsLeft !== null && round?.deadline && <TimerRing left={secondsLeft} limit={phase === "voting" ? 30 : state.roundTimeLimit} />}
    </>
  )

  const scoreRows: ScoreRow[] = players.map((player) => ({ id: player.id, name: player.name, score: player.score }))
  const topScore = Math.max(0, ...scoreRows.map((row) => row.score))
  const leaders = scoreRows.filter((row) => row.score === topScore)
  const title = topScore === 0
    ? "No points this game"
    : leaders.some((row) => row.id === playerId)
      ? leaders.length > 1 ? "You share the win!" : "You win!"
      : `${leaders.map((row) => row.name).join(" & ")} ${leaders.length > 1 ? "share the win" : "wins"}`

  const rounds = [...new Set(state.gallery.map((item) => item.round))]

  return (
    <PartyTable tableRef={tableRef} background={STUDIO_BG}>
      <TableTopBar
        title="Draw & Vote"
        roomLabel={props.roomLabel}
        onLeave={props.onLeave}
        connected={connected}
        status={status}
        onReact={props.onReact}
        canReact={Boolean(me)}
        actions={!wide && <GlassButton icon={<Users className="size-4" />} label="Players" pressed={playersOpen} onClick={() => setPlayersOpen(!playersOpen)} />}
      />

      {props.error && connected && (
        <p className="uno-rise absolute left-1/2 top-[64px] z-40 -translate-x-1/2 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-semibold shadow-lg">{props.error}</p>
      )}

      {box.w > 0 && round && (
        <div className="absolute flex flex-col items-center justify-center gap-3" style={{ left, top, width: areaW, height: areaH }}>
          <div className={cn(GLASS, "flex max-w-full shrink-0 items-center gap-3 px-4")} style={{ height: compact ? 46 : 56 }}>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
              {phase === "drawing" ? "Everyone draws" : "The prompt"}
            </span>
            <span key={state.roundNumber} className={cn("draw-word truncate font-black uppercase tracking-wider text-amber-100", compact ? "text-lg" : "text-2xl")}>{state.currentWord}</span>
          </div>

          {phase === "drawing" && (
            <DrawingPhase
              round={round}
              roundNumber={state.roundNumber}
              areaW={areaW}
              areaH={areaH - (compact ? 46 : 56) - 12}
              compact={compact}
              editable={!round.submitted && connected && secondsLeft !== 0}
              color={color}
              size={size}
              tool={tool}
              setColor={setColor}
              setSize={setSize}
              setTool={setTool}
              {...props}
            />
          )}

          {phase === "voting" && (
            <>
              <WallGrid
                entries={round.entries}
                areaW={areaW}
                areaH={areaH - (compact ? 46 : 56) - 12 - 60}
                renderLabel={(entry, index) => (
                  <span className="flex items-center justify-between gap-2 px-1 pt-1.5 text-xs">
                    <span className="font-bold">#{index + 1}</span>
                    {entry.isOwn && <span className="rounded-full bg-white/15 px-1.5 text-[10px] font-bold uppercase">Yours</span>}
                    {round.selectedEntryId === entry.id && <span className="flex items-center gap-0.5 font-bold text-emerald-300"><Check className="size-3" />Your vote</span>}
                  </span>
                )}
                selectedId={round.selectedEntryId ?? picked}
                onSelect={round.canVote && connected ? (entry) => !entry.isOwn && setSelection({ round: state.roundNumber, id: entry.id }) : undefined}
              />
              <div className="flex h-12 shrink-0 items-center">
                {round.canVote ? (
                  <button
                    type="button"
                    disabled={!picked || !connected || secondsLeft === 0}
                    onClick={() => picked && props.onVote(picked)}
                    className="uno-rise flex h-12 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:bg-white/20 disabled:text-white/70"
                  >
                    <Vote className="size-4" /> {picked ? "Lock in vote" : "Tap your favourite"}
                  </button>
                ) : (
                  <p className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold")}>
                    <Check className="size-4 text-emerald-300" />
                    {round.selectedEntryId ? "Vote locked in · waiting for the reveal" : "No drawing to vote for · waiting for the reveal"}
                  </p>
                )}
              </div>
            </>
          )}

          {revealing && reveal && (
            reveal.spotlight ? (
              <Spotlight key={state.beatSeq} winners={winners} areaW={areaW} areaH={areaH - (compact ? 46 : 56) - 12} playerId={playerId} />
            ) : currentEntry ? (
              <EntryReveal
                key={state.beatSeq}
                entry={currentEntry}
                earlier={reveal.order.slice(0, reveal.step).flatMap((id) => entryById.get(id) ?? [])}
                areaW={areaW}
                areaH={areaH - (compact ? 46 : 56) - 12}
                compact={compact}
                elapsed={elapsed}
                playerId={playerId}
              />
            ) : null
          )}

          {done && (
            <>
              {round.entries.length === 0 ? (
                <p className={cn(GLASS, "px-6 py-8 text-center text-sm text-white/60")}>No drawings this round. No points awarded.</p>
              ) : (
                <WallGrid
                  entries={round.entries}
                  areaW={areaW}
                  areaH={areaH - (compact ? 46 : 56) - 12 - 60}
                  highlightIds={winners.map((entry) => entry.id)}
                  renderLabel={(entry) => (
                    <span className="flex items-center justify-between gap-2 px-1 pt-1.5 text-xs">
                      <span className="flex min-w-0 items-center gap-1 font-bold">
                        {winners.includes(entry) && <Crown className="size-3 shrink-0 fill-amber-300 text-amber-400" />}
                        <span className="truncate">{entry.isOwn ? "You" : entry.authorName}</span>
                      </span>
                      <span className="shrink-0 font-mono text-white/70">{entry.votes} vote{entry.votes === 1 ? "" : "s"}</span>
                    </span>
                  )}
                />
              )}
              <div className="flex h-12 shrink-0 items-center">
                {over ? null : props.isHost ? (
                  <button type="button" onClick={props.onNext} disabled={!connected} className="uno-rise h-12 rounded-2xl bg-amber-300 px-6 text-sm font-black text-amber-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:opacity-50">
                    Next round
                  </button>
                ) : (
                  <p className={cn(GLASS, "flex h-11 items-center px-4 text-sm text-white/70")}>Waiting for the host…</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {wide ? (
        <DockPanel title="Artists" icon={<Users className="size-3.5 text-white/60" />} className="absolute left-3 top-[68px] z-20 max-h-[calc(100%-80px)]" style={{ width: SIDE_W }}>
          {seats}
        </DockPanel>
      ) : playersOpen && (
        <DockPanel title="Artists" icon={<Users className="size-3.5 text-white/60" />} onClose={() => setPlayersOpen(false)} className="uno-rise absolute left-3 top-[68px] z-40 max-h-[calc(100%-80px)] w-[min(280px,calc(100%-24px))] bg-[#14110e]/95">
          {seats}
        </DockPanel>
      )}

      {over && resultsHidden && (
        <button type="button" onClick={() => setResultsHidden(false)} className={cn(GLASS, "absolute bottom-3 left-1/2 z-40 flex h-11 -translate-x-1/2 items-center gap-2 px-4 text-sm font-semibold hover:bg-black/65")}>
          <Trophy className="size-4 text-amber-300" /> Show results
        </button>
      )}
      {over && !resultsHidden && (
        <GameOverOverlay
          title={title}
          subtitle={`${state.totalRounds} prompt${state.totalRounds === 1 ? "" : "s"} · ${state.gallery.length} drawings`}
          rows={scoreRows}
          meId={playerId}
          groups={rounds.map((number) => {
            const items = state.gallery.filter((item) => item.round === number)
            return {
              title: `Round ${number} · “${items[0]?.word ?? ""}”`,
              items: items.map((item) => ({
                id: item.id,
                strokes: item.strokes,
                title: item.artistId === playerId ? "Your drawing" : `${item.artistName}'s ${item.word}`,
                artistId: item.artistId,
                artistName: item.artistId === playerId ? "You" : item.artistName,
                caption: `${item.votes ?? 0} vote${item.votes === 1 ? "" : "s"}`,
              })),
            }
          })}
          isHost={props.isHost}
          onRestart={props.onRestart}
          onHide={() => setResultsHidden(true)}
          onLeave={props.onLeave}
        />
      )}
    </PartyTable>
  )
}

function DrawingPhase({ round, roundNumber, areaW, areaH, compact, editable, color, size, tool, setColor, setSize, setTool, onStroke, onUndo, onClear, onSubmit }: DrawVoteGameProps & {
  round: PublicDrawVoteState
  roundNumber: number
  areaW: number
  areaH: number
  compact: boolean
  editable: boolean
  color: string
  size: number
  tool: DrawTool
  setColor: (color: string) => void
  setSize: (size: number) => void
  setTool: (tool: DrawTool) => void
}) {
  const paletteH = round.submitted ? 0 : compact ? 58 : 70
  const sheet = fitSheet(areaW - 8, areaH - 34 - (paletteH ? paletteH + 12 : 0) - 60)
  return (
    <>
      <Easel
        width={sheet.width}
        overlay={round.submitted && (
          <span className="party-stamp pointer-events-none absolute left-1/2 top-1/2 rounded-lg border-4 border-emerald-500 bg-white/85 px-4 py-1.5 text-xl font-black uppercase tracking-wider text-emerald-600 shadow-lg">
            Locked in
          </span>
        )}
      >
        <Canvas key={roundNumber} strokes={round.draft} revision={round.draftRevision} isDrawer={editable} disabled={!editable} onStroke={onStroke} color={color} size={size} tool={tool} />
      </Easel>
      {!round.submitted && (
        <Toolbar
          selectedColor={color}
          selectedSize={size}
          tool={tool}
          onColorChange={setColor}
          onSizeChange={setSize}
          onToolChange={setTool}
          onClear={onClear}
          onUndo={onUndo}
          canUndo={round.draft.length > 0}
          disabled={!editable}
          compact={compact}
        />
      )}
      <div className="flex h-12 shrink-0 items-center">
        {round.submitted ? (
          <p className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold")}>
            <Check className="size-4 text-emerald-300" /> Waiting for the other artists… {round.submittedCount} / {round.participantCount}
          </p>
        ) : (
          <button type="button" onClick={onSubmit} disabled={!editable} className="h-12 rounded-2xl bg-amber-300 px-6 text-sm font-black text-amber-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:opacity-50">
            {round.draft.length ? "Submit drawing" : "Skip drawing"}
          </button>
        )}
      </div>
    </>
  )
}

/** Framed drawings hung on the studio wall. */
function WallGrid({ entries, areaW, areaH, selectedId, highlightIds, onSelect, renderLabel }: {
  entries: Entry[]
  areaW: number
  areaH: number
  selectedId?: string | null
  highlightIds?: string[]
  onSelect?: (entry: Entry) => void
  renderLabel: (entry: Entry, index: number) => ReactNode
}) {
  // Pick the column count that gives the largest frames inside the area.
  const count = Math.max(1, entries.length)
  let best = { cols: 1, w: 0 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const w = Math.min((areaW - (cols - 1) * 14) / cols, ((areaH - (rows - 1) * 14) / rows - 28) * 1.5)
    if (w > best.w) best = { cols, w }
  }
  const frameW = Math.max(120, Math.min(420, best.w))
  return (
    <div className="flex min-h-0 max-w-full flex-1 flex-wrap content-center items-start justify-center gap-3.5 overflow-y-auto" style={{ width: areaW }}>
      {entries.map((entry, index) => {
        const selected = selectedId === entry.id
        const highlight = highlightIds?.includes(entry.id)
        const clickable = Boolean(onSelect) && !entry.isOwn
        return (
          <button
            key={entry.id}
            type="button"
            disabled={!clickable}
            aria-pressed={selected}
            aria-label={`Drawing ${index + 1}`}
            onClick={() => onSelect?.(entry)}
            className={cn("uno-pop shrink-0 text-left transition", clickable && "hover:-translate-y-1", entry.isOwn && onSelect && "opacity-70")}
            style={{ width: frameW, animationDelay: `${index * 70}ms` }}
          >
            <span
              className="block rounded-[4px] bg-[#3b2410] p-1.5 transition-shadow"
              style={{ boxShadow: selected ? "0 0 0 3px #fff, 0 0 30px rgb(255 255 255 / .5)" : highlight ? "0 0 0 3px #fbbf24, 0 0 30px rgb(251 191 36 / .5)" : "0 12px 26px rgb(0 0 0 / .55)" }}
            >
              <span className="block overflow-hidden rounded-[2px]">
                <DrawingView strokes={entry.strokes} resolution={0.4} className="aspect-[3/2] h-auto" />
              </span>
            </span>
            {renderLabel(entry, index)}
          </button>
        )
      })}
    </div>
  )
}

function VoteChips({ votes, startAt }: { votes: number; startAt: number }) {
  return (
    <span className="flex flex-wrap justify-center gap-1.5">
      {Array.from({ length: votes }, (_, index) => (
        <span
          key={index}
          className="draw-chip grid size-8 place-items-center rounded-full border-[3px] border-dashed border-white/90 bg-rose-500 text-[10px] font-black shadow-[0_4px_10px_rgb(0_0_0/.5)]"
          style={{ animationDelay: `${startAt + index * CHIP_STAGGER_MS}ms` }}
        >
          <Vote className="size-3.5" />
        </span>
      ))}
    </span>
  )
}

/** One drawing at a time: the frame lands, the artist is named, the votes drop in. */
function EntryReveal({ entry, earlier, areaW, areaH, compact, elapsed, playerId }: {
  entry: Entry
  earlier: Entry[]
  areaW: number
  areaH: number
  compact: boolean
  elapsed: number
  playerId: string
}) {
  const stripH = earlier.length && !compact ? 86 : 0
  const sheet = fitSheet(Math.min(areaW - 8, 860), areaH - 34 - 46 - 44 - (stripH ? stripH + 12 : 0) - 24)
  const artist = entry.authorId === playerId ? "You" : entry.authorName
  // Fixed at mount: someone joining mid-beat sees the chips land straight away.
  const [chipDelay] = useState(() => Math.max(0, CHIPS_AT_MS - Math.min(elapsed, CHIPS_AT_MS)))
  return (
    <>
      <div className="uno-pop">
        <Easel width={sheet.width}>
          <DrawingView strokes={entry.strokes} />
        </Easel>
      </div>
      <div className="flex h-11 shrink-0 items-center gap-2 opacity-0" style={{ animation: `uno-pop 420ms cubic-bezier(.2,.8,.2,1) ${ARTIST_AT_MS}ms both` }}>
        {entry.authorId && <PartyAvatar id={entry.authorId} name={entry.authorName ?? "?"} size={30} style={{ boxShadow: "0 0 0 2px #fde68a" }} />}
        <span className="text-lg font-black">{artist}</span>
        <span className="text-sm text-white/60">· {entry.votes} vote{entry.votes === 1 ? "" : "s"}</span>
      </div>
      <div className="flex min-h-[44px] shrink-0 items-center">
        {entry.votes ? <VoteChips votes={entry.votes} startAt={chipDelay} /> : (
          <span className="text-sm text-white/45 opacity-0" style={{ animation: `uno-fade-in 300ms ease-out ${CHIPS_AT_MS}ms both` }}>No votes this time</span>
        )}
      </div>
      {stripH > 0 && (
        <ol className="flex max-w-full shrink-0 gap-2 overflow-x-auto" style={{ height: stripH }}>
          {earlier.map((item) => (
            <li key={item.id} className="w-24 shrink-0 text-center">
              <span className="block h-16 overflow-hidden rounded shadow">
                <DrawingView strokes={item.strokes} resolution={0.2} />
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-white/60">{item.authorId === playerId ? "You" : item.authorName} · {item.votes}</span>
            </li>
          ))}
        </ol>
      )}
      <BeatBar elapsed={elapsed} duration={DRAW_PACE_MS.voteEntry} className="w-full max-w-xs shrink-0" />
    </>
  )
}

function Spotlight({ winners, areaW, areaH, playerId }: { winners: Entry[]; areaW: number; areaH: number; playerId: string }) {
  const across = Math.min(winners.length, 3)
  const sheet = fitSheet(Math.min((areaW - 8 - (across - 1) * 20) / Math.max(1, across), 760), areaH - 34 - 90 - 20)
  const names = winners.map((entry) => (entry.authorId === playerId ? "You" : entry.authorName)).join(" & ")
  return (
    <>
      <div className="flex max-w-full flex-wrap items-end justify-center gap-5">
        {winners.map((entry, index) => (
          <div key={entry.id} className="uno-pop relative" style={{ animationDelay: `${index * 150}ms` }}>
            <Crown className="absolute -top-9 left-1/2 z-10 size-10 -translate-x-1/2 fill-amber-300 text-amber-500 drop-shadow-[0_0_16px_rgb(251_191_36/.8)]" />
            <Easel width={sheet.width} glow="rgb(251 191 36 / .75)">
              <DrawingView strokes={entry.strokes} />
            </Easel>
          </div>
        ))}
      </div>
      <div className="uno-pop text-center" style={{ animationDelay: "400ms" }}>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-300">Round favourite</p>
        <p className="text-2xl font-black">{names}</p>
        <p className="text-sm text-white/65">+{winners[0]?.votes ?? 0} point{winners[0]?.votes === 1 ? "" : "s"}</p>
      </div>
    </>
  )
}
