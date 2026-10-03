/**
 * Parcheesi (US rules). The game keeps its original "ludo" ids for routes,
 * party names and saved sessions.
 */
import type { BotLevel } from "./botLevel"
export const LUDO_COLORS = [
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
] as const

export type LudoColor = (typeof LUDO_COLORS)[number]["id"]

export const LUDO_SEATS = 4
export const LUDO_TOKENS_PER_PLAYER = 4
export const LUDO_BOARD_SIZE = 19
export const LUDO_TRACK_LENGTH = 68
/** Relative steps: 0-63 on the shared track, 64-70 up the home path, 71 home. */
export const LUDO_HOME_ENTRY = 64
export const LUDO_HOME_INDEX = 71
export const LUDO_BASE = -1
/** A five - on one die, or both dice together - brings a pawn out of the nest. */
export const LUDO_ENTER_VALUE = 5
export const LUDO_CAPTURE_BONUS = 20
export const LUDO_HOME_BONUS = 10

/**
 * Board cells of the shared track, clockwise, on a 19x19 grid. Each arm is
 * three columns of eight: out along one side, across the end, back down the
 * other.
 */
export const LUDO_TRACK: ReadonlyArray<readonly [number, number]> = (() => {
  const track: Array<readonly [number, number]> = []
  for (let row = 7; row >= 0; row--) track.push([row, 8])
  track.push([0, 9])
  for (let row = 0; row <= 7; row++) track.push([row, 10])
  for (let col = 11; col <= 18; col++) track.push([8, col])
  track.push([9, 18])
  for (let col = 18; col >= 11; col--) track.push([10, col])
  for (let row = 11; row <= 18; row++) track.push([row, 10])
  track.push([18, 9])
  for (let row = 18; row >= 11; row--) track.push([row, 8])
  for (let col = 7; col >= 0; col--) track.push([10, col])
  track.push([9, 0])
  for (let col = 0; col <= 7; col++) track.push([8, col])
  return track
})()

/** Track index each seat enters on - the fifth square in, beside its nest. */
export const LUDO_ENTRY_INDEX = [64, 13, 30, 47] as const

/** Entry squares, the fifth square on the other side of each arm, and the arm ends. */
export const LUDO_SAFE_CELLS: ReadonlySet<number> = new Set([
  64, 13, 30, 47, 54, 3, 20, 37, 59, 8, 25, 42,
])

/** Seven private cells up the middle of an arm, then the home triangle. */
export const LUDO_HOME_PATH: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7], [9, 8]],
  [[1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9]],
  [[9, 17], [9, 16], [9, 15], [9, 14], [9, 13], [9, 12], [9, 11], [9, 10]],
  [[17, 9], [16, 9], [15, 9], [14, 9], [13, 9], [12, 9], [11, 9], [10, 9]],
]

/** Top-left corner of each seat's 8x8 nest. */
export const LUDO_NEST_ORIGIN = [
  [0, 0],
  [0, 11],
  [11, 11],
  [11, 0],
] as const

