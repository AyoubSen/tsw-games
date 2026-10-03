/** How well a bot plays. Normal is the original behaviour; bots saved before levels existed play at normal. */
export const BOT_LEVELS = ["easy", "normal", "hard"] as const
export type BotLevel = (typeof BOT_LEVELS)[number]

export const BOT_LEVEL_LABELS: Record<BotLevel, string> = { easy: "Easy", normal: "Normal", hard: "Hard" }

export function isBotLevel(value: unknown): value is BotLevel {
  return typeof value === "string" && (BOT_LEVELS as readonly string[]).includes(value)
}
