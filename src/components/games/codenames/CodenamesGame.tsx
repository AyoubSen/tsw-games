import { ArrowLeft, Clock, Eye, EyeOff, KeyRound, ScrollText, Skull, Trophy, WifiOff, X, XCircle } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { Reaction } from "@/lib/reactions"
import { ReactionBubble, ReactionPicker, type ReactionBubbles } from "@/components/multiplayer/Reactions"
import { SoundToggle } from "@/components/multiplayer/SoundToggle"
import { cn } from "@/lib/utils"
import type { Player, PublicGameState, Team } from "../../../../party/codenames"
import {
  AssassinOverlay, Avatar, BarButton, BoardGrid, ClueAnnouncement, ClueComposer, ClueLog, Confetti, Countdown, FLIP_MS, GLASS,
  HandoffSweep, KEY_FLIP_STAGGER, KEY_FLIP_TOTAL, NEUTRAL_HEX, ResultToast, SpectatorSeats, TABLE_BG, TEAM, TeamMark, WordCard,
  faceHex, faceLabel, otherTeam, useBeatElapsed, useElementSize, usePaceSounds, type CardFace, type LogGroup,
} from "./table"

export interface CodenamesGameProps {
  state: PublicGameState
  playerId: string
  isSpymaster: boolean
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onGiveClue: (word: string, count: number) => void
  onConsider: (cardIndex: number | null) => void
  onGuess: (cardIndex: number) => void
  onEndGuessing: () => void
  onRestart: () => void
  onSeat: (playerId: string) => void
  onLeave: () => void
}

const HANDOFF_TEXT: Record<string, string> = {
  start: "Opens the mission",
  "time expired": "Time's up — the turn passes",
  "wrong guess": "The turn passes",
  "out of guesses": "Out of guesses",
  passed: "Turn passed",
}

const WIN_TEXT = {
  cards: (loser: Team) => `Every agent found before ${TEAM[loser].name}.`,
  assassin: (loser: Team) => `${TEAM[loser].name} team contacted the assassin.`,
  "wrong-guess": (loser: Team) => `${TEAM[loser].name} team made a wrong guess in Hardcore.`,
  timeout: (loser: Team) => `${TEAM[loser].name} team ran out of time.`,
}

