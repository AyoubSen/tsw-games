import { cn } from "@/lib/utils"

/** Casino denominations, high to low. */
const DENOMS: { value: number; face: string; edge: string; side: string }[] = [
  { value: 1000, face: "#e0a422", edge: "#fff6dc", side: "#8a5f0c" },
  { value: 500, face: "#6c3fb0", edge: "#efe6ff", side: "#3b1f66" },
  { value: 100, face: "#1d1d24", edge: "#f1f1f4", side: "#050507" },
  { value: 25, face: "#1d8a4f", edge: "#f0fff6", side: "#0d4a29" },
  { value: 5, face: "#c42c35", edge: "#fff0f0", side: "#6e121a" },
  { value: 1, face: "#ece9e0", edge: "#2f64b8", side: "#8f8a7c" },
]

const MAX_PER_COLUMN = 7

/** Greedy breakdown into at most three columns, one per denomination, biggest first. */
function columnsFor(amount: number) {
  const columns: { denom: (typeof DENOMS)[number]; count: number }[] = []
  let left = amount
  for (const denom of DENOMS) {
    const count = Math.floor(left / denom.value)
    if (count > 0) {
      columns.push({ denom, count: Math.min(count, MAX_PER_COLUMN) })
      left -= count * denom.value
    }
    if (columns.length === 3) break
  }
  if (columns.length === 0 && amount > 0) columns.push({ denom: DENOMS[DENOMS.length - 1], count: 1 })
  return columns
}

interface ChipStackProps {
  amount: number
  /** Chip diameter in px. */
  chip?: number
  label?: "right" | "below" | "none"
  className?: string
}

export function ChipStack({ amount, chip = 18, label = "right", className }: ChipStackProps) {
  if (amount <= 0) return null
  const columns = columnsFor(amount)
  const lift = chip * 0.13
  const discH = chip * 0.56
  const tallest = Math.max(...columns.map((column) => column.count))
  const step = chip * 0.72

  return (
    <div className={cn("pointer-events-none flex items-center", label === "below" ? "flex-col gap-1" : "gap-1.5", className)}>
      <div className="relative shrink-0" style={{ width: chip + step * (columns.length - 1), height: discH + lift * tallest }}>
        {columns.map((column, ci) => (
          <div key={column.denom.value} className="absolute bottom-0" style={{ left: ci * step, width: chip, height: discH + lift * column.count, zIndex: ci % 2 === 1 ? 2 : 1 }}>
            {Array.from({ length: column.count }, (_, k) => (
              <div
                key={k}
                className="absolute left-0"
                style={{
                  bottom: k * lift,
                  width: chip,
                  height: discH,
                  borderRadius: "50%",
                  background: `radial-gradient(ellipse at center, ${column.denom.face} 0 44%, ${column.denom.edge} 45% 49%, transparent 50%), repeating-conic-gradient(${column.denom.face} 0 30deg, ${column.denom.edge} 30deg 45deg)`,
                  boxShadow: `0 ${lift}px 0 ${column.denom.side}, 0 ${lift + 1}px 3px rgba(0,0,0,0.55)`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {label !== "none" && (
        <span
          className="rounded-full bg-black/60 px-2 py-0.5 font-mono font-bold tabular-nums text-amber-100 ring-1 ring-white/10"
          style={{ fontSize: Math.max(10, chip * 0.6) }}
        >
          {amount.toLocaleString()}
        </span>
      )}
    </div>
  )
}
