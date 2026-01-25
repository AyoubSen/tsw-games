import { Pencil, Check, Trophy } from "lucide-react"
import type { Player } from "../../../../party/drawing"

interface ScoreBoardProps {
  players: Record<string, Player>
  currentDrawerId: string | null
  playerId: string
  correctGuessers: string[]
  showRanking?: boolean
}

export function ScoreBoard({
  players,
  currentDrawerId,
  playerId,
  correctGuessers,
  showRanking = false,
}: ScoreBoardProps) {
  const playerList = Object.values(players)

  // Sort by score (descending) for ranking display
  const sortedPlayers = showRanking
    ? [...playerList].sort((a, b) => b.score - a.score)
    : playerList

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {sortedPlayers.map((player, index) => {
        const isDrawer = player.id === currentDrawerId
        const isYou = player.id === playerId
        const hasGuessedCorrectly = correctGuessers.includes(player.id)
        const isWinner = showRanking && index === 0 && player.score > 0

        return (
          <div
            key={player.id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              isDrawer
                ? "bg-primary text-primary-foreground"
                : hasGuessedCorrectly
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : isYou
                ? "bg-primary/10 border border-primary/20"
                : "bg-muted"
            }`}
          >
            {/* Ranking position */}
            {showRanking && (
              <span className="font-bold text-xs opacity-60">
                #{index + 1}
              </span>
            )}

            {/* Winner trophy */}
            {isWinner && (
              <Trophy className="w-4 h-4 text-yellow-500" />
            )}

            {/* Player avatar */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
              isDrawer
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/10"
            }`}>
              {player.name.charAt(0).toUpperCase()}
            </div>

            {/* Player name */}
            <span className="font-medium">
              {player.name}
              {isYou && <span className="opacity-60"> (you)</span>}
            </span>

            {/* Icons */}
            {isDrawer && (
              <Pencil className="w-3 h-3" />
            )}
            {hasGuessedCorrectly && !isDrawer && (
              <Check className="w-3 h-3" />
            )}

            {/* Score */}
            <span className={`font-bold ${isDrawer ? "text-primary-foreground" : "text-primary"}`}>
              {player.score}
            </span>
          </div>
        )
      })}
    </div>
  )
}
