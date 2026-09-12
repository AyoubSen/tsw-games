import { useState, useCallback, useEffect, useRef } from "react"
import PartySocket from "partysocket"
import { PARTYKIT_HOST, generateRoomCode, getPersistentPlayerId, clearPersistentPlayerId } from "@/lib/partykit"
import {
  SUDOKU_PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  type PublicGameState,
  type Difficulty,
} from "../../../../party/sudoku"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface MultiplayerState {
  connectionStatus: ConnectionStatus
  gameState: PublicGameState | null
  playerId: string | null
  error: string | null
  puzzleReady: boolean
  serverTimeOffset: number
  restoredCells: (number | null)[] | null
  wrongCells: ReadonlySet<number>
}

interface StoredSession {
  roomCode: string
  name: string
  savedAt: number
}

const SESSION_KEY = "sudoku:lastSession"
const SESSION_TTL_MS = 6 * 60 * 60 * 1000

function initialState(overrides: Partial<MultiplayerState> = {}): MultiplayerState {
  return {
    connectionStatus: "disconnected",
    gameState: null,
    playerId: null,
    error: null,
    puzzleReady: false,
    serverTimeOffset: 0,
    restoredCells: null,
    wrongCells: new Set<number>(),
    ...overrides,
  }
}

function saveSession(roomCode: string, name: string) {
  if (typeof sessionStorage === "undefined") return
  const record: StoredSession = { roomCode, name, savedAt: Date.now() }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(record))
}

function readSession(): StoredSession | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const record = JSON.parse(raw) as StoredSession
    if (!record.roomCode || !record.name) return null
    if (Date.now() - record.savedAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return record
  } catch {
    return null
  }
}

function clearSession() {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY)
}

