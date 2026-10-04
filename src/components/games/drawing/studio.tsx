import { ChevronLeft, ChevronRight, LogOut, Play, RotateCcw, Trophy, X } from "lucide-react"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import type { ReactionBubbles } from "@/components/multiplayer/Reactions"
import { ReactionBubble } from "@/components/multiplayer/Reactions"
import { cn } from "@/lib/utils"
import type { Stroke } from "../../../../party/drawing"
import { GLASS } from "../party-shell/shell"
import { PartyAvatar } from "../party-shell/SeatRing"
import { Podium, type ScoreRow } from "../party-shell/Scoreboard"
import { DrawingView } from "./Canvas"
import { strokeWeight } from "./paint"

/** Dim studio wall with a warm pool of lamp light where the easel stands. */
export const STUDIO_BG =
  "radial-gradient(ellipse 70% 55% at 50% 38%, #3a3226 0%, #221e1a 45%, #121214 75%, #0a0a0c 100%)"

const WOOD = "linear-gradient(90deg, #6e4521 0%, #a8733f 35%, #c48d55 55%, #8a5a2c 100%)"
const LEDGE = "linear-gradient(180deg, #c99158 0%, #9c6633 55%, #6e4521 100%)"

/** Largest 3:2 sheet that fits in `w`×`h`. */
export function fitSheet(w: number, h: number) {
  const width = Math.max(0, Math.min(w, h * 1.5))
  return { width, height: width / 1.5 }
}

/** The paper on its easel: legs behind, a clamp on top, a ledge underneath. */
export function Easel({ width, children, overlay, glow }: { width: number; children: ReactNode; overlay?: ReactNode; glow?: string | null }) {
  const height = width / 1.5
  return (
    <div className="relative shrink-0" style={{ width, height: height + 14 }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {[0.16, 0.84].map((at, index) => (
          <span
            key={at}
            className="absolute rounded-sm shadow-[0_8px_18px_rgb(0_0_0/.5)]"
            style={{ left: `${at * 100}%`, top: -10, width: 14, height: height + 90, marginLeft: -7, background: WOOD, transform: `rotate(${index ? 7 : -7}deg)`, transformOrigin: "top center" }}
          />
        ))}
        <span className="absolute left-1/2 -translate-x-1/2 rounded-sm" style={{ top: -18, width: 54, height: 22, background: LEDGE, boxShadow: "0 4px 8px rgb(0 0 0 / .45)" }} />
      </div>
      <div
        className="relative overflow-hidden rounded-[3px] bg-white transition-shadow duration-500"
        style={{ width, height, boxShadow: `0 22px 50px rgb(0 0 0 / .6), 0 0 0 1px rgb(0 0 0 / .25)${glow ? `, 0 0 0 4px ${glow}, 0 0 40px ${glow}` : ""}` }}
      >
        {children}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_62%,rgb(60_40_20/.08))]" />
        {overlay}
      </div>
      <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 rounded-[3px]" style={{ top: height - 2, width: width + 28, height: 16, background: LEDGE, boxShadow: "0 10px 18px rgb(0 0 0 / .5)" }} />
    </div>
  )
}

export interface SeatRowData {
  id: string
  name: string
  score?: number
  connected: boolean
  isHost: boolean
  /** Small status after the name (drawer badge, check). */
  badge?: ReactNode
  /** Points landing on this seat right now (floats up once per `floatKey`). */
  gain?: number
  /** Ring colour around the avatar. */
  glow?: string | null
  dim?: boolean
}

const ROW_H = 46

/**
 * Players docked along the side of the studio. With scores, rows glide to
 * their rank when the points land.
 */
