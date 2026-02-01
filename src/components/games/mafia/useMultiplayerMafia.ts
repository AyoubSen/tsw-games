import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type {
  ServerMessage,
  PublicGameState,
  MafiaSettings,
} from "../../../../party/mafia"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export type { MafiaSettings }

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
}

export function useMultiplayerMafia() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
  })

  const socketRef = useRef<PartySocket | null>(null)

  const connect = useCallback(
    (roomCode: string, isHost: boolean, playerName: string, settings?: MafiaSettings) => {
      if (socketRef.current) {
        socketRef.current.close()
      }

      setState((prev) => ({
        ...prev,
        connectionStatus: "connecting",
        error: null,
        isHost,
      }))

      const socket = new PartySocket({
        host: PARTYKIT_HOST,
        room: roomCode,
        party: "mafia",
        query: {
          host: isHost.toString(),
          ...(settings && {
            discussionTime: settings.discussionTime.toString(),
            votingTime: settings.votingTime.toString(),
            nightTime: settings.nightTime.toString(),
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
    },
    []
  )

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
              playerOrder: prev.gameState.playerOrder.filter((id) => id !== message.playerId),
            },
          }
        })
        break

      case "error":
        setState((prev) => ({
          ...prev,
          error: message.message,
        }))
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
      error: null,
      isHost: false,
    })
  }, [])

  const createGame = useCallback(
    (playerName: string, settings: MafiaSettings) => {
      const roomCode = generateRoomCode()
      connect(roomCode, true, playerName, settings)
      return roomCode
    },
    [connect]
  )

  const joinGame = useCallback(
    (roomCode: string, playerName: string) => {
      connect(roomCode.toUpperCase(), false, playerName)
    },
    [connect]
  )

  const startGame = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "start-game" }))
    }
  }, [state.isHost])

  const sendNightAction = useCallback((targetId: string) => {
    socketRef.current?.send(JSON.stringify({ type: "night-action", targetId }))
  }, [])

  const sendWitchAction = useCallback((heal: boolean, killTargetId: string | null) => {
    socketRef.current?.send(JSON.stringify({ type: "witch-action", heal, killTargetId }))
  }, [])

  const sendCupidAction = useCallback((lover1: string, lover2: string) => {
    socketRef.current?.send(JSON.stringify({ type: "cupid-action", lover1, lover2 }))
  }, [])

  const sendHunterKill = useCallback((targetId: string) => {
    socketRef.current?.send(JSON.stringify({ type: "hunter-kill", targetId }))
  }, [])

  const sendDayVote = useCallback((targetId: string) => {
    socketRef.current?.send(JSON.stringify({ type: "day-vote", targetId }))
  }, [])

  const sendChat = useCallback((text: string) => {
    socketRef.current?.send(JSON.stringify({ type: "chat", text }))
  }, [])

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
    sendNightAction,
    sendWitchAction,
    sendCupidAction,
    sendHunterKill,
    sendDayVote,
    sendChat,
    disconnect,
  }
}
