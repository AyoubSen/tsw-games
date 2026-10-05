import PartySocket from "partysocket"
import { useCallback, useEffect, useRef, useState } from "react"
import { useReactionBubbles } from "@/components/multiplayer/Reactions"
import type { BombClientMessage, BombDifficulty, BombServerMessage, BombSubmission, PublicBombState } from "@/lib/bombDefusal"
import type { Reaction } from "@/lib/reactions"
import {
  clearPersistentPlayerId, clearPersistentPlayerToken, generateRoomCode,
  getGameNightSocketQuery, getPersistentPlayerId, getPersistentPlayerToken,
  leavePartySocket, PARTYKIT_HOST,
} from "@/lib/partykit"
import { useAuthTokenRef } from "@/lib/account"

interface MultiplayerState {
  connectionStatus: "disconnected" | "connecting" | "connected" | "error"
  gameState: PublicBombState | null
  playerId: string | null
  error: string | null
  /** Server clock minus local clock, measured when the last state arrived. */
  clockOffset: number
}

const INITIAL_STATE: MultiplayerState = {
  connectionStatus: "disconnected", gameState: null, playerId: null, error: null, clockOffset: 0,
}

export function useMultiplayerBombDefusal() {
  const [state, setState] = useState<MultiplayerState>(INITIAL_STATE)
  const socketRef = useRef<PartySocket | null>(null)
  const authTokenRef = useAuthTokenRef()
  const roomCodeRef = useRef("")
  const { bubbles: reactions, receive: receiveReaction, clear: clearReactions } = useReactionBubbles()

  const connect = useCallback((roomCode: string, hosting: boolean, name: string, timeLimit = 240, difficulty: BombDifficulty = "normal") => {
    const nightQuery = getGameNightSocketQuery(roomCode)
    const normalized = nightQuery.night ? roomCode : roomCode.toUpperCase()
    const previous = socketRef.current
    socketRef.current = null
    previous?.close()
    roomCodeRef.current = normalized
    const playerId = getPersistentPlayerId("bomb-defusal", normalized)
    clearReactions()
    setState({ ...INITIAL_STATE, connectionStatus: "connecting", playerId })
    const socket = new PartySocket({
      host: PARTYKIT_HOST, room: normalized, id: playerId, party: "bombdefusal",
      query: {
        ...nightQuery, host: String(hosting), timeLimit: String(timeLimit), difficulty,
        playerToken: getPersistentPlayerToken("bomb-defusal", normalized),
      },
      maxEnqueuedMessages: 0,
    })
    socketRef.current = socket
    socket.addEventListener("open", async () => {
      if (socketRef.current !== socket) return
      const authToken = await authTokenRef.current()
      if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify({ type: "join", name, authToken }))
    })
    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as BombServerMessage
        if (message.type === "state") {
          setState({ connectionStatus: "connected", playerId, gameState: message.state, error: null, clockOffset: message.state.serverTime - Date.now() })
        } else if (message.type === "reaction") {
          receiveReaction(message)
        } else if (message.type === "error") {
          if (message.message === "Invalid player session") {
            clearPersistentPlayerId("bomb-defusal", normalized)
            clearPersistentPlayerToken("bomb-defusal", normalized)
          }
          setState((previousState) => ({
            ...previousState, error: message.message,
            connectionStatus: previousState.gameState ? previousState.connectionStatus : "error",
          }))
        }
      } catch (error) {
        console.error("Failed to parse Bomb Defusal message:", error)
      }
    })
    const reconnect = () => {
      if (socketRef.current !== socket) return
      setState((previousState) => ({ ...previousState, connectionStatus: "connecting", error: "Connection lost. Reconnecting..." }))
    }
    socket.addEventListener("close", reconnect)
    socket.addEventListener("error", reconnect)
  }, [clearReactions, receiveReaction, authTokenRef])

  const send = useCallback((message: BombClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [])

  const createGame = useCallback((name: string, timeLimit = 240, roomId?: string, difficulty: BombDifficulty = "normal") => {
    const roomCode = roomId ?? generateRoomCode()
    connect(roomCode, true, name, timeLimit, difficulty)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, name: string) => connect(roomCode, false, name), [connect])

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("bomb-defusal", roomCodeRef.current)
      clearPersistentPlayerToken("bomb-defusal", roomCodeRef.current)
    }
    roomCodeRef.current = ""
    clearReactions()
    setState(INITIAL_STATE)
  }, [clearReactions])

  const abandonReconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  useEffect(() => () => socketRef.current?.close(), [])

  return {
    ...state,
    reactions,
    isHost: state.gameState?.canControl ?? false,
    createGame, joinGame, disconnect, abandonReconnect,
    startGame: () => send({ type: "start" }),
    updateSettings: (settings: { timeLimit?: number; difficulty?: BombDifficulty }) => send({ type: "settings", ...settings }),
    react: (reaction: Reaction) => send({ type: "react", reaction }),
    nextRound: () => state.gameState?.missionId && send({ type: "next", missionId: state.gameState.missionId }),
    restartGame: () => send({ type: "restart" }),
    submit: (submission: BombSubmission, revision: number) => Boolean(state.gameState?.missionId && send({
      type: "attempt", missionId: state.gameState.missionId, revision, submission,
    })),
  }
}
