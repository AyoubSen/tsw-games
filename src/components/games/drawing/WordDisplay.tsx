import { Pencil } from "lucide-react"

interface WordDisplayProps {
  word: string | null
  isDrawer: boolean
  wordLength: number
  isRoundEnd?: boolean
}

export function WordDisplay({
  word,
  isDrawer,
  wordLength,
  isRoundEnd = false,
}: WordDisplayProps) {
  // Round ended - show the word to everyone
  if (isRoundEnd && word) {
    return (
      <div className="text-center py-2">
        <p className="text-sm text-muted-foreground mb-1">The word was:</p>
        <p className="text-2xl font-bold tracking-wider uppercase text-primary">
          {word}
        </p>
      </div>
    )
  }

  // Drawer sees the word
  if (isDrawer && word) {
    return (
      <div className="text-center py-2">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-1">
          <Pencil className="w-4 h-4" />
          <span>Draw this word:</span>
        </div>
        <p className="text-2xl font-bold tracking-wider uppercase text-primary">
          {word}
        </p>
      </div>
    )
  }

  // Guessers see blanks
  return (
    <div className="text-center py-2">
      <p className="text-sm text-muted-foreground mb-1">Guess the word:</p>
      <p className="text-2xl font-bold tracking-[0.3em]">
        {Array.from({ length: wordLength }, (_, i) => (
          <span
            key={i}
            className="inline-block w-4 border-b-2 border-foreground mx-0.5"
          >
            &nbsp;
          </span>
        ))}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {wordLength} letters
      </p>
    </div>
  )
}