export function SeatColumn({ rows, meId, bubbles, floatKey, ranked = true }: {
  rows: SeatRowData[]
  meId: string
  bubbles: ReactionBubbles
  floatKey: string
  ranked?: boolean
}) {
  const order = ranked ? [...rows].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)) : rows
  return (
    <ol className="relative" style={{ height: order.length * ROW_H }}>
      {order.map((row, index) => {
        const rank = 1 + rows.filter((other) => (other.score ?? 0) > (row.score ?? 0)).length
        return (
          <li
            key={row.id}
            className={cn(
              "absolute inset-x-0 flex items-center gap-2 rounded-xl px-2 transition-[top,background-color,opacity] duration-700 ease-out",
              row.id === meId && "bg-white/10",
              row.dim && "opacity-60",
            )}
            style={{ top: index * ROW_H, height: ROW_H - 4 }}
          >
            {ranked && <span className="w-4 shrink-0 text-right font-mono text-[11px] font-bold text-white/45 tabular-nums">{rank}</span>}
            <span className="relative shrink-0">
              <PartyAvatar
                id={row.id}
                name={row.name}
                size={32}
                className={cn("transition-[box-shadow] duration-500", row.connected ? "" : "opacity-45 grayscale", row.id === meId && "ring-white/90")}
                style={row.glow ? { boxShadow: `0 0 0 2px ${row.glow}, 0 0 16px ${row.glow}` } : undefined}
              />
              {row.isHost && <span aria-label="Host" className="absolute -left-1 -top-1.5 text-[11px]">👑</span>}
              <ReactionBubble bubble={bubbles[row.id]} side="right" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="truncate text-sm font-semibold">{row.id === meId ? "You" : row.name}</span>
                {row.badge}
              </span>
              {!row.connected && <span className="block text-[10px] font-semibold text-amber-200/80">Reconnecting…</span>}
            </span>
            {row.score !== undefined && (
              <span className="relative shrink-0 font-mono text-sm font-black tabular-nums">
                {row.score}
                {!!row.gain && (
                  <span key={`${floatKey}:${row.id}`} className="party-float pointer-events-none absolute bottom-full left-1/2 z-20 whitespace-nowrap rounded-full bg-emerald-400 px-1.5 py-0.5 text-[11px] font-black text-emerald-950 shadow-lg">
                    +{row.gain}
                  </span>
                )}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** A glass panel docked to one side of the studio (or floating over it on small screens). */
export function DockPanel({ title, icon, onClose, className, style, footer, children }: {
  title: string
  icon?: ReactNode
  onClose?: () => void
  className?: string
  style?: CSSProperties
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <aside className={cn(GLASS, "flex min-h-0 flex-col bg-[#14110e]/80", className)} style={style}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        {icon}
        <p className="flex-1 text-[11px] font-bold uppercase tracking-wider text-white/60">{title}</p>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} className="grid size-7 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      {footer && <div className="border-t border-white/10 p-2 [&>form]:border-0 [&>form]:bg-transparent [&>form]:shadow-none">{footer}</div>}
    </aside>
  )
}

/** Countdown bar for a paced beat. */
export function BeatBar({ elapsed, duration, className }: { elapsed: number; duration: number; className?: string }) {
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-white/10", className)}>
      <div className="h-full bg-amber-300 transition-[width] duration-200 ease-linear" style={{ width: `${Math.max(0, 1 - elapsed / duration) * 100}%` }} />
    </div>
  )
}

/** Replays run a little faster for sparse sketches and cap out for busy ones. */
export function replayDuration(strokes: Stroke[]) {
  const weight = strokes.reduce((sum, stroke) => sum + strokeWeight(stroke), 0)
  return Math.min(6000, Math.max(1800, weight * 6))
}

export interface GalleryItemView {
  id: string
  strokes: Stroke[]
  title: string
  caption?: ReactNode
  artistId: string
  artistName: string
}

export interface GalleryGroup {
  title: string
  items: GalleryItemView[]
}

/** Every drawing from the game in a grid; tap one to watch it again. */
export function Gallery({ groups }: { groups: GalleryGroup[] }) {
  const items = groups.flatMap((group) => group.items)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [replayAt, setReplayAt] = useState(0)
  const open = openIndex !== null ? items[openIndex] : undefined

  useEffect(() => {
    if (openIndex === null) return
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndex(null)
      if (event.key === "ArrowRight") show(Math.min(items.length - 1, openIndex + 1))
      if (event.key === "ArrowLeft") show(Math.max(0, openIndex - 1))
    }
    window.addEventListener("keydown", keys)
    return () => window.removeEventListener("keydown", keys)
  })

  const show = (index: number) => {
    setOpenIndex(index)
    setReplayAt(Date.now() + 250)
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-white/50">No drawings made it onto paper this game.</p>
  }

  let flat = -1
  return (
    <div className="w-full space-y-5">
      {groups.map((group) => group.items.length > 0 && (
        <section key={group.title}>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/55">{group.title}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.items.map((item) => {
              flat++
              const index = flat
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => show(index)}
                  className="group uno-pop text-left"
                  style={{ animationDelay: `${Math.min(index, 12) * 60}ms` }}
                >
                  <span className="relative block overflow-hidden rounded-md shadow-[0_10px_24px_rgb(0_0_0/.5)] ring-1 ring-black/30 transition group-hover:-translate-y-0.5 group-hover:ring-2 group-hover:ring-amber-300">
                    <DrawingView strokes={item.strokes} resolution={0.25} className="aspect-[3/2] h-auto" />
                    <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                      <Play className="size-8 fill-white text-white drop-shadow" />
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-sm font-bold capitalize">{item.title}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <PartyAvatar id={item.artistId} name={item.artistName} size={14} className="ring-1" />
                    <span className="truncate">{item.artistName}</span>
                  </span>
                  {item.caption && <span className="mt-0.5 block text-[11px] leading-snug text-white/55">{item.caption}</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {open && openIndex !== null && (
        <div className="uno-fade-in fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpenIndex(null)}>
          <div className="w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
            <div className="overflow-hidden rounded-md bg-white shadow-[0_30px_80px_rgb(0_0_0/.7)]">
              <DrawingView key={`${open.id}:${replayAt}`} strokes={open.strokes} replay={{ startAt: replayAt, duration: replayDuration(open.strokes) }} className="aspect-[3/2] h-auto" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" aria-label="Previous drawing" disabled={openIndex === 0} onClick={() => show(openIndex - 1)} className={cn(GLASS, "grid size-10 place-items-center disabled:opacity-30")}>
                <ChevronLeft className="size-5" />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-lg font-black capitalize">{open.title}</p>
                <p className="truncate text-xs text-white/60">by {open.artistName}</p>
                {open.caption && <p className="text-xs text-white/60">{open.caption}</p>}
              </div>
              <button type="button" aria-label="Next drawing" disabled={openIndex === items.length - 1} onClick={() => show(openIndex + 1)} className={cn(GLASS, "grid size-10 place-items-center disabled:opacity-30")}>
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={() => setReplayAt(Date.now() + 150)} className="flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-black">
                <RotateCcw className="size-4" /> Replay
              </button>
              <button type="button" onClick={() => setOpenIndex(null)} className={cn(GLASS, "h-10 px-4 text-sm font-semibold")}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** End of game: podium (when scored), the gallery, and the way out. */
export function GameOverOverlay({ title, subtitle, rows, meId, groups, isHost, onRestart, onHide, onLeave }: {
  title: string
  subtitle?: string
  rows: ScoreRow[] | null
  meId: string
  groups: GalleryGroup[]
  isHost: boolean
  onRestart: () => void
  onHide: () => void
  onLeave: () => void
}) {
  const ranked = rows ? [...rows].sort((left, right) => right.score - left.score) : []
  return (
    <div className="uno-fade-in absolute inset-0 z-40 overflow-y-auto bg-[#0b0a09]/85 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center gap-6 px-4 py-14">
        <div className="text-center">
          <Trophy className="mx-auto size-8 text-amber-300" />
          <h2 className="mt-2 text-3xl font-black tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-white/60">{subtitle}</p>}
        </div>

        {rows && <Podium rows={rows} meId={meId} />}

        {ranked.length > 3 && (
          <ol className={cn(GLASS, "w-full max-w-sm divide-y divide-white/5 p-1.5")}>
            {ranked.slice(3).map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="w-5 text-right font-mono text-xs text-white/50">{1 + ranked.filter((other) => other.score > row.score).length}</span>
                <PartyAvatar id={row.id} name={row.name} size={22} className="ring-1" />
                <span className="min-w-0 flex-1 truncate">{row.id === meId ? "You" : row.name}</span>
                <span className="font-mono font-bold tabular-nums">{row.score}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {isHost ? (
            <button type="button" onClick={onRestart} className="flex h-11 items-center gap-2 rounded-2xl bg-amber-300 px-5 text-sm font-black text-amber-950 transition hover:scale-[1.03]">
              <RotateCcw className="size-4" /> Play again
            </button>
          ) : (
            <p className="text-sm text-white/60">Waiting for the host to start a rematch…</p>
          )}
          <button type="button" onClick={onHide} className={cn(GLASS, "h-11 px-4 text-sm font-semibold hover:bg-black/65")}>View table</button>
          <button type="button" onClick={onLeave} className={cn(GLASS, "flex h-11 items-center gap-1.5 px-4 text-sm font-semibold hover:bg-black/65")}>
            <LogOut className="size-4" /> Leave
          </button>
        </div>

        <div className={cn(GLASS, "w-full bg-[#14110e]/70 p-4")}>
          <p className="mb-3 text-center text-sm font-black uppercase tracking-[0.25em] text-amber-200">The gallery</p>
          <Gallery groups={groups} />
        </div>
      </div>
    </div>
  )
}
