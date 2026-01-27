import type { Cell } from './useSudoku'

interface SudokuBoardProps {
  board: Cell[][]
  selectedCell: [number, number] | null
  onCellSelect: (row: number, col: number) => void
  disabled?: boolean
}

export function SudokuBoard({ board, selectedCell, onCellSelect, disabled }: SudokuBoardProps) {
  const selectedValue = selectedCell ? board[selectedCell[0]][selectedCell[1]].value : null

  return (
    <div className="grid grid-cols-9 gap-0 border-2 border-foreground bg-background">
      {board.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const isSelected = selectedCell?.[0] === rowIndex && selectedCell?.[1] === colIndex
          const isInSameRow = selectedCell?.[0] === rowIndex
          const isInSameCol = selectedCell?.[1] === colIndex
          const isInSameBox =
            selectedCell &&
            Math.floor(selectedCell[0] / 3) === Math.floor(rowIndex / 3) &&
            Math.floor(selectedCell[1] / 3) === Math.floor(colIndex / 3)
          const isHighlighted = selectedValue && cell.value === selectedValue && !isSelected

          // Box borders
          const borderRight = colIndex === 2 || colIndex === 5 ? 'border-r-2 border-r-foreground' : 'border-r border-r-border'
          const borderBottom = rowIndex === 2 || rowIndex === 5 ? 'border-b-2 border-b-foreground' : 'border-b border-b-border'

          return (
            <button
              type="button"
              key={`${rowIndex}-${colIndex}`}
              onClick={() => !disabled && onCellSelect(rowIndex, colIndex)}
              disabled={disabled}
              className={`
                aspect-square w-8 sm:w-10 md:w-11 flex items-center justify-center
                text-sm sm:text-base md:text-lg font-medium
                transition-colors duration-100
                ${borderRight}
                ${borderBottom}
                ${isSelected ? 'bg-primary/40 ring-2 ring-primary ring-inset' : ''}
                ${!isSelected && (isInSameRow || isInSameCol || isInSameBox) ? 'bg-primary/10' : ''}
                ${isHighlighted ? 'bg-primary/35 font-bold' : ''}
                ${cell.isInitial ? 'text-foreground font-semibold' : 'text-primary'}
                ${cell.isError ? 'text-destructive bg-destructive/20 font-bold' : ''}
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-primary/15'}
              `}
            >
              {cell.value !== null ? (
                cell.value
              ) : cell.notes.size > 0 ? (
                <div className="grid grid-cols-3 gap-0 text-[6px] sm:text-[8px] text-muted-foreground w-full h-full p-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <span
                      key={num}
                      className="flex items-center justify-center"
                    >
                      {cell.notes.has(num) ? num : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          )
        })
      )}
    </div>
  )
}
