import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Clock, RotateCcw, Trophy, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GameModeSelector } from '@/components/games/sudoku/GameModeSelector'
import { SudokuBoard } from '@/components/games/sudoku/SudokuBoard'
import { NumberPad } from '@/components/games/sudoku/NumberPad'
import { MultiplayerLobby } from '@/components/games/sudoku/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/sudoku/MultiplayerGame'
import { useSudoku, type Difficulty, type GameMode } from '@/components/games/sudoku/useSudoku'
import { useMultiplayerSudoku } from '@/components/games/sudoku/useMultiplayerSudoku'

export const Route = createFileRoute('/games/sudoku')({ component: SudokuPage })

type GameView = 'select' | 'single' | 'multiplayer-lobby' | 'multiplayer-game'

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
}

function SudokuPage() {
  const [view, setView] = useState<GameView>('select')

  // Single player state
  const game = useSudoku()

  // Multiplayer state
  const multiplayer = useMultiplayerSudoku()

  // Handle single player start
  const handleStartSinglePlayer = (difficulty: Difficulty, gameMode: GameMode) => {
    game.newGame(difficulty, gameMode)
    setView('single')
  }

  // Handle multiplayer game creation
  const handleCreateMultiplayer = (playerName: string, difficulty: Difficulty) => {
    multiplayer.createGame(playerName, difficulty)
  }

  // Handle multiplayer game join
  const handleJoinMultiplayer = (roomCode: string, playerName: string) => {
    multiplayer.joinGame(roomCode, playerName)
  }

  // Watch for multiplayer connection and game state changes
  useEffect(() => {
    if (multiplayer.connectionStatus === 'connected' && multiplayer.gameState) {
      if (multiplayer.gameState.status === 'waiting') {
        setView('multiplayer-lobby')
      } else if (
        multiplayer.gameState.status === 'playing' ||
        multiplayer.gameState.status === 'finished'
      ) {
        setView('multiplayer-game')
      }
    }
  }, [multiplayer.connectionStatus, multiplayer.gameState?.status])

  // Handle leaving multiplayer
  const handleLeaveMultiplayer = () => {
    multiplayer.disconnect()
    setView('select')
  }

  // Handle back to mode selection
  const handleBackToSelect = () => {
    if (multiplayer.connectionStatus !== 'disconnected') {
      multiplayer.disconnect()
    }
    setView('select')
  }

  // Keyboard handler for single player
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (view !== 'single' || game.gameStatus !== 'playing') return

    // Numbers 1-9 (both regular and numpad)
    const num = parseInt(e.key)
    if (num >= 1 && num <= 9) {
      e.preventDefault()
      game.setNumber(num)
    }
    // Delete or Backspace to clear
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      game.clearCell()
    }
    // Arrow keys to navigate
    else if (e.key.startsWith('Arrow') && game.selectedCell) {
      e.preventDefault()
      const [row, col] = game.selectedCell
      let newRow = row
      let newCol = col

      if (e.key === 'ArrowUp') newRow = Math.max(0, row - 1)
      else if (e.key === 'ArrowDown') newRow = Math.min(8, row + 1)
      else if (e.key === 'ArrowLeft') newCol = Math.max(0, col - 1)
      else if (e.key === 'ArrowRight') newCol = Math.min(8, col + 1)

      game.selectCell(newRow, newCol)
    }
  }, [view, game])

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Mode selection view
  if (view === 'select') {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Link>
          </Button>
          <h1 className="text-lg font-bold">Sudoku</h1>
          <div className="w-[60px]" />
        </div>
        <GameModeSelector
          onStartSinglePlayer={handleStartSinglePlayer}
          onCreateMultiplayer={handleCreateMultiplayer}
          onJoinMultiplayer={handleJoinMultiplayer}
          isConnecting={multiplayer.connectionStatus === 'connecting'}
          error={multiplayer.error}
        />
      </div>
    )
  }

  // Single player view
  if (view === 'single') {
    const isPaused = game.gameStatus === 'paused'
    const isWon = game.gameStatus === 'won'

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {DIFFICULTY_LABELS[game.difficulty]} {game.gameMode === 'hardcore' && '(Hardcore)'}
            </span>
            <div className="flex items-center gap-1.5 font-mono text-lg">
              <Clock className="w-4 h-4" />
              {formatTime(game.timer)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={game.togglePause}
              disabled={isWon}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => game.newGame(game.difficulty, game.gameMode)}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Win message */}
          {isWon && (
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="w-6 h-6 text-yellow-500" />
                <span className="text-xl font-bold">Congratulations!</span>
              </div>
              <p className="text-muted-foreground">
                Completed in {formatTime(game.timer)}
                {game.hintsUsed > 0 && ` with ${game.hintsUsed} hint${game.hintsUsed > 1 ? 's' : ''}`}
              </p>
              <Button onClick={() => game.newGame(game.difficulty, game.gameMode)} className="mt-3">
                Play Again
              </Button>
            </div>
          )}

          {/* Pause overlay */}
          {isPaused && (
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-lg font-medium mb-2">Game Paused</p>
              <Button onClick={game.togglePause}>
                <Play className="w-4 h-4 mr-1" />
                Resume
              </Button>
            </div>
          )}

          {/* Sudoku board */}
          <div className="flex justify-center">
            <SudokuBoard
              board={game.board}
              selectedCell={game.selectedCell}
              onCellSelect={game.selectCell}
              disabled={isPaused || isWon}
              hardcoreMode={game.gameMode === 'hardcore'}
            />
          </div>

          {/* Progress */}
          <div className="text-center text-sm text-muted-foreground">
            {game.filledCells}/81 cells ({game.progress}%)
          </div>

          {/* Number pad */}
          <NumberPad
            onNumberSelect={game.setNumber}
            onClear={game.clearCell}
            onClearAll={game.clearAll}
            onToggleNotes={game.toggleNotesMode}
            onHint={game.getHint}
            onUndo={game.undo}
            notesMode={game.notesMode}
            canUndo={game.history.length > 0}
            disabled={isPaused || isWon}
          />
        </div>
      </div>
    )
  }

  // Multiplayer lobby view
  if (view === 'multiplayer-lobby' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Sudoku Race</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerLobby
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onStart={multiplayer.startGame}
          onLeave={handleLeaveMultiplayer}
        />
      </div>
    )
  }

  // Multiplayer game view
  if (view === 'multiplayer-game' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Sudoku Race</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerGame
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          solution={multiplayer.solution}
          onUpdateProgress={multiplayer.updateProgress}
          onRestart={multiplayer.restartGame}
          onLeave={handleLeaveMultiplayer}
        />
      </div>
    )
  }

  // Fallback
  return (
    <div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">Something went wrong.</p>
        <Button variant="outline" onClick={handleBackToSelect} className="mt-4">
          Go Back
        </Button>
      </div>
    </div>
  )
}
