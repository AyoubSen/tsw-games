import { useState } from "react"
import { Copy, Check, Crown, Users, LogOut, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PublicGameState } from "../../../../party/codenames"

interface MultiplayerLobbyProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onProceedToTeamSelection: () => void
  onLeave: () => void
}

export function MultiplayerLobby({
  gameState,
  playerId,
  isHost,
  onProceedToTeamSelection,
  onLeave,
}: MultiplayerLobbyProps) {
  const [copied, setCopied] = useState(false)

  const players = Object.values(gameState.players)
  const canProceed = isHost && players.length >= 4

  const copyCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
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
              onClick={onProceedToTeamSelection}
              disabled={!canProceed}
              className="w-full"
              size="lg"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              {canProceed ? "Select Teams" : `Need ${4 - players.length} more player(s)`}
            </Button>
          ) : (
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground">
                Waiting for host to proceed...
              </p>
            </div>
          )}

          <Button variant="outline" onClick={onLeave} className="w-full">
            <LogOut className="w-4 h-4 mr-2" />
            Leave Game
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Need at least 4 players to start (2 per team)
        </p>
      </div>
    </div>
  )
}
