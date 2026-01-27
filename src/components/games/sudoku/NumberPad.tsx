import { Pencil, Lightbulb, Undo2, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface NumberPadProps {
  onNumberSelect: (num: number) => void
  onClear: () => void
  onToggleNotes: () => void
  onHint?: () => void
  onUndo: () => void
  notesMode: boolean
  canUndo: boolean
  disabled?: boolean
  showHint?: boolean
}

export function NumberPad({
  onNumberSelect,
  onClear,
  onToggleNotes,
  onHint,
  onUndo,
  notesMode,
  canUndo,
  disabled,
  showHint = true,
}: NumberPadProps) {
  return (
    <div className="space-y-3">
      {/* Number buttons */}
      <div className="grid grid-cols-9 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button
            type="button"
            key={num}
            onClick={() => onNumberSelect(num)}
            disabled={disabled}
            className={`
              aspect-square w-8 sm:w-10 md:w-11
              flex items-center justify-center
              text-base sm:text-lg font-semibold
              rounded-lg border transition-all
              ${disabled
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-card hover:bg-accent hover:border-primary/50 active:scale-95'
              }
            `}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button
          variant={notesMode ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleNotes}
          disabled={disabled}
          className="gap-1.5"
        >
          <Pencil className="w-4 h-4" />
          Notes
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={disabled}
          className="gap-1.5"
        >
          <Eraser className="w-4 h-4" />
          Clear
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          className="gap-1.5"
        >
          <Undo2 className="w-4 h-4" />
          Undo
        </Button>

        {showHint && onHint && (
          <Button
            variant="outline"
            size="sm"
            onClick={onHint}
            disabled={disabled}
            className="gap-1.5"
          >
            <Lightbulb className="w-4 h-4" />
            Hint
          </Button>
        )}
      </div>
    </div>
  )
}
