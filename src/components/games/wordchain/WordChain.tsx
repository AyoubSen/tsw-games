import { useRef, useEffect } from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface WordChainProps {
  words: string[]
  className?: string
}

export function WordChain({ words, className }: WordChainProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the end when new words are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth
    }
  }, [words.length])

  if (words.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground py-8", className)}>
        Waiting for game to start...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex items-center gap-2 overflow-x-auto py-4 px-2 scrollbar-thin",
        className
      )}
    >
      {words.map((word, index) => {
        const isLast = index === words.length - 1
        const isFirst = index === 0
        const lastLetter = word[word.length - 1].toUpperCase()

        return (
          <div key={index} className="flex items-center gap-2 shrink-0">
            <div
              className={cn(
                "px-4 py-2 rounded-lg font-mono text-lg font-bold uppercase tracking-wider transition-all",
                isFirst && "bg-primary/20 text-primary border-2 border-primary/30",
                isLast && !isFirst && "bg-green-500/20 text-green-600 border-2 border-green-500/30 animate-pulse",
                !isFirst && !isLast && "bg-muted text-foreground"
              )}
            >
              {word.split("").map((letter, letterIndex) => (
                <span
                  key={letterIndex}
                  className={cn(
                    letterIndex === word.length - 1 && !isLast && "text-primary font-extrabold"
                  )}
                >
                  {letter}
                </span>
              ))}
            </div>
            {!isLast && (
              <div className="flex items-center text-muted-foreground">
                <ArrowRight className="w-4 h-4" />
                <span className="text-xs font-bold text-primary ml-1">{lastLetter}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
