import { useState } from "react"
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react"

const HAND_RANKINGS = [
  {
    rank: 1,
    name: "Royal Flush",
    example: "A K Q J 10",
    description: "A, K, Q, J, 10 all of the same suit",
  },
  {
    rank: 2,
    name: "Straight Flush",
    example: "9 8 7 6 5",
    description: "Five consecutive cards of the same suit",
  },
  {
    rank: 3,
    name: "Four of a Kind",
    example: "K K K K 3",
    description: "Four cards of the same rank",
  },
  {
    rank: 4,
    name: "Full House",
    example: "J J J 8 8",
    description: "Three of a kind + a pair",
  },
  {
    rank: 5,
    name: "Flush",
    example: "K J 9 6 2",
    description: "Five cards of the same suit (any order)",
  },
  {
    rank: 6,
    name: "Straight",
    example: "10 9 8 7 6",
    description: "Five consecutive cards of mixed suits",
  },
  {
    rank: 7,
    name: "Three of a Kind",
    example: "Q Q Q 7 4",
    description: "Three cards of the same rank",
  },
  {
    rank: 8,
    name: "Two Pair",
    example: "A A 9 9 5",
    description: "Two different pairs",
  },
  {
    rank: 9,
    name: "One Pair",
    example: "10 10 K 4 2",
    description: "Two cards of the same rank",
  },
  {
    rank: 10,
    name: "High Card",
    example: "A J 8 5 2",
    description: "No combination — highest card plays",
  },
]

export function PokerHandGuide() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="w-full max-w-md mx-auto mt-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg"
      >
        <HelpCircle size={13} />
        <span>Hand Rankings</span>
        {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {isOpen && (
        <div className="mt-2 rounded-xl overflow-hidden border border-border bg-card">
          <div className="px-3 py-2 text-[10px] text-muted-foreground border-b border-border flex justify-between">
            <span>Best hand at the top</span>
            <span>Uses best 5 of 7 cards</span>
          </div>
          <div className="divide-y divide-border">
            {HAND_RANKINGS.map((hand) => (
              <div
                key={hand.rank}
                className="flex items-center gap-3 px-3 py-1.5"
              >
                <span className="w-4 text-[10px] font-bold text-right text-muted-foreground shrink-0">
                  {hand.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {hand.name}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                      {hand.example}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
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
