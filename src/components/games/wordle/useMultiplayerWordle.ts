import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import {
  PARTYKIT_HOST,
  clearPersistentPlayerId,
  generateRoomCode,
  getPersistentPlayerId,
  leavePartySocket,
} from "@/lib/partykit"
import {
  WORDLE_PROTOCOL_VERSION,
  type ClientMessage,
  type EvaluatedLetter,
  type PrivatePlayerState,
  type ServerMessage,
  type PublicGameState,
  type GameMode,
  type RevealMode,
  type SeriesLength,
} from "../../../../party/wordle"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface RoundReveal {
  turn: number
  playerGuesses: Record<string, EvaluatedLetter[][]>
}

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  privatePlayer: PrivatePlayerState | null
  playerId: string | null
  error: string | null
  waitingFor: string[]
  isWaitingForOthers: boolean
  roundReveal: RoundReveal | null
}

function initialState(overrides: Partial<MultiplayerState> = {}): MultiplayerState {
  return {
    connectionStatus: "disconnected",
    gameState: null,
    privatePlayer: null,
    playerId: null,
    error: null,
    waitingFor: [],
    isWaitingForOthers: false,
    roundReveal: null,
    ...overrides,
  }
}

export function useMultiplayerWordle() {
  const [state, setState] = useState<MultiplayerState>(() => initialState())
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")
  const roundIdRef = useRef("")
  const revisionRef = useRef(0)

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "error") {
      const terminal = message.message === "Game not found" ||
        message.message === "Game already started" ||
        message.message === "Series already started" ||
        message.message === "Game is full"
      if (terminal) {
        const socket = socketRef.current
        socketRef.current = null
        socket?.close()
        roundIdRef.current = ""
        revisionRef.current = 0
        setState(initialState({ connectionStatus: "error", error: message.message }))
      } else {
        setState(prev => ({ ...prev, error: message.message }))
      }
      return
    }

    if (message.revision < revisionRef.current) return
    if (message.type !== "state" && roundIdRef.current && message.roundId !== roundIdRef.current) return
    revisionRef.current = Math.max(revisionRef.current, message.revision)

    switch (message.type) {
      case "state":
        roundIdRef.current = message.state.roundId
        setState(prev => {
          const roundChanged = prev.gameState?.roundId !== message.state.roundId
          const ownPlayer = prev.playerId ? message.state.players[prev.playerId] : null
          return {
            ...prev,
            connectionStatus: "connected",
            gameState: message.state,
            privatePlayer: roundChanged || message.state.status === "waiting" ? null : prev.privatePlayer,
            waitingFor: message.state.waitingFor
              .map(id => message.state.players[id]?.name)
              .filter((name): name is string => Boolean(name)),
            isWaitingForOthers: Boolean(ownPlayer?.readyForNextTurn),
            roundReveal: roundChanged || message.state.status !== "playing" ? null : prev.roundReveal,
            error: null,
          }
        })
        break

      case "private-state":
        setState(prev => ({
          ...prev,
          playerId: message.player.playerId,
          privatePlayer: message.player,
          error: null,
        }))
        break

      case "round-reveal":
        setState(prev => ({
          ...prev,
          roundReveal: {
            turn: message.turn,
            playerGuesses: message.playerGuesses,
          },
        }))
        break
    }
  }, [])

  const connect = useCallback((
    roomCode: string,
    isHost: boolean,
    mode: GameMode,
    revealMode: RevealMode,
    hardMode: boolean,
    seriesLength: SeriesLength,
    playerName: string,
  ) => {
    const previousSocket = socketRef.current
    socketRef.current = null
    previousSocket?.close()

    roomCodeRef.current = roomCode
    roundIdRef.current = ""
    revisionRef.current = 0
    const playerId = getPersistentPlayerId("wordle", roomCode)
    setState(initialState({ connectionStatus: "connecting", playerId }))

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode,
      id: playerId,
      query: {
        host: isHost.toString(),
        mode,
        revealMode,
        hardMode: hardMode.toString(),
        seriesLength: String(seriesLength),
        protocolVersion: String(WORDLE_PROTOCOL_VERSION),
      },
      maxEnqueuedMessages: 0,
    })
    socketRef.current = socket

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return
      revisionRef.current = 0
      setState(prev => ({ ...prev, error: null }))
      const join: ClientMessage = {
        type: "join",
        protocolVersion: WORDLE_PROTOCOL_VERSION,
        name: playerName,
      }
      socket.send(JSON.stringify(join))
    })

    socket.addEventListener("message", event => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.protocolVersion !== WORDLE_PROTOCOL_VERSION) {
          socketRef.current = null
          socket.close(1008, "Incompatible Wordle server")
          setState(initialState({
            connectionStatus: "error",
            error: "Wordle was updated. Refresh this page to continue.",
          }))
          return
        }
        handleMessage(message)
      } catch (error) {
        console.error("Failed to parse Wordle message:", error)
      }
    })

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return
      setState(prev => ({ ...prev, connectionStatus: "disconnected" }))
    })

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return
      setState(prev => ({
        ...prev,
        connectionStatus: "disconnected",
        error: null,
      }))
    })
  }, [handleMessage])

  const sendNow = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== 1) {
      setState(prev => ({ ...prev, error: "Connection lost. Reconnecting..." }))
      return false
    }
    socket.send(JSON.stringify(message))
    return true
  }, [])

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    const roomCode = roomCodeRef.current
    socketRef.current = null
    if (socket) {
      const leave: ClientMessage = { type: "leave", protocolVersion: WORDLE_PROTOCOL_VERSION }
      leavePartySocket(socket, leave)
    }
    if (roomCode) clearPersistentPlayerId("wordle", roomCode)
    roomCodeRef.current = ""
    roundIdRef.current = ""
    revisionRef.current = 0
    setState(initialState())
  }, [])

  const abandonReconnect = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()
    roomCodeRef.current = ""
    roundIdRef.current = ""
    revisionRef.current = 0
    setState(initialState())
  }, [])

  const dismissReveal = useCallback(() => {
    setState(prev => ({ ...prev, roundReveal: null }))
  }, [])

  const createGame = useCallback((
    mode: GameMode,
    revealMode: RevealMode,
    hardMode: boolean,
    seriesLength: SeriesLength,
    playerName: string,
  ) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, mode, revealMode, hardMode, seriesLength, playerName)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode.toUpperCase(), false, "race", "after-round", false, 1, playerName)
  }, [connect])

  const startGame = useCallback(() => {
    if (!roundIdRef.current) return
    sendNow({ type: "start", protocolVersion: WORDLE_PROTOCOL_VERSION, roundId: roundIdRef.current })
  }, [sendNow])

  const sendGuess = useCallback((word: string) => {
    if (!roundIdRef.current) return false
    return sendNow({
      type: "guess",
      protocolVersion: WORDLE_PROTOCOL_VERSION,
      roundId: roundIdRef.current,
      word,
    })
  }, [sendNow])

  const restartGame = useCallback(() => {
    if (!roundIdRef.current) return
    sendNow({ type: "restart", protocolVersion: WORDLE_PROTOCOL_VERSION, roundId: roundIdRef.current })
  }, [sendNow])

  useEffect(() => {
    return () => {
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
    }
  }, [])

  const isHost = Boolean(state.gameState && state.playerId && state.gameState.hostId === state.playerId)

  return {
    ...state,
    isHost,
    createGame,
    joinGame,
    startGame,
    sendGuess,
    restartGame,
    disconnect,
    abandonReconnect,
    dismissReveal,
  }
}
