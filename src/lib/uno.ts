export const UNO_COLORS = ["red", "yellow", "green", "blue"] as const
export const UNO_COLORED_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw-two"] as const
export const UNO_WILD_VALUES = ["wild", "wild-draw-four"] as const

export type UnoColor = (typeof UNO_COLORS)[number]
export type UnoColoredValue = (typeof UNO_COLORED_VALUES)[number]
export type UnoWildValue = (typeof UNO_WILD_VALUES)[number]
export type UnoValue = UnoColoredValue | UnoWildValue

export interface UnoCard {
  id: string
  color: UnoColor | null
  value: UnoValue
}

const COLORS = new Set<string>(UNO_COLORS)
const COLORED_VALUES = new Set<string>(UNO_COLORED_VALUES)
const WILD_VALUES = new Set<string>(UNO_WILD_VALUES)
const CARD_ID = /^(red|yellow|green|blue):(0|[1-9]|skip|reverse|draw-two):([01])$|^(wild|wild-draw-four):([0-3])$/

export function isUnoColor(value: unknown): value is UnoColor {
  return typeof value === "string" && COLORS.has(value)
}

export function parseUnoCardId(value: unknown): UnoCard | null {
  if (typeof value !== "string") return null
  const match = CARD_ID.exec(value)
  if (!match) return null
  if (match[1] && match[2]) {
    if (!COLORS.has(match[1]) || !COLORED_VALUES.has(match[2])) return null
    if (match[2] === "0" && match[3] !== "0") return null
    return { id: value, color: match[1] as UnoColor, value: match[2] as UnoColoredValue }
  }
  if (!match[4] || !WILD_VALUES.has(match[4])) return null
  return { id: value, color: null, value: match[4] as UnoWildValue }
}

export function createUnoDeck(): UnoCard[] {
  const cards: UnoCard[] = []
  for (const color of UNO_COLORS) {
    cards.push({ id: `${color}:0:0`, color, value: "0" })
    for (const value of UNO_COLORED_VALUES.slice(1)) {
      for (let copy = 0; copy < 2; copy++) cards.push({ id: `${color}:${value}:${copy}`, color, value })
    }
  }
  for (const value of UNO_WILD_VALUES) {
    for (let copy = 0; copy < 4; copy++) cards.push({ id: `${value}:${copy}`, color: null, value })
  }
  return cards
}

export function shuffleUnoCards(cards: readonly UnoCard[], random: () => number = Math.random): UnoCard[] {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!]
  }
  return shuffled
}

export function isUnoNumberCard(card: UnoCard): boolean {
  return card.color !== null && /^\d$/.test(card.value)
}

export function canPlayUnoCard(
  card: UnoCard,
  topCard: UnoCard,
  activeColor: UnoColor,
  hand: readonly UnoCard[] = [],
): boolean {
  if (card.value === "wild") return true
  if (card.value === "wild-draw-four") {
    return !hand.some((other) => other.id !== card.id && other.color === activeColor)
  }
  return card.color === activeColor || card.value === topCard.value
}

export interface UnoRules {
  stacking: boolean
  challenge: boolean
  sevenZero: boolean
  jumpIn: boolean
}

export const DEFAULT_UNO_RULES: UnoRules = { stacking: false, challenge: false, sevenZero: false, jumpIn: false }

export const UNO_RULE_INFO: { key: keyof UnoRules; label: string; description: string }[] = [
  { key: "stacking", label: "Stacking", description: "Answer a +2 with a +2 or +4, or a +4 with a +4. Whoever can't stack draws the total." },
  { key: "challenge", label: "+4 challenge", description: "A +4 can be played any time. Challenge it: a bluffer draws 4, otherwise you draw 6." },
  { key: "sevenZero", label: "7-0", description: "A 7 swaps hands with a player of your choice. A 0 passes every hand along." },
  { key: "jumpIn", label: "Jump-in", description: "Play an identical card out of turn. Play continues from you." },
]

export function isUnoRule(value: unknown): value is keyof UnoRules {
  return typeof value === "string" && value in DEFAULT_UNO_RULES
}

/** Whether a card can be played on your turn, given the house rules and any +2/+4 waiting to be stacked or drawn. */
export function canPlayUnoTurn(
  card: UnoCard,
  topCard: UnoCard,
  activeColor: UnoColor,
  hand: readonly UnoCard[],
  rules: UnoRules,
  pendingDraw: number,
): boolean {
  // With challenges on, a +4 may be a bluff.
  const strictHand = rules.challenge ? [] : hand
  if (pendingDraw > 0) {
    if (!rules.stacking) return false
    if (card.value === "wild-draw-four") return canPlayUnoCard(card, topCard, activeColor, strictHand)
    return card.value === "draw-two" && topCard.value === "draw-two"
  }
  return canPlayUnoCard(card, topCard, activeColor, strictHand)
}

export function canJumpInUno(card: UnoCard, topCard: UnoCard): boolean {
  return card.color !== null && card.color === topCard.color && card.value === topCard.value
}
