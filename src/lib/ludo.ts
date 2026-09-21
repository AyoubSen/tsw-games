export const LUDO_COLORS = [
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
] as const

export type LudoColor = (typeof LUDO_COLORS)[number]["id"]

export const LUDO_SEATS = 4
export const LUDO_TOKENS_PER_PLAYER = 4
export const LUDO_TRACK_LENGTH = 52
/** Relative steps: 0-50 on the shared track, 51-56 in the private home column. */
export const LUDO_HOME_ENTRY = 51
export const LUDO_HOME_INDEX = 56
export const LUDO_BASE = -1

/** Board cells of the shared track, clockwise, on a 15x15 grid. */
export const LUDO_TRACK: ReadonlyArray<readonly [number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
]

/** Track index each seat enters on. */
export const LUDO_ENTRY_INDEX = [0, 13, 26, 39] as const

/** Entry squares plus the star squares eight steps later. */
export const LUDO_SAFE_CELLS: ReadonlySet<number> = new Set([
  0, 8, 13, 21, 26, 34, 39, 47,
])

/** Six private cells leading to the centre, per seat. */
export const LUDO_HOME_PATH: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
]

/** Top-left corner of each seat's 6x6 base yard. */
const BASE_ORIGIN = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
] as const

export const LUDO_BASE_SLOTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
  BASE_ORIGIN.map(([row, col]) =>
    [
      [1, 1],
      [1, 4],
      [4, 1],
      [4, 4],
    ].map(([slotRow, slotCol]) => [row + slotRow, col + slotCol] as const),
  )

export type LudoMode = "classic" | "teams"

/** Teams sit opposite each other, so partners never chase the same stretch. */
export const LUDO_TEAMS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [1, 3],
]

export function getTeamOfSeat(seat: number): number {
  return LUDO_TEAMS.findIndex((team) => team.includes(seat))
}

export function getTeammateSeat(seat: number): number {
  const team = LUDO_TEAMS[getTeamOfSeat(seat)]
  return team[0] === seat ? team[1] : team[0]
}

/** Seats that do not capture each other: the whole team in 2v2, else just you. */
export function getAllySeats(seat: number, mode: LudoMode): number[] {
  return mode === "teams" ? [seat, getTeammateSeat(seat)] : [seat]
}

export interface LudoMove {
  /** Whose token moves - your own, or in 2v2 your partner's once yours are home. */
  seat: number
  tokenIndex: number
  from: number
  to: number
  captures: boolean
  finishes: boolean
}

export function toAbsoluteCell(seat: number, relative: number): number {
  return (LUDO_ENTRY_INDEX[seat] + relative) % LUDO_TRACK_LENGTH
}

export function isOnTrack(relative: number): boolean {
  return relative >= 0 && relative < LUDO_HOME_ENTRY
}

export function ludoCellKey(row: number, col: number): string {
  return `${row}:${col}`
}

export function getTokenCell(
  seat: number,
  tokenIndex: number,
  relative: number,
): readonly [number, number] {
  if (relative === LUDO_BASE) return LUDO_BASE_SLOTS[seat][tokenIndex]
  if (isOnTrack(relative)) return LUDO_TRACK[toAbsoluteCell(seat, relative)]
  return LUDO_HOME_PATH[seat][relative - LUDO_HOME_ENTRY]
}

/** Every move playable with this dice value across the seats you control. */
export function getLegalMoves(
  controlledSeats: number[],
  dice: number,
  allTokens: number[][],
  allySeats: number[] = controlledSeats,
): LudoMove[] {
  const moves: LudoMove[] = []
  for (const seat of controlledSeats) {
    const tokens = allTokens[seat] ?? []
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const from = tokens[tokenIndex]
      if (from === LUDO_HOME_INDEX) continue

      let to: number
      if (from === LUDO_BASE) {
        if (dice !== 6) continue
        to = 0
      } else {
        to = from + dice
        if (to > LUDO_HOME_INDEX) continue
      }

      moves.push({
        seat,
        tokenIndex,
        from,
        to,
        captures: getCapturedTokens(seat, to, allTokens, allySeats).length > 0,
        finishes: to === LUDO_HOME_INDEX,
      })
    }
  }
  return moves
}

/**
 * Pick a move the way a reasonable player would: take the capture, bring a
 * token home, open the home column, get out of the yard, else run furthest.
 */
export function chooseBestMove(moves: LudoMove[]): LudoMove | null {
  let best: LudoMove | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const move of moves) {
    let score = move.to
    if (move.captures) score += 1000
    if (move.finishes) score += 800
    if (move.to >= LUDO_HOME_ENTRY) score += 600
    if (move.from === LUDO_BASE) score += 400
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
}

/** Opponent tokens knocked back to base when the seat lands on `relative`. */
export function getCapturedTokens(
  seat: number,
  relative: number,
  allTokens: number[][],
  allySeats: number[] = [seat],
): Array<{ seat: number; tokenIndex: number }> {
  if (!isOnTrack(relative)) return []
  const cell = toAbsoluteCell(seat, relative)
  if (LUDO_SAFE_CELLS.has(cell)) return []

  const captured: Array<{ seat: number; tokenIndex: number }> = []
  for (let otherSeat = 0; otherSeat < allTokens.length; otherSeat++) {
    if (allySeats.includes(otherSeat)) continue
    const otherTokens = allTokens[otherSeat]
    for (let tokenIndex = 0; tokenIndex < otherTokens.length; tokenIndex++) {
      const position = otherTokens[tokenIndex]
      if (!isOnTrack(position)) continue
      if (toAbsoluteCell(otherSeat, position) === cell) {
        captured.push({ seat: otherSeat, tokenIndex })
      }
    }
  }
  return captured
}

export function hasWon(tokens: number[]): boolean {
  return tokens.every((position) => position === LUDO_HOME_INDEX)
}

export function countTokensHome(tokens: number[]): number {
  return tokens.filter((position) => position === LUDO_HOME_INDEX).length
}

export function rollLudoDice(random: () => number = Math.random): number {
  return Math.floor(random() * 6) + 1
}
