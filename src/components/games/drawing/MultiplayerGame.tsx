import { useState, useEffect, useMemo } from "react"
import { Clock, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Canvas } from "./Canvas"
import { Toolbar } from "./Toolbar"
import { WordDisplay } from "./WordDisplay"
import { GuessList } from "./GuessList"
import { GuessInput } from "./GuessInput"
import { ScoreBoard } from "./ScoreBoard"
import type { PublicGameState, Stroke, Guess } from "../../../../party/drawing"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  strokes: Stroke[]
  guesses: Guess[]
  onStroke: (stroke: Stroke) => void
  onClear: () => void
  onGuess: (text: string) => void
  onLeave: () => void
}

export function MultiplayerGame({
  gameState,
  playerId,
  strokes,
  guesses,
  onStroke,
  onClear,
  onGuess,
  onLeave,
}: MultiplayerGameProps) {
  const [selectedColor, setSelectedColor] = useState("#000000")
  const [selectedSize, setSelectedSize] = useState(4)
  const [timeLeft, setTimeLeft] = useState(gameState.roundTimeLimit)

  const isDrawer = playerId === gameState.currentDrawerId
  const isPlaying = gameState.status === "playing"
  const isRoundEnd = gameState.status === "round-end"
  const isFinished = gameState.status === "finished"
  const hasGuessedCorrectly = gameState.correctGuessers.includes(playerId)

  const currentDrawer = gameState.currentDrawerId
    ? gameState.players[gameState.currentDrawerId]
    : null

  // Timer countdown
  useEffect(() => {
    if (!isPlaying || !gameState.roundStartedAt) {
      setTimeLeft(gameState.roundTimeLimit)
      return
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - gameState.roundStartedAt!) / 1000)
      const remaining = Math.max(0, gameState.roundTimeLimit - elapsed)
      setTimeLeft(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [isPlaying, gameState.roundStartedAt, gameState.roundTimeLimit])

  // Get sorted results for final screen
  const sortedResults = useMemo(() => {
    return Object.values(gameState.players).sort((a, b) => b.score - a.score)
  }, [gameState.players])

  const winner = sortedResults[0]

  // Determine if guess input should be disabled
  const guessDisabled = isDrawer || hasGuessedCorrectly || !isPlaying

  // Get placeholder text for guess input
  const getGuessPlaceholder = () => {
    if (isDrawer) return "You are drawing..."
    if (hasGuessedCorrectly) return "You guessed correctly!"
    if (!isPlaying) return "Waiting for round to start..."
    return "Type your guess..."
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto p-2 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <Badge variant="outline" className="text-xs">
          Round {gameState.roundNumber}/{gameState.totalRounds}
        </Badge>

        {isPlaying && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            timeLeft <= 10 ? "text-destructive" : ""
          }`}>
            <Clock className="w-4 h-4" />
            {timeLeft}s
          </div>
        )}

        <Badge variant="secondary" className="text-xs font-mono">
          {gameState.roomCode}
        </Badge>
      </div>

      {/* Word Display */}
      <WordDisplay
        word={gameState.currentWord}
        isDrawer={isDrawer}
        wordLength={gameState.wordLength}
        isRoundEnd={isRoundEnd}
      />

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col md:flex-row gap-2 min-h-0">
        {/* Canvas Section */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <Canvas
            strokes={strokes}
            isDrawer={isDrawer}
            onStroke={onStroke}
            color={selectedColor}
            size={selectedSize}
            disabled={!isPlaying || isRoundEnd}
          />

          {/* Toolbar for drawer */}
          {isDrawer && isPlaying ? (
            <Toolbar
              selectedColor={selectedColor}
              selectedSize={selectedSize}
              onColorChange={setSelectedColor}
              onSizeChange={setSelectedSize}
              onClear={onClear}
              disabled={!isPlaying}
            />
          ) : (
            <div className="text-center text-sm text-muted-foreground py-2">
              {currentDrawer ? (
                <span><strong>{currentDrawer.name}</strong> is drawing...</span>
              ) : (
                <span>Waiting for drawer...</span>
              )}
            </div>
          )}
        </div>

        {/* Chat/Guesses Section */}
        <Card className="md:w-72 flex flex-col min-h-[200px] md:min-h-0">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Guesses</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-2 px-3 pb-3 min-h-0">
            <GuessList
              guesses={guesses}
              playerId={playerId}
              correctGuessers={gameState.correctGuessers}
            />
            <GuessInput
              onSubmit={onGuess}
              disabled={guessDisabled}
              placeholder={getGuessPlaceholder()}
            />
          </CardContent>
        </Card>
      </div>

      {/* Score Board */}
      <ScoreBoard
        players={gameState.players}
        currentDrawerId={gameState.currentDrawerId}
        playerId={playerId}
        correctGuessers={gameState.correctGuessers}
      />

      {/* Round End Overlay */}
      {isRoundEnd && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-40">
          <Card className="max-w-sm mx-4">
            <CardHeader className="text-center">
              <CardTitle>Round Complete!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <WordDisplay
                word={gameState.currentWord}
                isDrawer={false}
                wordLength={gameState.wordLength}
                isRoundEnd={true}
              />
              <p className="text-sm text-center text-muted-foreground">
                Next round starting soon...
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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
                <p className="text-2xl font-bold">{winner.score} points</p>
              </div>
            )}

            {/* Full Rankings */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-center">Final Standings</p>
              <ScoreBoard
                players={gameState.players}
                currentDrawerId={null}
                playerId={playerId}
                correctGuessers={[]}
                showRanking={true}
              />
            </div>

            <Button onClick={onLeave} className="w-full">
              Back to Menu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
