import { cn } from "@/lib/utils"
import { Board } from "./Board"
import { TeamPanel } from "./TeamPanel"
import { ClueInput } from "./ClueInput"
import { ClueDisplay } from "./ClueDisplay"
import { ClueHistory } from "./ClueHistory"
import { GameOverModal } from "./GameOverModal"
import type { PublicGameState } from "../../../../party/codenames"

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isSpymaster: boolean
  isHost: boolean
  onGiveClue: (word: string, count: number) => void
  onGuess: (cardIndex: number) => void
  onEndGuessing: () => void
  onRestart: () => void
  onLeave: () => void
  error: string | null
}

export function MultiplayerGame({
  gameState,
  playerId,
  isSpymaster,
  isHost,
  onGiveClue,
  onGuess,
  onEndGuessing,
  onRestart,
  onLeave,
  error,
}: MultiplayerGameProps) {
  const players = Object.values(gameState.players)
  const currentPlayer = gameState.players[playerId]

  const redPlayers = players.filter((p) => p.team === "red")
  const bluePlayers = players.filter((p) => p.team === "blue")

  const currentTurn = gameState.currentTurn
  const isMyTeamsTurn = currentTurn && currentPlayer?.team === currentTurn.team
  const isGivingClue = currentTurn?.phase === "giving-clue"
  const isGuessing = currentTurn?.phase === "guessing"

  // Can I give a clue?
  const canGiveClue = isMyTeamsTurn && isGivingClue && isSpymaster

  // Can I guess?
  const canGuess =
    isMyTeamsTurn &&
    isGuessing &&
    !isSpymaster &&
    currentPlayer?.role === "guesser"

  // Can I end guessing?
  const canEndGuessing = isMyTeamsTurn && isGuessing && currentPlayer?.role === "guesser"

  const getTurnMessage = () => {
    if (!currentTurn) return ""

    const teamName = currentTurn.team.charAt(0).toUpperCase() + currentTurn.team.slice(1)
    const isMyTurn = isMyTeamsTurn

    if (isGivingClue) {
      if (isMyTurn && isSpymaster) {
        return "Your turn to give a clue!"
      }
      if (isMyTurn) {
        return "Waiting for your Spymaster to give a clue..."
      }
      return `${teamName} Spymaster is thinking...`
    }

    if (isGuessing) {
      if (isMyTurn && !isSpymaster) {
        return "Your team is guessing!"
      }
      if (isMyTurn) {
        return "Your team is guessing. Watch and hope!"
      }
      return `${teamName} team is guessing...`
    }

    return ""
  }

  const cardsRemaining =
    currentTurn?.team === "red" ? gameState.redCardsRemaining : gameState.blueCardsRemaining

  return (
    <div className="flex flex-col min-h-[calc(100vh-73px)] p-2 sm:p-4">
      {/* Game Over Modal */}
      {gameState.status === "finished" && gameState.winner && (
        <GameOverModal
          winner={gameState.winner}
          winReason={gameState.winReason}
          isHost={isHost}
          onRestart={onRestart}
          onLeave={onLeave}
        />
      )}

      {/* Top: Team Panels */}
      <div className="flex gap-2 sm:gap-4 mb-4">
        <div className="flex-1">
          <TeamPanel
            team="red"
            players={redPlayers}
            cardsRemaining={gameState.redCardsRemaining}
            isCurrentTurn={currentTurn?.team === "red"}
            playerId={playerId}
          />
        </div>
        <div className="flex-1">
          <TeamPanel
            team="blue"
            players={bluePlayers}
            cardsRemaining={gameState.blueCardsRemaining}
            isCurrentTurn={currentTurn?.team === "blue"}
            playerId={playerId}
          />
        </div>
      </div>

      {/* Turn Message */}
      <div className="text-center mb-3">
        <span
          className={cn(
            "text-sm font-medium",
            currentTurn?.team === "red"
              ? "text-red-600 dark:text-red-400"
              : "text-blue-600 dark:text-blue-400"
          )}
        >
          {getTurnMessage()}
        </span>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-center mb-3">
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Middle: Clue Area */}
      <div className="mb-4">
        {canGiveClue && currentTurn && (
          <ClueInput
            team={currentTurn.team}
            maxCardsRemaining={cardsRemaining || 9}
            onSubmit={onGiveClue}
          />
        )}

        {isGuessing && currentTurn?.clue && (
          <ClueDisplay
            clue={currentTurn.clue}
            guessesRemaining={currentTurn.guessesRemaining}
            guessedThisTurn={currentTurn.guessedThisTurn.length}
            canEndGuessing={canEndGuessing}
            onEndGuessing={onEndGuessing}
          />
        )}

        {isGivingClue && !canGiveClue && (
          <div className="text-center text-muted-foreground">
            Waiting for clue...
          </div>
        )}
      </div>

      {/* Main: Game Board */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <Board
            cards={gameState.board}
            isSpymaster={isSpymaster}
            canGuess={canGuess}
            onGuess={onGuess}
          />
        </div>

        {/* Side: Clue History (desktop) */}
        <div className="hidden lg:block">
          <ClueHistory clues={gameState.clueHistory} />
        </div>
      </div>

      {/* Bottom: Clue History (mobile) */}
      <div className="mt-4 lg:hidden flex justify-center">
        <ClueHistory clues={gameState.clueHistory} />
      </div>
    </div>
  )
}
