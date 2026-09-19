import { evaluateBestHand, type HandResult } from "@/lib/poker/handEvaluator"
import { cn } from "@/lib/utils"

interface HandRankDisplayProps {
  holeCards: number[]
  communityCards: number[]
  className?: string
}

export function HandRankDisplay({
  holeCards,
  communityCards,
  className,
}: HandRankDisplayProps) {
  if (holeCards.length !== 2 || communityCards.length < 3) {
    return null
  }

  const result: HandResult = evaluateBestHand(holeCards, communityCards)

  return (
    <span
      className={cn(
        "rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20",
        className,
      )}
    >
      {result.description}
    </span>
  )
}
