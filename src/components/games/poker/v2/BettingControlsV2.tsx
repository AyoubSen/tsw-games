import { useEffect, useMemo, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface BettingControlsProps {
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
  "relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-3 text-sm font-black uppercase tracking-wider shadow-lg transition-all active:translate-y-px active:scale-[0.98] disabled:opacity-35 disabled:active:scale-100 sm:min-w-[118px]"

export function BettingControls({
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
  const maxRaise = currentBet + myChips
  const minRaiseTotal = Math.min(currentBetToMatch + minRaise, maxRaise)
  const canRaise = maxRaise > currentBetToMatch && myChips > 0 && !isCallAllIn
  const isBet = currentBetToMatch === 0

  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(minRaiseTotal)

  // A new street (or a new bet to match) invalidates whatever was staged.
  useEffect(() => {
    setRaiseOpen(false)
    setRaiseAmount(minRaiseTotal)
  }, [minRaiseTotal, maxRaise])

  const clamped = Math.max(minRaiseTotal, Math.min(maxRaise, raiseAmount))
  const step = Math.max(1, minRaise)

  // Pot-sized raises are measured with our call already in the middle.
  const presets = useMemo(() => {
    const potAfterCall = pot + Math.max(0, currentBetToMatch - currentBet)
    const out: { label: string; value: number }[] = [{ label: "Min", value: minRaiseTotal }]
    const add = (label: string, fraction: number) => {
      const value = currentBetToMatch + Math.floor(potAfterCall * fraction)
      if (value > minRaiseTotal && value < maxRaise) out.push({ label, value })
    }
    add("½ Pot", 0.5)
    add("¾ Pot", 0.75)
    add("Pot", 1)
    out.push({ label: "All in", value: maxRaise })
    return out
  }, [minRaiseTotal, maxRaise, pot, currentBetToMatch, currentBet])

  const sliderPct = maxRaise > minRaiseTotal ? ((clamped - minRaiseTotal) / (maxRaise - minRaiseTotal)) * 100 : 100

  const commitRaise = () => {
    if (clamped >= maxRaise) onAllIn()
    else onRaise(clamped)
    setRaiseOpen(false)
  }

  useEffect(() => {
    if (!raiseOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRaiseOpen(false)
      if (event.key === "Enter") commitRaise()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="relative w-full">
      {raiseOpen && canRaise && (
        <div className="poker-rise absolute bottom-full right-0 mb-3 w-full space-y-3 rounded-2xl border border-white/10 bg-[#0d1210]/95 p-3.5 shadow-2xl backdrop-blur-md sm:w-[380px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Lower raise"
              onClick={() => setRaiseAmount(Math.max(minRaiseTotal, clamped - step))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">{isBet ? "Bet" : "Raise to"}</div>
              <div className="font-mono text-2xl font-black tabular-nums text-amber-200">{clamped.toLocaleString()}</div>
            </div>
            <button
              type="button"
              aria-label="Raise more"
              onClick={() => setRaiseAmount(Math.min(maxRaise, clamped + step))}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="relative flex h-6 items-center">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${sliderPct}%` }} />
            </div>
            <div className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 rounded-full border-2 border-amber-300 bg-white shadow-lg" style={{ left: `${sliderPct}%` }} />
            <input
              type="range"
              min={minRaiseTotal}
              max={maxRaise}
              step={step}
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
                  "flex-1 rounded-lg py-1.5 text-[11px] font-bold transition-colors",
                  clamped === p.value ? "bg-amber-300 text-black" : "bg-white/[0.07] text-white/55 hover:bg-white/12 hover:text-white",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onFold}
          className={cn(ACTION_BASE, "bg-gradient-to-b from-[#3a1d22] to-[#241215] text-rose-200 ring-1 ring-rose-400/25 hover:from-[#4d2229] hover:text-rose-100")}
        >
          Fold
        </button>

        {canCheck ? (
          <button
            type="button"
            onClick={onCheck}
            className={cn(ACTION_BASE, "bg-gradient-to-b from-[#1f4a3b] to-[#123026] text-emerald-100 ring-1 ring-emerald-300/30 hover:from-[#256049]")}
          >
            Check
          </button>
        ) : (
          <button
            type="button"
            onClick={isCallAllIn ? onAllIn : onCall}
            className={cn(ACTION_BASE, "bg-gradient-to-b from-[#1f4a3b] to-[#123026] text-emerald-100 ring-1 ring-emerald-300/30 hover:from-[#256049]")}
          >
            <span>{isCallAllIn ? "All in" : "Call"}</span>
            <span className="font-mono text-xs font-bold tabular-nums text-emerald-200/80">{callAmount.toLocaleString()}</span>
          </button>
        )}

        {canRaise && (
          <button
            type="button"
            onClick={() => (raiseOpen ? commitRaise() : setRaiseOpen(true))}
            className={cn(ACTION_BASE, "bg-gradient-to-b from-amber-300 to-amber-500 text-[#2a1a00] ring-1 ring-amber-200/60 hover:from-amber-200")}
          >
            <span>{raiseOpen ? "Confirm" : maxRaise <= minRaiseTotal ? "All in" : isBet ? "Bet" : "Raise"}</span>
            <span className="font-mono text-xs font-bold tabular-nums text-[#2a1a00]/70">{(raiseOpen ? clamped : minRaiseTotal).toLocaleString()}</span>
          </button>
        )}
      </div>
    </div>
  )
}