export const LUDO_BASE_SLOTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
  LUDO_NEST_ORIGIN.map(([row, col]) =>
    [
      [2, 2],
      [2, 5],
      [5, 2],
      [5, 5],
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

/** A move still owed this turn: a rolled die, or a capture / home bonus. */
export interface LudoDie {
  value: number
  bonus: boolean
}

export interface LudoMove {
  id: string
  /** Whose pawn moves - your own, or in 2v2 your partner's once yours are home. */
  seat: number
  tokenIndex: number
  from: number
  to: number
  /** Indices into the pending dice this move uses up. */
  dice: number[]
  captured: { seat: number; tokenIndex: number } | null
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

/** Pawns standing on the same physical square as `seat`'s step `relative`. */
function occupantsAt(
  seat: number,
  relative: number,
  allTokens: number[][],
): Array<{ seat: number; tokenIndex: number }> {
  const occupants: Array<{ seat: number; tokenIndex: number }> = []
  if (isOnTrack(relative)) {
    const cell = toAbsoluteCell(seat, relative)
    allTokens.forEach((tokens, otherSeat) => {
      tokens.forEach((position, tokenIndex) => {
        if (isOnTrack(position) && toAbsoluteCell(otherSeat, position) === cell) {
          occupants.push({ seat: otherSeat, tokenIndex })
        }
      })
    })
  } else if (relative > LUDO_BASE && relative < LUDO_HOME_INDEX) {
    allTokens[seat]?.forEach((position, tokenIndex) => {
      if (position === relative) occupants.push({ seat, tokenIndex })
    })
  }
  return occupants
}

/** Two pawns of one colour on a square block everyone from passing it. */
function isBlockade(occupants: Array<{ seat: number }>): boolean {
  return occupants.length >= 2 && occupants[0].seat === occupants[1].seat
}

function tryEnter(
  seat: number,
  tokenIndex: number,
  allTokens: number[][],
  allySeats: number[],
): Omit<LudoMove, "id" | "dice"> | null {
  const occupants = occupantsAt(seat, 0, allTokens)
  const friendly = occupants.filter((occupant) => allySeats.includes(occupant.seat))
  if (friendly.length >= 2) return null
  // Entering knocks out an opponent even though the entry square is safe.
  const captured =
    occupants.find((occupant) => !allySeats.includes(occupant.seat)) ?? null
  return { seat, tokenIndex, from: LUDO_BASE, to: 0, captured, finishes: false }
}

function tryAdvance(
  seat: number,
  tokenIndex: number,
  value: number,
  allTokens: number[][],
  allySeats: number[],
): Omit<LudoMove, "id" | "dice"> | null {
  const from = allTokens[seat][tokenIndex]
  if (from === LUDO_BASE || from === LUDO_HOME_INDEX) return null
  const to = from + value
  if (to > LUDO_HOME_INDEX) return null

  for (let step = from + 1; step <= to && step < LUDO_HOME_INDEX; step++) {
    if (isBlockade(occupantsAt(seat, step, allTokens))) return null
  }
  if (to === LUDO_HOME_INDEX) {
    return { seat, tokenIndex, from, to, captured: null, finishes: true }
  }

  const occupants = occupantsAt(seat, to, allTokens)
  if (occupants.length >= 2) return null
  const opponent = occupants.find((occupant) => !allySeats.includes(occupant.seat))
  const safe = isOnTrack(to) && LUDO_SAFE_CELLS.has(toAbsoluteCell(seat, to))
  return {
    seat,
    tokenIndex,
    from,
    to,
    captured: opponent && !safe ? opponent : null,
    finishes: false,
  }
}

/** Every move playable with the pending dice across the seats you control. */
export function getLegalMoves(
  controlledSeats: number[],
  pending: LudoDie[],
  allTokens: number[][],
  allySeats: number[] = controlledSeats,
): LudoMove[] {
  const moves: LudoMove[] = []
  const add = (move: Omit<LudoMove, "id" | "dice"> | null, dice: number[]) => {
    if (move) moves.push({ ...move, dice, id: `${move.seat}-${move.tokenIndex}-${dice.join("+")}` })
  }

  const seenValues = new Set<string>()
  pending.forEach((die, dieIndex) => {
    const key = `${die.value}:${die.bonus}`
    if (seenValues.has(key)) return
    seenValues.add(key)
    for (const seat of controlledSeats) {
      const tokens = allTokens[seat] ?? []
      // Pawns in the nest are interchangeable - offer just one of them.
      const nestPawn = tokens.indexOf(LUDO_BASE)
      tokens.forEach((position, tokenIndex) => {
        if (position === LUDO_BASE) {
          if (tokenIndex !== nestPawn) return
          if (die.bonus || die.value !== LUDO_ENTER_VALUE) return
          add(tryEnter(seat, tokenIndex, allTokens, allySeats), [dieIndex])
          return
        }
        add(tryAdvance(seat, tokenIndex, die.value, allTokens, allySeats), [dieIndex])
      })
    }
  })

  // Two rolled dice that add up to five also bring a pawn out.
  for (let first = 0; first < pending.length; first++) {
    for (let second = first + 1; second < pending.length; second++) {
      const a = pending[first]
      const b = pending[second]
      if (a.bonus || b.bonus || a.value + b.value !== LUDO_ENTER_VALUE) continue
      const key = `enter:${Math.min(a.value, b.value)}`
      if (seenValues.has(key)) continue
      seenValues.add(key)
      for (const seat of controlledSeats) {
        const nestPawn = (allTokens[seat] ?? []).indexOf(LUDO_BASE)
        if (nestPawn === -1) continue
        add(tryEnter(seat, nestPawn, allTokens, allySeats), [first, second])
      }
    }
  }
  return moves
}

function applyToTokens(allTokens: number[][], move: LudoMove): number[][] {
  const next = allTokens.map((tokens) => [...tokens])
  next[move.seat][move.tokenIndex] = move.to
  if (move.captured) next[move.captured.seat][move.captured.tokenIndex] = LUDO_BASE
  return next
}

/**
 * Legal moves, narrowed to those that still let you use as many of the
 * pending dice as possible - you cannot throw a die away when both could
 * be played.
 */
export function getPlayableMoves(
  controlledSeats: number[],
  pending: LudoDie[],
  allTokens: number[][],
  allySeats: number[] = controlledSeats,
): LudoMove[] {
  const moves = getLegalMoves(controlledSeats, pending, allTokens, allySeats)
  if (moves.length <= 1) return moves

  const memo = new Map<string, number>()
  const remaining = (dice: LudoDie[], move: LudoMove) =>
    dice.filter((_, index) => !move.dice.includes(index))
  const mostUsable = (tokens: number[][], dice: LudoDie[]): number => {
    if (dice.length === 0) return 0
    const key = `${tokens.map((seat) => seat.join(",")).join("/")}|${dice
      .map((die) => `${die.value}${die.bonus ? "b" : ""}`)
      .sort()
      .join(",")}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    let most = 0
    for (const move of getLegalMoves(controlledSeats, dice, tokens, allySeats)) {
      const used =
        move.dice.length + mostUsable(applyToTokens(tokens, move), remaining(dice, move))
      if (used > most) most = used
      if (most === dice.length) break
    }
    memo.set(key, most)
    return most
  }

  const scored = moves.map((move) => ({
    move,
    used:
      move.dice.length + mostUsable(applyToTokens(allTokens, move), remaining(pending, move)),
  }))
  const best = Math.max(...scored.map((entry) => entry.used))
  return scored.filter((entry) => entry.used === best).map((entry) => entry.move)
}

/** The dice a roll grants: doubles add their opposite faces once no pawn is nested. */
export function diceForRoll(values: readonly [number, number], allOut: boolean): LudoDie[] {
  const [a, b] = values
  if (a === b && allOut) {
    return [a, a, 7 - a, 7 - a].map((value) => ({ value, bonus: false }))
  }
  return [a, b].map((value) => ({ value, bonus: false }))
}

/**
 * Pick a move the way a reasonable player would: take the capture, bring a
 * pawn home, get out of the nest, spend big bonuses, else run furthest.
 */
export function chooseBestMove(moves: LudoMove[]): LudoMove | null {
  let best: LudoMove | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const move of moves) {
    let score = move.to + (move.to - Math.max(0, move.from))
    if (move.captured) score += 1000
    if (move.finishes) score += 800
    if (move.from === LUDO_BASE) score += 500
    if (move.to >= LUDO_HOME_ENTRY) score += 200
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
}

/** Opponent pawns that could land on `seat`'s step `relative` next roll, with one die or both. */
function threatsTo(seat: number, relative: number, allTokens: number[][], allySeats: number[]): number {
  if (!isOnTrack(relative)) return 0
  const cell = toAbsoluteCell(seat, relative)
  if (LUDO_SAFE_CELLS.has(cell)) {
    // Only a pawn coming out of its nest captures on a safe square - its own entry square.
    const owner = (LUDO_ENTRY_INDEX as readonly number[]).indexOf(cell)
    return owner >= 0 && !allySeats.includes(owner) && allTokens[owner]?.includes(LUDO_BASE) ? 1 : 0
  }
  let threats = 0
  allTokens.forEach((tokens, other) => {
    if (allySeats.includes(other)) return
    for (const position of tokens) {
      if (!isOnTrack(position)) continue
      const gap = (cell - toAbsoluteCell(other, position) + LUDO_TRACK_LENGTH) % LUDO_TRACK_LENGTH
      if (gap >= 1 && gap <= 12 && position + gap < LUDO_HOME_ENTRY) threats++
    }
  })
  return threats
}

/** Pawns of `seat` sharing its step `relative` with another of its own - a blockade nobody can hit. */
function inBlockade(seat: number, relative: number, allTokens: number[][]): boolean {
  return isOnTrack(relative) && occupantsAt(seat, relative, allTokens).filter((occupant) => occupant.seat === seat).length >= 2
}

/**
 * A bot's pick at its difficulty. Easy mostly moves a random pawn; normal is `chooseBestMove`;
 * hard weighs captures, blockades, safe squares and which pawns opponents can reach next roll.
 */
export function chooseBotMove(
  moves: LudoMove[],
  level: BotLevel,
  allTokens: number[][],
  allySeats: number[],
): LudoMove | null {
  if (moves.length === 0) return null
  if (level === "easy" && Math.random() < 0.6) return moves[Math.floor(Math.random() * moves.length)]
  if (level !== "hard") return chooseBestMove(moves)

  let best: LudoMove | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const move of moves) {
    const after = applyToTokens(allTokens, move)
    let score = move.to - Math.max(0, move.from)
    // Knocking out a pawn that has come further sets its owner back more.
    if (move.captured) score += 1000 + Math.max(0, allTokens[move.captured.seat][move.captured.tokenIndex])
    if (move.finishes) score += 800
    if (move.from === LUDO_BASE) score += 450
    if (!move.finishes && move.to >= LUDO_HOME_ENTRY) score += 250
    if (inBlockade(move.seat, move.to, after)) score += 200
    else {
      if (isOnTrack(move.to) && LUDO_SAFE_CELLS.has(toAbsoluteCell(move.seat, move.to))) score += 120
      score -= Math.min(3, threatsTo(move.seat, move.to, after, allySeats)) * 250
    }
    if (move.from !== LUDO_BASE) {
      if (inBlockade(move.seat, move.from, allTokens)) score -= 80
      // Pull a pawn out of reach.
      else score += Math.min(3, threatsTo(move.seat, move.from, allTokens, allySeats)) * 150
    }
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
}

export function hasWon(tokens: number[]): boolean {
  return tokens.every((position) => position === LUDO_HOME_INDEX)
}

export function countTokensHome(tokens: number[]): number {
  return tokens.filter((position) => position === LUDO_HOME_INDEX).length
}

export function rollLudoDice(random: () => number = Math.random): [number, number] {
  return [Math.floor(random() * 6) + 1, Math.floor(random() * 6) + 1]
}
