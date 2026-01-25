import { cn } from "@/lib/utils"
import { Eye, Users } from "lucide-react"
import type { Player, Team } from "../../../../party/codenames"

interface TeamPanelProps {
  team: Team
  players: Player[]
  cardsRemaining: number
  isCurrentTurn: boolean
  playerId: string
}

export function TeamPanel({
  team,
  players,
  cardsRemaining,
  isCurrentTurn,
  playerId,
}: TeamPanelProps) {
  const spymaster = players.find((p) => p.role === "spymaster")
  const guessers = players.filter((p) => p.role === "guesser")

  const teamColors = {
    red: {
      bg: "bg-red-500/10",
      border: "border-red-500",
      text: "text-red-600 dark:text-red-400",
      badge: "bg-red-500 text-white",
    },
    blue: {
      bg: "bg-blue-500/10",
      border: "border-blue-500",
      text: "text-blue-600 dark:text-blue-400",
      badge: "bg-blue-500 text-white",
    },
  }

  const colors = teamColors[team]

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-3 transition-all",
        colors.bg,
        isCurrentTurn ? colors.border : "border-transparent"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={cn("font-bold text-lg capitalize", colors.text)}>
          {team}
        </span>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-sm font-bold",
            colors.badge
          )}
        >
          {cardsRemaining}
        </span>
      </div>

      <div className="space-y-2">
        {/* Spymaster */}
        <div className="flex items-center gap-2 text-sm">
          <Eye className="w-4 h-4 opacity-60" />
          <span className={spymaster ? "font-medium" : "text-muted-foreground italic"}>
            {spymaster ? (
              <>
                {spymaster.name}
                {spymaster.id === playerId && (
                  <span className="text-xs text-muted-foreground ml-1">(You)</span>
                )}
              </>
            ) : (
              "No Spymaster"
            )}
          </span>
        </div>

        {/* Guessers */}
        <div className="flex items-start gap-2 text-sm">
          <Users className="w-4 h-4 opacity-60 mt-0.5" />
          <div className="flex-1">
            {guessers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {guessers.map((guesser) => (
                  <span
                    key={guesser.id}
                    className={cn(
                      "inline-block px-1.5 py-0.5 rounded text-xs",
                      guesser.id === playerId
                        ? "bg-primary/20 font-medium"
                        : "bg-muted"
                    )}
                  >
                    {guesser.name}
                    {guesser.id === playerId && " (You)"}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground italic">No Guessers</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
