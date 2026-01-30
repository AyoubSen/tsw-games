import { Button } from "@/components/ui/button"
import { Trophy, ArrowRight } from "lucide-react"
import type { WinnerInfo } from "../../../../party/poker"

interface HandResultOverlayProps {
  winners: WinnerInfo[]
  isHost: boolean
  onNextHand: () => void
}

export function HandResultOverlay({ winners, isHost, onNextHand }: HandResultOverlayProps) {
  if (winners.length === 0) return null

  return (
    <div className="bg-muted/80 backdrop-blur-sm rounded-xl p-4 space-y-3">
      <h3 className="text-center font-bold flex items-center justify-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" />
        Hand Result
      </h3>

      <div className="space-y-2">
        {winners.map((w, i) => (
          <div
            key={`${w.playerId}-${i}`}
            className="flex items-center justify-between p-2 rounded-lg bg-background/80"
          >
            <div>
              <span className="font-medium">{w.playerName}</span>
              {w.handResult && (
                <span className="text-xs text-muted-foreground ml-2">
                  {w.handResult.description}
                </span>
              )}
            </div>
            <span className="font-mono font-bold text-green-600 dark:text-green-400">
              +{w.amount}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        {isHost ? (
          <Button onClick={onNextHand} className="w-full max-w-[200px]">
            <ArrowRight className="w-4 h-4 mr-2" />
            Next Hand
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for host to deal next hand...</p>
        )}
      </div>
    </div>
  )
}
