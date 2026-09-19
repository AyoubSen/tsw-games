import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseInviteSearch } from '@/lib/inviteLinks'
import { useMultiplayerSession } from '@/lib/multiplayerSession'
import { GameModeSelector } from '@/components/games/codenames/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/codenames/MultiplayerLobby'
import { TeamSelector } from '@/components/games/codenames/TeamSelector'
import { MultiplayerGame } from '@/components/games/codenames/MultiplayerGame'
import { useMultiplayerCodenames, type GameSettings } from '@/components/games/codenames/useMultiplayerCodenames'
import type { Team, PlayerRole } from '../../../party/codenames'

export const Route = createFileRoute('/games/codenames')({
  validateSearch: parseInviteSearch,
  component: CodenamesPage,
})

type GameView = 'select' | 'lobby' | 'team-selection' | 'game'

function CodenamesPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>('select')

  const multiplayer = useMultiplayerCodenames()
  const session = useMultiplayerSession({
    game: 'codenames',
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

  // Handle multiplayer game creation
  const handleCreateMultiplayer = (playerName: string, settings: GameSettings) => {
    const roomCode = multiplayer.createGame(playerName, settings)
    session.remember(roomCode, playerName)
  }

  // Handle multiplayer game join
  const handleJoinMultiplayer = (roomCode: string, playerName: string) => {
    multiplayer.joinGame(roomCode, playerName)
    session.remember(roomCode.toUpperCase(), playerName)
  }

  // Handle team selection
  const handleSelectTeam = (team: Team, role: PlayerRole) => {
    multiplayer.selectTeam(team, role)
  }

  // Watch for multiplayer connection and game state changes
  useEffect(() => {
    if (multiplayer.connectionStatus === 'connected' && multiplayer.gameState) {
      const status = multiplayer.gameState.status

      if (status === 'waiting') {
        setView('lobby')
      } else if (status === 'team-selection') {
        setView('team-selection')
      } else if (status === 'playing' || status === 'finished') {
        setView('game')
      }
    }
  }, [multiplayer.connectionStatus, multiplayer.gameState?.status])

  // Handle leaving multiplayer
  const handleLeaveMultiplayer = () => {
    session.forget()
    multiplayer.disconnect()
    setView('select')
  }

  // Handle back to mode selection
  const handleBackToSelect = () => {
    session.forget()
    multiplayer.disconnect()
    setView('select')
  }

  // Handle proceed from lobby to team selection
  const handleProceedToTeamSelection = () => {
    multiplayer.proceedToTeamSelection()
  }

  // Mode selection view
  if (session.isResuming && view === 'select') {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Rejoining your game…</p>
      </div>
    )
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
          <h1 className="text-lg font-bold">Codenames</h1>
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

  // Multiplayer lobby view
  if (view === 'lobby' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Codenames</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerLobby
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onProceedToTeamSelection={handleProceedToTeamSelection}
          onLeave={handleLeaveMultiplayer}
        />
      </div>
    )
  }

  // Team selection view
  if (view === 'team-selection' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Codenames</h1>
          <div className="w-[60px]" />
        </div>
        <TeamSelector
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          onSelectTeam={handleSelectTeam}
          onStartGame={multiplayer.startGame}
          onLeave={handleLeaveMultiplayer}
          error={multiplayer.error}
        />
      </div>
    )
  }

  // Multiplayer game view
  if (view === 'game' && multiplayer.gameState && multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <Button variant="ghost" size="sm" onClick={handleBackToSelect}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold">Codenames</h1>
          <div className="w-[60px]" />
        </div>
        <MultiplayerGame
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isSpymaster={multiplayer.isSpymaster}
          isHost={multiplayer.isHost}
          onGiveClue={multiplayer.giveClue}
          onGuess={multiplayer.guess}
          onEndGuessing={multiplayer.endGuessing}
          onRestart={multiplayer.restart}
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
