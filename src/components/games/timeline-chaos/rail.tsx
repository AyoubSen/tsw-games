import { FlaskConical, Landmark, Palette } from "lucide-react"
import type { ReactNode } from "react"
import type { PublicTimelineEvent, TimelineCategory } from "@/lib/timelineChaos"
import { cn } from "@/lib/utils"

/** Museum-archive pieces for the Timeline Chaos table: stage geometry, event cards, order pips. */

export const CATEGORY: Record<TimelineCategory, { label: string; hex: string; icon: typeof Landmark }> = {
  history: { label: "History", hex: "#9a3412", icon: Landmark },
  science: { label: "Science", hex: "#0f766e", icon: FlaskConical },
  culture: { label: "Culture", hex: "#6b21a8", icon: Palette },
}

export const ROMAN = ["I", "II", "III", "IV", "V", "VI"]

const RATIO = 1.34
const HAND_TILT = [-5, 3, -2, 5, -3, 2]
const HAND_DROP = [6, 0, 10, 2, 4, 8]

export interface Spot {
  x: number
  y: number
  /** Rotation in degrees. */
  r: number
}

export interface StageLayout {
  compact: boolean
  avatar: number
  seatW: number
  left: number
  right: number
  cx: number
  card: { w: number; h: number }
  gap: number
  railLeft: number
  railW: number
  /** Top of the slot row. */
  slotTop: number
  /** Centre line of the brass rail, under the slots. */
  railY: number
  /** Top of the hand (and of the facts / room view during the reveal). */
  handTop: number
  /** Lowest y the stage content may use, above the dock. */
  bottom: number
  slots: Spot[]
  hand: Spot[]
  /** Where dealt cards fly in from. */
  deck: Spot
  seats: Record<string, { x: number; y: number }>
  me: { x: number; y: number }
  dockX: number
  /** Slot under a dragged card's centre, "hand" below the rail, null above it. */
  slotAt: (x: number, y: number) => number | "hand" | null
}

/** Others sit along the top in rows, the viewer bottom-left; the rail runs across the middle with the hand below it. */
export function stageLayout(others: string[], w: number, h: number, { n = 4, insetLeft = 0, insetRight = 0 } = {}): StageLayout {
  const compact = w < 640 || h < 600
  const avatar = compact ? 34 : 46
  const seatW = compact ? 64 : 88
  const left = 12 + insetLeft
  const right = Math.max(left + 200, w - 12 - insetRight)
  const width = right - left
  const cx = left + width / 2

  const perRow = Math.max(1, Math.floor(width / seatW))
  const rows = Math.ceil(others.length / perRow)
  const rowH = avatar + (compact ? 40 : 46)
  const seatsTop = 64 + 22
  const seats: StageLayout["seats"] = {}
  others.forEach((id, i) => {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, others.length - row * perRow)
    const offset = i - row * perRow - (inRow - 1) / 2
    const spacing = Math.min(seatW * 1.5, width / inRow)
    const t = inRow > 1 ? offset / ((inRow - 1) / 2) : 0
    seats[id] = { x: cx + offset * spacing, y: seatsTop + avatar / 2 + row * rowH + (compact ? 0 : t * t * 10) }
  })

  const top = others.length ? seatsTop + rows * rowH + (compact ? 4 : 12) : 84
  const dockBand = avatar + (compact ? 54 : 62)
  const bottom = h - dockBand
  const available = Math.max(160, bottom - top)

  const gap = compact ? 6 : 16
  const byWidth = (Math.min(width, 900) - (n - 1) * gap) / n
  const byHeight = (available - (compact ? 64 : 88)) / 2 / RATIO
  const cardW = Math.round(Math.max(54, Math.min(168, byWidth, byHeight)))
  const cardH = Math.round(cardW * RATIO)
  const railW = n * cardW + (n - 1) * gap
  const railLeft = cx - railW / 2

  const blockH = 20 + cardH + 34 + cardH * 0.95
  const slack = Math.max(0, available - blockH)
  const slotTop = top + 20 + slack * 0.35
  const railY = slotTop + cardH + 12
  const handTop = railY + 22 + slack * 0.3

  const slots = Array.from({ length: n }, (_, i) => ({ x: railLeft + i * (cardW + gap), y: slotTop, r: 0 }))
  const hand = slots.map((slot, i) => ({ x: slot.x, y: handTop + HAND_DROP[i % HAND_DROP.length]! * (compact ? 0.5 : 1), r: HAND_TILT[i % HAND_TILT.length]! }))
  const deck = { x: cx - cardW / 2, y: -cardH - 40, r: -24 }

  const slotAt = (x: number, y: number) => {
    if (y > slotTop + cardH * 1.25) return "hand" as const
    if (y < slotTop - cardH * 0.6) return null
    const index = Math.round((x - railLeft - cardW / 2) / (cardW + gap))
    return Math.max(0, Math.min(n - 1, index))
  }

  return {
    compact, avatar, seatW, left, right, cx,
    card: { w: cardW, h: cardH }, gap, railLeft, railW, slotTop, railY, handTop, bottom,
    slots, hand, deck, seats,
    me: { x: left + seatW / 2 + 2, y: h - 14 - 20 - avatar / 2 },
    dockX: compact ? (left + seatW + right) / 2 : cx,
    slotAt,
  }
}

