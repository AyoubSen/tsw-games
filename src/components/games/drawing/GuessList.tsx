import { useRef, useEffect } from "react"
import { Check } from "lucide-react"
import type { Guess } from "../../../../party/drawing"

interface GuessListProps {
  guesses: Guess[]
  playerId: string
  correctGuessers: string[]
}

export function GuessList({ guesses, playerId, correctGuessers }: GuessListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new guesses come in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [guesses])

  if (guesses.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No guesses yet...
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto space-y-1.5 pr-1"
    >
      {guesses.map((guess, index) => {
        const isOwnGuess = guess.playerId === playerId
        const hasGuessedCorrectly = correctGuessers.includes(guess.playerId)

        return (
          <div
            key={index}
            className={`flex items-start gap-2 p-1.5 rounded text-sm ${
              guess.isCorrect
                ? "bg-green-100 dark:bg-green-900/30"
                : isOwnGuess
                ? "bg-primary/10"
                : "bg-muted/50"
            }`}
          >
            <div className="flex-1 min-w-0">
              <span className={`font-medium ${hasGuessedCorrectly ? "text-green-600 dark:text-green-400" : ""}`}>
                {guess.playerName}
                {isOwnGuess && " (you)"}:
              </span>{" "}
              {guess.isCorrect ? (
                <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1 inline-flex">
                  <Check className="w-3 h-3" />
                  Correct!
                </span>
              ) : (
                <span className="text-muted-foreground">{guess.text}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
