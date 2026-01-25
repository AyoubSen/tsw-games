import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Trophy, Skull, RotateCcw, LogOut } from "lucide-react"
import type { Team } from "../../../../party/codenames"

interface GameOverModalProps {
  winner: Team
  winReason: "cards" | "assassin" | null
  isHost: boolean
  onRestart: () => void
  onLeave: () => void
}

export function GameOverModal({
  winner,
  winReason,
  isHost,
  onRestart,
  onLeave,
}: GameOverModalProps) {
  const winnerColor =
    winner === "red"
      ? "text-red-600 dark:text-red-400"
      : "text-blue-600 dark:text-blue-400"

  const bgColor =
    winner === "red"
      ? "bg-gradient-to-br from-red-500/20 to-red-600/10"
      : "bg-gradient-to-br from-blue-500/20 to-blue-600/10"

  const getMessage = () => {
    if (winReason === "assassin") {
      const loser = winner === "red" ? "Blue" : "Red"
      return `${loser} team found the Assassin!`
    }
    return `${winner === "red" ? "Red" : "Blue"} team found all their agents!`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={cn(
          "mx-4 w-full max-w-md rounded-xl border-2 bg-background p-6 shadow-2xl",
          bgColor
        )}
      >
        <div className="flex flex-col items-center text-center">
          {winReason === "assassin" ? (
            <Skull className="w-16 h-16 mb-4 text-zinc-900 dark:text-zinc-100" />
          ) : (
            <Trophy className={cn("w-16 h-16 mb-4", winnerColor)} />
          )}

          <h2 className="text-3xl font-bold mb-2">
            <span className={winnerColor}>
              {winner === "red" ? "Red" : "Blue"} Team Wins!
            </span>
          </h2>

          <p className="text-muted-foreground mb-6">{getMessage()}</p>

          <div className="flex flex-col gap-2 w-full">
            {isHost ? (
              <Button onClick={onRestart} size="lg" className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Play Again
              </Button>
            ) : (
              <div className="text-center p-3 bg-muted/50 rounded-lg mb-2">
                <p className="text-sm text-muted-foreground">
                  Waiting for host to restart...
                </p>
              </div>
            )}

            <Button variant="outline" onClick={onLeave} className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Leave Game
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
