import { Check, Clock, Trophy, Vote } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { PublicGameState, Stroke } from "../../../../party/drawing"
import { Canvas } from "./Canvas"
import { Toolbar } from "./Toolbar"

interface DrawVoteGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  connected: boolean
  onStroke: (stroke: Stroke) => void
  onUndo: () => void
  onClear: () => void
  onSubmit: () => void
  onVote: (entryId: string) => void
  onNext: () => void
  onRestart: () => void
  onLeave: () => void
}

export function DrawVoteGame({
  gameState, playerId, isHost, connected, onStroke, onUndo, onClear,
  onSubmit, onVote, onNext, onRestart, onLeave,
}: DrawVoteGameProps) {
  const [color, setColor] = useState("#000000")
  const [size, setSize] = useState(8)
  const [now, setNow] = useState(Date.now)
  const [selection, setSelection] = useState<string | null>(null)
  const round = gameState.drawVote

  useEffect(() => {
    if (!round?.deadline) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [round?.deadline])

  useEffect(() => setSelection(null), [gameState.roundNumber])

  if (!round) return null
  const timeLeft = round.deadline ? Math.max(0, Math.ceil((round.deadline - now) / 1000)) : 0
  const drawing = round.phase === "drawing"
  const results = round.phase === "results"
  const finished = gameState.status === "finished"
  const editable = drawing && !round.submitted && connected && timeLeft > 0
  const selectedId = round.selectedEntryId ?? selection
  const canVote = round.canVote && connected && timeLeft > 0
  const players = Object.values(gameState.players).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
  const leaders = players.filter((player) => player.score === players[0]?.score)
  const mostVotes = Math.max(0, ...round.entries.map((entry) => entry.votes ?? 0))

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="font-medium text-muted-foreground">Round {gameState.roundNumber} / {gameState.totalRounds}</p>
          <ol aria-label="Round stages" className="flex gap-3 text-xs font-semibold sm:gap-5">
            {["Draw", "Vote", "Reveal"].map((label, index) => (
              <li key={label} aria-current={index === (drawing ? 0 : results ? 2 : 1) ? "step" : undefined}
                className={index === (drawing ? 0 : results ? 2 : 1) ? "text-primary" : "text-muted-foreground"}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          {round.deadline && <p className={`flex items-center gap-1.5 font-mono font-bold ${timeLeft <= 10 ? "text-destructive" : ""}`}>
            <Clock className="h-4 w-4" />{timeLeft}s
          </p>}
        </div>
        <div className="border-y border-border py-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {drawing ? "One prompt. Everyone draws." : results ? "The artists revealed" : "The anonymous gallery"}
          </p>
          <h1 className="mt-2 text-3xl font-black capitalize tracking-tight sm:text-5xl">{gameState.currentWord}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {drawing ? "Make it your own. Your drawing stays private until voting begins."
              : results ? "Each vote earns its artist one point."
                : "Pick your favorite, then lock in your vote. You cannot vote for yourself."}
          </p>
        </div>
      </header>

      {!connected && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Reconnecting… drawing and voting will resume when you’re connected.</p>}

      {drawing ? (
        <section className="mx-auto max-w-4xl space-y-3" aria-label="Your private drawing">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite">
            <p className="font-semibold">{round.submitted ? "Drawing locked in" : "Your canvas"}</p>
            <p className="text-muted-foreground">{round.submittedCount} / {round.participantCount} ready</p>
          </div>
          <Canvas key={gameState.roundNumber} strokes={round.draft} revision={round.draftRevision}
            isDrawer={editable} disabled={!editable} onStroke={onStroke} color={color} size={size} />
          {!round.submitted && <Toolbar selectedColor={color} selectedSize={size}
            onColorChange={setColor} onSizeChange={setSize} onClear={onClear} onUndo={onUndo}
            canUndo={round.draft.length > 0} disabled={!editable} />}
          <div className="flex flex-col items-center gap-2 py-2">
            {round.submitted ? <p role="status" className="flex items-center gap-2 text-sm font-medium"><Check className="h-4 w-4 text-primary" />Waiting for the other artists…</p>
              : <><Button onClick={onSubmit} disabled={!editable} className="w-full sm:w-auto">{round.draft.length ? "Submit drawing" : "Skip drawing"}</Button>
                <p className="text-center text-xs text-muted-foreground">Finished strokes save automatically. When time runs out, we submit what you’ve drawn.</p></>}
          </div>
        </section>
      ) : (
        <section className="space-y-4" aria-label={results ? "Round results" : "Vote for a drawing"}>
          {!results && <div className="flex flex-wrap justify-between gap-2 text-sm" aria-live="polite">
            <p className="font-semibold">{round.selectedEntryId ? "Vote locked in. Waiting for the reveal…" : round.canVote ? "Which drawing gets your vote?" : "No eligible drawing to vote for. Waiting for the reveal…"}</p>
            <p className="text-muted-foreground">{round.votedCount} votes cast</p>
          </div>}
          {round.entries.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">No drawings this round. No points awarded.</p>}
          <div className="grid gap-5 md:grid-cols-2">
            {round.entries.map((entry, index) => (
              <article key={entry.id} className={`overflow-hidden rounded-xl border-2 p-3 ${!results && selectedId === entry.id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <div role="img" aria-label={`Drawing ${index + 1}${results ? ` by ${entry.authorName}` : ""}`} className="pointer-events-none">
                  <Canvas strokes={entry.strokes} isDrawer={false} disabled onStroke={() => {}} color="#000000" size={8} />
                </div>
                <div className="flex items-center justify-between gap-3 px-1 pt-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{results ? entry.authorName : `Drawing ${index + 1}`}{entry.isOwn && <span className="ml-2 text-xs font-normal text-muted-foreground">Yours</span>}</p>
                    {results && <p className="text-sm text-muted-foreground">{entry.votes} {entry.votes === 1 ? "vote" : "votes"} · +{entry.votes} points</p>}
                  </div>
                  {results ? (mostVotes > 0 && entry.votes === mostVotes && <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary"><Trophy className="h-4 w-4" />Round favorite</span>)
                    : <Button variant={selectedId === entry.id ? "default" : "outline"} size="sm"
                        aria-pressed={selectedId === entry.id} aria-label={`Select drawing ${index + 1}`}
                        disabled={!canVote || entry.isOwn} onClick={() => setSelection(entry.id)}>
                        {selectedId === entry.id ? <><Check className="mr-1 h-4 w-4" />Selected</> : "Choose"}
                      </Button>}
                </div>
              </article>
            ))}
          </div>
          {!results && round.canVote && <div className="sticky bottom-4 mx-auto w-fit rounded-xl border bg-background p-2 shadow-lg">
            <Button disabled={!canVote || !selection} onClick={() => { if (selection) onVote(selection) }}>
              <Vote className="mr-2 h-4 w-4" />Lock in vote
            </Button>
          </div>}
        </section>
      )}

      {results && <section className="rounded-xl border bg-card p-5" aria-label="Standings">
        <h2 className="text-xl font-bold">{finished ? "Final standings" : "Standings"}</h2>
        {finished && <p className="mt-1 text-sm text-muted-foreground">
          {players[0]?.score > 0 ? `${leaders.map((player) => player.name).join(" & ")}${leaders.length > 1 ? " share the win!" : " wins!"}` : "No points awarded this game."}
        </p>}
        <ol className="mt-4 space-y-2">{players.map((player) => <li key={player.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${player.id === playerId ? "bg-primary/10" : "bg-muted/50"}`}>
          <span className="truncate font-medium">{player.name}{player.id === playerId ? " (you)" : ""}</span>
          <span className="ml-3 shrink-0 font-mono font-bold">{player.score} pts</span>
        </li>)}</ol>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {isHost ? <Button onClick={finished ? onRestart : onNext} disabled={!connected}>{finished ? "Play again" : "Next round"}</Button>
            : <p className="text-sm text-muted-foreground">Waiting for the host…</p>}
          {finished && <Button variant="outline" onClick={onLeave}>Back to menu</Button>}
        </div>
      </section>}
    </div>
  )
}
