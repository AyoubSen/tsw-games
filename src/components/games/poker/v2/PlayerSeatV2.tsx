import { cn } from "@/lib/utils"
import { PlayingCard } from "./PlayingCardV2"
import { WifiOff } from "lucide-react"
import type { PublicPlayer } from "../../../../../party/poker"

interface PlayerSeatProps {
  player: PublicPlayer
  isCurrentTurn: boolean
  isMe: boolean
  dealerPlayerId: string | null
  smallBlindPlayerId: string | null
  bigBlindPlayerId: string | null
  communityCardsDealt: boolean
}

// 8 distinct avatar colors
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
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

export function PlayerSeat({
  player,
  isCurrentTurn,
  isMe,
  dealerPlayerId,
  smallBlindPlayerId,
  bigBlindPlayerId,
  communityCardsDealt,
}: PlayerSeatProps) {
  const isDealer = player.id === dealerPlayerId
  const isSB = player.id === smallBlindPlayerId
  const isBB = player.id === bigBlindPlayerId
  const showCards = player.holeCards && player.holeCards.length === 2
  const isActive = isCurrentTurn && !player.folded

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-xl min-w-[84px] relative",
        "transition-all duration-500",
        player.folded && "opacity-40 grayscale",
        player.allIn && "ring-2 ring-red-500/60",
        isMe && !isActive && !player.folded && "bg-emerald-900/20 ring-1 ring-emerald-500/20"
      )}
      style={isActive ? {
        boxShadow: "0 0 16px rgba(234, 179, 8, 0.5), 0 0 32px rgba(234, 179, 8, 0.2)",
      } : undefined}
    >
      {/* Active turn glow ring */}
      {isActive && (
        <div className="absolute inset-0 rounded-xl ring-2 ring-yellow-400 animate-pulse pointer-events-none" />
      )}

      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md",
        getAvatarColor(player.name),
        isActive && "scale-110 transition-transform duration-300"
      )}>
        {player.name.charAt(0).toUpperCase()}
      </div>

      {/* Cards */}
      <div className="flex gap-0.5 h-[52px] items-center">
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

      {/* Name + Status */}
      <div className="text-center">
        <div className="flex items-center gap-1 justify-center">
          <span className={cn("text-xs font-medium truncate max-w-[70px] text-white/90", isMe && "text-emerald-300")}>
            {player.name}
          </span>
          {isMe && <span className="text-[10px] text-white/50">(You)</span>}
          {!player.connected && <WifiOff className="w-3 h-3 text-red-400" />}
        </div>

        {/* Chips with icon */}
        <div className="flex items-center justify-center gap-1 text-[11px] font-mono text-yellow-300/80">
          <div className="w-3 h-3 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border border-yellow-300/50 flex-shrink-0" />
          {player.chips.toLocaleString()}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1 justify-center mt-0.5 flex-wrap">
          {player.folded && player.hasCards && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400 font-medium">FOLD</span>
          )}
          {player.allIn && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600/30 text-red-300 font-bold animate-pulse">ALL IN</span>
          )}
          {isDealer && (
            <span className="text-[9px] w-5 h-5 rounded-full bg-white text-zinc-900 font-bold flex items-center justify-center shadow-md">D</span>
          )}
          {isSB && communityCardsDealt === false && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-600/30 text-sky-300">SB</span>
          )}
          {isBB && communityCardsDealt === false && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300">BB</span>
          )}
        </div>

        {/* Current bet */}
        {player.currentBet > 0 && (
          <div className="text-[10px] font-mono text-amber-300 mt-0.5">
            Bet: {player.currentBet}
          </div>
        )}
      </div>
    </div>
  )
}
