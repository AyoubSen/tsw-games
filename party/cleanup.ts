import type * as Party from "partykit/server"
import { CLEANUP_PATH, CLEANUP_VERIFY_PATH, type CleanupEntry } from "./shared/cleanup"

const ENTRY_PREFIX = "entry:"

function entryKey(party: string, roomId: string) {
  return `${ENTRY_PREFIX}${party}:${roomId}`
}

function validEntry(value: unknown): value is CleanupEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<CleanupEntry>
  return typeof entry.party === "string" && entry.party.length > 0 &&
    typeof entry.roomId === "string" && entry.roomId.length > 0 &&
    typeof entry.token === "string" && entry.token.length > 0 &&
    typeof entry.deadline === "number" && Number.isFinite(entry.deadline)
}

export default class CleanupRegistryParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async entries() {
    const result: CleanupEntry[] = []
    let start = ENTRY_PREFIX
    while (true) {
      const page = await this.room.storage.list<CleanupEntry>({ start, end: `${ENTRY_PREFIX}\uffff`, limit: 1000 })
      const records = [...page.entries()]
      result.push(...records.map(([, entry]) => entry).filter(validEntry))
      if (records.length < 1000) return result
      start = `${records.at(-1)![0]}\u0000`
    }
  }

  async onRequest(request: Party.Request) {
    const path = `/${new URL(request.url).pathname.split("/").at(-1) ?? ""}`
    if (request.method !== "POST") return new Response("Not found", { status: 404 })

    if (path === "/run") {
      const due = (await this.entries()).filter((entry) => entry.deadline <= Date.now())
      for (const entry of due) {
        const key = entryKey(entry.party, entry.roomId)
        try {
          const party = this.room.context.parties[entry.party]
          if (!party) { await this.room.storage.delete(key); continue }
          const response = await party.get(entry.roomId).fetch(CLEANUP_PATH, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: entry.token }),
          })
          if (response.ok || response.status === 409 || response.status === 404) {
            await this.room.storage.transaction(async (transaction) => {
              const current = await transaction.get<CleanupEntry>(key)
              if (current?.token === entry.token) await transaction.delete(key)
            })
          }
        } catch (error) {
          console.error(`Cleanup failed for ${entry.party}/${entry.roomId}:`, error)
        }
      }
      return new Response(null, { status: 204 })
    }

    let candidate: unknown
    try { candidate = await request.json() } catch { return new Response("Invalid cleanup entry", { status: 400 }) }
    if (!validEntry(candidate)) return new Response("Invalid cleanup entry", { status: 400 })
    const key = entryKey(candidate.party, candidate.roomId)

    if (path === "/register") {
      const party = this.room.context.parties[candidate.party]
      if (!party) return new Response("Unknown cleanup party", { status: 400 })
      const verification = await party.get(candidate.roomId).fetch(CLEANUP_VERIFY_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: candidate.token }),
      })
      if (!verification.ok) return new Response("Cleanup token rejected", { status: 409 })
      await this.room.storage.put(key, candidate)
      return new Response(null, { status: 204 })
    }
    return new Response("Not found", { status: 404 })
  }
}
