import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseInviteSearch } from '@/lib/inviteLinks'
import { useMultiplayerSession } from '@/lib/multiplayerSession'
import { GameModeSelector } from '@/components/games/mafia/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/mafia/MultiplayerLobby'
import { MultiplayerGame } from '@/components/games/mafia/MultiplayerGame'
import { useMultiplayerMafia, type MafiaSettings } from '@/components/games/mafia/useMultiplayerMafia'

export const Route = createFileRoute('/games/mafia')({
  validateSearch: parseInviteSearch,
  component: MafiaPage,
})

type GameView = 'select' | 'lobby' | 'game'

function MafiaPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>('select')
  const multiplayer = useMultiplayerMafia()
  const session = useMultiplayerSession({
    game: 'mafia',
    joinGame: multiplayer.joinGame,
    hasGameState: Boolean(
      multiplayer.gameState &&
      multiplayer.playerId &&
      multiplayer.gameState.players[multiplayer.playerId]
    ),
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
  })

  const handleCreateMultiplayer = (playerName: string, settings: MafiaSettings) => {
    const roomCode = multiplayer.createGame(playerName, settings)
    session.remember(roomCode, playerName)
  }

  const handleJoinMultiplayer = (roomCode: string, playerName: string) => {
    multiplayer.joinGame(roomCode, playerName)
    session.remember(roomCode.toUpperCase(), playerName)
  }

  const effectiveView = (() => {
    if (multiplayer.connectionStatus !== 'connected' || !multiplayer.gameState) {
      return view === 'select' ? 'select' : view
    }
    const status = multiplayer.gameState.status
    if (status === 'playing' || status === 'finished') return 'game'
    if (status === 'waiting') return view === 'select' ? 'lobby' : view
    return view
  })()

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

  if (session.isResuming && effectiveView === 'select') {
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
          <h1 className="text-lg font-bold">Mafia</h1>
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

  if (effectiveView === 'lobby' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleLeaveMultiplayer}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Leave
          </Button>
          <h1 className="text-lg font-bold">Mafia</h1>
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

  if (effectiveView === 'game' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-[#0a0d14]">
        <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800 bg-[#0a0d14]">
          <Button variant="ghost" size="sm" onClick={handleLeaveMultiplayer} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Leave
          </Button>
          <h1 className="text-lg font-bold text-white">Mafia</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerGame
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onNightAction={multiplayer.sendNightAction}
          onWitchAction={multiplayer.sendWitchAction}
          onCupidAction={multiplayer.sendCupidAction}
          onHunterKill={multiplayer.sendHunterKill}
          onDayVote={multiplayer.sendDayVote}
          onChat={multiplayer.sendChat}
          onLeave={handleLeaveMultiplayer}
          error={multiplayer.error}
        />
      </div>
    )
  }

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
