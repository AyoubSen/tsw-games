import type * as Party from "partykit/server"
import sudoku from "sudoku"

export type Difficulty = "easy" | "medium" | "hard" | "expert"

export interface Player {
  id: string
  name: string
  progress: number // 0-81 cells filled correctly
  completedAt: number | null
  joinedAt: number
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  difficulty: Difficulty
  puzzle: (number | null)[] | null // The puzzle (0-8 values, null for empty)
  solution: (number | null)[] | null // The solution (0-8 values)
  startTime: number | null
  winnerId: string | null
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  difficulty: Difficulty
  puzzle: (number | null)[] | null
  startTime: number | null
  winnerId: string | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "update-progress"; progress: number; completed: boolean }
  | { type: "leave" }
  | { type: "restart" }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "game-started"; puzzle: (number | null)[]; solution: (number | null)[] }
  | { type: "progress-update"; playerId: string; progress: number }
  | { type: "player-completed"; playerId: string; time: number }
  | { type: "game-over"; winnerId: string; finalStandings: { playerId: string; progress: number; time: number | null }[] }
  | { type: "game-restarted" }
  | { type: "error"; message: string }

const DIFFICULTY_THRESHOLDS = {
  easy: { min: 0, max: 30 },
  medium: { min: 30, max: 50 },
  hard: { min: 50, max: 70 },
  expert: { min: 70, max: 200 },
}

function generatePuzzleWithDifficulty(difficulty: Difficulty): { puzzle: (number | null)[]; solution: (number | null)[] } {
  let bestPuzzle: (number | null)[] | null = null
  let bestSolution: (number | null)[] | null = null
  let bestRating = 0
  const { min, max } = DIFFICULTY_THRESHOLDS[difficulty]

  for (let i = 0; i < 20; i++) {
    const puzzle = sudoku.makepuzzle()
    const solution = sudoku.solvepuzzle(puzzle)
    const rating = sudoku.ratepuzzle(puzzle, 4)

    if (rating >= min && rating <= max) {
      return { puzzle, solution }
    }

    if (bestPuzzle === null || Math.abs(rating - (min + max) / 2) < Math.abs(bestRating - (min + max) / 2)) {
      bestPuzzle = puzzle
      bestSolution = solution
      bestRating = rating
    }
  }

  return { puzzle: bestPuzzle!, solution: bestSolution! }
}

export default class SudokuParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (stored) {
      this.state = stored
    }
  }

  async saveState() {
    if (this.state) {
      await this.room.storage.put("state", this.state)
    }
  }

  getPublicState(): PublicGameState {
    if (!this.state) {
      throw new Error("No game state")
    }

    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players: this.state.players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      difficulty: this.state.difficulty,
      puzzle: this.state.puzzle,
      startTime: this.state.startTime,
      winnerId: this.state.winnerId,
    }
  }

  broadcast(message: ServerMessage, exclude?: string) {
    const msg = JSON.stringify(message)
    for (const conn of this.room.getConnections()) {
      if (conn.id !== exclude) {
        conn.send(msg)
      }
    }
  }

  send(conn: Party.Connection, message: ServerMessage) {
    conn.send(JSON.stringify(message))
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const isHost = url.searchParams.get("host") === "true"
    const difficulty = (url.searchParams.get("difficulty") || "medium") as Difficulty

    if (isHost && !this.state) {
      this.state = {
        roomCode: this.room.id,
        hostId: conn.id,
        players: {},
        status: "waiting",
        maxPlayers: 8,
        difficulty,
        puzzle: null,
        solution: null,
        startTime: null,
        winnerId: null,
      }
      await this.saveState()
    }

    if (this.state) {
      this.send(conn, { type: "state", state: this.getPublicState() })
    } else {
      this.send(conn, { type: "error", message: "Game not found" })
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return

    try {
      const data: ClientMessage = JSON.parse(message)

      switch (data.type) {
        case "join": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }

          if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
            this.send(sender, { type: "error", message: "Game is full" })
            return
          }

          const player: Player = {
            id: sender.id,
            name: data.name,
            progress: 0,
            completedAt: null,
            joinedAt: Date.now(),
          }

          this.state.players[sender.id] = player
          await this.saveState()

          this.broadcast({ type: "player-joined", player })
          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }

        case "start": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can start" })
            return
          }

          if (Object.keys(this.state.players).length < 2) {
            this.send(sender, { type: "error", message: "Need at least 2 players" })
            return
          }

          // Generate puzzle
          const { puzzle, solution } = generatePuzzleWithDifficulty(this.state.difficulty)

          this.state.status = "playing"
          this.state.puzzle = puzzle
          this.state.solution = solution
          this.state.startTime = Date.now()

          // Reset player progress
          for (const player of Object.values(this.state.players)) {
            player.progress = 0
            player.completedAt = null
          }

          await this.saveState()

          this.broadcast({
            type: "game-started",
            puzzle,
            solution,
          })
          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }

        case "update-progress": {
          if (this.state.status !== "playing") return

          const player = this.state.players[sender.id]
          if (!player) return

          player.progress = data.progress

          this.broadcast({
            type: "progress-update",
            playerId: sender.id,
            progress: data.progress,
          }, sender.id)

          if (data.completed && !player.completedAt && this.state.startTime) {
            player.completedAt = Date.now()
            const time = player.completedAt - this.state.startTime

            this.broadcast({
              type: "player-completed",
              playerId: sender.id,
              time,
            })

            // Check if this is the first completion (winner)
            if (!this.state.winnerId) {
              this.state.winnerId = sender.id
              this.endGame()
            }
          }

          await this.saveState()
          break
        }

        case "leave": {
          delete this.state.players[sender.id]

          if (sender.id === this.state.hostId) {
            const remaining = Object.keys(this.state.players)
            if (remaining.length > 0) {
              this.state.hostId = remaining[0]
            }
          }

          await this.saveState()
          this.broadcast({ type: "player-left", playerId: sender.id })
          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }

        case "restart": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can restart" })
            return
          }

          this.state.status = "waiting"
          this.state.puzzle = null
          this.state.solution = null
          this.state.startTime = null
          this.state.winnerId = null

          for (const player of Object.values(this.state.players)) {
            player.progress = 0
            player.completedAt = null
          }

          await this.saveState()
          this.broadcast({ type: "game-restarted" })
          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }
      }
    } catch (e) {
      console.error("Error processing message:", e)
    }
  }

  endGame() {
    if (!this.state) return

    this.state.status = "finished"

    const standings = Object.values(this.state.players)
      .map(p => ({
        playerId: p.id,
        progress: p.progress,
        time: p.completedAt && this.state!.startTime ? p.completedAt - this.state!.startTime : null,
      }))
      .sort((a, b) => {
        // Completed players first (by time), then incomplete (by progress)
        if (a.time !== null && b.time !== null) return a.time - b.time
        if (a.time !== null) return -1
        if (b.time !== null) return 1
        return b.progress - a.progress
      })

    this.broadcast({
      type: "game-over",
      winnerId: this.state.winnerId || "",
      finalStandings: standings,
    })
    this.broadcast({ type: "state", state: this.getPublicState() })
  }

  async onClose(conn: Party.Connection) {
    if (!this.state) return

    if (this.state.players[conn.id]) {
      delete this.state.players[conn.id]

      if (conn.id === this.state.hostId) {
        const remaining = Object.keys(this.state.players)
        if (remaining.length > 0) {
          this.state.hostId = remaining[0]
        }
      }

      await this.saveState()
      this.broadcast({ type: "player-left", playerId: conn.id })
      this.broadcast({ type: "state", state: this.getPublicState() })
    }
  }
}
