export type TimelinePack = "mixed" | "history" | "science" | "culture"
export type TimelineCategory = Exclude<TimelinePack, "mixed">

export interface TimelineEvent {
  id: string
  title: string
  year: number
  yearLabel: string
  category: TimelineCategory
  fact: string
}

export interface PublicTimelineEvent {
  id: string
  title: string
  category: TimelineCategory
  yearLabel: string | null
  fact: string | null
}

export const TIMELINE_PACKS: ReadonlyArray<{
  id: TimelinePack
  label: string
}> = [
  { id: "mixed", label: "Mixed" },
  { id: "history", label: "History" },
  { id: "science", label: "Science" },
  { id: "culture", label: "Culture" },
]

const EVENTS: readonly TimelineEvent[] = [
  { id: "history:magna-carta", title: "The Magna Carta is sealed", year: 1215, yearLabel: "1215", category: "history", fact: "The charter limited the English king's power." },
  { id: "history:printing-press", title: "Gutenberg develops his printing press", year: 1440, yearLabel: "c. 1440", category: "history", fact: "Movable type helped books spread across Europe." },
  { id: "history:declaration", title: "The US Declaration of Independence is adopted", year: 1776, yearLabel: "1776", category: "history", fact: "The declaration was adopted on July 4." },
  { id: "history:french-revolution", title: "The French Revolution begins", year: 1789, yearLabel: "1789", category: "history", fact: "The storming of the Bastille became its defining opening event." },
  { id: "history:first-flight", title: "The Wright brothers make their first powered flight", year: 1903, yearLabel: "1903", category: "history", fact: "The flight took place at Kitty Hawk, North Carolina." },
  { id: "history:united-nations", title: "The United Nations is founded", year: 1945, yearLabel: "1945", category: "history", fact: "The UN was founded after World War II." },
  { id: "history:moon-landing", title: "Apollo 11 lands on the Moon", year: 1969, yearLabel: "1969", category: "history", fact: "Neil Armstrong and Buzz Aldrin walked on the lunar surface." },
  { id: "history:berlin-wall", title: "The Berlin Wall falls", year: 1989, yearLabel: "1989", category: "history", fact: "Its fall became a symbol of the Cold War's end." },

  { id: "science:copernicus", title: "Copernicus publishes his heliocentric model", year: 1543, yearLabel: "1543", category: "science", fact: "The model placed the Sun near the center of the known cosmos." },
  { id: "science:principia", title: "Newton publishes Principia", year: 1687, yearLabel: "1687", category: "science", fact: "The work described motion and universal gravitation." },
  { id: "science:vaccine", title: "Jenner demonstrates smallpox vaccination", year: 1796, yearLabel: "1796", category: "science", fact: "Edward Jenner's work helped establish vaccination." },
  { id: "science:periodic-table", title: "Mendeleev presents the periodic table", year: 1869, yearLabel: "1869", category: "science", fact: "He organized elements and predicted missing ones." },
  { id: "science:penicillin", title: "Fleming discovers penicillin", year: 1928, yearLabel: "1928", category: "science", fact: "Alexander Fleming noticed mold killing bacteria." },
  { id: "science:dna", title: "The DNA double-helix structure is described", year: 1953, yearLabel: "1953", category: "science", fact: "The model explained how genetic information could be copied." },
  { id: "science:human-spaceflight", title: "The first human travels into space", year: 1961, yearLabel: "1961", category: "science", fact: "Yuri Gagarin orbited Earth aboard Vostok 1." },
  { id: "science:crispr", title: "CRISPR-Cas9 gene editing is demonstrated", year: 2012, yearLabel: "2012", category: "science", fact: "The technique made targeted gene editing far more practical." },

  { id: "culture:mona-lisa", title: "Leonardo begins painting the Mona Lisa", year: 1503, yearLabel: "c. 1503", category: "culture", fact: "Leonardo continued working on the portrait for years." },
  { id: "culture:hamlet", title: "Hamlet is first performed", year: 1600, yearLabel: "c. 1600", category: "culture", fact: "Shakespeare's tragedy was written around the turn of the century." },
  { id: "culture:four-seasons", title: "Vivaldi publishes The Four Seasons", year: 1725, yearLabel: "1725", category: "culture", fact: "The four violin concertos evoke each season." },
  { id: "culture:frankenstein", title: "Frankenstein is published", year: 1818, yearLabel: "1818", category: "culture", fact: "Mary Shelley's novel was first published anonymously." },
  { id: "culture:starry-night", title: "Van Gogh paints The Starry Night", year: 1889, yearLabel: "1889", category: "culture", fact: "Van Gogh painted it while staying at Saint-Remy." },
  { id: "culture:jazz-record", title: "The first commercial jazz recording is released", year: 1917, yearLabel: "1917", category: "culture", fact: "The Original Dixieland Jass Band made the recording." },
  { id: "culture:great-gatsby", title: "The Great Gatsby is published", year: 1925, yearLabel: "1925", category: "culture", fact: "F. Scott Fitzgerald set the novel during the Jazz Age." },
  { id: "culture:toy-story", title: "Toy Story reaches cinemas", year: 1995, yearLabel: "1995", category: "culture", fact: "It was the first fully computer-animated feature film." },
]

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!]
  }
  return result
}

export function isTimelinePack(value: unknown): value is TimelinePack {
  return TIMELINE_PACKS.some((pack) => pack.id === value)
}

