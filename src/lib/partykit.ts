import PartySocket from "partysocket"

// PartyKit host - use localhost in dev, or your deployed URL from env
const getPartyKitHost = () => {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "localhost:1999"
  }
  const envHost = import.meta.env.VITE_PARTYKIT_HOST
  if (!envHost) {
    console.error("VITE_PARTYKIT_HOST environment variable is not set!")
  }
  return envHost || ""
}

export const PARTYKIT_HOST = getPartyKitHost()

/** Deliver an explicit leave after a transient outage, then stop reconnecting. */
export function leavePartySocket(socket: PartySocket, message: object): void {
  const sendAndClose = () => {
    try {
      socket.send(JSON.stringify(message))
    } finally {
      socket.close()
    }
  }

  if (socket.readyState === WebSocket.OPEN) {
    sendAndClose()
    return
  }

  let finished = false
  const timeout = setTimeout(() => {
    if (finished) return
    finished = true
    socket.close()
  }, 15_000)

  socket.addEventListener("open", () => {
    if (finished) return
    finished = true
    clearTimeout(timeout)
    sendAndClose()
  })
}

export function createPartySocket(roomId: string, isHost: boolean, mode: string) {
  return new PartySocket({
    host: PARTYKIT_HOST,
    room: roomId,
    query: {
      host: isHost.toString(),
      mode,
    },
  })
}

/**
 * A connection id that survives reconnects and page reloads, so the server can
 * recognise a returning player instead of treating them as a stranger. Passed
 * to PartySocket as `id`, which becomes `conn.id` on the server.
 *
 * sessionStorage, not localStorage, is deliberate: it is per-tab, so two tabs
 * in one browser remain independent players. localStorage would make them
 * collide on a single connection id.
 */
export function getPersistentPlayerId(game: string, roomCode: string): string {
  const key = `${game}:playerId:${roomCode}`
  if (typeof sessionStorage === "undefined") {
    return crypto.randomUUID()
  }
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}

/** Forget this tab's identity for a room - used when the player deliberately leaves. */
export function clearPersistentPlayerId(game: string, roomCode: string): void {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.removeItem(`${game}:playerId:${roomCode}`)
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
