import { useState } from "react"
import { Copy, Check, Users, Crown, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PublicGameState } from "../../../../party/wordle"

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
    <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle>Waiting for Players</CardTitle>
          <CardDescription>
            Share the invite code with your friends to join
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invite Code */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Invite Code</p>
            <div className="flex items-center gap-2">
              <code className="text-3xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                {gameState.roomCode}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={copyInviteCode}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Players List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Players ({playerCount}/{gameState.maxPlayers})
              </p>
              <Badge variant="secondary">{gameState.mode}</Badge>
            </div>

            <div className="space-y-2">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    player.id === playerId ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{player.name}</span>
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
              {Array.from({ length: Math.min(4, gameState.maxPlayers - playerCount) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center justify-center p-3 rounded-lg border border-dashed text-muted-foreground"
                >
                  <span className="text-sm">Waiting for player...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {isHost ? (
              <>
                <Button
                  onClick={onStart}
                  disabled={!canStart}
                  className="w-full"
                  size="lg"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {canStart ? "Start Game" : `Need ${2 - playerCount} more player(s)`}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  You are the host. Start when everyone is ready!
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting for host to start...</span>
              </div>
            )}

            <Button variant="ghost" onClick={onLeave} className="w-full">
              Leave Game
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface JoinCreateFormProps {
  onCreateGame: (playerName: string) => void
  onJoinGame: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
}

export function JoinCreateForm({
  onCreateGame,
  onJoinGame,
  isConnecting,
  error,
}: JoinCreateFormProps) {
  const [mode, setMode] = useState<"create" | "join">("create")
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerName.trim()) return

    if (mode === "create") {
      onCreateGame(playerName.trim())
    } else {
      if (!roomCode.trim()) return
      onJoinGame(roomCode.trim(), playerName.trim())
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle>Multiplayer Wordle</CardTitle>
          <CardDescription>
            Race against your friends to guess the word first!
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mode Tabs */}
          <div className="flex gap-2 mb-6">
            <Button
              variant={mode === "create" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("create")}
            >
              Create Game
            </Button>
            <Button
              variant={mode === "join" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setMode("join")}
            >
              Join Game
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="playerName" className="text-sm font-medium">
                Your Name
              </label>
              <Input
                id="playerName"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                disabled={isConnecting}
              />
            </div>

            {mode === "join" && (
              <div className="space-y-2">
                <label htmlFor="roomCode" className="text-sm font-medium">
                  Invite Code
                </label>
                <Input
                  id="roomCode"
                  placeholder="Enter 6-character code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="font-mono text-center text-lg tracking-widest uppercase"
                  disabled={isConnecting}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isConnecting || !playerName.trim() || (mode === "join" && roomCode.length < 6)}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : mode === "create" ? (
                "Create Game"
              ) : (
                "Join Game"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
