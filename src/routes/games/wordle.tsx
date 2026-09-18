import { useState, useEffect } from 'react'
import { useMultiplayerSession } from '@/lib/multiplayerSession'
import { parseInviteSearch } from '@/lib/inviteLinks'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  RotateCcw,
  Loader2,
  Database,
  Eye,
  EyeOff,
  Palette,
  ShieldCheck,
  Share2,
  Check,
  BadgeQuestionMark,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Board } from '@/components/games/wordle/Board'
import { Keyboard } from '@/components/games/wordle/Keyboard'
import { buildShareText, useWordle, type SinglePlayerMode } from '@/components/games/wordle/useWordle'
import { GameModeSelector } from '@/components/games/wordle/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/wordle/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/wordle/MultiplayerGame'
import { useMultiplayerWordle } from '@/components/games/wordle/useMultiplayerWordle'
import type { GameMode, RevealMode, SeriesLength } from '../../../party/wordle'

export const Route = createFileRoute('/games/wordle')({
  validateSearch: parseInviteSearch,
  component: WordlePage,
})

type GameView = 'select' | 'single' | 'multiplayer-lobby' | 'multiplayer-game'

function WordlePage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>('select')
  const [colorblind, setColorblind] = useState(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('wordle-colorblind') === 'true')
  const [singleResultCopied, setSingleResultCopied] = useState(false)

  // Single player state
  const singlePlayer = useWordle()

  useEffect(() => {
    window.localStorage.setItem('wordle-colorblind', String(colorblind))
  }, [colorblind])

  const shareSingleResult = async () => {
    const text = buildShareText(
      singlePlayer.guesses,
      singlePlayer.gameStatus === 'won',
      singlePlayer.currentRow,
      singlePlayer.oneLieMode ? 'Wordle One Lie' : singlePlayer.hardMode ? 'Wordle Hard' : 'Wordle',
      colorblind,
    )
    await navigator.clipboard.writeText(text)
    setSingleResultCopied(true)
    setTimeout(() => setSingleResultCopied(false), 2000)
  }

  // Multiplayer state
  const multiplayer = useMultiplayerWordle()

  // Walk back into the room this tab was in before a reload.
  const session = useMultiplayerSession({
    game: 'wordle',
    joinGame: multiplayer.joinGame,
    hasGameState: !!multiplayer.gameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
  });

  // Handle single player selection
  const handleSinglePlayer = (mode: SinglePlayerMode) => {
    singlePlayer.startGame(mode)
    setView('single')
  }

  // Handle multiplayer game creation
  const handleCreateMultiplayer = (
    mode: GameMode,
    revealMode: RevealMode,
    hardMode: boolean,
    seriesLength: SeriesLength,
    playerName: string,
  ) => {
    const createdRoom = multiplayer.createGame(mode, revealMode, hardMode, seriesLength, playerName)
    session.remember(createdRoom, playerName)
  }

  // Handle multiplayer game join
  const handleJoinMultiplayer = (roomCode: string, playerName: string) => {
    multiplayer.joinGame(roomCode, playerName);
    session.remember((roomCode).toUpperCase(), playerName);
  }

  // Watch for multiplayer connection and game state changes
  useEffect(() => {
    if (multiplayer.gameState) {
      if (multiplayer.gameState.status === 'waiting') {
        setView('multiplayer-lobby')
      } else if (multiplayer.gameState.status === 'playing' || multiplayer.gameState.status === 'finished') {
        setView('multiplayer-game')
      }
    } else if (multiplayer.connectionStatus === 'error' && !session.isResuming) {
      session.forget()
      setView('select')
    }
  }, [multiplayer.connectionStatus, multiplayer.gameState?.status, session.isResuming])

  // Handle leaving multiplayer
  const handleLeaveMultiplayer = () => {
    session.forget();
    multiplayer.disconnect();
    setView('select')
  }

  // Handle back to mode selection
  const handleBackToSelect = () => {
    if (multiplayer.gameState || multiplayer.connectionStatus !== 'disconnected') {
      session.forget();
      multiplayer.disconnect();
    }
    singlePlayer.resetGame()
    setView('select')
  }

  // Mode selection view
  if (session.isResuming && view === 'select') {
    return (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background">
        <p className="text-muted-foreground">Rejoining your game…</p>
      </div>
    );
  }

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
          <h1 className="text-lg font-bold">Wordle</h1>
          <div className="w-[60px]" /> {/* Spacer for centering */}
        </div>
        <GameModeSelector
          key={invitedRoomCode ?? 'menu'}
          onSinglePlayer={handleSinglePlayer}
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
      revealedWord,
      visualization,
      canVisualize,
      toggleVisualization,
      hardMode,
      canToggleHardMode,
      toggleHardMode,
      oneLieMode,
    } = singlePlayer

    const isLoading = gameStatus === 'loading'
    const isFinished = gameStatus === 'won' || gameStatus === 'lost'
    const resultWord = gameStatus === 'won' ? targetWord : revealedWord

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="text-center">
            <h1 className="text-lg font-bold">Wordle</h1>
            {answerCount > 0 && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Database className="w-3 h-3" />
                {answerCount.toLocaleString()} answers / {validCount.toLocaleString()} valid
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={resetGame} disabled={isLoading}>
            <RotateCcw className="w-4 h-4 mr-1" />
            New
          </Button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading dictionary...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-start gap-6 px-2 py-4 sm:px-4">
            {message && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-lg font-semibold z-50 animate-fade-in">
                {message}
              </div>
            )}

            {oneLieMode && !isFinished && (
              <p className="text-sm text-muted-foreground">
                One yellow or gray tile in every incorrect row is lying.
              </p>
            )}

            {isFinished && (
              <div className="grid w-full max-w-2xl items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="hidden sm:block" />
                <div className="text-center sm:col-start-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {gameStatus === 'won' ? 'Correct word' : 'The word was'}
                  </p>
                  <p className={`mt-1 text-3xl font-bold uppercase tracking-[0.25em] ${colorblind ? 'text-blue-500' : 'text-green-500'}`}>
                    {resultWord}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-self-end">
                  <Button variant="outline" onClick={shareSingleResult} size="sm">
                    {singleResultCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                    {singleResultCopied ? 'Copied' : 'Share'}
                  </Button>
                  <Button onClick={resetGame} size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Play Again
                  </Button>
                </div>
              </div>
            )}

            <Board
              guesses={guesses}
              currentGuess={currentGuess}
              currentRow={currentRow}
              shake={shake}
              revealRow={revealRow}
              maxGuesses={maxGuesses}
              wordLength={wordLength}
              visualization={visualization}
              colorblind={colorblind}
            />

            <div className="w-full max-w-lg space-y-3">
              <div className="flex flex-wrap justify-center gap-2">
                {oneLieMode ? (
                  <Button variant="default" size="sm" disabled>
                    <BadgeQuestionMark className="w-4 h-4 mr-2" />
                    One Lie
                  </Button>
                ) : (
                  <Button
                    variant={hardMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={toggleHardMode}
                    disabled={!canToggleHardMode}
                  >
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Hard {hardMode ? 'On' : 'Off'}
                  </Button>
                )}
                <Button variant={colorblind ? 'default' : 'outline'} size="sm" onClick={() => setColorblind(value => !value)}>
                  <Palette className="w-4 h-4 mr-2" />
                  Colorblind
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleVisualization}
                  disabled={!canVisualize}
                >
                  {visualization ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                  {visualization ? 'Clear visualization' : 'Visualize known letters'}
                </Button>
              </div>
              <Keyboard
                usedLetters={usedLetters}
                onKey={addLetter}
                onEnter={submitGuess}
                onBackspace={removeLetter}
                colorblind={colorblind}
              />
            </div>
          </div>
        )}

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
          <h1 className="text-lg font-bold">Multiplayer Wordle</h1>
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
      <MultiplayerGame
        gameState={multiplayer.gameState}
        privatePlayer={multiplayer.privatePlayer}
        playerId={multiplayer.playerId}
        isHost={multiplayer.isHost}
        connected={multiplayer.connectionStatus === 'connected'}
        error={multiplayer.error}
        onGuess={multiplayer.sendGuess}
        onRestart={multiplayer.restartGame}
        onLeave={handleLeaveMultiplayer}
        waitingFor={multiplayer.waitingFor}
        isWaitingForOthers={multiplayer.isWaitingForOthers}
        roundReveal={multiplayer.roundReveal}
        onDismissReveal={multiplayer.dismissReveal}
        colorblind={colorblind}
        onToggleColorblind={() => setColorblind(value => !value)}
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
  );
}
