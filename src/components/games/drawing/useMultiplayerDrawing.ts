import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type {
  ServerMessage,
  PublicGameState,
  Stroke,
  Guess,
} from "../../../../party/drawing"
import type { GameSettings } from "./GameModeSelector"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
  strokes: Stroke[]
  guesses: Guess[]
}

export function useMultiplayerDrawing() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
    strokes: [],
    guesses: [],
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
      strokes: [],
      guesses: [],
    }))

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode,
      party: "drawing",
      query: {
        host: isHost.toString(),
        ...(settings && {
          roundTimeLimit: settings.roundTimeLimit.toString(),
          roundsPerPlayer: settings.roundsPerPlayer.toString(),
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
          strokes: message.state.strokes,
          guesses: message.state.guesses,
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

      case "round-started":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            strokes: [],
            guesses: [],
            gameState: {
              ...prev.gameState,
              status: "playing",
              currentDrawerId: message.drawerId,
              currentWord: message.word,
              wordLength: message.wordLength,
              strokes: [],
              guesses: [],
              correctGuessers: [],
            },
          }
        })
        break

      case "draw":
        setState((prev) => ({
          ...prev,
          strokes: [...prev.strokes, message.stroke],
        }))
        break

      case "clear":
        setState((prev) => ({
          ...prev,
          strokes: [],
        }))
        break

      case "guess":
        setState((prev) => ({
          ...prev,
          guesses: [...prev.guesses, message.guess],
        }))
        break

      case "correct-guess":
        setState((prev) => {
          if (!prev.gameState) return prev
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              correctGuessers: [...prev.gameState.correctGuessers, message.playerId],
            },
          }
        })
        break

      case "round-ended":
        setState((prev) => {
          if (!prev.gameState) return prev
          // Update player scores from the scores object
          const updatedPlayers = { ...prev.gameState.players }
          for (const [id, score] of Object.entries(message.scores)) {
            if (updatedPlayers[id]) {
              updatedPlayers[id] = { ...updatedPlayers[id], score }
            }
          }
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              status: "round-end",
              currentWord: message.word,
              players: updatedPlayers,
            },
          }
        })
        break

      case "game-over":
        setState((prev) => {
          if (!prev.gameState) return prev
          // Update player scores from results
          const updatedPlayers = { ...prev.gameState.players }
          for (const result of message.results) {
            if (updatedPlayers[result.id]) {
              updatedPlayers[result.id] = { ...updatedPlayers[result.id], score: result.score }
            }
          }
          return {
            ...prev,
            gameState: {
              ...prev.gameState,
              status: "finished",
              players: updatedPlayers,
            },
          }
        })
        break

      case "game-restarted":
        setState((prev) => ({
          ...prev,
          strokes: [],
          guesses: [],
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
      strokes: [],
      guesses: [],
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

  const sendStroke = useCallback((stroke: Stroke) => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "draw", stroke }))
      // Also add to local state immediately for drawer
      setState((prev) => ({
        ...prev,
        strokes: [...prev.strokes, stroke],
      }))
    }
  }, [])

  const clearCanvas = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "clear" }))
      setState((prev) => ({
        ...prev,
        strokes: [],
      }))
    }
  }, [])

  const sendGuess = useCallback((text: string) => {
    if (socketRef.current && text.trim()) {
      socketRef.current.send(JSON.stringify({ type: "guess", text: text.trim() }))
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
    sendStroke,
    clearCanvas,
    sendGuess,
    restartGame,
    disconnect,
  }
}
