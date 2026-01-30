import { useMemo } from "react"
import { PlayingCard } from "./PlayingCard"
import { PlayerSeat } from "./PlayerSeat"
import type { PublicGameState } from "../../../../party/poker"

interface PokerTableProps {
  gameState: PublicGameState
  playerId: string
}

export function PokerTable({ gameState, playerId }: PokerTableProps) {
  const { seatOrder, players, communityCards, pot, currentPlayerId } = gameState

  // Rotate seat order so current player is always at the bottom
  const rotatedSeats = useMemo(() => {
    const myIndex = seatOrder.indexOf(playerId)
    if (myIndex === -1) return seatOrder
    return [...seatOrder.slice(myIndex), ...seatOrder.slice(0, myIndex)]
  }, [seatOrder, playerId])

  // Position players in an elliptical layout
  // Bottom center = index 0 (current player)
  const getPosition = (index: number, total: number) => {
    // Angle: start from bottom (270deg / -90deg) and go clockwise
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2
    // Flip to go clockwise
    const a = -angle + Math.PI
    const rx = 45 // % of container width
    const ry = 40 // % of container height
    const x = 50 + rx * Math.cos(a)
    const y = 50 + ry * Math.sin(a)
    return { left: `${x}%`, top: `${y}%` }
  }

  const communityCardsDealt = communityCards.length > 0

  return (
    <div className="relative w-full aspect-[16/10] max-w-[700px] mx-auto">
      {/* Table surface */}
      <div className="absolute inset-[8%] rounded-[50%] bg-gradient-to-br from-green-700 to-green-900 border-4 border-green-950 shadow-2xl" />
      <div className="absolute inset-[10%] rounded-[50%] border border-green-600/30" />

      {/* Pot display */}
      {pot > 0 && (
        <div className="absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-black/40 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm font-mono font-bold">
            Pot: {pot.toLocaleString()}
          </div>
        </div>
      )}

      {/* Community cards */}
      <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 z-10 flex gap-1">
        {communityCards.map((card, i) => (
          <PlayingCard key={i} card={card} size="sm" />
        ))}
        {/* Placeholder slots */}
        {Array.from({ length: Math.max(0, 5 - communityCards.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-8 h-11 rounded-lg border border-green-600/20"
          />
        ))}
      </div>

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
              dealerPlayerId={gameState.dealerPlayerId}
              smallBlindPlayerId={gameState.smallBlindPlayerId}
              bigBlindPlayerId={gameState.bigBlindPlayerId}
              communityCardsDealt={communityCardsDealt}
            />
          </div>
        )
      })}
    </div>
  )
}
