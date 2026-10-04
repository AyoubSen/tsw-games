import { Crown, WifiOff } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { ReactionBubble, type ReactionBubbleState } from "@/components/multiplayer/Reactions"
import { cn } from "@/lib/utils"

/** Players seated in an ellipse around the stage, the viewer at the bottom. */

export function hueOf(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

export function PartyAvatar({ id, name, size = 32, className, style }: { id: string; name: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-full font-black text-white shadow-[0_4px_14px_rgb(0_0_0/.45)] ring-2 ring-black/30", className)}
      style={{ width: size, height: size, fontSize: size * 0.44, background: `hsl(${hueOf(id)} 55% 42%)`, ...style }}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  )
}

export interface RingLayout {
  compact: boolean
  avatar: number
  seatW: number
  cx: number
  cy: number
  rx: number
  ry: number
  seats: Record<string, { x: number; y: number }>
}

/** Seat centres for `order` (viewer first, so they land at the bottom) inside a `w`×`h` table, clear of docked side panels. */
export function ringLayout(order: string[], w: number, h: number, { top = 72, bottomReserve = 84, insetLeft = 0, insetRight = 0 } = {}): RingLayout {
  const compact = w < 640 || h < 560
  const avatar = compact ? 40 : 54
  const seatW = compact ? 66 : 92
  const left = 12 + insetLeft
  const right = w - 12 - insetRight
  const ringTop = top + avatar / 2 + 22
  const ringBottom = h - bottomReserve - avatar / 2 - 26
  const cx = (left + right) / 2
  const cy = (ringTop + ringBottom) / 2
  const rx = Math.max(60, (right - left) / 2 - seatW / 2)
  const ry = Math.max(50, (ringBottom - ringTop) / 2)
  const seats: RingLayout["seats"] = {}
  order.forEach((id, i) => {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / order.length
    seats[id] = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
  })
  return { compact, avatar, seatW, cx, cy, rx, ry, seats }
}

/** `order` rotated so the viewer comes first. */
export function viewerFirst(ids: string[], viewerId: string) {
  const index = ids.indexOf(viewerId)
  return index < 0 ? ids : [...ids.slice(index), ...ids.slice(0, index)]
}

export function Seat({ x, y, size, width, id, name, isMe, isHost, connected, ghost, chip, score, glow, bubble, bubbleSide = "top", children }: {
  x: number
  y: number
  size: number
  width: number
  id: string
  name: string
  isMe: boolean
  isHost: boolean
  connected: boolean
  /** Their avatar has left the seat (e.g. flown to the stage). */
  ghost?: boolean
  /** Small status chip above the avatar. */
  chip?: ReactNode
  score?: number
  glow?: string | null
  bubble?: ReactionBubbleState
  bubbleSide?: "top" | "bottom"
  /** Overlays anchored to the avatar (floating points, stamps). */
  children?: ReactNode
}) {
  return (
    <div className="absolute z-10 flex flex-col items-center" style={{ left: x, top: y - size / 2, width, transform: "translateX(-50%)" }}>
      <div className="relative" style={{ width: size, height: size }}>
        {ghost ? (
          <span
            aria-hidden="true"
            className="grid size-full place-items-center rounded-full border-2 border-dashed border-white/30 font-black text-white/30"
            style={{ fontSize: size * 0.44 }}
          >
            {name.charAt(0).toUpperCase() || "?"}
          </span>
        ) : (
          <PartyAvatar
            id={id}
            name={name}
            size={size}
            className={cn("transition-[box-shadow,opacity] duration-500", !connected && "opacity-45 grayscale", isMe && "ring-white/90")}
            style={glow ? { boxShadow: `0 0 0 3px ${glow}, 0 0 26px ${glow}` } : undefined}
          />
        )}
        {isHost && <Crown aria-label="Host" className="absolute -left-1 -top-1 size-4 rotate-[-18deg] fill-amber-300 text-amber-500 drop-shadow" />}
        {!connected && <WifiOff aria-label="Disconnected" className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-black/80 p-0.5 text-amber-200" />}
        {chip && <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap">{chip}</span>}
        {children}
        <ReactionBubble bubble={bubble} side={bubbleSide} />
      </div>
      <span className={cn("mt-1 flex max-w-full items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold leading-4 backdrop-blur-sm", isMe && "bg-white/90 text-black")}>
        <span className="truncate">{isMe ? "You" : name}</span>
        {score !== undefined && <span className={cn("font-mono tabular-nums", isMe ? "text-black/60" : "text-white/60")}>{score}</span>}
      </span>
    </div>
  )
}

/** Status chip styles for `Seat`. */
export function SeatChip({ tone, children }: { tone: "done" | "waiting" | "alert"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "uno-tag flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow",
        tone === "done" && "bg-emerald-400 text-emerald-950",
        tone === "waiting" && "bg-black/60 text-white/60",
        tone === "alert" && "bg-rose-500 text-white",
      )}
    >
      {children}
    </span>
  )
}
