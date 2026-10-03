import { ArrowLeft, Eye, EyeOff, KeyRound, ScrollText, Skull, Trophy, Users, WifiOff, X } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { Reaction } from "@/lib/reactions"
import { ReactionBubble, ReactionPicker, type ReactionBubbles } from "@/components/multiplayer/Reactions"
import { SoundToggle } from "@/components/multiplayer/SoundToggle"
import { cn } from "@/lib/utils"
import type { DuetCardType, PublicGameState } from "../../../../party/codenames"
import {
  AssassinOverlay, Avatar, BarButton, BoardGrid, ClueAnnouncement, ClueComposer, ClueLog, Confetti, DUET_HEX, GLASS, HandoffSweep,
  KEY_FLIP_STAGGER, KEY_FLIP_TOTAL, NEUTRAL_HEX, ResultToast, SpectatorSeats, TABLE_BG, WordCard, faceLabel, useBeatElapsed, useElementSize,
  usePaceSounds, type CardFace, type LogGroup,
} from "./table"

interface DuetGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  roomLabel: string
  connected: boolean
  error: string | null
  reactions: ReactionBubbles
  onReact: (reaction: Reaction) => void
  onClue: (word: string, count: number) => boolean
  onConsider: (index: number | null) => void
  onGuess: (index: number) => boolean
  onPass: () => boolean
  onRestart: () => void
  onSeat: (playerId: string) => void
  onLeave: () => void
}

const SUDDEN_HEX = "#f59e0b"
const keyFace = (type: DuetCardType | undefined): CardFace | null =>
  type === "agent" ? "green" : type === "assassin" ? "assassin" : type === "bystander" ? "neutral" : null

const OUTCOME = {
  win: { title: "Mission complete", line: "Every agent found. Both of you share the win.", Icon: Trophy, hex: DUET_HEX },
  assassin: { title: "Assassin", line: "An assassin on the clue giver's key ended the mission.", Icon: Skull, hex: "#f87171" },
  bystander: { title: "Out of time", line: "A bystander in sudden death ended the mission.", Icon: Skull, hex: SUDDEN_HEX },
  "partner-left": { title: "Mission aborted", line: "Your partner left the table.", Icon: Users, hex: "#94a3b8" },
} as const

