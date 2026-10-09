import { Flame, RotateCcw, Send, Target, Timer, Trophy } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { generateQuickMathProblem, levelForSolved, QUICK_MATH_LEVELS, type QuickMathProblem } from "@/lib/quickMath"
import { playSound } from "@/lib/sounds"
import { cn } from "@/lib/utils"

export const SPRINT_SECONDS = 60
const WRONG_PENALTY_MS = 3000

interface Sprint {
  endsAt: number
  problem: QuickMathProblem
  solved: number
  wrong: number
  streak: number
  bestStreak: number
}

function newSprint(): Sprint {
  return { endsAt: Date.now() + SPRINT_SECONDS * 1000, problem: generateQuickMathProblem(0), solved: 0, wrong: 0, streak: 0, bestStreak: 0 }
}

/** 60 seconds, as many answers as you can; a level up every five, and a wrong answer costs three seconds. */
export function SoloSprint() {
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [value, setValue] = useState("")
  const [flash, setFlash] = useState<{ kind: "right" | "wrong"; at: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const msLeft = sprint ? Math.max(0, sprint.endsAt - now) : 0
  const running = Boolean(sprint) && msLeft > 0
  const done = Boolean(sprint) && msLeft === 0

  useEffect(() => {
    if (!sprint || done) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [sprint, done])

  useEffect(() => {
    if (done) playSound("win")
  }, [done])

  useEffect(() => {
    if (running) inputRef.current?.focus()
  }, [running])

  const start = () => {
    setSprint(newSprint())
    setNow(Date.now())
    setValue("")
    setFlash(null)
  }

  const submit = () => {
    if (!sprint || !running || !value) return
    if (Number(value) === sprint.problem.answer) {
      const solved = sprint.solved + 1
      const streak = sprint.streak + 1
      setSprint({
        ...sprint,
        solved,
        streak,
        bestStreak: Math.max(sprint.bestStreak, streak),
        problem: generateQuickMathProblem(levelForSolved(solved), sprint.problem.text),
      })
      setFlash({ kind: "right", at: Date.now() })
      playSound("correct")
    } else {
      setSprint({ ...sprint, wrong: sprint.wrong + 1, streak: 0, endsAt: sprint.endsAt - WRONG_PENALTY_MS })
      setFlash({ kind: "wrong", at: Date.now() })
      playSound("wrong")
    }
    setValue("")
    inputRef.current?.focus()
  }

  if (!sprint) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-5 pt-6 text-center">
          <Timer className="mx-auto h-10 w-10 text-primary" />
          <div>
            <h2 className="text-2xl font-black">{SPRINT_SECONDS}-second sprint</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Answer as many as you can. Every five correct answers the problems get harder. A wrong answer costs {WRONG_PENALTY_MS / 1000} seconds.
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={start}>Start sprint</Button>
        </CardContent>
      </Card>
    )
  }

  if (done) {
    const attempts = sprint.solved + sprint.wrong
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-6 pt-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-amber-500" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Time's up</p>
            <p className="mt-1 text-6xl font-black tabular-nums">{sprint.solved}</p>
            <p className="text-sm text-muted-foreground">correct answers</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Stat icon={<Target className="h-4 w-4" />} label="Accuracy" value={attempts ? `${Math.round((sprint.solved / attempts) * 100)}%` : "–"} />
            <Stat icon={<Flame className="h-4 w-4" />} label="Best streak" value={String(sprint.bestStreak)} />
            <Stat icon={<Timer className="h-4 w-4" />} label="Reached" value={QUICK_MATH_LEVELS[levelForSolved(sprint.solved)]} />
          </div>
          <Button size="lg" className="w-full" onClick={start}>
            <RotateCcw className="mr-2 h-4 w-4" /> Sprint again
          </Button>
        </CardContent>
      </Card>
    )
  }

  const level = sprint.problem.level
  return (
    <Card className="mx-auto max-w-xl overflow-hidden">
      <div className="h-1.5 bg-muted">
        <div className={cn("h-full transition-[width] duration-100 ease-linear", msLeft <= 10000 ? "bg-rose-500" : "bg-primary")} style={{ width: `${(msLeft / (SPRINT_SECONDS * 1000)) * 100}%` }} />
      </div>
      <CardContent className="space-y-6 pt-5">
        <div className="flex items-center justify-between text-sm">
          <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">{QUICK_MATH_LEVELS[level]}</span>
          <span className="flex items-center gap-3 font-mono font-bold tabular-nums">
            {sprint.streak >= 3 && <span className="flex items-center gap-1 text-orange-500"><Flame className="h-4 w-4" />{sprint.streak}</span>}
            <span>{sprint.solved} solved</span>
            <span className={cn(msLeft <= 10000 && "text-rose-500")}>{Math.ceil(msLeft / 1000)}s</span>
          </span>
        </div>

        <p
          key={`${sprint.problem.text}:${flash?.at ?? 0}`}
          className={cn(
            "py-6 text-center font-mono text-5xl font-black tabular-nums tracking-tight sm:text-6xl",
            flash?.kind === "wrong" ? "animate-shake text-rose-500" : "uno-pop",
          )}
        >
          {sprint.problem.text} <span className="text-muted-foreground">=</span> ?
        </p>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            aria-label="Your answer"
            placeholder="Answer"
            className="h-12 min-w-0 flex-1 rounded-xl border bg-background px-4 text-center font-mono text-base font-black tabular-nums outline-none focus:border-primary sm:text-xl"
          />
          <Button type="submit" size="lg" className="h-12 w-14" disabled={!value} aria-label="Submit answer">
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  )
}
