import type * as Party from "partykit/server"

// Stroke data for drawing
export interface Stroke {
  points: { x: number; y: number }[]
  color: string
  size: number
}

// Guess entry
export interface Guess {
  playerId: string
  playerName: string
  text: string
  isCorrect: boolean
  timestamp: number
}

// Player state
export interface Player {
  id: string
  name: string
  score: number
  hasDrawn: boolean
  hasGuessedCorrectly: boolean
  joinedAt: number
}

// Game state
export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "round-end" | "finished"
  maxPlayers: number
  currentDrawerId: string | null
  currentWord: string | null
  roundNumber: number
  totalRounds: number
  roundStartedAt: number | null
  roundTimeLimit: number // in seconds
  strokes: Stroke[]
  guesses: Guess[]
  usedWords: string[]
  correctGuessers: string[] // IDs of players who guessed correctly this round
}

// Public state (sent to clients - hides word from non-drawers)
export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "round-end" | "finished"
  maxPlayers: number
  currentDrawerId: string | null
  currentWord: string | null // Only sent to drawer, null for others
  wordLength: number // Hint for guessers
  roundNumber: number
  totalRounds: number
  roundStartedAt: number | null
  roundTimeLimit: number
  strokes: Stroke[]
  guesses: Guess[]
  correctGuessers: string[]
}

// Message types from client
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "draw"; stroke: Stroke }
  | { type: "clear" }
  | { type: "guess"; text: string }
  | { type: "leave" }

// Message types to client
export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "round-started"; drawerId: string; word: string | null; wordLength: number }
  | { type: "draw"; stroke: Stroke }
  | { type: "clear" }
  | { type: "guess"; guess: Guess }
  | { type: "correct-guess"; playerId: string; playerName: string }
  | { type: "round-ended"; word: string; scores: Record<string, number> }
  | { type: "game-over"; results: PlayerResult[] }
  | { type: "error"; message: string }

export interface PlayerResult {
  id: string
  name: string
  score: number
}

// Word list (imported from client-side, duplicated here for server)
const DRAWING_WORDS = [
  "elephant", "giraffe", "penguin", "butterfly", "octopus", "dolphin", "kangaroo",
  "crocodile", "flamingo", "turtle", "snake", "spider", "rabbit", "monkey", "bear",
  "lion", "zebra", "owl", "shark", "whale", "umbrella", "bicycle", "guitar", "rocket",
  "airplane", "camera", "telescope", "lighthouse", "windmill", "scissors", "hammer",
  "ladder", "keyboard", "headphones", "microphone", "balloon", "candle", "clock",
  "mirror", "glasses", "pizza", "hamburger", "icecream", "banana", "watermelon",
  "cupcake", "popcorn", "sandwich", "spaghetti", "hotdog", "swimming", "dancing",
  "sleeping", "cooking", "fishing", "skiing", "surfing", "climbing", "reading",
  "painting", "beach", "castle", "mountain", "hospital", "restaurant", "pyramid",
  "igloo", "volcano", "island", "bridge", "rainbow", "sunflower", "cactus", "mushroom",
  "tree", "cloud", "lightning", "waterfall", "moon", "star", "helicopter", "submarine",
  "motorcycle", "sailboat", "tractor", "train", "spaceship", "ambulance", "firetruck",
  "bus", "pirate", "astronaut", "wizard", "ninja", "robot", "mermaid", "superhero",
  "vampire", "ghost", "angel",
]

function getRandomWord(usedWords: string[]): string {
  const available = DRAWING_WORDS.filter((word) => !usedWords.includes(word))
  if (available.length === 0) {
    return DRAWING_WORDS[Math.floor(Math.random() * DRAWING_WORDS.length)]
  }
  return available[Math.floor(Math.random() * available.length)]
}

