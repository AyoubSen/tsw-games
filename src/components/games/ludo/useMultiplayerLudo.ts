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
import type { PublicGameState, ServerMessage } from "../../../../party/ludo"

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
  stateReceivedAt: number
}

const INITIAL_STATE: MultiplayerState = {
  connectionStatus: "disconnected",
  gameState: null,
  playerId: null,
  error: null,
  stateReceivedAt: 0,
}

export function useMultiplayerLudo() {
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
      const stateReceivedAt = Date.now()
      setState((previous) => ({
        ...previous,
        connectionStatus: "connected",
        gameState: message.state,
        error: null,
        stateReceivedAt,
      }))
      return
    }
    setState((previous) => ({ ...previous, error: message.message }))
  }, [])

  const connect = useCallback(
    (roomCode: string, hosting: boolean, playerName: string) => {
      const normalizedRoomCode = getGameNightSocketQuery(roomCode).night
        ? roomCode
        : roomCode.toUpperCase()
      const previousSocket = socketRef.current
      socketRef.current = null
      previousSocket?.close()
      roomCodeRef.current = normalizedRoomCode
      const playerId = getPersistentPlayerId("ludo", normalizedRoomCode)

      setState({
        ...INITIAL_STATE,
        connectionStatus: "connecting",
        playerId,
      })

      const socket = new PartySocket({
        host: PARTYKIT_HOST,
        room: normalizedRoomCode,
        id: playerId,
        party: "ludo",
        query: {
          ...getGameNightSocketQuery(roomCode),
          host: hosting.toString(),
          playerToken: getPersistentPlayerToken("ludo", normalizedRoomCode),
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
          console.error("Failed to parse Ludo message:", error)
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
    (playerName: string, roomId?: string) => {
      const roomCode = roomId ?? generateRoomCode()
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
      clearPersistentPlayerId("ludo", roomCodeRef.current)
      clearPersistentPlayerToken("ludo", roomCodeRef.current)
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
    rollDice: (roundId: string) => sendNow({ type: "roll", roundId }),
    moveToken: (seat: number, tokenIndex: number, roundId: string) =>
      sendNow({ type: "move", seat, tokenIndex, roundId }),
    addBot: () => isHost && sendNow({ type: "add-bot" }),
    removePlayer: (playerId: string) =>
      isHost && sendNow({ type: "remove-player", playerId }),
    setMode: (mode: "classic" | "teams") =>
      isHost && sendNow({ type: "set-mode", mode }),
    restartGame: () => isHost && sendNow({ type: "restart" }),
    disconnect,
    abandonReconnect,
  }
}
