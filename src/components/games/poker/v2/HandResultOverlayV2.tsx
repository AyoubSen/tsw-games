import { Trophy, ArrowRight } from "lucide-react"
import type { WinnerInfo } from "../../../../../party/poker"

interface HandResultOverlayProps {
  winners: WinnerInfo[]
  isHost: boolean
  onNextHand: () => void
}

export function HandResultOverlay({ winners, isHost, onNextHand }: HandResultOverlayProps) {
  if (winners.length === 0) return null

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{
        background: "rgba(20,20,30,0.95)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <h3 className="text-center text-sm font-semibold flex items-center justify-center gap-2 text-amber-400">
        <Trophy className="w-4 h-4" />
        Hand Result
      </h3>

      <div className="space-y-1.5">
        {winners.map((w, i) => (
          <div
            key={`${w.playerId}-${i}`}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div>
              <span className="text-sm font-medium text-white">{w.playerName}</span>
              {w.handResult && (
                <span className="text-xs text-zinc-500 ml-2">{w.handResult.description}</span>
              )}
            </div>
            <span className="font-mono font-bold text-emerald-400">+{w.amount}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        {isHost ? (
          <button
            onClick={onNextHand}
            className="px-6 py-2 rounded-lg font-semibold text-sm text-white bg-amber-600 hover:bg-amber-500 transition-colors flex items-center gap-2"
          >
            Next Hand
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <p className="text-xs text-zinc-600">Waiting for host...</p>
        )}
      </div>
    </div>
  )
}
