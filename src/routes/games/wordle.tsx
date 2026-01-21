import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, RotateCcw, Loader2, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Board } from '@/components/games/wordle/Board'
import { Keyboard } from '@/components/games/wordle/Keyboard'
import { useWordle } from '@/components/games/wordle/useWordle'
import { GameModeSelector } from '@/components/games/wordle/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/wordle/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/wordle/MultiplayerGame'
import { useMultiplayerWordle } from '@/components/games/wordle/useMultiplayerWordle'
import {
  loadWords,
  isWordsLoaded,
  getAnswerWords,
  getValidWordsSet,
} from '@/lib/wordService'
import type { GameMode } from '../../../party/wordle'

export const Route = createFileRoute('/games/wordle')({ component: WordlePage })

type GameView = 'select' | 'single' | 'multiplayer-lobby' | 'multiplayer-game'

function WordlePage() {
  const [view, setView] = useState<GameView>('select')
  const [wordsLoaded, setWordsLoaded] = useState(isWordsLoaded())
  const [loadingWords, setLoadingWords] = useState(false)

  // Single player state
  const singlePlayer = useWordle()

  // Multiplayer state
  const multiplayer = useMultiplayerWordle()

  // Load words on mount
  useEffect(() => {
    if (!isWordsLoaded()) {
      setLoadingWords(true)
      loadWords().then(() => {
        setWordsLoaded(true)
        setLoadingWords(false)
      })
    }
  }, [])

  // Handle single player selection
  const handleSinglePlayer = () => {
    setView('single')
  }

  // Handle multiplayer game creation
  const handleCreateMultiplayer = (mode: GameMode, playerName: string) => {
    multiplayer.createGame(mode, playerName)
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
      } else if (multiplayer.gameState.status === 'playing') {
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
    singlePlayer.resetGame()
    setView('select')
  }

  // Loading words screen
  if (loadingWords || (view !== 'select' && !wordsLoaded)) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading dictionary...</p>
        <p className="text-xs text-muted-foreground">First load fetches from API, then cached locally</p>
      </div>
    )
  }

  // Mode selection view
  if (view === 'select') {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <div className="text-center">
            <h1 className="text-xl font-bold">Wordle</h1>
          </div>
          <div className="w-[72px]" /> {/* Spacer for centering */}
        </div>
        <GameModeSelector
          onSinglePlayer={handleSinglePlayer}
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
    const {
      guesses,
      currentGuess,
      currentRow,
      gameStatus,
      usedLetters,
      shake,
      revealRow,
      message,
      answerCount,
      validCount,
      addLetter,
      removeLetter,
      submitGuess,
      resetGame,
      maxGuesses,
      wordLength,
      targetWord,
    } = singlePlayer

    const showDialog = gameStatus === 'won' || gameStatus === 'lost'
    const isLoading = gameStatus === 'loading'

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex flex-col">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="text-center">
            <h1 className="text-xl font-bold">Wordle</h1>
            {answerCount > 0 && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Database className="w-3 h-3" />
                {answerCount.toLocaleString()} answers / {validCount.toLocaleString()} valid
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={resetGame} disabled={isLoading}>
            <RotateCcw className="w-4 h-4 mr-2" />
            New Game
          </Button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading dictionary...</p>
            <p className="text-xs text-muted-foreground">First load fetches from API, then cached locally</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-between py-4 px-2 gap-4">
            {message && (
              <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-lg font-semibold z-50 animate-fade-in">
                {message}
              </div>
            )}

            <div className="flex-1 flex items-center">
              <Board
                guesses={guesses}
                currentGuess={currentGuess}
                currentRow={currentRow}
                shake={shake}
                revealRow={revealRow}
                maxGuesses={maxGuesses}
                wordLength={wordLength}
              />
            </div>

            <div className="w-full px-2">
              <Keyboard
                usedLetters={usedLetters}
                onKey={addLetter}
                onEnter={submitGuess}
                onBackspace={removeLetter}
              />
            </div>
          </div>
        )}

        <Dialog open={showDialog} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                {gameStatus === 'won' ? 'Congratulations!' : 'Game Over'}
              </DialogTitle>
              <DialogDescription className="text-center">
                {gameStatus === 'won' ? (
                  <span>
                    You got it in <strong>{currentRow}</strong> {currentRow === 1 ? 'try' : 'tries'}!
                  </span>
                ) : (
                  <span>
                    The word was <strong className="text-foreground">{targetWord}</strong>
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 mt-4">
              <Button onClick={resetGame} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Play Again
              </Button>
              <Button variant="outline" onClick={handleBackToSelect} className="w-full">
                Back to Mode Select
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Multiplayer lobby view
  if (view === 'multiplayer-lobby' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="text-center">
            <h1 className="text-xl font-bold">Multiplayer Wordle</h1>
          </div>
          <div className="w-[72px]" />
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
      <MultiplayerGame
        gameState={multiplayer.gameState}
        playerId={multiplayer.playerId}
        onGuess={multiplayer.sendGuess}
        onComplete={multiplayer.sendComplete}
        onLeave={handleLeaveMultiplayer}
        validWords={getValidWordsSet()}
        answerWords={getAnswerWords()}
        waitingFor={multiplayer.waitingFor}
        isWaitingForOthers={multiplayer.isWaitingForOthers}
      />
    )
  }

  // Fallback - should not happen
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
