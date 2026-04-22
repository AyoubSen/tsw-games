import { useState, useMemo } from "react"
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
  const callAmount = currentBetToMatch - currentBet
  const canCheck = currentBet >= currentBetToMatch
  const canCall = callAmount > 0 && callAmount <= myChips
  const minRaiseTotal = currentBetToMatch + minRaise
  const canRaise = myChips > callAmount && minRaiseTotal <= currentBet + myChips

  const [raiseAmount, setRaiseAmount] = useState(minRaiseTotal)
  const maxRaise = currentBet + myChips

  const clampedRaise = useMemo(() => {
    return Math.max(minRaiseTotal, Math.min(maxRaise, raiseAmount))
  }, [raiseAmount, minRaiseTotal, maxRaise])

  const presets = useMemo(() => {
    const items: { label: string; value: number }[] = []
    items.push({ label: "Min", value: minRaiseTotal })
    const halfPot = currentBetToMatch + Math.floor(pot / 2)
    if (halfPot > minRaiseTotal && halfPot < maxRaise) {
      items.push({ label: "1/2 Pot", value: halfPot })
    }
    const fullPot = currentBetToMatch + pot
    if (fullPot > minRaiseTotal && fullPot < maxRaise) {
      items.push({ label: "Pot", value: fullPot })
    }
    items.push({ label: "Max", value: maxRaise })
    return items
  }, [minRaiseTotal, maxRaise, pot, currentBetToMatch])

  const [showRaiseSlider, setShowRaiseSlider] = useState(false)

  if (!canAct) return null

  const sliderPercent = maxRaise > minRaiseTotal
    ? ((clampedRaise - minRaiseTotal) / (maxRaise - minRaiseTotal)) * 100
    : 0

  return (
    <div className="space-y-2.5">
      {/* Raise panel */}
      {showRaiseSlider && canRaise && (
        <div
          className="rounded-xl p-3.5 space-y-3"
          style={{
            background: "rgba(20,20,30,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Raise to</span>
            <span className="font-mono font-bold text-base text-white">{clampedRaise}</span>
          </div>

          {/* Slider */}
          <div className="relative">
            <div className="h-1.5 rounded-full bg-zinc-700/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-zinc-400 transition-all duration-100"
                style={{ width: `${sliderPercent}%` }}
              />
            </div>
            <input
              type="range"
              min={minRaiseTotal}
              max={maxRaise}
              step={Math.max(1, minRaise)}
              value={clampedRaise}
              onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              style={{ height: "100%" }}
            />
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setRaiseAmount(p.value)}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors",
                  clampedRaise === p.value
                    ? "bg-white/10 text-white"
                    : "bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (clampedRaise >= maxRaise) {
                  onAllIn()
                } else {
                  onRaise(clampedRaise)
                }
                setShowRaiseSlider(false)
              }}
              className="flex-1 py-2 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              Raise to {clampedRaise}
            </button>
            <button
              onClick={() => setShowRaiseSlider(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main action buttons */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={onFold}
          className="flex-1 max-w-[120px] py-2.5 rounded-lg font-semibold text-sm text-white bg-red-600/80 hover:bg-red-600 transition-colors"
        >
          Fold
        </button>

        {canCheck ? (
          <button
            onClick={onCheck}
            className="flex-1 max-w-[120px] py-2.5 rounded-lg font-semibold text-sm text-white bg-emerald-600/80 hover:bg-emerald-600 transition-colors"
          >
            Check
          </button>
        ) : canCall ? (
          <button
            onClick={() => {
              if (callAmount >= myChips) {
                onAllIn()
              } else {
                onCall()
              }
            }}
            className="flex-1 max-w-[120px] py-2.5 rounded-lg font-semibold text-sm text-white bg-emerald-600/80 hover:bg-emerald-600 transition-colors"
          >
            Call {callAmount >= myChips ? "(All-In)" : callAmount}
          </button>
        ) : null}

        {canRaise && !showRaiseSlider && (
          <button
            onClick={() => {
              setRaiseAmount(minRaiseTotal)
              setShowRaiseSlider(true)
            }}
            className="flex-1 max-w-[120px] py-2.5 rounded-lg font-semibold text-sm text-white bg-blue-600/80 hover:bg-blue-600 transition-colors"
          >
            Raise
          </button>
        )}

        {!canRaise && myChips > 0 && (
          <button
            onClick={onAllIn}
            className="flex-1 max-w-[140px] py-2.5 rounded-lg font-semibold text-sm text-white bg-red-600/80 hover:bg-red-600 transition-colors"
          >
            All-In ({myChips})
          </button>
        )}
      </div>
    </div>
  )
}
