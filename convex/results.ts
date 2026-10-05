import { v } from "convex/values"
import { internalMutation } from "./_generated/server"

/** Records a finished game reported by a PartyKit server. Repeats of a resultId are ignored. */
export const record = internalMutation({
  args: {
    resultId: v.string(),
    game: v.string(),
    vsBot: v.boolean(),
    players: v.array(v.object({ userId: v.string(), won: v.boolean() })),
  },
  handler: async (ctx, { resultId, game, vsBot, players }) => {
    const existing = await ctx.db
      .query("gameResults")
      .withIndex("by_result", (q) => q.eq("resultId", resultId))
      .unique()
    if (existing) return

    const now = Date.now()
    const recorded: { clerkUserId: string; won: boolean }[] = []
    for (const { userId, won } of players) {
      if (recorded.some((player) => player.clerkUserId === userId)) continue
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_clerk", (q) => q.eq("clerkUserId", userId))
        .unique()
      if (!profile) continue
      recorded.push({ clerkUserId: userId, won })
      const stats = await ctx.db
        .query("gameStats")
        .withIndex("by_user_game", (q) => q.eq("clerkUserId", userId).eq("game", game))
        .unique()
      const win = won ? 1 : 0
      const bot = vsBot ? 1 : 0
      if (stats) {
        await ctx.db.patch(stats._id, {
          played: stats.played + 1,
          wins: stats.wins + win,
          botPlayed: (stats.botPlayed ?? 0) + bot,
          botWins: (stats.botWins ?? 0) + bot * win,
          lastPlayedAt: now,
        })
      } else {
        await ctx.db.insert("gameStats", { clerkUserId: userId, game, played: 1, wins: win, botPlayed: bot, botWins: bot * win, lastPlayedAt: now })
      }
    }
    await ctx.db.insert("gameResults", { resultId, game, vsBot, players: recorded, reportedAt: now })
  },
})
