import { PokerTable } from "./PokerTableV2"
import { BettingControls } from "./BettingControlsV2"
import { HandRankDisplay } from "./HandRankDisplayV2"
import { HandResultOverlay } from "./HandResultOverlayV2"
import { GameOverModal } from "./GameOverModalV2"
import { PlayingCard } from "./PlayingCardV2"
import type { PublicGameState } from "../../../../../party/poker"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onFold: () => void
  onCheck: () => void
  onCall: () => void
  onRaise: (amount: number) => void
  onAllIn: () => void
  onNextHand: () => void
  onLeave: () => void
  error: string | null
}

const ROUND_LABELS: Record<string, string> = {
  "pre-flop": "Pre-Flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
}

export function MultiplayerGame({
  gameState,
  playerId,
  isHost,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onAllIn,
  onNextHand,
  onLeave,
  error,
}: MultiplayerGameProps) {
  const myPlayer = gameState.players[playerId]
  const isMyTurn = gameState.currentPlayerId === playerId
  const canAct = isMyTurn && gameState.handInProgress && myPlayer && !myPlayer.folded && !myPlayer.allIn

  const showHandResult = !gameState.handInProgress && gameState.winners.length > 0 && gameState.status !== "finished"
  const showGameOver = gameState.status === "finished"

  return (
    <div
      className="flex flex-col min-h-[calc(100vh-73px)] p-2 sm:p-4"
      style={{
        background: `
          repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0) 0px,
            rgba(0,0,0,0.03) 2px,
            rgba(0,0,0,0) 4px
          ),
          linear-gradient(180deg, #0f1520, #0a1015)
        `,
      }}
    >
      {/* Game Over Modal */}
      {showGameOver && (
        <GameOverModal
          players={gameState.players}
          isHost={isHost}
          onRestart={onNextHand}
          onLeave={onLeave}
        />
      )}

      {/* Hand info bar */}
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="text-xs text-zinc-500">
          <span className="text-zinc-400 font-medium">Hand #{gameState.handNumber}</span>
          {gameState.bettingRound !== "pre-flop" && gameState.bettingRound !== "showdown" && (
            <span
              className="ml-2 uppercase font-bold text-xs px-2 py-0.5 rounded"
              style={{
                background: "rgba(234,179,8,0.1)",
                color: "#fbbf24",
              }}
            >
              {ROUND_LABELS[gameState.bettingRound] || gameState.bettingRound}
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500">
          Blinds: <span className="text-zinc-400 font-mono">{gameState.settings.smallBlind}/{gameState.settings.smallBlind * 2}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center mb-2">
          <span className="text-sm text-red-400 bg-red-900/20 px-3 py-1 rounded-lg">{error}</span>
        </div>
      )}

      {/* Poker Table */}
      <PokerTable gameState={gameState} playerId={playerId} />

      {/* My hole cards (larger display) */}
      {myPlayer && gameState.myHoleCards.length === 2 && !myPlayer.folded && (
        <div className="flex flex-col items-center gap-1 mt-3">
          <div className="flex gap-2">
            <PlayingCard card={gameState.myHoleCards[0]} size="lg" />
            <PlayingCard card={gameState.myHoleCards[1]} size="lg" />
          </div>
          <HandRankDisplay
            holeCards={gameState.myHoleCards}
            communityCards={gameState.communityCards}
            className="mt-1"
          />
        </div>
      )}

      {/* Turn indicator */}
      {gameState.handInProgress && (
        <div className="text-center mt-2">
          {isMyTurn ? (
            <span
              className="inline-block text-sm font-bold px-4 py-1.5 rounded-full"
              style={{
                background: "rgba(234,179,8,0.15)",
                color: "#fbbf24",
                boxShadow: "0 0 12px rgba(234,179,8,0.2)",
                animation: "turnPulse 1.5s ease-in-out infinite",
              }}
            >
              Your Turn!
            </span>
          ) : gameState.currentPlayerId ? (
            <span className="text-sm text-zinc-500">
              Waiting for <span className="text-zinc-300">{gameState.players[gameState.currentPlayerId]?.name || "..."}</span>
            </span>
          ) : null}
        </div>
      )}

      {/* Hand result overlay */}
      {showHandResult && (
        <div className="mt-3">
          <HandResultOverlay
            winners={gameState.winners}
            isHost={isHost}
            onNextHand={onNextHand}
          />
        </div>
      )}

      {/* Betting Controls */}
      {canAct && myPlayer && (
        <div className="mt-3 max-w-md mx-auto w-full">
          <BettingControls
            canAct={true}
            currentBet={myPlayer.currentBet}
            currentBetToMatch={gameState.currentBetToMatch}
            myChips={myPlayer.chips}
            minRaise={gameState.minRaise}
            pot={gameState.pot}
            onFold={onFold}
            onCheck={onCheck}
            onCall={onCall}
            onRaise={onRaise}
            onAllIn={onAllIn}
          />
        </div>
      )}

      <style>{`
        @keyframes turnPulse {
          0%, 100% { box-shadow: 0 0 12px rgba(234,179,8,0.2); }
          50% { box-shadow: 0 0 20px rgba(234,179,8,0.4); }
        }
      `}</style>
    </div>
  )
}