export function pickTimelineEvents(
  pack: TimelinePack,
  usedEventIds: readonly string[] = [],
  random: () => number = Math.random,
): { events: TimelineEvent[]; usedEventIds: string[] } {
  const pool = pack === "mixed" ? EVENTS : EVENTS.filter((event) => event.category === pack)
  const used = new Set(usedEventIds)
  let available = pool.filter((event) => !used.has(event.id))
  let nextUsed = [...usedEventIds]
  if (available.length < 4) {
    available = [...pool]
    nextUsed = []
  }
  const events = shuffle(available, random).slice(0, 4)
  return { events: shuffle(events, random), usedEventIds: [...nextUsed, ...events.map((event) => event.id)] }
}

export function getCorrectTimeline(events: readonly TimelineEvent[]): string[] {
  return [...events].sort((left, right) => left.year - right.year).map((event) => event.id)
}

export function isValidTimelineOrder(order: unknown, eventIds: readonly string[]): order is string[] {
  if (!Array.isArray(order) || order.length !== eventIds.length) return false
  const expected = new Set(eventIds)
  return new Set(order).size === order.length && order.every((id) => typeof id === "string" && expected.has(id))
}

export const TIMELINE_PAIR_POINTS = 150
export const TIMELINE_PERFECT_BONUS = 500
export const TIMELINE_SPEED_BONUS = 500

/** Pairs of events (6 for 4 events) that sit in the right order relative to each other. */
export function countCorrectPairs(order: readonly string[], correctOrder: readonly string[]): number {
  const rank = new Map(correctOrder.map((id, index) => [id, index]))
  let pairs = 0
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      if ((rank.get(order[i]!) ?? 0) < (rank.get(order[j]!) ?? 0)) pairs++
    }
  }
  return pairs
}

export function pairCount(eventCount: number) {
  return (eventCount * (eventCount - 1)) / 2
}

export function scoreTimelineOrder(
  order: readonly string[],
  correctOrder: readonly string[],
  submittedAt: number,
  roundStartedAt: number,
  roundEndsAt: number,
): { points: number; correctPairs: number; correctPositions: number; perfect: boolean } {
  const correctPositions = order.filter((id, index) => id === correctOrder[index]).length
  const correctPairs = countCorrectPairs(order, correctOrder)
  const perfect = correctPositions === correctOrder.length
  const duration = Math.max(1, roundEndsAt - roundStartedAt)
  const remaining = Math.max(0, Math.min(duration, roundEndsAt - submittedAt))
  const speedBonus = perfect ? Math.floor((remaining / duration) * TIMELINE_SPEED_BONUS) : 0
  return {
    points: correctPairs * TIMELINE_PAIR_POINTS + (perfect ? TIMELINE_PERFECT_BONUS + speedBonus : 0),
    correctPairs,
    correctPositions,
    perfect,
  }
}

/**
 * Reveal beats, paced by the server's storage alarm (and by the solo timer):
 * a tension hold, the years stamped oldest first, the cards sliding into the
 * true order with their facts, the room's orders (multiplayer only), then the
 * points landing. Client animations are timed to fit these.
 */
export type TimelineRevealStage = "tension" | "stamp" | "sort" | "room" | "score"

export const TIMELINE_PACE_MS = {
  /** Cards fly from the archive box before the clock matters. */
  deal: 1200,
  dealStep: 140,
  tension: 1500,
  stampStep: 650,
  stampLand: 800,
  sort: 4200,
  room: 3200,
  score: 2800,
} as const

export function revealStageMs(stage: TimelineRevealStage, eventCount: number): number {
  if (stage === "stamp") return Math.max(0, eventCount - 1) * TIMELINE_PACE_MS.stampStep + TIMELINE_PACE_MS.stampLand
  return TIMELINE_PACE_MS[stage]
}

export function nextRevealStage(stage: TimelineRevealStage, withRoom: boolean): TimelineRevealStage | null {
  const order: TimelineRevealStage[] = withRoom ? ["tension", "stamp", "sort", "room", "score"] : ["tension", "stamp", "sort", "score"]
  return order[order.indexOf(stage) + 1] ?? null
}

/** Moves `id` into `slot`, shifting neighbours toward the nearest empty slot so a gap opens where it lands. */
export function insertIntoSlots(slots: readonly (string | null)[], id: string, slot: number): (string | null)[] {
  const next = slots.map((value) => (value === id ? null : value))
  if (next[slot] === null) {
    next[slot] = id
    return next
  }
  let left = -1
  for (let i = slot - 1; i >= 0; i--) if (next[i] === null) { left = i; break }
  let right = -1
  for (let i = slot + 1; i < next.length; i++) if (next[i] === null) { right = i; break }
  if (right >= 0 && (left < 0 || right - slot <= slot - left)) {
    for (let i = right; i > slot; i--) next[i] = next[i - 1]!
  } else if (left >= 0) {
    for (let i = left; i < slot; i++) next[i] = next[i + 1]!
  } else return slots.slice()
  next[slot] = id
  return next
}

export function publicTimelineEvents(
  events: readonly TimelineEvent[],
  revealed: boolean,
): PublicTimelineEvent[] {
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    category: event.category,
    yearLabel: revealed ? event.yearLabel : null,
    fact: revealed ? event.fact : null,
  }))
}
