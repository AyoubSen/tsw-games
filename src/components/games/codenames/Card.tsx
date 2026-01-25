import { cn } from "@/lib/utils"
import { Skull } from "lucide-react"
import type { CardType } from "../../../../party/codenames"

interface CardProps {
  word: string
  type: CardType | null
  revealed: boolean
  isSpymaster: boolean
  canGuess: boolean
  onClick: () => void
}

export function Card({
  word,
  type,
  revealed,
  isSpymaster,
  canGuess,
  onClick,
}: CardProps) {
  const getCardStyles = () => {
    if (revealed) {
      // Revealed cards show their true color
      switch (type) {
        case "red":
          return "bg-red-500 text-white border-red-600"
        case "blue":
          return "bg-blue-500 text-white border-blue-600"
        case "neutral":
          return "bg-amber-100 text-amber-800 border-amber-300"
        case "assassin":
          return "bg-zinc-900 text-white border-zinc-950"
        default:
          return "bg-muted"
      }
    }

    if (isSpymaster && type) {
      // Spymaster sees faded colors for unrevealed cards
      switch (type) {
        case "red":
          return "bg-red-500/20 border-red-400 text-red-700 dark:text-red-300"
        case "blue":
          return "bg-blue-500/20 border-blue-400 text-blue-700 dark:text-blue-300"
        case "neutral":
          return "bg-amber-100/50 border-amber-300 text-amber-700 dark:text-amber-300"
        case "assassin":
          return "bg-zinc-800/30 border-zinc-600 text-zinc-700 dark:text-zinc-300"
        default:
          return "bg-muted"
      }
    }

    // Default unrevealed card for guessers
    return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-foreground"
  }

  const isClickable = canGuess && !revealed

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        "relative w-full aspect-[4/3] rounded-lg border-2 font-bold text-xs sm:text-sm uppercase tracking-wide transition-all duration-200",
        "flex items-center justify-center p-1",
        getCardStyles(),
        isClickable && "hover:scale-105 hover:shadow-lg cursor-pointer",
        !isClickable && "cursor-default",
        revealed && "shadow-inner"
      )}
    >
      {type === "assassin" && revealed && (
        <Skull className="absolute top-1 right-1 w-4 h-4 opacity-70" />
      )}
      {type === "assassin" && isSpymaster && !revealed && (
        <Skull className="absolute top-1 right-1 w-3 h-3 opacity-50" />
      )}
      <span className="break-words text-center leading-tight">{word}</span>
    </button>
  )
}
