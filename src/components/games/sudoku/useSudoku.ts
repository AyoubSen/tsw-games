import { useState, useCallback, useEffect, useRef } from 'react'
import sudoku from 'sudoku'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type GameStatus = 'playing' | 'won' | 'paused'

export interface Cell {
  value: number | null
  isInitial: boolean
  notes: Set<number>
  isError: boolean
}

export interface SudokuState {
  board: Cell[][]
  solution: (number | null)[]
  difficulty: Difficulty
  selectedCell: [number, number] | null
  history: Cell[][][]
  timer: number
  gameStatus: GameStatus
  notesMode: boolean
  hintsUsed: number
}

// Difficulty thresholds based on puzzle rating
const DIFFICULTY_THRESHOLDS = {
  easy: { min: 0, max: 30 },
  medium: { min: 30, max: 50 },
  hard: { min: 50, max: 70 },
  expert: { min: 70, max: 200 },
}

function generatePuzzleWithDifficulty(difficulty: Difficulty): { puzzle: (number | null)[], solution: (number | null)[] } {
  let bestPuzzle: (number | null)[] | null = null
  let bestSolution: (number | null)[] | null = null
  let bestRating = 0
  const { min, max } = DIFFICULTY_THRESHOLDS[difficulty]

  // Try to generate a puzzle within the difficulty range
  for (let i = 0; i < 20; i++) {
    const puzzle = sudoku.makepuzzle()
    const solution = sudoku.solvepuzzle(puzzle)
    const rating = sudoku.ratepuzzle(puzzle, 4)

    if (rating >= min && rating <= max) {
      return { puzzle, solution }
    }

    // Keep track of best match
    if (bestPuzzle === null || Math.abs(rating - (min + max) / 2) < Math.abs(bestRating - (min + max) / 2)) {
      bestPuzzle = puzzle
      bestSolution = solution
      bestRating = rating
    }
  }

  return { puzzle: bestPuzzle!, solution: bestSolution! }
}

function arrayToGrid(arr: (number | null)[]): (number | null)[][] {
  const grid: (number | null)[][] = []
  for (let i = 0; i < 9; i++) {
    grid.push(arr.slice(i * 9, (i + 1) * 9))
  }
  return grid
}

function initializeBoard(puzzle: (number | null)[]): Cell[][] {
  const grid = arrayToGrid(puzzle)
  return grid.map(row =>
    row.map(val => ({
      value: val !== null ? val + 1 : null, // sudoku.js uses 0-8, we use 1-9
      isInitial: val !== null,
      notes: new Set<number>(),
      isError: false,
    }))
  )
}

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map(row =>
    row.map(cell => ({
      ...cell,
      notes: new Set(cell.notes),
    }))
  )
}

