import { evaluateBestHand } from "@/lib/poker/handEvaluator"
import { cn } from "@/lib/utils"

interface HandRankDisplayProps {
  holeCards: number[]
  communityCards: number[]
  className?: string
}

export function HandRankDisplay({ holeCards, communityCards, className }: HandRankDisplayProps) {
  if (holeCards.length !== 2 || communityCards.length < 3) {
    return null
  }

  const result = evaluateBestHand(holeCards, communityCards)

  return (
    <div className={cn("text-center", className)}>
      <span className="text-xs text-muted-foreground">Your hand: </span>
      <span className="text-sm font-medium text-primary">{result.description}</span>
    </div>
  )
}
