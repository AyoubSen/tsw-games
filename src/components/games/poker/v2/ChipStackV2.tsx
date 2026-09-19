import { cn } from "@/lib/utils"

/** Casino denominations, high to low. */
const DENOMS: { value: number; face: string; edge: string }[] = [
  { value: 1000, face: "#1c1c22", edge: "#f0c040" },
  { value: 500, face: "#6d28d9", edge: "#c4b5fd" },
  { value: 100, face: "#18181b", edge: "#a1a1aa" },
  { value: 25, face: "#15803d", edge: "#86efac" },
  { value: 5, face: "#b91c1c", edge: "#fca5a5" },
  { value: 1, face: "#e4e4e7", edge: "#71717a" },
]

/** Greedy breakdown, biggest chips first, capped so a big stack stays readable. */
function chipsFor(amount: number, max: number) {
  const out: (typeof DENOMS)[number][] = []
  let left = amount
  for (const denom of DENOMS) {
    while (left >= denom.value && out.length < max) {
      out.push(denom)
      left -= denom.value
    }
    if (out.length >= max) break
  }
  if (out.length === 0 && amount > 0) out.push(DENOMS[DENOMS.length - 1])
  return out
}

interface ChipStackProps {
  amount: number
  size?: "sm" | "md"
  showLabel?: boolean
  className?: string
}

export function ChipStack({
  amount,
  size = "sm",
  showLabel = true,
  className,
}: ChipStackProps) {
  if (amount <= 0) return null

  const max = size === "md" ? 6 : 4
  const chips = chipsFor(amount, max)
  const dim = size === "md" ? 22 : 16
  const lift = size === "md" ? 4 : 3

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div
        className="relative shrink-0"
        style={{ width: dim, height: dim + (chips.length - 1) * lift }}
      >
        {chips.map((chip, i) => (
          <div
            key={`${chip.value}-${i}`}
            className="absolute rounded-full"
            style={{
              width: dim,
              height: dim,
              bottom: i * lift,
              background: `radial-gradient(circle at 50% 35%, ${chip.face} 55%, rgba(0,0,0,0.45) 100%)`,
              border: `${size === "md" ? 2.5 : 2}px dashed ${chip.edge}`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          />
        ))}
      </div>
      {showLabel && (
        <span
          className={cn(
            "font-mono font-semibold tabular-nums text-amber-200",
            size === "md" ? "text-sm" : "text-[10px]",
          )}
        >
          {amount.toLocaleString()}
        </span>
      )}
    </div>
  )
}
