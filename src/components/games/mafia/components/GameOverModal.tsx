import { Trophy, Moon, Users, Heart, Laugh } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PublicGameState, MafiaRole } from "../../../../../party/mafia"

interface GameOverModalProps {
  gameState: PublicGameState
  onLeave: () => void
}

const WIN_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  villagers: { label: "Village Wins!", icon: <Users className="w-8 h-8" />, color: "text-green-400" },
  werewolves: { label: "Werewolves Win!", icon: <Moon className="w-8 h-8" />, color: "text-red-400" },
  lovers: { label: "Lovers Win!", icon: <Heart className="w-8 h-8" />, color: "text-pink-400" },
  jester: { label: "Jester Wins!", icon: <Laugh className="w-8 h-8" />, color: "text-yellow-400" },
}

const ROLE_COLORS: Record<MafiaRole, string> = {
  werewolf: "text-red-400",
  villager: "text-green-400",
  seer: "text-cyan-400",
  doctor: "text-emerald-400",
  hunter: "text-orange-400",
  witch: "text-purple-400",
  cupid: "text-pink-400",
  jester: "text-yellow-400",
}

export function GameOverModal({ gameState, onLeave }: GameOverModalProps) {
  const config = WIN_CONFIG[gameState.winner || "villagers"]
  const isWinner = gameState.winningPlayerIds.includes(gameState.myId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full space-y-6 max-h-[80vh] overflow-y-auto">
        <div className="text-center space-y-3">
          <div className={`flex justify-center ${config.color}`}>
            {config.icon}
          </div>
          <h2 className={`text-2xl font-bold ${config.color}`}>{config.label}</h2>
          {isWinner && (
            <div className="flex items-center justify-center gap-2 text-yellow-400">
              <Trophy className="w-5 h-5" />
              <span className="font-medium">You won!</span>
            </div>
          )}
          {!isWinner && (
            <p className="text-zinc-500">Better luck next time.</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-400 uppercase">All Roles</h3>
          <div className="space-y-1">
            {gameState.playerOrder.map((id) => {
              const player = gameState.players[id]
              if (!player) return null
              const isWinnerPlayer = gameState.winningPlayerIds.includes(id)
              return (
                <div
                  key={id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    isWinnerPlayer ? "bg-zinc-800/80" : "bg-zinc-900/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-300">{player.name}</span>
                    {id === gameState.myId && (
                      <span className="text-[10px] text-zinc-600">(You)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${ROLE_COLORS[player.role!] || "text-zinc-500"}`}>
                      {player.role}
                    </span>
                    {!player.alive && (
                      <span className="text-[10px] text-zinc-600">DEAD</span>
                    )}
                    {isWinnerPlayer && (
                      <Trophy className="w-3 h-3 text-yellow-500" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <Button onClick={onLeave} className="w-full" variant="outline">
          Back to Lobby
        </Button>
      </div>
    </div>
  )
}
