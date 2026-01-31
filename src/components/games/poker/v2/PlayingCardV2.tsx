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
  0: "text-zinc-900",
  1: "text-red-600",
  2: "text-red-600",
  3: "text-zinc-900",
}

interface PlayingCardProps {
  card: number | null
  faceDown?: boolean
  size?: "sm" | "md" | "lg"
  highlighted?: boolean
  className?: string
}

const SIZES = {
  sm: { container: "w-9 h-[50px]", rank: "text-[9px]", suit: "text-[8px]", pip: "text-sm" },
  md: { container: "w-14 h-[76px]", rank: "text-xs", suit: "text-[10px]", pip: "text-lg" },
  lg: { container: "w-[72px] h-[100px]", rank: "text-sm", suit: "text-xs", pip: "text-2xl" },
}

// Pip count patterns for center decoration
const PIP_COUNTS: Record<number, number> = {
  0: 2, 1: 3, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 1, 10: 1, 11: 1, 12: 1,
}

export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  highlighted = false,
  className,
}: PlayingCardProps) {
  const s = SIZES[size]

  // Face-down card
  if (card === null || card === undefined || faceDown) {
    return (
      <div
        className={cn(
          "rounded-lg border-2 border-blue-400/60 overflow-hidden relative",
          "shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_2px_rgba(255,255,255,0.1)]",
          s.container,
          className
        )}
        style={{
          background: `
            repeating-linear-gradient(
              45deg,
              #1e3a5f,
              #1e3a5f 4px,
              #1a3050 4px,
              #1a3050 8px
            )`,
        }}
      >
        {/* Inner frame */}
        <div className="absolute inset-[3px] rounded border border-yellow-600/30 bg-blue-900/20" />
        {/* Center diamond */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-3 h-3 bg-yellow-600/40 border border-yellow-500/50"
            style={{ transform: "rotate(45deg)" }}
          />
        </div>
      </div>
    )
  }

  const rank = card % 13
  const suit = Math.floor(card / 13)
  const pipCount = PIP_COUNTS[rank]

  return (
    <div
      className={cn(
        "rounded-lg border relative overflow-hidden flex flex-col",
        "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
        highlighted
          ? "border-yellow-400 ring-2 ring-yellow-400/60 shadow-[0_0_12px_rgba(234,179,8,0.4)]"
          : "border-zinc-300",
        SUIT_COLOR[suit],
        s.container,
        className
      )}
    >
      {/* Top-left corner */}
      <div className={cn("absolute top-[2px] left-[3px] flex flex-col items-center leading-none", s.rank)}>
        <span className="font-bold">{RANK_DISPLAY[rank]}</span>
        <span className={cn("-mt-[1px]", s.suit)}>{SUIT_DISPLAY[suit]}</span>
      </div>

      {/* Bottom-right corner (rotated) */}
      <div
        className={cn("absolute bottom-[2px] right-[3px] flex flex-col items-center leading-none", s.rank)}
        style={{ transform: "rotate(180deg)" }}
      >
        <span className="font-bold">{RANK_DISPLAY[rank]}</span>
        <span className={cn("-mt-[1px]", s.suit)}>{SUIT_DISPLAY[suit]}</span>
      </div>

      {/* Center pip area */}
      <div className="flex-1 flex items-center justify-center">
        <div className={cn("flex flex-col items-center gap-0 opacity-80", s.pip)}>
          {Array.from({ length: Math.min(pipCount, 3) }).map((_, i) => (
            <span key={i} className="leading-none">{SUIT_DISPLAY[suit]}</span>
          ))}
        </div>
      </div>

      {/* Inner shadow overlay */}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06), inset 0 -1px 2px rgba(0,0,0,0.04)",
        }}
      />
    </div>
  )
}
