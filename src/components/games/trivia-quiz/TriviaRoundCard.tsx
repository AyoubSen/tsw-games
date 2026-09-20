import { CheckCircle2, Clock3, XCircle } from "lucide-react"
import type { TriviaChoice, TriviaFormat } from "@/lib/trivia"

interface TriviaRoundCardProps {
  categoryLabel: string
  format: TriviaFormat
  prompt: string
  choices: TriviaChoice[]
  selectedChoiceId: string | null
  correctChoiceId: string | null
  explanation: string | null
  secondsRemaining: number
  totalSeconds: number
  disabled?: boolean
  pointsEarned?: number | null
  onAnswer: (choiceId: string) => void
}

const LETTERS = ["A", "B", "C", "D"]

const FORMAT_LABELS: Record<TriviaFormat, string> = {
  direct: "Quick fact",
  inverse: "Find the match",
  category: "Category check",
  pair: "Real pairing",
  comparison: "Rank it",
}

export function TriviaRoundCard({
  categoryLabel,
  format,
  prompt,
  choices,
  selectedChoiceId,
  correctChoiceId,
  explanation,
  secondsRemaining,
  totalSeconds,
  disabled = false,
  pointsEarned,
  onAnswer,
}: TriviaRoundCardProps) {
  const revealing = Boolean(correctChoiceId)
  const progress = Math.max(
    0,
    Math.min(100, (secondsRemaining / Math.max(1, totalSeconds)) * 100),
  )

  return (
    <div className="overflow-hidden rounded-[2rem] border bg-card shadow-xl shadow-fuchsia-500/5">
      <div className="h-1.5 bg-muted">
        <div
          className={`h-full transition-[width] duration-200 ${
            secondsRemaining <= 5 ? "bg-rose-500" : "bg-fuchsia-500"
          }`}
          style={{ width: `${revealing ? 100 : progress}%` }}
        />
      </div>
      <div className="p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-fuchsia-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
              {categoryLabel}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {FORMAT_LABELS[format]}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm font-bold">
            <Clock3 className="h-4 w-4" />
            {revealing ? "Reveal" : `${secondsRemaining}s`}
          </span>
        </div>

        <h2 className="my-8 text-balance text-2xl font-black leading-tight sm:text-4xl">
          {prompt}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {choices.map((choice, index) => {
            const correct = revealing && choice.id === correctChoiceId
            const selectedWrong =
              revealing &&
              choice.id === selectedChoiceId &&
              choice.id !== correctChoiceId
            const selected = !revealing && choice.id === selectedChoiceId
            return (
              <button
                key={choice.id}
                type="button"
                disabled={disabled || revealing || Boolean(selectedChoiceId)}
                onClick={() => onAnswer(choice.id)}
                className={`group flex min-h-20 items-center gap-3 rounded-2xl border px-4 py-3 text-left font-semibold transition-all sm:min-h-24 ${
                  correct
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                    : selectedWrong
                      ? "border-rose-500 bg-rose-500/15 text-rose-800 dark:text-rose-200"
                      : selected
                        ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-200"
                        : revealing
                          ? "opacity-45"
                          : "hover:-translate-y-0.5 hover:border-fuchsia-500/60 hover:bg-fuchsia-500/5"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-xs font-black">
                  {LETTERS[index]}
                </span>
                <span className="flex-1">{choice.label}</span>
                {correct && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                {selectedWrong && <XCircle className="h-5 w-5 shrink-0" />}
              </button>
            )
          })}
        </div>

        <div className="mt-5 min-h-16 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          {revealing ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {selectedChoiceId === correctChoiceId
                    ? "Correct answer"
                    : selectedChoiceId
                      ? "Not this time"
                      : "Time ran out"}
                </p>
                <p className="mt-1 text-muted-foreground">{explanation}</p>
              </div>
              {pointsEarned !== null && pointsEarned !== undefined && (
                <span className="shrink-0 text-lg font-black text-fuchsia-600 dark:text-fuchsia-300">
                  +{pointsEarned}
                </span>
              )}
            </div>
          ) : selectedChoiceId ? (
            <p className="font-medium">Answer locked. Waiting for the reveal...</p>
          ) : (
            <p className="text-muted-foreground">
              Pick one answer. Faster correct answers earn up to 500 bonus points.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
