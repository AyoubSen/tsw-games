import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type { ServerMessage, PublicGameState } from "../../../../party/wordchain"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface GameSettings {
  turnTimeLimit: number // 10, 15, 20, 30 seconds
}

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
}

export function useMultiplayerWordchain() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
  })

  const socketRef = useRef<PartySocket | null>(null)
  const playerNameRef = useRef<string>("")

  const connect = useCallback((roomCode: string, isHost: boolean, playerName: string, settings?: GameSettings) => {
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
      party: "wordchain",
      query: {
        host: isHost.toString(),
        ...(settings && {
          turnTimeLimit: settings.turnTimeLimit.toString(),
        }),
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
              playerOrder: [...prev.gameState.playerOrder, message.player.id],
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
              currentPlayerId: message.nextPlayerId || null,
              turnStartedAt: Date.now(),
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
    })
  }, [])

  const createGame = useCallback((playerName: string, settings: GameSettings) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, playerName, settings)
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

  const submitWord = useCallback((word: string) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "submit-word", word: word.toLowerCase().trim() }))
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
    submitWord,
    restartGame,
    disconnect,
  }
}
