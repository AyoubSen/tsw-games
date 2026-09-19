import { useEffect, useState } from "react"
import { HelpCircle, X } from "lucide-react"
import { HandCategory } from "@/lib/poker/handEvaluator"
import { cn } from "@/lib/utils"
import { PlayingCard } from "./PlayingCardV2"

const CLUBS = 0
const DIAMONDS = 1
const HEARTS = 2
const SPADES = 3

const RANK_INDEX: Record<string, number> = {
  "2": 0, "3": 1, "4": 2, "5": 3, "6": 4, "7": 5, "8": 6,
  "9": 7, "10": 8, J: 9, Q: 10, K: 11, A: 12,
}

/** Build a card id from a rank label and a suit, matching the server encoding. */
const card = (rank: string, suit: number) => suit * 13 + RANK_INDEX[rank]

interface HandRanking {
  category: HandCategory
  name: string
  /** The five cards that make the hand, in the order they should be read. */
  cards: number[]
  /** Which of those cards actually form the combination. */
  key: number[]
  description: string
}

/** Strongest first — the order that matters at showdown. */
const HAND_RANKINGS: HandRanking[] = [
  {
    category: HandCategory.RoyalFlush,
    name: "Royal Flush",
    cards: [card("A", SPADES), card("K", SPADES), card("Q", SPADES), card("J", SPADES), card("10", SPADES)],
    key: [0, 1, 2, 3, 4],
    description: "A, K, Q, J, 10 — all one suit. The unbeatable hand.",
  },
  {
    category: HandCategory.StraightFlush,
    name: "Straight Flush",
    cards: [card("9", HEARTS), card("8", HEARTS), card("7", HEARTS), card("6", HEARTS), card("5", HEARTS)],
    key: [0, 1, 2, 3, 4],
    description: "Five in a row, all one suit.",
  },
  {
    category: HandCategory.FourOfAKind,
    name: "Four of a Kind",
    cards: [card("K", SPADES), card("K", HEARTS), card("K", DIAMONDS), card("K", CLUBS), card("3", CLUBS)],
    key: [0, 1, 2, 3],
    description: "All four cards of one rank.",
  },
  {
    category: HandCategory.FullHouse,
    name: "Full House",
    cards: [card("J", CLUBS), card("J", DIAMONDS), card("J", HEARTS), card("8", SPADES), card("8", CLUBS)],
    key: [0, 1, 2, 3, 4],
    description: "Three of a kind plus a pair.",
  },
  {
    category: HandCategory.Flush,
    name: "Flush",
    cards: [card("K", DIAMONDS), card("J", DIAMONDS), card("9", DIAMONDS), card("6", DIAMONDS), card("2", DIAMONDS)],
    key: [0, 1, 2, 3, 4],
    description: "Five of one suit, in any order.",
  },
  {
    category: HandCategory.Straight,
    name: "Straight",
    cards: [card("10", CLUBS), card("9", HEARTS), card("8", SPADES), card("7", DIAMONDS), card("6", HEARTS)],
    key: [0, 1, 2, 3, 4],
    description: "Five in a row, suits mixed.",
  },
  {
    category: HandCategory.ThreeOfAKind,
    name: "Three of a Kind",
    cards: [card("Q", SPADES), card("Q", HEARTS), card("Q", CLUBS), card("7", DIAMONDS), card("4", CLUBS)],
    key: [0, 1, 2],
    description: "Three cards of the same rank.",
  },
  {
    category: HandCategory.TwoPair,
    name: "Two Pair",
    cards: [card("A", SPADES), card("A", CLUBS), card("9", HEARTS), card("9", DIAMONDS), card("5", CLUBS)],
    key: [0, 1, 2, 3],
    description: "Two separate pairs.",
  },
  {
    category: HandCategory.OnePair,
    name: "One Pair",
    cards: [card("10", HEARTS), card("10", SPADES), card("K", CLUBS), card("4", DIAMONDS), card("2", HEARTS)],
    key: [0, 1],
    description: "Two cards of the same rank.",
  },
  {
    category: HandCategory.HighCard,
    name: "High Card",
    cards: [card("A", DIAMONDS), card("J", SPADES), card("8", HEARTS), card("5", CLUBS), card("2", SPADES)],
    key: [0],
    description: "Nothing connects — your highest card plays.",
  },
]

interface PokerHandGuideProps {
  /** The category the local player currently holds, highlighted in the list. */
  currentCategory?: HandCategory | null
}

export function PokerHandGuide({ currentCategory = null }: PokerHandGuideProps) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <HelpCircle size={13} />
        <span>Hand rankings</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close hand rankings"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Poker hand rankings"
            className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[#12161d] shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-white">Hand rankings</h2>
                <p className="mt-0.5 text-[11px] text-white/35">
                  Strongest first · best five of your seven cards
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {HAND_RANKINGS.map((hand, index) => {
                const isCurrent = currentCategory === hand.category
                return (
                  <div
                    key={hand.name}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 transition-colors",
                      index > 0 && "border-t border-white/[0.05]",
                      isCurrent && "bg-emerald-400/10",
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 shrink-0 text-right font-mono text-[11px]",
                        isCurrent ? "text-emerald-300" : "text-white/25",
                      )}
                    >
                      {index + 1}
                    </span>

                    {/* Real cards, slightly overlapped like a held hand */}
                    <div className="flex shrink-0">
                      {hand.cards.map((c, i) => (
                        <PlayingCard
                          key={`${hand.name}-${c}`}
                          card={c}
                          size="xs"
                          className={cn(
                            i > 0 && "-ml-2",
                            !hand.key.includes(i) && "opacity-40",
                          )}
                        />
                      ))}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate text-[13px] font-semibold",
                            isCurrent ? "text-emerald-300" : "text-white/90",
                          )}
                        >
                          {hand.name}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                            You
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] leading-tight text-white/35">
                        {hand.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="shrink-0 border-t border-white/[0.07] px-4 py-2.5 text-[11px] leading-relaxed text-white/35">
              Ties are broken by the highest cards in the hand, then by the
              kickers alongside it. Suits never break a tie — equal hands split
              the pot.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
