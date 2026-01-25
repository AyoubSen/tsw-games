import { useState, useRef, useEffect } from "react"
import { Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface WordInputProps {
  mustStartWith: string
  onSubmit: (word: string) => void
  disabled: boolean
  placeholder?: string
}

const MIN_WORD_LENGTH = 2
const MAX_WORD_LENGTH = 20

export function WordInput({
  mustStartWith,
  onSubmit,
  disabled,
  placeholder = "Enter a word...",
}: WordInputProps) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when not disabled
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus()
    }
  }, [disabled])

  // Clear input when mustStartWith changes (new turn)
  useEffect(() => {
    setValue("")
    setError(null)
  }, [mustStartWith])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase().slice(0, MAX_WORD_LENGTH)
    // Only allow letters
    const lettersOnly = newValue.replace(/[^A-Z]/g, "")
    setValue(lettersOnly)
    setError(null)
  }

  const handleSubmit = async () => {
    if (disabled || value.length < MIN_WORD_LENGTH || isValidating) return

    const word = value.toLowerCase()

    // Check if starts with correct letter
    if (mustStartWith && word[0] !== mustStartWith.toLowerCase()) {
      setError(`Word must start with "${mustStartWith}"`)
      return
    }

    // Submit the word - server will validate if it's a real word
    setIsValidating(true)
    try {
      onSubmit(word)
      setValue("")
      setError(null)
    } finally {
      setIsValidating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit()
    }
  }

  const startsCorrectly = !mustStartWith || value.length === 0 || value[0] === mustStartWith.toUpperCase()
  const isLongEnough = value.length >= MIN_WORD_LENGTH
  const canSubmit = !disabled && isLongEnough && startsCorrectly && !isValidating

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {mustStartWith && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-primary">
              {mustStartWith}
            </div>
          )}
          <Input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isValidating}
            placeholder={placeholder}
            className={cn(
              "text-lg font-mono uppercase tracking-wider h-12",
              mustStartWith && "pl-10",
              error && "border-destructive focus-visible:ring-destructive",
              !startsCorrectly && value.length > 0 && "border-destructive"
            )}
            maxLength={MAX_WORD_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          className="h-12 px-6"
        >
          {isValidating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {!startsCorrectly && value.length > 0 && !error && (
        <p className="text-sm text-destructive text-center">
          Word must start with "{mustStartWith}"
        </p>
      )}

      {value.length > 0 && value.length < MIN_WORD_LENGTH && !error && startsCorrectly && (
        <p className="text-sm text-muted-foreground text-center">
          Word must be at least {MIN_WORD_LENGTH} letters
        </p>
      )}
    </div>
  )
}
