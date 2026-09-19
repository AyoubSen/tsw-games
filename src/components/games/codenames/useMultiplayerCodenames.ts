import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import {
  PARTYKIT_HOST,
  clearPersistentPlayerId,
  clearPersistentPlayerToken,
  generateRoomCode,
  getPersistentPlayerId,
  getPersistentPlayerToken,
  leavePartySocket,
} from "@/lib/partykit"
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
  const roomCodeRef = useRef("")
  const playerNameRef = useRef<string>("")

  const connect = useCallback((roomCode: string, isHost: boolean, playerName: string, settings?: GameSettings) => {
    const normalizedRoomCode = roomCode.toUpperCase()
    const previousSocket = socketRef.current
    socketRef.current = null
    previousSocket?.close()

    playerNameRef.current = playerName
    roomCodeRef.current = normalizedRoomCode
    const playerId = getPersistentPlayerId("codenames", normalizedRoomCode)

    setState((prev) => ({
      ...prev,
      connectionStatus: "connecting",
      error: null,
      playerId,
    }))

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: normalizedRoomCode,
      id: playerId,
      party: "codenames",
      maxEnqueuedMessages: 0,
      query: {
        host: isHost.toString(),
        playerToken: getPersistentPlayerToken("codenames", normalizedRoomCode),
        ...(settings && {
          gameMode: settings.gameMode,
          clueTimeLimit: settings.clueTimeLimit.toString(),
          guessTimeLimit: settings.guessTimeLimit.toString(),
        }),
      },
    })
    socketRef.current = socket

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return
      setState((prev) => ({
        ...prev,
        connectionStatus: "connected",
        playerId: socket.id,
        error: null,
      }))

      socket.send(JSON.stringify({ type: "join", name: playerName }))
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
  }, [])

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState((prev) => ({
          ...prev,
          connectionStatus: "connected",
          gameState: message.state,
          isSpymaster: message.isSpymaster,
          isHost: Boolean(prev.playerId && message.state.hostId === prev.playerId),
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
		if (message.message === "Invalid player session" && roomCodeRef.current) {
		  clearPersistentPlayerId("codenames", roomCodeRef.current)
		  clearPersistentPlayerToken("codenames", roomCodeRef.current)
		  roomCodeRef.current = ""
		}
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
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("codenames", roomCodeRef.current)
      clearPersistentPlayerToken("codenames", roomCodeRef.current)
      roomCodeRef.current = ""
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

  const abandonReconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
    roomCodeRef.current = ""
    setState({
      connectionStatus: "disconnected",
      gameState: null,
      playerId: null,
      isSpymaster: false,
      error: null,
      isHost: false,
    })
  }, [])

  const sendNow = useCallback((message: object) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
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
    if (state.isHost) sendNow({ type: "proceed-to-team-selection" })
  }, [sendNow, state.isHost])

  const selectTeam = useCallback((team: Team, role: PlayerRole) => {
    sendNow({ type: "select-team", team, role })
  }, [sendNow])

  const startGame = useCallback(() => {
    if (state.isHost) sendNow({ type: "start-game" })
  }, [sendNow, state.isHost])

  const giveClue = useCallback((word: string, count: number) => {
    sendNow({ type: "give-clue", word, count })
  }, [sendNow])

  const guess = useCallback((cardIndex: number) => {
    sendNow({ type: "guess", cardIndex })
  }, [sendNow])

  const endGuessing = useCallback(() => {
    sendNow({ type: "end-guessing" })
  }, [sendNow])

  const restart = useCallback(() => {
    if (state.isHost) sendNow({ type: "restart" })
  }, [sendNow, state.isHost])

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
    abandonReconnect,
  }
}
