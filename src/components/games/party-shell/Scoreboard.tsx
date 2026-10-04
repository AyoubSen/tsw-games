import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { PartyAvatar } from "./SeatRing"

export interface ScoreRow {
  id: string
  name: string
  score: number
  /** Points from the last scoring moment (may be negative); drives the "+N" chip and the rank arrows. */
  gained?: number
}

const ROW_H = 32

/** Ties share a rank (1, 2, 2, 4). */
function ranksOf(rows: ScoreRow[], scoreOf: (row: ScoreRow) => number) {
  const ranks: Record<string, number> = {}
  for (const row of rows) ranks[row.id] = 1 + rows.filter((other) => scoreOf(other) > scoreOf(row)).length
  return ranks
}

/** Standings whose rows glide to their new rank when scores change. `rows` arrive in tie-break order. */
export function Scoreboard({ rows, meId, className }: { rows: ScoreRow[]; meId: string; className?: string }) {
  const order = [...rows].sort((left, right) => right.score - left.score)
  const now = ranksOf(rows, (row) => row.score)
  const before = ranksOf(rows, (row) => row.score - (row.gained ?? 0))
  return (
    <ol className={cn("relative", className)} style={{ height: order.length * ROW_H }}>
      {order.map((row, index) => {
        const moved = before[row.id]! - now[row.id]!
        return (
          <li
            key={row.id}
            className={cn("absolute inset-x-0 flex items-center gap-2 rounded-lg px-1.5 transition-[top] duration-700 ease-out", row.id === meId && "bg-white/10")}
            style={{ top: index * ROW_H, height: ROW_H - 2 }}
          >
            <span className="w-4 shrink-0 text-right font-mono text-[11px] font-bold text-white/50 tabular-nums">{now[row.id]}</span>
            <PartyAvatar id={row.id} name={row.name} size={20} className="ring-1" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{row.id === meId ? "You" : row.name}</span>
            {moved > 0 && <ChevronUp key={`up${row.score}`} aria-label="Moved up" className="poker-tag size-3.5 shrink-0 text-emerald-300" />}
            {moved < 0 && <ChevronDown key={`down${row.score}`} aria-label="Moved down" className="poker-tag size-3.5 shrink-0 text-rose-300" />}
            {!!row.gained && (
              <span key={`g${row.score}`} className={cn("poker-tag shrink-0 rounded-full px-1.5 text-[10px] font-bold", row.gained > 0 ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200")}>
                {row.gained > 0 ? `+${row.gained}` : `−${Math.abs(row.gained)}`}
              </span>
            )}
            <span className="w-7 shrink-0 text-right font-mono text-sm font-black tabular-nums">{row.score}</span>
          </li>
        )
      })}
    </ol>
  )
}

const PODIUM = [
  { place: 1, height: 112, hex: "#f5c542" },
  { place: 2, height: 84, hex: "#c9d1db" },
  { place: 3, height: 64, hex: "#d08b52" },
]

/** Top three on stepped blocks (2nd, 1st, 3rd from the left); ties share a step. */
export function Podium({ rows, meId }: { rows: ScoreRow[]; meId: string }) {
  const order = [...rows].sort((left, right) => right.score - left.score)
  const ranks = ranksOf(rows, (row) => row.score)
  const top = order.slice(0, 3)
  const arranged = top.length === 3 ? [top[1]!, top[0]!, top[2]!] : top.length === 2 ? [top[1]!, top[0]!] : top
  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3">
      {arranged.map((row) => {
        const step = PODIUM[Math.min(2, ranks[row.id]! - 1)]!
        return (
          <div key={row.id} className="uno-pop flex w-24 flex-col items-center sm:w-28" style={{ animationDelay: `${(3 - step.place) * 260 + 200}ms` }}>
            <PartyAvatar id={row.id} name={row.name} size={step.place === 1 ? 58 : 46} style={{ boxShadow: `0 0 0 3px ${step.hex}, 0 0 30px ${step.hex}88` }} />
            <p className="mt-2 max-w-full truncate text-sm font-bold">{row.id === meId ? "You" : row.name}</p>
            <p className="font-mono text-xs text-white/70 tabular-nums">{row.score} pts</p>
            <div
              className="mt-2 grid w-full place-items-start justify-center rounded-t-xl pt-2 text-2xl font-black text-black/70"
              style={{ height: step.height, background: `linear-gradient(to bottom, ${step.hex}, ${step.hex}99)` }}
            >
              {ranks[row.id]}
            </div>
          </div>
        )
      })}
    </div>
  )
}
