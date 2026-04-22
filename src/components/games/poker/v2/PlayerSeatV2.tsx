import { cn } from "@/lib/utils"
import { PlayingCard } from "./PlayingCardV2"
import { WifiOff } from "lucide-react"
import type { PublicPlayer } from "../../../../../party/poker"

interface PlayerSeatProps {
  player: PublicPlayer
  isCurrentTurn: boolean
  isMe: boolean
}

export function PlayerSeat({
  player,
  isCurrentTurn,
  isMe,
}: PlayerSeatProps) {
  const showCards = player.holeCards && player.holeCards.length === 2
  const isActive = isCurrentTurn && !player.folded

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[76px] relative transition-all duration-300",
        player.folded && "opacity-35",
        isMe && !player.folded && "bg-white/[0.04]",
      )}
      style={isActive ? {
        background: "rgba(251,191,36,0.08)",
        boxShadow: "0 0 0 1.5px rgba(251,191,36,0.4)",
        borderRadius: "12px",
      } : undefined}
    >
      {/* Cards */}
      <div className="flex gap-0.5 h-[50px] items-center">
        {player.hasCards && !player.folded ? (
          showCards ? (
            <>
              <PlayingCard card={player.holeCards![0]} size="sm" />
              <PlayingCard card={player.holeCards![1]} size="sm" />
            </>
          ) : (
            <>
              <PlayingCard card={null} faceDown size="sm" />
              <PlayingCard card={null} faceDown size="sm" />
            </>
          )
        ) : (
          <div className="h-[50px]" />
        )}
      </div>

      {/* Name row */}
      <div className="flex items-center gap-1 justify-center mt-0.5">
        <span className={cn(
          "text-[11px] font-medium truncate max-w-[68px]",
          isMe ? "text-white" : "text-zinc-400"
        )}>
          {player.name}
        </span>
        {!player.connected && <WifiOff className="w-2.5 h-2.5 text-red-400/70" />}
      </div>

      {/* Chips */}
      <span className="text-[10px] font-mono text-zinc-500">
        {player.chips.toLocaleString()}
      </span>

      {/* Status line — only show the most relevant one */}
      {player.allIn ? (
        <span className="text-[9px] font-bold text-red-400/80">ALL IN</span>
      ) : player.folded && player.hasCards ? (
        <span className="text-[9px] text-zinc-600">Folded</span>
      ) : player.currentBet > 0 ? (
        <span className="text-[9px] font-mono text-amber-400/70">Bet {player.currentBet}</span>
      ) : null}
    </div>
  )
}
