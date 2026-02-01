import { useState } from "react"
import { Moon, Eye, Shield, Sparkles, Heart, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VillageView } from "./VillageView"
import type { PublicGameState } from "../../../../../party/mafia"

interface NightActionsProps {
  gameState: PublicGameState
  onNightAction: (targetId: string) => void
  onWitchAction: (heal: boolean, killTargetId: string | null) => void
  onCupidAction: (lover1: string, lover2: string) => void
}

export function NightActions({ gameState, onNightAction, onWitchAction, onCupidAction }: NightActionsProps) {
  const { myRole, nightSubPhase } = gameState
  const me = gameState.players[gameState.myId]
  const isAlive = me?.alive ?? false

  // Is it this player's turn to act?
  const isMyTurn = isAlive && (
    (nightSubPhase === "werewolves" && myRole === "werewolf") ||
    (nightSubPhase === "seer" && myRole === "seer") ||
    (nightSubPhase === "doctor" && myRole === "doctor") ||
    (nightSubPhase === "witch" && myRole === "witch") ||
    (nightSubPhase === "cupid" && myRole === "cupid")
  )

  if (!isAlive) {
    return <SleepMessage text="You are dead. Watch the village from beyond..." />
  }

  if (!isMyTurn) {
    return <SleepMessage text="The village sleeps... waiting for others." />
  }

  switch (nightSubPhase) {
    case "werewolves":
      return <WerewolfPanel gameState={gameState} onAction={onNightAction} />
    case "seer":
      return <SeerPanel gameState={gameState} onAction={onNightAction} />
    case "doctor":
      return <DoctorPanel gameState={gameState} onAction={onNightAction} />
    case "witch":
      return <WitchPanel gameState={gameState} onAction={onWitchAction} />
    case "cupid":
      return <CupidPanel gameState={gameState} onAction={onCupidAction} />
    default:
      return <SleepMessage text="The village sleeps..." />
  }
}

function SleepMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <Moon className="w-12 h-12 text-indigo-400 mb-4 animate-pulse" />
      <p className="text-zinc-400 text-lg">{text}</p>
    </div>
  )
}

