import { useState, useEffect, useMemo } from "react"
import { Clock, Trophy, RotateCcw, Copy, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WordChain } from "./WordChain"
import { WordInput } from "./WordInput"
import { PlayerList } from "./PlayerList"
import type { PublicGameState } from "../../../../party/wordchain"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onSubmitWord: (word: string) => void
  onRestart: () => void
  onLeave: () => void
}

export function MultiplayerGame({
  gameState,
  playerId,
  isHost,
  onSubmitWord,
  onRestart,
  onLeave,
}: MultiplayerGameProps) {
  const [timeLeft, setTimeLeft] = useState(gameState.turnTimeLimit)
  const [copied, setCopied] = useState(false)

  const isMyTurn = playerId === gameState.currentPlayerId
  const isPlaying = gameState.status === "playing"
  const isFinished = gameState.status === "finished"
  const currentPlayer = gameState.currentPlayerId
    ? gameState.players[gameState.currentPlayerId]
    : null
  const myPlayer = gameState.players[playerId]
  const isEliminated = myPlayer?.eliminated || false

  // Get the letter the next word must start with
  const mustStartWith = useMemo(() => {
    if (gameState.wordChain.length === 0) return ""
    const lastWord = gameState.wordChain[gameState.wordChain.length - 1]
    return lastWord[lastWord.length - 1].toUpperCase()
  }, [gameState.wordChain])

  // Timer countdown
  useEffect(() => {
    if (!isPlaying || !gameState.turnStartedAt) {
      setTimeLeft(gameState.turnTimeLimit)
      return
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - gameState.turnStartedAt!) / 1000)
      const remaining = Math.max(0, gameState.turnTimeLimit - elapsed)
      setTimeLeft(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 100)
    return () => clearInterval(interval)
  }, [isPlaying, gameState.turnStartedAt, gameState.turnTimeLimit, gameState.currentPlayerId])

  // Get sorted results for final screen
  const sortedResults = useMemo(() => {
    const players = Object.values(gameState.players)
    // Winner first, then non-eliminated, then eliminated
    return players.sort((a, b) => {
      if (a.id === gameState.winnerId) return -1
      if (b.id === gameState.winnerId) return 1
      if (a.eliminated && !b.eliminated) return 1
      if (!a.eliminated && b.eliminated) return -1
      return 0
    })
  }, [gameState.players, gameState.winnerId])

  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null

  const copyCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Determine input placeholder
  const getInputPlaceholder = () => {
    if (isEliminated) return "You have been eliminated"
    if (!isMyTurn) return `Waiting for ${currentPlayer?.name || "..."}...`
    return mustStartWith ? `Enter a word starting with "${mustStartWith}"` : "Enter any word"
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto p-2 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <Badge variant="outline" className="text-xs font-mono flex items-center gap-1">
          {gameState.roomCode}
          <button onClick={copyCode} className="ml-1">
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </Badge>

        {isPlaying && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            timeLeft <= 5 ? "text-destructive animate-pulse" : ""
          }`}>
            <Clock className="w-4 h-4" />
            {timeLeft}s
          </div>
        )}

        <Badge variant="secondary" className="text-xs">
          {gameState.wordChain.length} words
        </Badge>
      </div>

      {/* Current Turn Indicator */}
      {isPlaying && currentPlayer && (
        <div className={`text-center py-2 rounded-lg ${
          isMyTurn
            ? "bg-primary/10 text-primary font-bold"
            : "bg-muted text-muted-foreground"
        }`}>
          {isMyTurn ? (
            <span>Your turn! Enter a word starting with "{mustStartWith}"</span>
          ) : (
            <span>Waiting for <strong>{currentPlayer.name}</strong> to play...</span>
          )}
        </div>
      )}

      {/* Word Chain Display */}
      <Card className="flex-1 min-h-0 overflow-hidden">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Word Chain</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 overflow-auto h-full">
          <WordChain words={gameState.wordChain} />
        </CardContent>
      </Card>

      {/* Input Area */}
      {isPlaying && !isEliminated && (
        <div className="px-2">
          <WordInput
            mustStartWith={mustStartWith}
            onSubmit={onSubmitWord}
            disabled={!isMyTurn}
            placeholder={getInputPlaceholder()}
          />
        </div>
      )}

      {/* Eliminated message */}
      {isPlaying && isEliminated && (
        <div className="text-center py-4 bg-destructive/10 rounded-lg">
          <p className="text-destructive font-medium">
            You have been eliminated
            {myPlayer.eliminatedReason && (
              <span className="text-sm ml-1">
                ({myPlayer.eliminatedReason === "timeout" ? "ran out of time" :
                  myPlayer.eliminatedReason === "invalid" ? "invalid word" :
                  myPlayer.eliminatedReason === "repeated" ? "word already used" :
                  myPlayer.eliminatedReason === "wrong-letter" ? "wrong starting letter" :
                  "eliminated"})
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Watch the remaining players compete!
          </p>
        </div>
      )}

      {/* Players */}
      <div className="px-2">
        <PlayerList
          players={gameState.players}
          playerOrder={gameState.playerOrder}
          currentPlayerId={gameState.currentPlayerId}
          localPlayerId={playerId}
          hostId={gameState.hostId}
          winnerId={gameState.winnerId}
          showReason={false}
        />
      </div>

      {/* Game Over Dialog */}
      <Dialog open={isFinished}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl flex items-center justify-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              Game Over!
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Winner Announcement */}
            {winner && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Winner</p>
                <p className="text-xl font-bold text-primary">
                  {winner.name}
                  {winner.id === playerId && " (You!)"}
                </p>
              </div>
            )}

            {/* Word Chain Stats */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Words Chained</p>
              <p className="text-3xl font-bold">{gameState.wordChain.length}</p>
            </div>

            {/* Final Word Chain */}
            <div className="max-h-32 overflow-auto bg-muted/50 rounded-lg p-2">
              <WordChain words={gameState.wordChain} />
            </div>

            {/* Player Results */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-center">Results</p>
              {sortedResults.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    player.id === gameState.winnerId
                      ? "bg-yellow-500/10 border border-yellow-500/30"
                      : player.eliminated
                        ? "bg-destructive/10"
                        : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium w-6">{index + 1}.</span>
                    <span className="font-medium">{player.name}</span>
                    {player.id === playerId && (
                      <Badge variant="outline" className="text-xs">You</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.id === gameState.winnerId && (
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    )}
                    {player.eliminated && (
                      <span className="text-xs text-muted-foreground">
                        {player.eliminatedReason === "timeout" ? "Timeout" :
                         player.eliminatedReason === "invalid" ? "Invalid" :
                         player.eliminatedReason === "repeated" ? "Repeated" :
                         player.eliminatedReason === "wrong-letter" ? "Wrong letter" :
                         "Out"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {isHost ? (
                <Button onClick={onRestart} className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Play Again
                </Button>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  Waiting for host to start a new game...
                </p>
              )}
              <Button onClick={onLeave} variant="outline" className="w-full">
                Back to Menu
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
