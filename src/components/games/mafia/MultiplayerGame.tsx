import { useState } from "react"
import { Crosshair } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PhaseHeader } from "./components/PhaseHeader"
import { RoleCard } from "./components/RoleCard"
import { VillageView } from "./components/VillageView"
import { NightActions } from "./components/NightActions"
import { ChatPanel } from "./components/ChatPanel"
import { VotingPanel } from "./components/VotingPanel"
import { EventLog } from "./components/EventLog"
import { GameOverModal } from "./components/GameOverModal"
import type { PublicGameState } from "../../../../party/mafia"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onNightAction: (targetId: string) => void
  onWitchAction: (heal: boolean, killTargetId: string | null) => void
  onCupidAction: (lover1: string, lover2: string) => void
  onHunterKill: (targetId: string) => void
  onDayVote: (targetId: string) => void
  onChat: (text: string) => void
  onLeave: () => void
  error: string | null
}

export function MultiplayerGame({
  gameState,
  onNightAction,
  onWitchAction,
  onCupidAction,
  onHunterKill,
  onDayVote,
  onChat,
  onLeave,
  error,
}: MultiplayerGameProps) {
  const { phase } = gameState

  return (
    <div className="flex flex-col min-h-[calc(100vh-130px)]">
      <PhaseHeader
        phase={phase}
        dayNumber={gameState.dayNumber}
        phaseEndTime={gameState.phaseEndTime}
      />

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 text-red-300 text-sm px-4 py-2 text-center">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-4">
        {/* Role reveal phase */}
        {phase === "role-reveal" && gameState.myRole && (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <p className="text-zinc-400 mb-4">Your role is...</p>
            <div className="w-full max-w-xs">
              <RoleCard role={gameState.myRole} />
            </div>
            <p className="text-xs text-zinc-600 mt-4">Memorize your role. The night is coming...</p>
          </div>
        )}

        {/* Night phases */}
        {(phase === "night" || phase === "first-night") && (
          <div className="space-y-4">
            {gameState.myRole && (
              <div className="flex justify-center pt-2">
                <RoleCard role={gameState.myRole} mini />
              </div>
            )}
            <NightActions
              gameState={gameState}
              onNightAction={onNightAction}
              onWitchAction={onWitchAction}
              onCupidAction={onCupidAction}
            />
          </div>
        )}

        {/* Dawn phase */}
        {phase === "dawn" && (
          <div className="space-y-4">
            <VillageView gameState={gameState} />
            <EventLog events={gameState.events} />
          </div>
        )}

        {/* Day discussion */}
        {phase === "day-discussion" && (
          <div className="space-y-4 px-4">
            {gameState.myRole && (
              <div className="flex justify-center pt-2">
                <RoleCard role={gameState.myRole} mini />
              </div>
            )}
            <VillageView gameState={gameState} />
            <ChatPanel gameState={gameState} onChat={onChat} />
            <EventLog events={gameState.events} />
          </div>
        )}

        {/* Day voting */}
        {phase === "day-voting" && (
          <div className="space-y-4 px-4">
            <VotingPanel gameState={gameState} onVote={onDayVote} />
            <ChatPanel gameState={gameState} onChat={onChat} />
            <EventLog events={gameState.events} />
          </div>
        )}

        {/* Day elimination */}
        {phase === "day-elimination" && (
          <div className="space-y-4">
            <VillageView gameState={gameState} />
            <EventLog events={gameState.events} />
          </div>
        )}

        {/* Hunter revenge */}
        {phase === "hunter-revenge" && (
          <div className="space-y-4">
            {gameState.isHunterRevenge ? (
              <HunterRevengePanel gameState={gameState} onHunterKill={onHunterKill} />
            ) : (
              <div className="flex flex-col items-center py-8 px-4 text-center">
                <Crosshair className="w-10 h-10 text-orange-400 mb-3 animate-pulse" />
                <p className="text-zinc-400">The Hunter is choosing their final target...</p>
              </div>
            )}
            <EventLog events={gameState.events} />
          </div>
        )}

        {/* Game over */}
        {phase === "game-over" && (
          <div className="space-y-4">
            <VillageView gameState={gameState} />
            <EventLog events={gameState.events} />
            <GameOverModal gameState={gameState} onLeave={onLeave} />
          </div>
        )}
      </div>
    </div>
  )
}

function HunterRevengePanel({ gameState, onHunterKill }: { gameState: PublicGameState; onHunterKill: (id: string) => void }) {
  const [target, setTarget] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-orange-400 mb-1">
          <Crosshair className="w-5 h-5" />
          <span className="font-semibold">Hunter's Revenge</span>
        </div>
        <p className="text-sm text-zinc-400">You were killed! Choose someone to take down with you.</p>
      </div>

      <VillageView
        gameState={gameState}
        onPlayerClick={(id) => setTarget(id)}
        selectedTarget={target}
        disabledPlayerIds={[gameState.myId]}
      />

      {target && (
        <div className="flex justify-center">
          <Button
            onClick={() => onHunterKill(target)}
            variant="destructive"
            size="sm"
          >
            <Crosshair className="w-4 h-4 mr-1" />
            Take Down {gameState.players[target]?.name}
          </Button>
        </div>
      )}
    </div>
  )
}
