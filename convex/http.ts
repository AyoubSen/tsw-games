import { httpRouter } from "convex/server"
import { internal } from "./_generated/api"
import { httpAction } from "./_generated/server"

/** Server-to-server routes for PartyKit, guarded by a shared secret. */
const fromPartyKit = (request: Request) => {
  const secret = process.env.PARTYKIT_SECRET
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`
}

const http = httpRouter()

http.route({
  path: "/partykit/profile",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!fromPartyKit(request)) return new Response("Unauthorized", { status: 401 })
    const { clerkUserId } = (await request.json()) as { clerkUserId?: unknown }
    if (typeof clerkUserId !== "string") return new Response("Bad request", { status: 400 })
    const profile = await ctx.runQuery(internal.profiles.publicProfile, { clerkUserId })
    return profile ? Response.json(profile) : new Response("Not found", { status: 404 })
  }),
})

http.route({
  path: "/partykit/result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!fromPartyKit(request)) return new Response("Unauthorized", { status: 401 })
    try {
      await ctx.runMutation(internal.results.record, await request.json())
    } catch (error) {
      console.error("Rejected game result", error)
      return new Response("Bad request", { status: 400 })
    }
    return new Response(null, { status: 204 })
  }),
})

export default http
