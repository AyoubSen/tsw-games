import type * as Party from "partykit/server"
import sudoku from "sudoku"
import {
  canControlGame as canControlPresence,
  isPresent,
  markDisconnected,
  nextHost,
} from "./shared/presence"
import {
  getGameNightResultMatch,
  validateGameNightConnection,
  type GameNightMember,
} from "./shared/gameNight"

export const SUDOKU_PROTOCOL_VERSION = 2
const STATE_SCHEMA_VERSION = 2
const MAX_PLAYERS = 8
const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000

export type Difficulty = "easy" | "medium" | "hard" | "expert"

export interface Player {
  id: string
  name: string
  progress: number
  completedAt: number | null
  joinedAt: number
  connected: boolean
  disconnectedAt: number | null
  /** Private 1-9 entries. Given positions are always stored as null. */
  cells?: (number | null)[] | null
}

export type PublicPlayer = Omit<Player, "cells" | "disconnectedAt">

function toPublicPlayer(player: Player): PublicPlayer {
  const { cells: _cells, disconnectedAt: _disconnectedAt, ...rest } = player
  return rest
}

export interface GameState {
  schemaVersion: number
  revision: number
  roundId: string
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  difficulty: Difficulty
  puzzle: (number | null)[]
  solution: number[]
  startTime: number | null
  winnerId: string | null
  playerTokens: Record<string, string>
}

export interface PublicGameState {
  protocolVersion: number
  revision: number
  roundId: string
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  difficulty: Difficulty
  puzzle: (number | null)[] | null
  totalToFill: number
  startTime: number | null
  serverNow: number
  winnerId: string | null
}

export type ClientMessage =
  | { type: "join"; protocolVersion: number; name: string }
  | { type: "start"; protocolVersion: number; roundId: string }
  | { type: "update-progress"; protocolVersion: number; roundId: string; cells: (number | null)[] }
  | { type: "leave"; protocolVersion: number }
  | { type: "restart"; protocolVersion: number; roundId: string }

type ServerPayload =
  | { type: "state"; state: PublicGameState }
  | { type: "board-restored"; cells: (number | null)[] }
  | { type: "board-feedback"; wrong: number[] }
  | { type: "error"; message: string }

export type ServerMessage = ServerPayload & {
  protocolVersion: number
  revision: number
  roundId: string
}

const DIFFICULTY_THRESHOLDS = {
  easy: { min: 0, max: 30 },
  medium: { min: 30, max: 50 },
  hard: { min: 50, max: 70 },
  expert: { min: 70, max: 200 },
}

const GENERATION_ATTEMPTS = 8
const RATING_SAMPLES = 2

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard" || value === "expert"
}

function isValidPuzzlePair(puzzle: unknown, solution: unknown): puzzle is (number | null)[] {
  if (!Array.isArray(puzzle) || puzzle.length !== 81) return false
  if (!Array.isArray(solution) || solution.length !== 81) return false

  const rowMasks = new Array(9).fill(0)
  const colMasks = new Array(9).fill(0)
  const boxMasks = new Array(9).fill(0)

  for (let index = 0; index < 81; index++) {
    const solved = solution[index]
    const given = puzzle[index]
    if (!Number.isInteger(solved) || solved < 0 || solved > 8) return false
    if (given !== null && (!Number.isInteger(given) || given < 0 || given > 8 || given !== solved)) return false

    const row = Math.floor(index / 9)
    const col = index % 9
    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3)
    const bit = 1 << solved
    if ((rowMasks[row] & bit) || (colMasks[col] & bit) || (boxMasks[box] & bit)) return false
    rowMasks[row] |= bit
    colMasks[col] |= bit
    boxMasks[box] |= bit
  }

  return true
}

