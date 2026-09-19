import { useMemo } from "react"
import { PlayingCard } from "./PlayingCardV2"
import { PlayerSeat } from "./PlayerSeatV2"
import { ChipStack } from "./ChipStackV2"
import type { PublicGameState } from "../../../../../party/poker"

interface PokerTableProps {
  gameState: PublicGameState
  playerId: string
}

const ROUND_LABELS: Record<string, string> = {
  "pre-flop": "Pre-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
}

/**
 * Opponents are spread along an arc across the top of the table, sweeping from
 * the lower-left around through the top to the lower-right. The bottom of the
 * table is deliberately left empty: that is where the local player's dock sits,
 * so their cards and chips are never drawn twice.
 */
function seatPosition(index: number, total: number) {
  const START = 205
  const END = -25
  const t = total === 1 ? 0.5 : index / (total - 1)
  const rad = ((START + (END - START) * t) * Math.PI) / 180
  return {
    x: 50 + 41 * Math.cos(rad),
    y: 46 - 36 * Math.sin(rad),
  }
}

export function PokerTable({ gameState, playerId }: PokerTableProps) {
  const {
    seatOrder,
    players,
    communityCards,
    pot,
    currentPlayerId,
    dealerPlayerId,
    smallBlindPlayerId,
    bigBlindPlayerId,
    bettingRound,
    handInProgress,
  } = gameState

  const opponents = useMemo(() => {
    const myIndex = seatOrder.indexOf(playerId)
    const rotated =
      myIndex === -1
        ? seatOrder
        : [...seatOrder.slice(myIndex + 1), ...seatOrder.slice(0, myIndex)]
    return rotated.filter((id) => players[id])
  }, [seatOrder, playerId, players])

  return (
    <div className="relative mx-auto aspect-[16/11] h-full max-h-full w-auto max-w-full">
      {/* Rail */}
      <div className="absolute inset-0 rounded-[44%/50%] bg-gradient-to-b from-[#32323a] via-[#23232a] to-[#141418] shadow-[0_24px_60px_rgba(0,0,0,0.65)]" />
      <div className="absolute inset-0 rounded-[44%/50%] ring-1 ring-white/[0.09]" />

      {/* Felt */}
      <div
        className="absolute inset-[4%] overflow-hidden rounded-[44%/50%] ring-1 ring-black/50"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, #23795a 0%, #166046 48%, #0b3b2b 100%)",
          boxShadow: "inset 0 10px 45px rgba(0,0,0,0.5)",
        }}
      >
        {/* Felt weave */}
        <div
          className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 3px)",
          }}
        />
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="select-none text-[clamp(1.5rem,7vw,4rem)] tracking-[0.3em] text-white/[0.04]">
            ♠ ♥ ♦ ♣
          </span>
        </div>
        {/* Inner betting line */}
        <div className="absolute inset-[9%] rounded-[44%/50%] border border-white/[0.06]" />
        {/* Overhead light */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.14), transparent 55%)",
          }}
        />
      </div>

      {/* Center: round, community cards, pot */}
      <div className="absolute left-1/2 top-[44%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">
          {handInProgress ? (ROUND_LABELS[bettingRound] ?? bettingRound) : "Waiting"}
        </span>

        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => {
            const card = communityCards[i]
            if (card === undefined) {
              return (
                <div
                  key={`slot-${i}`}
                  className="h-[68px] w-12 rounded-lg bg-black/15 ring-1 ring-inset ring-white/[0.05]"
                />
              )
            }
            return (
              <div
                key={`card-${i}`}
                style={{
                  animation: "pokerCardIn 300ms cubic-bezier(0.2,0.8,0.3,1) both",
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <PlayingCard card={card} size="md" />
              </div>
            )
          })}
        </div>

        {pot > 0 && <ChipStack amount={pot} size="md" />}
      </div>

      {/* Opponent seats, each with their chips pushed toward the pot */}
      {opponents.map((id, index) => {
        const player = players[id]
        const { x, y } = seatPosition(index, opponents.length)
        // Nudge the bet toward the table centre so it reads as chips on the felt.
        const dx = 50 - x
        const dy = 44 - y
        const dist = Math.hypot(dx, dy) || 1
        const betX = x + (dx / dist) * 13
        const betY = y + (dy / dist) * 13

        return (
          <div key={id}>
            <div
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <PlayerSeat
                player={player}
                isCurrentTurn={currentPlayerId === id}
                isDealer={dealerPlayerId === id}
                blind={
                  smallBlindPlayerId === id
                    ? "SB"
                    : bigBlindPlayerId === id
                      ? "BB"
                      : null
                }
              />
            </div>

            {player.currentBet > 0 && !player.folded && (
              <div
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${betX}%`, top: `${betY}%` }}
              >
                <ChipStack amount={player.currentBet} size="sm" />
              </div>
            )}
          </div>
        )
      })}

      <style>{`
        @keyframes pokerCardIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.88); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}
