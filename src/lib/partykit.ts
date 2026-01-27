import PartySocket from "partysocket"

// PartyKit host - use localhost in dev, or your deployed URL from env
export const PARTYKIT_HOST =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "localhost:1999"
    : import.meta.env.VITE_PARTYKIT_HOST

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

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
