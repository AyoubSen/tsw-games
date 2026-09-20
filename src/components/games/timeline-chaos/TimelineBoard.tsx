import { ArrowDown, ArrowUp, CheckCircle2, GripVertical, XCircle } from "lucide-react"
import type { PublicTimelineEvent } from "@/lib/timelineChaos"

const CATEGORY_STYLES = {
  history: "border-amber-500/40 bg-amber-500/10",
  science: "border-cyan-500/40 bg-cyan-500/10",
  culture: "border-violet-500/40 bg-violet-500/10",
}

export function TimelineBoard({
  events,
  order,
  correctOrder,
  revealed,
  disabled,
  onChange,
}: {
  events: PublicTimelineEvent[]
  order: string[]
  correctOrder: string[]
  revealed: boolean
  disabled: boolean
  onChange: (order: string[]) => void
}) {
  const eventMap = new Map(events.map((event) => [event.id, event]))
  const displayOrder = revealed ? correctOrder : order

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= order.length) return
    const next = [...order]
    const [item] = next.splice(from, 1)
    if (!item) return
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {displayOrder.map((id, index) => {
        const event = eventMap.get(id)
        if (!event) return null
        const wasCorrect = order[index] === id
        return (
          <div
            key={id}
            draggable={!disabled}
            onDragStart={(dragEvent) => dragEvent.dataTransfer.setData("text/plain", String(order.indexOf(id)))}
            onDragOver={(dragEvent) => dragEvent.preventDefault()}
            onDrop={(dragEvent) => move(Number(dragEvent.dataTransfer.getData("text/plain")), order.indexOf(id))}
            className={`flex min-h-20 items-center gap-3 rounded-2xl border p-3 transition-all ${CATEGORY_STYLES[event.category]} ${
              revealed ? (wasCorrect ? "ring-1 ring-emerald-500" : "ring-1 ring-rose-500/60") : ""
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/80 text-sm font-black">
              {index + 1}
            </div>
            {!revealed && <GripVertical className="h-5 w-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">{event.title}</p>
              {revealed && (
                <>
                  <p className="mt-1 font-mono text-sm font-black">{event.yearLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{event.fact}</p>
                </>
              )}
            </div>
            {revealed ? (
              wasCorrect ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
            ) : (
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" disabled={disabled || index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${event.title} earlier`} className="rounded-lg border bg-background/70 p-1.5 disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" disabled={disabled || index === order.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${event.title} later`} className="rounded-lg border bg-background/70 p-1.5 disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
