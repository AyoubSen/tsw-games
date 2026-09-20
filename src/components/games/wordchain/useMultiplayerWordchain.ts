import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import {
  PARTYKIT_HOST,
  clearPersistentPlayerId,
  generateRoomCode,
  getGameNightSocketQuery,
  getPersistentPlayerId,
  leavePartySocket,
} from "@/lib/partykit"
import type { ServerMessage, PublicGameState } from "../../../../party/wordchain"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface GameSettings {
  turnTimeLimit: number // 10, 15, 20, 30 seconds
  gameMode: "casual" | "hardcore"
  maxHearts: number // 1-5 hearts per player
}

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
}

export function useMultiplayerWordchain() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
  })

  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef<string | null>(null)

  const connect = useCallback((roomCode: string, isHost: boolean, playerName: string, settings?: GameSettings) => {
    if (socketRef.current) {
      socketRef.current.close()
    }

    roomCodeRef.current = roomCode

    setState((prev) => ({
      ...prev,
      connectionStatus: "connecting",
      error: null,
    }))

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode,
      id: getPersistentPlayerId("wordchain", roomCode),
      party: "wordchain",
      maxEnqueuedMessages: 0,
      query: {
        host: isHost.toString(),
        ...(settings && {
          turnTimeLimit: settings.turnTimeLimit.toString(),
          gameMode: settings.gameMode,
          maxHearts: settings.maxHearts.toString(),
        }),
        ...getGameNightSocketQuery(roomCode),
      },
    })

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return
      setState((prev) => ({
        ...prev,
        connectionStatus: "connected",
        playerId: socket.id,
        error: null,
      }))

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "join", name: playerName }))
      }
    })

    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return
      try {
        const message: ServerMessage = JSON.parse(event.data)
        handleMessage(message)
      } catch (e) {
        console.error("Failed to parse message:", e)
      }
    })

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return
      setState((prev) => ({
        ...prev,
        connectionStatus: "connecting",
        error: "Connection lost. Reconnecting...",
      }))
    })

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return
      setState((prev) => ({
        ...prev,
        connectionStatus: "connecting",
        error: "Connection lost. Reconnecting...",
      }))
    })

    socketRef.current = socket
  }, [])

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState((prev) => ({
          ...prev,
          connectionStatus: "connected",
          gameState: message.state,
          error: null,
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
              playerOrder: prev.gameState.playerOrder.includes(message.player.id)
                ? prev.gameState.playerOrder
                : [...prev.gameState.playerOrder, message.player.id],
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
              playerOrder: prev.gameState.playerOrder.filter(id => id !== message.playerId),
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
              wordChain: [message.startingWord],
              wordAuthors: [""],
              currentPlayerId: message.firstPlayerId,
            },
          }
        })
        break

      case "turn-started":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              currentPlayerId: message.playerId,
              turnStartedAt: Date.now(),
            },
          }
        })
        break

      case "word-accepted":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              wordChain: [...prev.gameState.wordChain, message.word],
              wordAuthors: [...(prev.gameState.wordAuthors ?? []), message.playerId],
              currentPlayerId: message.nextPlayerId || null,
              turnStartedAt: Date.now(),
            },
          }
        })
        break

      case "heart-lost":
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
                  hearts: message.heartsRemaining,
                },
              },
            },
          }
        })
        break

      case "player-eliminated":
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
                  eliminated: true,
                  eliminatedReason: message.reason,
                  eliminatedWord: message.word,
                  hearts: 0,
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
              winnerId: message.winnerId || null,
              wordChain: message.wordChain,
              currentPlayerId: null,
            },
          }
        })
        break

      case "game-restarted":
        // State update will come through "state" message
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
    const socket = socketRef.current
    const roomCode = roomCodeRef.current
    socketRef.current = null
    roomCodeRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCode) clearPersistentPlayerId("wordchain", roomCode)
    setState({
      connectionStatus: "disconnected",
      gameState: null,
      playerId: null,
      error: null,
    })
  }, [])

  const abandonReconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    roomCodeRef.current = null
    socket?.close()
    setState({
      connectionStatus: "disconnected",
      gameState: null,
      playerId: null,
      error: null,
    })
  }, [])

  const createGame = useCallback((playerName: string, settings: GameSettings, roomId?: string) => {
    const roomCode = roomId ?? generateRoomCode()
    connect(roomCode, true, playerName, settings)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode.toUpperCase(), false, playerName)
  }, [connect])

  const startGame = useCallback(() => {
    const socket = socketRef.current
    if (
      socket?.readyState === WebSocket.OPEN &&
      state.playerId === state.gameState?.hostId
    ) {
      socket.send(JSON.stringify({ type: "start" }))
    }
  }, [state.gameState?.hostId, state.playerId])

  const submitWord = useCallback((word: string) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "submit-word", word: word.toLowerCase().trim() }))
    }
  }, [])

  const restartGame = useCallback(() => {
    const socket = socketRef.current
    if (
      socket?.readyState === WebSocket.OPEN &&
      state.playerId === state.gameState?.hostId
    ) {
      socket.send(JSON.stringify({ type: "restart" }))
    }
  }, [state.gameState?.hostId, state.playerId])

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [])

  return {
    ...state,
    isHost: !!state.playerId && state.gameState?.hostId === state.playerId,
    createGame,
    joinGame,
    startGame,
    submitWord,
    restartGame,
    disconnect,
    abandonReconnect,
  }
}
