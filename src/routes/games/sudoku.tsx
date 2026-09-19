import { useState, useEffect, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Clock, RotateCcw, Trophy, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseInviteSearch } from '@/lib/inviteLinks'
import { GameModeSelector } from '@/components/games/sudoku/GameModeSelector'
import { SudokuBoard } from '@/components/games/sudoku/SudokuBoard'
import { NumberPad } from '@/components/games/sudoku/NumberPad'
import { MultiplayerLobby } from '@/components/games/sudoku/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/sudoku/MultiplayerGame'
import { useSudoku, type Difficulty, type GameMode } from '@/components/games/sudoku/useSudoku'
import { useMultiplayerSudoku } from '@/components/games/sudoku/useMultiplayerSudoku'
import { useSudokuKeyboard } from '@/components/games/sudoku/useSudokuKeyboard'

export const Route = createFileRoute('/games/sudoku')({
  validateSearch: parseInviteSearch,
  component: SudokuPage,
})

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
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>('select')
  const [isResuming, setIsResuming] = useState(false)

  // Single player state
  const game = useSudoku(view === 'single')

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

  // Walk straight back into a game this tab was already in, e.g. after a
  // reload. Runs once; if there is nothing to resume we just show the menu.
  const resumeSession = multiplayer.resumeSession
  const hasAttemptedResume = useRef(false)
  useEffect(() => {
    if (hasAttemptedResume.current) return
    hasAttemptedResume.current = true
    setIsResuming(resumeSession(invitedRoomCode))
  }, [invitedRoomCode, resumeSession])

  // Give up the "resuming" placeholder once we land somewhere real.
  useEffect(() => {
    if (!isResuming) return
    if (multiplayer.gameState || multiplayer.connectionStatus === 'error') {
      setIsResuming(false)
    }
  }, [isResuming, multiplayer.gameState, multiplayer.connectionStatus])

  // Watch for multiplayer connection and game state changes
  useEffect(() => {
    if (multiplayer.gameState) {
      if (multiplayer.gameState.status === 'waiting') {
        setView('multiplayer-lobby')
      } else if (
        multiplayer.gameState.status === 'playing' ||
        multiplayer.gameState.status === 'finished'
      ) {
        setView('multiplayer-game')
      }
    } else if (multiplayer.connectionStatus === 'error' && !isResuming) {
      setView('select')
    }
  }, [isResuming, multiplayer.connectionStatus, multiplayer.gameState?.status])

  // Handle leaving multiplayer
  const handleLeaveMultiplayer = () => {
    multiplayer.disconnect()
    setView('select')
  }

  // Handle back to mode selection
  const handleBackToSelect = () => {
    multiplayer.disconnect()
    setView('select')
  }

  // Keyboard control for single player (multiplayer wires up the same hook)
  useSudokuKeyboard({
    enabled: view === 'single' && game.gameStatus === 'playing',
    selectedCell: game.selectedCell,
    onSelectCell: game.selectCell,
    onNumber: game.setNumber,
    onClear: game.clearCell,
    onToggleNotes: game.toggleNotesMode,
  })

  // Rejoining a game from before a reload - avoids flashing the menu.
  if (view === 'select' && isResuming) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Sudoku</h1>
          <div className="w-[60px]" />
        </div>
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground">Rejoining your game…</p>
        </div>
      </div>
    )
  }

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
          key={invitedRoomCode ?? 'menu'}
          onStartSinglePlayer={handleStartSinglePlayer}
          onCreateMultiplayer={handleCreateMultiplayer}
          onJoinMultiplayer={handleJoinMultiplayer}
          isConnecting={multiplayer.connectionStatus === 'connecting'}
          error={multiplayer.error}
          initialRoomCode={invitedRoomCode}
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
          connected={multiplayer.connectionStatus === 'connected'}
          error={multiplayer.error}
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
          puzzleReady={multiplayer.puzzleReady}
          wrongCells={multiplayer.wrongCells}
          serverTimeOffset={multiplayer.serverTimeOffset}
          restoredCells={multiplayer.restoredCells}
          connected={multiplayer.connectionStatus === 'connected'}
          error={multiplayer.error}
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
