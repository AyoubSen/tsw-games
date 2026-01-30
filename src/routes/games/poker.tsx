import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GameModeSelector } from '@/components/games/poker/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/poker/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/poker/MultiplayerGame'
import { useMultiplayerPoker, type PokerSettings } from '@/components/games/poker/useMultiplayerPoker'

export const Route = createFileRoute('/games/poker')({ component: PokerPage })

type GameView = 'select' | 'lobby' | 'game'

function PokerPage() {
  const [view, setView] = useState<GameView>('select')
  const multiplayer = useMultiplayerPoker()

  const handleCreateMultiplayer = (playerName: string, settings: PokerSettings) => {
    multiplayer.createGame(playerName, settings)
  }

  const handleJoinMultiplayer = (roomCode: string, playerName: string) => {
    multiplayer.joinGame(roomCode, playerName)
  }

  // Derive the effective view from both local state and server state
  // This ensures we always show the right view even if an update was missed
  const effectiveView = (() => {
    if (multiplayer.connectionStatus !== 'connected' || !multiplayer.gameState) {
      return view === 'select' ? 'select' : view
    }
    const status = multiplayer.gameState.status
    if (status === 'playing' || status === 'finished') return 'game'
    if (status === 'waiting') return view === 'select' ? 'lobby' : view
    return view
  })()

  // Keep local view in sync
  useEffect(() => {
    if (multiplayer.connectionStatus === 'connected' && multiplayer.gameState) {
      const status = multiplayer.gameState.status
      if (status === 'waiting' && view === 'select') {
        setView('lobby')
      } else if ((status === 'playing' || status === 'finished') && view !== 'game') {
        setView('game')
      }
    }
  }, [multiplayer.connectionStatus, multiplayer.gameState?.status, view])

  const handleLeaveMultiplayer = () => {
    multiplayer.disconnect()
    setView('select')
  }

  const handleBackToSelect = () => {
    if (multiplayer.connectionStatus !== 'disconnected') {
      multiplayer.disconnect()
    }
    setView('select')
  }

  // View 1: Mode Selection
  if (effectiveView === 'select') {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Link>
          </Button>
          <h1 className="text-lg font-bold">Texas Hold'em</h1>
          <div className="w-[60px]" />
        </div>
        <GameModeSelector
          onCreateMultiplayer={handleCreateMultiplayer}
          onJoinMultiplayer={handleJoinMultiplayer}
          isConnecting={multiplayer.connectionStatus === 'connecting'}
          error={multiplayer.error}
        />
      </div>
    )
  }

  // View 2: Lobby
  if (effectiveView === 'lobby' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleLeaveMultiplayer}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Leave
          </Button>
          <h1 className="text-lg font-bold">Texas Hold'em</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerLobby
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onStartGame={multiplayer.startGame}
          onLeave={handleLeaveMultiplayer}
        />
      </div>
    )
  }

  // View 3: Game
  if (effectiveView === 'game' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleLeaveMultiplayer}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Leave
          </Button>
          <h1 className="text-lg font-bold">Texas Hold'em</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerGame
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onFold={multiplayer.fold}
          onCheck={multiplayer.check}
          onCall={multiplayer.call}
          onRaise={multiplayer.raise}
          onAllIn={multiplayer.allIn}
          onNextHand={multiplayer.nextHand}
          onLeave={handleLeaveMultiplayer}
          error={multiplayer.error}
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
