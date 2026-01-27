import { useState, useEffect, useCallback, useRef } from 'react'
import { Trophy, Clock, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SudokuBoard } from './SudokuBoard'
import { NumberPad } from './NumberPad'
import type { PublicGameState } from '../../../../party/sudoku'
import type { Cell } from './useSudoku'

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  solution: (number | null)[] | null
  onUpdateProgress: (progress: number, completed: boolean) => void
  onRestart: () => void
  onLeave: () => void
}

function initializeBoard(puzzle: (number | null)[]): Cell[][] {
  const grid: Cell[][] = []
  for (let i = 0; i < 9; i++) {
    const row: Cell[] = []
    for (let j = 0; j < 9; j++) {
      const val = puzzle[i * 9 + j]
      row.push({
        value: val !== null ? val + 1 : null,
        isInitial: val !== null,
        notes: new Set<number>(),
        isError: false,
      })
    }
    grid.push(row)
  }
  return grid
}

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map(row =>
    row.map(cell => ({
      ...cell,
      notes: new Set(cell.notes),
    }))
  )
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function MultiplayerGame({
  gameState,
  playerId,
  isHost,
  solution,
  onUpdateProgress,
  onRestart,
  onLeave,
}: MultiplayerGameProps) {
  const [board, setBoard] = useState<Cell[][]>(() =>
    gameState.puzzle ? initializeBoard(gameState.puzzle) : []
  )
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [notesMode, setNotesMode] = useState(false)
  const [history, setHistory] = useState<Cell[][][]>([])
  const [elapsedTime, setElapsedTime] = useState(0)
  const [totalToFill, setTotalToFill] = useState(() => {
    // Calculate totalToFill from the puzzle on mount
    if (!gameState.puzzle) return 0
    return gameState.puzzle.filter(cell => cell === null).length
  })
  const [localProgress, setLocalProgress] = useState(0)
  const lastProgressRef = useRef(0)

  // Timer
  useEffect(() => {
    if (gameState.status !== 'playing' || !gameState.startTime) return

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - gameState.startTime!)
    }, 1000)

    return () => clearInterval(interval)
  }, [gameState.status, gameState.startTime])

  // Calculate and report progress (only count user-filled cells, not initial ones)
  const calculateProgress = useCallback((currentBoard: Cell[][]): { progress: number; completed: boolean; totalToFill: number } => {
    if (!solution) return { progress: 0, completed: false, totalToFill: 0 }

    let userFilledCorrect = 0
    let totalToFill = 0
    let complete = true

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = currentBoard[row][col]
        const expected = solution[row * 9 + col]

        // Only count cells that need to be filled by the user
        if (!cell.isInitial) {
          totalToFill++

          if (cell.value === null) {
            complete = false
          } else if (expected !== null && cell.value === expected + 1) {
            userFilledCorrect++
          } else {
            // Wrong value
            complete = false
          }
        }
      }
    }

    return { progress: userFilledCorrect, completed: complete && userFilledCorrect === totalToFill, totalToFill }
  }, [solution])

  // Report progress when board changes
  useEffect(() => {
    const { progress, completed, totalToFill: total } = calculateProgress(board)
    setTotalToFill(total)
    setLocalProgress(progress)
    if (progress !== lastProgressRef.current || completed) {
      lastProgressRef.current = progress
      onUpdateProgress(progress, completed)
    }
  }, [board, calculateProgress, onUpdateProgress])

  const setNumber = useCallback((num: number) => {
    if (!selectedCell || gameState.status !== 'playing' || !solution) return
    const [row, col] = selectedCell
    const cell = board[row][col]
    if (cell.isInitial) return

    setHistory(prev => [...prev, cloneBoard(board)])
    setBoard(prev => {
      const newBoard = cloneBoard(prev)
      if (notesMode) {
        if (newBoard[row][col].notes.has(num)) {
          newBoard[row][col].notes.delete(num)
        } else {
          newBoard[row][col].notes.add(num)
        }
        newBoard[row][col].value = null
        newBoard[row][col].isError = false
      } else {
        newBoard[row][col].value = num
        newBoard[row][col].notes.clear()
        // Validate on input
        const expected = solution[row * 9 + col]
        newBoard[row][col].isError = expected !== null && num !== expected + 1
      }
      return newBoard
    })
  }, [selectedCell, board, notesMode, gameState.status, solution])

  const clearCell = useCallback(() => {
    if (!selectedCell || gameState.status !== 'playing') return
    const [row, col] = selectedCell
    const cell = board[row][col]
    if (cell.isInitial) return

    setHistory(prev => [...prev, cloneBoard(board)])
    setBoard(prev => {
      const newBoard = cloneBoard(prev)
      newBoard[row][col].value = null
      newBoard[row][col].notes.clear()
      return newBoard
    })
  }, [selectedCell, board, gameState.status])

  const undo = useCallback(() => {
    if (history.length === 0 || gameState.status !== 'playing') return
    setHistory(prev => {
      const newHistory = [...prev]
      const previousBoard = newHistory.pop()!
      setBoard(previousBoard)
      return newHistory
    })
  }, [history.length, gameState.status])

  const players = Object.values(gameState.players).sort((a, b) => b.progress - a.progress)
  const currentPlayer = gameState.players[playerId]
  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null
  const isFinished = gameState.status === 'finished'

  // Game over screen
  if (isFinished) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Race Complete!</h2>
          {winner && (
            <p className="text-lg text-muted-foreground">
              <span className="font-semibold text-foreground">{winner.name}</span>
              {winner.id === playerId ? ' (You)' : ''} wins!
            </p>
          )}
        </div>

        {/* Final standings */}
        <div className="space-y-2">
          <h3 className="font-semibold">Final Standings</h3>
          {players.map((player, index) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                player.id === playerId ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="font-medium">
                  {player.name}
                  {player.id === playerId && ' (You)'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {player.progress}/{totalToFill} cells
                  {player.completedAt && gameState.startTime && (
                    <span> - {formatTime(player.completedAt - gameState.startTime)}</span>
                  )}
                </div>
              </div>
              {player.id === gameState.winnerId && (
                <Trophy className="w-5 h-5 text-yellow-500" />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onLeave} className="flex-1">
            Leave
          </Button>
          {isHost && (
            <Button onClick={onRestart} className="flex-1">
              Play Again
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Timer */}
      <div className="flex items-center justify-center gap-2 text-lg font-mono">
        <Clock className="w-5 h-5" />
        {formatTime(elapsedTime)}
      </div>

      {/* Player progress bars */}
      <div className="space-y-2">
        {players.map((player) => {
          const isCurrentPlayer = player.id === playerId
          // Use local progress for current player for immediate feedback
          const displayProgress = isCurrentPlayer ? localProgress : player.progress
          const maxProgress = totalToFill || 1
          const progressPercent = Math.round((displayProgress / maxProgress) * 100)

          return (
            <div key={player.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isCurrentPlayer ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
                  <span className={isCurrentPlayer ? 'font-semibold' : ''}>
                    {player.name}
                    {isCurrentPlayer && ' (You)'}
                  </span>
                  {player.id === gameState.hostId && (
                    <Crown className="w-3 h-3 text-yellow-500" />
                  )}
                </div>
                <span className="text-muted-foreground">
                  {displayProgress}/{totalToFill}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )
        })}
      </div>

      {/* Sudoku board */}
      <div className="flex justify-center">
        <SudokuBoard
          board={board}
          selectedCell={selectedCell}
          onCellSelect={(row, col) => setSelectedCell([row, col])}
          disabled={isFinished}
        />
      </div>

      {/* Number pad */}
      <NumberPad
        onNumberSelect={setNumber}
        onClear={clearCell}
        onToggleNotes={() => setNotesMode(prev => !prev)}
        onUndo={undo}
        notesMode={notesMode}
        canUndo={history.length > 0}
        disabled={isFinished}
        showHint={false}
      />
    </div>
  )
}
