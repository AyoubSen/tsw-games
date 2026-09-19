export const MEMORY_SYMBOLS = [
  { id: "moon", glyph: "☾", label: "Moon" },
  { id: "star", glyph: "★", label: "Star" },
  { id: "sun", glyph: "☀", label: "Sun" },
  { id: "bolt", glyph: "ϟ", label: "Lightning" },
  { id: "diamond", glyph: "◆", label: "Diamond" },
  { id: "flower", glyph: "✿", label: "Flower" },
  { id: "snow", glyph: "❄", label: "Snowflake" },
  { id: "heart", glyph: "♥", label: "Heart" },
] as const

export type MemorySymbol = (typeof MEMORY_SYMBOLS)[number]["id"]

export const MEMORY_BOARD_SIZE = MEMORY_SYMBOLS.length * 2
export const MEMORY_PAIR_COUNT = MEMORY_SYMBOLS.length
export const MEMORY_MISMATCH_MS = 900
export const MEMORY_COUNTDOWN_MS = 3000

export const MEMORY_SYMBOL_DETAILS = Object.fromEntries(
  MEMORY_SYMBOLS.map((symbol) => [symbol.id, symbol]),
) as Record<MemorySymbol, (typeof MEMORY_SYMBOLS)[number]>

export function isMemorySymbol(value: unknown): value is MemorySymbol {
  return MEMORY_SYMBOLS.some((symbol) => symbol.id === value)
}

export function isMemoryBoardIndex(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= 0 &&
    Number(value) < MEMORY_BOARD_SIZE
  )
}

export function generateMemoryBoard(
  random: () => number = Math.random,
): MemorySymbol[] {
  const board = MEMORY_SYMBOLS.flatMap((symbol) => [symbol.id, symbol.id])
  for (let index = board.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = board[index]
    board[index] = board[swapIndex]
    board[swapIndex] = current
  }
  return board
}

export function formatMemoryTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`
}
