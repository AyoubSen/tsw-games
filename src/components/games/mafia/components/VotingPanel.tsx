import { useState } from "react"
import { Gavel, Check, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VillageView } from "./VillageView"
import type { PublicGameState } from "../../../../../party/mafia"

interface VotingPanelProps {
  gameState: PublicGameState
  onVote: (targetId: string) => void
}

export function VotingPanel({ gameState, onVote }: VotingPanelProps) {
  const [target, setTarget] = useState<string | null>(null)
  const me = gameState.players[gameState.myId]
  const hasVoted = !!gameState.dayVotes[gameState.myId]
  const canVote = me?.alive && !hasVoted

  const alivePlayers = gameState.playerOrder
    .map((id) => gameState.players[id])
    .filter((p) => p?.alive)

  const totalVotes = Object.keys(gameState.dayVotes).length
  const aliveCount = alivePlayers.length

  // Vote breakdown
  const voteCounts: Record<string, string[]> = {}
  for (const [voterId, targetId] of Object.entries(gameState.dayVotes)) {
    if (!voteCounts[targetId]) voteCounts[targetId] = []
    voteCounts[targetId].push(voterId)
  }

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-red-400 mb-1">
          <Gavel className="w-5 h-5" />
          <span className="font-semibold">Village Vote</span>
        </div>
        <p className="text-sm text-zinc-400">
          {hasVoted
            ? `You voted. Waiting for others... (${totalVotes}/${aliveCount})`
            : "Vote to eliminate a player or abstain."}
        </p>
      </div>

      {canVote && (
        <>
          <VillageView
            gameState={gameState}
            onPlayerClick={(id) => setTarget(id)}
            selectedTarget={target}
            disabledPlayerIds={[gameState.myId]}
            showVotes
          />

          <div className="flex justify-center gap-2 px-4">
            {target && (
              <Button
                onClick={() => { onVote(target); setTarget(null) }}
                variant="destructive"
                size="sm"
              >
                <Check className="w-4 h-4 mr-1" />
                Vote to Eliminate
              </Button>
            )}
            <Button
              onClick={() => onVote("abstain")}
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-400"
            >
              <Ban className="w-4 h-4 mr-1" />
              Abstain
            </Button>
          </div>
        </>
      )}

      {!canVote && (
        <VillageView gameState={gameState} showVotes />
      )}

      {/* Vote summary */}
      {Object.keys(voteCounts).length > 0 && (
        <div className="px-4 space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase">Votes</p>
          {Object.entries(voteCounts).map(([targetId, voterIds]) => {
            const targetName = targetId === "abstain" ? "Abstain" : gameState.players[targetId]?.name || "Unknown"
            const voterNames = voterIds.map((id) => gameState.players[id]?.name || "?")
            return (
              <div key={targetId} className="text-sm text-zinc-400">
                <span className="font-medium text-zinc-300">{targetName}</span>
                <span className="text-zinc-600"> ({voterIds.length}) - </span>
                <span className="text-zinc-500">{voterNames.join(", ")}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
