import { useEffect, useRef } from "react"
import { RotateCcw, Play, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TextDisplay } from "./TextDisplay"
import type { GameStatus } from "./useTypeRace"

interface SinglePlayerGameProps {
  text: string
  typedText: string
  gameStatus: GameStatus
  wpm: number
  accuracy: number
  onInput: (text: string) => void
  onStart: () => void
  onReset: () => void
  onBack: () => void
}

export function SinglePlayerGame({
  text,
  typedText,
  gameStatus,
  wpm,
  accuracy,
  onInput,
  onStart,
  onReset,
  onBack,
}: SinglePlayerGameProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when game starts
  useEffect(() => {
    if (gameStatus === "playing" && inputRef.current) {
      inputRef.current.focus()
    }
  }, [gameStatus])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onInput(e.target.value)
  }

  // Idle state - show start button
  if (gameStatus === "idle") {
    return (
      <div className="flex flex-col items-center gap-6 p-4 max-w-md mx-auto">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Type Race</h1>
          <p className="text-muted-foreground">
            Type the text as fast and accurately as you can!
          </p>
        </div>

        <Button onClick={onStart} size="lg" className="gap-2">
          <Play className="w-5 h-5" />
          Start Game
        </Button>

        <Button variant="ghost" onClick={onBack}>
          Back to Menu
        </Button>
      </div>
    )
  }

  // Playing state
  if (gameStatus === "playing") {
    return (
      <div className="flex flex-col items-center gap-4 p-4 max-w-2xl mx-auto">
        {/* Stats */}
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-3xl font-bold">{wpm}</p>
            <p className="text-sm text-muted-foreground">WPM</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">{accuracy}%</p>
            <p className="text-sm text-muted-foreground">Accuracy</p>
          </div>
        </div>

        {/* Text Display */}
        <Card className="w-full">
          <CardContent className="p-4">
            <TextDisplay text={text} typedText={typedText} />
          </CardContent>
        </Card>

        {/* Hidden Input */}
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

        {/* Focus hint */}
        <button
          onClick={() => inputRef.current?.focus()}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Click here or start typing to focus
        </button>

        {/* Reset button */}
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
      </div>
    )
  }

  // Finished state
  return (
    <div className="flex flex-col items-center gap-6 p-4 max-w-md mx-auto">
      {/* Results */}
      <Card className="w-full bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30">
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <Trophy className="w-12 h-12 text-yellow-500" />
          <div className="text-center">
            <p className="text-2xl font-bold">Great Job!</p>
            <p className="text-muted-foreground">You completed the text</p>
          </div>

          <div className="flex items-center gap-8 mt-2">
            <div className="text-center">
              <p className="text-4xl font-bold">{wpm}</p>
              <p className="text-sm text-muted-foreground">WPM</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold">{accuracy}%</p>
              <p className="text-sm text-muted-foreground">Accuracy</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={onStart} className="gap-2">
          <Play className="w-4 h-4" />
          Play Again
        </Button>
        <Button variant="outline" onClick={onBack}>
          Back to Menu
        </Button>
      </div>
    </div>
  )
}
