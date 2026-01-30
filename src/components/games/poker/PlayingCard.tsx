import { cn } from "@/lib/utils"

const RANK_DISPLAY: Record<number, string> = {
  0: "2", 1: "3", 2: "4", 3: "5", 4: "6", 5: "7", 6: "8",
  7: "9", 8: "10", 9: "J", 10: "Q", 11: "K", 12: "A",
}

const SUIT_DISPLAY: Record<number, string> = {
  0: "\u2663", // clubs
  1: "\u2666", // diamonds
  2: "\u2665", // hearts
  3: "\u2660", // spades
}

const SUIT_COLOR: Record<number, string> = {
  0: "text-zinc-900 dark:text-zinc-100",
  1: "text-red-500",
  2: "text-red-500",
  3: "text-zinc-900 dark:text-zinc-100",
}

interface PlayingCardProps {
  card: number | null
  faceDown?: boolean
  size?: "sm" | "md" | "lg"
  highlighted?: boolean
  className?: string
}

const SIZES = {
  sm: "w-8 h-11 text-[10px]",
  md: "w-12 h-[68px] text-sm",
  lg: "w-16 h-[92px] text-base",
}

export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  highlighted = false,
  className,
}: PlayingCardProps) {
  if (card === null || card === undefined || faceDown) {
    return (
      <div
        className={cn(
          "rounded-lg border-2 flex items-center justify-center",
          "bg-gradient-to-br from-blue-600 to-blue-800 border-blue-500",
          "shadow-md",
          SIZES[size],
          className
        )}
      >
        <div className="w-3/4 h-3/4 rounded border border-blue-400/40 bg-blue-700/50" />
      </div>
    )
  }

  const rank = card % 13
  const suit = Math.floor(card / 13)

  return (
    <div
      className={cn(
        "rounded-lg border-2 flex flex-col items-center justify-between p-0.5",
        "bg-white dark:bg-zinc-900 shadow-md",
        highlighted
          ? "border-yellow-400 ring-2 ring-yellow-400/50"
          : "border-zinc-300 dark:border-zinc-600",
        SUIT_COLOR[suit],
        SIZES[size],
        className
      )}
    >
      <span className="font-bold leading-none">{RANK_DISPLAY[rank]}</span>
      <span className="leading-none">{SUIT_DISPLAY[suit]}</span>
    </div>
  )
}
