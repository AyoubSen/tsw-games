import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  profiles: defineTable({
    clerkUserId: v.string(),
    displayName: v.string(),
    color: v.string(),
    cosmetics: v.object({
      pool: v.optional(v.object({
        cue: v.optional(v.string()),
        ballSet: v.optional(v.string()),
        cloth: v.optional(v.string()),
      })),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerk", ["clerkUserId"]),

  gameStats: defineTable({
    clerkUserId: v.string(),
    game: v.string(),
    played: v.number(),
    wins: v.number(),
    /** The part of played/wins that had a bot at the table. Missing on rows from before bots were counted apart. */
    botPlayed: v.optional(v.number()),
    botWins: v.optional(v.number()),
    lastPlayedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_user_game", ["clerkUserId", "game"]),

  gameResults: defineTable({
    resultId: v.string(),
    game: v.string(),
    vsBot: v.boolean(),
    players: v.array(v.object({ clerkUserId: v.string(), won: v.boolean() })),
    reportedAt: v.number(),
  }).index("by_result", ["resultId"]),
})
