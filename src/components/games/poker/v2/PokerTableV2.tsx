import { useMemo } from "react"
import { PlayingCard } from "./PlayingCardV2"
import { PlayerSeat } from "./PlayerSeatV2"
import type { PublicGameState } from "../../../../../party/poker"

interface PokerTableProps {
  gameState: PublicGameState
  playerId: string
}

// Betting round step dots
const ROUNDS = ["pre-flop", "flop", "turn", "river"] as const
const ROUND_INDEX: Record<string, number> = {
  "pre-flop": 0,
  flop: 1,
  turn: 2,
  river: 3,
  showdown: 4,
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

  const communityCardsDealt = communityCards.length > 0
  const currentRoundIdx = ROUND_INDEX[gameState.bettingRound] ?? 0

  return (
    <div className="relative w-full aspect-[16/10] max-w-[700px] mx-auto">
      {/* Wood-grain outer border */}
      <div
        className="absolute inset-0 rounded-[32px]"
        style={{
          background: "linear-gradient(135deg, #92400e, #78350f, #92400e, #6d2d0a, #92400e)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.1)",
        }}
      />

      {/* Gold trim ring */}
      <div
        className="absolute inset-[3%] rounded-[50%]"
        style={{
          border: "2px solid rgba(234, 179, 8, 0.35)",
          boxShadow: "0 0 8px rgba(234, 179, 8, 0.15)",
        }}
      />

      {/* Rich felt surface */}
      <div
        className="absolute inset-[4%] rounded-[50%]"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, #059669, #047857, #065f46)",
          boxShadow: "inset 0 4px 20px rgba(0,0,0,0.3), inset 0 0 60px rgba(0,0,0,0.1)",
        }}
      />

      {/* Subtle felt highlight */}
      <div
        className="absolute inset-[4%] rounded-[50%] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.06) 0%, transparent 60%)",
        }}
      />

      {/* Pot display with chip stack */}
      {pot > 0 && (
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="flex flex-col items-center gap-1">
            {/* Chip stack icon */}
            <div className="flex flex-col items-center -space-y-1">
              <div className="w-5 h-2.5 rounded-full bg-gradient-to-b from-red-400 to-red-600 border border-red-300/50 shadow-sm" />
              <div className="w-5 h-2.5 rounded-full bg-gradient-to-b from-blue-400 to-blue-600 border border-blue-300/50 shadow-sm" />
              <div className="w-5 h-2.5 rounded-full bg-gradient-to-b from-green-400 to-green-600 border border-green-300/50 shadow-sm" />
            </div>
            <span
              className="font-mono font-bold text-sm px-3 py-0.5 rounded-full"
              style={{
                color: "#fbbf24",
                textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                background: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(4px)",
              }}
            >
              {pot.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Betting round step dots */}
      {gameState.handInProgress && (
        <div className="absolute left-1/2 top-[39%] -translate-x-1/2 z-10 flex gap-1.5">
          {ROUNDS.map((round, i) => (
            <div
              key={round}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background: i <= currentRoundIdx
                  ? "rgba(234, 179, 8, 0.8)"
                  : "rgba(255, 255, 255, 0.15)",
                boxShadow: i <= currentRoundIdx
                  ? "0 0 4px rgba(234, 179, 8, 0.4)"
                  : "none",
              }}
            />
          ))}
        </div>
      )}

      {/* Community cards with entrance animation */}
      <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-10 flex gap-1">
        {communityCards.map((card, i) => (
          <div
            key={i}
            style={{
              animation: "cardEntrance 0.4s ease-out both",
              animationDelay: `${i * 0.08}s`,
            }}
          >
            <PlayingCard card={card} size="sm" />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 5 - communityCards.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-9 h-[50px] rounded-lg border border-white/10"
          />
        ))}
      </div>

      {/* Dealer button near dealer seat */}
      {gameState.dealerPlayerId && (() => {
        const dealerIdx = rotatedSeats.indexOf(gameState.dealerPlayerId)
        if (dealerIdx === -1) return null
        const pos = getPosition(dealerIdx, rotatedSeats.length)
        const xNum = parseFloat(pos.left)
        const yNum = parseFloat(pos.top)
        // Offset toward center
        const dx = 50 - xNum
        const dy = 50 - yNum
        const dist = Math.sqrt(dx * dx + dy * dy)
        const offsetX = dist > 0 ? (dx / dist) * 8 : 0
        const offsetY = dist > 0 ? (dy / dist) * 8 : 0
        return (
          <div
            className="absolute z-30 w-5 h-5 rounded-full bg-white text-zinc-900 text-[9px] font-bold flex items-center justify-center shadow-lg -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${xNum + offsetX}%`,
              top: `${yNum + offsetY}%`,
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
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
              dealerPlayerId={gameState.dealerPlayerId}
              smallBlindPlayerId={gameState.smallBlindPlayerId}
              bigBlindPlayerId={gameState.bigBlindPlayerId}
              communityCardsDealt={communityCardsDealt}
            />
          </div>
        )
      })}

      {/* CSS keyframes injected via style tag */}
      <style>{`
        @keyframes cardEntrance {
          from {
            opacity: 0;
            transform: scale(0.7);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}
