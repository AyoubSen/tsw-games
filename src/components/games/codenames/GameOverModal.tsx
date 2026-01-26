import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Trophy, Skull, RotateCcw, LogOut, Clock, XCircle } from "lucide-react"
import type { Team, WinReason } from "../../../../party/codenames"

interface GameOverModalProps {
  winner: Team
  winReason: WinReason | null
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

  const loser = winner === "red" ? "Blue" : "Red"

  const getMessage = () => {
    switch (winReason) {
      case "assassin":
        return `${loser} team found the Assassin!`
      case "wrong-guess":
        return `${loser} team made a wrong guess in Hardcore mode!`
      case "timeout":
        return `${loser} team ran out of time!`
      default:
        return `${winner === "red" ? "Red" : "Blue"} team found all their agents!`
    }
  }

  const getIcon = () => {
    switch (winReason) {
      case "assassin":
        return <Skull className="w-16 h-16 mb-4 text-zinc-900 dark:text-zinc-100" />
      case "wrong-guess":
        return <XCircle className="w-16 h-16 mb-4 text-destructive" />
      case "timeout":
        return <Clock className="w-16 h-16 mb-4 text-amber-500" />
      default:
        return <Trophy className={cn("w-16 h-16 mb-4", winnerColor)} />
    }
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
          {getIcon()}

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
