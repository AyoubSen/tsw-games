import { cn } from '@/lib/utils'

interface MiniBoardProps {
  // Array of guesses, each guess is an array of [char, state] pairs
  guesses: string[][]
  maxGuesses?: number
  wordLength?: number
  playerName: string
  isCurrentPlayer?: boolean
  highlighted?: boolean // Highlight the last row
}

function getMiniTileStyle(state: string): string {
  switch (state) {
    case 'correct':
      return 'bg-green-600'
    case 'present':
      return 'bg-yellow-500'
    case 'absent':
      return 'bg-zinc-700'
    default:
      return 'bg-zinc-800'
  }
}

export function MiniBoard({
  guesses,
  maxGuesses = 6,
  wordLength = 5,
  playerName,
  isCurrentPlayer,
  highlighted,
}: MiniBoardProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className={cn(
        "text-xs font-medium truncate max-w-[80px]",
        isCurrentPlayer && "text-primary"
      )}>
        {playerName}
        {isCurrentPlayer && " (You)"}
      </p>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: maxGuesses }).map((_, rowIndex) => {
          const guess = guesses[rowIndex]
          const hasGuess = guess && guess.length > 0
          const isLastGuess = highlighted && rowIndex === guesses.length - 1 && hasGuess

          return (
            <div
              key={rowIndex}
              className={cn(
                "flex gap-0.5",
                isLastGuess && "ring-2 ring-primary ring-offset-1 ring-offset-background rounded-sm"
              )}
            >
              {Array.from({ length: wordLength }).map((_, colIndex) => {
                // Each guess element is [char, state]
                const letterData = hasGuess ? guess[colIndex] : null
                const state = letterData ? letterData[1] : 'empty'

                return (
                  <div
                    key={colIndex}
                    className={cn(
                      "w-4 h-4 rounded-sm",
                      getMiniTileStyle(state)
                    )}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
