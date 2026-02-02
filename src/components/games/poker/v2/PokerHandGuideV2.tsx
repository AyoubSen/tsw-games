import { useState } from "react"
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react"

const HAND_RANKINGS = [
  {
    rank: 1,
    name: "Royal Flush",
    example: "A K Q J 10",
    suits: "♠♠♠♠♠",
    description: "A, K, Q, J, 10 all of the same suit",
    color: "#fbbf24",
  },
  {
    rank: 2,
    name: "Straight Flush",
    example: "9 8 7 6 5",
    suits: "♥♥♥♥♥",
    description: "Five consecutive cards of the same suit",
    color: "#f59e0b",
  },
  {
    rank: 3,
    name: "Four of a Kind",
    example: "K K K K 3",
    suits: "♠♥♦♣ ",
    description: "Four cards of the same rank",
    color: "#f97316",
  },
  {
    rank: 4,
    name: "Full House",
    example: "J J J 8 8",
    suits: "♠♥♦ ♠♥",
    description: "Three of a kind + a pair",
    color: "#a855f7",
  },
  {
    rank: 5,
    name: "Flush",
    example: "K J 9 6 2",
    suits: "♦♦♦♦♦",
    description: "Five cards of the same suit (any order)",
    color: "#14b8a6",
  },
  {
    rank: 6,
    name: "Straight",
    example: "10 9 8 7 6",
    suits: "♠♥♦♣♠",
    description: "Five consecutive cards of mixed suits",
    color: "#10b981",
  },
  {
    rank: 7,
    name: "Three of a Kind",
    example: "Q Q Q 7 4",
    suits: "♠♥♦  ",
    description: "Three cards of the same rank",
    color: "#3b82f6",
  },
  {
    rank: 8,
    name: "Two Pair",
    example: "A A 9 9 5",
    suits: "♠♥ ♦♣ ",
    description: "Two different pairs",
    color: "#0ea5e9",
  },
  {
    rank: 9,
    name: "One Pair",
    example: "10 10 K 4 2",
    suits: "♠♥   ",
    description: "Two cards of the same rank",
    color: "#94a3b8",
  },
  {
    rank: 10,
    name: "High Card",
    example: "A J 8 5 2",
    suits: "♠♦♥♣♦",
    description: "No combination — highest card plays",
    color: "#64748b",
  },
]

export function PokerHandGuide() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="w-full max-w-md mx-auto mt-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-1.5 mx-auto text-xs px-3 py-1.5 rounded-lg transition-colors"
        style={{
          color: "#94a3b8",
          background: isOpen ? "rgba(148,163,184,0.1)" : "transparent",
        }}
      >
        <HelpCircle size={13} />
        <span>Hand Rankings</span>
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {isOpen && (
        <div
          className="mt-2 rounded-xl overflow-hidden"
          style={{
            background: "rgba(15,21,32,0.95)",
            border: "1px solid rgba(148,163,184,0.1)",
          }}
        >
          <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-800/50 flex justify-between">
            <span>Best hand at the top</span>
            <span>Uses best 5 of 7 cards</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {HAND_RANKINGS.map((hand) => (
              <div
                key={hand.rank}
                className="flex items-center gap-3 px-3 py-1.5"
              >
                <span
                  className="w-4 text-[10px] font-bold text-right shrink-0"
                  style={{ color: hand.color }}
                >
                  {hand.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: hand.color }}
                    >
                      {hand.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 tracking-wider">
                      {hand.example}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    {hand.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
