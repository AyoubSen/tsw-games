import { cn } from "@/lib/utils"

interface TextDisplayProps {
  text: string
  typedText: string
  className?: string
}

export function TextDisplay({ text, typedText, className }: TextDisplayProps) {
  return (
    <div className={cn("font-mono text-lg leading-relaxed select-none", className)}>
      {text.split("").map((char, index) => {
        const typedChar = typedText[index]
        const isTyped = index < typedText.length
        const isCorrect = typedChar === char
        const isCurrent = index === typedText.length

        return (
          <span
            key={index}
            className={cn(
              "transition-colors",
              isTyped && isCorrect && "text-green-500",
              isTyped && !isCorrect && "text-red-500 bg-red-500/20",
              !isTyped && "text-muted-foreground",
              isCurrent && "border-l-2 border-primary animate-pulse"
            )}
          >
            {char}
          </span>
        )
      })}
    </div>
  )
}
