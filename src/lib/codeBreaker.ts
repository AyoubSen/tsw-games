export const CODE_COLORS = [
  "ruby",
  "amber",
  "lime",
  "cyan",
  "indigo",
  "violet",
] as const

export type CodeColor = (typeof CODE_COLORS)[number]

export interface GuessResult {
  guess: CodeColor[]
  exact: number
  close: number
}

export const CODE_LENGTH = 4
export const MAX_ATTEMPTS = 8

export function isCodeColor(value: unknown): value is CodeColor {
  return CODE_COLORS.includes(value as CodeColor)
}

export function isValidCodeGuess(value: unknown): value is CodeColor[] {
  return (
    Array.isArray(value) &&
    value.length === CODE_LENGTH &&
    value.every(isCodeColor) &&
    new Set(value).size === CODE_LENGTH
  )
}

export function generateSecretCode(
  random: () => number = Math.random,
): CodeColor[] {
  const colors = [...CODE_COLORS]
  for (let index = colors.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = colors[index]
    colors[index] = colors[swapIndex]
    colors[swapIndex] = current
  }
  return colors.slice(0, CODE_LENGTH)
}

export function evaluateCodeGuess(
  secret: readonly CodeColor[],
  guess: readonly CodeColor[],
): GuessResult {
  let exact = 0
  const remainingSecret = new Map<CodeColor, number>()

  for (let index = 0; index < CODE_LENGTH; index++) {
    if (secret[index] === guess[index]) {
      exact += 1
      continue
    }
    const color = secret[index]
    if (color) {
      remainingSecret.set(color, (remainingSecret.get(color) ?? 0) + 1)
    }
  }

  let close = 0
  for (let index = 0; index < CODE_LENGTH; index++) {
    const color = guess[index]
    if (!color || secret[index] === color) continue
    const available = remainingSecret.get(color) ?? 0
    if (available === 0) continue
    close += 1
    remainingSecret.set(color, available - 1)
  }

  return { guess: [...guess], exact, close }
}