function WerewolfPanel({ gameState, onAction }: { gameState: PublicGameState; onAction: (id: string) => void }) {
  const [target, setTarget] = useState<string | null>(null)
  const hasVoted = gameState.werewolfVotes ? !!gameState.werewolfVotes[gameState.myId] : false

  // Non-werewolves as targets
  const werewolfIds = Object.entries(gameState.players)
    .filter(([, p]) => p.role === "werewolf")
    .map(([id]) => id)

  const handleSelect = (id: string) => {
    if (hasVoted) return
    setTarget(id)
  }

  const handleConfirm = () => {
    if (target && !hasVoted) {
      onAction(target)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-red-400 mb-1">
          <Moon className="w-5 h-5" />
          <span className="font-semibold">Werewolves</span>
        </div>
        <p className="text-sm text-zinc-400">
          {hasVoted ? "Waiting for other werewolves..." : "Choose a villager to kill tonight."}
        </p>
        {gameState.werewolfVotes && Object.keys(gameState.werewolfVotes).length > 0 && (
          <div className="mt-2 text-xs text-zinc-500">
            {Object.keys(gameState.werewolfVotes).length} wolf/wolves voted
          </div>
        )}
      </div>

      {!hasVoted && (
        <>
          <VillageView
            gameState={gameState}
            onPlayerClick={handleSelect}
            selectedTarget={target}
            disabledPlayerIds={werewolfIds}
          />
          {target && (
            <div className="flex justify-center">
              <Button onClick={handleConfirm} variant="destructive" size="sm">
                <Check className="w-4 h-4 mr-1" />
                Confirm Kill
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SeerPanel({ gameState, onAction }: { gameState: PublicGameState; onAction: (id: string) => void }) {
  const [target, setTarget] = useState<string | null>(null)
  const hasActed = gameState.seerResult !== null

  if (hasActed && gameState.seerResult) {
    const targetPlayer = gameState.players[gameState.seerResult.targetId]
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center space-y-3">
        <Eye className="w-10 h-10 text-cyan-400" />
        <p className="text-zinc-300">
          <span className="font-semibold">{targetPlayer?.name}</span> is{" "}
          <span className={gameState.seerResult.isWerewolf ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
            {gameState.seerResult.isWerewolf ? "a Werewolf!" : "not a Werewolf."}
          </span>
        </p>
      </div>
    )
  }

  const handleConfirm = () => {
    if (target) onAction(target)
  }

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-cyan-400 mb-1">
          <Eye className="w-5 h-5" />
          <span className="font-semibold">Seer</span>
        </div>
        <p className="text-sm text-zinc-400">Choose a player to inspect.</p>
      </div>

      <VillageView
        gameState={gameState}
        onPlayerClick={(id) => setTarget(id)}
        selectedTarget={target}
        disabledPlayerIds={[gameState.myId]}
      />

      {target && (
        <div className="flex justify-center">
          <Button onClick={handleConfirm} className="bg-cyan-700 hover:bg-cyan-600" size="sm">
            <Eye className="w-4 h-4 mr-1" />
            Inspect
          </Button>
        </div>
      )}
    </div>
  )
}

function DoctorPanel({ gameState, onAction }: { gameState: PublicGameState; onAction: (id: string) => void }) {
  const [target, setTarget] = useState<string | null>(null)

  const disabledIds = gameState.doctorLastTarget ? [gameState.doctorLastTarget] : []

  const handleConfirm = () => {
    if (target) onAction(target)
  }

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-emerald-400 mb-1">
          <Shield className="w-5 h-5" />
          <span className="font-semibold">Doctor</span>
        </div>
        <p className="text-sm text-zinc-400">
          Choose a player to protect tonight.
          {gameState.doctorLastTarget && (
            <span className="block text-xs text-zinc-500 mt-1">
              Cannot protect {gameState.players[gameState.doctorLastTarget]?.name} again.
            </span>
          )}
        </p>
      </div>

      <VillageView
        gameState={gameState}
        onPlayerClick={(id) => setTarget(id)}
        selectedTarget={target}
        disabledPlayerIds={disabledIds}
      />

      {target && (
        <div className="flex justify-center">
          <Button onClick={handleConfirm} className="bg-emerald-700 hover:bg-emerald-600" size="sm">
            <Shield className="w-4 h-4 mr-1" />
            Protect
          </Button>
        </div>
      )}
    </div>
  )
}

function WitchPanel({ gameState, onAction }: { gameState: PublicGameState; onAction: (heal: boolean, killTargetId: string | null) => void }) {
  const [killTarget, setKillTarget] = useState<string | null>(null)
  const [wantToHeal, setWantToHeal] = useState(false)
  const [wantToKill, setWantToKill] = useState(false)

  const canHeal = !gameState.witchHealUsed && gameState.witchWerewolfTarget !== null
  const canKill = !gameState.witchKillUsed
  const targetName = gameState.witchWerewolfTarget
    ? gameState.players[gameState.witchWerewolfTarget]?.name
    : null

  const handleConfirm = () => {
    onAction(wantToHeal, wantToKill ? killTarget : null)
  }

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-purple-400 mb-1">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">Witch</span>
        </div>
        <p className="text-sm text-zinc-400">Use your potions wisely.</p>
      </div>

      <div className="space-y-3 px-4">
        {canHeal && targetName && (
          <div className="p-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-300 font-medium">Heal Potion</p>
                <p className="text-xs text-zinc-400">{targetName} was attacked tonight.</p>
              </div>
              <Button
                size="sm"
                variant={wantToHeal ? "default" : "outline"}
                onClick={() => setWantToHeal(!wantToHeal)}
                className={wantToHeal ? "bg-emerald-700" : ""}
              >
                {wantToHeal ? "Will Heal" : "Heal"}
              </Button>
            </div>
          </div>
        )}
        {!canHeal && (
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <p className="text-sm text-zinc-500">
              {gameState.witchHealUsed ? "Heal potion already used." : "No one to heal tonight."}
            </p>
          </div>
        )}

        {canKill && (
          <div className="p-3 rounded-lg border border-red-900/50 bg-red-950/30">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-red-300 font-medium">Kill Potion</p>
                <p className="text-xs text-zinc-400">Choose someone to poison.</p>
              </div>
              <Button
                size="sm"
                variant={wantToKill ? "destructive" : "outline"}
                onClick={() => setWantToKill(!wantToKill)}
              >
                {wantToKill ? "Will Kill" : "Use"}
              </Button>
            </div>
            {wantToKill && (
              <VillageView
                gameState={gameState}
                onPlayerClick={(id) => setKillTarget(id)}
                selectedTarget={killTarget}
                disabledPlayerIds={[gameState.myId]}
              />
            )}
          </div>
        )}
        {!canKill && (
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <p className="text-sm text-zinc-500">Kill potion already used.</p>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Button onClick={handleConfirm} className="bg-purple-700 hover:bg-purple-600" size="sm">
          <Check className="w-4 h-4 mr-1" />
          Confirm Actions
        </Button>
      </div>
    </div>
  )
}

function CupidPanel({ gameState, onAction }: { gameState: PublicGameState; onAction: (l1: string, l2: string) => void }) {
  const [lovers, setLovers] = useState<string[]>([])

  const handleSelect = (id: string) => {
    if (lovers.includes(id)) {
      setLovers(lovers.filter((l) => l !== id))
    } else if (lovers.length < 2) {
      setLovers([...lovers, id])
    }
  }

  const handleConfirm = () => {
    if (lovers.length === 2) {
      onAction(lovers[0], lovers[1])
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-center px-4">
        <div className="flex items-center justify-center gap-2 text-pink-400 mb-1">
          <Heart className="w-5 h-5" />
          <span className="font-semibold">Cupid</span>
        </div>
        <p className="text-sm text-zinc-400">
          Choose 2 players to link as lovers. ({lovers.length}/2 selected)
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 px-4 py-2">
        {gameState.playerOrder.map((id) => {
          const player = gameState.players[id]
          if (!player?.alive) return null
          const isSelected = lovers.includes(id)
          return (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                isSelected
                  ? "bg-pink-900/40 ring-2 ring-pink-500"
                  : "hover:bg-zinc-800"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-700/80 flex items-center justify-center font-bold text-zinc-100">
                {player.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-zinc-300">{player.name}</span>
            </button>
          )
        })}
      </div>

      {lovers.length === 2 && (
        <div className="flex justify-center">
          <Button onClick={handleConfirm} className="bg-pink-700 hover:bg-pink-600" size="sm">
            <Heart className="w-4 h-4 mr-1" />
            Link Lovers
          </Button>
        </div>
      )}
    </div>
  )
}
