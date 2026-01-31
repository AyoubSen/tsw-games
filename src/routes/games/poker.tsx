import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GameModeSelector } from '@/components/games/poker/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/poker/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/poker/MultiplayerGame'
import { MultiplayerGame as MultiplayerGameV2 } from '@/components/games/poker/v2/MultiplayerGameV2'
import { useMultiplayerPoker, type PokerSettings } from '@/components/games/poker/useMultiplayerPoker'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/games/poker')({ component: PokerPage })

type GameView = 'select' | 'lobby' | 'game'
type UIVersion = 'v1' | 'v2'

function VersionToggle({ version, onChange }: { version: UIVersion; onChange: (v: UIVersion) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-border text-xs">
      <button
        onClick={() => onChange('v1')}
        className={cn(
          "px-2.5 py-1 font-medium transition-colors",
          version === 'v1'
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
      >
        v1
      </button>
      <button
        onClick={() => onChange('v2')}
        className={cn(
          "px-2.5 py-1 font-medium transition-colors",
          version === 'v2'
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
      >
        v2
      </button>
    </div>
  )
}

function PokerPage() {
  const [view, setView] = useState<GameView>('select')
  const [uiVersion, setUiVersion] = useState<UIVersion>('v2')
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

  const isV2 = uiVersion === 'v2'

  // View 1: Mode Selection (always v1)
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

  // View 2: Lobby (always v1)
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

  // View 3: Game (toggle between v1 and v2)
  if (effectiveView === 'game' && multiplayer.gameState && multiplayer.playerId) {
    const GameComponent = isV2 ? MultiplayerGameV2 : MultiplayerGame
    return (
      <div className={isV2 ? "min-h-[calc(100vh-73px)] bg-[#0f1520]" : "min-h-[calc(100vh-73px)] bg-background"}>
        <div className={cn(
          "px-4 py-3 flex items-center justify-between border-b",
          isV2 ? "border-zinc-800 bg-[#0f1520]" : "border-border"
        )}>
          <Button variant="ghost" size="sm" onClick={handleLeaveMultiplayer} className={isV2 ? "text-zinc-400 hover:text-white" : ""}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Leave
          </Button>
          <div className="flex items-center gap-2">
            <VersionToggle version={uiVersion} onChange={setUiVersion} />
          </div>
          <h1 className={cn("text-lg font-bold", isV2 && "text-white")}>Texas Hold'em</h1>
          <div className="w-[60px]" />
        </div>
        <GameComponent
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
