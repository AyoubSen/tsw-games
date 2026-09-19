import { cn } from "@/lib/utils"

const RANK_DISPLAY: Record<number, string> = {
  0: "2", 1: "3", 2: "4", 3: "5", 4: "6", 5: "7", 6: "8",
  7: "9", 8: "10", 9: "J", 10: "Q", 11: "K", 12: "A",
}

const SUIT_DISPLAY: Record<number, string> = {
  0: "♣", // clubs
  1: "♦", // diamonds
  2: "♥", // hearts
  3: "♠", // spades
}

// Red suits sit slightly muted so they don't vibrate against the felt.
const SUIT_COLOR: Record<number, string> = {
  0: "text-[#1a1a1e]",
  1: "text-[#c0392b]",
  2: "text-[#c0392b]",
  3: "text-[#1a1a1e]",
}

type CardSize = "xs" | "sm" | "md" | "lg"

interface PlayingCardProps {
  card: number | null
  faceDown?: boolean
  size?: CardSize
  highlighted?: boolean
  dimmed?: boolean
  className?: string
}

/**
 * Sizes keep a ~0.7 aspect ratio (real playing-card proportions).
 * Small cards drop the corner index entirely and show one big centered
 * rank + suit, which stays legible where a miniature card face turns to mush.
 */
const SIZES: Record<
  CardSize,
  { box: string; rank: string; suit: string; corner: boolean; radius: string }
> = {
  xs: { box: "w-7 h-10", rank: "text-[13px]", suit: "text-[10px]", corner: false, radius: "rounded-[4px]" },
  sm: { box: "w-9 h-[52px]", rank: "text-base", suit: "text-xs", corner: false, radius: "rounded-md" },
  md: { box: "w-12 h-[68px]", rank: "text-xl", suit: "text-sm", corner: false, radius: "rounded-lg" },
  lg: { box: "w-[68px] h-[96px]", rank: "text-3xl", suit: "text-lg", corner: true, radius: "rounded-xl" },
}

export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  highlighted = false,
  dimmed = false,
  className,
}: PlayingCardProps) {
  const s = SIZES[size]

  if (card === null || card === undefined || faceDown) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border border-black/40",
          "shadow-[0_1px_3px_rgba(0,0,0,0.5)]",
          s.box,
          s.radius,
          dimmed && "opacity-40",
          className,
        )}
        style={{
          background:
            "repeating-linear-gradient(45deg, #2a3550 0 3px, #222c44 3px 6px)",
        }}
      >
        <div className="absolute inset-[2px] rounded-[3px] border border-white/10" />
      </div>
    )
  }

  const rank = card % 13
  const suit = Math.floor(card / 13)

  return (
    <div
      className={cn(
        "relative shrink-0 flex flex-col items-center justify-center bg-[#fbfbf8]",
        "border border-black/15 shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
        SUIT_COLOR[suit],
        s.box,
        s.radius,
        highlighted && "ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent",
        dimmed && "opacity-40",
        className,
      )}
    >
      {s.corner && (
        <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none">
          <span className="text-[11px] font-bold">{RANK_DISPLAY[rank]}</span>
          <span className="text-[10px] leading-none">{SUIT_DISPLAY[suit]}</span>
        </div>
      )}

      <span className={cn("font-bold leading-none tracking-tight", s.rank)}>
        {RANK_DISPLAY[rank]}
      </span>
      <span className={cn("leading-none mt-0.5", s.suit)}>
        {SUIT_DISPLAY[suit]}
      </span>
    </div>
  )
}
