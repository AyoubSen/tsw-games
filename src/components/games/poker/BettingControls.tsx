import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
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

  // Snap raise amount to valid range
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
    items.push({ label: "All-In", value: maxRaise })
    return items
  }, [minRaiseTotal, maxRaise, pot, currentBetToMatch])

  const [showRaiseSlider, setShowRaiseSlider] = useState(false)

  if (!canAct) return null

  return (
    <div className="space-y-3">
      {/* Raise slider/presets */}
      {showRaiseSlider && canRaise && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Raise to:</span>
            <span className="font-mono font-bold">{clampedRaise}</span>
          </div>

          <input
            type="range"
            min={minRaiseTotal}
            max={maxRaise}
            step={Math.max(1, minRaise)}
            value={clampedRaise}
            onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
            className="w-full accent-primary"
          />

          <div className="flex gap-1.5 flex-wrap">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setRaiseAmount(p.value)}
                className={cn(
                  "text-xs px-2 py-1 rounded border transition-colors",
                  clampedRaise === p.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (clampedRaise >= maxRaise) {
                  onAllIn()
                } else {
                  onRaise(clampedRaise)
                }
                setShowRaiseSlider(false)
              }}
              className="flex-1"
              size="sm"
            >
              Raise to {clampedRaise}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRaiseSlider(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Main action buttons */}
      <div className="flex gap-2 justify-center">
        <Button
          variant="destructive"
          onClick={onFold}
          className="flex-1 max-w-[120px]"
        >
          Fold
        </Button>

        {canCheck ? (
          <Button
            variant="secondary"
            onClick={onCheck}
            className="flex-1 max-w-[120px]"
          >
            Check
          </Button>
        ) : canCall ? (
          <Button
            variant="secondary"
            onClick={() => {
              if (callAmount >= myChips) {
                onAllIn()
              } else {
                onCall()
              }
            }}
            className="flex-1 max-w-[120px]"
          >
            Call {callAmount >= myChips ? "(All-In)" : callAmount}
          </Button>
        ) : null}

        {canRaise && !showRaiseSlider && (
          <Button
            variant="default"
            onClick={() => {
              setRaiseAmount(minRaiseTotal)
              setShowRaiseSlider(true)
            }}
            className="flex-1 max-w-[120px]"
          >
            Raise
          </Button>
        )}

        {!canRaise && myChips > 0 && (
          <Button
            variant="default"
            onClick={onAllIn}
            className="flex-1 max-w-[120px]"
          >
            All-In ({myChips})
          </Button>
        )}
      </div>
    </div>
  )
}
