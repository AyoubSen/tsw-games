import { Eye, UserPlus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface SpectatorInfo { id: string; name: string }

interface WatchingProps {
  spectators: SpectatorInfo[]
  playerId: string
  isHost: boolean
  /** Why the host can't seat anyone right now, or null when they can. */
  seatBlocked: string | null
  onSeat: (spectatorId: string) => void
}

/** "Watching" pill for the game tables; opens the list of spectators, with seat buttons for the host. */
export function WatchingMenu({ spectators, playerId, isHost, seatBlocked, onSeat, className }: WatchingProps & { className?: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const watching = spectators.some((spectator) => spectator.id === playerId)

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

  if (spectators.length === 0) return null
  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${spectators.length} watching`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-11 items-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          watching ? "border-sky-300/50 bg-sky-500/25 hover:bg-sky-500/35" : "border-white/10 bg-black/45 hover:bg-black/60",
          open && !watching && "bg-black/70",
          className,
        )}
      >
        <Eye className="size-4" />
        <span className="tabular-nums">{spectators.length}</span>
        <span className="hidden sm:inline">{watching ? "· You're watching" : "watching"}</span>
        {isHost && !seatBlocked && <span aria-hidden="true" className="size-2 rounded-full bg-amber-300 shadow-[0_0_8px_#fcd34d]" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-white/10 bg-[#0d1520]/95 p-2 text-white shadow-2xl backdrop-blur-md">
          <p className="px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/50">Watching</p>
          <ul className="max-h-60 space-y-0.5 overflow-y-auto">
            {spectators.map((spectator) => (
              <li key={spectator.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-sm">
                <span className="min-w-0 truncate">{spectator.id === playerId ? "You" : spectator.name}</span>
                {isHost && (
                  <button
                    type="button"
                    disabled={Boolean(seatBlocked)}
                    title={seatBlocked ?? `Give ${spectator.name} an empty seat`}
                    onClick={() => onSeat(spectator.id)}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-amber-300 px-2 text-xs font-bold text-[#1a1406] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                  >
                    <UserPlus className="size-3.5" />Seat
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="px-1.5 pt-1.5 text-[11px] leading-snug text-white/50">
            {isHost ? seatBlocked ?? "Seat someone to deal them into the next hand." : watching ? "The host can give you an empty seat between hands." : "They see the table, never your cards."}
          </p>
        </div>
      )}
    </div>
  )
}

/** The same list for the light lobby cards. */
export function WatchingList({ spectators, playerId, isHost, seatBlocked, onSeat }: WatchingProps) {
  if (spectators.length === 0) return null
  const note = isHost ? seatBlocked : spectators.some((spectator) => spectator.id === playerId) ? "You're watching. The host can give you an empty seat." : null
  return (
    <div className="rounded-2xl border p-4 text-sm">
      <p className="flex items-center gap-2 font-bold"><Eye className="h-4 w-4" />Watching</p>
      <ul className="mt-2 space-y-1">
        {spectators.map((spectator) => (
          <li key={spectator.id} className="flex items-center justify-between gap-2">
            <span className="truncate">{spectator.id === playerId ? "You" : spectator.name}</span>
            {isHost && (
              <Button size="sm" variant="outline" disabled={Boolean(seatBlocked)} title={seatBlocked ?? undefined} onClick={() => onSeat(spectator.id)}>
                <UserPlus className="mr-1 h-3.5 w-3.5" />Seat
              </Button>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-muted-foreground">{note}</p>}
    </div>
  )
}
