import { v } from "convex/values"
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server"
import { cleanDisplayName, PROFILE_COLORS } from "./profileColors"

function profileFor(ctx: QueryCtx, clerkUserId: string) {
  return ctx.db
    .query("profiles")
    .withIndex("by_clerk", (q) => q.eq("clerkUserId", clerkUserId))
    .unique()
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return profileFor(ctx, identity.subject)
  },
})

/** Creates the signed-in user's profile on first visit. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not signed in")
    const existing = await profileFor(ctx, identity.subject)
    if (existing) return existing._id
    const now = Date.now()
    return ctx.db.insert("profiles", {
      clerkUserId: identity.subject,
      displayName: cleanDisplayName(identity.nickname ?? identity.givenName ?? identity.name ?? "") || "Player",
      color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)],
      cosmetics: {},
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: { displayName: v.string(), color: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not signed in")
    const profile = await profileFor(ctx, identity.subject)
    if (!profile) throw new Error("Profile not found")
    const displayName = cleanDisplayName(args.displayName)
    if (!displayName) throw new Error("Enter a display name")
    if (!(PROFILE_COLORS as readonly string[]).includes(args.color)) throw new Error("Pick one of the colours")
    await ctx.db.patch(profile._id, { displayName, color: args.color, updatedAt: Date.now() })
  },
})

export const myStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return ctx.db
      .query("gameStats")
      .withIndex("by_user", (q) => q.eq("clerkUserId", identity.subject))
      .collect()
  },
})

/** Name and colour of another player, without their account id. */
async function opponentFor(ctx: QueryCtx, clerkUserId: string) {
  const profile = await profileFor(ctx, clerkUserId)
  return { displayName: profile?.displayName ?? "Player", color: profile?.color ?? "#94a3b8" }
}

export const myRecentGames = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const games = await ctx.db
      .query("userGames")
      .withIndex("by_user", (q) => q.eq("clerkUserId", identity.subject))
      .order("desc")
      .take(20)
    return Promise.all(
      games.map(async (game) => ({
        _id: game._id,
        game: game.game,
        vsBot: game.vsBot,
        won: game.won,
        playedAt: game.playedAt,
        opponents: await Promise.all(
          game.opponents.map(async (opponent) => ({ ...(await opponentFor(ctx, opponent.clerkUserId)), won: opponent.won })),
        ),
      })),
    )
  },
})

export const myHeadToHead = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    const records = await ctx.db
      .query("headToHead")
      .withIndex("by_pair", (q) => q.eq("clerkUserId", identity.subject))
      .collect()
    const top = records.sort((a, b) => b.played - a.played || b.lastPlayedAt - a.lastPlayedAt).slice(0, 10)
    return Promise.all(
      top.map(async (record) => ({
        _id: record._id,
        ...(await opponentFor(ctx, record.opponentId)),
        played: record.played,
        wins: record.wins,
        losses: record.losses,
      })),
    )
  },
})

/** Used by PartyKit (through http.ts) to resolve a verified Clerk user to their profile name. */
export const publicProfile = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const profile = await profileFor(ctx, clerkUserId)
    return profile ? { displayName: profile.displayName, color: profile.color } : null
  },
})