export default class DrawingParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  roundTimer: ReturnType<typeof setTimeout> | null = null

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (stored) {
      this.state = stored
      // Resume round timer if game was in progress
      if (this.state.status === "playing" && this.state.roundStartedAt) {
        const elapsed = (Date.now() - this.state.roundStartedAt) / 1000
        const remaining = this.state.roundTimeLimit - elapsed
        if (remaining > 0) {
          this.startRoundTimer(remaining * 1000)
        } else {
          await this.endRound()
        }
      }
    }
  }

  async saveState() {
    if (this.state) {
      await this.room.storage.put("state", this.state)
    }
  }

  getPublicState(forPlayerId?: string): PublicGameState {
    if (!this.state) {
      throw new Error("No game state")
    }

    const isDrawer = forPlayerId === this.state.currentDrawerId

    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players: this.state.players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      currentDrawerId: this.state.currentDrawerId,
      currentWord: isDrawer ? this.state.currentWord : null,
      wordLength: this.state.currentWord?.length || 0,
      roundNumber: this.state.roundNumber,
      totalRounds: this.state.totalRounds,
      roundStartedAt: this.state.roundStartedAt,
      roundTimeLimit: this.state.roundTimeLimit,
      strokes: this.state.strokes,
      guesses: this.state.guesses,
      correctGuessers: this.state.correctGuessers,
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

  broadcastState() {
    // Send personalized state to each player (drawer sees word, others don't)
    for (const conn of this.room.getConnections()) {
      conn.send(JSON.stringify({ type: "state", state: this.getPublicState(conn.id) }))
    }
  }

  send(conn: Party.Connection, message: ServerMessage) {
    conn.send(JSON.stringify(message))
  }

  startRoundTimer(duration: number) {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
    }
    this.roundTimer = setTimeout(async () => {
      await this.endRound()
    }, duration)
  }

  async startNewRound() {
    if (!this.state) return

    // Find next drawer
    const players = Object.values(this.state.players)
    const eligibleDrawers = players.filter((p) => !p.hasDrawn)

    if (eligibleDrawers.length === 0) {
      // All players have drawn, game over
      await this.endGame()
      return
    }

    // Pick first eligible drawer (by join order)
    eligibleDrawers.sort((a, b) => a.joinedAt - b.joinedAt)
    const drawer = eligibleDrawers[0]

    // Reset round state
    this.state.currentDrawerId = drawer.id
    this.state.currentWord = getRandomWord(this.state.usedWords)
    this.state.usedWords.push(this.state.currentWord)
    this.state.roundNumber++
    this.state.roundStartedAt = Date.now()
    this.state.strokes = []
    this.state.guesses = []
    this.state.correctGuessers = []
    this.state.status = "playing"

    // Reset hasGuessedCorrectly for all players
    for (const player of Object.values(this.state.players)) {
      player.hasGuessedCorrectly = false
    }

    await this.saveState()

    // Notify all players
    for (const conn of this.room.getConnections()) {
      const isDrawer = conn.id === drawer.id
      this.send(conn, {
        type: "round-started",
        drawerId: drawer.id,
        word: isDrawer ? this.state.currentWord : null,
        wordLength: this.state.currentWord!.length,
      })
    }

    this.broadcastState()

    // Start round timer
    this.startRoundTimer(this.state.roundTimeLimit * 1000)
  }

  async endRound() {
    if (!this.state || this.state.status !== "playing") return

    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
      this.roundTimer = null
    }

    // Mark drawer as having drawn
    if (this.state.currentDrawerId && this.state.players[this.state.currentDrawerId]) {
      this.state.players[this.state.currentDrawerId].hasDrawn = true
    }

    this.state.status = "round-end"
    await this.saveState()

    // Build scores object for this round
    const scores: Record<string, number> = {}
    for (const player of Object.values(this.state.players)) {
      scores[player.id] = player.score
    }

    // Broadcast round end
    this.broadcast({
      type: "round-ended",
      word: this.state.currentWord || "",
      scores,
    })
    this.broadcastState()

    // Wait 3 seconds then start next round
    setTimeout(async () => {
      await this.startNewRound()
    }, 3000)
  }

  async endGame() {
    if (!this.state) return

    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
      this.roundTimer = null
    }

    this.state.status = "finished"
    await this.saveState()

    const results: PlayerResult[] = Object.values(this.state.players)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      }))
      .sort((a, b) => b.score - a.score)

    this.broadcast({ type: "game-over", results })
    this.broadcastState()
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const isHost = url.searchParams.get("host") === "true"

    if (isHost && !this.state) {
      const playerCount = 1 // Will be set properly when players join
      this.state = {
        roomCode: this.room.id,
        hostId: conn.id,
        players: {},
        status: "waiting",
        maxPlayers: 8,
        currentDrawerId: null,
        currentWord: null,
        roundNumber: 0,
        totalRounds: playerCount, // Will be updated when game starts
        roundStartedAt: null,
        roundTimeLimit: 60,
        strokes: [],
        guesses: [],
        usedWords: [],
        correctGuessers: [],
      }
      await this.saveState()
    }

    if (this.state) {
      this.send(conn, { type: "state", state: this.getPublicState(conn.id) })
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
            score: 0,
            hasDrawn: false,
            hasGuessedCorrectly: false,
            joinedAt: Date.now(),
          }

          this.state.players[sender.id] = player
          this.state.totalRounds = Object.keys(this.state.players).length
          await this.saveState()

          this.broadcast({ type: "player-joined", player })
          this.broadcastState()
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

          this.state.totalRounds = Object.keys(this.state.players).length
          await this.saveState()

          await this.startNewRound()
          break
        }

        case "draw": {
          if (this.state.status !== "playing") return
          if (sender.id !== this.state.currentDrawerId) return

          this.state.strokes.push(data.stroke)
          await this.saveState()

          // Broadcast to everyone except the drawer
          this.broadcast({ type: "draw", stroke: data.stroke }, sender.id)
          break
        }

        case "clear": {
          if (this.state.status !== "playing") return
          if (sender.id !== this.state.currentDrawerId) return

          this.state.strokes = []
          await this.saveState()

          this.broadcast({ type: "clear" })
          break
        }

        case "guess": {
          if (this.state.status !== "playing") return
          if (sender.id === this.state.currentDrawerId) return // Drawer can't guess

          const player = this.state.players[sender.id]
          if (!player || player.hasGuessedCorrectly) return // Already guessed correctly

          const guessText = data.text.trim().toLowerCase()
          const correctWord = this.state.currentWord?.toLowerCase()
          const isCorrect = guessText === correctWord

          const guess: Guess = {
            playerId: sender.id,
            playerName: player.name,
            text: data.text.trim(),
            isCorrect,
            timestamp: Date.now(),
          }

          this.state.guesses.push(guess)

          if (isCorrect) {
            player.hasGuessedCorrectly = true
            this.state.correctGuessers.push(sender.id)

            // Award points based on guess order
            const guessOrder = this.state.correctGuessers.length
            let points = 1
            if (guessOrder === 1) points = 3
            else if (guessOrder === 2) points = 2

            player.score += points

            // Give drawer 1 point per correct guesser
            if (this.state.currentDrawerId && this.state.players[this.state.currentDrawerId]) {
              this.state.players[this.state.currentDrawerId].score += 1
            }

            await this.saveState()

            // Broadcast correct guess (without revealing the word in the guess)
            this.broadcast({
              type: "correct-guess",
              playerId: sender.id,
              playerName: player.name,
            })

            // Check if all non-drawers have guessed
            const currentDrawerId = this.state.currentDrawerId
            const nonDrawers = Object.values(this.state.players).filter(
              (p) => p.id !== currentDrawerId
            )
            const allGuessed = nonDrawers.every((p) => p.hasGuessedCorrectly)

            if (allGuessed) {
              await this.endRound()
            } else {
              this.broadcastState()
            }
          } else {
            await this.saveState()
            // Broadcast incorrect guess to all
            this.broadcast({ type: "guess", guess })
          }
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

          // If drawer leaves during a round, end the round
          if (
            this.state.status === "playing" &&
            sender.id === this.state.currentDrawerId
          ) {
            await this.endRound()
          }

          await this.saveState()
          this.broadcast({ type: "player-left", playerId: sender.id })
          this.broadcastState()
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

      // If drawer leaves during a round, end the round
      if (
        this.state.status === "playing" &&
        conn.id === this.state.currentDrawerId
      ) {
        await this.endRound()
      }

      await this.saveState()
      this.broadcast({ type: "player-left", playerId: conn.id })
      this.broadcastState()
    }
  }
}
