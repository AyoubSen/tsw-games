import { useEffect, useState } from "react"
import { Check, KeyRound, Skull, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DuetCardType, PublicGameState } from "../../../../party/codenames"

interface DuetGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  connected: boolean
  error: string | null
  onClue: (word: string, count: number) => boolean
  onGuess: (index: number) => boolean
  onPass: () => boolean
  onRestart: () => void
  onLeave: () => void
}

const KEY_LABELS: Record<DuetCardType, string> = {
  agent: "Agent", bystander: "Bystander", assassin: "Assassin",
}

function DuetClueForm({ remaining, disabled, onSubmit }: {
  remaining: number
  disabled: boolean
  onSubmit: (word: string, count: number) => boolean
}) {
  const [word, setWord] = useState("")
  const [count, setCount] = useState(1)
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault()
    if (!disabled && /^[A-Za-z]{1,30}$/.test(word.trim())) onSubmit(word.trim(), count)
  }}>
    <div className="flex gap-2">
      <div className="min-w-0 flex-1"><label htmlFor="duet-clue" className="mb-1 block text-xs font-semibold">One-word clue</label>
        <Input id="duet-clue" value={word} onChange={(event) => setWord(event.target.value)} maxLength={30} placeholder="e.g. Orbit" autoComplete="off" disabled={disabled} />
      </div>
      <div><label htmlFor="duet-count" className="mb-1 block text-xs font-semibold">Agents</label>
        <select id="duet-count" value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={disabled} className="h-10 rounded-md border bg-background px-3 text-sm">
          {Array.from({ length: remaining }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </div>
    <Button className="w-full" disabled={disabled || !/^[A-Za-z]{1,30}$/.test(word.trim()) || remaining < 1}>Send clue</Button>
    <p className="text-xs leading-5 text-muted-foreground">Link the green agents on your key. No board words, spelling hints, or extra explanation.</p>
  </form>
}

export function DuetGame({ gameState, playerId, isHost, connected, error, onClue, onGuess, onPass, onRestart, onLeave }: DuetGameProps) {
  const duet = gameState.duet
  const [view, setView] = useState<"guess" | "mine" | "partner">("guess")
  const [selection, setSelection] = useState<number | null>(null)
  const finished = gameState.status === "finished"
  const givingClue = duet?.phase === "giving-clue" && duet.giverId === playerId

  useEffect(() => {
    setView(givingClue || finished ? "mine" : "guess")
    setSelection(null)
  }, [givingClue, duet?.turnId, duet?.phase, finished])
  useEffect(() => setSelection(null), [duet?.revision])

  if (!duet) return null
  const partnerId = duet.playerIds.find((id) => id !== playerId) ?? ""
  const partner = gameState.players[partnerId]
  const suddenDeath = duet.phase === "sudden-death"
  const canGuess = !finished && connected && duet.partnerAgentsRemaining > 0 &&
    (suddenDeath || (duet.phase === "guessing" && duet.giverId !== playerId))
  const canPass = canGuess && !suddenDeath && duet.guessesThisTurn > 0
  const key = view === "mine" ? duet.myKey : view === "partner" && finished ? duet.partnerKey : null
  const lastGuess = duet.lastGuess
  const turnsLeft = duet.turnLimit - duet.turnsUsed

  return <main className="mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-5">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5">
      <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-300"><Users className="h-4 w-4" />Duet · Shared mission</p>
        <h2 className="mt-2 text-2xl font-black">{finished ? duet.outcome === "win" ? "All agents found. Together." : "Mission over." : suddenDeath ? "One last chance. No new clues." : givingClue ? "Find the connection." : duet.phase === "giving-clue" ? `${partner?.name ?? "Your partner"} is thinking…` : canGuess ? "Follow your partner’s clue." : "Your partner is guessing."}</h2>
      </div>
      <div className="flex gap-6 text-center"><div><p className="font-mono text-3xl font-bold">{15 - duet.agentsRemaining}<span className="text-lg text-muted-foreground">/15</span></p><p className="text-xs text-muted-foreground">Agents found</p></div>
        <div><p className="font-mono text-3xl font-bold">{turnsLeft}</p><p className="text-xs text-muted-foreground">Turns left</p></div></div>
    </header>

    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p>}
    {!connected && <p role="status" className="text-sm text-muted-foreground">Reconnecting… your key and progress are saved.</p>}
    {!finished && partner?.connected === false && <p role="status" className="text-sm text-muted-foreground">Your partner is reconnecting. There is no countdown; take your time.</p>}
    {!finished && suddenDeath && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">All {duet.turnLimit} turns are spent. Either player can guess remaining agents using earlier clues. A bystander or assassin now loses the mission.</p>}

    {finished && <section className="space-y-3 rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{duet.outcome === "win" ? `You found every agent${suddenDeath ? " in sudden death" : ""}. Both players share the win.` : duet.outcome === "assassin" ? "An assassin was selected on the clue giver’s key. A card’s type can differ between your two keys." : duet.outcome === "bystander" ? "A bystander ended sudden death. Review both keys and try a fresh board." : "Your partner left the mission. Return to the lobby to play again."}</p>
      <div className="flex flex-wrap gap-2">{isHost ? <Button disabled={!connected} onClick={onRestart}>New mission</Button> : <p className="py-2 text-sm text-muted-foreground">Waiting for the host to start again…</p>}<Button variant="outline" onClick={onLeave}>Leave room</Button></div>
    </section>}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 space-y-3" aria-label="Duet board">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={view === "guess" ? "default" : "outline"} aria-pressed={view === "guess"} onClick={() => { setView("guess"); setSelection(null) }}>Guess board</Button>
          <Button size="sm" variant={view === "mine" ? "default" : "outline"} aria-pressed={view === "mine"} onClick={() => { setView("mine"); setSelection(null) }}><KeyRound className="mr-1 h-4 w-4" />Your clue key</Button>
          {finished && <Button size="sm" variant={view === "partner" ? "default" : "outline"} aria-pressed={view === "partner"} onClick={() => setView("partner")}>Partner’s key</Button>}
        </div>
        <p className="min-h-10 text-xs leading-5 text-muted-foreground">{view === "mine" ? "This is the key for clues YOU give. Its green agents are for your partner to guess. It does not tell you which cards are safe when YOU guess." : view === "partner" ? "This was your partner’s key—the one used to evaluate your guesses." : "Guess using your partner’s clue. A Y marker means you ruled that card out; P means your partner did. A card ruled out for one player can still be an agent for the other."}</p>

        {!finished && duet.clue && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
          <span className="text-xs text-muted-foreground">{duet.clue.givenBy}’s clue</span>
          <p className="break-all text-xl font-black">{duet.clue.word} <span className="ml-2 rounded-lg bg-violet-500/10 px-2 font-mono text-violet-600 dark:text-violet-300">{duet.clue.count}</span></p>
        </div>}

        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {gameState.board.map((card, index) => {
            const found = duet.found.includes(index)
            const ownBystander = duet.bystanders[playerId]?.includes(index)
            const partnerBystander = duet.bystanders[partnerId]?.includes(index)
            const type = key?.[index]
            const selectable = view === "guess" && canGuess && !found && !ownBystander
            const styles = found ? "border-emerald-600 bg-emerald-600 text-white"
              : type === "agent" ? "border-emerald-500 bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
                : type === "assassin" ? "border-slate-600 bg-slate-900 text-white"
                  : "border-border bg-card text-foreground"
            return <button key={index} type="button" disabled={!selectable} aria-pressed={selection === index}
              aria-label={`${card.word}${found ? ", found agent" : type ? `, ${KEY_LABELS[type]} on this key` : ""}${ownBystander && !found ? ", ruled out for you" : ""}${partnerBystander && !found ? ", ruled out for partner" : ""}`}
              onClick={() => setSelection(index)} className={`relative flex min-h-24 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border-2 px-1 py-3 text-center transition-colors sm:min-h-28 sm:px-2 ${styles} ${selection === index ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-background" : ""} ${selectable ? "cursor-pointer hover:border-violet-400 focus-visible:outline-2 focus-visible:outline-violet-500" : "cursor-default"}`}>
              <span className="break-all text-[10px] font-bold leading-tight sm:text-sm xl:text-base">{card.word}</span>
              <span className="flex items-center gap-1 text-[8px] sm:text-[10px]">{found ? <><Check className="h-3 w-3" />Found</> : type === "assassin" ? <><Skull className="h-3 w-3" />Assassin</> : type ? KEY_LABELS[type] : ""}</span>
              {!found && (ownBystander || partnerBystander) && <span className="absolute bottom-1 right-1 flex gap-1 text-[8px] font-bold sm:text-[10px]">{ownBystander && <span title="Ruled out for you" className="rounded bg-amber-200 px-1 text-amber-950">Y</span>}{partnerBystander && <span title="Ruled out for partner" className="rounded bg-violet-200 px-1 text-violet-950">P</span>}</span>}
            </button>
          })}
        </div>
        {lastGuess && <p role="status" className="rounded-lg bg-muted/50 p-3 text-sm"><strong>{lastGuess.playerId === playerId ? "You" : partner?.name ?? "Your partner"}</strong> chose <strong>{gameState.board[lastGuess.cardIndex]?.word}</strong>: {KEY_LABELS[lastGuess.type].toLowerCase()}.{lastGuess.type === "bystander" && !suddenDeath && !finished ? " The turn ended." : ""}</p>}
        {canGuess && view === "guess" && <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-3 shadow-lg">
          <Button disabled={selection === null} onClick={() => { if (selection !== null && onGuess(selection)) setSelection(null) }}>{selection === null ? "Select a word" : `Confirm ${gameState.board[selection].word}`}</Button>
          {!suddenDeath && <Button variant="outline" disabled={!canPass} onClick={onPass}>End turn</Button>}
        </div>}
      </section>

      <aside className="space-y-4">
        {!finished && <section className="space-y-3 rounded-xl border bg-card p-4">
          {givingClue ? <><h3 className="font-bold">Give {partner?.name ?? "your partner"} a clue</h3><DuetClueForm key={duet.turnId} remaining={duet.myAgentsRemaining} disabled={!connected} onSubmit={onClue} /></>
            : duet.clue ? <><h3 className="font-bold">{canGuess ? "Your turn to guess" : "Your partner’s turn"}</h3>
              <p className="text-xs leading-5 text-muted-foreground">{canGuess ? "Guess at least once, then continue or end the turn. You may use older clues and make more guesses than the clue’s number." : "Let your partner decide. A correct agent is found for both of you."}</p></>
              : <p className="text-sm text-muted-foreground">{suddenDeath ? "Use the clue history below. No new clues are allowed." : "Your partner is preparing a clue. Their key stays private."}</p>}
        </section>}
        <section className="rounded-xl border bg-card p-4"><h3 className="font-bold">Two keys, one team</h3><div className="mt-3 space-y-2 text-sm text-muted-foreground"><p>Your partner still needs <strong className="text-foreground">{duet.myAgentsRemaining}</strong> agents from your key.</p><p>You still need <strong className="text-foreground">{duet.partnerAgentsRemaining}</strong> agents from theirs.</p><p className="border-t pt-3 text-xs leading-5">Each key starts with 9 agents and 3 assassins. Three agents overlap, so there are 15 to find together. No time pressure.</p></div></section>
        <section className="rounded-xl border bg-card p-4"><h3 className="font-bold">Clue history</h3>{duet.history.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Your clues will appear here.</p> : <ol className="mt-3 space-y-3">{duet.history.map((clue, index) => <li key={index} className="border-l-2 border-violet-500/30 pl-3"><p className="text-xs text-muted-foreground">Turn {index + 1} · {clue.givenBy}</p><p className="break-words text-sm font-bold">{clue.word} · {clue.count}</p></li>)}</ol>}</section>
      </aside>
    </div>
  </main>
}
