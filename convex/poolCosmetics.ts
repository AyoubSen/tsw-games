/** Pool cues, cloths and ball sets. Shared by the Convex functions, the profile page and the game. */

/** Unlocks are worked out from gameStats, never stored. */
export interface UnlockRule {
  /** Every game counts when this is missing. */
  game?: string
  stat: "played" | "wins"
  count: number
  /** Leave out games that had a bot at the table. */
  vsPeople?: boolean
}

export interface StatRow {
  game: string
  played: number
  wins: number
  botPlayed?: number
  botWins?: number
}

export interface Cosmetic {
  id: string
  name: string
  unlock: UnlockRule | null
}

export interface CueStyle extends Cosmetic {
  /** Wood grain: base, light and dark. */
  shaft: [string, string, string]
  butt: string
  wrap: string
  tip: string
}

export interface ClothStyle extends Cosmetic {
  felt: string
  cushion: string
}

/** Stripes always keep their white ends and the 8 stays black, so the groups read the same in every set. */
export interface BallSet extends Cosmetic {
  /** Balls 1 to 7. */
  solids: string[]
  /** Balls 9 to 15. */
  stripes: string[]
}

const CLASSIC_COLORS = ["#f2b705", "#1d4ed8", "#d62828", "#6d28d9", "#f06a0f", "#13804a", "#7a1f1f"]
const MAPLE: [string, string, string] = ["#c99a5b", "#e3bd84", "#8a5a2b"]

export const CUES: CueStyle[] = [
  { id: "maple", name: "Maple", unlock: null, shaft: MAPLE, butt: "#2a1208", wrap: "#111111", tip: "#2b6cb0" },
  { id: "ebony", name: "Ebony", unlock: { game: "pool", stat: "played", count: 3 }, shaft: ["#3b2a20", "#5a4030", "#1c120c"], butt: "#0d0d0d", wrap: "#7f1d1d", tip: "#2b6cb0" },
  { id: "crimson", name: "Crimson", unlock: { game: "pool", stat: "wins", count: 3 }, shaft: MAPLE, butt: "#9f1239", wrap: "#1f2937", tip: "#1e3a8a" },
  { id: "ice", name: "Ice", unlock: { game: "pool", stat: "wins", count: 10 }, shaft: ["#d9dde3", "#f2f4f7", "#9aa3ad"], butt: "#1e3a8a", wrap: "#e5e7eb", tip: "#0ea5e9" },
  { id: "gold", name: "Gold", unlock: { game: "pool", stat: "wins", count: 10, vsPeople: true }, shaft: ["#b8892b", "#e6c15a", "#6b4a12"], butt: "#111111", wrap: "#c9a227", tip: "#111827" },
  { id: "party", name: "Party", unlock: { stat: "played", count: 50 }, shaft: MAPLE, butt: "#7c3aed", wrap: "#f472b6", tip: "#22d3ee" },
]

export const CLOTHS: ClothStyle[] = [
  { id: "green", name: "Tournament green", unlock: null, felt: "#1f7f50", cushion: "#1a6c42" },
  { id: "blue", name: "Pro blue", unlock: { game: "pool", stat: "played", count: 1 }, felt: "#1d5fa8", cushion: "#184f8c" },
  { id: "slate", name: "Slate", unlock: { game: "pool", stat: "wins", count: 5 }, felt: "#46525e", cushion: "#3a444e" },
  { id: "burgundy", name: "Burgundy", unlock: { game: "pool", stat: "played", count: 10 }, felt: "#7a1f2b", cushion: "#661a24" },
  { id: "purple", name: "Royal purple", unlock: { stat: "played", count: 25 }, felt: "#4c2a85", cushion: "#40236f" },
]

export const BALL_SETS: BallSet[] = [
  { id: "classic", name: "Classic", unlock: null, solids: CLASSIC_COLORS, stripes: CLASSIC_COLORS },
  {
    id: "neon",
    name: "Neon",
    unlock: { game: "pool", stat: "wins", count: 5 },
    solids: ["#facc15", "#2563eb", "#ef4444", "#a855f7", "#fb923c", "#22c55e", "#db2777"],
    stripes: ["#facc15", "#2563eb", "#ef4444", "#a855f7", "#fb923c", "#22c55e", "#db2777"],
  },
  {
    id: "jewel",
    name: "Jewel",
    unlock: { game: "pool", stat: "played", count: 10 },
    solids: ["#d4a017", "#1e3a8a", "#9b111e", "#4b0082", "#c2410c", "#046307", "#5b0e2d"],
    stripes: ["#d4a017", "#1e3a8a", "#9b111e", "#4b0082", "#c2410c", "#046307", "#5b0e2d"],
  },
  // Every solid red, every stripe yellow: the groups can't be mixed up.
  { id: "two-tone", name: "Two-tone", unlock: { game: "pool", stat: "played", count: 25 }, solids: Array(7).fill("#c81e1e"), stripes: Array(7).fill("#e8a800") },
]

export const POOL_COSMETICS = { cue: CUES, cloth: CLOTHS, ballSet: BALL_SETS }
export type PoolCosmeticSlot = keyof typeof POOL_COSMETICS

/** The chosen item, or the free one when nothing (or something unknown) is chosen. */
export function pickCue(id: string | null | undefined) {
  return CUES.find((cue) => cue.id === id) ?? CUES[0]
}
export function pickCloth(id: string | null | undefined) {
  return CLOTHS.find((cloth) => cloth.id === id) ?? CLOTHS[0]
}
export function pickBallSet(id: string | null | undefined) {
  return BALL_SETS.find((set) => set.id === id) ?? BALL_SETS[0]
}

export function ballHex(set: BallSet, n: number): string {
  if (n === 0) return "#f5f1e6"
  if (n === 8) return "#111111"
  return n < 8 ? set.solids[n - 1] : set.stripes[n - 9]
}

export function unlockProgress(rule: UnlockRule, stats: StatRow[]): number {
  return stats
    .filter((row) => !rule.game || row.game === rule.game)
    .reduce((sum, row) => {
      if (rule.stat === "wins") return sum + row.wins - (rule.vsPeople ? (row.botWins ?? 0) : 0)
      return sum + row.played - (rule.vsPeople ? (row.botPlayed ?? 0) : 0)
    }, 0)
}

export function isUnlocked(item: Cosmetic, stats: StatRow[]): boolean {
  return !item.unlock || unlockProgress(item.unlock, stats) >= item.unlock.count
}

export function unlockText(rule: UnlockRule): string {
  const games = rule.game === "pool" ? `Pool game${rule.count === 1 ? "" : "s"}` : `game${rule.count === 1 ? "" : "s"} of anything`
  return `${rule.stat === "wins" ? "Win" : "Play"} ${rule.count} ${games}${rule.vsPeople ? " against people" : ""}`
}