export function DuetGame({ gameState: state, playerId, isHost, roomLabel, connected, error, reactions, onReact, onClue, onConsider, onGuess, onPass, onRestart, onSeat, onLeave }: DuetGameProps) {
  const duet = state.duet
  const over = state.status === "finished"
  const pending = state.pending
  const guessBeat = pending?.kind === "guess" ? pending : null
  const isPlayer = Boolean(duet?.playerIds.includes(playerId))
  const givingClue = Boolean(duet && !over && duet.phase === "giving-clue" && duet.giverId === playerId)

  const [boardRef, boardSize] = useElementSize<HTMLDivElement>()
  const [view, setView] = useState<"board" | "key" | "partner">("board")
  const [logOpen, setLogOpen] = useState(false)
  const [resultsHidden, setResultsHidden] = useState(false)
  useEffect(() => {
    setView(over && isPlayer ? "partner" : givingClue ? "key" : "board")
  }, [givingClue, duet?.turnId, over, isPlayer])

  const serverIntent = state.intents[playerId] ?? null
  const [localIntent, setLocalIntent] = useState<number | null | undefined>(undefined)
  useEffect(() => setLocalIntent(undefined), [serverIntent, pending?.seq, duet?.turnId])
  const myIntent = localIntent !== undefined ? localIntent : serverIntent

  const overKey = over ? `over:${state.finishedAt}` : null
  const sinceOver = useBeatElapsed(overKey, KEY_FLIP_TOTAL)
  const showResults = over && sinceOver >= KEY_FLIP_TOTAL && !resultsHidden
  usePaceSounds(pending, overKey, over ? (duet?.outcome === "win" ? "win" : "toll") : null)
  const words = useMemo(() => state.board.map((card) => card.word), [state.board])

  if (!duet) return null
  const selfId = isPlayer ? playerId : duet.playerIds[0]
  const partnerId = duet.playerIds.find((id) => id !== selfId) ?? ""
  const self = state.players[selfId]
  const partner = state.players[partnerId]
  const nameOf = (id: string) => (id === playerId ? "You" : state.players[id]?.name ?? "Partner")
  const suddenDeath = duet.phase === "sudden-death"
  const canConsider = isPlayer && connected && !over && duet.partnerAgentsRemaining > 0 &&
    (suddenDeath || (duet.phase === "guessing" && duet.giverId !== playerId)) && !guessBeat
  const canGuess = canConsider && !pending
  const canPass = canGuess && !suddenDeath && duet.guessesThisTurn > 0
  const turnsLeft = duet.turnLimit - duet.turnsUsed
  const key = view === "key" ? duet.myKey : view === "partner" && over ? duet.partnerKey : null

  const pick = (index: number) => {
    if (myIntent === index && canGuess) {
      if (onGuess(index)) setLocalIntent(null)
    } else {
      setLocalIntent(index)
      onConsider(index)
    }
  }

  const groups: LogGroup[] = duet.history
    .map((clue, index) => ({
      key: `${index}`,
      word: clue.word,
      count: clue.count,
      givenBy: clue.givenBy,
      hex: DUET_HEX,
      guesses: clue.guesses ?? [],
      live: !over && index === duet.history.length - 1 && duet.phase === "guessing",
    }))
    .reverse()
  const faceOf = (guess: { result: string }): CardFace => (guess.result === "correct" ? "green" : guess.result === "assassin" ? "assassin" : "neutral")

  // ─── Beat overlays ──────────────────────────────────────────────────────
  let overlay: ReactNode = null
  if (pending?.kind === "clue") {
    overlay = <ClueAnnouncement pending={pending} hex={DUET_HEX} subtitle={`${pending.givenBy}'s clue`} />
  } else if (pending?.kind === "handoff") {
    const sudden = pending.reason === "sudden-death"
    const toMe = pending.toId === playerId
    overlay = (
      <HandoffSweep
        seq={pending.seq}
        hex={sudden ? SUDDEN_HEX : DUET_HEX}
        toRight={sudden ? true : pending.toId === partnerId}
        title={sudden ? "Sudden death" : toMe ? "Your clue" : `${nameOf(pending.toId ?? "")}'s clue`}
        subtitle={sudden ? "No more clues — one wrong card ends it" : pending.reason === "start" ? "The mission begins" : pending.reason === "bystander" ? "A bystander ends the turn" : "Turn passes"}
      />
    )
  } else if (guessBeat?.stage === "flip" && guessBeat.result === "assassin") {
    overlay = <AssassinOverlay seq={guessBeat.seq} title="Assassin" subtitle="The mission is over" />
  }

  let toast: ReactNode = null
  if (guessBeat?.stage === "flip" && guessBeat.result && guessBeat.result !== "assassin") {
    const good = guessBeat.result === "correct"
    toast = (
      <ResultToast
        seq={guessBeat.seq}
        title={good ? "Agent found" : "Bystander"}
        subtitle={guessBeat.next === "game-over" ? (good ? "That's all fifteen" : "Sudden death lost") : guessBeat.next === "turn-over" ? "Turn over" : "Keep going"}
        hex={good ? DUET_HEX : NEUTRAL_HEX}
        good={good}
      />
    )
  }

  const status = (() => {
    if (over) return ""
    if (pending?.kind === "clue") return `${pending.givenBy} gives a clue`
    if (guessBeat) return `${nameOf(guessBeat.byId)} locked in ${words[guessBeat.cardIndex] ?? ""}…`
    if (suddenDeath) return canConsider ? "Sudden death — guess using earlier clues" : "Sudden death"
    if (duet.phase === "giving-clue") return givingClue ? "Link the green agents on your key" : `${nameOf(duet.giverId)} is thinking…`
    if (canConsider) return "Tap a card to consider it — tap again to guess"
    return `${nameOf(duet.playerIds.find((id) => id !== duet.giverId) ?? "")} is guessing`
  })()

  // ─── Pieces ─────────────────────────────────────────────────────────────
  const seat = (id: string, side: "left" | "right") => {
    const player = state.players[id]
    if (!player) return null
    const role = over ? "" : suddenDeath ? "Guessing" : duet.giverId === id ? (duet.phase === "giving-clue" ? "Giving the clue" : "Gave the clue") : duet.phase === "guessing" ? "Guessing" : "Waiting"
    const acting = !over && (suddenDeath || (duet.phase === "giving-clue" ? duet.giverId === id : duet.giverId !== id))
    const keyLeft = id === selfId ? duet.myAgentsRemaining : duet.partnerAgentsRemaining
    const other = state.players[id === selfId ? partnerId : selfId]
    return (
      <aside
        className={cn(GLASS, "hidden w-56 shrink-0 flex-col overflow-hidden transition-[box-shadow,border-color] duration-500 lg:flex xl:w-64")}
        style={acting ? { borderColor: `${DUET_HEX}aa`, boxShadow: `0 0 0 1px ${DUET_HEX}55, 0 0 46px ${DUET_HEX}38` } : undefined}
        aria-label={player.name}
      >
        <div className="relative p-4" style={{ background: `linear-gradient(${side === "left" ? 135 : 225}deg, ${DUET_HEX}30, transparent 75%)` }}>
          <div className="relative flex items-center gap-2.5">
            <Avatar id={id} name={player.name} size={36} className={cn(player.connected === false && "opacity-40")} />
            <div className="min-w-0">
              <p className="truncate font-black">{player.name}{id === playerId && <span className="ml-1 text-xs font-normal text-white/50">you</span>}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">{player.connected === false ? "Reconnecting…" : role}</p>
            </div>
            <ReactionBubble bubble={reactions[id]} side="bottom" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span key={keyLeft} className="poker-pop font-mono text-5xl font-black leading-none tabular-nums">{keyLeft}</span>
            <span className="pb-1 text-[11px] leading-tight text-white/60">agents on this key<br />for {other?.name ?? "partner"}</span>
          </div>
        </div>
      </aside>
    )
  }

  const tokens = (
    <div className="flex items-center gap-1" aria-label={`${turnsLeft} turns left`}>
      {Array.from({ length: duet.turnLimit }, (_, index) => (
        <span key={index} className={cn("size-2.5 rounded-full transition-colors", index < duet.turnsUsed ? "bg-white/15" : "bg-[#35c97b] shadow-[0_0_6px_#35c97b]")} />
      ))}
    </div>
  )

  const dock = (() => {
    if (over) return <div className={cn(GLASS, "px-4 py-2 text-sm font-bold uppercase tracking-widest text-white/70")}>Mission over</div>
    if (duet.clue && duet.phase === "guessing" && pending?.kind !== "clue") {
      return (
        <div key={duet.turnId} className={cn(GLASS, "uno-pop flex min-w-0 items-center gap-3 px-3 py-1.5 sm:px-4")} style={{ borderColor: `${DUET_HEX}88`, boxShadow: `0 0 28px ${DUET_HEX}40` }}>
          <span className="min-w-0 truncate text-lg font-black uppercase tracking-wider sm:text-2xl">{duet.clue.word}</span>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-lg font-black" style={{ background: DUET_HEX }}>{duet.clue.count}</span>
          <span className="hidden sm:block">{tokens}</span>
        </div>
      )
    }
    return (
      <div className={cn(GLASS, "flex min-w-0 items-center gap-3 px-3 py-2 sm:px-4")} style={suddenDeath ? { borderColor: `${SUDDEN_HEX}aa` } : undefined}>
        <span className={cn("truncate text-sm font-semibold", suddenDeath ? "text-amber-300" : "text-white/80")}>{suddenDeath ? "Sudden death" : `${nameOf(duet.giverId)} ${duet.giverId === playerId ? "give" : "gives"} the clue`}</span>
        <span className="hidden sm:block">{tokens}</span>
      </div>
    )
  })()

  const keyToggle = isPlayer && (
    <div className="flex gap-1">
      <BarButton onClick={() => setView(view === "key" ? "board" : "key")} ariaPressed={view === "key"} className="px-3">
        {view === "key" ? <EyeOff className="size-4" /> : <KeyRound className="size-4" />}
        <span className="hidden sm:inline">{view === "key" ? "Hide key" : "My key"}</span>
      </BarButton>
      {over && (
        <BarButton onClick={() => setView(view === "partner" ? "board" : "partner")} ariaPressed={view === "partner"} className="px-3">
          <Eye className="size-4" /><span className="hidden sm:inline">Partner's key</span>
        </BarButton>
      )}
    </div>
  )

  const actionBar = (() => {
    if (over) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {keyToggle}
          {resultsHidden && <BarButton onClick={() => setResultsHidden(false)}><Trophy className="size-4" />Show results</BarButton>}
        </div>
      )
    }
    if (givingClue && !pending) {
      return (
        <div className="flex w-full items-start gap-2">
          <ClueComposer
            key={duet.turnId}
            hex={DUET_HEX}
            min={1}
            max={Math.max(1, duet.myAgentsRemaining)}
            disabled={!connected}
            validate={(word) => /^[A-Za-z]{1,30}$/.test(word)}
            hint="Link the green agents on your key. Letters only, no board words."
            onSubmit={(word, count) => { onClue(word, count) }}
          />
          {keyToggle}
        </div>
      )
    }
    if (canConsider) {
      return (
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          {myIntent !== null && myIntent !== undefined && !duet.found.includes(myIntent) ? (
            <>
              <BarButton hex={DUET_HEX} disabled={!canGuess} onClick={() => pick(myIntent)}>Guess {words[myIntent]}</BarButton>
              <BarButton onClick={() => { setLocalIntent(null); onConsider(null) }} className="px-3"><X className="size-4" /><span className="sr-only">Clear</span></BarButton>
            </>
          ) : (
            <p className="px-2 text-sm font-semibold text-white/75">{status}</p>
          )}
          {!suddenDeath && <BarButton disabled={!canPass} onClick={onPass}>End turn</BarButton>}
          {keyToggle}
        </div>
      )
    }
    return (
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        {!isPlayer && <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70"><Eye className="size-3.5" />Watching</span>}
        <p className="px-2 text-sm font-semibold text-white/75">{status}</p>
        {keyToggle}
      </div>
    )
  })()

  const outcome = duet.outcome ? OUTCOME[duet.outcome] : null
  const initial = (id: string) => state.players[id]?.name.charAt(0).toUpperCase() ?? "?"

  return (
    <div className="relative flex h-[calc(100dvh-73px)] select-none flex-col overflow-hidden text-white" style={{ background: TABLE_BG }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${suddenDeath && !over ? SUDDEN_HEX : DUET_HEX}1c, transparent 70%)` }}
      />

      <header className="relative z-20 flex items-center gap-2 p-2 sm:p-3">
        <button type="button" onClick={onLeave} className={cn(GLASS, "flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-bold hover:bg-black/60")}>
          <ArrowLeft className="size-4" /><span className="hidden sm:inline">Leave</span>
        </button>
        <div className={cn(GLASS, "hidden h-11 shrink-0 items-center gap-3 px-3 md:flex")}>
          <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest" style={{ color: DUET_HEX }}><Users className="size-3.5" />Duet</span>
          <span className="font-mono text-sm font-bold tracking-widest text-white/70">{roomLabel}</span>
          <span className="font-mono text-sm font-black tabular-nums">{15 - duet.agentsRemaining}<span className="text-white/45">/15</span></span>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">{dock}</div>
        <div className="flex shrink-0 items-center gap-2">
          {state.spectators.length > 0 && (
            <span className={cn(GLASS, "hidden h-11 items-center gap-1 px-3 text-xs font-bold text-white/70 sm:flex")}><Eye className="size-4" />{state.spectators.length}</span>
          )}
          <button type="button" aria-label="Clue log" aria-expanded={logOpen} onClick={() => setLogOpen((value) => !value)} className={cn(GLASS, "grid size-11 place-items-center hover:bg-black/60", logOpen && "bg-black/70")}>
            <ScrollText className="size-5" />
          </button>
          <SoundToggle />
          {isPlayer && <ReactionPicker onReact={onReact} disabled={!connected} align="end" side="bottom" />}
        </div>
      </header>

      {!connected && (
        <p role="status" className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-bold text-black">
          <WifiOff className="size-3.5" />Reconnecting… your key and progress are saved
        </p>
      )}
      {error && <p role="alert" className="uno-rise absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl bg-red-500/95 px-4 py-2 text-sm font-semibold shadow-xl">{error}</p>}

      {/* Phone: both players and the mission count */}
      <div className="relative z-10 flex items-center gap-2 px-2 pb-2 lg:hidden">
        {[selfId, partnerId].map((id) => {
          const player = state.players[id]
          if (!player) return null
          const acting = !over && (suddenDeath || (duet.phase === "giving-clue" ? duet.giverId === id : duet.giverId !== id))
          return (
            <div key={id} className={cn(GLASS, "relative flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5")} style={acting ? { borderColor: `${DUET_HEX}aa`, boxShadow: `0 0 22px ${DUET_HEX}45` } : undefined}>
              <Avatar id={id} name={player.name} size={24} className={cn(player.connected === false && "opacity-40")} />
              <span className="min-w-0 truncate text-sm font-semibold">{id === playerId ? "You" : player.name}</span>
              <span className="ml-auto font-mono text-lg font-black">{id === selfId ? duet.myAgentsRemaining : duet.partnerAgentsRemaining}</span>
              <ReactionBubble bubble={reactions[id]} side="bottom" />
            </div>
          )
        })}
        <div className={cn(GLASS, "flex shrink-0 flex-col items-center rounded-xl px-2.5 py-1")}>
          <span className="font-mono text-sm font-black">{15 - duet.agentsRemaining}/15</span>
          <span className="text-[9px] font-bold uppercase text-white/50">{turnsLeft} turns</span>
        </div>
      </div>

      <main className="relative z-10 flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-3">
        {seat(selfId, "left")}
        <div ref={boardRef} className="relative grid min-h-0 min-w-0 flex-1 place-items-center">
          <BoardGrid size={boardSize}>
            {(metrics) =>
              state.board.map((card, index) => {
                const found = duet.found.includes(index)
                const selfOut = duet.bystanders[selfId]?.includes(index)
                const partnerOut = duet.bystanders[partnerId]?.includes(index)
                let back: CardFace | null = found ? "green" : null
                let flipped = found
                let flipDelay = 0
                // A missed guess turns over for its beat, then settles back with a marker.
                if (guessBeat?.stage === "flip" && guessBeat.cardIndex === index && guessBeat.result !== "correct") {
                  back = guessBeat.result === "assassin" ? "assassin" : "neutral"
                  flipped = true
                }
                if (over && key && !found) {
                  back = keyFace(key[index])
                  flipped = true
                  flipDelay = index * KEY_FLIP_STAGGER
                }
                const mark = view === "key" && !over && !found ? keyFace(duet.myKey?.[index]) : null
                const locked = guessBeat?.stage === "tension" && guessBeat.cardIndex === index
                const mine = myIntent === index && !found ? DUET_HEX : null
                const chips = Object.entries(state.intents)
                  .filter(([id, target]) => target === index && id !== playerId)
                  .map(([id]) => ({ id, name: state.players[id]?.name ?? "?" }))
                const corner = !found && (selfOut || partnerOut) && (
                  <span className="pointer-events-none absolute bottom-1 right-1 flex gap-0.5">
                    {selfOut && <span title={`Bystander for ${isPlayer ? "you" : self?.name}`} className="rounded bg-[#d6c194] px-1 text-[9px] font-black text-[#3b2e14] shadow">{isPlayer ? "Y" : initial(selfId)}✕</span>}
                    {partnerOut && <span title={`Bystander for ${partner?.name ?? "partner"}`} className="rounded bg-[#a78bfa] px-1 text-[9px] font-black text-[#1e1236] shadow">{isPlayer ? "P" : initial(partnerId)}✕</span>}
                  </span>
                )
                return (
                  <WordCard
                    key={index}
                    word={card.word}
                    w={metrics.w}
                    h={metrics.h}
                    back={back}
                    flipped={flipped}
                    flipDelay={flipDelay}
                    used={found}
                    mark={mark}
                    locked={locked}
                    lockedBy={locked ? nameOf(guessBeat!.byId) : undefined}
                    dim={guessBeat?.stage === "tension" && !locked && !found}
                    mine={mine}
                    chips={chips}
                    corner={corner}
                    disabled={!canConsider || found || Boolean(selfOut)}
                    label={`${card.word}${found ? ", found agent" : mark ? `, your key: ${faceLabel(mark)}` : ""}${selfOut && !found ? ", ruled out for you" : ""}${partnerOut && !found ? ", ruled out for your partner" : ""}${mine ? ", you are considering it" : ""}`}
                    onClick={() => pick(index)}
                  />
                )
              })
            }
          </BoardGrid>
          {toast}
        </div>
        {seat(partnerId, "right")}
      </main>

      <footer className="relative z-20 flex flex-col items-center gap-1 px-2 pb-2 sm:pb-3">
        {view === "key" && !over && <p className="text-[11px] text-white/55">Your key marks what <strong>your partner</strong> should find. It doesn't tell you what's safe when you guess.</p>}
        {view === "partner" && over && <p className="text-[11px] text-white/55">Your partner's key — the one your guesses were checked against.</p>}
        <div className={cn(GLASS, "flex w-full max-w-2xl items-center justify-center px-3 py-2.5")}>{actionBar}</div>
      </footer>

      {logOpen && (
        <div className={cn(GLASS, "uno-rise absolute bottom-24 right-2 top-16 z-30 w-[min(20rem,calc(100%-1rem))] overflow-y-auto bg-[#0b121b]/95 p-3")}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">Clue log</p>
            <button type="button" aria-label="Close clue log" onClick={() => setLogOpen(false)} className="grid size-8 place-items-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
          </div>
          <ClueLog groups={groups} words={words} faceOf={faceOf} empty="Clues and the cards guessed under them show up here." />
          <p className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-5 text-white/45">Each key has 9 agents and 3 assassins. Three agents overlap, so there are 15 to find together. A card ruled out for one player can still be an agent for the other.</p>
        </div>
      )}

      {overlay}

      {showResults && outcome && (
        <div className="uno-fade-in absolute inset-0 z-40 grid place-items-center bg-black/45 p-4">
          {duet.outcome === "win" && <Confetti colors={[DUET_HEX, "#ffffff", "#fde68a"]} />}
          <div className={cn(GLASS, "uno-pop relative w-full max-w-md bg-[#0b121b]/90 p-6 text-center")} style={{ boxShadow: `0 0 90px ${outcome.hex}50` }}>
            <outcome.Icon className="mx-auto size-14" style={{ color: outcome.hex }} />
            <h2 className="mt-3 text-4xl font-black uppercase tracking-wide" style={{ color: outcome.hex }}>{outcome.title}</h2>
            <p className="mt-2 text-sm text-white/75">{outcome.line}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/50">{15 - duet.agentsRemaining} of 15 agents · {duet.turnsUsed} turns</p>
            <div className="mt-5 flex flex-col gap-2">
              {isHost ? (
                <BarButton hex={DUET_HEX} disabled={!connected} onClick={onRestart} className="justify-center">New mission</BarButton>
              ) : (
                <p className="rounded-xl bg-white/5 p-2.5 text-sm text-white/60">Waiting for the host to start again…</p>
              )}
              <div className="flex gap-2">
                <BarButton onClick={() => setResultsHidden(true)} className="flex-1 justify-center"><Eye className="size-4" />View keys</BarButton>
                <BarButton onClick={onLeave} className="flex-1 justify-center">Leave</BarButton>
              </div>
            </div>
            {state.spectators.length > 0 && (
              <div className="mt-4">
                <SpectatorSeats spectators={state.spectators} canSeat={isHost} seatsLeft={2 - Object.keys(state.players).length} onSeat={onSeat} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
