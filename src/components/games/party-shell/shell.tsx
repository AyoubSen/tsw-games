import { ArrowLeft, WifiOff, X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react"
import type { Reaction } from "@/lib/reactions"
import { ReactionPicker } from "@/components/multiplayer/Reactions"
import { SoundToggle } from "@/components/multiplayer/SoundToggle"
import { cn } from "@/lib/utils"

/** Frame of the full-page party-game table: floating glass panels over a dark stage. */

export const GLASS = "rounded-2xl border border-white/10 bg-black/45 shadow-2xl backdrop-blur-md"

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setSize({ w: element.clientWidth, h: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

export function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(timer)
  }, [active, every])
  return now
}

/**
 * Milliseconds since `key` was first rendered (Infinity with no key), so a
 * server beat can be replayed locally. Re-renders every `tick` ms (or once at
 * the end without one) until `duration` has passed.
 */
export function useBeat(key: string | null, duration: number, tick = 0) {
  const seen = useRef<{ key: string | null; at: number }>({ key: null, at: 0 })
  if (seen.current.key !== key) seen.current = { key, at: Date.now() }
  const elapsed = key ? Date.now() - seen.current.at : Infinity
  const done = elapsed >= duration
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!key || done) return
    const wait = tick ? Math.min(tick, duration - elapsed) : duration - elapsed
    const timer = window.setTimeout(() => rerender((n) => n + 1), Math.max(0, wait) + 16)
    return () => window.clearTimeout(timer)
  })
  return elapsed
}

/** Runs `play` whenever `key` changes to a new non-null value, but not on mount, so a reconnect stays quiet. */
export function useSoundCue(key: string | null, play: () => void) {
  const last = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const previous = last.current
    last.current = key
    if (previous !== undefined && key && key !== previous) play()
  })
}

export function PartyTable({ tableRef, background, className, children }: { tableRef: Ref<HTMLDivElement>; background: string; className?: string; children: ReactNode }) {
  return (
    <div ref={tableRef} className={cn("relative h-[calc(100dvh-73px)] overflow-hidden text-white select-none", className)} style={{ background }}>
      {children}
    </div>
  )
}

export function GlassButton({ icon, label, pressed, onClick, badge }: { icon: ReactNode; label: string; pressed?: boolean; onClick: () => void; badge?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(GLASS, "relative flex h-11 min-w-10 items-center justify-center gap-1.5 px-0 text-sm font-semibold transition sm:px-3 hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70", pressed && "border-white/30 bg-white/15")}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-400 ring-2 ring-black" />}
    </button>
  )
}

/** Leave + title on the left, a status panel in the middle, toggles, sound and reactions on the right. */
export function TableTopBar({ title, roomLabel, onLeave, connected, status, actions, onReact, canReact }: {
  title: string
  roomLabel: string
  onLeave: () => void
  connected: boolean
  status: ReactNode
  actions?: ReactNode
  onReact: (reaction: Reaction) => void
  canReact: boolean
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-1.5 p-3 sm:gap-2">
      <button type="button" onClick={onLeave} className={cn(GLASS, "pointer-events-auto flex h-11 w-10 shrink-0 items-center justify-center gap-1.5 text-sm font-semibold transition hover:bg-black/65 sm:w-auto sm:px-3")}>
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">Leave</span>
      </button>
      <div className="hidden pl-2 xl:block">
        <p className="text-lg font-black leading-none tracking-tight">{title}</p>
        {roomLabel && <p className="text-xs text-white/60">Room {roomLabel}</p>}
      </div>
      <div className="pointer-events-auto flex min-w-0 flex-1 justify-center lg:absolute lg:left-1/2 lg:w-[min(460px,40vw)] lg:-translate-x-1/2">
        <div aria-live="polite" className={cn(GLASS, "flex h-11 w-full min-w-0 items-center gap-2 px-2 max-sm:[&>.truncate]:line-clamp-2 max-sm:[&>.truncate]:whitespace-normal max-sm:[&>.truncate]:leading-tight sm:gap-3 sm:px-3")}>
          {status}
          {!connected && <span className="flex shrink-0 items-center gap-1 text-xs text-amber-200"><WifiOff className="size-3.5" /><span className="hidden sm:inline">Reconnecting</span></span>}
        </div>
      </div>
      <div className="pointer-events-auto ml-auto flex shrink-0 items-start gap-1.5 sm:gap-2">
        {actions}
        <SoundToggle className="max-sm:w-10" />
        <ReactionPicker onReact={onReact} disabled={!connected || !canReact} side="bottom" align="end" className="max-sm:w-10" />
      </div>
    </div>
  )
}

/** Panel that slides over the right edge of the table (the log). */
export function SidePanel({ title, icon, onClose, children }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside className={cn(GLASS, "uno-rise absolute bottom-3 right-3 top-[68px] z-40 flex w-[min(360px,calc(100%-24px))] flex-col bg-[#0b111a]/90")}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        {icon}
        <p className="flex-1 text-sm font-bold">{title}</p>
        <button type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} className="grid size-10 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}

/** Round timer ring for the status panel. */
export function TimerRing({ left, limit }: { left: number; limit: number }) {
  const fraction = limit ? Math.min(1, left / limit) : 0
  const hot = left <= 5
  return (
    <span className={cn("relative grid size-9 shrink-0 place-items-center", hot && "animate-pulse")} aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={hot ? "#f87171" : "#fbbf24"}
          strokeDasharray={2 * Math.PI * 15}
          strokeDashoffset={2 * Math.PI * 15 * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="font-mono text-xs font-bold tabular-nums">{left}</span>
    </span>
  )
}
