import { describe, it, expect } from 'vitest'
import { applyErrors, findSolutionMismatches, type Cell } from './useSudoku'

/**
 * Build a board from a 81-char string ('.' = empty, '1'-'9' = value) plus a
 * mask of which cells are givens.
 */
function makeBoard(values: string, givens: string): Cell[][] {
  const board: Cell[][] = []
  for (let row = 0; row < 9; row++) {
    const cells: Cell[] = []
    for (let col = 0; col < 9; col++) {
      const ch = values[row * 9 + col]
      cells.push({
        value: ch === '.' ? null : Number(ch),
        isInitial: givens[row * 9 + col] !== '.',
        notes: new Set<number>(),
        isError: false,
      })
    }
    board.push(cells)
  }
  return board
}

/** A valid solved grid, stored 0-8 the way sudoku.js does. */
const SOLVED_1_9 =
  '534678912' +
  '672195348' +
  '198342567' +
  '859761423' +
  '426853791' +
  '713924856' +
  '961537284' +
  '287419635' +
  '345286179'

const SOLUTION = [...SOLVED_1_9].map(ch => Number(ch) - 1)

const EMPTY = '.'.repeat(81)

function errorsAt(board: Cell[][]): [number, number][] {
  const out: [number, number][] = []
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col].isError) out.push([row, col])
    }
  }
  return out
}

describe('applyErrors', () => {
  it('flags a value that disagrees with the solution', () => {
    // (0,2) should be 4; write 9.
    const values = '539' + '.'.repeat(78)
    const board = makeBoard(values, '53' + '.'.repeat(79))
    applyErrors(board, findSolutionMismatches(board, SOLUTION))

    expect(errorsAt(board)).toEqual([[0, 2]])
  })

  it('flags a solution-correct value that duplicates another in its column', () => {
    // This is the reported bug. Column 0: (0,0) is a given 5. The player writes
    // a wrong 5 at (1,0), then the *correct* 6 elsewhere is irrelevant - what
    // matters is that a second 5 in the column is flagged even though one of
    // them matches the solution.
    const values = '5' + '.'.repeat(8) + '5' + '.'.repeat(71)
    const givens = '5' + '.'.repeat(80)
    const board = makeBoard(values, givens)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))

    // (1,0) should be 6, and it duplicates the given 5 above it.
    expect(errorsAt(board)).toEqual([[1, 0]])
  })

  it('flags both cells when two player entries collide but one is correct', () => {
    // (0,2) correctly holds 4. Player also writes 4 at (0,5), where the
    // solution wants 8. Both are in row 0, so both light up - previously the
    // solution-correct 4 stayed unflagged and the conflict was invisible.
    const values = '..4..4' + '.'.repeat(75)
    const board = makeBoard(values, EMPTY)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))

    expect(errorsAt(board)).toEqual([[0, 2], [0, 5]])
  })

  it('clears the conflict once the offending partner is removed', () => {
    const values = '..4..4' + '.'.repeat(75)
    const board = makeBoard(values, EMPTY)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))
    expect(errorsAt(board)).toHaveLength(2)

    board[0][5].value = null
    applyErrors(board, findSolutionMismatches(board, SOLUTION))

    // The correct 4 at (0,2) is no longer in conflict.
    expect(errorsAt(board)).toEqual([])
  })

  it('detects duplicates within a 3x3 box', () => {
    // (0,0)=5 given; player writes 5 at (1,1), same box. Solution wants 7.
    const values = '5' + '.'.repeat(9) + '5' + '.'.repeat(70)
    const givens = '5' + '.'.repeat(80)
    const board = makeBoard(values, givens)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))

    expect(errorsAt(board)).toEqual([[1, 1]])
  })

  it('never flags givens', () => {
    const board = makeBoard(SOLVED_1_9, SOLVED_1_9)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))
    expect(errorsAt(board)).toEqual([])
  })

  it('reports no errors for a correctly completed board', () => {
    const board = makeBoard(SOLVED_1_9, EMPTY)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))
    expect(errorsAt(board)).toEqual([])
  })

  it('ignores empty cells', () => {
    const board = makeBoard(EMPTY, EMPTY)
    applyErrors(board, findSolutionMismatches(board, SOLUTION))
    expect(errorsAt(board)).toEqual([])
  })
})

/**
 * Multiplayer never receives the solution - the server sends back only the
 * indices it judged wrong. These cover that path.
 */
describe('applyErrors without the solution (multiplayer)', () => {
  it('flags duplicates with an empty verdict from the server', () => {
    // Two 4s in row 0 and no server verdict at all: conflicts still light up,
    // which is what keeps feedback instant while the round trip is in flight.
    const board = makeBoard('..4..4' + '.'.repeat(75), EMPTY)
    applyErrors(board, new Set<number>())

    expect(errorsAt(board)).toEqual([[0, 2], [0, 5]])
  })

  it('flags a non-duplicate cell purely on the server verdict', () => {
    // A lone 9 at (0,0) conflicts with nothing, so only the server can know it
    // is wrong. Index 0 = row 0, col 0.
    const board = makeBoard('9' + '.'.repeat(80), EMPTY)

    applyErrors(board, new Set<number>())
    expect(errorsAt(board)).toEqual([])

    applyErrors(board, new Set([0]))
    expect(errorsAt(board)).toEqual([[0, 0]])
  })

  it('still never flags givens, whatever the server says', () => {
    const board = makeBoard('5' + '.'.repeat(80), '5' + '.'.repeat(80))
    applyErrors(board, new Set([0]))
    expect(errorsAt(board)).toEqual([])
  })
})