function generatePuzzleWithDifficulty(difficulty: Difficulty): { puzzle: (number | null)[]; solution: number[] } {
  let bestPuzzle: (number | null)[] | null = null
  let bestSolution: number[] | null = null
  let bestRating = 0
  const { min, max } = DIFFICULTY_THRESHOLDS[difficulty]
  const target = (min + max) / 2

  for (let i = 0; i < GENERATION_ATTEMPTS; i++) {
    const puzzle = sudoku.makepuzzle()
    const solution = sudoku.solvepuzzle(puzzle)
    if (!isValidPuzzlePair(puzzle, solution)) continue

    const rating = sudoku.ratepuzzle(puzzle, RATING_SAMPLES)
    if (rating >= min && rating <= max) return { puzzle, solution }

    if (bestPuzzle === null || Math.abs(rating - target) < Math.abs(bestRating - target)) {
      bestPuzzle = puzzle
      bestSolution = solution
      bestRating = rating
    }
  }

  if (bestPuzzle && bestSolution) return { puzzle: bestPuzzle, solution: bestSolution }
  throw new Error("Unable to generate a valid Sudoku puzzle")
}

function countFillable(puzzle: (number | null)[]): number {
  return puzzle.reduce<number>((count, cell) => cell === null ? count + 1 : count, 0)
}

function sanitizePlayerCells(value: unknown, puzzle: (number | null)[]): (number | null)[] | null {
  if (!Array.isArray(value) || value.length !== 81) return null

  const cells: (number | null)[] = []
  for (let index = 0; index < 81; index++) {
    if (puzzle[index] !== null) {
      cells.push(null)
      continue
    }

    const cell = value[index]
    if (cell === null) {
      cells.push(null)
    } else if (Number.isInteger(cell) && cell >= 1 && cell <= 9) {
      cells.push(cell)
    } else {
      return null
    }
  }
  return cells
}

function scoreBoard(
  cells: (number | null)[],
  puzzle: (number | null)[],
  solution: number[],
): { correct: number; total: number; wrong: number[] } {
  let correct = 0
  let total = 0
  const wrong: number[] = []

  for (let index = 0; index < 81; index++) {
    if (puzzle[index] !== null) continue
    total++

    const value = cells[index]
    if (value === null) continue
    if (value === solution[index] + 1) correct++
    else wrong.push(index)
  }

  return { correct, total, wrong }
}

function normalizeStoredState(value: unknown, roomCode: string): GameState | null {
  if (!value || typeof value !== "object") return null
  const stored = value as Partial<GameState>
  if (stored.roomCode !== roomCode || typeof stored.hostId !== "string") return null
  if (!isDifficulty(stored.difficulty) || !isValidPuzzlePair(stored.puzzle, stored.solution)) return null
  if (stored.status !== "waiting" && stored.status !== "playing" && stored.status !== "finished") return null
  if (stored.schemaVersion !== STATE_SCHEMA_VERSION && stored.status !== "waiting") return null
  if (!stored.players || typeof stored.players !== "object" || Array.isArray(stored.players)) return null

  const puzzle = stored.puzzle
  const solution = stored.solution as number[]
  const players: Record<string, Player> = {}

  for (const [id, raw] of Object.entries(stored.players)) {
    if (!raw || typeof raw !== "object") return null
    const player = raw as Partial<Player>
    if (typeof player.name !== "string") return null

    const cells = player.cells == null ? null : sanitizePlayerCells(player.cells, puzzle)
    if (player.cells != null && cells === null) return null
    const score = cells ? scoreBoard(cells, puzzle, solution).correct : 0
    const wasConnected = player.connected !== false

    players[id] = {
      id,
      name: player.name.slice(0, 32),
      progress: score,
      completedAt: typeof player.completedAt === "number" ? player.completedAt : null,
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      // A server start has no live sockets yet. Each returning connection marks
      // itself present in onConnect before the room can start.
      connected: false,
      disconnectedAt: !wasConnected && typeof player.disconnectedAt === "number"
        ? player.disconnectedAt
        : Date.now(),
      cells,
    }
  }

  const startTime = typeof stored.startTime === "number" ? stored.startTime : null
  if (stored.status !== "waiting" && startTime === null) return null

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision: Number.isInteger(stored.revision) && stored.revision! >= 0 ? stored.revision! : 0,
    roundId: typeof stored.roundId === "string" && stored.roundId ? stored.roundId : crypto.randomUUID(),
    roomCode,
    hostId: stored.hostId,
    players,
    status: stored.status,
    maxPlayers: MAX_PLAYERS,
    difficulty: stored.difficulty,
    puzzle,
    solution,
    startTime: stored.status === "waiting" ? null : startTime,
    winnerId: stored.status === "finished" && typeof stored.winnerId === "string" ? stored.winnerId : null,
    playerTokens:
      stored.playerTokens && typeof stored.playerTokens === "object"
        ? stored.playerTokens
        : {},
  }
}

