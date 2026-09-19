import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

interface BettingControlsProps {
  canAct: boolean
  currentBet: number
  currentBetToMatch: number
  myChips: number
  minRaise: number
  pot: number
  onFold: () => void
  onCheck: () => void
  onCall: () => void
  onRaise: (amount: number) => void
  onAllIn: () => void
}

const ACTION_BASE =
  "flex-1 rounded-xl py-3 text-sm font-semibold tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"

export function BettingControls({
  canAct,
  currentBet,
  currentBetToMatch,
  myChips,
  minRaise,
  pot,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onAllIn,
}: BettingControlsProps) {
  const callAmount = Math.min(currentBetToMatch - currentBet, myChips)
  const canCheck = currentBet >= currentBetToMatch
  const isCallAllIn = currentBetToMatch - currentBet >= myChips
  const minRaiseTotal = currentBetToMatch + minRaise
  const maxRaise = currentBet + myChips
  const canRaise = maxRaise > currentBetToMatch && myChips > 0

  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(minRaiseTotal)

  // A new street (or a new bet to match) invalidates whatever was staged.
  useEffect(() => {
    setRaiseOpen(false)
    setRaiseAmount(Math.min(minRaiseTotal, maxRaise))
  }, [minRaiseTotal, maxRaise])

  const clamped = Math.max(
    Math.min(minRaiseTotal, maxRaise),
    Math.min(maxRaise, raiseAmount),
  )

  const presets = useMemo(() => {
    const out: { label: string; value: number }[] = []
    const add = (label: string, value: number) => {
      if (value > minRaiseTotal && value < maxRaise) out.push({ label, value })
    }
    out.push({ label: "Min", value: Math.min(minRaiseTotal, maxRaise) })
    add("½ Pot", currentBetToMatch + Math.floor(pot / 2))
    add("Pot", currentBetToMatch + pot)
    out.push({ label: "All in", value: maxRaise })
    return out
  }, [minRaiseTotal, maxRaise, pot, currentBetToMatch])

  const sliderPct =
    maxRaise > minRaiseTotal
      ? ((clamped - minRaiseTotal) / (maxRaise - minRaiseTotal)) * 100
      : 100

  const commitRaise = () => {
    if (clamped >= maxRaise) onAllIn()
    else onRaise(clamped)
    setRaiseOpen(false)
  }

  // The dock keeps its footprint even when it is not our turn, so the table
  // above never shifts as the action moves around the felt.
  if (!canAct) {
    return (
      <div className="flex h-[60px] items-center justify-center rounded-xl bg-white/[0.03] text-xs text-white/30">
        Waiting for your turn
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {raiseOpen && canRaise && (
        <div className="space-y-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-white/40">
              Raise to
            </span>
            <span className="font-mono text-lg font-bold tabular-nums text-white">
              {clamped.toLocaleString()}
            </span>
          </div>

          <div className="relative flex h-5 items-center">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${sliderPct}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow"
              style={{ left: `${sliderPct}%` }}
            />
            <input
              type="range"
              min={Math.min(minRaiseTotal, maxRaise)}
              max={maxRaise}
              step={Math.max(1, minRaise)}
              value={clamped}
              onChange={(e) => setRaiseAmount(Number.parseInt(e.target.value, 10))}
              aria-label="Raise amount"
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setRaiseAmount(p.value)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                  clamped === p.value
                    ? "bg-amber-400 text-black"
                    : "bg-white/[0.06] text-white/50 hover:bg-white/10 hover:text-white",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRaiseOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm text-white/40 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitRaise}
              className="flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-300"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onFold}
          className={cn(ACTION_BASE, "bg-white/[0.06] text-white/70 hover:bg-red-500/20 hover:text-red-300")}
        >
          Fold
        </button>

        {canCheck ? (
          <button
            type="button"
            onClick={onCheck}
            className={cn(ACTION_BASE, "bg-white/10 text-white hover:bg-white/15")}
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            onClick={isCallAllIn ? onAllIn : onCall}
            className={cn(ACTION_BASE, "bg-white/10 text-white hover:bg-white/15")}
          >
            <span className="flex flex-col items-center leading-tight">
              <span>{isCallAllIn ? "Call all in" : "Call"}</span>
              <span className="font-mono text-[11px] font-normal tabular-nums text-white/50">
                {callAmount.toLocaleString()}
              </span>
            </span>
          </button>
        )}

        <button
          type="button"
          disabled={!canRaise}
          onClick={() => (raiseOpen ? commitRaise() : setRaiseOpen(true))}
          className={cn(ACTION_BASE, "bg-amber-400 text-black hover:bg-amber-300")}
        >
          {maxRaise <= minRaiseTotal
            ? "All in"
            : currentBetToMatch > 0
              ? "Raise"
              : "Bet"}
        </button>
      </div>
    </div>
  )
}
