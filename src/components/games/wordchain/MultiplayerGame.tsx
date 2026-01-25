import { useState, useEffect, useMemo } from "react"
import { Clock, Trophy, RotateCcw, Copy, Check, Heart, Skull } from "lucide-react"
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
  const isHardcore = gameState.gameMode === "hardcore"

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
    // Winner first, then by hearts remaining (desc), then eliminated
    return [...players].sort((a, b) => {
      if (a.id === gameState.winnerId) return -1
      if (b.id === gameState.winnerId) return 1
      if (a.eliminated && !b.eliminated) return 1
      if (!a.eliminated && b.eliminated) return -1
      // Sort by hearts remaining
      return (b.hearts ?? 0) - (a.hearts ?? 0)
    })
  }, [gameState.players, gameState.winnerId])

  // Game stats for the modal
  const gameStats = useMemo(() => {
    const words = gameState.wordChain
    if (words.length === 0) return null

    const longestWord = words.reduce((a, b) => a.length >= b.length ? a : b, "")
    const shortestWord = words.reduce((a, b) => a.length <= b.length ? a : b, words[0])
    const avgLength = (words.reduce((sum, w) => sum + w.length, 0) / words.length).toFixed(1)

    return {
      total: words.length,
      longest: longestWord,
      shortest: shortestWord,
      avgLength,
      firstWord: words[0],
      lastWord: words[words.length - 1],
    }
  }, [gameState.wordChain])

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

        <div className="flex items-center gap-2">
          {!isHardcore && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Heart className="w-3 h-3 text-red-500 fill-red-500" />
              {myPlayer?.hearts ?? 0}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {gameState.wordChain.length} words
          </Badge>
        </div>
      </div>

      {/* Game Mode Indicator */}
      <div className="flex justify-center">
        <Badge variant={isHardcore ? "destructive" : "default"} className="text-xs">
          {isHardcore ? (
            <>
              <Skull className="w-3 h-3 mr-1" />
              Hardcore
            </>
          ) : (
            <>
              <Heart className="w-3 h-3 mr-1" />
              Casual
            </>
          )}
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
          maxHearts={gameState.maxHearts}
        />
      </div>

      {/* Game Over Dialog */}
      <Dialog open={isFinished}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl flex items-center justify-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              Game Over!
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Winner Announcement */}
            {winner && (
              <div className="text-center py-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Winner</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {winner.name}
                  {winner.id === playerId && " (You!)"}
                </p>
              </div>
            )}

            {/* Game Stats */}
            {gameStats && (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-2xl font-bold">{gameStats.total}</p>
                  <p className="text-xs text-muted-foreground">Words</p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-lg font-bold">{gameStats.avgLength}</p>
                  <p className="text-xs text-muted-foreground">Avg Length</p>
                </div>
              </div>
            )}

            {/* Chain Preview */}
            {gameStats && (
              <div className="text-center text-sm text-muted-foreground">
                <span className="font-mono uppercase">{gameStats.firstWord}</span>
                <span className="mx-2">→ ... →</span>
                <span className="font-mono uppercase">{gameStats.lastWord}</span>
              </div>
            )}

            {/* Player Results */}
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {sortedResults.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                    player.id === gameState.winnerId
                      ? "bg-yellow-500/10 border border-yellow-500/30"
                      : player.eliminated
                        ? "bg-destructive/5 opacity-60"
                        : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-5 text-muted-foreground">{index + 1}.</span>
                    <span className="font-medium truncate max-w-[120px]">{player.name}</span>
                    {player.id === playerId && (
                      <span className="text-xs text-muted-foreground">(You)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {player.id === gameState.winnerId && (
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    )}
                    {!isHardcore && player.hearts !== undefined && (
                      <span className="text-xs flex items-center gap-0.5">
                        <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                        {player.hearts}
                      </span>
                    )}
                    {player.eliminated && (
                      <Skull className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {isHost ? (
                <Button onClick={onRestart} className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Play Again
                </Button>
              ) : (
                <p className="text-sm text-center text-muted-foreground py-2">
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
