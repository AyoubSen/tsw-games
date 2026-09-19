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
  const roomCodeRef = useRef("")
  const playerNameRef = useRef<string>("")

  const connect = useCallback(
    (roomCode: string, isHost: boolean, playerName: string, settings?: PokerSettings) => {
      const normalizedRoomCode = roomCode.toUpperCase()
      const previousSocket = socketRef.current
      socketRef.current = null
      previousSocket?.close()

      playerNameRef.current = playerName
      roomCodeRef.current = normalizedRoomCode
      const playerId = getPersistentPlayerId("poker", normalizedRoomCode)

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
        party: "poker",
        maxEnqueuedMessages: 0,
        query: {
          host: isHost.toString(),
          playerToken: getPersistentPlayerToken("poker", normalizedRoomCode),
          ...(settings && {
            startingChips: settings.startingChips.toString(),
            smallBlind: settings.smallBlind.toString(),
            blindIncrease: settings.blindIncrease.toString(),
            turnTimeLimit: settings.turnTimeLimit.toString(),
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
    },
    []
  )

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState((prev) => ({
          ...prev,
          connectionStatus: "connected",
          gameState: message.state,
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
		if (message.message === "Invalid player session" && roomCodeRef.current) {
		  clearPersistentPlayerId("poker", roomCodeRef.current)
		  clearPersistentPlayerToken("poker", roomCodeRef.current)
		  roomCodeRef.current = ""
		}
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
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("poker", roomCodeRef.current)
      clearPersistentPlayerToken("poker", roomCodeRef.current)
      roomCodeRef.current = ""
    }
    setState({
      connectionStatus: "disconnected",
      gameState: null,
      playerId: null,
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
    if (state.isHost) sendNow({ type: "start-game" })
  }, [sendNow, state.isHost])

  const fold = useCallback(() => {
    sendNow({ type: "fold" })
  }, [sendNow])

  const check = useCallback(() => {
    sendNow({ type: "check" })
  }, [sendNow])

  const call = useCallback(() => {
    sendNow({ type: "call" })
  }, [sendNow])

  const raise = useCallback((amount: number) => {
    sendNow({ type: "raise", amount })
  }, [sendNow])

  const allIn = useCallback(() => {
    sendNow({ type: "all-in" })
  }, [sendNow])

  const nextHand = useCallback(() => {
    if (state.isHost) sendNow({ type: "next-hand" })
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
    startGame,
    fold,
    check,
    call,
    raise,
    allIn,
    nextHand,
    disconnect,
    abandonReconnect,
  }
}
