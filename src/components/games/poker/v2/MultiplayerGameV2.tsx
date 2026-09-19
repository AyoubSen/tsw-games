import { useMemo } from "react"
import { PokerTable } from "./PokerTableV2"
import { BettingControls } from "./BettingControlsV2"
import { HandRankDisplay } from "./HandRankDisplayV2"
import { HandResultOverlay } from "./HandResultOverlayV2"
import { GameOverModal } from "./GameOverModalV2"
import { PlayingCard } from "./PlayingCardV2"
import { PokerHandGuide } from "./PokerHandGuideV2"
import { evaluateBestHand } from "@/lib/poker/handEvaluator"
import { cn } from "@/lib/utils"
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
  const me = gameState.players[playerId]
  const isMyTurn = gameState.currentPlayerId === playerId
  const canAct =
    isMyTurn && gameState.handInProgress && !!me && !me.folded && !me.allIn

  const showHandResult =
    !gameState.handInProgress &&
    gameState.winners.length > 0 &&
    gameState.status !== "finished"
  const showGameOver = gameState.status === "finished"

  const holeCards = gameState.myHoleCards
  const hasCards = holeCards.length === 2 && me && !me.folded
  const bigBlind = gameState.settings.smallBlind * 2
  const waitingOn =
    gameState.currentPlayerId && !isMyTurn
      ? gameState.players[gameState.currentPlayerId]?.name
      : null

  // Lets the rankings guide mark the hand we are actually holding.
  const currentCategory = useMemo(() => {
    if (!hasCards || gameState.communityCards.length < 3) return null
    return evaluateBestHand(holeCards, gameState.communityCards).category
  }, [hasCards, holeCards, gameState.communityCards])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0d1117] text-white">
      {showGameOver && (
        <GameOverModal
          players={gameState.players}
          isHost={isHost}
          onRestart={onNextHand}
          onLeave={onLeave}
        />
      )}

      {/* Status strip */}
      <div className="flex shrink-0 items-center justify-between px-4 py-2 text-[11px]">
        <div className="flex items-center gap-2 text-white/35">
          <span className="font-mono">Hand {gameState.handNumber}</span>
          <span className="text-white/15">•</span>
          <span className="font-mono">
            {gameState.settings.smallBlind}/{bigBlind}
          </span>
        </div>
        <PokerHandGuide currentCategory={currentCategory} />
      </div>

      {/* Table — sized by the space left over, so the dock is always on screen */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2">
        <PokerTable gameState={gameState} playerId={playerId} />
      </div>

      {/* Player dock */}
      <div className="shrink-0 border-t border-white/[0.07] bg-black/30 px-4 pb-4 pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md space-y-3">
          {error && (
            <p className="rounded-lg bg-red-500/15 px-3 py-2 text-center text-xs text-red-300">
              {error}
            </p>
          )}

          {/* My hand + stack */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {hasCards ? (
                <>
                  <PlayingCard card={holeCards[0]} size="lg" />
                  <PlayingCard card={holeCards[1]} size="lg" />
                </>
              ) : (
                <>
                  <PlayingCard card={null} faceDown size="lg" dimmed />
                  <PlayingCard card={null} faceDown size="lg" dimmed />
                </>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-semibold">
                  {me?.name ?? "You"}
                </span>
                {me?.folded && (
                  <span className="text-[10px] uppercase tracking-wide text-white/30">
                    Folded
                  </span>
                )}
                {me?.allIn && (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-300">
                    All in
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xl font-bold tabular-nums text-amber-300">
                  {(me?.chips ?? 0).toLocaleString()}
                </span>
                {!!me?.currentBet && (
                  <span className="font-mono text-xs tabular-nums text-white/40">
                    bet {me.currentBet.toLocaleString()}
                  </span>
                )}
              </div>

              {hasCards && (
                <HandRankDisplay
                  holeCards={holeCards}
                  communityCards={gameState.communityCards}
                />
              )}
            </div>
          </div>

          {/* Turn banner */}
          {gameState.handInProgress && !showHandResult && (
            <p
              className={cn(
                "text-center text-xs font-medium",
                isMyTurn ? "text-amber-400" : "text-white/30",
              )}
            >
              {isMyTurn
                ? "Your turn"
                : waitingOn
                  ? `Waiting for ${waitingOn}`
                  : ""}
            </p>
          )}

          {showHandResult ? (
            <HandResultOverlay
              winners={gameState.winners}
              isHost={isHost}
              onNextHand={onNextHand}
            />
          ) : (
            me && (
              <BettingControls
                canAct={canAct}
                currentBet={me.currentBet}
                currentBetToMatch={gameState.currentBetToMatch}
                myChips={me.chips}
                minRaise={gameState.minRaise}
                pot={gameState.pot}
                onFold={onFold}
                onCheck={onCheck}
                onCall={onCall}
                onRaise={onRaise}
                onAllIn={onAllIn}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
