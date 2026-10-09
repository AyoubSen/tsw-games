import { Brain, Check, Flame, Hourglass, LogOut, Mic, RotateCcw, ScrollText, SkipForward, Trophy, Vote, X } from "lucide-react"
import { useMemo, useState } from "react"
import type { Reaction } from "@/lib/reactions"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { GLASS, GlassButton, PartyTable, SidePanel, TableTopBar, TimerRing, useBeat, useElementSize, useNow, useSoundCue } from "../party-shell/shell"
import { PartyAvatar, Seat, SeatChip, ringLayout, viewerFirst } from "../party-shell/SeatRing"
import { PromptCard } from "../party-shell/PromptStage"
import { Podium, Scoreboard, type ScoreRow } from "../party-shell/Scoreboard"
import { POSITIONS, POSITION_LIST, Spectrum, SplitChart, hiveMind, marksOf, mostControversial, slotOf, type SpectrumGeometry } from "./spectrum"
import {
  REVEAL_MS, flyDuration, flyOrder,
  type HotTakePlayer, type HotTakePosition, type PublicHotTakeGameState, type RoundSummary,
} from "../../../../party/hot-take-arena"

export interface HotTakeGameProps {
  state: PublicHotTakeGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onVote: (position: HotTakePosition) => void
  onSkipSpotlight: () => void
  onNextRound: () => void
  onRestart: () => void
  onLeave: () => void
}

const TABLE_BG = "radial-gradient(ellipse at 50% 42%, #2b1d3c 0%, #170f22 52%, #08060d 100%)"
/**
 * Inside the fly beat (REVEAL_MS.flyStep apart, REVEAL_MS.flyLand after the
 * last): take-off waits one frame so each avatar starts from its seat, and a
 * flight lands before the next position lifts off.
 */
const LIFT_MS = 120
const FLIGHT_MS = 700
/** Score beat: groups light up one after another, in landing order. */
const LIGHT_STAGGER_MS = 260

const STAGE_LINE = {
  tension: "Votes are in…",
  fly: "Where everyone landed",
  score: "Groups score",
  spotlight: "Spotlight",
  done: "Round over",
} as const

