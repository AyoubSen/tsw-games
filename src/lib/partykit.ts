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
