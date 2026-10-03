/** Quick table reactions shared by the Uno, poker and Parcheesi rooms. */
export const REACTIONS = ["👏", "😂", "😱", "😤", "🔥", "GG", "Nice hand", "Nice try"] as const
export type Reaction = (typeof REACTIONS)[number]

/** Minimum gap between two reactions from the same seat; the server enforces it. */
export const REACTION_COOLDOWN_MS = 3000
/** How long a bubble stays over the sender's seat. */
export const REACTION_SHOW_MS = 2600

/** Sent to every client; `delayMs` lets a bot's reaction wait for the table to finish replaying the moment. */
export interface ReactionMessage {
  type: "reaction"
  playerId: string
  reaction: Reaction
  delayMs?: number
}

export function isReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTIONS as readonly string[]).includes(value)
}

/** Server-side spam guard: true (and records the time) when this seat may react again. Allows for network jitter against the client's own cooldown. */
export function takeReactionSlot(lastAt: Map<string, number>, playerId: string, at = Date.now()): boolean {
  if (at - (lastAt.get(playerId) ?? -Infinity) < REACTION_COOLDOWN_MS - 300) return false
  lastAt.set(playerId, at)
  return true
}

/** "GG" and the phrases, as opposed to the emoji. */
export function isWordReaction(reaction: Reaction) {
  return /[a-z]/i.test(reaction)
}

export function pickReaction(options: readonly Reaction[]): Reaction {
  return options[Math.floor(Math.random() * options.length)]!
}
