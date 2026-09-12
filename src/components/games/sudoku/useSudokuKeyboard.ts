import { useCallback, useEffect } from 'react'

interface SudokuKeyboardOptions {
  /** When false, no key is handled - e.g. a paused, won or finished board. */
  enabled: boolean
  selectedCell: [number, number] | null
  onSelectCell: (row: number, col: number) => void
  onNumber: (num: number) => void
  onClear: () => void
  onToggleNotes: () => void
}

/**
 * Keyboard control shared by the single-player and multiplayer boards, so the
 * two modes never drift apart:
 *
 *   arrows      move the selection (clamped at the edges)
 *   1-9         enter a number
 *   space       toggle notes mode
 *   0/backspace/delete  clear the cell
 *
 * Space and the arrows are always default-prevented: the cells are real
 * <button>s, so without that, space would re-activate the focused cell and the
 * arrows would scroll the page.
 */
export function useSudokuKeyboard({
  enabled,
  selectedCell,
  onSelectCell,
  onNumber,
  onClear,
  onToggleNotes,
}: SudokuKeyboardOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return

    // Never steal keys from a text field (the join form, chat, etc.).
    const target = e.target as HTMLElement | null
    if (target) {
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
        return
      }
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      onToggleNotes()
      return
    }

    if (e.key.startsWith('Arrow')) {
      e.preventDefault()

      // Arrowing with nothing selected starts at the top-left.
      if (!selectedCell) {
        onSelectCell(0, 0)
        return
      }

      const [row, col] = selectedCell
      let newRow = row
      let newCol = col

      if (e.key === 'ArrowUp') newRow = Math.max(0, row - 1)
      else if (e.key === 'ArrowDown') newRow = Math.min(8, row + 1)
      else if (e.key === 'ArrowLeft') newCol = Math.max(0, col - 1)
      else if (e.key === 'ArrowRight') newCol = Math.min(8, col + 1)

      if (newRow !== row || newCol !== col) onSelectCell(newRow, newCol)
      return
    }

    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      onNumber(Number(e.key))
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      e.preventDefault()
      onClear()
    }
  }, [enabled, selectedCell, onSelectCell, onNumber, onClear, onToggleNotes])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
