import { useMemo } from "react"
import { PlayingCard } from "./PlayingCardV2"
import { PlayerSeat } from "./PlayerSeatV2"
import type { PublicGameState } from "../../../../../party/poker"

interface PokerTableProps {
  gameState: PublicGameState
  playerId: string
}

export function PokerTable({ gameState, playerId }: PokerTableProps) {
  const { seatOrder, players, communityCards, pot, currentPlayerId } = gameState

  const rotatedSeats = useMemo(() => {
    const myIndex = seatOrder.indexOf(playerId)
    if (myIndex === -1) return seatOrder
    return [...seatOrder.slice(myIndex), ...seatOrder.slice(0, myIndex)]
  }, [seatOrder, playerId])

  const getPosition = (index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2
    const a = -angle + Math.PI
    const rx = 45
    const ry = 40
    const x = 50 + rx * Math.cos(a)
    const y = 50 + ry * Math.sin(a)
    return { left: `${x}%`, top: `${y}%` }
  }


  return (
    <div className="relative w-full aspect-[16/10] max-w-[700px] mx-auto">
      {/* Table edge */}
      <div
        className="absolute inset-0 rounded-[32px]"
        style={{
          background: "linear-gradient(135deg, #44403c, #292524, #44403c)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      />

      {/* Felt surface */}
      <div
        className="absolute inset-[3%] rounded-[50%]"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, #15803d, #166534, #14532d)",
          boxShadow: "inset 0 4px 20px rgba(0,0,0,0.3)",
        }}
      />

      {/* Pot */}
      {pot > 0 && (
        <div className="absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 z-10">
          <span
            className="font-mono font-bold text-sm px-3 py-1 rounded-full"
            style={{
              color: "#fbbf24",
              background: "rgba(0,0,0,0.4)",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            Pot: {pot.toLocaleString()}
          </span>
        </div>
      )}

      {/* Community cards */}
      <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-10 flex gap-1">
        {communityCards.map((card, i) => (
          <div
            key={i}
            style={{
              animation: "cardEntrance 0.3s ease-out both",
              animationDelay: `${i * 0.06}s`,
            }}
          >
            <PlayingCard card={card} size="sm" />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 5 - communityCards.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-9 h-[50px] rounded-lg border border-white/[0.07]"
          />
        ))}
      </div>

      {/* Dealer button */}
      {gameState.dealerPlayerId && (() => {
        const dealerIdx = rotatedSeats.indexOf(gameState.dealerPlayerId)
        if (dealerIdx === -1) return null
        const pos = getPosition(dealerIdx, rotatedSeats.length)
        const xNum = parseFloat(pos.left)
        const yNum = parseFloat(pos.top)
        const dx = 50 - xNum
        const dy = 50 - yNum
        const dist = Math.sqrt(dx * dx + dy * dy)
        const offsetX = dist > 0 ? (dx / dist) * 8 : 0
        const offsetY = dist > 0 ? (dy / dist) * 8 : 0
        return (
          <div
            className="absolute z-30 w-5 h-5 rounded-full bg-white text-zinc-900 text-[9px] font-bold flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${xNum + offsetX}%`,
              top: `${yNum + offsetY}%`,
              boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
            }}
          >
            D
          </div>
        )
      })()}

      {/* Player seats */}
      {rotatedSeats.map((id, index) => {
        const player = players[id]
        if (!player) return null
        const pos = getPosition(index, rotatedSeats.length)
        return (
          <div
            key={id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ left: pos.left, top: pos.top }}
          >
            <PlayerSeat
              player={player}
              isCurrentTurn={currentPlayerId === id}
              isMe={id === playerId}
            />
          </div>
        )
      })}

      <style>{`
        @keyframes cardEntrance {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
