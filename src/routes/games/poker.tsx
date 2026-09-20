import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGameNight } from '@/components/game-night/GameNightProvider'
import { useGameNightGameBridge } from '@/components/game-night/useGameNightGameBridge'
import { getGameNightInviteLink, parseInviteSearch } from '@/lib/inviteLinks'
import { useMultiplayerSession } from '@/lib/multiplayerSession'
import { GameModeSelector } from '@/components/games/poker/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/poker/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/poker/v2/MultiplayerGameV2'
import { useMultiplayerPoker, type PokerSettings } from '@/components/games/poker/useMultiplayerPoker'

export const Route = createFileRoute('/games/poker')({
  validateSearch: parseInviteSearch,
  component: PokerPage,
})

type GameView = 'select' | 'lobby' | 'game'

function PokerPage() {
  const { room: invitedRoomCode, night } = Route.useSearch()
  const [view, setView] = useState<GameView>('select')
  const multiplayer = useMultiplayerPoker()
  const gameNight = useGameNight()
  const gameNightConnection = gameNight.connection?.gameId === 'poker' && gameNight.connection.roomCode === night
    ? gameNight.connection
    : null
  const hasGameState = Boolean(multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.players[multiplayer.playerId])
  const session = useMultiplayerSession({
    game: 'poker',
    joinGame: multiplayer.joinGame,
    hasGameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
    disabled: Boolean(night),
  })
  const bridge = useGameNightGameBridge({
    gameId: 'poker',
    hasGameState,
    finished: multiplayer.gameState?.status === 'finished',
    connectHost: (roomId, playerName) => {
      if (gameNightConnection) multiplayer.createGame(playerName, { startingChips: 1000, smallBlind: 10, blindIncrease: 0, turnTimeLimit: 0 }, roomId)
    },
    connectPlayer: (roomId, playerName) => {
      if (gameNightConnection) multiplayer.joinGame(roomId, playerName)
    },
  })

  const handleCreateMultiplayer = (playerName: string, settings: PokerSettings) => {
    const roomCode = multiplayer.createGame(playerName, settings)
    session.remember(roomCode, playerName)
  }

  const handleJoinMultiplayer = (roomCode: string, playerName: string) => {
    multiplayer.joinGame(roomCode, playerName)
    session.remember(roomCode.toUpperCase(), playerName)
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
    session.forget()
    multiplayer.disconnect()
    setView('select')
  }

  const handleBackToSelect = () => {
    session.forget()
    multiplayer.disconnect()
    setView('select')
  }

  // View 1: Mode Selection (always v1)
  if ((session.isResuming || (night && (!gameNightConnection || bridge.isConnecting))) && effectiveView === 'select') {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Rejoining your game…</p>
      </div>
    )
  }

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
          key={invitedRoomCode ?? 'menu'}
          onCreateMultiplayer={handleCreateMultiplayer}
          onJoinMultiplayer={handleJoinMultiplayer}
          isConnecting={multiplayer.connectionStatus === 'connecting'}
          error={multiplayer.error}
          initialRoomCode={invitedRoomCode}
        />
      </div>
    )
  }

  // View 2: Lobby (always v1)
  if (effectiveView === 'lobby' && multiplayer.gameState && multiplayer.playerId) {
    const lobbyState = gameNightConnection
      ? { ...multiplayer.gameState, roomCode: bridge.publicRoomCode }
      : multiplayer.gameState
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
        <div onClickCapture={(event) => {
          if (!gameNightConnection || !(event.target as HTMLElement).closest('button[aria-label*="invite link"]')) return
          event.preventDefault()
          event.stopPropagation()
          navigator.clipboard.writeText(getGameNightInviteLink(bridge.publicRoomCode))
        }}>
        <MultiplayerLobby
          gameState={lobbyState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onStartGame={multiplayer.startGame}
          onLeave={handleLeaveMultiplayer}
        />
        </div>
      </div>
    )
  }

  // View 3: Game
  if (effectiveView === 'game' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="flex h-[calc(100vh-73px)] flex-col overflow-hidden bg-[#0d1117]">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeaveMultiplayer}
            className="text-white/50 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Leave
          </Button>
          <h1 className="text-sm font-semibold text-white/80">Texas Hold'em</h1>
          <span className="font-mono text-xs text-white/30">
            {gameNightConnection ? bridge.publicRoomCode : multiplayer.gameState.roomCode}
          </span>
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
