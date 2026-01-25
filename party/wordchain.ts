import type * as Party from "partykit/server"

// Player state
export interface Player {
  id: string
  name: string
  eliminated: boolean
  eliminatedReason?: string // "timeout" | "invalid" | "repeated" | "wrong-letter"
  eliminatedWord?: string // The word that caused elimination
  joinedAt: number
}

// Game state
export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number

  // Game-specific
  wordChain: string[]
  usedWords: string[] // Array for serialization (Set doesn't serialize)
  currentPlayerId: string | null
  turnStartedAt: number | null
  turnTimeLimit: number // seconds
  winnerId: string | null
  playerOrder: string[] // Order of player IDs for turn rotation
}

// Public state (sent to clients)
export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  wordChain: string[]
  currentPlayerId: string | null
  turnStartedAt: number | null
  turnTimeLimit: number
  winnerId: string | null
  playerOrder: string[]
}

// Message types from client
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "submit-word"; word: string }
  | { type: "leave" }
  | { type: "restart" }

// Message types to client
export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "game-started"; startingWord: string; firstPlayerId: string }
  | { type: "turn-started"; playerId: string; mustStartWith: string }
  | { type: "word-accepted"; playerId: string; word: string; nextPlayerId: string; mustStartWith: string }
  | { type: "player-eliminated"; playerId: string; reason: string; word?: string }
  | { type: "game-over"; winnerId: string; wordChain: string[] }
  | { type: "game-restarted" }
  | { type: "error"; message: string }

// Good starting words - common words that have versatile ending letters
const STARTING_WORDS = [
  "apple", "house", "water", "music", "table",
  "dance", "light", "stone", "dream", "flame",
  "ocean", "piano", "river", "smile", "tiger",
  "beach", "cloud", "earth", "green", "heart",
  "magic", "night", "peace", "queen", "radio",
  "space", "trade", "voice", "whale", "youth",
  "brave", "crane", "eagle", "frost", "grape",
  "horse", "image", "joker", "knife", "lemon",
]

function getRandomStartingWord(): string {
  return STARTING_WORDS[Math.floor(Math.random() * STARTING_WORDS.length)]
}

