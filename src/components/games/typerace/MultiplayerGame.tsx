import { useState, useEffect, useRef, useCallback } from "react"
import { Trophy, Crown, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { TextDisplay } from "./TextDisplay"
import type { PublicGameState, Player } from "../../../../party/typerace"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onProgress: (progress: number, wpm: number, accuracy: number) => void
  onComplete: (wpm: number, accuracy: number) => void
  onRestart: () => void
  onLeave: () => void
}

export function MultiplayerGame({
  gameState,
  playerId,
  isHost,
  onProgress,
  onComplete,
  onRestart,
  onLeave,
}: MultiplayerGameProps) {
  const [typedText, setTypedText] = useState("")
  const [startTime, setStartTime] = useState<number | null>(null)
  const [wpm, setWpm] = useState(0)
  const [accuracy, setAccuracy] = useState(100)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasCompleted = useRef(false)

  const text = gameState.text
  const players = Object.values(gameState.players)
  const currentPlayer = gameState.players[playerId]
  const isFinished = gameState.status === "finished"
  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null

  // Focus input on mount and when game starts
  useEffect(() => {
    if (gameState.status === "playing" && inputRef.current) {
      inputRef.current.focus()
    }
  }, [gameState.status])

  // Set start time when game starts
  useEffect(() => {
    if (gameState.status === "playing" && gameState.startedAt) {
      setStartTime(gameState.startedAt)
    }
  }, [gameState.status, gameState.startedAt])

  // Calculate WPM
  const calculateWPM = useCallback((correctChars: number, start: number) => {
    const elapsedMs = Date.now() - start
    if (elapsedMs < 1000) return 0
    const minutes = elapsedMs / 60000
    const words = correctChars / 5
    return Math.round(words / minutes)
  }, [])

  // Handle input change
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isFinished || hasCompleted.current) return

    const newTypedText = e.target.value
    setTypedText(newTypedText)

    if (!startTime) return

    // Count correct characters
    let correctChars = 0
    for (let i = 0; i < newTypedText.length && i < text.length; i++) {
      if (newTypedText[i] === text[i]) {
        correctChars++
      }
    }

    const totalTyped = newTypedText.length
    const newAccuracy = totalTyped > 0 ? Math.round((correctChars / totalTyped) * 100) : 100
    const newWpm = calculateWPM(correctChars, startTime)
    const progress = Math.round((correctChars / text.length) * 100)

    setWpm(newWpm)
    setAccuracy(newAccuracy)

    // Send progress update
    onProgress(progress, newWpm, newAccuracy)

    // Check completion
    if (newTypedText === text) {
      hasCompleted.current = true
      onComplete(newWpm, newAccuracy)
    }
  }, [text, startTime, isFinished, calculateWPM, onProgress, onComplete])

  // Update WPM periodically
  useEffect(() => {
    if (gameState.status !== "playing" || !startTime || hasCompleted.current) return

    const interval = setInterval(() => {
      let correctChars = 0
      for (let i = 0; i < typedText.length && i < text.length; i++) {
        if (typedText[i] === text[i]) {
          correctChars++
        }
      }
      setWpm(calculateWPM(correctChars, startTime))
    }, 500)

    return () => clearInterval(interval)
  }, [gameState.status, startTime, typedText, text, calculateWPM])

  // Sort players by progress (and completion time for finished)
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.completed && b.completed) {
      return (a.completedAt || 0) - (b.completedAt || 0)
    }
    if (a.completed) return -1
    if (b.completed) return 1
    return b.progress - a.progress
  })

  return (
    <div className="flex flex-col items-center gap-4 p-4 max-w-2xl mx-auto">
      {/* Game Status */}
      {isFinished && winner && (
        <Card className="w-full bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
          <CardContent className="flex items-center justify-center gap-3 p-4">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <div className="text-center">
              <p className="font-bold text-lg">
                {winner.id === playerId ? "You Win!" : `${winner.name} Wins!`}
              </p>
              <p className="text-sm text-muted-foreground">
                {winner.wpm} WPM • {winner.accuracy}% accuracy
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Text to Type */}
      <Card className="w-full">
        <CardContent className="p-4">
          <TextDisplay text={text} typedText={typedText} />
        </CardContent>
      </Card>

      {/* Hidden Input */}
      {!isFinished && !currentPlayer?.completed && (
        <input
          ref={inputRef}
          type="text"
          value={typedText}
          onChange={handleInput}
          className="sr-only"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      )}

      {/* Click to focus hint */}
      {gameState.status === "playing" && !currentPlayer?.completed && (
        <button
          onClick={() => inputRef.current?.focus()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Click here or start typing to focus
        </button>
      )}

      {/* Your Stats */}
      {!isFinished && (
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold">{wpm}</p>
            <p className="text-muted-foreground">WPM</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{accuracy}%</p>
            <p className="text-muted-foreground">Accuracy</p>
          </div>
        </div>
      )}

      {/* Players Progress */}
      <Card className="w-full">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">Players</p>
          {sortedPlayers.map((player) => (
            <PlayerProgress
              key={player.id}
              player={player}
              isCurrentPlayer={player.id === playerId}
              isHost={player.id === gameState.hostId}
              isWinner={player.id === gameState.winnerId}
            />
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      {isFinished && (
        <div className="flex flex-col items-center gap-2">
          {isHost ? (
            <Button onClick={onRestart}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for host to start a new game...
            </p>
          )}
          <Button variant="outline" onClick={onLeave}>
            Back to Menu
          </Button>
        </div>
      )}
    </div>
  )
}

interface PlayerProgressProps {
  player: Player
  isCurrentPlayer: boolean
  isHost: boolean
  isWinner: boolean
}

function PlayerProgress({ player, isCurrentPlayer, isHost, isWinner }: PlayerProgressProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isCurrentPlayer && "bg-primary/5 border-primary/20",
        isWinner && "bg-yellow-500/10 border-yellow-500/30"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isWinner && <Trophy className="w-4 h-4 text-yellow-500" />}
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
            {player.name.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-sm">{player.name}</span>
          {isCurrentPlayer && (
            <span className="text-xs text-muted-foreground">(You)</span>
          )}
          {isHost && <Crown className="w-3 h-3 text-yellow-500" />}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{player.wpm} WPM</span>
          <span>{player.accuracy}%</span>
        </div>
      </div>
      <Progress value={player.progress} className="h-2" />
      {player.completed && (
        <p className="text-xs text-green-500 mt-1">Finished!</p>
      )}
    </div>
  )
}
