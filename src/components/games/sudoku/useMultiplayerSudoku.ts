import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type { ServerMessage, PublicGameState, Difficulty } from "../../../../party/sudoku"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
  solution: (number | null)[] | null
}

export function useMultiplayerSudoku() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
    solution: null,
  })

  const socketRef = useRef<PartySocket | null>(null)
  const playerNameRef = useRef<string>("")

  const connect = useCallback((roomCode: string, isHost: boolean, playerName: string, difficulty?: Difficulty) => {
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
      party: "sudoku",
      query: {
        host: isHost.toString(),
        ...(difficulty && { difficulty }),
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
              puzzle: message.puzzle,
              startTime: Date.now(),
            },
            solution: message.solution,
          }
        })
        break

      case "progress-update":
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
                  completedAt: Date.now(),
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
        setState((prev) => ({
          ...prev,
          solution: null,
        }))
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
    setState({
      connectionStatus: "disconnected",
      gameState: null,
      playerId: null,
      error: null,
      isHost: false,
      solution: null,
    })
  }, [])

  const createGame = useCallback((playerName: string, difficulty: Difficulty) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, playerName, difficulty)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode.toUpperCase(), false, playerName)
  }, [connect])

  const startGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "start" }))
    }
  }, [state.isHost])

  const updateProgress = useCallback((progress: number, completed: boolean) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "update-progress",
        progress,
        completed,
      }))
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
    }
  }, [])

  return {
    ...state,
    createGame,
    joinGame,
    startGame,
    updateProgress,
    restartGame,
    disconnect,
  }
}
