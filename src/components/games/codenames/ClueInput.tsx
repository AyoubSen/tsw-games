import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Send } from "lucide-react"
import type { Team } from "../../../../party/codenames"

interface ClueInputProps {
  team: Team
  maxCardsRemaining: number
  onSubmit: (word: string, count: number) => void
}

export function ClueInput({ team, maxCardsRemaining, onSubmit }: ClueInputProps) {
  const [word, setWord] = useState("")
  const [count, setCount] = useState(1)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (word.trim()) {
      onSubmit(word.trim(), count)
      setWord("")
      setCount(1)
    }
  }

  const isValidWord = word.trim().length > 0 && !word.includes(" ") && !word.includes("-")

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-md mx-auto">
      <div className="text-center">
        <span
          className={cn(
            "font-semibold",
            team === "red" ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
          )}
        >
          Give your team a clue!
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Enter one-word clue..."
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase())}
          className="flex-1 font-mono uppercase"
          autoFocus
        />

        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Count:</span>
          <select
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="h-10 px-2 rounded-md border bg-background text-sm"
          >
            <option value={0}>0 (unlimited)</option>
            {Array.from({ length: Math.min(9, maxCardsRemaining) }, (_, i) => i + 1).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={!isValidWord} className="w-full">
        <Send className="w-4 h-4 mr-2" />
        Give Clue
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Clue must be a single word (no spaces or hyphens). Count 0 = unlimited guesses.
      </p>
    </form>
  )
}
