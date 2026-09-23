import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGameNight } from '@/components/game-night/GameNightProvider'
import { useGameNightGameBridge } from '@/components/game-night/useGameNightGameBridge'
import { getGameNightInviteLink, parseInviteSearch } from '@/lib/inviteLinks'
import { useMultiplayerSession } from '@/lib/multiplayerSession'
import { GameModeSelector } from '@/components/games/codenames/GameModeSelector'
import { MultiplayerLobby } from '@/components/games/codenames/MultiplayerLobby'
import { TeamSelector } from '@/components/games/codenames/TeamSelector'
import { MultiplayerGame } from '@/components/games/codenames/MultiplayerGame'
import { DuetGame } from '@/components/games/codenames/DuetGame'
import { useMultiplayerCodenames, type GameSettings } from '@/components/games/codenames/useMultiplayerCodenames'
import type { Team, PlayerRole } from '../../../party/codenames'

export const Route = createFileRoute('/games/codenames')({
  validateSearch: parseInviteSearch,
  component: CodenamesPage,
})

type GameView = 'select' | 'lobby' | 'team-selection' | 'game'

function CodenamesPage() {
  const { room: invitedRoomCode, night } = Route.useSearch()
  const [view, setView] = useState<GameView>('select')

  const multiplayer = useMultiplayerCodenames()
  const gameNight = useGameNight()
  const gameNightConnection = gameNight.connection?.gameId === 'codenames' && gameNight.connection.roomCode === night
    ? gameNight.connection
    : null
  const hasGameState = Boolean(
    multiplayer.gameState &&
    multiplayer.playerId &&
    multiplayer.gameState.players[multiplayer.playerId]
  )
  const session = useMultiplayerSession({
    game: 'codenames',
    joinGame: multiplayer.joinGame,
    hasGameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
    disabled: Boolean(night),
  })
  const bridge = useGameNightGameBridge({
    gameId: 'codenames',
    hasGameState,
    finished: multiplayer.gameState?.status === 'finished',
    connectHost: (roomId, playerName) => {
      if (gameNightConnection) multiplayer.createGame(playerName, {
        gameMode: Object.keys(gameNight.state?.players ?? {}).length === 2 ? 'duet' : 'classic',
        clueTimeLimit: 0, guessTimeLimit: 0,
      }, roomId)
    },
    connectPlayer: (roomId, playerName) => {
      if (gameNightConnection) multiplayer.joinGame(roomId, playerName)
    },
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
    if (multiplayer.gameState?.settings.gameMode === 'duet') multiplayer.startGame()
    else multiplayer.proceedToTeamSelection()
  }

  // Mode selection view
  if ((session.isResuming || (night && (!gameNightConnection || bridge.isConnecting))) && view === 'select') {
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
    const lobbyState = gameNightConnection
      ? { ...multiplayer.gameState, roomCode: bridge.publicRoomCode }
      : multiplayer.gameState
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
          onProceedToTeamSelection={handleProceedToTeamSelection}
          onLeave={handleLeaveMultiplayer}
          connected={multiplayer.connectionStatus === 'connected'}
          error={multiplayer.error}
        />
        </div>
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
        {multiplayer.gameState.settings.gameMode === 'duet' ? <DuetGame
          gameState={multiplayer.gameState}
          playerId={multiplayer.playerId}
          isHost={multiplayer.isHost}
          connected={multiplayer.connectionStatus === 'connected'}
          error={multiplayer.error}
          onClue={(word, count) => multiplayer.sendDuet({ type: 'duet-clue', word, count })}
          onGuess={(cardIndex) => multiplayer.sendDuet({ type: 'duet-guess', cardIndex })}
          onPass={() => multiplayer.sendDuet({ type: 'duet-pass' })}
          onRestart={multiplayer.restart}
          onLeave={handleLeaveMultiplayer}
        /> : <MultiplayerGame
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
        />}
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
