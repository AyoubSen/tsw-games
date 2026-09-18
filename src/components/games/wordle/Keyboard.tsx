import { cn } from '@/lib/utils'
import { Delete } from 'lucide-react'
import type { LetterState } from './useWordle'

interface KeyboardProps {
  usedLetters: Record<string, LetterState>
  onKey: (key: string) => void
  onEnter: () => void
  onBackspace: () => void
  colorblind?: boolean
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE'],
]

function getKeyStyle(state: LetterState | undefined, colorblind: boolean): string {
  switch (state) {
    case 'correct':
      return colorblind
        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-600'
        : 'bg-green-600 hover:bg-green-500 text-white border-green-600'
    case 'present':
      return colorblind
        ? 'bg-orange-500 hover:bg-orange-400 text-white border-orange-500'
        : 'bg-yellow-500 hover:bg-yellow-400 text-white border-yellow-500'
    case 'absent':
      return 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400 border-zinc-700'
    default:
      return 'bg-zinc-500 hover:bg-zinc-400 text-white border-zinc-500'
  }
}

export function Keyboard({ usedLetters, onKey, onEnter, onBackspace, colorblind = false }: KeyboardProps) {
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-1.5">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={cn(
            'grid w-full gap-[3px]',
            rowIndex === 1 && 'mx-[5%] w-[90%]',
          )}
          style={{
            gridTemplateColumns: rowIndex === 2
              ? '1.5fr repeat(7, minmax(0, 1fr)) 1.5fr'
              : `repeat(${row.length}, minmax(0, 1fr))`,
          }}
        >
          {row.map((key) => {
            const isSpecial = key === 'ENTER' || key === 'BACKSPACE'
            const state = isSpecial ? undefined : usedLetters[key]

            return (
              <button
                key={key}
                onClick={() => handleClick(key)}
                className={cn(
                  'h-14 min-w-0 touch-manipulation select-none rounded-md border text-[15px] font-semibold uppercase transition active:scale-[0.97]',
                  getKeyStyle(state, colorblind)
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
