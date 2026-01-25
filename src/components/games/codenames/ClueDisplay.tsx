import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import type { Clue, Team } from "../../../../party/codenames"

interface ClueDisplayProps {
  clue: Clue
  guessesRemaining: number
  guessedThisTurn: number
  canEndGuessing: boolean
  onEndGuessing: () => void
}

export function ClueDisplay({
  clue,
  guessesRemaining,
  guessedThisTurn,
  canEndGuessing,
  onEndGuessing,
}: ClueDisplayProps) {
  const teamColor = clue.team === "red"
    ? "text-red-600 dark:text-red-400"
    : "text-blue-600 dark:text-blue-400"

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-3">
        <span className={cn("text-2xl font-bold uppercase", teamColor)}>
          {clue.word}
        </span>
        <span className="text-xl font-mono bg-muted px-2 py-1 rounded">
          {clue.count === 0 ? "∞" : clue.count}
        </span>
      </div>

      <div className="text-sm text-muted-foreground">
        {clue.count === 0 ? (
          <span>Unlimited guesses</span>
        ) : (
          <span>
            {guessesRemaining} guess{guessesRemaining !== 1 ? "es" : ""} remaining
            {guessedThisTurn > 0 && ` (${guessedThisTurn} made)`}
          </span>
        )}
      </div>

      {canEndGuessing && guessedThisTurn > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEndGuessing}
          className="mt-1"
        >
          <ArrowRight className="w-4 h-4 mr-1" />
          End Turn
        </Button>
      )}
    </div>
  )
}
