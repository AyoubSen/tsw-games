import { v, type Infer } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"

const resultExtra = v.object({
  wordleRounds: v.optional(v.array(v.number())),
  wpm: v.optional(v.number()),
  accuracy: v.optional(v.number()),
  runOut: v.optional(v.boolean()),
  breakAndRun: v.optional(v.boolean()),
})

type StatExtras = Pick<Doc<"gameStats">, "wordle" | "typerace" | "pool">

/** Folds one player's game-specific numbers into their stats row. */
function withExtra(stats: StatExtras | null, extra: Infer<typeof resultExtra>): Partial<StatExtras> {
  const patch: Partial<StatExtras> = {}
  const rounds = extra.wordleRounds?.filter((guesses) => Number.isInteger(guesses) && guesses >= 0 && guesses <= 6)
  if (rounds?.length) {
    const wordle = stats?.wordle ?? { streak: 0, bestStreak: 0, solvedIn: [0, 0, 0, 0, 0, 0], failed: 0 }
    const solvedIn = [...wordle.solvedIn]
    let { streak, bestStreak, failed } = wordle
    for (const guesses of rounds) {
      if (guesses === 0) {
        failed += 1
        streak = 0
      } else {
        solvedIn[guesses - 1] = (solvedIn[guesses - 1] ?? 0) + 1
        streak += 1
        bestStreak = Math.max(bestStreak, streak)
      }
    }
    patch.wordle = { streak, bestStreak, solvedIn, failed }
  }
  if (extra.wpm !== undefined && extra.accuracy !== undefined && extra.wpm > 0 && extra.wpm <= 300) {
    const typerace = stats?.typerace ?? { bestWpm: 0, accuracyTotal: 0, timedRaces: 0 }
    patch.typerace = {
      bestWpm: Math.max(typerace.bestWpm, Math.round(extra.wpm)),
      accuracyTotal: typerace.accuracyTotal + Math.min(100, Math.max(0, extra.accuracy)),
      timedRaces: typerace.timedRaces + 1,
    }
  }
  if (extra.runOut) {
    const pool = stats?.pool ?? { runOuts: 0, breakAndRuns: 0 }
    patch.pool = { runOuts: pool.runOuts + 1, breakAndRuns: pool.breakAndRuns + (extra.breakAndRun ? 1 : 0) }
  }
  return patch
}

/** Records a finished game reported by a PartyKit server. Repeats of a resultId are ignored. */
export const record = internalMutation({
  args: {
    resultId: v.string(),
    game: v.string(),
    vsBot: v.boolean(),
    players: v.array(v.object({ userId: v.string(), won: v.boolean(), extra: v.optional(resultExtra) })),
  },
  handler: async (ctx, { resultId, game, vsBot, players }) => {
    const existing = await ctx.db
      .query("gameResults")
      .withIndex("by_result", (q) => q.eq("resultId", resultId))
      .unique()
    if (existing) return

    const now = Date.now()
    const recorded: { clerkUserId: string; won: boolean }[] = []
    for (const { userId, won, extra } of players) {
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
      const extras = extra ? withExtra(stats, extra) : {}
      if (stats) {
        await ctx.db.patch(stats._id, {
          played: stats.played + 1,
          wins: stats.wins + win,
          botPlayed: (stats.botPlayed ?? 0) + bot,
          botWins: (stats.botWins ?? 0) + bot * win,
          ...extras,
          lastPlayedAt: now,
        })
      } else {
        await ctx.db.insert("gameStats", { clerkUserId: userId, game, played: 1, wins: win, botPlayed: bot, botWins: bot * win, ...extras, lastPlayedAt: now })
      }
    }
    await ctx.db.insert("gameResults", { resultId, game, vsBot, players: recorded, reportedAt: now })

    for (const player of recorded) {
      const opponents = recorded.filter((other) => other.clerkUserId !== player.clerkUserId)
      await ctx.db.insert("userGames", { clerkUserId: player.clerkUserId, game, vsBot, won: player.won, opponents, playedAt: now })
      for (const opponent of opponents) {
        const win = player.won && !opponent.won ? 1 : 0
        const loss = opponent.won && !player.won ? 1 : 0
        const record = await ctx.db
          .query("headToHead")
          .withIndex("by_pair", (q) => q.eq("clerkUserId", player.clerkUserId).eq("opponentId", opponent.clerkUserId))
          .unique()
        if (record) {
          await ctx.db.patch(record._id, { played: record.played + 1, wins: record.wins + win, losses: record.losses + loss, lastPlayedAt: now })
        } else {
          await ctx.db.insert("headToHead", { clerkUserId: player.clerkUserId, opponentId: opponent.clerkUserId, played: 1, wins: win, losses: loss, lastPlayedAt: now })
        }
      }
    }
  },
})
