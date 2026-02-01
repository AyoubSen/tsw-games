import { useRef, useEffect } from "react"
import { ScrollText } from "lucide-react"
import type { EventLogEntry } from "../../../../../party/mafia"

interface EventLogProps {
  events: EventLogEntry[]
}

export function EventLog({ events }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <ScrollText className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-400">Event Log</span>
      </div>
      <div ref={scrollRef} className="max-h-36 overflow-y-auto px-3 py-2 space-y-1">
        {events.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-2">No events yet.</p>
        )}
        {events.map((event) => (
          <p key={event.id} className="text-xs text-zinc-500 italic">
            {event.text}
          </p>
        ))}
      </div>
    </div>
  )
}
