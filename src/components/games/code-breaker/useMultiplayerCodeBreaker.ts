import PartySocket from "partysocket"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CodeColor } from "@/lib/codeBreaker"
import {
  clearPersistentPlayerId,
  clearPersistentPlayerToken,
  generateRoomCode,
  getPersistentPlayerId,
  getPersistentPlayerToken,
  leavePartySocket,
  PARTYKIT_HOST,
} from "@/lib/partykit"
import type {
  PublicGameState,
  ServerMessage,
} from "../../../../party/code-breaker"

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"

interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
}

const INITIAL_STATE: MultiplayerState = {
  connectionStatus: "disconnected",
  gameState: null,
  playerId: null,
  error: null,
}

export function useMultiplayerCodeBreaker() {
  const [state, setState] = useState<MultiplayerState>(INITIAL_STATE)
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")
  const isHost = Boolean(
    state.gameState &&
      state.playerId &&
      state.gameState.hostId === state.playerId,
  )

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "state") {
      setState((previous) => ({
        ...previous,
        connectionStatus: "connected",
        gameState: message.state,
        error: null,
      }))
      return
    }
    setState((previous) => ({ ...previous, error: message.message }))
  }, [])

  const connect = useCallback(
    (roomCode: string, hosting: boolean, playerName: string) => {
      const normalizedRoomCode = roomCode.toUpperCase()
      const previousSocket = socketRef.current
      socketRef.current = null
      previousSocket?.close()
      roomCodeRef.current = normalizedRoomCode
      const playerId = getPersistentPlayerId("code-breaker", normalizedRoomCode)

      setState({
        ...INITIAL_STATE,
        connectionStatus: "connecting",
        playerId,
      })

      const socket = new PartySocket({
        host: PARTYKIT_HOST,
        room: normalizedRoomCode,
        id: playerId,
        party: "codebreaker",
        query: {
          host: hosting.toString(),
          playerToken: getPersistentPlayerToken(
            "code-breaker",
            normalizedRoomCode,
          ),
        },
        maxEnqueuedMessages: 0,
      })
      socketRef.current = socket

      socket.addEventListener("open", () => {
        if (socketRef.current !== socket) return
        setState((previous) => ({
          ...previous,
          connectionStatus: "connected",
          playerId: socket.id,
        }))
        socket.send(JSON.stringify({ type: "join", name: playerName }))
      })

      socket.addEventListener("message", (event) => {
        if (socketRef.current !== socket) return
        try {
          handleMessage(JSON.parse(event.data) as ServerMessage)
        } catch (error) {
          console.error("Failed to parse Code Breaker message:", error)
        }
      })

      const markReconnecting = () => {
        if (socketRef.current !== socket) return
        setState((previous) => ({
          ...previous,
          connectionStatus: "connecting",
          error: "Connection lost. Reconnecting...",
        }))
      }
      socket.addEventListener("close", markReconnecting)
      socket.addEventListener("error", markReconnecting)
    },
    [handleMessage],
  )

  const sendNow = useCallback((message: object) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const createGame = useCallback(
    (playerName: string) => {
      const roomCode = generateRoomCode()
      connect(roomCode, true, playerName)
      return roomCode
    },
    [connect],
  )

  const joinGame = useCallback(
    (roomCode: string, playerName: string) => {
      connect(roomCode, false, playerName)
    },
    [connect],
  )

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("code-breaker", roomCodeRef.current)
      clearPersistentPlayerToken("code-breaker", roomCodeRef.current)
      roomCodeRef.current = ""
    }
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
    isHost,
    createGame,
    joinGame,
    startGame: () => isHost && sendNow({ type: "start" }),
    submitGuess: (guess: CodeColor[]) =>
      sendNow({ type: "submit-guess", guess }),
    restartGame: () => isHost && sendNow({ type: "restart" }),
    disconnect,
    abandonReconnect,
  }
}
