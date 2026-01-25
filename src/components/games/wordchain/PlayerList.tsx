import { Crown, Timer, XCircle, Trophy, Heart } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Player } from "../../../../party/wordchain"

interface PlayerListProps {
  players: Record<string, Player>
  playerOrder: string[]
  currentPlayerId: string | null
  localPlayerId: string
  hostId: string
  winnerId?: string | null
  showReason?: boolean
  maxHearts?: number
}

export function PlayerList({
  players,
  playerOrder,
  currentPlayerId,
  localPlayerId,
  hostId,
  winnerId,
  showReason = true,
  maxHearts,
}: PlayerListProps) {
  // Order by playerOrder
  const orderedPlayers = playerOrder
    .map(id => players[id])
    .filter(Boolean)

  const getEliminationReason = (reason?: string) => {
    switch (reason) {
      case "timeout":
        return "Ran out of time"
      case "invalid":
        return "Invalid word"
      case "repeated":
        return "Word already used"
      case "wrong-letter":
        return "Wrong starting letter"
      default:
        return "Eliminated"
    }
  }

  // Render hearts
  const renderHearts = (hearts: number, max: number) => {
    if (max <= 1) return null // Don't show hearts in hardcore mode

    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <Heart
            key={i}
            className={cn(
              "w-3 h-3",
              i < hearts
                ? "text-red-500 fill-red-500"
                : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {orderedPlayers.map((player) => {
        const isCurrentTurn = player.id === currentPlayerId
        const isLocal = player.id === localPlayerId
        const isHost = player.id === hostId
        const isWinner = player.id === winnerId

        return (
          <div
            key={player.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
              player.eliminated && "opacity-50 bg-muted/50",
              isCurrentTurn && !player.eliminated && "border-primary bg-primary/10 ring-2 ring-primary/30",
              isWinner && "border-yellow-500 bg-yellow-500/10",
              !isCurrentTurn && !player.eliminated && !isWinner && "border-border bg-background"
            )}
          >
            {/* Status indicator */}
            <div className={cn(
              "w-2 h-2 rounded-full",
              player.eliminated ? "bg-destructive" : "bg-green-500",
              isCurrentTurn && !player.eliminated && "animate-pulse"
            )} />

            {/* Player name */}
            <span className={cn(
              "font-medium",
              player.eliminated && "line-through text-muted-foreground"
            )}>
              {player.name}
            </span>

            {/* Badges */}
            {isLocal && (
              <span className="text-xs text-muted-foreground">(You)</span>
            )}
            {isHost && (
              <Crown className="w-3 h-3 text-yellow-500" />
            )}
            {isWinner && (
              <Trophy className="w-4 h-4 text-yellow-500" />
            )}
            {isCurrentTurn && !player.eliminated && (
              <Timer className="w-4 h-4 text-primary animate-pulse" />
            )}

            {/* Hearts */}
            {!player.eliminated && maxHearts && maxHearts > 1 && (
              renderHearts(player.hearts, maxHearts)
            )}

            {player.eliminated && (
              <XCircle className="w-4 h-4 text-destructive" />
            )}

            {/* Elimination reason */}
            {player.eliminated && showReason && player.eliminatedReason && (
              <span className="text-xs text-muted-foreground">
                ({getEliminationReason(player.eliminatedReason)}
                {player.eliminatedWord && `: "${player.eliminatedWord}"`})
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