/** A dealt event: paper card with a category band, its title, and room at the foot for the year stamp. */
export function EventCard({ event, w, h, lifted, selected, dim, year, children }: {
  event: PublicTimelineEvent
  w: number
  h: number
  lifted?: boolean
  selected?: boolean
  dim?: boolean
  /** Stamped once the archive dates it. */
  year?: string | null
  children?: ReactNode
}) {
  const meta = CATEGORY[event.category]
  const Icon = meta.icon
  const band = Math.max(16, Math.round(h * 0.13))
  const stampH = Math.max(18, Math.round(h * 0.17))
  const fontSize = Math.max(9.5, Math.min(14.5, w * 0.085))
  return (
    <div
      className={cn(
        "relative flex size-full flex-col overflow-hidden rounded-xl border text-[#2a1d10] transition-[box-shadow,filter] duration-200",
        lifted ? "shadow-[0_26px_44px_rgb(0_0_0/.6)]" : "shadow-[0_8px_20px_rgb(0_0_0/.45)]",
        selected && "ring-2 ring-[#f5d58a] ring-offset-2 ring-offset-transparent",
        dim && "brightness-[.8] saturate-[.7]",
      )}
      style={{ background: "linear-gradient(168deg, #fffaf0 0%, #f4e8cd 58%, #e8d6b0 100%)", borderColor: "#c4a571" }}
    >
      <div className="flex shrink-0 items-center gap-1 px-1.5 text-[#fff6e3]" style={{ height: band, background: meta.hex }}>
        <Icon className="size-3 shrink-0" />
        <span className="truncate text-[8.5px] font-black uppercase tracking-[0.18em]">{meta.label}</span>
      </div>
      <p className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-1.5 text-center font-serif font-bold leading-[1.15] text-balance" style={{ fontSize }}>
        {event.title}
      </p>
      <div className="shrink-0 border-t border-dashed border-[#c4a571]/60" style={{ height: stampH }} />
      {year && (
        <span
          className="party-stamp absolute left-1/2 whitespace-nowrap rounded-[4px] border-2 border-[#b3261e] bg-[#fff4e0]/80 px-1.5 font-mono font-black leading-none text-[#b3261e] mix-blend-multiply"
          style={{ top: h - stampH / 2 - 2, fontSize: Math.max(11, Math.min(17, w * 0.1)), paddingBlock: 3 }}
        >
          {year}
        </span>
      )}
      {children}
    </div>
  )
}

/** A player's order as one pip per slot: green when that slot is right; the number is the card's true rank. */
export function OrderPips({ order, correctOrder, size = 14 }: { order: string[] | null; correctOrder: string[]; size?: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-label={order ? `${order.filter((id, i) => id === correctOrder[i]).length} of ${correctOrder.length} in the right slot` : "No order"}>
      {correctOrder.map((correctId, i) => {
        const id = order?.[i]
        const right = id === correctId
        const rank = id ? correctOrder.indexOf(id) + 1 : 0
        return (
          <span
            key={i}
            className={cn(
              "grid place-items-center rounded-[4px] font-mono font-black leading-none",
              !id ? "bg-white/10 text-white/30" : right ? "bg-emerald-400 text-emerald-950" : "bg-rose-400/80 text-rose-950",
            )}
            style={{ width: size, height: size, fontSize: size * 0.62 }}
          >
            {rank || "·"}
          </span>
        )
      })}
    </span>
  )
}
