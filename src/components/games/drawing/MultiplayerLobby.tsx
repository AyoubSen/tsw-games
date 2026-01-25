import { useState } from "react"
import { Copy, Check, Users, Crown, Loader2, Play, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PublicGameState } from "../../../../party/drawing"

interface MultiplayerLobbyProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onStart: () => void
  onLeave: () => void
}

export function MultiplayerLobby({
  gameState,
  playerId,
  isHost,
  onStart,
  onLeave,
}: MultiplayerLobbyProps) {
  const [copied, setCopied] = useState(false)
  const players = Object.values(gameState.players)
  const playerCount = players.length

  const copyInviteCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canStart = isHost && playerCount >= 2

  return (
    <div className="flex flex-col items-center p-4 max-w-md mx-auto">
      <Card className="w-full">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Waiting for Players
          </CardTitle>
          <CardDescription className="text-sm">
            Share the invite code with your friends to join
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {/* Invite Code */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-xs text-muted-foreground">Invite Code</p>
            <div className="flex items-center gap-2">
              <code className="text-2xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                {gameState.roomCode}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={copyInviteCode}
                className="shrink-0 h-9 w-9"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Game Info */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="text-xs">
              {gameState.roundTimeLimit}s per round
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {playerCount} rounds
            </Badge>
          </div>

          {/* Players List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Players ({playerCount}/{gameState.maxPlayers})
              </p>
            </div>

            <div className="space-y-1.5">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border ${
                    player.id === playerId ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm">{player.name}</span>
                    {player.id === playerId && (
                      <Badge variant="outline" className="text-xs">You</Badge>
                    )}
                  </div>
                  {player.id === gameState.hostId && (
                    <Crown className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: Math.min(3, gameState.maxPlayers - playerCount) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center justify-center p-2.5 rounded-lg border border-dashed text-muted-foreground"
                >
                  <span className="text-xs">Waiting for player...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            {isHost ? (
              <>
                <Button
                  onClick={onStart}
                  disabled={!canStart}
                  className="w-full"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {canStart ? "Start Game" : `Need ${2 - playerCount} more player(s)`}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  You are the host. Start when everyone is ready!
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Waiting for host to start...</span>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={onLeave} className="w-full">
              Leave Game
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