export function useSudoku() {
  const [state, setState] = useState<SudokuState>(() => {
    const { puzzle, solution } = generatePuzzleWithDifficulty('medium')
    return {
      board: initializeBoard(puzzle),
      solution,
      difficulty: 'medium',
      selectedCell: null,
      history: [],
      timer: 0,
      gameStatus: 'playing',
      notesMode: false,
      hintsUsed: 0,
    }
  })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer effect
  useEffect(() => {
    if (state.gameStatus === 'playing') {
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, timer: prev.timer + 1 }))
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [state.gameStatus])

  const selectCell = useCallback((row: number, col: number) => {
    setState(prev => ({
      ...prev,
      selectedCell: [row, col],
    }))
  }, [])

  const setNumber = useCallback((num: number) => {
    setState(prev => {
      if (!prev.selectedCell || prev.gameStatus !== 'playing') return prev
      const [row, col] = prev.selectedCell
      const cell = prev.board[row][col]

      if (cell.isInitial) return prev

      // Save to history
      const newHistory = [...prev.history, cloneBoard(prev.board)]

      const newBoard = cloneBoard(prev.board)

      if (prev.notesMode) {
        // Toggle note
        if (newBoard[row][col].notes.has(num)) {
          newBoard[row][col].notes.delete(num)
        } else {
          newBoard[row][col].notes.add(num)
        }
        newBoard[row][col].value = null
        newBoard[row][col].isError = false
      } else {
        // Set number and validate on input
        newBoard[row][col].value = num
        newBoard[row][col].notes.clear()
        const expectedValue = prev.solution[row * 9 + col]
        newBoard[row][col].isError = expectedValue !== null && num !== expectedValue + 1
      }

      // Check for win (only if no errors)
      const isComplete = newBoard.every((r, ri) =>
        r.every((c, ci) => {
          if (c.value === null) return false
          const expectedValue = prev.solution[ri * 9 + ci]
          return expectedValue !== null && c.value === expectedValue + 1
        })
      )

      return {
        ...prev,
        board: newBoard,
        history: newHistory,
        gameStatus: isComplete ? 'won' : prev.gameStatus,
      }
    })
  }, [])

  const clearCell = useCallback(() => {
    setState(prev => {
      if (!prev.selectedCell || prev.gameStatus !== 'playing') return prev
      const [row, col] = prev.selectedCell
      const cell = prev.board[row][col]

      if (cell.isInitial) return prev

      const newHistory = [...prev.history, cloneBoard(prev.board)]
      const newBoard = cloneBoard(prev.board)
      newBoard[row][col].value = null
      newBoard[row][col].notes.clear()
      newBoard[row][col].isError = false

      return {
        ...prev,
        board: newBoard,
        history: newHistory,
      }
    })
  }, [])

  const toggleNotesMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      notesMode: !prev.notesMode,
    }))
  }, [])

  const getHint = useCallback(() => {
    setState(prev => {
      if (prev.gameStatus !== 'playing') return prev

      // Find an empty cell and reveal its value
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const cell = prev.board[row][col]
          if (cell.value === null || cell.isError) {
            const solutionValue = prev.solution[row * 9 + col]
            if (solutionValue !== null) {
              const newBoard = cloneBoard(prev.board)
              newBoard[row][col].value = solutionValue + 1
              newBoard[row][col].notes.clear()
              newBoard[row][col].isError = false

              // Check for win after hint
              const isComplete = newBoard.every((r, ri) =>
                r.every((c, ci) => {
                  if (c.value === null) return false
                  const expectedValue = prev.solution[ri * 9 + ci]
                  return expectedValue !== null && c.value === expectedValue + 1
                })
              )

              return {
                ...prev,
                board: newBoard,
                selectedCell: [row, col],
                hintsUsed: prev.hintsUsed + 1,
                gameStatus: isComplete ? 'won' : prev.gameStatus,
              }
            }
          }
        }
      }
      return prev
    })
  }, [])

  const undo = useCallback(() => {
    setState(prev => {
      if (prev.history.length === 0 || prev.gameStatus !== 'playing') return prev

      const newHistory = [...prev.history]
      const previousBoard = newHistory.pop()!

      return {
        ...prev,
        board: previousBoard,
        history: newHistory,
      }
    })
  }, [])

  const newGame = useCallback((difficulty: Difficulty) => {
    const { puzzle, solution } = generatePuzzleWithDifficulty(difficulty)
    setState({
      board: initializeBoard(puzzle),
      solution,
      difficulty,
      selectedCell: null,
      history: [],
      timer: 0,
      gameStatus: 'playing',
      notesMode: false,
      hintsUsed: 0,
    })
  }, [])

  const togglePause = useCallback(() => {
    setState(prev => ({
      ...prev,
      gameStatus: prev.gameStatus === 'paused' ? 'playing' : 'paused',
    }))
  }, [])

  // Count filled cells
  const filledCells = state.board.flat().filter(cell => cell.value !== null).length
  const progress = Math.round((filledCells / 81) * 100)

  return {
    ...state,
    progress,
    filledCells,
    selectCell,
    setNumber,
    clearCell,
    toggleNotesMode,
    getHint,
    undo,
    newGame,
    togglePause,
  }
}
