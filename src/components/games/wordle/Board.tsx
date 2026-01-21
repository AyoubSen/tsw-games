import { cn } from '@/lib/utils'
import type { Letter, LetterState } from './useWordle'

interface BoardProps {
  guesses: Letter[][]
  currentGuess: string
  currentRow: number
  shake: boolean
  revealRow: number | null
  maxGuesses: number
  wordLength: number
}

function getTileStyle(state: LetterState): string {
  switch (state) {
    case 'correct':
      return 'bg-green-600 border-green-600 text-white'
    case 'present':
      return 'bg-yellow-500 border-yellow-500 text-white'
    case 'absent':
      return 'bg-zinc-700 border-zinc-700 text-white'
    case 'tbd':
      return 'border-zinc-500 text-foreground'
    default:
      return 'border-zinc-700'
  }
}

interface TileProps {
  letter?: Letter
  char?: string
  isCurrentRow?: boolean
  index: number
  shouldReveal: boolean
}

function Tile({ letter, char, isCurrentRow, index, shouldReveal }: TileProps) {
  const displayChar = letter?.char || char || ''
  const state = letter?.state || (char ? 'tbd' : 'empty')
  const hasLetter = displayChar !== ''

  return (
    <div
      className={cn(
        'w-14 h-14 sm:w-16 sm:h-16 border-2 flex items-center justify-center text-2xl sm:text-3xl font-bold uppercase transition-all',
        getTileStyle(state),
        hasLetter && isCurrentRow && 'scale-105',
        shouldReveal && 'animate-flip',
      )}
      style={{
        animationDelay: shouldReveal ? `${index * 300}ms` : undefined,
      }}
    >
      {displayChar}
    </div>
  )
}

export function Board({
  guesses,
  currentGuess,
  currentRow,
  shake,
  revealRow,
  maxGuesses,
  wordLength,
}: BoardProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: maxGuesses }).map((_, rowIndex) => {
        const isCurrentRow = rowIndex === currentRow
        const guess = guesses[rowIndex]
        const hasGuess = guess && guess.length > 0
        const shouldReveal = revealRow === rowIndex

        return (
          <div
            key={rowIndex}
            className={cn(
              'flex gap-1.5 justify-center',
              shake && isCurrentRow && 'animate-shake'
            )}
          >
            {Array.from({ length: wordLength }).map((_, colIndex) => {
              if (hasGuess) {
                return (
                  <Tile
                    key={colIndex}
                    letter={guess[colIndex]}
                    index={colIndex}
                    shouldReveal={shouldReveal}
                  />
                )
              }

              if (isCurrentRow) {
                return (
                  <Tile
                    key={colIndex}
                    char={currentGuess[colIndex]}
                    isCurrentRow
                    index={colIndex}
                    shouldReveal={false}
                  />
                )
              }

              return (
                <Tile
                  key={colIndex}
                  index={colIndex}
                  shouldReveal={false}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
