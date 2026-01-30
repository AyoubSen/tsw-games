// Card encoding: 0-51
// card % 13 = rank (0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A)
// Math.floor(card / 13) = suit (0=clubs, 1=diamonds, 2=hearts, 3=spades)

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const
export const SUITS = ["c", "d", "h", "s"] as const
export const SUIT_NAMES = ["Clubs", "Diamonds", "Hearts", "Spades"] as const
export const RANK_NAMES = [
  "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Jack", "Queen", "King", "Ace",
] as const

export type Rank = typeof RANKS[number]
export type Suit = typeof SUITS[number]

export function cardRank(card: number): number {
  return card % 13
}

export function cardSuit(card: number): number {
  return Math.floor(card / 13)
}

export function cardToString(card: number): string {
  return RANKS[cardRank(card)] + SUITS[cardSuit(card)]
}

export function cardFromRankSuit(rank: number, suit: number): number {
  return suit * 13 + rank
}

export function createDeck(): number[] {
  const deck: number[] = []
  for (let i = 0; i < 52; i++) deck.push(i)
  return deck
}

export function shuffleDeck(deck: number[]): number[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

// Hand categories (higher = better)
export enum HandCategory {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
}

export const HAND_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.OnePair]: "One Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.ThreeOfAKind]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.FourOfAKind]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
  [HandCategory.RoyalFlush]: "Royal Flush",
}

export interface HandResult {
  category: HandCategory
  // Tiebreaker ranks in descending order of importance
  ranks: number[]
  // Description like "Two Pair - Kings and Sevens"
  description: string
  // The 5 cards that make up the best hand
  cards: number[]
}

// Evaluate exactly 5 cards, returning category + tiebreaker ranks
function evaluate5(cards: number[]): { category: HandCategory; ranks: number[] } {
  const ranks = cards.map(cardRank).sort((a, b) => b - a)
  const suits = cards.map(cardSuit)

  const isFlush = suits.every((s) => s === suits[0])

  // Check for straight
  let isStraight = false
  let straightHighCard = ranks[0]

  // Normal straight check
  if (
    ranks[0] - ranks[1] === 1 &&
    ranks[1] - ranks[2] === 1 &&
    ranks[2] - ranks[3] === 1 &&
    ranks[3] - ranks[4] === 1
  ) {
    isStraight = true
    straightHighCard = ranks[0]
  }

  // Ace-low straight (A-2-3-4-5): ranks sorted = [12, 3, 2, 1, 0]
  if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
    isStraight = true
    straightHighCard = 3 // 5-high straight
  }

  if (isStraight && isFlush) {
    if (straightHighCard === 12) {
      return { category: HandCategory.RoyalFlush, ranks: [straightHighCard] }
    }
    return { category: HandCategory.StraightFlush, ranks: [straightHighCard] }
  }

  // Count rank frequencies
  const freq: Record<number, number> = {}
  for (const r of ranks) {
    freq[r] = (freq[r] || 0) + 1
  }

  const freqEntries = Object.entries(freq)
    .map(([r, c]) => ({ rank: parseInt(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)

  const counts = freqEntries.map((e) => e.count)

  // Four of a kind
  if (counts[0] === 4) {
    return {
      category: HandCategory.FourOfAKind,
      ranks: [freqEntries[0].rank, freqEntries[1].rank],
    }
  }

  // Full house
  if (counts[0] === 3 && counts[1] === 2) {
    return {
      category: HandCategory.FullHouse,
      ranks: [freqEntries[0].rank, freqEntries[1].rank],
    }
  }

  if (isFlush) {
    return { category: HandCategory.Flush, ranks }
  }

  if (isStraight) {
    return { category: HandCategory.Straight, ranks: [straightHighCard] }
  }

  // Three of a kind
  if (counts[0] === 3) {
    const kickers = freqEntries.filter((e) => e.count === 1).map((e) => e.rank).sort((a, b) => b - a)
    return {
      category: HandCategory.ThreeOfAKind,
      ranks: [freqEntries[0].rank, ...kickers],
    }
  }

  // Two pair
  if (counts[0] === 2 && counts[1] === 2) {
    const pairs = freqEntries.filter((e) => e.count === 2).map((e) => e.rank).sort((a, b) => b - a)
    const kicker = freqEntries.find((e) => e.count === 1)!.rank
    return {
      category: HandCategory.TwoPair,
      ranks: [...pairs, kicker],
    }
  }

  // One pair
  if (counts[0] === 2) {
    const pairRank = freqEntries[0].rank
    const kickers = freqEntries.filter((e) => e.count === 1).map((e) => e.rank).sort((a, b) => b - a)
    return {
      category: HandCategory.OnePair,
      ranks: [pairRank, ...kickers],
    }
  }

  // High card
  return { category: HandCategory.HighCard, ranks }
}

// Generate all C(n,5) combinations of indices
function combinations5(arr: number[]): number[][] {
  const result: number[][] = []
  const n = arr.length
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            result.push([arr[i], arr[j], arr[k], arr[l], arr[m]])
          }
        }
      }
    }
  }
  return result
}

