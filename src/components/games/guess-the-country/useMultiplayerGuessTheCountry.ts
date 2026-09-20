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
import type {
  GameSettings,
  PublicGameState,
  ServerMessage,
} from "../../../../party/guess-the-country"

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"

export interface RoundResult {
  playerId: string
  playerName: string
  countryName: string
}

interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  guessMessage: string | null
  lastRoundResult: RoundResult | null
}

const INITIAL_STATE: MultiplayerState = {
  connectionStatus: "disconnected",
  gameState: null,
  playerId: null,
  error: null,
  guessMessage: null,
  lastRoundResult: null,
}

export function useMultiplayerGuessTheCountry() {
  const [state, setState] = useState<MultiplayerState>(INITIAL_STATE)
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")
  const isHost = Boolean(
    state.gameState &&
      state.playerId &&
      state.gameState.hostId === state.playerId,
  )

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState((previous) => ({
          ...previous,
          connectionStatus: "connected",
          gameState: message.state,
          error: null,
        }))
        return
      case "guess-result":
        setState((previous) => ({
          ...previous,
          guessMessage: message.message,
        }))
        return
      case "round-won":
        setState((previous) => ({
          ...previous,
          guessMessage:
            message.playerId === previous.playerId
              ? `Correct: ${message.countryName}`
              : `${message.playerName} got ${message.countryName}`,
          lastRoundResult: message,
        }))
        return
      case "error":
        setState((previous) => ({ ...previous, error: message.message }))
    }
  }, [])

  const connect = useCallback(
    (
      roomCode: string,
      hosting: boolean,
      playerName: string,
      settings?: GameSettings,
    ) => {
      const normalizedRoomCode = getGameNightSocketQuery(roomCode).night
        ? roomCode
        : roomCode.toUpperCase()
      const previousSocket = socketRef.current
      socketRef.current = null
      previousSocket?.close()
      roomCodeRef.current = normalizedRoomCode
      const playerId = getPersistentPlayerId(
        "guess-the-country",
        normalizedRoomCode,
      )

      setState({
        ...INITIAL_STATE,
        connectionStatus: "connecting",
        playerId,
      })

      const socket = new PartySocket({
        host: PARTYKIT_HOST,
        room: normalizedRoomCode,
        id: playerId,
        party: "guessthecountry",
        query: {
          ...getGameNightSocketQuery(roomCode),
          host: hosting.toString(),
          playerToken: getPersistentPlayerToken(
            "guess-the-country",
            normalizedRoomCode,
          ),
          ...(settings && {
            mode: settings.mode,
            targetScore: settings.targetScore.toString(),
            timeLimit: settings.timeLimit.toString(),
          }),
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
          console.error("Failed to parse Guess the Country message:", error)
        }
      })

      socket.addEventListener("close", () => {
        if (socketRef.current !== socket) return
        setState((previous) => ({
          ...previous,
          connectionStatus: "connecting",
          error: "Connection lost. Reconnecting...",
        }))
      })

      socket.addEventListener("error", () => {
        if (socketRef.current !== socket) return
        setState((previous) => ({
          ...previous,
          connectionStatus: "connecting",
          error: "Connection lost. Reconnecting...",
        }))
      })
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
    (playerName: string, settings: GameSettings, roomId?: string) => {
      const roomCode = roomId ?? generateRoomCode()
      connect(roomCode, true, playerName, settings)
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
      clearPersistentPlayerId("guess-the-country", roomCodeRef.current)
      clearPersistentPlayerToken("guess-the-country", roomCodeRef.current)
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

  const clearGuessMessage = useCallback(() => {
    setState((previous) => ({ ...previous, guessMessage: null }))
  }, [])

  useEffect(() => {
    return () => socketRef.current?.close()
  }, [])

  return {
    ...state,
    isHost,
    createGame,
    joinGame,
    startGame: () => isHost && sendNow({ type: "start" }),
    submitGuess: (guess: string) => sendNow({ type: "submit-guess", guess }),
    submitChoice: (choice: string) =>
      sendNow({ type: "submit-choice", choice }),
    restartGame: () => isHost && sendNow({ type: "restart" }),
    disconnect,
    abandonReconnect,
    clearGuessMessage,
  }
}
