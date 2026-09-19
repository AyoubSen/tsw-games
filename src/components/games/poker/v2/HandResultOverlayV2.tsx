import { ArrowRight } from "lucide-react"
import type { WinnerInfo } from "../../../../../party/poker"

interface HandResultOverlayProps {
  winners: WinnerInfo[]
  isHost: boolean
  onNextHand: () => void
}

export function HandResultOverlay({
  winners,
  isHost,
  onNextHand,
}: HandResultOverlayProps) {
  if (winners.length === 0) return null

  return (
    <div className="space-y-2.5 rounded-xl bg-amber-400/[0.07] p-3 ring-1 ring-amber-400/25">
      <div className="space-y-1.5">
        {winners.map((w, i) => (
          <div
            key={`${w.playerId}-${i}`}
            className="flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <span className="text-sm font-semibold text-white">
                {w.playerName}
              </span>
              {w.handResult && (
                <span className="ml-2 text-xs text-white/40">
                  {w.handResult.description}
                </span>
              )}
            </div>
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-amber-300">
              +{w.amount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {isHost ? (
        <button
          type="button"
          onClick={onNextHand}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-300"
        >
          Next hand
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <p className="py-1 text-center text-xs text-white/35">
          Waiting for host to deal...
        </p>
      )}
    </div>
  )
}
