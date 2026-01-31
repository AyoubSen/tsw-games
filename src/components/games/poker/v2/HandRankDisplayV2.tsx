import { evaluateBestHand, type HandResult } from "@/lib/poker/handEvaluator"
import { cn } from "@/lib/utils"

interface HandRankDisplayProps {
  holeCards: number[]
  communityCards: number[]
  className?: string
}

// Gradient colors by hand strength (category 0-9)
const HAND_GRADIENTS: Record<number, string> = {
  0: "from-zinc-500 to-zinc-600",       // High Card
  1: "from-zinc-400 to-zinc-500",       // One Pair
  2: "from-sky-500 to-sky-600",         // Two Pair
  3: "from-blue-500 to-blue-600",       // Three of a Kind
  4: "from-emerald-500 to-emerald-600", // Straight
  5: "from-teal-500 to-teal-600",       // Flush
  6: "from-purple-500 to-purple-600",   // Full House
  7: "from-orange-500 to-orange-600",   // Four of a Kind
  8: "from-amber-400 to-yellow-500",    // Straight Flush
  9: "from-yellow-400 to-amber-500",    // Royal Flush
}

const SUIT_DECORATIONS = ["\u2660", "\u2665", "\u2666", "\u2663"]

export function HandRankDisplay({ holeCards, communityCards, className }: HandRankDisplayProps) {
  if (holeCards.length !== 2 || communityCards.length < 3) {
    return null
  }

  const result: HandResult = evaluateBestHand(holeCards, communityCards)
  const gradient = HAND_GRADIENTS[result.category] || HAND_GRADIENTS[0]

  return (
    <div className={cn("text-center", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white shadow-md",
          "bg-gradient-to-r",
          gradient
        )}
      >
        <span className="opacity-60">{SUIT_DECORATIONS[result.category % 4]}</span>
        <span>{result.description}</span>
      </span>
    </div>
  )
}
