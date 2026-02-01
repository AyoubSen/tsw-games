import { useState, useEffect } from "react"
import { Moon, Sun, Sunrise, Gavel, Skull, Eye } from "lucide-react"
import type { GamePhase } from "../../../../../party/mafia"

interface PhaseHeaderProps {
  phase: GamePhase
  dayNumber: number
  phaseEndTime: number | null
}

const PHASE_CONFIG: Record<GamePhase, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  "waiting": { label: "Waiting", icon: null, bg: "bg-zinc-800", text: "text-zinc-300" },
  "role-reveal": { label: "Role Reveal", icon: <Eye className="w-5 h-5" />, bg: "bg-purple-900/80", text: "text-purple-200" },
  "first-night": { label: "First Night", icon: <Moon className="w-5 h-5" />, bg: "bg-indigo-950/80", text: "text-indigo-200" },
  "night": { label: "Night", icon: <Moon className="w-5 h-5" />, bg: "bg-indigo-950/80", text: "text-indigo-200" },
  "dawn": { label: "Dawn", icon: <Sunrise className="w-5 h-5" />, bg: "bg-amber-900/60", text: "text-amber-200" },
  "day-discussion": { label: "Discussion", icon: <Sun className="w-5 h-5" />, bg: "bg-sky-900/50", text: "text-sky-200" },
  "day-voting": { label: "Voting", icon: <Gavel className="w-5 h-5" />, bg: "bg-red-900/50", text: "text-red-200" },
  "day-elimination": { label: "Elimination", icon: <Skull className="w-5 h-5" />, bg: "bg-red-950/60", text: "text-red-200" },
  "hunter-revenge": { label: "Hunter's Revenge", icon: <Skull className="w-5 h-5" />, bg: "bg-orange-950/60", text: "text-orange-200" },
  "game-over": { label: "Game Over", icon: null, bg: "bg-zinc-800", text: "text-zinc-200" },
}

export function PhaseHeader({ phase, dayNumber, phaseEndTime }: PhaseHeaderProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!phaseEndTime) {
      setTimeLeft(null)
      return
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((phaseEndTime - Date.now()) / 1000))
      setTimeLeft(remaining)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [phaseEndTime])

  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.waiting

  return (
    <div className={`${config.bg} ${config.text} px-4 py-3 flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        {config.icon}
        <span className="font-semibold">{config.label}</span>
        {dayNumber > 0 && (
          <span className="text-sm opacity-70">- Day {dayNumber}</span>
        )}
      </div>
      {timeLeft !== null && timeLeft > 0 && (
        <div className={`font-mono text-lg font-bold ${timeLeft <= 5 ? "text-red-400 animate-pulse" : ""}`}>
          {timeLeft}s
        </div>
      )}
    </div>
  )
}
