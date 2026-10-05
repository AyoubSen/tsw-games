import { verifyToken } from "@clerk/backend"
import type * as Party from "partykit/server"

/** A signed-in player, with the name and colour from their Convex profile. */
export interface VerifiedAccount {
  userId: string
  displayName: string
  color: string
}

export interface GameResultReport {
  /** Unique per finished game; Convex ignores repeats. */
  resultId: string
  game: string
  vsBot: boolean
  players: { userId: string; won: boolean }[]
}

function readEnv(room: Party.Room, key: string): string | null {
  const value = room.env[key]
  return typeof value === "string" && value ? value : null
}

function convexEndpoint(room: Party.Room, path: string) {
  const site = readEnv(room, "CONVEX_SITE_URL")
  const secret = readEnv(room, "PARTYKIT_SECRET")
  if (!site || !secret) return null
  return {
    url: `${site.replace(/\/$/, "")}${path}`,
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
  }
}

/**
 * Resolves a Clerk session token sent with `join` to the player's profile.
 * Anything missing or invalid means "guest" - this never throws.
 */
export async function verifyAccount(room: Party.Room, authToken: unknown): Promise<VerifiedAccount | null> {
  if (typeof authToken !== "string" || !authToken) return null
  // CLERK_JWT_KEY (PEM) verifies offline; otherwise the secret key fetches Clerk's JWKS, which is cached.
  const jwtKey = readEnv(room, "CLERK_JWT_KEY")?.replace(/\\n/g, "\n")
  const secretKey = readEnv(room, "CLERK_SECRET_KEY")
  const endpoint = convexEndpoint(room, "/partykit/profile")
  if ((!jwtKey && !secretKey) || !endpoint) return null
  try {
    const claims = await verifyToken(authToken, {
      ...(jwtKey ? { jwtKey } : { secretKey: secretKey! }),
      authorizedParties: readEnv(room, "CLERK_AUTHORIZED_PARTIES")
        ?.split(",")
        .map((party) => party.trim())
        .filter(Boolean),
    })
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: endpoint.headers,
      body: JSON.stringify({ clerkUserId: claims.sub }),
    })
    if (!response.ok) return null
    const profile = (await response.json()) as { displayName?: unknown; color?: unknown }
    if (typeof profile.displayName !== "string" || !profile.displayName || typeof profile.color !== "string") return null
    return { userId: claims.sub, displayName: profile.displayName.slice(0, 20), color: profile.color }
  } catch (error) {
    console.warn("Clerk token rejected", error)
    return null
  }
}

/** Sends a finished game to Convex. Failures are logged, never thrown. */
export async function reportResult(room: Party.Room, report: GameResultReport): Promise<void> {
  if (report.players.length === 0) return
  const endpoint = convexEndpoint(room, "/partykit/result")
  if (!endpoint) return
  try {
    const response = await fetch(endpoint.url, { method: "POST", headers: endpoint.headers, body: JSON.stringify(report) })
    if (!response.ok) console.error("Convex rejected game result", response.status, report.resultId)
  } catch (error) {
    console.error("Could not report game result", error)
  }
}
