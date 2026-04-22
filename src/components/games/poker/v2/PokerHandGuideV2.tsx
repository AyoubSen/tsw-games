import { useState } from "react"
import { HelpCircle, X } from "lucide-react"

const HAND_RANKINGS = [
  {
    rank: 1,
    name: "Royal Flush",
    example: "A K Q J 10",
    description: "A, K, Q, J, 10 all of the same suit",
    color: "#fbbf24",
  },
  {
    rank: 2,
    name: "Straight Flush",
    example: "9 8 7 6 5",
    description: "Five consecutive cards of the same suit",
    color: "#f59e0b",
  },
  {
    rank: 3,
    name: "Four of a Kind",
    example: "K K K K 3",
    description: "Four cards of the same rank",
    color: "#f97316",
  },
  {
    rank: 4,
    name: "Full House",
    example: "J J J 8 8",
    description: "Three of a kind + a pair",
    color: "#a855f7",
  },
  {
    rank: 5,
    name: "Flush",
    example: "K J 9 6 2",
    description: "Five cards of the same suit (any order)",
    color: "#14b8a6",
  },
  {
    rank: 6,
    name: "Straight",
    example: "10 9 8 7 6",
    description: "Five consecutive cards of mixed suits",
    color: "#10b981",
  },
  {
    rank: 7,
    name: "Three of a Kind",
    example: "Q Q Q 7 4",
    description: "Three cards of the same rank",
    color: "#3b82f6",
  },
  {
    rank: 8,
    name: "Two Pair",
    example: "A A 9 9 5",
    description: "Two different pairs",
    color: "#0ea5e9",
  },
  {
    rank: 9,
    name: "One Pair",
    example: "10 10 K 4 2",
    description: "Two cards of the same rank",
    color: "#94a3b8",
  },
  {
    rank: 10,
    name: "High Card",
    example: "A J 8 5 2",
    description: "No combination — highest card plays",
    color: "#64748b",
  },
]

export function PokerHandGuide() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors"
        style={{
          background: "rgba(234,179,8,0.1)",
          color: "#fbbf24",
          border: "1px solid rgba(234,179,8,0.2)",
        }}
      >
        <HelpCircle size={13} />
        <span>Hand Rankings</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70" />

          <div
            className="relative w-full max-w-sm rounded-xl overflow-hidden shadow-2xl"
            style={{
              background: "#0f1520",
              border: "1px solid rgba(148,163,184,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}
            >
              <h2 className="text-sm font-bold text-zinc-200">Hand Rankings</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-1.5 text-[10px] text-zinc-500 flex justify-between" style={{ borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
              <span>Best hand at the top</span>
              <span>Uses best 5 of 7 cards</span>
            </div>

            <div className="divide-y divide-zinc-800/50 max-h-[60vh] overflow-y-auto">
              {HAND_RANKINGS.map((hand) => (
                <div
                  key={hand.rank}
                  className="flex items-center gap-3 px-4 py-2"
                >
                  <span
                    className="w-5 text-xs font-bold text-right shrink-0"
                    style={{ color: hand.color }}
                  >
                    {hand.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: hand.color }}
                      >
                        {hand.name}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500 tracking-wider">
                        {hand.example}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      {hand.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
