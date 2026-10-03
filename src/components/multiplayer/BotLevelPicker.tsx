import { BOT_LEVEL_LABELS, BOT_LEVELS, type BotLevel } from "@/lib/botLevel"
import { cn } from "@/lib/utils"

/** Easy / Normal / Hard toggle for one bot; read-only for everyone but the host. */
export function BotLevelPicker({ name, level = "normal", disabled, onChange }: { name: string; level?: BotLevel; disabled?: boolean; onChange: (level: BotLevel) => void }) {
  return (
    <div role="radiogroup" aria-label={`${name} difficulty`} className="inline-flex rounded-md border bg-background p-0.5">
      {BOT_LEVELS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={level === option}
          disabled={disabled}
          onClick={() => level !== option && onChange(option)}
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
            level === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground",
          )}
        >
          {BOT_LEVEL_LABELS[option]}
        </button>
      ))}
    </div>
  )
}
