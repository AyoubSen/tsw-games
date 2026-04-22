import { evaluateBestHand, type HandResult } from "@/lib/poker/handEvaluator"
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

  const result: HandResult = evaluateBestHand(holeCards, communityCards)

  return (
    <div className={cn("text-center", className)}>
      <span
        className="inline-block px-3 py-1 rounded-full text-xs font-semibold"
        style={{
          color: "#e4e4e7",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {result.description}
      </span>
    </div>
  )
}
