import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Trophy, Clock, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SudokuBoard } from './SudokuBoard'
import { NumberPad } from './NumberPad'
import type { PublicGameState } from '../../../../party/sudoku'
import { applyErrors, hasSudokuConflict, type Cell } from './useSudoku'
import { useSudokuKeyboard } from './useSudokuKeyboard'

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  /** Whether the round's puzzle has arrived. The solution stays on the server. */
  puzzleReady: boolean
  /** Server's verdict on which of this player's entries are wrong. */
  wrongCells: ReadonlySet<number>
  serverTimeOffset: number
  restoredCells: (number | null)[] | null
  connected: boolean
  error: string | null
  onUpdateProgress: (cells: (number | null)[]) => void
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
  puzzleReady,
  wrongCells,
  serverTimeOffset,
  restoredCells,
  connected,
  error,
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
  const lastSentRef = useRef<string>('')
  const shouldSendRef = useRef(false)

  const puzzle = gameState.puzzle
  const totalToFill = gameState.totalToFill

  // The puzzle can arrive (or change) after mount - on a reconnect resync, or
  // when the host starts a new round. A one-shot useState initializer would
  // leave the board permanently empty in those cases. `restoredCells` is the
  // player's own grid handed back by the server after a reconnect, so it is
  // part of the same identity: a new puzzle or a new restore rebuilds.
  const puzzleKey = puzzle ? puzzle.join(',') : ''
  const restoredKey = restoredCells ? restoredCells.join(',') : ''
  const buildKey = `${puzzleKey}|${restoredKey}`
  // Starts empty so the first pass always runs and applies error marks.
  const renderedRef = useRef<string>('')
  useEffect(() => {
    if (!puzzle || buildKey === renderedRef.current) return
    renderedRef.current = buildKey
    lastSentRef.current = ''
    shouldSendRef.current = false

    const next = initializeBoard(puzzle)
    if (restoredCells && restoredCells.length === 81) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const value = restoredCells[row * 9 + col]
          // Givens come from the puzzle; only the player's own entries restore.
          if (!next[row][col].isInitial && value !== null) {
            next[row][col].value = value
          }
        }
      }
    }
    applyErrors(next, wrongCells)

    setBoard(next)
    setHistory([])
    setSelectedCell(null)
    // wrongCells intentionally omitted: its own effect re-marks the board, and
    // including it here would wipe the player's grid on every server verdict.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, buildKey, restoredCells])

  // The server is the only holder of the solution, so its verdict arrives a
  // beat after the entry. Re-mark the existing board rather than rebuilding it.
  useEffect(() => {
    setBoard(prev => {
      if (prev.length === 0) return prev
      return applyErrors(cloneBoard(prev), wrongCells)
    })
  }, [wrongCells])

  // Timer. `startTime` is a server timestamp, so it is compared against the
  // server's clock - a skewed client clock used to show nonsense here.
  useEffect(() => {
    if (gameState.status !== 'playing' || !gameState.startTime) return

    const tick = () => setElapsedTime(Math.max(0, Date.now() + serverTimeOffset - gameState.startTime!))
    tick()
    const interval = setInterval(tick, 1000)

    return () => clearInterval(interval)
  }, [gameState.status, gameState.startTime, serverTimeOffset])

  // Local, optimistic count for this player's own bar. The server independently
  // scores the same board and is the authority for everyone else's view.
  // Without the solution the client cannot judge correctness itself, so it
  // counts its own filled cells and subtracts the server's last verdict.
  const localProgress = useMemo(() => {
    if (board.length === 0) return 0
    let filled = 0
    let wrong = 0
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = board[row][col]
        if (cell.isInitial || cell.value === null) continue
        filled++
        if (wrongCells.has(row * 9 + col)) wrong++
      }
    }
    return Math.max(0, filled - wrong)
  }, [board, wrongCells])

  // Report the raw board; the server decides progress and completion.
  useEffect(() => {
    if (board.length === 0 || gameState.status !== 'playing' || !connected || !shouldSendRef.current) return
    shouldSendRef.current = false

    const cells: (number | null)[] = []
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        cells.push(board[row][col].value)
      }
    }

    const encoded = cells.join(',')
    if (encoded === lastSentRef.current) return
    lastSentRef.current = encoded
    onUpdateProgress(cells)
  }, [board, gameState.status, connected, onUpdateProgress])

  // History and the new board are derived from the same snapshot. Mixing a
  // closure board into history with a `prev`-derived board update is what made
  // undo restore the wrong position.
  const mutateBoard = useCallback((mutate: (board: Cell[][]) => void) => {
    const newBoard = cloneBoard(board)
    mutate(newBoard)
    // Duplicates are local geometry, so conflicts light up immediately; the
    // server's solution verdict lands a moment later via the effect above.
    applyErrors(newBoard, wrongCells)
    shouldSendRef.current = true
    setHistory(prev => [...prev, board])
    setBoard(newBoard)
  }, [board, wrongCells])

  const setNumber = useCallback((num: number) => {
    if (!selectedCell || gameState.status !== 'playing' || !puzzleReady || !connected) return
    const [row, col] = selectedCell
    if (board[row][col].isInitial) return
    if (!notesMode && hasSudokuConflict(board, row, col, num)) return

    mutateBoard(newBoard => {
      if (notesMode) {
        if (newBoard[row][col].notes.has(num)) {
          newBoard[row][col].notes.delete(num)
        } else {
          newBoard[row][col].notes.add(num)
        }
        newBoard[row][col].value = null
      } else {
        newBoard[row][col].value = num
        newBoard[row][col].notes.clear()
      }
    })
  }, [selectedCell, board, notesMode, gameState.status, puzzleReady, connected, mutateBoard])

  const clearCell = useCallback(() => {
    if (!selectedCell || gameState.status !== 'playing' || !connected) return
    const [row, col] = selectedCell
    if (board[row][col].isInitial) return

    mutateBoard(newBoard => {
      newBoard[row][col] = {
        value: null,
        isInitial: false,
        notes: new Set<number>(),
        isError: false,
      }
    })
  }, [selectedCell, board, gameState.status, connected, mutateBoard])

  const undo = useCallback(() => {
    if (history.length === 0 || gameState.status !== 'playing' || !connected) return
    const previousBoard = history[history.length - 1]
    shouldSendRef.current = true
    setHistory(prev => prev.slice(0, -1))
    setBoard(previousBoard)
  }, [history, gameState.status, connected])

  const clearAll = useCallback(() => {
    if (gameState.status !== 'playing' || !connected) return

    mutateBoard(newBoard => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (!newBoard[row][col].isInitial) {
            newBoard[row][col] = {
              value: null,
              isInitial: false,
              notes: new Set<number>(),
              isError: false,
            }
          }
        }
      }
    })
  }, [gameState.status, connected, mutateBoard])

  const selectCell = useCallback((row: number, col: number) => setSelectedCell([row, col]), [])
  const toggleNotes = useCallback(() => setNotesMode(prev => !prev), [])

  useSudokuKeyboard({
    enabled: gameState.status === 'playing' && puzzleReady && connected,
    selectedCell,
    onSelectCell: selectCell,
    onNumber: setNumber,
    onClear: clearCell,
    onToggleNotes: toggleNotes,
  })

  const players = Object.values(gameState.players).sort((a, b) => b.progress - a.progress)
  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null
  const isFinished = gameState.status === 'finished'
  const controlsDisabled = isFinished || !puzzleReady || !connected

  // Game over screen
  if (isFinished) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-6">
        {!connected && (
          <p className="text-center text-sm text-muted-foreground">Connection lost. Reconnecting...</p>
        )}
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
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
            <Button onClick={onRestart} disabled={!connected} className="flex-1">
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

      {!connected && (
        <p className="text-center text-sm text-muted-foreground">Connection lost. Your board is paused while reconnecting...</p>
      )}
      {error && <p className="text-center text-sm text-destructive">{error}</p>}

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
                  {!player.connected && (
                    <span className="text-xs text-muted-foreground italic">reconnecting…</span>
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
          onCellSelect={selectCell}
          disabled={controlsDisabled}
        />
      </div>

      {/* Number pad */}
      <NumberPad
        onNumberSelect={setNumber}
        onClear={clearCell}
        onClearAll={clearAll}
        onToggleNotes={toggleNotes}
        onUndo={undo}
        notesMode={notesMode}
        canUndo={history.length > 0}
        disabled={controlsDisabled}
        showHint={false}
      />
    </div>
  )
}
