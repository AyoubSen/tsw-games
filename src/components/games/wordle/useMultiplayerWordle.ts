import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type { ServerMessage, PublicGameState, GameMode, RevealMode } from "../../../../party/wordle"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

// Data for the round reveal modal
export interface RoundReveal {
  turn: number
  playerGuesses: Record<string, string[]> // playerId -> [char, state][] serialized
}

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
  waitingFor: string[] // Players we're waiting for in classic mode
  isWaitingForOthers: boolean // True when current player has guessed and waiting
  roundReveal: RoundReveal | null // Data for showing round reveal modal
}

export function useMultiplayerWordle() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
    waitingFor: [],
    isWaitingForOthers: false,
    roundReveal: null,
  })

  const socketRef = useRef<PartySocket | null>(null)
  const playerNameRef = useRef<string>("")

  const connect = useCallback((roomCode: string, isHost: boolean, mode: GameMode, revealMode: RevealMode, playerName: string) => {
    // Disconnect existing socket
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
      query: {
        host: isHost.toString(),
        mode,
        revealMode,
      },
    })

    socket.addEventListener("open", () => {
      setState((prev) => ({
        ...prev,
        connectionStatus: "connected",
        playerId: socket.id,
      }))

      // Auto-join with player name
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
              targetWord: message.targetWord,
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
                  attempts: message.attempts,
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
                  won: message.won,
                  attempts: message.attempts,
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
            waitingFor: [],
          }
        })
        break

      case "waiting-for-players":
        setState((prev) => {
          // If current player is NOT in waitingFor list, they are waiting for others
          const currentPlayerName = prev.gameState?.players[prev.playerId || ""]?.name
          const isWaiting = currentPlayerName ? !message.waitingFor.includes(currentPlayerName) : false
          return {
            ...prev,
            waitingFor: message.waitingFor,
            isWaitingForOthers: isWaiting,
          }
        })
        break

      case "turn-complete":
        setState((prev) => ({
          ...prev,
          waitingFor: [],
          isWaitingForOthers: false,
          roundReveal: {
            turn: message.turn,
            playerGuesses: message.playerGuesses,
          },
        }))
        break

      case "game-restarted":
        // Reset will come through state message
        setState((prev) => ({
          ...prev,
          waitingFor: [],
          isWaitingForOthers: false,
          roundReveal: null,
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
      waitingFor: [],
      isWaitingForOthers: false,
      roundReveal: null,
    })
  }, [])

  const dismissReveal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      roundReveal: null,
    }))
  }, [])

  const createGame = useCallback((mode: GameMode, revealMode: RevealMode, playerName: string) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, mode, revealMode, playerName)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode.toUpperCase(), false, "race", "after-round", playerName) // Mode/revealMode don't matter for joining
  }, [connect])

  const startGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "start" }))
    }
  }, [state.isHost])

  const sendGuess = useCallback((word: string, result: string[][]) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "guess", word, result }))
    }
  }, [])

  const sendComplete = useCallback((won: boolean, attempts: number) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "complete", won, attempts }))
    }
  }, [])

  const restartGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "restart" }))
    }
  }, [state.isHost])

  // Cleanup on unmount
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
    sendGuess,
    sendComplete,
    restartGame,
    disconnect,
    dismissReveal,
  }
}
