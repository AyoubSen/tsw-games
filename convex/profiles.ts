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

/** Used by PartyKit (through http.ts) to resolve a verified Clerk user to their profile name. */
export const publicProfile = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const profile = await profileFor(ctx, clerkUserId)
    return profile ? { displayName: profile.displayName, color: profile.color } : null
  },
})