export default class SudokuParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<unknown>("state")
    if (!stored) return

    const normalized = normalizeStoredState(stored, this.room.id)
    if (!normalized) {
      await this.room.storage.delete("state")
      return
    }

    this.state = normalized
    await this.saveState()
  }

  async saveState() {
    if (this.state) await this.room.storage.put("state", this.state)
  }

  isAuthenticated(conn: Party.Connection): boolean {
    if (!this.state) return false
    const token = this.connectionTokens.get(conn)
    return Boolean(token && this.state.playerTokens[conn.id] === token)
  }

  bumpRevision() {
    if (this.state) this.state.revision++
  }

  getPublicState(): PublicGameState {
    if (!this.state) throw new Error("No game state")

    const players: Record<string, PublicPlayer> = {}
    for (const [id, player] of Object.entries(this.state.players)) players[id] = toPublicPlayer(player)

    return {
      protocolVersion: SUDOKU_PROTOCOL_VERSION,
      revision: this.state.revision,
      roundId: this.state.roundId,
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      difficulty: this.state.difficulty,
      puzzle: this.state.status === "waiting" ? null : this.state.puzzle,
      totalToFill: countFillable(this.state.puzzle),
      startTime: this.state.startTime,
      serverNow: Date.now(),
      winnerId: this.state.winnerId,
    }
  }

  makeMessage(payload: ServerPayload): ServerMessage {
    return {
      ...payload,
      protocolVersion: SUDOKU_PROTOCOL_VERSION,
      revision: this.state?.revision ?? 0,
      roundId: this.state?.roundId ?? "",
    }
  }

  send(conn: Party.Connection, payload: ServerPayload): boolean {
    try {
      conn.send(JSON.stringify(this.makeMessage(payload)))
      return true
    } catch (error) {
      console.error(`Failed to send Sudoku message to ${conn.id}:`, error)
      return false
    }
  }

  broadcast(payload: ServerPayload, exclude?: string) {
    const message = JSON.stringify(this.makeMessage(payload))
    for (const conn of this.room.getConnections()) {
      if (conn.id === exclude) continue
      try {
        conn.send(message)
      } catch (error) {
        console.error(`Failed to broadcast Sudoku message to ${conn.id}:`, error)
      }
    }
  }

  broadcastState() {
    this.broadcast({ type: "state", state: this.getPublicState() })
  }

  sendResync(conn: Party.Connection) {
    if (!this.state) return
    this.send(conn, { type: "state", state: this.getPublicState() })

    if (this.state.status === "waiting") return
    const player = this.state.players[conn.id]
    if (!player?.cells) return

    this.send(conn, { type: "board-restored", cells: player.cells })
    this.send(conn, {
      type: "board-feedback",
      wrong: scoreBoard(player.cells, this.state.puzzle, this.state.solution).wrong,
    })
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    if (url.searchParams.get("protocolVersion") !== String(SUDOKU_PROTOCOL_VERSION)) {
      this.send(conn, { type: "error", message: "Sudoku was updated. Refresh this page to continue." })
      conn.close(1008, "Incompatible Sudoku client")
      return
    }

    const gameNight = await validateGameNightConnection(this.room, conn, ctx, "sudoku")
    if (gameNight.mode === "invalid") {
      this.send(conn, { type: "error", message: "Invalid Game Night connection" })
      conn.close(1008, "Invalid Game Night connection")
      return
    }
    if (gameNight.mode === "game-night") this.gameNightMembers.set(conn, gameNight.member)

    const isHost = gameNight.mode === "game-night"
      ? gameNight.member.isHost
      : url.searchParams.get("host") === "true"
	const playerToken = url.searchParams.get("playerToken") || ""
	if (playerToken) this.connectionTokens.set(conn, playerToken)
    const requestedDifficulty = url.searchParams.get("difficulty")
    const difficulty = isDifficulty(requestedDifficulty) ? requestedDifficulty : "medium"

    if (isHost && !this.state) {
      const { puzzle, solution } = generatePuzzleWithDifficulty(difficulty)
      this.state = {
        schemaVersion: STATE_SCHEMA_VERSION,
        revision: 1,
        roundId: crypto.randomUUID(),
        roomCode: this.room.id,
        hostId: conn.id,
        players: {},
        status: "waiting",
        maxPlayers: MAX_PLAYERS,
        difficulty,
        puzzle,
        solution,
        startTime: null,
        winnerId: null,
        playerTokens: {},
      }
      await this.saveState()
    }

    if (!this.state) {
      this.send(conn, { type: "error", message: "Game not found" })
      return
    }

  }

  pruneDisconnectedPlayers() {
    if (!this.state) return
    const cutoff = Date.now() - DISCONNECTED_PLAYER_TTL_MS
    for (const [id, player] of Object.entries(this.state.players)) {
      if (player.connected || player.disconnectedAt === null || player.disconnectedAt > cutoff) continue
      delete this.state.players[id]
      if (id === this.state.hostId) this.state.hostId = nextHost(this.state.players, id) ?? ""
    }
  }

  isCurrentRound(roundId: unknown, sender: Party.Connection): boolean {
    if (this.state && roundId === this.state.roundId) return true
    this.send(sender, { type: "error", message: "That Sudoku round is no longer active. Your board has been refreshed." })
    this.sendResync(sender)
    return false
  }

  async onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (!this.state) return
    if (typeof message !== "string") {
      this.send(sender, { type: "error", message: "Invalid Sudoku message" })
      return
    }

    try {
      const data = JSON.parse(message) as Partial<ClientMessage>
      if (data.protocolVersion !== SUDOKU_PROTOCOL_VERSION) {
        this.send(sender, { type: "error", message: "Sudoku was updated. Refresh this page to continue." })
        return
      }

	  if (data.type !== "join" && !this.isAuthenticated(sender)) {
		this.send(sender, { type: "error", message: "Invalid player session" })
		return
	  }

      switch (data.type) {
        case "join": {
		  const playerToken = this.connectionTokens.get(sender)
		  if (!playerToken) {
			this.send(sender, { type: "error", message: "Invalid player session" })
			return
		  }
          const coordinatorName = this.gameNightMembers.get(sender)?.name
          const name = coordinatorName ?? (typeof data.name === "string" ? data.name.trim().slice(0, 32) : "")
          if (!name) {
            this.send(sender, { type: "error", message: "Enter a player name" })
            return
          }

          const existing = this.state.players[sender.id]
          if (existing) {
			const expectedToken = this.state.playerTokens[sender.id]
			if (expectedToken !== playerToken) {
			  this.send(sender, { type: "error", message: "Invalid player session" })
			  return
			}
			this.state.playerTokens[sender.id] = playerToken
            existing.connected = true
            existing.name = name
			existing.disconnectedAt = null
          } else {
            if (this.state.status !== "waiting") {
              this.send(sender, { type: "error", message: "Game already started" })
              return
            }
            if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
              this.pruneDisconnectedPlayers()
            }
            if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
              this.send(sender, { type: "error", message: "Game is full" })
              return
            }
            this.state.players[sender.id] = {
              id: sender.id,
              name,
              progress: 0,
              completedAt: null,
              joinedAt: Date.now(),
              connected: true,
              disconnectedAt: null,
              cells: null,
            }
			this.state.playerTokens[sender.id] = playerToken
          }
          if (!this.state.hostId || !this.state.players[this.state.hostId]) {
            this.state.hostId = sender.id
          }

          this.bumpRevision()
          await this.saveState()
          this.broadcastState()
		  this.sendResync(sender)
          break
        }

        case "start": {
          if (!this.isCurrentRound(data.roundId, sender)) return
          if (this.state.status !== "waiting") return
          const liveIds = new Set(Array.from(this.room.getConnections(), connection => connection.id))
          for (const player of Object.values(this.state.players)) {
            if (!liveIds.has(player.id)) {
              player.connected = false
              player.disconnectedAt ??= Date.now()
            }
          }
          if (!canControlPresence(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can start" })
            return
          }
          const readyPlayers = Object.values(this.state.players).filter(player => isPresent(player) && liveIds.has(player.id))
          if (readyPlayers.length < 2) {
            this.bumpRevision()
            await this.saveState()
            this.broadcastState()
            this.send(sender, { type: "error", message: "Need at least 2 connected players" })
            return
          }

          this.state.hostId = sender.id
          this.state.status = "playing"
          this.state.startTime = Date.now()
          this.state.winnerId = null
          for (const player of Object.values(this.state.players)) {
            player.progress = 0
            player.completedAt = null
            player.cells = null
          }

          this.bumpRevision()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "update-progress": {
          if (!this.isCurrentRound(data.roundId, sender)) return
          if (this.state.status !== "playing") return

          const player = this.state.players[sender.id]
          if (!player) return
          const cells = sanitizePlayerCells(data.cells, this.state.puzzle)
          if (!cells) {
            this.send(sender, { type: "error", message: "Invalid Sudoku board" })
            return
          }

          const { correct, total, wrong } = scoreBoard(cells, this.state.puzzle, this.state.solution)
          player.cells = cells
          player.progress = correct

          if (total > 0 && correct === total && !player.completedAt && this.state.startTime) {
            player.completedAt = Date.now()
            if (!this.state.winnerId) {
              this.state.winnerId = sender.id
              this.state.status = "finished"
            }
          }

          this.bumpRevision()
          await this.saveState()
          this.send(sender, { type: "board-feedback", wrong })
          this.broadcastState()
          break
        }

        case "leave": {
          const player = this.state.players[sender.id]
          if (player && this.state.status === "finished" && this.state.winnerId === sender.id) {
            player.connected = false
            player.disconnectedAt = Date.now()
          } else {
            delete this.state.players[sender.id]
          }
		  delete this.state.playerTokens[sender.id]
          if (Object.keys(this.state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (sender.id === this.state.hostId) {
            this.state.hostId = nextHost(this.state.players, sender.id) ?? ""
          }
          this.bumpRevision()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "restart": {
          if (!this.isCurrentRound(data.roundId, sender)) return
          if (this.state.status !== "finished") return
          const liveIds = new Set(Array.from(this.room.getConnections(), connection => connection.id))
          for (const player of Object.values(this.state.players)) {
            if (!liveIds.has(player.id)) {
              player.connected = false
              player.disconnectedAt ??= Date.now()
            }
          }
          if (!canControlPresence(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can restart" })
            return
          }

          const { puzzle, solution } = generatePuzzleWithDifficulty(this.state.difficulty)
          this.state.hostId = sender.id
          this.state.roundId = crypto.randomUUID()
          this.state.status = "waiting"
          this.state.puzzle = puzzle
          this.state.solution = solution
          this.state.startTime = null
          this.state.winnerId = null
          for (const player of Object.values(this.state.players)) {
            player.progress = 0
            player.completedAt = null
            player.cells = null
          }

          this.bumpRevision()
          await this.saveState()
          this.broadcastState()
          break
        }
      }
    } catch (error) {
      console.error("Error processing Sudoku message:", error)
      this.send(sender, { type: "error", message: "Could not process that Sudoku action" })
    }
  }

  async handleDisconnect(conn: Party.Connection) {
    if (!this.state) return
    const replacementIsOpen = Array.from(this.room.getConnections()).some(
      connection => connection.id === conn.id && connection !== conn,
    )
    const player = this.state.players[conn.id]
	if (replacementIsOpen || !player || !this.isAuthenticated(conn) || player.connected === false) return
    markDisconnected(this.state.players, conn.id)
    player.disconnectedAt = Date.now()
    this.bumpRevision()
    await this.saveState()
    this.broadcastState()
  }

  async onClose(conn: Party.Connection) {
    await this.handleDisconnect(conn)
  }

  async onError(conn: Party.Connection, error: Error) {
    console.error(`Sudoku connection error for ${conn.id}:`, error)
    await this.handleDisconnect(conn)
  }

  async onRequest(request: Party.Request) {
    try {
      const match = await getGameNightResultMatch(this.room, request, "sudoku")
      if (!match) return new Response("Not found", { status: 404 })
      const finished = this.state?.status === "finished" && this.state.winnerId !== null
      return Response.json({
        finished,
        scored: true,
        winnerIds: finished ? [this.state!.winnerId!] : [],
      })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
}
