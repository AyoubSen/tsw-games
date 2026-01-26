import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Clock } from "lucide-react"

interface TimerProps {
  startedAt: number
  duration: number // seconds
  className?: string
  onExpire?: () => void
}

export function Timer({ startedAt, duration, className, onExpire }: TimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(duration)

  useEffect(() => {
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, duration - elapsed)
      setTimeRemaining(remaining)

      if (remaining === 0 && onExpire) {
        onExpire()
      }
    }

    // Initial update
    updateTimer()

    // Update every 100ms for smoother countdown
    const interval = setInterval(updateTimer, 100)

    return () => clearInterval(interval)
  }, [startedAt, duration, onExpire])

  const percentage = (timeRemaining / duration) * 100
  const isLow = timeRemaining <= 5
  const isCritical = timeRemaining <= 3

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-sm font-bold transition-colors",
        isCritical
          ? "bg-red-500 text-white animate-pulse"
          : isLow
          ? "bg-amber-500 text-white"
          : "bg-muted text-foreground",
        className
      )}
    >
      <Clock className="w-4 h-4" />
      <span>{timeRemaining}s</span>

      {/* Progress bar */}
      <div className="w-16 h-1.5 bg-black/20 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-100 rounded-full",
            isCritical ? "bg-white" : isLow ? "bg-white" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