export function HotTakeGame(props: HotTakeGameProps) {
  const { state, playerId, isHost, connected, reactions } = props
  const me = state.players[playerId] as HotTakePlayer | undefined
  const voting = state.status === "voting"
  const over = state.status === "finished"
  const reveal = state.status === "reveal" ? state.reveal : null
  const stage = reveal?.stage ?? null
  /** Avatars are on the spectrum (or flying to it). */
  const landed = over || (stage !== null && stage !== "tension")
  /** Groups have scored. */
  const lit = over || stage === "score" || stage === "spotlight" || stage === "done"

  const [tableRef, box] = useElementSize<HTMLDivElement>()
  const wide = box.w >= 1024
  const [scoresPref, setScoresPref] = useState<boolean | null>(null)
  const scoresOpen = scoresPref ?? wide
  const [logOpen, setLogOpen] = useState(false)
  const [logSeen, setLogSeen] = useState(0)
  const [resultsHidden, setResultsHidden] = useState(false)

  // The unsent choice and my locked pick live only here, per round.
  const roundKey = `${state.startedAt}:${state.roundNumber}`
  const [pickState, setPickState] = useState<{ key: string; choice: HotTakePosition | null; locked: HotTakePosition | null }>({ key: "", choice: null, locked: null })
  const picks = pickState.key === roundKey ? pickState : { key: roundKey, choice: null, locked: null }
  const iVoted = state.submittedPlayerIds.includes(playerId)
  const canVote = voting && Boolean(me) && !iVoted && connected
  const voteOf = new Map(state.revealedVotes.map((vote) => [vote.playerId, vote.position]))
  const myPick = voteOf.get(playerId) ?? (iVoted ? picks.locked : null)

  const limit = state.settings.roundTimeLimit
  const now = useNow(voting)
  const secondsLeft = voting && state.roundStartedAt ? Math.max(0, Math.ceil((state.roundStartedAt + limit * 1000 - now) / 1000)) : null

  // ─── Reveal beat, replayed locally from the server's pacing ─────────────
  const order = useMemo(() => flyOrder(state.voteGroups), [state.voteGroups])
  const beatLen = stage === "tension" ? REVEAL_MS.tension
    : stage === "fly" ? flyDuration(state.voteGroups)
    : stage === "score" ? REVEAL_MS.score
    : stage === "spotlight" ? REVEAL_MS.spotlight
    : 0
  const elapsed = useBeat(reveal ? `${reveal.seq}` : null, beatLen, stage === "fly" ? 90 : stage === "spotlight" ? 250 : 0)
  const departed = (position: HotTakePosition) =>
    landed && (stage !== "fly" || elapsed >= LIFT_MS + order.indexOf(position) * REVEAL_MS.flyStep)
  /** A spot's count shows once its avatars have touched down. */
  const arrived = (position: HotTakePosition) =>
    landed && (stage !== "fly" || elapsed >= LIFT_MS + order.indexOf(position) * REVEAL_MS.flyStep + FLIGHT_MS)

  const scoring = state.voteGroups.some((group) => group.points > 0)
  const loners = state.voteGroups.some((group) => group.playerIds.length === 1)
  useSoundCue(voting && state.submittedPlayerIds.length ? `${roundKey}:${state.submittedPlayerIds.length}` : null, () => playSound("lockin"))
  useSoundCue(reveal ? `${reveal.seq}:${reveal.stage}` : over ? `over:${state.finishedAt}` : null, () => {
    if (over) return playSound("win")
    if (stage === "fly") order.forEach((_, i) => playSound("whoosh", LIFT_MS + i * REVEAL_MS.flyStep))
    else if (stage === "score") {
      if (scoring) playSound("group")
      if (loners) playSound("lonewolf", 650)
    } else if (stage === "spotlight") playSound("turn")
    else if (stage === "done") playSound("roundEnd")
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
  const specW = Math.min(860, innerW)
  const promptW = Math.min(640, compact ? Math.max(220, innerW + 24) : 1.55 * rx - seatW)
  const promptY = cy - ry * 0.5
  const promptHalf = compact ? 54 : 74
  const barH = compact ? 46 : 58
  const tok = compact ? 24 : 32
  const specY = cy + ry * 0.3
  const geometry: SpectrumGeometry = {
    left: cx - specW / 2, width: specW, y: specY, barH, tok,
    stackH: Math.max(tok, specY - barH / 2 - 16 - (promptY + promptHalf)),
  }
  const groupOf = (id: string) => state.voteGroups.find((group) => group.playerIds.includes(id))
  const slotFor = (id: string) => {
    const group = groupOf(id)
    return group ? slotOf(geometry, group.position, group.playerIds.indexOf(id), group.playerIds.length) : null
  }

  // ─── Spotlight ───────────────────────────────────────────────────────────
  const spotId = stage === "spotlight" ? reveal?.spotlightId ?? null : null
  const spotPlayer = spotId ? state.players[spotId] : undefined
  const spotPos = spotId ? voteOf.get(spotId) : undefined
  const spotAt = spotId ? slotFor(spotId) : null
  const spotLeft = Math.max(0, Math.ceil((REVEAL_MS.spotlight - elapsed) / 1000))

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
      <Vote className="size-4 shrink-0 text-fuchsia-200" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">
          {over ? "Final scores" : `Round ${state.roundNumber} / ${state.settings.rounds}`}
        </p>
        <p className="truncate text-[11px] text-white/60">
          {voting ? `${state.submittedPlayerIds.length} / ${players.length} locked in` : stage ? STAGE_LINE[stage] : over ? `${history.length} takes argued` : ""}
        </p>
      </div>
      {secondsLeft !== null && <TimerRing left={secondsLeft} limit={limit} />}
    </>
  )

  return (
    <PartyTable tableRef={tableRef} background={TABLE_BG} className="min-h-[560px]">
      {/* Stage light. */}
      <div aria-hidden="true" className="pointer-events-none absolute rounded-[50%] bg-fuchsia-300/[.06] blur-2xl" style={{ left: cx - rx * 0.9, top: cy - ry * 0.75, width: rx * 1.8, height: ry * 1.5 }} />

      <TableTopBar
        title="Hot Take Arena"
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
              eyebrow={`Hot take #${state.roundNumber}`}
              tag={state.prompt.pack}
              text={state.prompt.text}
              compact={compact}
              style={{ left: cx, top: promptY, width: promptW }}
            />
          )}

          <Spectrum
            geometry={geometry}
            compact={compact}
            interactive={canVote}
            choice={canVote ? picks.choice : null}
            myPick={myPick}
            marks={landed ? marksOf(state.voteGroups.filter((group) => arrived(group.position)), order) : null}
            lit={lit}
            onChoose={(position) => setPickState({ ...picks, choice: position })}
          />

          {stage === "tension" && (
            <p
              className="uno-pop pointer-events-none absolute z-[7] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-black uppercase tracking-[0.3em] text-white/90 drop-shadow-[0_0_18px_rgb(232_121_249/.8)]"
              style={{ left: cx, top: geometry.y - barH / 2 - 8 - geometry.stackH / 2, fontSize: compact ? 14 : 20 }}
            >
              <span className="animate-pulse">The room has spoken</span>
            </p>
          )}

          {seatOrder.map((id) => {
            const player = state.players[id]
            const seat = ring.seats[id]
            if (!player || !seat) return null
            const position = voteOf.get(id)
            const group = groupOf(id)
            const submitted = state.submittedPlayerIds.includes(id)
            const chip = voting || stage === "tension"
              ? submitted
                ? <SeatChip tone="done"><Check className="size-2.5" />Locked in</SeatChip>
                : <SeatChip tone="waiting">{voting ? "Thinking…" : "No vote"}</SeatChip>
              : (reveal || over) && !position
                ? <SeatChip tone="waiting">No vote</SeatChip>
                : null
            const delay = group ? order.indexOf(group.position) * LIGHT_STAGGER_MS : 0
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
                ghost={Boolean(position && group && departed(position))}
                chip={chip}
                score={player.score}
                glow={spotId === id ? "#fbbf24" : null}
                bubble={reactions[id]}
                bubbleSide={seat.y < cy - ry * 0.3 ? "bottom" : "top"}
              >
                {stage === "score" && group && group.points > 0 && (
                  <span
                    className="party-float pointer-events-none absolute bottom-full left-1/2 z-20 rounded-full bg-emerald-400 px-2 py-0.5 text-sm font-black text-emerald-950 shadow-lg"
                    style={{ animationDelay: `${delay + 300}ms` }}
                  >
                    +{group.points}
                  </span>
                )}
                {lit && !over && group?.playerIds.length === 1 && (
                  <span
                    className="party-stamp pointer-events-none absolute left-1/2 top-1/2 z-20 whitespace-nowrap rounded-md border-2 border-rose-400 bg-rose-950/85 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-200 shadow-lg"
                    style={{ animationDelay: `${delay + 300}ms` }}
                  >
                    Lone wolf · 0
                  </span>
                )}
              </Seat>
            )
          })}

          {/* Avatars that fly to their spot on the spectrum. */}
          {landed && state.voteGroups.flatMap((group) => group.playerIds.map((id) => {
            const player = state.players[id]
            const seat = ring.seats[id]
            const slot = slotFor(id)
            if (!player || !seat || !slot) return null
            const away = departed(group.position)
            const at = away ? slot : seat
            const spot = spotId === id
            const ringHex = lit && away ? (group.points ? POSITIONS[group.position].hex : "#f43f5e") : null
            return (
              <div
                key={id}
                title={`${player.name}: ${POSITIONS[group.position].label}`}
                className={cn("pointer-events-auto absolute left-0 top-0", spot ? "z-[26]" : "z-20")}
                style={{
                  width: avatar,
                  height: avatar,
                  transform: `translate(${at.x - avatar / 2}px, ${at.y - avatar / 2}px) scale(${away ? tok / avatar : 1})`,
                  transition: `transform ${FLIGHT_MS}ms cubic-bezier(.3,.75,.2,1)`,
                }}
              >
                <PartyAvatar
                  id={id}
                  name={player.name}
                  size={avatar}
                  className={cn("transition-shadow duration-500", id === playerId && "ring-white")}
                  style={ringHex ? { boxShadow: `0 0 0 ${(3 * avatar) / tok}px ${ringHex}${spot ? `, 0 0 ${avatar}px #fbbf24` : ""}`, transitionDelay: `${order.indexOf(group.position) * LIGHT_STAGGER_MS}ms` } : undefined}
                />
              </div>
            )
          }))}

          {/* Spotlight: the room dims around the player defending their take. */}
          {spotId && spotAt && (
            <div
              aria-hidden="true"
              className="uno-fade-in pointer-events-none absolute inset-0 z-[25]"
              style={{ background: `radial-gradient(circle at ${spotAt.x}px ${spotAt.y}px, transparent ${tok * 0.9}px, rgb(4 2 8 / .78) ${tok * 3.2}px)` }}
            />
          )}
          {spotId && spotPlayer && spotPos && (
            <div
              role="status"
              className={cn(GLASS, "uno-pop absolute z-30 -translate-x-1/2 -translate-y-1/2 border-amber-300/40 bg-[#140d05]/85 px-5 py-4 text-center")}
              style={{ left: cx, top: promptY, width: Math.min(440, promptW) }}
            >
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-amber-300">
                <Mic className="size-3.5" /> Defend your take
              </p>
              <div className="mt-2 flex items-center justify-center gap-3">
                <PartyAvatar id={spotPlayer.id} name={spotPlayer.name} size={compact ? 36 : 44} style={{ boxShadow: "0 0 0 3px #fbbf24" }} />
                <div className="min-w-0 text-left">
                  <p className="truncate text-lg font-black leading-tight">{spotId === playerId ? "You're up!" : spotPlayer.name}</p>
                  <p className="text-xs text-white/70">
                    {reveal?.spotlightReason === "lone-wolf" ? "Lone wolf" : "Most extreme take"} · <span className="font-bold" style={{ color: POSITIONS[spotPos].hex }}>{POSITIONS[spotPos].glyph}</span> {POSITIONS[spotPos].label}
                  </p>
                </div>
                <span className="ml-1 font-mono text-3xl font-black tabular-nums text-amber-200">{spotLeft}</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-amber-300 transition-[width] duration-300 ease-linear" style={{ width: `${Math.max(0, 1 - elapsed / REVEAL_MS.spotlight) * 100}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-white/55">{spotId === playerId ? "Say it out loud — convince the room." : "Out loud — let them make their case."}</p>
              {isHost && (
                <button type="button" onClick={props.onSkipSpotlight} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold transition hover:bg-white/20">
                  <SkipForward className="size-3.5" /> Skip
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Action dock. */}
      <div className="absolute bottom-3 z-30 flex -translate-x-1/2 justify-center" style={{ left: box.w ? cx : "50%" }}>
        {voting && me && !iVoted && (
          <button
            type="button"
            disabled={!picks.choice || !connected}
            onClick={() => {
              if (!picks.choice) return
              setPickState({ ...picks, locked: picks.choice })
              props.onVote(picks.choice)
            }}
            className="uno-rise h-12 whitespace-nowrap rounded-2xl bg-white px-6 text-sm font-black text-black shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/70 disabled:hover:scale-100"
          >
            {picks.choice ? `Lock in · ${POSITIONS[picks.choice].label}` : "Tap a spot on the scale"}
          </button>
        )}
        {voting && iVoted && (
          <p className={cn(GLASS, "uno-rise flex h-11 items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold")}>
            <Check className="size-4 text-emerald-300" /> Locked in · waiting for {players.length - state.submittedPlayerIds.length} more
          </p>
        )}
        {stage === "tension" && (
          <p className={cn(GLASS, "flex h-11 items-center gap-2 px-4 text-sm font-semibold")}>
            <Hourglass className="size-4 animate-pulse text-fuchsia-200" /> Revealing…
          </p>
        )}
        {stage === "done" && (isHost ? (
          <button
            type="button"
            onClick={props.onNextRound}
            disabled={!connected}
            className="uno-rise h-12 whitespace-nowrap rounded-2xl bg-fuchsia-400 px-6 text-sm font-black text-fuchsia-950 shadow-[0_10px_30px_rgb(0_0_0/.5)] transition hover:scale-[1.03] disabled:opacity-50"
          >
            {state.roundNumber >= state.settings.rounds ? "Finish match" : "Next hot take"}
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
        <div className={cn(GLASS, "uno-rise absolute left-3 top-[68px] z-30 w-[220px] p-2", !wide && "bg-[#0b0712]/90")}>
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
        <SidePanel title="Round log" icon={<ScrollText className="size-4 text-fuchsia-200" />} onClose={() => setLogOpen(false)}>
          {history.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-white/50">No takes revealed yet.</p>
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

function nameOf(players: Record<string, HotTakePlayer>, id: string, meId: string) {
  return id === meId ? "You" : players[id]?.name ?? "Someone who left"
}

function LogEntry({ entry, players, meId }: { entry: RoundSummary; players: Record<string, HotTakePlayer>; meId: string }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/[.04] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Round {entry.roundNumber}</p>
      <p className="mt-1 text-sm font-semibold leading-snug">“{entry.prompt.text}”</p>
      <div className="mt-2">
        <SplitChart entry={entry} height={32} />
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {POSITION_LIST.map((position) => {
          const group = entry.voteGroups.find((candidate) => candidate.position === position)
          if (!group) return null
          const meta = POSITIONS[position]
          return (
            <li key={position} className="flex gap-2">
              <span className="w-[92px] shrink-0 font-semibold" style={{ color: meta.hex }}>{meta.glyph} {meta.label}</span>
              <span className="min-w-0 flex-1 text-white/75">
                {group.playerIds.map((id) => nameOf(players, id, meId)).join(", ")}
                <span className={cn("ml-1.5 font-bold", group.points ? "text-emerald-300" : "text-rose-300")}>
                  {group.points ? `+${group.points}` : "lone wolf"}
                </span>
              </span>
            </li>
          )
        })}
        {entry.abstainedIds.length > 0 && (
          <li className="text-white/45">No vote: {entry.abstainedIds.map((id) => nameOf(players, id, meId)).join(", ")}</li>
        )}
      </ul>
    </li>
  )
}

function GameOver({ state, rows, meId, isHost, onRestart, onHide, onLeave }: {
  state: PublicHotTakeGameState
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
    ? winners.length > 1 ? "You share the crown!" : "You read the room best!"
    : winners.length > 1 ? `Tie: ${winners.map((row) => row.name).join(" & ")}` : `${winners[0]?.name ?? "Nobody"} wins the arena`
  const controversial = mostControversial(state.history)
  const hive = hiveMind(state.history, state.players)
  const hivePlayer = hive ? state.players[hive.id] : undefined

  return (
    <div className="uno-fade-in absolute inset-0 z-40 overflow-y-auto bg-[#07050c]/80 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-amber-300" />
          <h2 className="mt-2 text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{state.history.length} hot takes · {state.settings.promptPack} pack</p>
        </div>

        <Podium rows={rows} meId={meId} />

        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: "900ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
              <Flame className="size-3.5" /> Most controversial take
            </p>
            {controversial ? (
              <>
                <p className="mt-2 text-sm font-semibold leading-snug">“{controversial.prompt.text}”</p>
                <div className="mt-3">
                  <SplitChart entry={controversial} height={36} />
                </div>
                <p className="mt-1 text-[11px] text-white/55">Round {controversial.roundNumber} split {controversial.voteGroups.length} ways</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/55">Nothing divided this room.</p>
            )}
          </div>
          <div className={cn(GLASS, "uno-pop p-4")} style={{ animationDelay: "1050ms" }}>
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-violet-300">
              <Brain className="size-3.5" /> Hive mind
            </p>
            {hive && hivePlayer ? (
              <div className="mt-3 flex items-center gap-3">
                <PartyAvatar id={hivePlayer.id} name={hivePlayer.name} size={48} style={{ boxShadow: "0 0 0 3px #a78bfa" }} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-black">{hivePlayer.id === meId ? "You" : hivePlayer.name}</p>
                  <p className="text-xs text-white/65">Landed with {Math.round(hive.share * 100)}% of the room on average</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">Everyone marched to their own drum.</p>
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
            <button type="button" onClick={onRestart} className="flex h-11 items-center gap-2 rounded-2xl bg-fuchsia-400 px-5 text-sm font-black text-fuchsia-950 transition hover:scale-[1.03]">
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
