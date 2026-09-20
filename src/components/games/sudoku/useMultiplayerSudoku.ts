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
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "error") {
      const terminalJoinError = (
        message.message === "Game already started" ||
        message.message === "Game is full" ||
        message.message === "Invalid player session"
      )
      const quietResumeFailure = resumingRef.current && message.message === "Game not found"
      if (message.message === "Game not found" || terminalJoinError) {
        resumingRef.current = false
        if (resumeTimeoutRef.current) {
          clearTimeout(resumeTimeoutRef.current)
          resumeTimeoutRef.current = null
        }
        clearSession()
        if (roomCodeRef.current) {
          clearPersistentPlayerId("sudoku", roomCodeRef.current)
          clearPersistentPlayerToken("sudoku", roomCodeRef.current)
          roomCodeRef.current = ""
        }
        const socket = socketRef.current
        socketRef.current = null
        socket?.close()
        roundIdRef.current = ""
        revisionRef.current = 0
        setState(initialState({
          connectionStatus: "error",
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
        if (resumeTimeoutRef.current) {
          clearTimeout(resumeTimeoutRef.current)
          resumeTimeoutRef.current = null
        }
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
        playerToken: getPersistentPlayerToken("sudoku", roomCode),
        ...getGameNightSocketQuery(roomCode),
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
          resumingRef.current = false
          if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current)
            resumeTimeoutRef.current = null
          }
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
      setState(prev => ({
        ...prev,
        connectionStatus: "connecting",
        error: "Connection lost. Reconnecting...",
      }))
    })

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return
      setState(prev => ({
        ...prev,
        connectionStatus: "connecting",
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
    if (socket) {
      const leave: ClientMessage = { type: "leave", protocolVersion: SUDOKU_PROTOCOL_VERSION }
      leavePartySocket(socket, leave)
    }

    if (roomCodeRef.current) {
      clearPersistentPlayerId("sudoku", roomCodeRef.current)
      clearPersistentPlayerToken("sudoku", roomCodeRef.current)
      roomCodeRef.current = ""
    }
    roundIdRef.current = ""
    revisionRef.current = 0
    resumingRef.current = false
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current)
      resumeTimeoutRef.current = null
    }
    clearSession()
    setState(initialState())
  }, [])

  const resumeSession = useCallback((inviteRoomCode?: string) => {
    const record = readSession()
    if (!record) return false
    if (inviteRoomCode && record.roomCode !== inviteRoomCode) return false
    resumingRef.current = true
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
    const normalizedRoomCode = record.roomCode.toUpperCase()
    resumeTimeoutRef.current = setTimeout(() => {
      resumeTimeoutRef.current = null
      if (!resumingRef.current || roomCodeRef.current !== normalizedRoomCode) return

      resumingRef.current = false
      clearSession()
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
      roomCodeRef.current = ""
      roundIdRef.current = ""
      revisionRef.current = 0
      setState(initialState({ connectionStatus: "error" }))
    }, 15_000)
    connect(record.roomCode, false, record.name)
    return true
  }, [connect])

  const createGame = useCallback((playerName: string, difficulty: Difficulty, childRoomId?: string) => {
    resumingRef.current = false
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current)
      resumeTimeoutRef.current = null
    }
    const roomCode = childRoomId ?? generateRoomCode()
    connect(roomCode, true, playerName, difficulty)
    return roomCode
  }, [connect])

  const joinGame = useCallback((roomCode: string, playerName: string) => {
    resumingRef.current = false
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current)
      resumeTimeoutRef.current = null
    }
    connect(getGameNightSocketQuery(roomCode).night ? roomCode : roomCode.toUpperCase(), false, playerName)
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
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
    }
  }, [])

  const isHost = Boolean(
    state.gameState &&
    state.playerId &&
    state.gameState.hostId === state.playerId
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
