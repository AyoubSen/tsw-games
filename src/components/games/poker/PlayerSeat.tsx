import { cn } from "@/lib/utils"
import { PlayingCard } from "./PlayingCard"
import { WifiOff } from "lucide-react"
import type { PublicPlayer } from "../../../../party/poker"

interface PlayerSeatProps {
  player: PublicPlayer
  isCurrentTurn: boolean
  isMe: boolean
  dealerPlayerId: string | null
  smallBlindPlayerId: string | null
  bigBlindPlayerId: string | null
  communityCardsDealt: boolean
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

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-xl transition-all min-w-[80px]",
        isCurrentTurn && !player.folded && "ring-2 ring-yellow-400 bg-yellow-400/10",
        player.folded && "opacity-40",
        player.allIn && "ring-2 ring-red-500/50 bg-red-500/5",
        isMe && !isCurrentTurn && !player.folded && "bg-primary/5 ring-1 ring-primary/20"
      )}
    >
      {/* Cards */}
      <div className="flex gap-0.5 h-[48px] items-center">
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
          <div className="h-11" />
        )}
      </div>

      {/* Name + Status */}
      <div className="text-center">
        <div className="flex items-center gap-1 justify-center">
          <span className={cn("text-xs font-medium truncate max-w-[70px]", isMe && "text-primary")}>
            {player.name}
          </span>
          {isMe && <span className="text-[10px] text-muted-foreground">(You)</span>}
          {!player.connected && <WifiOff className="w-3 h-3 text-destructive" />}
        </div>

        {/* Chips */}
        <div className="text-[11px] font-mono text-muted-foreground">
          {player.chips.toLocaleString()}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1 justify-center mt-0.5 flex-wrap">
          {player.folded && player.hasCards && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-500/20 text-zinc-500">FOLD</span>
          )}
          {player.allIn && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-500 font-bold">ALL IN</span>
          )}
          {isDealer && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-bold">D</span>
          )}
          {isSB && communityCardsDealt === false && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-500">SB</span>
          )}
          {isBB && communityCardsDealt === false && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-500">BB</span>
          )}
        </div>

        {/* Current bet */}
        {player.currentBet > 0 && (
          <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-0.5">
            Bet: {player.currentBet}
          </div>
        )}
      </div>
    </div>
  )
}
