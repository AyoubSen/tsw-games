import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import {
  PARTYKIT_HOST,
  clearPersistentPlayerId,
  clearPersistentPlayerToken,
  generateRoomCode,
  getGameNightSocketQuery,
  getPersistentPlayerId,
  getPersistentPlayerToken,
  leavePartySocket,
} from "@/lib/partykit"
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
  const roomCodeRef = useRef("")

  const connect = useCallback(
    (roomCode: string, isHost: boolean, playerName: string, settings?: MafiaSettings) => {
      const gameNightQuery = getGameNightSocketQuery(roomCode)
      const normalizedRoomCode = gameNightQuery.night ? roomCode : roomCode.toUpperCase()
      const previousSocket = socketRef.current
      socketRef.current = null
      previousSocket?.close()
      roomCodeRef.current = normalizedRoomCode
      const playerId = getPersistentPlayerId("mafia", normalizedRoomCode)

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
        party: "mafia",
        maxEnqueuedMessages: 0,
        query: {
          host: isHost.toString(),
          playerToken: getPersistentPlayerToken("mafia", normalizedRoomCode),
          ...gameNightQuery,
          ...(settings && {
            discussionTime: settings.discussionTime.toString(),
            votingTime: settings.votingTime.toString(),
            nightTime: settings.nightTime.toString(),
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
		if (message.message === "Invalid player session" && roomCodeRef.current) {
		  clearPersistentPlayerId("mafia", roomCodeRef.current)
		  clearPersistentPlayerToken("mafia", roomCodeRef.current)
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
      clearPersistentPlayerId("mafia", roomCodeRef.current)
      clearPersistentPlayerToken("mafia", roomCodeRef.current)
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
    (playerName: string, settings: MafiaSettings, childRoomId?: string) => {
      const roomCode = childRoomId ?? generateRoomCode()
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

  const sendNightAction = useCallback((targetId: string) => {
    sendNow({ type: "night-action", targetId })
  }, [sendNow])

  const sendWitchAction = useCallback((heal: boolean, killTargetId: string | null) => {
    sendNow({ type: "witch-action", heal, killTargetId })
  }, [sendNow])

  const sendCupidAction = useCallback((lover1: string, lover2: string) => {
    sendNow({ type: "cupid-action", lover1, lover2 })
  }, [sendNow])

  const sendHunterKill = useCallback((targetId: string) => {
    sendNow({ type: "hunter-kill", targetId })
  }, [sendNow])

  const sendDayVote = useCallback((targetId: string) => {
    sendNow({ type: "day-vote", targetId })
  }, [sendNow])

  const sendChat = useCallback((text: string) => {
    sendNow({ type: "chat", text })
  }, [sendNow])

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
    abandonReconnect,
  }
}
