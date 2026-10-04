import PartySocket from "partysocket"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  clearPersistentPlayerId,
  clearPersistentPlayerToken,
  generateRoomCode,
  getPersistentPlayerId,
  getPersistentPlayerToken,
  leavePartySocket,
  PARTYKIT_HOST,
} from "@/lib/partykit"
import type { BotLevel } from "@/lib/botLevel"
import type { Reaction } from "@/lib/reactions"
import { useReactionBubbles } from "@/components/multiplayer/Reactions"
import type { AimMessage, PublicGameState, ServerMessage } from "../../../../party/pool"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface PoolShotCommand {
  dirX: number
  dirY: number
  power: number
  spinX: number
  spinY: number
  x?: number
  y?: number
  pocket?: number | null
}

export interface PoolAimCommand {
  dirX: number
  dirY: number
  pull: number
  spinX: number
  spinY: number
  x?: number
  y?: number
}

interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  /** Server clock minus ours, so shot replays line up for everyone. */
  clockOffset: number
}

const INITIAL_STATE: MultiplayerState = {
  connectionStatus: "disconnected",
  gameState: null,
  playerId: null,
  error: null,
  clockOffset: 0,
}

const AIM_SEND_MS = 70

export function useMultiplayerPool() {
  const [state, setState] = useState<MultiplayerState>(INITIAL_STATE)
  const [remoteAim, setRemoteAim] = useState<AimMessage | null>(null)
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")
  const aimTimerRef = useRef<{ last: number; timer: number | null; queued: object | null }>({ last: 0, timer: null, queued: null })
  const { bubbles: reactions, receive: receiveReaction, clear: clearReactions } = useReactionBubbles()
  const isHost = Boolean(state.gameState && state.playerId && state.gameState.hostId === state.playerId)

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "reaction") {
      receiveReaction(message)
      return
    }
    if (message.type === "aim") {
      setRemoteAim(message)
      return
    }
    if (message.type === "state") {
      const clockOffset = message.state.serverNow - Date.now()
      setState((previous) => ({ ...previous, connectionStatus: "connected", gameState: message.state, error: null, clockOffset }))
      return
    }
    setState((previous) => ({ ...previous, error: message.message }))
  }, [receiveReaction])

  const connect = useCallback(
    (roomCode: string, hosting: boolean, playerName: string, vsBot?: BotLevel) => {
      const normalizedRoomCode = roomCode.toUpperCase()
      const previousSocket = socketRef.current
      socketRef.current = null
      previousSocket?.close()
      roomCodeRef.current = normalizedRoomCode
      const playerId = getPersistentPlayerId("pool", normalizedRoomCode)
      setState({ ...INITIAL_STATE, connectionStatus: "connecting", playerId })
      setRemoteAim(null)

      const socket = new PartySocket({
        host: PARTYKIT_HOST,
        room: normalizedRoomCode,
        id: playerId,
        party: "pool",
        query: { host: hosting.toString(), playerToken: getPersistentPlayerToken("pool", normalizedRoomCode) },
        maxEnqueuedMessages: 0,
      })
      socketRef.current = socket
      let botQueued = Boolean(vsBot)

      socket.addEventListener("open", () => {
        if (socketRef.current !== socket) return
        setState((previous) => ({ ...previous, connectionStatus: "connected", playerId: socket.id }))
        socket.send(JSON.stringify({ type: "join", name: playerName }))
        // "Play a bot" skips the lobby: seat a bot and rack straight away.
        if (botQueued) {
          botQueued = false
          socket.send(JSON.stringify({ type: "add-bot", level: vsBot }))
          socket.send(JSON.stringify({ type: "start" }))
        }
      })

      socket.addEventListener("message", (event) => {
        if (socketRef.current !== socket) return
        try {
          handleMessage(JSON.parse(event.data) as ServerMessage)
        } catch (error) {
          console.error("Failed to parse pool message:", error)
        }
      })

      const markReconnecting = () => {
        if (socketRef.current !== socket) return
        setState((previous) => ({ ...previous, connectionStatus: "connecting", error: "Connection lost. Reconnecting..." }))
      }
      socket.addEventListener("close", markReconnecting)
      socket.addEventListener("error", markReconnecting)
    },
    [handleMessage],
  )

  const sendNow = useCallback((message: object) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }, [])

  /** Live aim for the other players, trimmed to a steady trickle. */
  const sendAim = useCallback((turnId: number, aim: PoolAimCommand) => {
    const slot = aimTimerRef.current
    slot.queued = { type: "aim", turnId, ...aim }
    const flush = () => {
      slot.timer = null
      if (!slot.queued) return
      slot.last = Date.now()
      sendNow(slot.queued)
      slot.queued = null
    }
    const wait = AIM_SEND_MS - (Date.now() - slot.last)
    if (wait <= 0) flush()
    else if (slot.timer === null) slot.timer = window.setTimeout(flush, wait)
  }, [sendNow])

  const createGame = useCallback((playerName: string, vsBot?: BotLevel) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, playerName, vsBot)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode, false, playerName)
  }, [connect])

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) leavePartySocket(socket, { type: "leave" })
    if (roomCodeRef.current) {
      clearPersistentPlayerId("pool", roomCodeRef.current)
      clearPersistentPlayerToken("pool", roomCodeRef.current)
      roomCodeRef.current = ""
    }
    clearReactions()
    setRemoteAim(null)
    setState(INITIAL_STATE)
  }, [clearReactions])

  const abandonReconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
    roomCodeRef.current = ""
    setState(INITIAL_STATE)
  }, [])

  useEffect(() => () => {
    socketRef.current?.close()
    const timer = aimTimerRef.current.timer
    if (timer !== null) window.clearTimeout(timer)
  }, [])

  return {
    ...state,
    isHost,
    reactions,
    remoteAim,
    createGame,
    joinGame,
    startGame: () => isHost && sendNow({ type: "start" }),
    addBot: () => isHost && sendNow({ type: "add-bot" }),
    removePlayer: (playerId: string) => isHost && sendNow({ type: "remove-player", playerId }),
    setBotLevel: (playerId: string, level: BotLevel) => isHost && sendNow({ type: "set-bot-level", playerId, level }),
    sendAim,
    shoot: (turnId: number, shot: PoolShotCommand) => {
      const slot = aimTimerRef.current
      if (slot.timer !== null) window.clearTimeout(slot.timer)
      slot.timer = null
      slot.queued = null
      return sendNow({ type: "shoot", turnId, ...shot })
    },
    restartGame: () => isHost && sendNow({ type: "restart" }),
    seatSpectator: (playerId: string) => isHost && sendNow({ type: "seat-spectator", playerId }),
    react: (reaction: Reaction) => sendNow({ type: "react", reaction }),
    disconnect,
    abandonReconnect,
  }
}
