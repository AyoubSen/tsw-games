import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye, Users, Play, LogOut, Check } from "lucide-react"
import type { PublicGameState, Team, PlayerRole, Player } from "../../../../party/codenames"

interface TeamSelectorProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onSelectTeam: (team: Team, role: PlayerRole) => void
  onStartGame: () => void
  onLeave: () => void
  error: string | null
}

export function TeamSelector({
  gameState,
  playerId,
  isHost,
  onSelectTeam,
  onStartGame,
  onLeave,
  error,
}: TeamSelectorProps) {
  const players = Object.values(gameState.players)
  const currentPlayer = gameState.players[playerId]

  const getTeamPlayers = (team: Team) => players.filter((p) => p.team === team)
  const getSpymaster = (team: Team) =>
    players.find((p) => p.team === team && p.role === "spymaster")
  const getGuessers = (team: Team) =>
    players.filter((p) => p.team === team && p.role === "guesser")
  const getUnassigned = () => players.filter((p) => !p.team)

  const redTeam = getTeamPlayers("red")
  const blueTeam = getTeamPlayers("blue")
  const unassigned = getUnassigned()

  const redSpymaster = getSpymaster("red")
  const blueSpymaster = getSpymaster("blue")
  const redGuessers = getGuessers("red")
  const blueGuessers = getGuessers("blue")

  const isValidSetup =
    redSpymaster && blueSpymaster && redGuessers.length >= 1 && blueGuessers.length >= 1

  const TeamCard = ({ team }: { team: Team }) => {
    const isRed = team === "red"
    const spymaster = isRed ? redSpymaster : blueSpymaster
    const guessers = isRed ? redGuessers : blueGuessers
    const teamColor = isRed ? "red" : "blue"

    const bgColor = isRed ? "bg-red-500/10" : "bg-blue-500/10"
    const borderColor = isRed ? "border-red-500" : "border-blue-500"
    const textColor = isRed
      ? "text-red-600 dark:text-red-400"
      : "text-blue-600 dark:text-blue-400"

    const isOnThisTeam = currentPlayer?.team === team

    return (
      <Card className={cn("flex-1", bgColor, isOnThisTeam && "border-2", isOnThisTeam && borderColor)}>
        <CardHeader className="pb-2">
          <CardTitle className={cn("capitalize text-lg", textColor)}>{team} Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Spymaster Slot */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="w-4 h-4" />
              Spymaster
            </div>
            {spymaster ? (
              <div
                className={cn(
                  "p-2 rounded-lg flex items-center justify-between",
                  isRed ? "bg-red-500/20" : "bg-blue-500/20"
                )}
              >
                <span className="font-medium">
                  {spymaster.name}
                  {spymaster.id === playerId && (
                    <span className="text-xs text-muted-foreground ml-1">(You)</span>
                  )}
                </span>
                {spymaster.id === playerId && <Check className="w-4 h-4" />}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onSelectTeam(team, "spymaster")}
              >
                Join as Spymaster
              </Button>
            )}
          </div>

          {/* Guessers Slot */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="w-4 h-4" />
              Guessers ({guessers.length})
            </div>
            <div className="space-y-1">
              {guessers.map((guesser) => (
                <div
                  key={guesser.id}
                  className={cn(
                    "p-2 rounded-lg flex items-center justify-between text-sm",
                    isRed ? "bg-red-500/20" : "bg-blue-500/20"
                  )}
                >
                  <span>
                    {guesser.name}
                    {guesser.id === playerId && (
                      <span className="text-xs text-muted-foreground ml-1">(You)</span>
                    )}
                  </span>
                  {guesser.id === playerId && <Check className="w-4 h-4" />}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onSelectTeam(team, "guesser")}
              >
                Join as Guesser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col items-center p-4 max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-2">Select Your Team</h1>
        <p className="text-muted-foreground">
          Each team needs 1 Spymaster and at least 1 Guesser
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Starting team:{" "}
          <span
            className={cn(
              "font-semibold capitalize",
              gameState.startingTeam === "red"
                ? "text-red-600 dark:text-red-400"
                : "text-blue-600 dark:text-blue-400"
            )}
          >
            {gameState.startingTeam}
          </span>{" "}
          ({gameState.startingTeam === "red" ? 9 : 8} cards to find)
        </p>
      </div>

      {/* Unassigned Players */}
      {unassigned.length > 0 && (
        <div className="w-full mb-4">
          <div className="text-sm text-muted-foreground mb-2">
            Unassigned ({unassigned.length}):
          </div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((player) => (
              <span
                key={player.id}
                className={cn(
                  "px-2 py-1 rounded text-sm bg-muted",
                  player.id === playerId && "bg-primary/20 font-medium"
                )}
              >
                {player.name}
                {player.id === playerId && " (You)"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Team Cards */}
      <div className="flex flex-col sm:flex-row gap-4 w-full mb-6">
        <TeamCard team="red" />
        <TeamCard team="blue" />
      </div>

      {/* Validation Messages */}
      {!isValidSetup && (
        <div className="text-sm text-amber-600 dark:text-amber-400 mb-4">
          {!redSpymaster && "Red team needs a Spymaster. "}
          {!blueSpymaster && "Blue team needs a Spymaster. "}
          {redGuessers.length < 1 && "Red team needs at least 1 Guesser. "}
          {blueGuessers.length < 1 && "Blue team needs at least 1 Guesser. "}
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive mb-4">{error}</div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {isHost ? (
          <Button
            onClick={onStartGame}
            disabled={!isValidSetup}
            className="w-full"
            size="lg"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Game
          </Button>
        ) : (
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-muted-foreground">
              {isValidSetup
                ? "Waiting for host to start the game..."
                : "Waiting for all players to join teams..."}
            </p>
          </div>
        )}

        <Button variant="outline" onClick={onLeave} className="w-full">
          <LogOut className="w-4 h-4 mr-2" />
          Leave Game
        </Button>
      </div>
    </div>
  )
}
