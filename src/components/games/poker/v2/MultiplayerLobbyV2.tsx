import { useState } from "react"
import { Copy, Check, Crown, Users, LogOut, Play, Coins, Clock, TrendingUp } from "lucide-react"
import type { PublicGameState } from "../../../../../party/poker"

interface MultiplayerLobbyProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onStartGame: () => void
  onLeave: () => void
}

// 8 avatar colors matching PlayerSeatV2
const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-pink-500",
  "bg-indigo-500",
]

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

export function MultiplayerLobby({
  gameState,
  playerId,
  isHost,
  onStartGame,
  onLeave,
}: MultiplayerLobbyProps) {
  const [copied, setCopied] = useState(false)

  const players = Object.values(gameState.players)
  const canStart = isHost && players.length >= 2

  const copyCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const { settings } = gameState

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
      <div className="w-full max-w-md space-y-5">
        {/* Room Code - letter tile style */}
        <div
          className="rounded-xl p-5 text-center"
          style={{
            background: "linear-gradient(180deg, rgba(25,25,40,0.95), rgba(20,20,35,0.98))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Room Code</h3>
          <div className="flex items-center justify-center gap-2">
            <div className="flex gap-1.5">
              {gameState.roomCode.split("").map((char, i) => (
                <div
                  key={i}
                  className="w-11 h-13 rounded-lg flex items-center justify-center text-2xl font-mono font-bold text-white"
                  style={{
                    background: "linear-gradient(180deg, rgba(5,150,105,0.2), rgba(4,120,87,0.3))",
                    border: "1px solid rgba(5,150,105,0.3)",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    animation: `tileAppear 0.3s ease-out ${i * 0.05}s both`,
                  }}
                >
                  {char}
                </div>
              ))}
            </div>
            <button
              onClick={copyCode}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-sm text-zinc-600 mt-2">Share this code with friends to join</p>
        </div>

        {/* Settings - table card style */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(180deg, rgba(25,25,40,0.95), rgba(20,20,35,0.98))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Table Settings</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-zinc-300">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span>{settings.startingChips.toLocaleString()} chips</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span>{settings.smallBlind}/{settings.smallBlind * 2} blinds</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>{settings.blindIncrease > 0 ? `Every ${settings.blindIncrease} hands` : "No increase"}</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>{settings.turnTimeLimit > 0 ? `${settings.turnTimeLimit}s timer` : "No timer"}</span>
            </div>
          </div>
        </div>

        {/* Players - poker chip styled */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(180deg, rgba(25,25,40,0.95), rgba(20,20,35,0.98))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Players ({players.length}/8)
          </h3>
          <div className="space-y-2">
            {players.map((player, idx) => (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{
                  background: player.id === playerId
                    ? "rgba(5,150,105,0.1)"
                    : "rgba(255,255,255,0.03)",
                  border: player.id === playerId
                    ? "1px solid rgba(5,150,105,0.2)"
                    : "1px solid transparent",
                  animation: `playerSlideIn 0.4s ease-out ${idx * 0.08}s both`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  {/* Poker chip avatar */}
                  <div className={`w-9 h-9 rounded-full ${getAvatarColor(player.name)} flex items-center justify-center text-sm font-bold text-white shadow-md relative`}>
                    <div className="absolute inset-[3px] rounded-full border border-dashed border-white/30" />
                    <span className="relative z-10">{player.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="font-medium text-white">{player.name}</span>
                  {player.id === playerId && (
                    <span className="text-xs text-zinc-500">(You)</span>
                  )}
                </div>
                {player.id === gameState.hostId && (
                  <Crown className="w-4 h-4 text-yellow-400" />
                )}
              </div>
            ))}

            {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center p-3 rounded-lg border-2 border-dashed border-zinc-800"
              >
                <div className="w-9 h-9 rounded-full bg-zinc-800/50 border-2 border-dashed border-zinc-700 mr-2.5" />
                <span className="text-zinc-600 text-sm">Waiting for player...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`w-full py-3 rounded-lg font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                canStart
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }`}
            >
              <Play className="w-4 h-4" />
              {canStart ? "Start Game" : `Need ${2 - players.length} more player(s)`}
            </button>
          ) : (
            <div className="text-center p-4 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-zinc-500">Waiting for host to start the game...</p>
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

        <p className="text-xs text-zinc-600 text-center">
          Need at least 2 players to start
        </p>
      </div>

      <style>{`
        @keyframes tileAppear {
          from { opacity: 0; transform: translateY(-8px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes playerSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
