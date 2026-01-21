import { cn } from '@/lib/utils'
import { Delete } from 'lucide-react'
import type { LetterState } from './useWordle'

interface KeyboardProps {
  usedLetters: Record<string, LetterState>
  onKey: (key: string) => void
  onEnter: () => void
  onBackspace: () => void
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
]

function getKeyStyle(state?: LetterState): string {
  switch (state) {
    case 'correct':
      return 'bg-green-600 hover:bg-green-700 text-white border-green-600'
    case 'present':
      return 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500'
    case 'absent':
      return 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400 border-zinc-700'
    default:
      return 'bg-zinc-500 hover:bg-zinc-400 text-white border-zinc-500'
  }
}

export function Keyboard({ usedLetters, onKey, onEnter, onBackspace }: KeyboardProps) {
  const handleClick = (key: string) => {
    if (key === 'ENTER') {
      onEnter()
    } else if (key === 'BACKSPACE') {
      onBackspace()
    } else {
      onKey(key)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-lg mx-auto">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1 justify-center">
          {row.map((key) => {
            const isSpecial = key === 'ENTER' || key === 'BACKSPACE'
            const state = isSpecial ? undefined : usedLetters[key]

            return (
              <button
                key={key}
                onClick={() => handleClick(key)}
                className={cn(
                  'h-14 rounded font-semibold text-sm uppercase transition-colors border',
                  isSpecial ? 'px-2 sm:px-4 min-w-[52px] sm:min-w-[65px]' : 'w-8 sm:w-10',
                  getKeyStyle(state)
                )}
              >
                {key === 'BACKSPACE' ? (
                  <Delete className="w-5 h-5 mx-auto" />
                ) : key === 'ENTER' ? (
                  <span className="text-xs">ENTER</span>
                ) : (
                  key
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
