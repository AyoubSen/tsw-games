import type * as Party from "partykit/server"

export const CLEANUP_PARTY = "cleanup"
export const CLEANUP_REGISTRY_ROOM = "registry"
export const CLEANUP_PATH = "/__cleanup"
export const CLEANUP_VERIFY_PATH = "/__cleanup-verify"
export const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000
const CLEANUP_TOKEN_KEY = "__cleanupToken"

export interface CleanupEntry {
  party: string
  roomId: string
  token: string
  deadline: number
}

type ServerWithRoom = Party.Server & {
  room: Party.Room
  state?: unknown
  roundTimer?: ReturnType<typeof setTimeout> | null
}

type ServerConstructor<T extends ServerWithRoom> = new (room: Party.Room) => T

async function registryFetch(room: Party.Room, path: string, entry: CleanupEntry) {
  return room.context.parties[CLEANUP_PARTY]
    .get(CLEANUP_REGISTRY_ROOM)
    .fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry),
    })
}

async function cancelCleanup(room: Party.Room) {
  const token = await room.storage.get<string>(CLEANUP_TOKEN_KEY)
  if (!token) return
  await room.storage.delete(CLEANUP_TOKEN_KEY)
}

async function scheduleCleanup(room: Party.Room, party: string) {
  if (Array.from(room.getConnections()).length !== 0) return
  const entry: CleanupEntry = {
    party,
    roomId: room.id,
    token: crypto.randomUUID(),
    deadline: Date.now() + CLEANUP_DELAY_MS,
  }
  await room.storage.put(CLEANUP_TOKEN_KEY, entry.token)
  const response = await registryFetch(room, "/register", entry)
  if (!response.ok) throw new Error(`Cleanup registration failed: ${response.status}`)
}

async function handleCleanup(server: ServerWithRoom, request: Party.Request): Promise<Response | null> {
  const url = new URL(request.url)
  const endpoint = `/${url.pathname.split("/").at(-1) ?? ""}`
  if ((endpoint !== CLEANUP_PATH && endpoint !== CLEANUP_VERIFY_PATH) || request.method !== "POST") return null

  let token: unknown
  try {
    token = ((await request.json()) as { token?: unknown }).token
  } catch {
    return new Response("Invalid cleanup request", { status: 400 })
  }
  const expected = await server.room.storage.get<string>(CLEANUP_TOKEN_KEY)
  if (typeof token !== "string" || token !== expected) {
    return new Response("Stale cleanup", { status: 409 })
  }
  if (endpoint === CLEANUP_VERIFY_PATH) return new Response(null, { status: 204 })
  if (Array.from(server.room.getConnections()).length !== 0) {
    await server.room.storage.delete(CLEANUP_TOKEN_KEY)
    return new Response("Room is active", { status: 409 })
  }

  if (server.roundTimer) clearTimeout(server.roundTimer)
  await server.room.storage.deleteAlarm()
  const latestToken = await server.room.storage.get<string>(CLEANUP_TOKEN_KEY)
  if (latestToken !== token || Array.from(server.room.getConnections()).length !== 0) {
    return new Response("Room became active", { status: 409 })
  }
  server.state = null
  await server.room.storage.deleteAll()
  return new Response(null, { status: 204 })
}

export function withRoomCleanup<T extends ServerWithRoom>(Server: ServerConstructor<T>, party: string): ServerConstructor<T> {
  const prototype = Server.prototype as T & {
    onConnect?: (connection: Party.Connection, context: Party.ConnectionContext) => void | Promise<void>
    onClose?: (connection: Party.Connection) => void | Promise<void>
    onError?: (connection: Party.Connection, error: Error) => void | Promise<void>
    onRequest?: (request: Party.Request) => Response | Promise<Response>
  }
  const onConnect = prototype.onConnect
  const onClose = prototype.onClose
  const onError = prototype.onError
  const onRequest = prototype.onRequest

  prototype.onConnect = async function (connection, context) {
    await cancelCleanup(this.room)
    await onConnect?.call(this, connection, context)
  }
  prototype.onClose = async function (connection) {
    try {
      await onClose?.call(this, connection)
    } finally {
      await scheduleCleanup(this.room, party)
    }
  }
  prototype.onError = async function (connection, error) {
    try {
      await onError?.call(this, connection, error)
    } finally {
      await scheduleCleanup(this.room, party)
    }
  }
  prototype.onRequest = async function (request) {
    const cleanupResponse = await handleCleanup(this, request)
    if (cleanupResponse) return cleanupResponse
    return onRequest ? onRequest.call(this, request) : new Response("Not found", { status: 404 })
  }

  return Server
}

export async function runCleanupCron(lobby: Party.CronLobby) {
  const registry = lobby.parties[CLEANUP_PARTY].get(CLEANUP_REGISTRY_ROOM)
  const response = await registry.fetch("/run", { method: "POST" })
  if (!response.ok) throw new Error(`Cleanup registry returned ${response.status}`)
}
