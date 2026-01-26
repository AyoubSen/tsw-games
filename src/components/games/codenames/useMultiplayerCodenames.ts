import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type {
  ServerMessage,
  PublicGameState,
  Team,
  PlayerRole,
  GameMode,
  GameSettings,
} from "../../../../party/codenames"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export type { GameMode, GameSettings }

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  isSpymaster: boolean
  error: string | null
  isHost: boolean
}

export function useMultiplayerCodenames() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    isSpymaster: false,
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
      party: "codenames",
      query: {
        host: isHost.toString(),
        ...(settings && {
          gameMode: settings.gameMode,
          clueTimeLimit: settings.clueTimeLimit.toString(),
          guessTimeLimit: settings.guessTimeLimit.toString(),
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
          isSpymaster: message.isSpymaster,
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

      case "player-updated":
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

      case "game-started":
        // State update will come through "state" message
        break

      case "clue-given":
        setState((prev) => {
          if (!prev.gameState || !prev.gameState.currentTurn) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              currentTurn: {
                ...prev.gameState.currentTurn,
                clue: message.clue,
                phase: "guessing",
              },
              clueHistory: [...prev.gameState.clueHistory, message.clue],
            },
          }
        })
        break

      case "card-revealed":
        setState((prev) => {
          if (!prev.gameState) return prev
          const newBoard = [...prev.gameState.board]
          newBoard[message.cardIndex] = {
            ...newBoard[message.cardIndex],
            revealed: true,
            revealedBy: message.team,
            type: message.cardType,
          }
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              board: newBoard,
            },
          }
        })
        break

      case "turn-ended":
        // State update will come through "state" message
        break

      case "game-over":
        // State update will come through "state" message
        break

      case "error":
        setState((prev) => ({
          ...prev,
          error: message.message,
        }))
        // Clear error after 3 seconds
        setTimeout(() => {
          setState((prev) => ({ ...prev, error: null }))
        }, 3000)
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
      isSpymaster: false,
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

  const proceedToTeamSelection = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "proceed-to-team-selection" }))
    }
  }, [state.isHost])

  const selectTeam = useCallback((team: Team, role: PlayerRole) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "select-team", team, role }))
    }
  }, [])

  const startGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "start-game" }))
    }
  }, [state.isHost])

  const giveClue = useCallback((word: string, count: number) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "give-clue", word, count }))
    }
  }, [])

  const guess = useCallback((cardIndex: number) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "guess", cardIndex }))
    }
  }, [])

  const endGuessing = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "end-guessing" }))
    }
  }, [])

  const restart = useCallback(() => {
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
    proceedToTeamSelection,
    selectTeam,
    startGame,
    giveClue,
    guess,
    endGuessing,
    restart,
    disconnect,
  }
}
