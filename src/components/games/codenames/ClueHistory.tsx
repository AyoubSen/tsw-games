import { cn } from "@/lib/utils"
import type { Clue } from "../../../../party/codenames"

interface ClueHistoryProps {
  clues: Clue[]
}

export function ClueHistory({ clues }: ClueHistoryProps) {
  if (clues.length === 0) return null

  return (
    <div className="w-full max-w-xs">
      <h3 className="text-sm font-medium mb-2">Clue History</h3>
      <div className="h-32 rounded-md border overflow-y-auto">
        <div className="p-2 space-y-1">
          {[...clues].reverse().map((clue, index) => (
            <div
              key={index}
              className={cn(
                "flex items-center justify-between text-xs px-2 py-1 rounded",
                clue.team === "red"
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
              )}
            >
              <span className="font-medium uppercase">{clue.word}</span>
              <span className="font-mono">
                {clue.count === 0 ? "∞" : clue.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
