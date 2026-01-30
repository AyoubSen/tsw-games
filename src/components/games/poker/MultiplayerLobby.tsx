import { useState } from "react"
import { Copy, Check, Crown, Users, LogOut, Play, Coins, Clock, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PublicGameState } from "../../../../party/poker"

interface MultiplayerLobbyProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onStartGame: () => void
  onLeave: () => void
}

export function MultiplayerLobby({
  gameState,
  playerId,
  isHost,
  onStartGame,
  onLeave,
}: MultiplayerLobbyProps) {
  const [copied, setCopied] = useState(false)

  const players = Object.values(gameState.players)
  const canStart = isHost && players.length >= 2

  const copyCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { settings } = gameState

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Room Code */}
        <Card>
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg">Room Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <code className="text-4xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                {gameState.roomCode}
              </code>
              <Button variant="ghost" size="icon" onClick={copyCode}>
                {copied ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Share this code with friends to join
            </p>
          </CardContent>
        </Card>

        {/* Settings Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Table Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-muted-foreground" />
                <span>{settings.startingChips.toLocaleString()} chips</span>
              </div>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-muted-foreground" />
                <span>{settings.smallBlind}/{settings.smallBlind * 2} blinds</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span>{settings.blindIncrease > 0 ? `Every ${settings.blindIncrease} hands` : "No increase"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{settings.turnTimeLimit > 0 ? `${settings.turnTimeLimit}s timer` : "No timer"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Players */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Players ({players.length}/8)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    player.id === playerId
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{player.name}</span>
                    {player.id === playerId && (
                      <span className="text-xs text-muted-foreground">(You)</span>
                    )}
                  </div>
                  {player.id === gameState.hostId && (
                    <Crown className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
              ))}

              {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center p-3 rounded-lg border-2 border-dashed border-muted"
                >
                  <span className="text-muted-foreground text-sm">
                    Waiting for player...
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-2">
          {isHost ? (
            <Button
              onClick={onStartGame}
              disabled={!canStart}
              className="w-full"
              size="lg"
            >
              <Play className="w-4 h-4 mr-2" />
              {canStart ? "Start Game" : `Need ${2 - players.length} more player(s)`}
            </Button>
          ) : (
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground">
                Waiting for host to start the game...
              </p>
            </div>
          )}

          <Button variant="outline" onClick={onLeave} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Leave Game
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Need at least 2 players to start
        </p>
      </div>
    </div>
  )
}
