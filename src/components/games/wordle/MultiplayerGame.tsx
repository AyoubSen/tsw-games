import { useState, useEffect, useCallback } from "react"
import { Copy, Check, Trophy, Users, Clock, X, RotateCcw } from "lucide-react"
import { Board } from "./Board"
import { Keyboard } from "./Keyboard"
import { MiniBoard } from "./MiniBoard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PublicGameState } from "../../../../party/wordle"
import type { Letter, LetterState } from "./useWordle"
import type { RoundReveal } from "./useMultiplayerWordle"

type UsedLetters = Record<string, LetterState>

interface MultiplayerGameProps {
  gameState: PublicGameState
  playerId: string
  isHost: boolean
  onGuess: (word: string, result: string[][]) => void
  onComplete: (won: boolean, attempts: number) => void
  onRestart: () => void
  onLeave: () => void
  validWords: Set<string>
  answerWords: string[]
  waitingFor: string[]
  isWaitingForOthers: boolean
  roundReveal: RoundReveal | null
  onDismissReveal: () => void
}

export function MultiplayerGame({
  gameState,
  playerId,
  isHost,
  onGuess,
  onComplete,
  onRestart,
  onLeave,
  validWords,
  answerWords,
  waitingFor,
  isWaitingForOthers,
  roundReveal,
  onDismissReveal,
}: MultiplayerGameProps) {
  const [guesses, setGuesses] = useState<Letter[][]>(() => Array(6).fill(null).map(() => []))
  const [currentGuess, setCurrentGuess] = useState("")
  const [usedLetters, setUsedLetters] = useState<UsedLetters>({})
  const [shake, setShake] = useState(false)
  const [revealRow, setRevealRow] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [gameStatus, setGameStatus] = useState<"playing" | "won" | "lost">("playing")
  const [currentRow, setCurrentRow] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [copied, setCopied] = useState(false)

  const targetWord = gameState.targetWord || ""
  const maxGuesses = 6
  const wordLength = 5

  const players = Object.values(gameState.players)

  const showMessage = useCallback((msg: string, duration = 1500) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), duration)
  }, [])

  const evaluateGuess = useCallback(
    (guess: string): Letter[] => {
      const result: Letter[] = []
      const targetArr = targetWord.split("")
      const guessArr = guess.split("")
      const used: boolean[] = new Array(wordLength).fill(false)

      // First pass: correct positions
      for (let i = 0; i < wordLength; i++) {
        if (guessArr[i] === targetArr[i]) {
          result[i] = { char: guessArr[i], state: "correct" }
          used[i] = true
        }
      }

      // Second pass: present but wrong position
      for (let i = 0; i < wordLength; i++) {
        if (result[i]) continue
        const idx = targetArr.findIndex((l, j) => l === guessArr[i] && !used[j])
        if (idx !== -1) {
          result[i] = { char: guessArr[i], state: "present" }
          used[idx] = true
        } else {
          result[i] = { char: guessArr[i], state: "absent" }
        }
      }

      return result
    },
    [targetWord, wordLength]
  )

  const submitGuess = useCallback(() => {
    if (gameStatus !== "playing") return
    if (isWaitingForOthers) {
      showMessage("Waiting for other players...")
      return
    }
    if (currentGuess.length !== wordLength) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      showMessage("Not enough letters")
      return
    }

    const guessLower = currentGuess.toLowerCase()
    if (!validWords.has(guessLower) && !answerWords.includes(guessLower)) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      showMessage("Not in word list")
      return
    }

    const result = evaluateGuess(currentGuess)

    // Update guesses array
    setGuesses((prev) => {
      const newGuesses = [...prev]
      newGuesses[currentRow] = result
      return newGuesses
    })
    setRevealRow(currentRow)

    // Update used letters
    const newUsed = { ...usedLetters }
    result.forEach(({ char, state }) => {
      const current = newUsed[char]
      if (state === "correct") {
        newUsed[char] = "correct"
      } else if (state === "present" && current !== "correct") {
        newUsed[char] = "present"
      } else if (!current) {
        newUsed[char] = state
      }
    })
    setUsedLetters(newUsed)

    // Send guess to server
    const resultArray = result.map((r) => [r.char, r.state])
    onGuess(currentGuess, resultArray)

    const newRow = currentRow + 1
    setCurrentGuess("")
    setCurrentRow(newRow)

    // Check win/lose
    setTimeout(() => {
      setRevealRow(null)
      const won = currentGuess === targetWord
      if (won) {
        setGameStatus("won")
        onComplete(true, newRow)
      } else if (newRow >= maxGuesses) {
        setGameStatus("lost")
        onComplete(false, newRow)
      }
    }, wordLength * 300 + 200)
  }, [
    currentGuess,
    currentRow,
    targetWord,
    gameStatus,
    validWords,
    answerWords,
    usedLetters,
    evaluateGuess,
    onGuess,
    onComplete,
    showMessage,
    wordLength,
    maxGuesses,
    isWaitingForOthers,
  ])

  const addLetter = useCallback(
    (letter: string) => {
      if (gameStatus !== "playing") return
      if (isWaitingForOthers) return
      if (currentGuess.length < wordLength) {
        setCurrentGuess((prev) => prev + letter.toUpperCase())
      }
    },
    [currentGuess, gameStatus, wordLength, isWaitingForOthers]
  )

  const removeLetter = useCallback(() => {
    if (gameStatus !== "playing") return
    setCurrentGuess((prev) => prev.slice(0, -1))
  }, [gameStatus])

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (gameStatus !== "playing") return
      if (e.key === "Enter") {
        submitGuess()
      } else if (e.key === "Backspace") {
        removeLetter()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        addLetter(e.key)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [submitGuess, addLetter, removeLetter, gameStatus])

  // Show results when game is finished
  useEffect(() => {
    if (gameState.status === "finished") {
      setShowResults(true)
    }
  }, [gameState.status])

  const copyInviteCode = async () => {
    await navigator.clipboard.writeText(gameState.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getModeLabel = () => {
    if (gameState.mode === "race") {
      return "Race"
    }
    // Classic mode - show reveal timing
    if (gameState.revealMode === "after-round") {
      return "Classic (Rounds)"
    }
    return "Classic (Hidden)"
  }

  const winner = gameState.winnerId ? gameState.players[gameState.winnerId] : null

  return (
    <div className="min-h-[calc(100vh-73px)] bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="secondary">{getModeLabel()}</Badge>
          <div className="flex items-center gap-1">
            <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
              {gameState.roomCode}
            </code>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyInviteCode}>
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onLeave}>
            <X className="w-4 h-4 mr-1" />
            Leave
          </Button>
        </div>

        {/* Players status bar */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <Users className="w-4 h-4 text-muted-foreground shrink-0" />
          {players.map((player) => (
            <div
              key={player.id}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs shrink-0 ${
                player.id === playerId
                  ? "bg-primary/20 text-primary"
                  : player.completed
                    ? player.won
                      ? "bg-green-500/20 text-green-600"
                      : "bg-red-500/20 text-red-600"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="font-medium">{player.name}</span>
              {gameState.mode === "race" && !player.completed && (
                <span className="opacity-70">({player.attempts}/6)</span>
              )}
              {player.completed && (
                <span>
                  {player.won ? (
                    <Trophy className="w-3 h-3" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Waiting indicator for classic mode with after-round reveal */}
        {gameState.mode === "classic" && gameState.revealMode === "after-round" && gameState.status === "playing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>Round {gameState.currentTurn + 1} of 6</span>
            {isWaitingForOthers && waitingFor.length > 0 && (
              <span className="text-yellow-500">
                — Waiting for: {waitingFor.join(", ")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Message toast */}
      {message && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2 rounded-lg font-semibold z-50 animate-fade-in">
          {message}
        </div>
      )}

      {/* Game board and keyboard */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-4 px-4">
        <Board
          guesses={guesses}
          currentGuess={currentGuess}
          currentRow={currentRow}
          shake={shake}
          revealRow={revealRow}
          maxGuesses={maxGuesses}
          wordLength={wordLength}
        />

        <div className="w-full max-w-lg">
          <Keyboard
            usedLetters={usedLetters}
            onKey={addLetter}
            onEnter={submitGuess}
            onBackspace={removeLetter}
          />
        </div>
      </div>

      {/* Results dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {winner ? (
                winner.id === playerId ? (
                  "You Won!"
                ) : (
                  `${winner.name} Won!`
                )
              ) : (
                "Game Over"
              )}
            </DialogTitle>
            <DialogDescription className="text-center">
              The word was <strong className="text-foreground">{targetWord}</strong>
            </DialogDescription>
          </DialogHeader>

          {/* Results table */}
          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium text-center">Results</p>
            <div className="space-y-1">
              {players
                .sort((a, b) => {
                  // Winners first, sorted by attempts
                  if (a.won && !b.won) return -1
                  if (!a.won && b.won) return 1
                  return a.attempts - b.attempts
                })
                .map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      player.id === playerId ? "bg-primary/10" : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium w-6">{index + 1}.</span>
                      <span className="font-medium">{player.name}</span>
                      {player.id === playerId && (
                        <Badge variant="outline" className="text-xs">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {player.won ? (
                        <>
                          <Trophy className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm">{player.attempts}/6</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Failed</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            {isHost ? (
              <Button onClick={onRestart} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Play Again
              </Button>
            ) : (
              <p className="text-sm text-center text-muted-foreground">
                Waiting for host to start a new game...
              </p>
            )}
            <Button onClick={onLeave} variant="outline" className="w-full">
              Back to Menu
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Round reveal modal - shows after each round in classic mode */}
      <Dialog open={roundReveal !== null} onOpenChange={(open) => !open && onDismissReveal()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center">
              Round {roundReveal?.turn} Complete
            </DialogTitle>
            <DialogDescription className="text-center">
              Here's how everyone is doing
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap justify-center gap-6 py-2">
            {players.map((player) => (
              <MiniBoard
                key={player.id}
                guesses={player.guesses as string[][]}
                playerName={player.name}
                isCurrentPlayer={player.id === playerId}
                highlighted={true}
              />
            ))}
          </div>

          <Button onClick={onDismissReveal} className="w-full mt-2">
            Continue
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
