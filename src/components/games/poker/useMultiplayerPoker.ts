import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode } from "@/lib/partykit"
import type {
  ServerMessage,
  PublicGameState,
  PokerSettings,
} from "../../../../party/poker"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export type { PokerSettings }

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  isHost: boolean
}

export function useMultiplayerPoker() {
  const [state, setState] = useState<MultiplayerState>({
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    isHost: false,
  })

  const socketRef = useRef<PartySocket | null>(null)
  const playerNameRef = useRef<string>("")

  const connect = useCallback(
    (roomCode: string, isHost: boolean, playerName: string, settings?: PokerSettings) => {
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
        party: "poker",
        query: {
          host: isHost.toString(),
          ...(settings && {
            startingChips: settings.startingChips.toString(),
            smallBlind: settings.smallBlind.toString(),
            blindIncrease: settings.blindIncrease.toString(),
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
              seatOrder: prev.gameState.seatOrder.includes(message.player.id)
                ? prev.gameState.seatOrder
                : [...prev.gameState.seatOrder, message.player.id],
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
              seatOrder: prev.gameState.seatOrder.filter((id) => id !== message.playerId),
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
    (playerName: string, settings: PokerSettings) => {
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

  const fold = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "fold" }))
  }, [])

  const check = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "check" }))
  }, [])

  const call = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "call" }))
  }, [])

  const raise = useCallback((amount: number) => {
    socketRef.current?.send(JSON.stringify({ type: "raise", amount }))
  }, [])

  const allIn = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "all-in" }))
  }, [])

  const nextHand = useCallback(() => {
    if (socketRef.current && state.isHost) {
      socketRef.current.send(JSON.stringify({ type: "next-hand" }))
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
    fold,
    check,
    call,
    raise,
    allIn,
    nextHand,
    disconnect,
  }
}
