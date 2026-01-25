import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type { ServerMessage, PublicGameState, GameMode } from "../../../../party/typerace"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
}

export function useMultiplayerTypeRace() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
  })

  const socketRef = useRef<PartySocket | null>(null)
  const playerNameRef = useRef<string>("")
  const lastProgressRef = useRef<number>(0)
  const throttleRef = useRef<number | null>(null)

  const connect = useCallback((roomCode: string, isHost: boolean, mode: GameMode, playerName: string) => {
    if (socketRef.current) {
      socketRef.current.close()
    }

    playerNameRef.current = playerName

    setState((prev) => ({
      ...prev,
      connectionStatus: "connecting",
      error: null,
      isHost,
    }))

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode,
      party: "typerace",
      query: {
        host: isHost.toString(),
        mode,
      },
    })

    socket.addEventListener("open", () => {
      setState((prev) => ({
        ...prev,
        connectionStatus: "connected",
        playerId: socket.id,
      }))

      socket.send(JSON.stringify({ type: "join", name: playerName }))
    })

    socket.addEventListener("message", (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        handleMessage(message)
      } catch (e) {
        console.error("Failed to parse message:", e)
      }
    })

    socket.addEventListener("close", () => {
      setState((prev) => ({
        ...prev,
        connectionStatus: "disconnected",
      }))
    })

    socket.addEventListener("error", () => {
      setState((prev) => ({
        ...prev,
        connectionStatus: "error",
        error: "Connection failed",
      }))
    })

    socketRef.current = socket
  }, [])

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState((prev) => ({
          ...prev,
          gameState: message.state,
        }))
        break

      case "player-joined":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              players: {
                ...prev.gameState.players,
                [message.player.id]: message.player,
              },
            },
          }
        })
        break

      case "player-left":
        setState((prev) => {
          if (!prev.gameState) return prev
          const newPlayers = { ...prev.gameState.players }
          delete newPlayers[message.playerId]
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              players: newPlayers,
            },
          }
        })
        break

      case "game-started":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              status: "playing",
              text: message.text,
              startedAt: message.startTime,
            },
          }
        })
        break

      case "player-progress":
        setState((prev) => {
          if (!prev.gameState) return prev
          const player = prev.gameState.players[message.playerId]
          if (!player) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              players: {
                ...prev.gameState.players,
                [message.playerId]: {
                  ...player,
                  progress: message.progress,
                  wpm: message.wpm,
                },
              },
            },
          }
        })
        break

      case "player-completed":
        setState((prev) => {
          if (!prev.gameState) return prev
          const player = prev.gameState.players[message.playerId]
          if (!player) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              players: {
                ...prev.gameState.players,
                [message.playerId]: {
                  ...player,
                  completed: true,
                  progress: 100,
                  wpm: message.wpm,
                  accuracy: message.accuracy,
                },
              },
            },
          }
        })
        break

      case "game-over":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              status: "finished",
              winnerId: message.winnerId,
            },
          }
        })
        break

      case "game-restarted":
        // Reset will come through state message
        break

      case "error":
        setState((prev) => ({
          ...prev,
          error: message.message,
        }))
        break
    }
  }, [])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "leave" }))
      socketRef.current.close()
      socketRef.current = null
    }
    if (throttleRef.current) {
      clearTimeout(throttleRef.current)
    }
    setState({
      connectionStatus: "disconnected",
      gameState: null,
      playerId: null,
      error: null,
      isHost: false,
    })
  }, [])

  const createGame = useCallback((mode: GameMode, playerName: string) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, mode, playerName)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode.toUpperCase(), false, "race", playerName)
  }, [connect])

  const startGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "start" }))
    }
  }, [state.isHost])

  // Send progress (throttled to avoid flooding)
  const sendProgress = useCallback((progress: number, wpm: number, accuracy: number) => {
    if (!socketRef.current) return

    // Throttle: only send if progress changed significantly
    if (Math.abs(progress - lastProgressRef.current) < 2) {
      return
    }

    lastProgressRef.current = progress
    socketRef.current.send(JSON.stringify({
      type: "progress",
      progress,
      wpm,
      accuracy,
    }))
  }, [])

  const sendComplete = useCallback((wpm: number, accuracy: number) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "complete", wpm, accuracy }))
    }
  }, [])

  const restartGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "restart" }))
    }
  }, [state.isHost])

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
      }
    }
  }, [])

  return {
    ...state,
    createGame,
    joinGame,
    startGame,
    sendProgress,
    sendComplete,
    restartGame,
    disconnect,
  }
}