function describeHand(category: HandCategory, ranks: number[]): string {
  const name = (r: number) => RANK_NAMES[r]
  const plural = (r: number) => RANK_NAMES[r] + "s"

  switch (category) {
    case HandCategory.RoyalFlush:
      return "Royal Flush"
    case HandCategory.StraightFlush:
      return `Straight Flush - ${name(ranks[0])} High`
    case HandCategory.FourOfAKind:
      return `Four of a Kind - ${plural(ranks[0])}`
    case HandCategory.FullHouse:
      return `Full House - ${plural(ranks[0])} over ${plural(ranks[1])}`
    case HandCategory.Flush:
      return `Flush - ${name(ranks[0])} High`
    case HandCategory.Straight:
      return `Straight - ${name(ranks[0])} High`
    case HandCategory.ThreeOfAKind:
      return `Three of a Kind - ${plural(ranks[0])}`
    case HandCategory.TwoPair:
      return `Two Pair - ${plural(ranks[0])} and ${plural(ranks[1])}`
    case HandCategory.OnePair:
      return `Pair of ${plural(ranks[0])}`
    case HandCategory.HighCard:
      return `High Card - ${name(ranks[0])}`
  }
}

// Evaluate the best 5-card hand from 7 cards (2 hole + 5 community)
export function evaluateBestHand(holeCards: number[], communityCards: number[]): HandResult {
  const allCards = [...holeCards, ...communityCards]
  const combos = combinations5(allCards)

  let best: { category: HandCategory; ranks: number[]; cards: number[] } | null = null

  for (const combo of combos) {
    const result = evaluate5(combo)
    if (!best || compareEvaluations(result, best) > 0) {
      best = { ...result, cards: combo }
    }
  }

  if (!best) {
    throw new Error("No valid hand found")
  }

  return {
    category: best.category,
    ranks: best.ranks,
    description: describeHand(best.category, best.ranks),
    cards: best.cards,
  }
}

// Compare two evaluations: returns positive if a > b, negative if a < b, 0 if equal
function compareEvaluations(
  a: { category: HandCategory; ranks: number[] },
  b: { category: HandCategory; ranks: number[] }
): number {
  if (a.category !== b.category) {
    return a.category - b.category
  }
  for (let i = 0; i < Math.min(a.ranks.length, b.ranks.length); i++) {
    if (a.ranks[i] !== b.ranks[i]) {
      return a.ranks[i] - b.ranks[i]
    }
  }
  return 0
}

// Compare two HandResults: returns positive if a wins, negative if b wins, 0 if tie
export function compareHands(a: HandResult, b: HandResult): number {
  return compareEvaluations(a, b)
}
