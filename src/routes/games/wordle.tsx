import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, RotateCcw, Loader2, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Board } from '@/components/games/wordle/Board'
import { Keyboard } from '@/components/games/wordle/Keyboard'
import { useWordle } from '@/components/games/wordle/useWordle'

export const Route = createFileRoute('/games/wordle')({ component: WordlePage })

function WordlePage() {
  const {
    guesses,
    currentGuess,
    currentRow,
    gameStatus,
    usedLetters,
    shake,
    revealRow,
    message,
    answerCount,
    validCount,
    addLetter,
    removeLetter,
    submitGuess,
    resetGame,
    maxGuesses,
    wordLength,
    targetWord,
  } = useWordle()

  const showDialog = gameStatus === 'won' || gameStatus === 'lost'
  const isLoading = gameStatus === 'loading'

  return (
    <div className="min-h-[calc(100vh-73px)] bg-background flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-border">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
        <div className="text-center">
          <h1 className="text-xl font-bold">Wordle</h1>
          {answerCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Database className="w-3 h-3" />
              {answerCount.toLocaleString()} answers / {validCount.toLocaleString()} valid
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={resetGame} disabled={isLoading}>
          <RotateCcw className="w-4 h-4 mr-2" />
          New Game
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading dictionary...</p>
          <p className="text-xs text-muted-foreground">First load fetches from API, then cached locally</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-between py-4 px-2 gap-4">
          {message && (
            <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-lg font-semibold z-50 animate-fade-in">
              {message}
            </div>
          )}

          <div className="flex-1 flex items-center">
            <Board
              guesses={guesses}
              currentGuess={currentGuess}
              currentRow={currentRow}
              shake={shake}
              revealRow={revealRow}
              maxGuesses={maxGuesses}
              wordLength={wordLength}
            />
          </div>

          <div className="w-full px-2">
            <Keyboard
              usedLetters={usedLetters}
              onKey={addLetter}
              onEnter={submitGuess}
              onBackspace={removeLetter}
            />
          </div>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {gameStatus === 'won' ? 'Congratulations!' : 'Game Over'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {gameStatus === 'won' ? (
                <span>
                  You got it in <strong>{currentRow}</strong> {currentRow === 1 ? 'try' : 'tries'}!
                </span>
              ) : (
                <span>
                  The word was <strong className="text-foreground">{targetWord}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button onClick={resetGame} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
            <Button variant="outline" asChild className="w-full">
              <Link to="/">Back to Games</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
