import PartySocket from "partysocket"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  clearPersistentPlayerId,
  clearPersistentPlayerToken,
  generateRoomCode,
  getGameNightSocketQuery,
  getPersistentPlayerId,
  getPersistentPlayerToken,
  leavePartySocket,
  PARTYKIT_HOST,
} from "@/lib/partykit"
import type { UnoColor } from "@/lib/uno"
import type { PublicUnoGameState, ServerMessage } from "../../../../party/uno"

const INITIAL_STATE = {
  connectionStatus: "disconnected" as "disconnected" | "connecting" | "connected" | "error",
  gameState: null as PublicUnoGameState | null,
  playerId: null as string | null,
  error: null as string | null,
  stateReceivedAt: 0,
}

export function useMultiplayerUno() {
  const [state, setState] = useState(INITIAL_STATE)
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")
  const isHost = Boolean(state.gameState && state.playerId && state.gameState.hostId === state.playerId)

  const connect = useCallback((roomCode: string, hosting: boolean, name: string) => {
    const gameNightQuery = getGameNightSocketQuery(roomCode)
    const normalized = gameNightQuery.night ? roomCode : roomCode.toUpperCase()
    socketRef.current?.close()
    roomCodeRef.current = normalized
    const playerId = getPersistentPlayerId("uno", normalized)
    setState({ ...INITIAL_STATE, connectionStatus: "connecting", playerId })

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: normalized,
      id: playerId,
      party: "uno",
      query: {
        ...gameNightQuery,
        host: hosting.toString(),
        playerToken: getPersistentPlayerToken("uno", normalized),
      },
      maxEnqueuedMessages: 0,
    })
    socketRef.current = socket

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return
      setState((previous) => ({ ...previous, connectionStatus: "connected", playerId: socket.id, error: null }))
      socket.send(JSON.stringify({ type: "join", name }))
    })
    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === "state") {
          setState((previous) => ({ ...previous, connectionStatus: "connected", gameState: message.state, error: null, stateReceivedAt: Date.now() }))
        } else {
          setState((previous) => ({ ...previous, error: message.message }))
        }
      } catch (error) {
        console.error("Failed to parse Uno message:", error)
      }
    })
    const reconnecting = () => {
      if (socketRef.current !== socket) return
      setState((previous) => ({ ...previous, connectionStatus: "connecting", error: "Connection lost. Reconnecting..." }))
    }
    socket.addEventListener("close", reconnecting)
    socket.addEventListener("error", reconnecting)
  }, [])

  const send = useCallback((message: object) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("uno", roomCodeRef.current)
      clearPersistentPlayerToken("uno", roomCodeRef.current)
    }
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  const abandonReconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  useEffect(() => () => socketRef.current?.close(), [])

  const createGame = useCallback((name: string, roomId?: string) => {
    const roomCode = roomId ?? generateRoomCode()
    connect(roomCode, true, name)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, name: string) => connect(roomCode, false, name), [connect])

  return {
    ...state,
    isHost,
    createGame,
    joinGame,
    startGame: () => isHost && send({ type: "start" }),
    playCard: (cardId: string, color?: UnoColor) => send({ type: "play", cardId, ...(color && { color }) }),
    drawCard: () => send({ type: "draw" }),
    pass: () => send({ type: "pass" }),
    restartGame: () => isHost && send({ type: "restart" }),
    disconnect,
    abandonReconnect,
  }
}
