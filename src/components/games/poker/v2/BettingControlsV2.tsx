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

// Chip denomination button
function ChipButton({ label, onClick, active }: {
  label: string
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
        "shadow-md border-2",
        active
          ? "border-yellow-400 bg-gradient-to-br from-yellow-500 to-yellow-700 text-white scale-110"
          : "border-zinc-500 bg-gradient-to-br from-zinc-600 to-zinc-800 text-zinc-200 hover:border-yellow-500/50 hover:scale-105"
      )}
    >
      {/* Inner ring */}
      <div className="absolute inset-[3px] rounded-full border border-dashed border-white/30 pointer-events-none" />
      <span className="relative z-10">{label}</span>
    </button>
  )
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
      items.push({ label: "1/2", value: halfPot })
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

  // Calculate slider percentage for gradient track
  const sliderPercent = maxRaise > minRaiseTotal
    ? ((clampedRaise - minRaiseTotal) / (maxRaise - minRaiseTotal)) * 100
    : 0

  return (
    <div className="space-y-3">
      {/* Raise panel */}
      {showRaiseSlider && canRaise && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "linear-gradient(180deg, rgba(30,30,40,0.95), rgba(20,20,30,0.98))",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Raise to:</span>
            <span className="font-mono font-bold text-lg text-white">{clampedRaise}</span>
          </div>

          {/* Gradient slider */}
          <div className="relative">
            <div className="h-2 rounded-full bg-zinc-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${sliderPercent}%`,
                  background: `linear-gradient(90deg, #22c55e, #eab308 50%, #ef4444)`,
                }}
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

          {/* Chip denomination buttons */}
          <div className="flex gap-2 justify-center">
            {presets.map((p) => (
              <ChipButton
                key={p.label}
                label={p.label}
                onClick={() => setRaiseAmount(p.value)}
                active={clampedRaise === p.value}
              />
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
              className="flex-1 py-2.5 rounded-lg font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg"
            >
              Raise to {clampedRaise}
            </button>
            <button
              onClick={() => setShowRaiseSlider(false)}
              className="px-4 py-2.5 rounded-lg text-sm text-zinc-400 border border-zinc-600 hover:border-zinc-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main action buttons */}
      <div className="flex gap-2 justify-center">
        {/* Fold - Red */}
        <button
          onClick={onFold}
          className="flex-1 max-w-[130px] py-3 rounded-lg font-bold text-sm text-white transition-all shadow-lg bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 border border-red-500/50 active:scale-95"
        >
          Fold
        </button>

        {/* Check/Call - Green */}
        {canCheck ? (
          <button
            onClick={onCheck}
            className="flex-1 max-w-[130px] py-3 rounded-lg font-bold text-sm text-white transition-all shadow-lg bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-500/50 active:scale-95"
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
            className="flex-1 max-w-[130px] py-3 rounded-lg font-bold text-sm text-white transition-all shadow-lg bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-500/50 active:scale-95"
          >
            <span>Call</span>
            <span className="block text-emerald-200 text-xs font-mono">
              {callAmount >= myChips ? "(All-In)" : callAmount}
            </span>
          </button>
        ) : null}

        {/* Raise - Blue */}
        {canRaise && !showRaiseSlider && (
          <button
            onClick={() => {
              setRaiseAmount(minRaiseTotal)
              setShowRaiseSlider(true)
            }}
            className="flex-1 max-w-[130px] py-3 rounded-lg font-bold text-sm text-white transition-all shadow-lg bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 border border-blue-500/50 active:scale-95"
          >
            Raise
          </button>
        )}

        {/* All-In (when can't raise normally) */}
        {!canRaise && myChips > 0 && (
          <button
            onClick={onAllIn}
            className="flex-1 max-w-[160px] py-3 rounded-lg font-bold text-sm text-white transition-all shadow-lg bg-gradient-to-r from-red-700 via-red-600 to-red-700 hover:from-red-600 hover:via-red-500 hover:to-red-600 border border-red-500/50 active:scale-95"
          >
            All-In ({myChips})
          </button>
        )}
      </div>
    </div>
  )
}