export function useMultiplayerSudoku() {
  const [state, setState] = useState<MultiplayerState>(() => initialState())
  const socketRef = useRef<PartySocket | null>(null)
  const roomCodeRef = useRef("")
  const roundIdRef = useRef("")
  const revisionRef = useRef(0)
  const resumingRef = useRef(false)

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "error") {
      const terminalJoinError = (
        message.message === "Game already started" ||
        message.message === "Game is full"
      )
      const quietResumeFailure = resumingRef.current && message.message === "Game not found"
      if (message.message === "Game not found" || terminalJoinError) {
        resumingRef.current = false
        clearSession()
        const socket = socketRef.current
        socketRef.current = null
        socket?.close()
        roundIdRef.current = ""
        revisionRef.current = 0
        setState(initialState({
          connectionStatus: quietResumeFailure ? "disconnected" : "error",
          error: quietResumeFailure ? null : message.message,
        }))
        return
      }
      setState(prev => ({ ...prev, error: message.message }))
      return
    }

    if (message.revision < revisionRef.current) return
    if (message.type !== "state" && roundIdRef.current && message.roundId !== roundIdRef.current) return
    revisionRef.current = Math.max(revisionRef.current, message.revision)

    switch (message.type) {
      case "state":
        resumingRef.current = false
        roundIdRef.current = message.state.roundId
        setState(prev => {
          const roundChanged = prev.gameState?.roundId !== message.state.roundId
          const waiting = message.state.status === "waiting"
          return {
            ...prev,
            connectionStatus: "connected",
            gameState: message.state,
            puzzleReady: !waiting && message.state.puzzle?.length === 81,
            serverTimeOffset: message.state.serverNow - Date.now(),
            restoredCells: roundChanged || waiting ? null : prev.restoredCells,
            wrongCells: roundChanged || waiting ? new Set<number>() : prev.wrongCells,
            error: null,
          }
        })
        break

      case "board-restored":
        if (message.cells.length !== 81) return
        setState(prev => ({ ...prev, restoredCells: message.cells }))
        break

      case "board-feedback":
        setState(prev => ({ ...prev, wrongCells: new Set(message.wrong) }))
        break

    }
  }, [])

  const connect = useCallback((roomCode: string, isHost: boolean, playerName: string, difficulty?: Difficulty) => {
    const previousSocket = socketRef.current
    socketRef.current = null
    previousSocket?.close()

    roomCodeRef.current = roomCode
    roundIdRef.current = ""
    revisionRef.current = 0
    const playerId = getPersistentPlayerId("sudoku", roomCode)
    saveSession(roomCode, playerName)
    setState(initialState({ connectionStatus: "connecting", playerId }))

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomCode,
      party: "sudoku",
      id: playerId,
      query: {
        host: isHost.toString(),
        protocolVersion: String(SUDOKU_PROTOCOL_VERSION),
        ...(difficulty && { difficulty }),
      },
      maxEnqueuedMessages: 0,
    })
    socketRef.current = socket

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) return
      revisionRef.current = 0
      setState(prev => ({
        ...prev,
        playerId: socket.id,
        error: null,
      }))
      const join: ClientMessage = {
        type: "join",
        protocolVersion: SUDOKU_PROTOCOL_VERSION,
        name: playerName,
      }
      socket.send(JSON.stringify(join))
    })

    socket.addEventListener("message", event => {
      if (socketRef.current !== socket) return
      try {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.protocolVersion !== SUDOKU_PROTOCOL_VERSION) {
          setState(prev => ({
            ...prev,
            connectionStatus: "error",
            error: "Sudoku was updated. Refresh this page to continue.",
          }))
          socketRef.current = null
          socket.close(1008, "Incompatible Sudoku server")
          return
        }
        handleMessage(message)
      } catch (error) {
        console.error("Failed to parse Sudoku message:", error)
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
        connectionStatus: "error",
        error: "Connection lost. Reconnecting...",
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
    socketRef.current = null
    if (socket?.readyState === 1) {
      const leave: ClientMessage = { type: "leave", protocolVersion: SUDOKU_PROTOCOL_VERSION }
      socket.send(JSON.stringify(leave))
    }
    socket?.close()

    if (roomCodeRef.current) {
      clearPersistentPlayerId("sudoku", roomCodeRef.current)
      roomCodeRef.current = ""
    }
    roundIdRef.current = ""
    revisionRef.current = 0
    resumingRef.current = false
    clearSession()
    setState(initialState())
  }, [])

  const resumeSession = useCallback(() => {
    const record = readSession()
    if (!record) return false
    resumingRef.current = true
    connect(record.roomCode, false, record.name)
    return true
  }, [connect])

  const createGame = useCallback((playerName: string, difficulty: Difficulty) => {
    const roomCode = generateRoomCode()
    connect(roomCode, true, playerName, difficulty)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    connect(roomCode.toUpperCase(), false, playerName)
  }, [connect])

  const startGame = useCallback(() => {
    if (!roundIdRef.current) return
    sendNow({
      type: "start",
      protocolVersion: SUDOKU_PROTOCOL_VERSION,
      roundId: roundIdRef.current,
    })
  }, [sendNow])

  const updateProgress = useCallback((cells: (number | null)[]) => {
    if (!roundIdRef.current) return
    sendNow({
      type: "update-progress",
      protocolVersion: SUDOKU_PROTOCOL_VERSION,
      roundId: roundIdRef.current,
      cells,
    })
  }, [sendNow])

  const restartGame = useCallback(() => {
    if (!roundIdRef.current) return
    sendNow({
      type: "restart",
      protocolVersion: SUDOKU_PROTOCOL_VERSION,
      roundId: roundIdRef.current,
    })
  }, [sendNow])

  useEffect(() => {
    return () => {
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
    }
  }, [])

  const recordedHost = state.gameState?.players[state.gameState.hostId]
  const isHost = Boolean(
    state.gameState &&
    state.playerId &&
    (state.gameState.hostId === state.playerId || !recordedHost || recordedHost.connected === false)
  )

  return {
    ...state,
    isHost,
    createGame,
    joinGame,
    startGame,
    updateProgress,
    restartGame,
    disconnect,
    resumeSession,
  }
}
