import { useState } from "react"
import { Copy, Check, Crown, Users, LogOut, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getInviteLink } from "@/lib/inviteLinks"
import type { PublicGameState } from "../../../../party/codenames"

interface MultiplayerLobbyProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onProceedToTeamSelection: () => void
  onLeave: () => void
  connected?: boolean
  error?: string | null
}

export function MultiplayerLobby({
  gameState,
  playerId,
  isHost,
  onProceedToTeamSelection,
  onLeave,
  connected = true,
  error,
}: MultiplayerLobbyProps) {
  const [copied, setCopied] = useState(false)

  const players = Object.values(gameState.players)
  const connectedPlayers = players.filter((player) => player.connected !== false)
  const isDuet = gameState.settings.gameMode === "duet"
  const minimumPlayers = isDuet ? 2 : 4
  const canProceed = connected && isHost && connectedPlayers.length >= minimumPlayers

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(getInviteLink(gameState.roomCode))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy invite link:", error)
    }
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
              <Button
                variant="ghost"
                size="icon"
                onClick={copyCode}
                aria-label={copied ? "Invite link copied" : "Copy invite link"}
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Copy the invite link or share the room code
            </p>
          </CardContent>
        </Card>

        {/* Players */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Players ({players.length}/{isDuet ? 2 : 8})
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
                    {player.connected === false && (
                      <span className="text-xs text-muted-foreground">reconnecting...</span>
                    )}
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
              {Array.from({ length: Math.max(0, minimumPlayers - connectedPlayers.length) }).map((_, i) => (
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
        {isDuet && <div className="rounded-xl border bg-primary/5 p-4 text-sm">
          <p className="font-semibold">Duet · One shared mission</p>
          <p className="mt-2 text-muted-foreground">15 agents · 9 turns · no countdown. Both players give clues and guess. Your keys are different—keep them private.</p>
        </div>}
        {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        <div className="space-y-2">
          {isHost ? (
            <Button
              onClick={onProceedToTeamSelection}
              disabled={!canProceed}
              className="w-full"
              size="lg"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              {!connected ? "Reconnecting…" : canProceed ? isDuet ? "Start Duet" : "Select Teams" : `Need ${minimumPlayers - connectedPlayers.length} more player(s)`}
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
          {isDuet ? "Exactly 2 players. The first clue giver is chosen at random." : "Need at least 4 players to start (2 per team)"}
        </p>
      </div>
    </div>
  )
}
