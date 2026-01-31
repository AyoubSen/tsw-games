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
      className="rounded-xl p-4 space-y-3 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(20,20,30,0.92), rgba(30,25,20,0.95))",
        border: "1px solid rgba(234, 179, 8, 0.3)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(234,179,8,0.1)",
      }}
    >
      {/* Decorative corner suits */}
      <span className="absolute top-2 left-3 text-yellow-600/20 text-lg">{"\u2660"}</span>
      <span className="absolute top-2 right-3 text-yellow-600/20 text-lg">{"\u2665"}</span>
      <span className="absolute bottom-2 left-3 text-yellow-600/20 text-lg">{"\u2666"}</span>
      <span className="absolute bottom-2 right-3 text-yellow-600/20 text-lg">{"\u2663"}</span>

      {/* Animated decorative dots */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: ["#fbbf24", "#f59e0b", "#eab308", "#d97706"][i % 4],
              left: `${8 + (i * 7.5)}%`,
              top: `-4px`,
              animation: `confettiDot ${1.5 + (i * 0.15)}s ease-in ${i * 0.1}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      <h3 className="text-center font-bold flex items-center justify-center gap-2 text-yellow-400 relative z-10">
        <Trophy className="w-5 h-5" />
        Hand Result
      </h3>

      <div className="space-y-2 relative z-10">
        {winners.map((w, i) => (
          <div
            key={`${w.playerId}-${i}`}
            className="flex items-center justify-between p-3 rounded-lg relative overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.05)",
              borderLeft: "3px solid rgba(234, 179, 8, 0.6)",
            }}
          >
            {/* Shimmer effect on winner row */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(234,179,8,0.05), transparent)",
                animation: "shimmer 2s ease-in-out infinite",
              }}
            />
            <div className="relative z-10">
              <span className="font-medium text-white">{w.playerName}</span>
              {w.handResult && (
                <span className="text-xs text-zinc-400 ml-2">
                  {w.handResult.description}
                </span>
              )}
            </div>
            <span className="font-mono font-bold text-lg text-green-400 relative z-10">
              +{w.amount}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-center relative z-10">
        {isHost ? (
          <button
            onClick={onNextHand}
            className="w-full max-w-[220px] py-2.5 rounded-lg font-bold text-sm text-white transition-all shadow-lg bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Next Hand
          </button>
        ) : (
          <p className="text-sm text-zinc-500">Waiting for host to deal next hand...</p>
        )}
      </div>

      <style>{`
        @keyframes confettiDot {
          0% { opacity: 0; transform: translateY(0) rotate(0deg); }
          10% { opacity: 1; }
          100% { opacity: 0; transform: translateY(200px) rotate(720deg); }
        }
        @keyframes shimmer {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