export function CodenamesGame(props: CodenamesGameProps) {
  const { state, playerId, connected, reactions } = props
  const me = state.players[playerId] as Player | undefined
  const spectator = !me
  const over = state.status === "finished"
  const turn = state.currentTurn
  const pending = state.pending
  const guessBeat = pending?.kind === "guess" ? pending : null
  const myTeam = me?.team ?? null
  const isSpy = props.isSpymaster && !spectator
  const isMyTurn = Boolean(turn && myTeam === turn.team)
  const settings = state.settings

  const [boardRef, boardSize] = useElementSize<HTMLDivElement>()
  const [peek, setPeek] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [resultsHidden, setResultsHidden] = useState(false)

  // Optimistic intent so a quick second tap commits instead of re-marking.
  const serverIntent = state.intents[playerId] ?? null
  const [localIntent, setLocalIntent] = useState<number | null | undefined>(undefined)
  useEffect(() => setLocalIntent(undefined), [serverIntent, turn?.team, pending?.seq])
  const myIntent = localIntent !== undefined ? localIntent : serverIntent

  const canGiveClue = connected && !over && isMyTurn && isSpy && turn?.phase === "giving-clue" && !pending
  const canConsider = connected && !over && isMyTurn && me?.role === "guesser" && turn?.phase === "guessing" && !guessBeat
  const canGuess = canConsider && !pending
  const canEnd = canGuess && (turn?.guessedThisTurn.length ?? 0) > 0

  // Hold the score until the card has turned over.
  const flipKey = guessBeat?.stage === "flip" ? `flip:${guessBeat.seq}` : null
  const sinceFlip = useBeatElapsed(flipKey, FLIP_MS)
  let redLeft = state.redCardsRemaining
  let blueLeft = state.blueCardsRemaining
  if (guessBeat?.stage === "flip" && sinceFlip < FLIP_MS) {
    const type = state.board[guessBeat.cardIndex]?.type
    if (type === "red") redLeft++
    else if (type === "blue") blueLeft++
  }

  const overKey = over ? `over:${state.finishedAt}` : null
  const sinceOver = useBeatElapsed(overKey, KEY_FLIP_TOTAL)
  const showResults = over && sinceOver >= KEY_FLIP_TOTAL && !resultsHidden
  usePaceSounds(pending, overKey, over ? "win" : null)

  const activeTeam: Team | null = over ? state.winner : turn?.team ?? null
  const showKey = isSpy && !peek && !over
  const words = useMemo(() => state.board.map((card) => card.word), [state.board])
  const names = (id: string) => state.players[id]?.name ?? "?"

  const pick = (index: number) => {
    if (myIntent === index && canGuess) {
      props.onGuess(index)
      setLocalIntent(null)
    } else {
      setLocalIntent(index)
      props.onConsider(index)
    }
  }

  const groups: LogGroup[] = state.clueHistory
    .map((clue, index) => ({
      key: `${index}`,
      word: clue.word,
      count: clue.count,
      givenBy: clue.givenBy,
      hex: TEAM[clue.team].hex,
      team: clue.team,
      guesses: clue.guesses ?? [],
      live: !over && index === state.clueHistory.length - 1 && turn?.phase === "guessing" && turn.clue?.timestamp === clue.timestamp,
    }))
    .reverse()
  const faceOf = (guess: { result: string }, group: LogGroup): CardFace => {
    const team = group.team ?? "red"
    return guess.result === "correct" ? team : guess.result === "opponent" ? otherTeam(team) : guess.result === "assassin" ? "assassin" : "neutral"
  }

  const remaining = { red: redLeft, blue: blueLeft }

  // ─── Status line ────────────────────────────────────────────────────────
  const status = (() => {
    if (over || !turn) return ""
    const name = TEAM[turn.team].name
    if (pending?.kind === "handoff") return `${name} team's turn`
    if (pending?.kind === "clue") return `${pending.givenBy} gives a clue`
    if (turn.phase === "giving-clue") return isMyTurn ? (isSpy ? "Give your team a clue" : "Your spymaster is thinking…") : `${name} spymaster is thinking…`
    if (guessBeat) return `${guessBeat.byName} locked in ${words[guessBeat.cardIndex] ?? ""}…`
    if (isMyTurn) return isSpy ? "Your team is guessing — keep a straight face" : "Tap a card to consider it, tap again to guess"
    return `${name} team is guessing`
  })()

  // ─── Overlays from the current beat ─────────────────────────────────────
  let overlay: ReactNode = null
  if (pending?.kind === "clue" && pending.team) {
    overlay = <ClueAnnouncement pending={pending} hex={TEAM[pending.team].hex} subtitle={`${pending.givenBy} · ${TEAM[pending.team].name} spymaster`} />
  } else if (pending?.kind === "handoff" && pending.team) {
    const mine = myTeam === pending.team
    overlay = (
      <HandoffSweep
        seq={pending.seq}
        hex={TEAM[pending.team].hex}
        toRight={pending.team === "blue"}
        title={mine ? "Your team" : `${TEAM[pending.team].name} team`}
        subtitle={HANDOFF_TEXT[pending.reason] ?? "Your move"}
      />
    )
  } else if (guessBeat?.stage === "flip" && guessBeat.result === "assassin" && guessBeat.team) {
    overlay = <AssassinOverlay seq={guessBeat.seq} title="Assassin" subtitle={`${TEAM[guessBeat.team].name} team is out · ${TEAM[otherTeam(guessBeat.team)].name} wins`} />
  }

  let toast: ReactNode = null
  if (guessBeat?.stage === "flip" && guessBeat.result && guessBeat.result !== "assassin" && guessBeat.team) {
    const type = state.board[guessBeat.cardIndex]?.type
    const face: CardFace = type ?? "neutral"
    const cleared = state.redCardsRemaining === 0 ? "red" : state.blueCardsRemaining === 0 ? "blue" : null
    const subtitle = guessBeat.next === "continue"
      ? "Keep going"
      : guessBeat.next === "game-over"
        ? cleared ? `${TEAM[cleared].name} found every agent` : "Hardcore — that's the game"
        : guessBeat.result === "correct" ? "Out of guesses" : "Turn over"
    toast = (
      <ResultToast
        seq={guessBeat.seq}
        title={guessBeat.result === "neutral" ? "Bystander" : faceLabel(face)}
        subtitle={subtitle}
        hex={face === "neutral" ? NEUTRAL_HEX : faceHex(face)}
        good={guessBeat.result === "correct"}
      />
    )
  }

  // ─── Pieces ─────────────────────────────────────────────────────────────
  const rosterOf = (team: Team) =>
    Object.values(state.players)
      .filter((player) => player.team === team)
      .sort((a, b) => (a.role === "spymaster" ? -1 : b.role === "spymaster" ? 1 : a.joinedAt - b.joinedAt))

  const actingIds = new Set(
    turn && !over
      ? rosterOf(turn.team).filter((player) => (turn.phase === "giving-clue" ? player.role === "spymaster" : player.role === "guesser")).map((player) => player.id)
      : [],
  )

  const teamPanel = (team: Team) => {
    const t = TEAM[team]
    const active = activeTeam === team
    const roster = rosterOf(team)
    return (
      <aside
        className={cn(GLASS, "hidden w-56 shrink-0 flex-col overflow-hidden transition-[box-shadow,border-color] duration-500 lg:flex xl:w-64")}
        style={active ? { borderColor: `${t.hex}aa`, boxShadow: `0 0 0 1px ${t.hex}55, 0 0 46px ${t.hex}40` } : undefined}
        aria-label={`${t.name} team`}
      >
        <div className="relative p-4" style={{ background: `linear-gradient(135deg, ${t.hex}38, transparent 75%)` }}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[.2em]" style={{ color: t.hex }}>
              <TeamMark team={team} /> {t.name}
            </p>
            {active && !over && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white" style={{ background: t.hex }}>
                {myTeam === team ? "Your turn" : "Their turn"}
              </span>
            )}
            {over && state.winner === team && <Trophy className="size-5" style={{ color: t.hex }} />}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span key={remaining[team]} className="poker-pop font-mono text-6xl font-black leading-none tabular-nums">{remaining[team]}</span>
            <span className="pb-1 text-[11px] leading-tight text-white/60">agents<br />left</span>
          </div>
        </div>
        <ul className="space-y-1 border-t border-white/10 p-2">
          {roster.map((player) => (
            <li
              key={player.id}
              className={cn("relative flex items-center gap-2 rounded-lg px-2 py-1.5", actingIds.has(player.id) && "bg-white/10")}
              style={actingIds.has(player.id) ? { boxShadow: `inset 2px 0 0 ${t.hex}` } : undefined}
            >
              <Avatar id={player.id} name={player.name} size={26} className={cn(player.connected === false && "opacity-40")} />
              <span className="min-w-0 truncate text-sm font-semibold">{player.name}</span>
              {player.id === playerId && <span className="text-[10px] text-white/50">you</span>}
              {player.connected === false && <WifiOff className="size-3 text-white/40" aria-label="Reconnecting" />}
              {player.role === "spymaster" && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white/60">
                  <KeyRound className="size-3" style={{ color: t.hex }} />Spymaster
                </span>
              )}
              <ReactionBubble bubble={reactions[player.id]} side="top" />
            </li>
          ))}
        </ul>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-white/45">Clues</p>
          <ClueLog groups={groups.filter((group) => group.team === team)} words={words} faceOf={faceOf} empty="No clues yet." />
        </div>
      </aside>
    )
  }

  const teamStrip = (team: Team) => {
    const t = TEAM[team]
    const active = activeTeam === team
    return (
      <div
        className={cn(GLASS, "flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 transition-shadow duration-500")}
        style={active ? { borderColor: `${t.hex}aa`, boxShadow: `0 0 26px ${t.hex}50` } : undefined}
      >
        <span style={{ color: t.hex }}><TeamMark team={team} /></span>
        <span key={remaining[team]} className="poker-pop font-mono text-2xl font-black tabular-nums">{remaining[team]}</span>
        <div className="ml-auto flex min-w-0 -space-x-1.5">
          {rosterOf(team).map((player) => (
            <span key={player.id} className="relative" title={`${player.name}${player.role === "spymaster" ? " (spymaster)" : ""}`}>
              <Avatar
                id={player.id}
                name={player.name}
                size={24}
                className={cn("ring-2 ring-black/60", player.connected === false && "opacity-40")}
                style={player.role === "spymaster" ? { boxShadow: `0 0 0 2px ${t.hex}` } : undefined}
              />
              <ReactionBubble bubble={reactions[player.id]} side="bottom" />
            </span>
          ))}
        </div>
      </div>
    )
  }

  const clueDock = (() => {
    const hex = turn ? TEAM[turn.team].hex : "#fff"
    const limit = turn?.phase === "giving-clue" ? settings.clueTimeLimit : settings.guessTimeLimit
    const timer = <Countdown deadline={state.turnDeadline} limit={limit} />
    if (over || !turn) return <div className={cn(GLASS, "px-4 py-2 text-sm font-bold uppercase tracking-widest text-white/70")}>Game over</div>
    if (turn.clue && turn.phase === "guessing" && pending?.kind !== "clue") {
      const left = turn.clue.count === 0 ? "∞" : `${turn.guessesRemaining}`
      return (
        <div key={turn.clue.timestamp} className={cn(GLASS, "uno-pop flex min-w-0 items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4")} style={{ borderColor: `${hex}88`, boxShadow: `0 0 28px ${hex}40` }}>
          <span style={{ color: hex }}><TeamMark team={turn.team} /></span>
          <span className="min-w-0 truncate text-base font-black uppercase tracking-wide sm:text-2xl sm:tracking-wider">{turn.clue.word}</span>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-lg font-black" style={{ background: hex }}>{turn.clue.count === 0 ? "∞" : turn.clue.count}</span>
          <span className="hidden shrink-0 text-[10px] font-bold uppercase leading-tight tracking-wider text-white/55 sm:block">{left}<br />guesses</span>
          {timer}
        </div>
      )
    }
    return (
      <div className={cn(GLASS, "flex min-w-0 items-center gap-2 px-3 py-1.5 sm:px-4")}>
        <span style={{ color: hex }}><TeamMark team={turn.team} /></span>
        <span className="truncate text-sm font-semibold text-white/80">{turn.phase === "giving-clue" ? `${TEAM[turn.team].name} spymaster is thinking…` : "Clue incoming…"}</span>
        {timer}
      </div>
    )
  })()

  const peekToggle = isSpy && !over && (
    <BarButton onClick={() => setPeek((value) => !value)} ariaPressed={peek} className="px-3">
      {peek ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      <span className="hidden sm:inline">{peek ? "Show key" : "Guesser view"}</span>
    </BarButton>
  )

  const actionBar = (() => {
    if (over) {
      return resultsHidden ? <BarButton onClick={() => setResultsHidden(false)}><Trophy className="size-4" />Show results</BarButton> : null
    }
    if (canGiveClue && turn) {
      return (
        <div className="flex w-full items-start gap-2">
          <ClueComposer
            key={turn.phaseStartedAt}
            hex={TEAM[turn.team].hex}
            min={0}
            max={Math.max(1, Math.min(9, remaining[turn.team]))}
            validate={(word) => word.length > 0 && !/[\s-]/.test(word)}
            hint="One word, no board words. ∞ lets your team keep guessing."
            onSubmit={props.onGiveClue}
          />
          {peekToggle}
        </div>
      )
    }
    if (canConsider && turn) {
      const hex = TEAM[turn.team].hex
      return (
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          {myIntent !== null && myIntent !== undefined && !state.board[myIntent]?.revealed ? (
            <>
              <BarButton hex={hex} disabled={!canGuess} onClick={() => pick(myIntent)}>Guess {words[myIntent]}</BarButton>
              <BarButton onClick={() => { setLocalIntent(null); props.onConsider(null) }} className="px-3"><X className="size-4" /><span className="sr-only">Clear</span></BarButton>
            </>
          ) : (
            <p className="px-2 text-sm font-semibold text-white/75">{pending ? status : "Tap a card to consider it — tap again to guess"}</p>
          )}
          <BarButton disabled={!canEnd} onClick={props.onEndGuessing}>End turn</BarButton>
        </div>
      )
    }
    return (
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        {spectator && <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70"><Eye className="size-3.5" />Watching</span>}
        <p className="px-2 text-sm font-semibold text-white/75">{status}</p>
        {peekToggle}
      </div>
    )
  })()

  const winner = state.winner
  const loser = winner ? otherTeam(winner) : null
  const WinIcon = state.winReason === "assassin" ? Skull : state.winReason === "timeout" ? Clock : state.winReason === "wrong-guess" ? XCircle : Trophy
  const seatsLeft = 8 - Object.keys(state.players).length

  return (
    <div className="relative flex h-[calc(100dvh-73px)] min-h-[560px] select-none flex-col overflow-hidden text-white" style={{ background: TABLE_BG }}>
      {/* Active side glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: activeTeam
            ? `radial-gradient(ellipse 55% 80% at ${activeTeam === "red" ? "0%" : "100%"} 50%, ${TEAM[activeTeam].hex}2e, transparent 70%)`
            : "none",
        }}
      />

      <header className="relative z-20 flex items-center gap-1.5 p-2 sm:gap-2 sm:p-3">
        <button type="button" onClick={props.onLeave} className={cn(GLASS, "flex h-11 w-10 shrink-0 items-center justify-center gap-1.5 text-sm font-bold hover:bg-black/60 sm:w-auto sm:px-3")}>
          <ArrowLeft className="size-4" /><span className="hidden sm:inline">Leave</span>
        </button>
        <div className={cn(GLASS, "hidden h-11 shrink-0 items-center gap-2 px-3 md:flex")}>
          <span className="font-mono text-sm font-bold tracking-widest text-white/80">{props.roomLabel}</span>
          {settings.gameMode === "hardcore" && <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-300"><Skull className="size-3" />Hardcore</span>}
          {(settings.clueTimeLimit > 0 || settings.guessTimeLimit > 0) && <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300"><Clock className="size-3" />Timed</span>}
        </div>
        <div className="flex min-w-0 flex-1 justify-center">{clueDock}</div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {state.spectators.length > 0 && (
            <span className={cn(GLASS, "hidden h-11 items-center gap-1 px-3 text-xs font-bold text-white/70 sm:flex")} title={state.spectators.map((s) => s.name).join(", ")}>
              <Eye className="size-4" />{state.spectators.length}
            </span>
          )}
          <button type="button" aria-label="Clue log" aria-expanded={logOpen} onClick={() => setLogOpen((value) => !value)} className={cn(GLASS, "grid size-11 place-items-center hover:bg-black/60 max-sm:w-10 lg:hidden", logOpen && "bg-black/70")}>
            <ScrollText className="size-5" />
          </button>
          <SoundToggle className="max-sm:w-10" />
          {!spectator && <ReactionPicker onReact={props.onReact} disabled={!connected} align="end" side="bottom" className="max-sm:w-10" />}
        </div>
      </header>

      {!connected && (
        <p role="status" className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-bold text-black">
          <WifiOff className="size-3.5" />Reconnecting…
        </p>
      )}
      {props.error && (
        <p role="alert" className="uno-rise absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl bg-red-500/95 px-4 py-2 text-sm font-semibold shadow-xl">{props.error}</p>
      )}

      <div className="relative z-10 grid grid-cols-2 gap-2 px-2 pb-2 lg:hidden">
        {teamStrip("red")}
        {teamStrip("blue")}
      </div>

      <main className="relative z-10 flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-3">
        {teamPanel("red")}
        <div ref={boardRef} className="relative grid min-h-0 min-w-0 flex-1 place-items-center">
          <BoardGrid size={boardSize}>
            {(metrics) =>
              state.board.map((card, index) => {
                const flipped = card.revealed || (over && Boolean(card.type))
                const locked = guessBeat?.stage === "tension" && guessBeat.cardIndex === index
                const mine = myIntent === index && !card.revealed && myTeam ? TEAM[myTeam].hex : null
                const chips = Object.entries(state.intents)
                  .filter(([id, target]) => target === index && id !== playerId)
                  .map(([id]) => ({ id, name: names(id) }))
                const mark = showKey && !card.revealed ? card.type : null
                return (
                  <WordCard
                    key={index}
                    word={card.word}
                    w={metrics.w}
                    h={metrics.h}
                    back={card.type}
                    flipped={flipped}
                    flipDelay={over && !card.revealed ? index * KEY_FLIP_STAGGER : 0}
                    used={card.revealed}
                    mark={mark}
                    locked={locked}
                    lockedBy={locked ? guessBeat?.byName : undefined}
                    dim={guessBeat?.stage === "tension" && !locked && !card.revealed}
                    mine={mine}
                    chips={chips}
                    disabled={!canConsider || card.revealed}
                    label={`${card.word}${card.revealed && card.type ? `, ${faceLabel(card.type)}` : mark ? `, key: ${faceLabel(mark)}` : ""}${mine ? ", you are considering it" : ""}${chips.length ? `, considered by ${chips.map((chip) => chip.name).join(", ")}` : ""}`}
                    onClick={() => pick(index)}
                  />
                )
              })
            }
          </BoardGrid>
          {toast}
        </div>
        {teamPanel("blue")}
      </main>

      <footer className="relative z-20 flex justify-center px-2 pb-2 sm:pb-3">
        {actionBar && <div className={cn(GLASS, "flex w-full max-w-2xl items-center justify-center px-3 py-2.5")}>{actionBar}</div>}
      </footer>

      {logOpen && (
        <div className={cn(GLASS, "uno-rise absolute bottom-20 right-2 top-16 z-30 w-[min(20rem,calc(100%-1rem))] overflow-y-auto bg-[#0b121b]/95 p-3 lg:hidden")}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">Clue log</p>
            <button type="button" aria-label="Close clue log" onClick={() => setLogOpen(false)} className="grid size-8 place-items-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
          </div>
          <ClueLog groups={groups} words={words} faceOf={faceOf} empty="Clues and their guesses show up here." />
        </div>
      )}

      {overlay}

      {showResults && winner && loser && (
        <div className="uno-fade-in absolute inset-0 z-40 grid place-items-center bg-black/45 p-4">
          <Confetti colors={[TEAM[winner].hex, "#ffffff", TEAM[winner].hex, "#fde68a"]} />
          <div className={cn(GLASS, "uno-pop relative w-full max-w-md bg-[#0b121b]/90 p-6 text-center")} style={{ boxShadow: `0 0 90px ${TEAM[winner].hex}55` }}>
            <WinIcon className="mx-auto size-14" style={{ color: state.winReason === "assassin" ? "#fff" : TEAM[winner].hex }} />
            <h2 className="mt-3 flex items-center justify-center gap-3 text-4xl font-black uppercase tracking-wide" style={{ color: TEAM[winner].hex }}>
              <TeamMark team={winner} className="size-4" />{TEAM[winner].name} wins
            </h2>
            <p className="mt-2 text-sm text-white/75">{WIN_TEXT[state.winReason ?? "cards"](loser)}</p>
            {myTeam && <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/50">{myTeam === winner ? "Your team won" : "Better luck next round"}</p>}
            <div className="mt-5 flex flex-col gap-2">
              {props.isHost ? (
                <BarButton hex={TEAM[winner].hex} disabled={!connected} onClick={props.onRestart} className="justify-center">Play again</BarButton>
              ) : (
                <p className="rounded-xl bg-white/5 p-2.5 text-sm text-white/60">Waiting for the host to start the next game…</p>
              )}
              <div className="flex gap-2">
                <BarButton onClick={() => setResultsHidden(true)} className="flex-1 justify-center"><Eye className="size-4" />View board</BarButton>
                <BarButton onClick={props.onLeave} className="flex-1 justify-center">Leave</BarButton>
              </div>
            </div>
            {state.spectators.length > 0 && (
              <div className="mt-4">
                <SpectatorSeats spectators={state.spectators} canSeat={props.isHost} seatsLeft={seatsLeft} onSeat={props.onSeat} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
