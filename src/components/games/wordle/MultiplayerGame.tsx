import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Copy, Check, Trophy, Users, Clock, X, RotateCcw, Eye, EyeOff, Palette, Share2 } from "lucide-react"
import { Board } from "./Board"
import { Keyboard } from "./Keyboard"
import { MiniBoard } from "./MiniBoard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PrivatePlayerState, PublicGameState } from "../../../../party/wordle"
import { buildKnownPattern, buildShareText, type Letter, type LetterState } from "./useWordle"
import type { RoundReveal } from "./useMultiplayerWordle"

type UsedLetters = Record<string, LetterState>

interface MultiplayerGameProps {
  gameState: PublicGameState
  privatePlayer: PrivatePlayerState | null
  playerId: string
  isHost: boolean
  connected: boolean
  error: string | null
  onGuess: (word: string) => boolean
  onRestart: () => void
  onLeave: () => void
  waitingFor: string[]
  isWaitingForOthers: boolean
  roundReveal: RoundReveal | null
  onDismissReveal: () => void
  colorblind: boolean
  onToggleColorblind: () => void
}

const MAX_GUESSES = 6
const WORD_LENGTH = 5

export function MultiplayerGame({
  gameState,
  privatePlayer,
  playerId,
  isHost,
  connected,
  error,
  onGuess,
  onRestart,
  onLeave,
  waitingFor,
  isWaitingForOthers,
  roundReveal,
  onDismissReveal,
  colorblind,
  onToggleColorblind,
}: MultiplayerGameProps) {
  const [currentGuess, setCurrentGuess] = useState("")
  const [shake, setShake] = useState(false)
  const [revealRow, setRevealRow] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resultCopied, setResultCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [visualization, setVisualization] = useState<Letter[] | null>(null)
  const previousAttemptsRef = useRef(privatePlayer?.attempts ?? 0)
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const guesses = useMemo<Letter[][]>(() => {
    const rows: Letter[][] = privatePlayer
      ? privatePlayer.guesses.map(row => row.map(tile => ({ ...tile })))
      : []
    while (rows.length < MAX_GUESSES) rows.push([])
    return rows.slice(0, MAX_GUESSES)
  }, [privatePlayer])

  const usedLetters = useMemo<UsedLetters>(() => {
    const used: UsedLetters = {}
    for (const row of guesses) {
      for (const { char, state } of row) {
        const current = used[char]
        if (state === "correct") used[char] = "correct"
        else if (state === "present" && current !== "correct") used[char] = "present"
        else if (!current) used[char] = state
      }
    }
    return used
  }, [guesses])

  const knownPattern = useMemo(() => buildKnownPattern(guesses, WORD_LENGTH), [guesses])

  const currentRow = Math.min(privatePlayer?.attempts ?? 0, MAX_GUESSES)
  const canPlay = connected && gameState.status === "playing" && Boolean(privatePlayer) &&
    !privatePlayer?.completed && !isWaitingForOthers && !submitting && roundReveal === null
  const players = Object.values(gameState.players)

  const showMessage = useCallback((text: string, duration = 1800) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    setMessage(text)
    messageTimerRef.current = setTimeout(() => setMessage(null), duration)
  }, [])

  useEffect(() => {
    if (!privatePlayer) return
    if (privatePlayer.attempts > previousAttemptsRef.current) {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
      setRevealRow(privatePlayer.attempts - 1)
      revealTimerRef.current = setTimeout(() => setRevealRow(null), WORD_LENGTH * 300 + 200)
    }
    previousAttemptsRef.current = privatePlayer.attempts
    setCurrentGuess("")
    setVisualization(null)
    setSubmitting(false)
  }, [privatePlayer])

  useEffect(() => {
    if (!error) return
    setSubmitting(false)
    showMessage(error)
  }, [error, showMessage])

  useEffect(() => {
    if (gameState.status === "finished") {
      setVisualization(null)
    }
  }, [gameState.status])

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
    }
  }, [])

  const submitGuess = useCallback(() => {
    if (visualization) return
    if (!canPlay) {
      if (!connected) showMessage("Reconnecting...")
      else if (isWaitingForOthers) showMessage("Waiting for other players...")
      return
    }
    if (currentGuess.length !== WORD_LENGTH) {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current)
      setShake(true)
      shakeTimerRef.current = setTimeout(() => setShake(false), 500)
      showMessage("Not enough letters")
      return
    }
    if (onGuess(currentGuess)) setSubmitting(true)
  }, [canPlay, connected, currentGuess, isWaitingForOthers, onGuess, showMessage, visualization])

  const addLetter = useCallback((letter: string) => {
    if (!canPlay) return
    setVisualization(null)
    setCurrentGuess(prev => prev.length < WORD_LENGTH ? prev + letter.toUpperCase() : prev)
  }, [canPlay])

  const removeLetter = useCallback(() => {
    if (!canPlay) return
    if (visualization) {
      setVisualization(null)
      return
    }
    setCurrentGuess(prev => prev.slice(0, -1))
  }, [canPlay, visualization])

  const toggleVisualization = useCallback(() => {
    if (!canPlay || currentGuess || !knownPattern) return
    setVisualization(current => current ? null : knownPattern)
  }, [canPlay, currentGuess, knownPattern])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return
      if (event.key === "Enter") submitGuess()
      else if (event.key === "Backspace") removeLetter()
      else if (/^[a-zA-Z]$/.test(event.key)) addLetter(event.key)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [submitGuess, addLetter, removeLetter])

  const copyInviteCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareResult = async () => {
    if (!privatePlayer) return
    const modeName = gameState.mode === "one-lie"
      ? "Wordle One Lie"
      : gameState.hardMode ? "Wordle Hard" : "Wordle"
    const label = gameState.seriesLength > 1
      ? `${modeName} Round ${gameState.seriesRound}/${gameState.seriesLength}`
      : modeName
    await navigator.clipboard.writeText(buildShareText(
      guesses,
      privatePlayer.won,
      privatePlayer.attempts,
      label,
      colorblind,
    ))
    setResultCopied(true)
    setTimeout(() => setResultCopied(false), 2000)
  }

  const modeLabel = gameState.mode === "race"
    ? "Race"
    : gameState.mode === "one-lie"
      ? "One Lie"
      : gameState.revealMode === "after-round" ? "Classic (Rounds)" : "Classic (Hidden)"
  const winners = gameState.winnerIds.map(id => gameState.results.find(result => result.id === id)).filter(Boolean)
  const results = gameState.results.length > 0
    ? [...gameState.results].sort((a, b) => {
        if (a.won && !b.won) return -1
        if (!a.won && b.won) return 1
        return a.attempts - b.attempts
      })
    : []
  const resultTitle = gameState.winnerIds.includes(playerId)
    ? "You Won!"
    : winners.length === 1
      ? `${winners[0]!.name} Won!`
      : winners.length > 1 ? "Tie Game!" : "Game Over"
  const seriesWinners = gameState.seriesWinnerIds
    .map(id => players.find(player => player.id === id))
    .filter(Boolean)
  const displayTitle = gameState.seriesComplete && gameState.seriesLength > 1
    ? gameState.seriesWinnerIds.includes(playerId)
      ? "You Won the Series!"
      : seriesWinners.length === 1
        ? `${seriesWinners[0]!.name} Won the Series!`
        : seriesWinners.length > 1 ? "Series Tied!" : resultTitle
    : resultTitle

  return (
    <div className="min-h-[calc(100vh-73px)] bg-background flex flex-col">
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <Badge variant="secondary">{modeLabel}</Badge>
            {gameState.hardMode && <Badge variant="outline">Hard</Badge>}
            {gameState.seriesLength > 1 && (
              <Badge variant="outline">Round {gameState.seriesRound}/{gameState.seriesLength}</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{gameState.roomCode}</code>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyInviteCode}>
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onLeave}>
            <X className="w-4 h-4 mr-1" />
            Leave
          </Button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <Users className="w-4 h-4 text-muted-foreground shrink-0" />
          {players.map(player => {
            const ownPrivate = player.id === playerId ? privatePlayer : null
            const completed = ownPrivate?.completed ?? player.completed
            const won = ownPrivate?.won ?? player.won
            const attempts = ownPrivate?.attempts ?? player.attempts
            return (
              <div
                key={player.id}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs shrink-0 ${
                  player.id === playerId
                    ? "bg-primary/20 text-primary"
                    : completed
                      ? won
                        ? colorblind ? "bg-blue-500/20 text-blue-500" : "bg-green-500/20 text-green-600"
                        : "bg-red-500/20 text-red-600"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="font-medium">{player.name}</span>
                {gameState.seriesLength > 1 && <span className="opacity-70">{gameState.seriesScores[player.id] ?? 0}W</span>}
                {(gameState.mode === "race" || gameState.mode === "one-lie") && !completed && <span className="opacity-70">({attempts}/6)</span>}
                {!player.connected && <span className="opacity-70">offline</span>}
                {completed && (won ? <Trophy className="w-3 h-3" /> : <X className="w-3 h-3" />)}
              </div>
            )
          })}
        </div>

        {gameState.mode === "classic" && gameState.revealMode === "after-round" && gameState.status === "playing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Round {Math.min(gameState.currentTurn + 1, 6)} of 6</span>
            {isWaitingForOthers && waitingFor.length > 0 && (
              <span className="text-yellow-500">Waiting for: {waitingFor.join(", ")}</span>
            )}
          </div>
        )}
        {gameState.mode === "one-lie" && gameState.status === "playing" && (
          <p className="text-sm text-muted-foreground">One yellow or gray tile in every incorrect row is lying.</p>
        )}
        {!connected && <p className="text-sm text-muted-foreground">Connection lost. Your board is paused while reconnecting...</p>}
        {!privatePlayer && gameState.status === "playing" && <p className="text-sm text-muted-foreground">Restoring your board...</p>}
        {privatePlayer?.completed && gameState.status === "playing" && (
          <p className="text-sm text-muted-foreground">Your board is complete. Waiting for the remaining players...</p>
        )}
      </div>

      {message && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-lg font-semibold z-50 animate-fade-in">
          {message}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-start gap-6 px-2 py-4 sm:px-4">
        {gameState.status === "finished" && (
          <div className="grid w-full max-w-2xl items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="hidden sm:block" />
            <div className="text-center sm:col-start-2">
              <p className="text-sm font-semibold">{displayTitle}</p>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Correct word</p>
              <p className={`mt-1 text-3xl font-bold uppercase tracking-[0.25em] ${colorblind ? "text-blue-500" : "text-green-500"}`}>
                {gameState.targetWord}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-self-end">
              <Button variant="outline" onClick={shareResult} disabled={!privatePlayer} size="sm">
                {resultCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                {resultCopied ? "Copied" : "Share"}
              </Button>
              {isHost ? (
                <Button onClick={onRestart} disabled={!connected} size="sm">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {gameState.seriesLength > 1
                    ? gameState.seriesComplete ? "New Series" : "Next Round"
                    : "Play Again"}
                </Button>
              ) : (
                <p className="max-w-40 text-center text-xs text-muted-foreground">
                  Waiting for host to start a new game...
                </p>
              )}
            </div>
          </div>
        )}

        <Board
          guesses={guesses}
          currentGuess={currentGuess}
          currentRow={currentRow}
          shake={shake}
          revealRow={revealRow}
          maxGuesses={MAX_GUESSES}
          wordLength={WORD_LENGTH}
          visualization={visualization}
          colorblind={colorblind}
        />

        {gameState.status === "finished" ? (
          <div className="w-full max-w-2xl space-y-4">
            <div className="space-y-2">
              <p className="text-center text-sm font-medium">Results</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {results.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between rounded-lg p-2 ${player.id === playerId ? "bg-primary/10" : "bg-muted/50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-sm font-medium">{index + 1}.</span>
                      <span className="font-medium">{player.name}</span>
                      {player.id === playerId && <Badge variant="outline" className="text-xs">You</Badge>}
                    </div>
                    {gameState.seriesLength > 1 && (
                      <Badge variant="secondary" className="ml-auto mr-2 text-xs">
                        {gameState.seriesScores[player.id] ?? 0} wins
                      </Badge>
                    )}
                    {player.won ? (
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm">{player.attempts}/6</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Failed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(gameState.revealedBoards).length > 0 && (
              <div className="flex flex-wrap justify-center gap-5 border-t pt-4">
                {results.map(player => (
                  <MiniBoard
                    key={player.id}
                    guesses={gameState.revealedBoards[player.id] ?? []}
                    playerName={player.name}
                    isCurrentPlayer={player.id === playerId}
                    colorblind={colorblind}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button variant={colorblind ? "default" : "outline"} onClick={onToggleColorblind}>
                <Palette className="w-4 h-4 mr-2" />
                Colorblind
              </Button>
              <Button onClick={onLeave} variant="outline">Back to Menu</Button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg space-y-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant={colorblind ? "default" : "outline"} size="sm" onClick={onToggleColorblind}>
                <Palette className="w-4 h-4 mr-2" />
                Colorblind
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleVisualization}
                disabled={!canPlay || !knownPattern || currentGuess.length > 0}
              >
                {visualization ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {visualization ? "Clear visualization" : "Visualize known letters"}
              </Button>
            </div>
            <div className={canPlay ? "" : "pointer-events-none opacity-60"}>
              <Keyboard
                usedLetters={usedLetters}
                onKey={addLetter}
                onEnter={submitGuess}
                onBackspace={removeLetter}
                colorblind={colorblind}
              />
            </div>
          </div>
        )}
      </div>

      <Dialog open={roundReveal !== null} onOpenChange={open => !open && onDismissReveal()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center">Round {roundReveal?.turn} Complete</DialogTitle>
            <DialogDescription className="text-center">Here is how everyone is doing</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-center gap-6 py-2">
            {players.map(player => (
              <MiniBoard
                key={player.id}
                guesses={roundReveal?.playerGuesses[player.id] ?? []}
                playerName={player.name}
                isCurrentPlayer={player.id === playerId}
                highlighted
                colorblind={colorblind}
              />
            ))}
          </div>
          <Button onClick={onDismissReveal} className="w-full mt-2">Continue</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
