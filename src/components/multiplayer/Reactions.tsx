import { SmilePlus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { isWordReaction, REACTION_COOLDOWN_MS, REACTION_SHOW_MS, REACTIONS, type Reaction, type ReactionMessage } from "@/lib/reactions"
import { cn } from "@/lib/utils"

export interface ReactionBubbleState { reaction: Reaction; key: number }
export type ReactionBubbles = Record<string, ReactionBubbleState>

/** Live reaction bubbles by player id, fed by the room's `reaction` messages. */
export function useReactionBubbles() {
  const [bubbles, setBubbles] = useState<ReactionBubbles>({})
  const timers = useRef(new Set<number>())
  const seq = useRef(0)

  const later = useCallback((ms: number, run: () => void) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      run()
    }, ms)
    timers.current.add(timer)
  }, [])

  const receive = useCallback((message: ReactionMessage) => {
    later(Math.max(0, message.delayMs ?? 0), () => {
      const key = ++seq.current
      setBubbles((current) => ({ ...current, [message.playerId]: { reaction: message.reaction, key } }))
      later(REACTION_SHOW_MS, () => setBubbles((current) => {
        if (current[message.playerId]?.key !== key) return current
        const { [message.playerId]: _gone, ...rest } = current
        return rest
      }))
    })
  }, [later])

  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current.clear()
    setBubbles({})
  }, [])

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  return { bubbles, receive, clear }
}

const BUBBLE_SIDE = {
  top: { at: "bottom-full left-1/2 mb-2 -translate-x-1/2", tail: "left-1/2 top-full -ml-1.5 border-x-[6px] border-t-[7px] border-x-transparent border-t-white" },
  bottom: { at: "top-full left-1/2 mt-2 -translate-x-1/2", tail: "left-1/2 bottom-full -ml-1.5 border-x-[6px] border-b-[7px] border-x-transparent border-b-white" },
  right: { at: "left-full top-1/2 ml-3 -translate-y-1/2", tail: "right-full top-1/2 -mt-1.5 border-y-[6px] border-r-[7px] border-y-transparent border-r-white" },
}

/** Speech bubble beside its (positioned) parent; remounts per reaction so the pop replays. */
export function ReactionBubble({ bubble, side = "top", className }: { bubble: ReactionBubbleState | undefined; side?: keyof typeof BUBBLE_SIDE; className?: string }) {
  if (!bubble) return null
  const word = isWordReaction(bubble.reaction)
  return (
    <span role="status" className={cn("pointer-events-none absolute z-30", BUBBLE_SIDE[side].at, className)}>
      <span
        key={bubble.key}
        className={cn(
          "reaction-bubble relative block whitespace-nowrap rounded-2xl border border-white/20 bg-white text-[#141416] shadow-[0_6px_20px_rgb(0_0_0/.45)]",
          word ? "px-2.5 py-1 text-xs font-black uppercase tracking-wide" : "px-2 py-0.5 text-2xl leading-8",
        )}
      >
        {bubble.reaction}
        <span aria-hidden="true" className={cn("absolute", BUBBLE_SIDE[side].tail)} />
      </span>
    </span>
  )
}

/** Emote button with the reaction tray; it greys out for the cooldown after each send. */
export function ReactionPicker({ onReact, disabled, align = "center", side = "top", className }: {
  onReact: (reaction: Reaction) => void
  disabled?: boolean
  align?: "start" | "center" | "end"
  side?: "top" | "bottom"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [coolingUntil, setCoolingUntil] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const cooling = coolingUntil > 0

  useEffect(() => {
    if (!cooling) return
    const timer = window.setTimeout(() => setCoolingUntil(0), Math.max(0, coolingUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [cooling, coolingUntil])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [open])

  const pick = (reaction: Reaction) => {
    setOpen(false)
    if (cooling) return
    onReact(reaction)
    setCoolingUntil(Date.now() + REACTION_COOLDOWN_MS)
  }

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-label="React"
        aria-expanded={open}
        title={cooling ? "Wait a moment to react again" : "React"}
        disabled={disabled || cooling}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "grid size-11 place-items-center rounded-2xl border border-white/10 bg-black/45 text-white shadow-2xl backdrop-blur-md transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-45",
          open && "bg-black/70",
          className,
        )}
      >
        <SmilePlus className="size-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Reactions"
          className={cn(
            "uno-rise absolute z-50 w-[236px] space-y-1 rounded-2xl border border-white/10 bg-[#0d1520]/95 p-1.5 shadow-2xl backdrop-blur-md",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
        >
          {[REACTIONS.filter((reaction) => !isWordReaction(reaction)), REACTIONS.filter(isWordReaction)].map((row, index) => (
            <div key={index} className="flex gap-1">
              {row.map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(reaction)}
                  className={cn(
                    "grid h-11 flex-1 place-items-center rounded-xl text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    index ? "text-[11px] font-black uppercase tracking-wide" : "text-2xl hover:scale-110",
                  )}
                >
                  {reaction}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
