import { PlayerAvatar } from "./PlayerAvatar"
import type { PublicGameState } from "../../../../../party/mafia"

interface VillageViewProps {
  gameState: PublicGameState
  onPlayerClick?: (playerId: string) => void
  selectedTarget?: string | null
  disabledPlayerIds?: string[]
  showVotes?: boolean
}

export function VillageView({
  gameState,
  onPlayerClick,
  selectedTarget,
  disabledPlayerIds = [],
  showVotes = false,
}: VillageViewProps) {
  const players = gameState.playerOrder.map((id) => gameState.players[id]).filter(Boolean)

  // Count votes received by each player
  const voteCounts: Record<string, number> = {}
  if (showVotes) {
    for (const targetId of Object.values(gameState.dayVotes)) {
      if (targetId !== "abstain") {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
      }
    }
  }

  return (
    <div className="flex flex-wrap justify-center gap-3 px-4 py-4">
      {players.map((player) => {
        const isClickable =
          onPlayerClick &&
          player.alive &&
          player.id !== gameState.myId &&
          !disabledPlayerIds.includes(player.id)

        return (
          <PlayerAvatar
            key={player.id}
            name={player.name}
            alive={player.alive}
            role={player.role}
            isYou={player.id === gameState.myId}
            isTarget={selectedTarget === player.id}
            isLover={
              gameState.isLover &&
              gameState.cupidLovers !== null &&
              gameState.cupidLovers.includes(player.id)
            }
            connected={player.connected}
            onClick={isClickable ? () => onPlayerClick(player.id) : undefined}
            disabled={!isClickable}
            votesReceived={showVotes ? voteCounts[player.id] : undefined}
          />
        )
      })}
    </div>
  )
}
