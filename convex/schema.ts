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
    /** Game-specific stats, only ever from game servers. solvedIn[i] counts rounds solved in i + 1 guesses. */
    wordle: v.optional(v.object({ streak: v.number(), bestStreak: v.number(), solvedIn: v.array(v.number()), failed: v.number() })),
    /** Average accuracy is accuracyTotal / timedRaces. */
    typerace: v.optional(v.object({ bestWpm: v.number(), accuracyTotal: v.number(), timedRaces: v.number() })),
    pool: v.optional(v.object({ runOuts: v.number(), breakAndRuns: v.number() })),
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

  /** One row per signed-in player per result, so a user's history can be read by time. */
  userGames: defineTable({
    clerkUserId: v.string(),
    game: v.string(),
    vsBot: v.boolean(),
    won: v.boolean(),
    /** The other signed-in players in the same result. */
    opponents: v.array(v.object({ clerkUserId: v.string(), won: v.boolean() })),
    playedAt: v.number(),
  }).index("by_user", ["clerkUserId", "playedAt"]),

  /** Running record of one user against another signed-in player. Both directions are stored. */
  headToHead: defineTable({
    clerkUserId: v.string(),
    opponentId: v.string(),
    played: v.number(),
    /** Games this user won and the opponent did not, and the reverse. Shared wins and shared losses count as played only. */
    wins: v.number(),
    losses: v.number(),
    lastPlayedAt: v.number(),
  }).index("by_pair", ["clerkUserId", "opponentId"]),
})
