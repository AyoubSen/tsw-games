import type * as Party from "partykit/server"

// Game modes
export type GameMode = "race" | "classic"

// Player state
export interface Player {
  id: string
  name: string
  progress: number // 0-100 percentage of text typed
  wpm: number // words per minute
  accuracy: number // percentage
  completed: boolean
  completedAt: number | null
  joinedAt: number
}

// Game state
export interface GameState {
  roomCode: string
  mode: GameMode
  hostId: string
  text: string // The phrase to type
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  winnerId: string | null
  startedAt: number | null
  finishedAt: number | null
}

// Message types from client
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "progress"; progress: number; wpm: number; accuracy: number }
  | { type: "complete"; wpm: number; accuracy: number }
  | { type: "leave" }
  | { type: "restart" }

// Message types to client
export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "game-started"; text: string; startTime: number }
  | { type: "player-progress"; playerId: string; progress: number; wpm: number }
  | { type: "player-completed"; playerId: string; wpm: number; accuracy: number }
  | { type: "game-over"; winnerId: string | null; results: PlayerResult[] }
  | { type: "game-restarted" }
  | { type: "error"; message: string }

export interface PlayerResult {
  id: string
  name: string
  completed: boolean
  wpm: number
  accuracy: number
}

// Public state (sent to clients)
export interface PublicGameState {
  roomCode: string
  mode: GameMode
  hostId: string
  text: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  winnerId: string | null
  startedAt: number | null
}

// Phrases for typing
const PHRASES = [
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "How vexingly quick daft zebras jump!",
  "The five boxing wizards jump quickly.",
  "Sphinx of black quartz, judge my vow.",
  "Two driven jocks help fax my big quiz.",
  "The jay, pig, fox, zebra and my wolves quack!",
  "Sympathizing would fix Quaker objectives.",
  "A wizard's job is to vex chumps quickly in fog.",
  "Watch Jeopardy, Alex Trebek's fun TV quiz game.",
  "By Jove, my quick study of lexicography won a prize!",
  "Waxy and quivering, jocks fumble the pizza.",
  "When zombies arrive, quickly fax judge Pat.",
  "Heavy boxes perform quick waltzes and jigs.",
  "A quick movement of the enemy will jeopardize six gunboats.",
  "All questions asked by five watched experts amaze the judge.",
  "Jack quietly moved up front and seized the big ball of wax.",
]

function getRandomPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)]
}

export default class TypeRaceParty implements Party.Server {
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
      mode: this.state.mode,
      hostId: this.state.hostId,
      text: this.state.status === "waiting" ? "" : this.state.text,
      players: this.state.players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      winnerId: this.state.winnerId,
      startedAt: this.state.startedAt,
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
    const mode = (url.searchParams.get("mode") as GameMode) || "race"
    const isHost = url.searchParams.get("host") === "true"

    if (isHost && !this.state) {
      this.state = {
        roomCode: this.room.id,
        mode,
        hostId: conn.id,
        text: getRandomPhrase(),
        players: {},
        status: "waiting",
        maxPlayers: 8,
        winnerId: null,
        startedAt: null,
        finishedAt: null,
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
            wpm: 0,
            accuracy: 100,
            completed: false,
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

          this.state.status = "playing"
          this.state.startedAt = Date.now()
          this.state.text = getRandomPhrase()
          await this.saveState()

          this.broadcast({
            type: "game-started",
            text: this.state.text,
            startTime: this.state.startedAt,
          })
          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }

        case "progress": {
          if (this.state.status !== "playing") return

          const player = this.state.players[sender.id]
          if (!player || player.completed) return

          player.progress = data.progress
          player.wpm = data.wpm
          player.accuracy = data.accuracy
          await this.saveState()

          // Broadcast progress to others
          this.broadcast(
            {
              type: "player-progress",
              playerId: sender.id,
              progress: data.progress,
              wpm: data.wpm,
            },
            sender.id
          )
          break
        }

        case "complete": {
          if (this.state.status !== "playing") return

          const player = this.state.players[sender.id]
          if (!player || player.completed) return

          player.completed = true
          player.completedAt = Date.now()
          player.progress = 100
          player.wpm = data.wpm
          player.accuracy = data.accuracy
          await this.saveState()

          this.broadcast({
            type: "player-completed",
            playerId: sender.id,
            wpm: data.wpm,
            accuracy: data.accuracy,
          })

          // In race mode, first to complete wins
          if (this.state.mode === "race" && !this.state.winnerId) {
            this.state.winnerId = sender.id
            this.state.status = "finished"
            this.state.finishedAt = Date.now()
            await this.saveState()

            const results: PlayerResult[] = Object.values(this.state.players).map((p) => ({
              id: p.id,
              name: p.name,
              completed: p.completed,
              wpm: p.wpm,
              accuracy: p.accuracy,
            }))

            this.broadcast({
              type: "game-over",
              winnerId: this.state.winnerId,
              results,
            })
          }

          // Check if all players completed (for classic mode)
          const allCompleted = Object.values(this.state.players).every((p) => p.completed)
          if (allCompleted && this.state.status === "playing") {
            this.state.status = "finished"
            this.state.finishedAt = Date.now()

            // Winner is the one with highest WPM
            const players = Object.values(this.state.players)
            players.sort((a, b) => b.wpm - a.wpm)
            this.state.winnerId = players[0].id

            await this.saveState()

            const results: PlayerResult[] = players.map((p) => ({
              id: p.id,
              name: p.name,
              completed: p.completed,
              wpm: p.wpm,
              accuracy: p.accuracy,
            }))

            this.broadcast({
              type: "game-over",
              winnerId: this.state.winnerId,
              results,
            })
          }

          this.broadcast({ type: "state", state: this.getPublicState() })
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

          // Reset game state to waiting
          this.state.status = "waiting"
          this.state.text = getRandomPhrase()
          this.state.winnerId = null
          this.state.startedAt = null
          this.state.finishedAt = null

          // Reset player states
          for (const player of Object.values(this.state.players)) {
            player.progress = 0
            player.wpm = 0
            player.accuracy = 100
            player.completed = false
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
