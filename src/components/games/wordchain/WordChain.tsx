import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { Player } from "../../../../party/wordchain"

interface WordChainProps {
  words: string[]
  authors?: string[]
  players?: Record<string, Player>
  localPlayerId?: string
  className?: string
}

export function WordChain({
  words,
  authors = [],
  players = {},
  localPlayerId,
  className,
}: WordChainProps) {
  const endRef = useRef<HTMLDivElement>(null)

  // Keep the newest word in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [words.length])

  if (words.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground py-8", className)}>
        Waiting for game to start...
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-1 py-1", className)}>
      {words.map((word, index) => {
        const isLast = index === words.length - 1
        const isFirst = index === 0
        const authorId = authors[index]
        const author = authorId ? players[authorId] : undefined
        const isMine = !!authorId && authorId === localPlayerId
        const head = word.slice(0, -1)
        const tail = word.slice(-1)

        return (
          <div key={index} className="flex items-stretch gap-3">
            {/* Connector rail */}
            <div className="flex w-6 shrink-0 flex-col items-center">
              <div
                className={cn(
                  "w-px flex-1",
                  isFirst ? "bg-transparent" : "bg-border"
                )}
              />
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold uppercase",
                  isLast
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {isFirst ? "1" : index + 1}
              </div>
              <div
                className={cn(
                  "w-px flex-1",
                  isLast ? "bg-transparent" : "bg-border"
                )}
              />
            </div>

            {/* Word row */}
            <div
              className={cn(
                "flex min-w-0 flex-1 items-baseline gap-2 rounded-lg border px-3 py-2 transition-colors",
                isLast
                  ? "border-primary/40 bg-primary/10"
                  : "border-transparent bg-muted/40",
                isMine && !isLast && "bg-primary/5"
              )}
            >
              <span className="font-mono text-lg font-bold uppercase tracking-wider break-all">
                {head}
                <span className={cn(isLast ? "text-primary" : "text-primary/80", "font-extrabold")}>
                  {tail}
                </span>
              </span>

              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {isFirst && !authorId ? (
                  <span className="uppercase tracking-wide">Start</span>
                ) : (
                  <>
                    {author?.name ?? "—"}
                    {isMine && <span className="ml-1 opacity-70">(you)</span>}
                  </>
                )}
              </span>
            </div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}
