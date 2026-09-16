import { Copy, Check, Users, Crown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getInviteLink } from '@/lib/inviteLinks'
import type { PublicGameState } from '../../../../party/sudoku'

interface MultiplayerLobbyProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  connected: boolean
  error: string | null
  onStart: () => void
  onLeave: () => void
}

const DIFFICULTY_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
}

export function MultiplayerLobby({ gameState, playerId, isHost, connected, error, onStart, onLeave }: MultiplayerLobbyProps) {
  const [copied, setCopied] = useState(false)

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(getInviteLink(gameState.roomCode))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }

  const players = Object.values(gameState.players)
  const connectedPlayers = players.filter(player => player.connected !== false)
  const canStart = connectedPlayers.length >= 2 && isHost && connected

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Waiting for Players</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Room code */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Room Code</p>
            <button
              type="button"
              onClick={copyRoomCode}
              aria-label={copied ? 'Invite link copied' : 'Copy invite link'}
              className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <span className="text-2xl font-mono font-bold tracking-widest">
                {gameState.roomCode}
              </span>
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              Copy the invite link or share the room code
            </p>
          </div>

          {/* Difficulty */}
          <div className="text-center">
            <span className="text-sm text-muted-foreground">Difficulty: </span>
            <span className="font-medium">{DIFFICULTY_LABELS[gameState.difficulty]}</span>
          </div>

          {/* Players list */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Players ({connectedPlayers.length} connected, {players.length}/{gameState.maxPlayers})
              </span>
            </div>

            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    player.id === playerId ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium flex-1">
                    {player.name}
                    {player.id === playerId && ' (You)'}
                    {!player.connected && (
                      <span className="ml-2 text-xs text-muted-foreground italic">reconnecting…</span>
                    )}
                  </span>
                  {player.id === gameState.hostId && (
                    <Crown className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onLeave} className="flex-1">
              Leave
            </Button>
            {isHost ? (
              <Button onClick={onStart} disabled={!canStart} className="flex-1">
                {connectedPlayers.length < 2 ? 'Need 2 connected' : 'Start Race'}
              </Button>
            ) : (
              <div className="flex-1 text-center text-sm text-muted-foreground py-2">
                Waiting for host to start...
              </div>
            )}
          </div>
          {!connected && (
            <p className="text-center text-sm text-muted-foreground">Reconnecting before the race can start...</p>
          )}
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
