import { Trophy, RotateCcw, LogOut } from "lucide-react"
import type { PublicPlayer } from "../../../../../party/poker"

interface GameOverModalProps {
  players: Record<string, PublicPlayer>
  isHost: boolean
  onRestart: () => void
  onLeave: () => void
}

const MEDAL_COLORS = [
  { bg: "from-yellow-400 to-yellow-600", border: "border-yellow-400", text: "text-yellow-400", label: "1st" },
  { bg: "from-zinc-300 to-zinc-400", border: "border-zinc-300", text: "text-zinc-300", label: "2nd" },
  { bg: "from-amber-600 to-amber-800", border: "border-amber-600", text: "text-amber-600", label: "3rd" },
]

const PODIUM_HEIGHTS = ["h-24", "h-16", "h-12"]

export function GameOverModal({ players, isHost, onRestart, onLeave }: GameOverModalProps) {
  const sorted = Object.values(players).sort((a, b) => b.chips - a.chips)
  const winner = sorted[0]
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  // Reorder for podium: [2nd, 1st, 3rd]
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : [top3[0]]
  const podiumMedalOrder = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Animated radial gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 40%, rgba(234,179,8,0.15), rgba(0,0,0,0.85) 70%)",
          animation: "bgPulse 3s ease-in-out infinite",
        }}
      />

      <div
        className="relative mx-4 w-full max-w-md rounded-2xl p-6 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #1a1a2e, #16213e)",
          border: "2px solid transparent",
          backgroundClip: "padding-box",
          boxShadow: "0 0 0 2px rgba(234,179,8,0.4), 0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        {/* Gold gradient border effect */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            border: "2px solid transparent",
            background: "linear-gradient(135deg, rgba(234,179,8,0.3), rgba(217,119,6,0.1), rgba(234,179,8,0.3)) border-box",
            mask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
            WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
          }}
        />

        <div className="flex flex-col items-center text-center relative z-10">
          {/* Bouncing trophy */}
          <div style={{ animation: "trophyBounce 1s ease-out" }}>
            <Trophy className="w-14 h-14 mb-3 text-yellow-400 drop-shadow-lg" />
          </div>

          {/* Winner name */}
          <h2
            className="text-3xl font-extrabold mb-1"
            style={{
              background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {winner?.name} Wins!
          </h2>

          <p className="text-zinc-400 mb-5 text-sm">
            with {winner?.chips.toLocaleString()} chips
          </p>

          {/* Podium */}
          <div className="flex items-end justify-center gap-3 mb-4 w-full">
            {podiumOrder.map((p, visualIdx) => {
              const medalIdx = podiumMedalOrder[visualIdx]
              const medal = MEDAL_COLORS[medalIdx]
              const height = PODIUM_HEIGHTS[medalIdx]
              return (
                <div key={p.id} className="flex flex-col items-center gap-1 flex-1">
                  {/* Medal badge */}
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${medal.bg} flex items-center justify-center text-[10px] font-bold text-zinc-900 shadow-md`}>
                    {medal.label}
                  </div>
                  <span className="text-xs font-medium text-white truncate max-w-[80px]">{p.name}</span>
                  <span className="text-[10px] font-mono text-zinc-400">{p.chips.toLocaleString()}</span>
                  {/* Podium block */}
                  <div className={`w-full ${height} rounded-t-lg bg-gradient-to-b from-zinc-700 to-zinc-800 border-t-2 ${medal.border}`} />
                </div>
              )
            })}
          </div>

          {/* Remaining players */}
          {rest.length > 0 && (
            <div className="w-full space-y-1 mb-5">
              {rest.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-zinc-500 font-mono text-xs">{i + 4}.</span>
                    <span className="text-zinc-300">{p.name}</span>
                  </div>
                  <span className="font-mono text-xs text-zinc-500">{p.chips.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 w-full">
            {isHost ? (
              <button
                onClick={onRestart}
                className="w-full py-3 rounded-lg font-bold text-white bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
            ) : (
              <div className="text-center p-3 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-sm text-zinc-500">Waiting for host to restart...</p>
              </div>
            )}

            <button
              onClick={onLeave}
              className="w-full py-2.5 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Leave Game
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes trophyBounce {
          0% { transform: translateY(-40px) scale(0.5); opacity: 0; }
          50% { transform: translateY(8px) scale(1.1); opacity: 1; }
          70% { transform: translateY(-4px) scale(0.95); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes bgPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}
