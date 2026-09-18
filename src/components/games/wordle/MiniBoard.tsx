import { cn } from '@/lib/utils'
import type { EvaluatedLetter } from '../../../../party/wordle'

interface MiniBoardProps {
  guesses: EvaluatedLetter[][]
  maxGuesses?: number
  wordLength?: number
  playerName: string
  isCurrentPlayer?: boolean
  highlighted?: boolean // Highlight the last row
  colorblind?: boolean
}

function getMiniTileStyle(state: string, colorblind: boolean): string {
  switch (state) {
    case 'correct':
      return colorblind ? 'bg-blue-600' : 'bg-green-600'
    case 'present':
      return colorblind ? 'bg-orange-500' : 'bg-yellow-500'
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
  colorblind = false,
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
                const letterData = hasGuess ? guess[colIndex] : null
                const state = letterData?.state ?? 'empty'

                return (
                  <div
                    key={colIndex}
                    className={cn(
                      "w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white",
                      getMiniTileStyle(state, colorblind)
                    )}
                  >
                    {letterData?.char ?? ''}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
