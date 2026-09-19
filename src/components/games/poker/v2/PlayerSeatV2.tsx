import { WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayingCard } from "./PlayingCardV2"
import type { PublicPlayer } from "../../../../../party/poker"

interface PlayerSeatProps {
  player: PublicPlayer
  isCurrentTurn: boolean
  isDealer: boolean
  blind?: "SB" | "BB" | null
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase()
}

export function PlayerSeat({
  player,
  isCurrentTurn,
  isDealer,
  blind,
}: PlayerSeatProps) {
  const revealed = player.holeCards && player.holeCards.length === 2
  const isActive = isCurrentTurn && !player.folded

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Cards sit above the plate so the plate stays a consistent size */}
      <div className="flex h-10 items-end gap-[3px]">
        {player.hasCards && !player.folded ? (
          revealed ? (
            <>
              <PlayingCard card={player.holeCards![0]} size="xs" />
              <PlayingCard card={player.holeCards![1]} size="xs" />
            </>
          ) : (
            <>
              <PlayingCard card={null} faceDown size="xs" className="-mr-3 rotate-[-6deg]" />
              <PlayingCard card={null} faceDown size="xs" className="rotate-[6deg]" />
            </>
          )
        ) : null}
      </div>

      {/* Name plate */}
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-all duration-200",
          "bg-black/55 backdrop-blur-sm ring-1",
          isActive
            ? "ring-amber-400/90 shadow-[0_0_16px_rgba(251,191,36,0.35)]"
            : "ring-white/10",
          player.folded && "opacity-40",
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            isActive ? "bg-amber-400 text-black" : "bg-white/10 text-white/80",
          )}
        >
          {initials(player.name)}
        </div>

        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1">
            <span className="max-w-[72px] truncate text-[11px] font-medium text-white/90">
              {player.name}
            </span>
            {!player.connected && (
              <WifiOff className="h-2.5 w-2.5 shrink-0 text-red-400" />
            )}
          </div>
          <span className="block font-mono text-[11px] tabular-nums text-amber-200/70">
            {player.chips.toLocaleString()}
          </span>
        </div>

        {isDealer && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-bold text-black shadow">
            D
          </span>
        )}
        {blind && !isDealer && (
          <span className="absolute -right-1.5 -top-1 rounded-full bg-sky-500 px-1 text-[8px] font-bold text-white shadow">
            {blind}
          </span>
        )}
      </div>

      {/* Status / chips in front of the seat */}
      <div className="h-4">
        {player.allIn ? (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-300">
            All in
          </span>
        ) : player.folded ? (
          <span className="text-[9px] uppercase tracking-wide text-white/30">Folded</span>
        ) : null}
      </div>
    </div>
  )
}
