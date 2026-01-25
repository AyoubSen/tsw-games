import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GameModeSelector } from '@/components/games/typerace/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/typerace/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/typerace/MultiplayerGame'
import { SinglePlayerGame } from '@/components/games/typerace/SinglePlayerGame'
import { useTypeRace } from '@/components/games/typerace/useTypeRace'
import { useMultiplayerTypeRace } from '@/components/games/typerace/useMultiplayerTypeRace'
import type { GameMode } from '../../../party/typerace'

export const Route = createFileRoute('/games/typerace')({ component: TypeRacePage })

type GameView = 'select' | 'single' | 'multiplayer-lobby' | 'multiplayer-game'

function TypeRacePage() {
  const [view, setView] = useState<GameView>('select')

  // Single player state
  const singlePlayer = useTypeRace()

  // Multiplayer state
  const multiplayer = useMultiplayerTypeRace()

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
      } else if (multiplayer.gameState.status === 'playing' || multiplayer.gameState.status === 'finished') {
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
          <h1 className="text-lg font-bold">Type Race</h1>
          <div className="w-[60px]" />
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
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Type Race</h1>
          <div className="w-[60px]" />
        </div>
        <SinglePlayerGame
          text={singlePlayer.text}
          typedText={singlePlayer.typedText}
          gameStatus={singlePlayer.gameStatus}
          wpm={singlePlayer.wpm}
          accuracy={singlePlayer.accuracy}
          onInput={singlePlayer.handleInput}
          onStart={singlePlayer.startGame}
          onReset={singlePlayer.resetGame}
          onBack={handleBackToSelect}
        />
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
          <h1 className="text-lg font-bold">Multiplayer Type Race</h1>
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
          <h1 className="text-lg font-bold">Type Race</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerGame
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onProgress={multiplayer.sendProgress}
          onComplete={multiplayer.sendComplete}
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
