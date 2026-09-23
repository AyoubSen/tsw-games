import PartySocket from "partysocket"
import { useCallback, useEffect, useRef, useState } from "react"
import type { BombClientMessage, BombServerMessage, BombSubmission, PublicBombState } from "@/lib/bombDefusal"
import {
  clearPersistentPlayerId, clearPersistentPlayerToken, generateRoomCode,
  getGameNightSocketQuery, getPersistentPlayerId, getPersistentPlayerToken,
  leavePartySocket, PARTYKIT_HOST,
} from "@/lib/partykit"

interface MultiplayerState {
  connectionStatus: "disconnected" | "connecting" | "connected" | "error"
  gameState: PublicBombState | null
  playerId: string | null
  error: string | null
}

const INITIAL_STATE: MultiplayerState = {
  connectionStatus: "disconnected", gameState: null, playerId: null, error: null,
}

export function useMultiplayerBombDefusal() {
  const [state, setState] = useState<MultiplayerState>(INITIAL_STATE)
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")

  const connect = useCallback((roomCode: string, hosting: boolean, name: string, timeLimit = 240) => {
    const nightQuery = getGameNightSocketQuery(roomCode)
    const normalized = nightQuery.night ? roomCode : roomCode.toUpperCase()
    const previous = socketRef.current
    socketRef.current = null
    previous?.close()
    roomCodeRef.current = normalized
    const playerId = getPersistentPlayerId("bomb-defusal", normalized)
    setState({ ...INITIAL_STATE, connectionStatus: "connecting", playerId })
    const socket = new PartySocket({
      host: PARTYKIT_HOST, room: normalized, id: playerId, party: "bombdefusal",
      query: {
        ...nightQuery, host: String(hosting), timeLimit: String(timeLimit),
        playerToken: getPersistentPlayerToken("bomb-defusal", normalized),
      },
      maxEnqueuedMessages: 0,
    })
    socketRef.current = socket
    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return
      socket.send(JSON.stringify({ type: "join", name }))
    })
    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as BombServerMessage
        if (message.type === "state") {
          setState({ connectionStatus: "connected", playerId, gameState: message.state, error: null })
        } else if (message.type === "error") {
          if (message.message === "Invalid player session") {
            clearPersistentPlayerId("bomb-defusal", normalized)
            clearPersistentPlayerToken("bomb-defusal", normalized)
          }
          setState((previousState) => ({
            ...previousState, error: message.message,
            connectionStatus: previousState.gameState ? previousState.connectionStatus : "error",
          }))
        }
      } catch (error) {
        console.error("Failed to parse Bomb Defusal message:", error)
      }
    })
    const reconnect = () => {
      if (socketRef.current !== socket) return
      setState((previousState) => ({ ...previousState, connectionStatus: "connecting", error: "Connection lost. Reconnecting..." }))
    }
    socket.addEventListener("close", reconnect)
    socket.addEventListener("error", reconnect)
  }, [])

  const send = useCallback((message: BombClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [])

  const createGame = useCallback((name: string, timeLimit = 240, roomId?: string) => {
    const roomCode = roomId ?? generateRoomCode()
    connect(roomCode, true, name, timeLimit)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, name: string) => connect(roomCode, false, name), [connect])

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("bomb-defusal", roomCodeRef.current)
      clearPersistentPlayerToken("bomb-defusal", roomCodeRef.current)
    }
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  const abandonReconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  useEffect(() => () => socketRef.current?.close(), [])

  return {
    ...state,
    isHost: state.gameState?.canControl ?? false,
    createGame, joinGame, disconnect, abandonReconnect,
    startGame: () => send({ type: "start" }),
    nextRound: () => state.gameState?.missionId && send({ type: "next", missionId: state.gameState.missionId }),
    restartGame: () => send({ type: "restart" }),
    submit: (submission: BombSubmission, revision: number) => Boolean(state.gameState?.missionId && send({
      type: "attempt", missionId: state.gameState.missionId, revision, submission,
    })),
  }
}