// Validate word using Free Dictionary API
async function isValidEnglishWord(word: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`
    )
    return response.ok
  } catch (error) {
    console.error("Dictionary API error:", error)
    // On error, be permissive
    return true
  }
}

export default class WordChainParty implements Party.Server {
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
      wordChain: this.state.wordChain,
      currentPlayerId: this.state.currentPlayerId,
      turnStartedAt: this.state.turnStartedAt,
      turnTimeLimit: this.state.turnTimeLimit,
      winnerId: this.state.winnerId,
      playerOrder: this.state.playerOrder,
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

  getLastLetter(): string {
    if (!this.state || this.state.wordChain.length === 0) return ""
    const lastWord = this.state.wordChain[this.state.wordChain.length - 1]
    return lastWord[lastWord.length - 1].toLowerCase()
  }

  getActivePlayers(): Player[] {
    if (!this.state) return []
    return this.state.playerOrder
      .map(id => this.state!.players[id])
      .filter(p => p && !p.eliminated)
  }

  getNextPlayerId(currentId: string | null): string | null {
    if (!this.state) return null

    const activePlayers = this.getActivePlayers()
    if (activePlayers.length === 0) return null
    if (activePlayers.length === 1) return activePlayers[0].id

    if (!currentId) return activePlayers[0].id

    const currentIndex = this.state.playerOrder.indexOf(currentId)
    if (currentIndex === -1) return activePlayers[0].id

    // Find next active player in order
    for (let i = 1; i <= this.state.playerOrder.length; i++) {
      const nextIndex = (currentIndex + i) % this.state.playerOrder.length
      const nextId = this.state.playerOrder[nextIndex]
      const player = this.state.players[nextId]
      if (player && !player.eliminated) {
        return nextId
      }
    }

    return null
  }

  eliminatePlayer(playerId: string, reason: string, word?: string) {
    if (!this.state) return

    const player = this.state.players[playerId]
    if (!player || player.eliminated) return

    player.eliminated = true
    player.eliminatedReason = reason
    if (word) player.eliminatedWord = word

    this.broadcast({
      type: "player-eliminated",
      playerId,
      reason,
      word,
    })

    // Check win condition
    const activePlayers = this.getActivePlayers()
    if (activePlayers.length === 1) {
      this.endGame(activePlayers[0].id)
    } else if (activePlayers.length === 0) {
      // Everyone eliminated (shouldn't happen)
      this.endGame(null)
    } else {
      // Start next player's turn
      this.startTurn(this.getNextPlayerId(playerId))
    }
  }

  startTurn(playerId: string | null) {
    if (!this.state || !playerId) return

    this.state.currentPlayerId = playerId
    this.state.turnStartedAt = Date.now()

    const mustStartWith = this.getLastLetter().toUpperCase()

    this.broadcast({
      type: "turn-started",
      playerId,
      mustStartWith,
    })
    this.broadcast({ type: "state", state: this.getPublicState() })

    // Set alarm for turn timeout
    this.room.storage.setAlarm(Date.now() + this.state.turnTimeLimit * 1000)
  }

  endGame(winnerId: string | null) {
    if (!this.state) return

    this.state.status = "finished"
    this.state.winnerId = winnerId
    this.state.currentPlayerId = null

    // Cancel any pending alarm
    this.room.storage.deleteAlarm()

    this.broadcast({
      type: "game-over",
      winnerId: winnerId || "",
      wordChain: this.state.wordChain,
    })
    this.broadcast({ type: "state", state: this.getPublicState() })
  }

  async onAlarm() {
    // Turn timeout
    if (!this.state || this.state.status !== "playing" || !this.state.currentPlayerId) {
      return
    }

    // Double-check the turn hasn't already ended
    const elapsed = Date.now() - (this.state.turnStartedAt || 0)
    if (elapsed < this.state.turnTimeLimit * 1000 - 500) {
      // Alarm fired too early, reschedule
      return
    }

    this.eliminatePlayer(this.state.currentPlayerId, "timeout")
    await this.saveState()
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const isHost = url.searchParams.get("host") === "true"
    const turnTimeLimit = parseInt(url.searchParams.get("turnTimeLimit") || "15", 10)

    if (isHost && !this.state) {
      this.state = {
        roomCode: this.room.id,
        hostId: conn.id,
        players: {},
        status: "waiting",
        maxPlayers: 8,
        wordChain: [],
        usedWords: [],
        currentPlayerId: null,
        turnStartedAt: null,
        turnTimeLimit: Math.max(5, Math.min(60, turnTimeLimit)),
        winnerId: null,
        playerOrder: [],
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
            eliminated: false,
            joinedAt: Date.now(),
          }

          this.state.players[sender.id] = player
          this.state.playerOrder.push(sender.id)
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

          // Start the game
          const startingWord = getRandomStartingWord()
          this.state.status = "playing"
          this.state.wordChain = [startingWord]
          this.state.usedWords = [startingWord.toLowerCase()]

          // Randomize player order
          this.state.playerOrder = [...this.state.playerOrder].sort(() => Math.random() - 0.5)
          const firstPlayerId = this.state.playerOrder[0]

          await this.saveState()

          this.broadcast({
            type: "game-started",
            startingWord,
            firstPlayerId,
          })

          // Start first turn
          this.startTurn(firstPlayerId)
          break
        }

        case "submit-word": {
          if (this.state.status !== "playing") return
          if (sender.id !== this.state.currentPlayerId) {
            this.send(sender, { type: "error", message: "Not your turn" })
            return
          }

          const word = data.word.toLowerCase().trim()

          // Validate minimum word length
          if (word.length < 2) {
            this.eliminatePlayer(sender.id, "invalid", word)
            await this.saveState()
            return
          }

          // Validate only letters
          if (!/^[a-z]+$/.test(word)) {
            this.eliminatePlayer(sender.id, "invalid", word)
            await this.saveState()
            return
          }

          // Validate starts with correct letter
          const mustStartWith = this.getLastLetter()
          if (word[0] !== mustStartWith) {
            this.eliminatePlayer(sender.id, "wrong-letter", word)
            await this.saveState()
            return
          }

          // Validate not already used
          if (this.state.usedWords.includes(word)) {
            this.eliminatePlayer(sender.id, "repeated", word)
            await this.saveState()
            return
          }

          // Validate is a real English word using dictionary API
          const isValid = await isValidEnglishWord(word)
          if (!isValid) {
            this.eliminatePlayer(sender.id, "invalid", word)
            await this.saveState()
            return
          }

          // Word accepted!
          this.state.wordChain.push(word)
          this.state.usedWords.push(word)

          // Cancel current alarm
          this.room.storage.deleteAlarm()

          // Get next player
          const nextPlayerId = this.getNextPlayerId(sender.id)
          const nextMustStartWith = word[word.length - 1].toUpperCase()

          this.broadcast({
            type: "word-accepted",
            playerId: sender.id,
            word,
            nextPlayerId: nextPlayerId || "",
            mustStartWith: nextMustStartWith,
          })

          if (nextPlayerId) {
            this.startTurn(nextPlayerId)
          }

          await this.saveState()
          break
        }

        case "leave": {
          const wasPlaying = this.state.status === "playing"
          const wasCurrentPlayer = sender.id === this.state.currentPlayerId

          delete this.state.players[sender.id]
          this.state.playerOrder = this.state.playerOrder.filter(id => id !== sender.id)

          if (sender.id === this.state.hostId) {
            const remaining = Object.keys(this.state.players)
            if (remaining.length > 0) {
              this.state.hostId = remaining[0]
            }
          }

          await this.saveState()
          this.broadcast({ type: "player-left", playerId: sender.id })

          // If game was playing, handle turn/win logic
          if (wasPlaying) {
            const activePlayers = this.getActivePlayers()
            if (activePlayers.length === 1) {
              this.endGame(activePlayers[0].id)
            } else if (activePlayers.length === 0) {
              this.endGame(null)
            } else if (wasCurrentPlayer) {
              // Move to next player
              this.startTurn(this.getNextPlayerId(sender.id))
            }
          }

          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }

        case "restart": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can restart" })
            return
          }

          // Reset game state
          this.state.status = "waiting"
          this.state.wordChain = []
          this.state.usedWords = []
          this.state.currentPlayerId = null
          this.state.turnStartedAt = null
          this.state.winnerId = null

          // Reset player states
          for (const player of Object.values(this.state.players)) {
            player.eliminated = false
            delete player.eliminatedReason
            delete player.eliminatedWord
          }

          // Cancel any pending alarm
          this.room.storage.deleteAlarm()

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
      const wasPlaying = this.state.status === "playing"
      const wasCurrentPlayer = conn.id === this.state.currentPlayerId

      delete this.state.players[conn.id]
      this.state.playerOrder = this.state.playerOrder.filter(id => id !== conn.id)

      if (conn.id === this.state.hostId) {
        const remaining = Object.keys(this.state.players)
        if (remaining.length > 0) {
          this.state.hostId = remaining[0]
        }
      }

      await this.saveState()
      this.broadcast({ type: "player-left", playerId: conn.id })

      // If game was playing, handle turn/win logic
      if (wasPlaying) {
        const activePlayers = this.getActivePlayers()
        if (activePlayers.length === 1) {
          this.endGame(activePlayers[0].id)
        } else if (activePlayers.length === 0) {
          this.endGame(null)
        } else if (wasCurrentPlayer) {
          this.startTurn(this.getNextPlayerId(conn.id))
        }
      }

      this.broadcast({ type: "state", state: this.getPublicState() })
    }
  }
}
