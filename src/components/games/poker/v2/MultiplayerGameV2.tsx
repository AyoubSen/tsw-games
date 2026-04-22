import { PokerTable } from "./PokerTableV2"
import { BettingControls } from "./BettingControlsV2"
import { HandRankDisplay } from "./HandRankDisplayV2"
import { HandResultOverlay } from "./HandResultOverlayV2"
import { GameOverModal } from "./GameOverModalV2"
import { PlayingCard } from "./PlayingCardV2"
import { PokerHandGuide } from "./PokerHandGuideV2"
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
      style={{ background: "linear-gradient(180deg, #0f1520, #0a1015)" }}
    >
      {showGameOver && (
        <GameOverModal
          players={gameState.players}
          isHost={isHost}
          onRestart={onNextHand}
          onLeave={onLeave}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500 font-mono">Hand {gameState.handNumber}</span>
          {gameState.bettingRound !== "pre-flop" && gameState.bettingRound !== "showdown" && (
            <span className="text-zinc-400 font-medium">
              {ROUND_LABELS[gameState.bettingRound] || gameState.bettingRound}
            </span>
          )}
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-500 font-mono">{gameState.settings.smallBlind}/{gameState.settings.smallBlind * 2}</span>
        </div>
        <PokerHandGuide />
      </div>

      {error && (
        <div className="text-center mb-2">
          <span className="text-sm text-red-400 bg-red-900/20 px-3 py-1 rounded-lg">{error}</span>
        </div>
      )}

      {/* Table */}
      <PokerTable gameState={gameState} playerId={playerId} />

      {/* Your cards */}
      {myPlayer && gameState.myHoleCards.length === 2 && !myPlayer.folded && (
        <div className="flex flex-col items-center gap-1.5 mt-4">
          <div className="flex gap-2">
            <PlayingCard card={gameState.myHoleCards[0]} size="lg" />
            <PlayingCard card={gameState.myHoleCards[1]} size="lg" />
          </div>
          <HandRankDisplay
            holeCards={gameState.myHoleCards}
            communityCards={gameState.communityCards}
          />
        </div>
      )}

      {/* Turn indicator */}
      {gameState.handInProgress && (
        <div className="text-center mt-2">
          {isMyTurn ? (
            <span className="text-sm font-semibold text-amber-400">Your Turn</span>
          ) : gameState.currentPlayerId ? (
            <span className="text-xs text-zinc-600">
              Waiting for {gameState.players[gameState.currentPlayerId]?.name || "..."}
            </span>
          ) : null}
        </div>
      )}

      {/* Hand result */}
      {showHandResult && (
        <div className="mt-3">
          <HandResultOverlay
            winners={gameState.winners}
            isHost={isHost}
            onNextHand={onNextHand}
          />
        </div>
      )}

      {/* Betting */}
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
    </div>
  )
}
