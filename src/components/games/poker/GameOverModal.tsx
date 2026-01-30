import { Button } from "@/components/ui/button"
import { Trophy, RotateCcw, LogOut } from "lucide-react"
import type { PublicPlayer } from "../../../../party/poker"

interface GameOverModalProps {
  players: Record<string, PublicPlayer>
  isHost: boolean
  onRestart: () => void
  onLeave: () => void
}

export function GameOverModal({ players, isHost, onRestart, onLeave }: GameOverModalProps) {
  const sorted = Object.values(players).sort((a, b) => b.chips - a.chips)
  const winner = sorted[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border-2 bg-background p-6 shadow-2xl bg-gradient-to-br from-yellow-500/10 to-amber-600/5">
        <div className="flex flex-col items-center text-center">
          <Trophy className="w-16 h-16 mb-4 text-yellow-500" />

          <h2 className="text-3xl font-bold mb-2">
            {winner?.name} Wins!
          </h2>

          <p className="text-muted-foreground mb-4">
            with {winner?.chips.toLocaleString()} chips
          </p>

          {/* Leaderboard */}
          <div className="w-full space-y-1 mb-6">
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 text-muted-foreground font-mono">{i + 1}.</span>
                  <span className="font-medium">{p.name}</span>
                </div>
                <span className="font-mono">{p.chips.toLocaleString()}</span>
              </div>
            ))}
          </div>

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
