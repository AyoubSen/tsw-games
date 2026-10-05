import PartySocket from "partysocket"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  clearPersistentPlayerId,
  clearPersistentPlayerToken,
  generateRoomCode,
  getPersistentPlayerId,
  getPersistentPlayerToken,
  getGameNightSocketQuery,
  leavePartySocket,
  PARTYKIT_HOST,
} from "@/lib/partykit"
import { useAuthTokenRef } from "@/lib/account"
import type { Reaction } from "@/lib/reactions"
import { useReactionBubbles } from "@/components/multiplayer/Reactions"
import type {
  PublicTimelineGameState,
  ServerMessage,
  TimelineSettings,
} from "../../../../party/timeline-chaos"

const INITIAL_STATE = {
  connectionStatus: "disconnected" as "disconnected" | "connecting" | "connected" | "error",
  gameState: null as PublicTimelineGameState | null,
  playerId: null as string | null,
  error: null as string | null,
  /** Server clock minus local clock, from the last state message. */
  clockOffset: 0,
}

export function useMultiplayerTimelineChaos() {
  const [state, setState] = useState(INITIAL_STATE)
  const { bubbles: reactions, receive: receiveReaction, clear: clearReactions } = useReactionBubbles()
  const socketRef = useRef<PartySocket | null>(null)
  const authTokenRef = useAuthTokenRef()
  const roomCodeRef = useRef("")
  const isHost = Boolean(state.gameState && state.playerId && state.gameState.hostId === state.playerId)

  const connect = useCallback((roomCode: string, hosting: boolean, name: string, settings?: TimelineSettings) => {
    const normalized = getGameNightSocketQuery(roomCode).night ? roomCode : roomCode.toUpperCase()
    socketRef.current?.close()
    roomCodeRef.current = normalized
    const playerId = getPersistentPlayerId("timeline-chaos", normalized)
    setState({ ...INITIAL_STATE, connectionStatus: "connecting", playerId })
    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: normalized,
      id: playerId,
      party: "timelinechaos",
      query: {
        ...getGameNightSocketQuery(roomCode),
        host: hosting.toString(),
        playerToken: getPersistentPlayerToken("timeline-chaos", normalized),
        ...(settings && {
          pack: settings.pack,
          rounds: settings.rounds.toString(),
          roundSeconds: settings.roundSeconds.toString(),
        }),
      },
      maxEnqueuedMessages: 0,
    })
    socketRef.current = socket
    socket.addEventListener("open", async () => {
      if (socketRef.current !== socket) return
      setState((previous) => ({ ...previous, connectionStatus: "connected", playerId: socket.id }))
      const authToken = await authTokenRef.current()
      if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: "join", name, authToken }))
    })
    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === "state") {
          setState((previous) => ({ ...previous, connectionStatus: "connected", gameState: message.state, error: null, clockOffset: message.state.serverNow - Date.now() }))
        } else if (message.type === "reaction") receiveReaction(message)
        else setState((previous) => ({ ...previous, error: message.message }))
      } catch (error) {
        console.error("Failed to parse Timeline Chaos message:", error)
      }
    })
    const reconnecting = () => {
      if (socketRef.current !== socket) return
      setState((previous) => ({ ...previous, connectionStatus: "connecting", error: "Connection lost. Reconnecting..." }))
    }
    socket.addEventListener("close", reconnecting)
    socket.addEventListener("error", reconnecting)
  }, [receiveReaction, authTokenRef])

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
      clearPersistentPlayerId("timeline-chaos", roomCodeRef.current)
      clearPersistentPlayerToken("timeline-chaos", roomCodeRef.current)
    }
    roomCodeRef.current = ""
    clearReactions()
    setState(INITIAL_STATE)
  }, [clearReactions])

  const abandonReconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  useEffect(() => () => socketRef.current?.close(), [])

  const createGame = useCallback((name: string, settings: TimelineSettings, roomId?: string) => {
    const roomCode = roomId ?? generateRoomCode()
    connect(roomCode, true, name, settings)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, name: string) => {
    connect(roomCode, false, name)
  }, [connect])

  return {
    ...state,
    isHost,
    createGame,
    joinGame,
    startGame: () => isHost && send({ type: "start" }),
    reactions,
    react: (reaction: Reaction) => send({ type: "react", reaction }),
    arrange: (roundId: string, order: string[] | null) => send({ type: "arrange", roundId, order }),
    submitOrder: (roundId: string, order: string[]) => send({ type: "submit-order", roundId, order }),
    restartGame: () => isHost && send({ type: "restart" }),
    disconnect,
    abandonReconnect,
  }
}
