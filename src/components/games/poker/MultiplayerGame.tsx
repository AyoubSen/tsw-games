import { PokerTable } from "./PokerTable"
import { BettingControls } from "./BettingControls"
import { HandRankDisplay } from "./HandRankDisplay"
import { HandResultOverlay } from "./HandResultOverlay"
import { GameOverModal } from "./GameOverModal"
import { PlayingCard } from "./PlayingCard"
import { PokerHandGuide } from "./PokerHandGuide"
import type { PublicGameState } from "../../../../party/poker"

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
    <div className="flex flex-col min-h-[calc(100vh-73px)] p-2 sm:p-4">
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
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>Hand #{gameState.handNumber}</span>
          {gameState.bettingRound !== "pre-flop" && gameState.bettingRound !== "showdown" && (
            <span className="uppercase font-medium text-foreground">
              {gameState.bettingRound}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PokerHandGuide />
          <div className="text-xs text-muted-foreground">
            Blinds: {gameState.settings.smallBlind}/{gameState.settings.smallBlind * 2}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center mb-2">
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Poker Table */}
      <PokerTable gameState={gameState} playerId={playerId} />

      {/* My hole cards (larger display) */}
      {myPlayer && gameState.myHoleCards.length === 2 && !myPlayer.folded && (
        <div className="flex flex-col items-center gap-1 mt-2">
          <div className="flex gap-1.5">
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
            <span className="text-sm font-medium text-primary">Your turn!</span>
          ) : gameState.currentPlayerId ? (
            <span className="text-sm text-muted-foreground">
              Waiting for {gameState.players[gameState.currentPlayerId]?.name || "..."}
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

    </div>
  )
}
