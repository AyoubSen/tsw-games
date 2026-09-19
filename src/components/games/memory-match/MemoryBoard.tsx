import {
  MEMORY_BOARD_SIZE,
  MEMORY_SYMBOL_DETAILS,
  type MemorySymbol,
} from "@/lib/memoryMatch"

export type MemoryCardState = "hidden" | "visible" | "matched"

export interface MemoryCardView {
  symbol?: MemorySymbol
  state: MemoryCardState
}

export function MemoryBoard({
  cards,
  disabled,
  onFlip,
}: {
  cards: MemoryCardView[]
  disabled: boolean
  onFlip: (index: number) => void
}) {
  return (
    <div className="rounded-[2rem] border border-indigo-950/10 bg-gradient-to-br from-indigo-950 via-slate-950 to-violet-950 p-3 shadow-2xl shadow-indigo-950/20 sm:p-5 dark:border-white/10">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: MEMORY_BOARD_SIZE }, (_, index) => {
          const card = cards[index] ?? { state: "hidden" as const }
          const details = card.symbol
            ? MEMORY_SYMBOL_DETAILS[card.symbol]
            : null
          const revealed = card.state !== "hidden" && details
          return (
            <button
              key={index}
              type="button"
              disabled={disabled || card.state !== "hidden"}
              onClick={() => onFlip(index)}
              aria-label={
                revealed
                  ? `${details.label}, ${card.state}`
                  : `Hidden card ${index + 1}`
              }
              className={`relative aspect-square min-h-14 overflow-hidden rounded-2xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:min-h-20 ${
                card.state === "matched"
                  ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100"
                  : card.state === "visible"
                    ? "scale-[0.98] border-white/50 bg-white text-indigo-950 shadow-lg"
                    : "border-white/10 bg-white/[0.07] text-white hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-white/[0.12]"
              }`}
            >
              {revealed ? (
                <span
                  aria-hidden="true"
                  className="text-3xl font-black sm:text-5xl"
                >
                  {details.glyph}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="text-xl font-black text-white/25 sm:text-3xl"
                >
                  {index + 1}
                </span>
              )}
              {card.state === "matched" && (
                <span className="absolute inset-x-2 bottom-1.5 text-[8px] font-bold uppercase tracking-widest text-emerald-200/70 sm:text-[10px]">
                  Matched
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
