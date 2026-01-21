import type * as Party from "partykit/server"

// Game modes
export type GameMode = "race" | "turns" | "hidden"

// Player state
export interface Player {
  id: string
  name: string
  attempts: number
  completed: boolean
  won: boolean
  guesses: string[][] // Stored guesses with results
  currentGuess: number // Current guess number (0-5)
  joinedAt: number
  readyForNextTurn: boolean // For turns mode - player submitted their guess
}

// Game state
export interface GameState {
  roomCode: string
  mode: GameMode
  hostId: string
  targetWord: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  winnerId: string | null
  startedAt: number | null
  finishedAt: number | null
  currentTurn: number // For turns mode - which turn we're on (0-5)
}

// Message types from client
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "guess"; word: string; result: string[][] }
  | { type: "complete"; won: boolean; attempts: number }
  | { type: "leave" }

// Message types to client
export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "game-started"; targetWord: string }
  | { type: "player-progress"; playerId: string; attempts: number }
  | { type: "player-completed"; playerId: string; won: boolean; attempts: number }
  | { type: "game-over"; winnerId: string | null; results: PlayerResult[] }
  | { type: "turn-complete"; turn: number; playerGuesses: Record<string, string[]> } // For turns mode
  | { type: "waiting-for-players"; waitingFor: string[] } // Players who haven't guessed yet
  | { type: "error"; message: string }

export interface PlayerResult {
  id: string
  name: string
  won: boolean
  attempts: number
}

// Public state (sent to clients - no targetWord until game starts)
export interface PublicGameState {
  roomCode: string
  mode: GameMode
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  winnerId: string | null
  targetWord?: string // Only sent when game starts
  currentTurn: number // Current turn for turns mode
}

// Word list (subset for server - full list fetched client-side for validation)
const ANSWER_WORDS = [
  "about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult", "after", "again",
  "agent", "agree", "ahead", "alarm", "album", "alert", "alike", "alive", "allow", "alone",
  "along", "alter", "among", "anger", "angle", "angry", "apart", "apple", "apply", "arena",
  "argue", "arise", "array", "aside", "asset", "audio", "audit", "avoid", "award", "aware",
  "badly", "basic", "basis", "beach", "began", "begin", "being", "below", "bench", "birth",
  "black", "blame", "blank", "blast", "blend", "blind", "block", "blood", "board", "boost",
  "bound", "brain", "brand", "brave", "bread", "break", "breed", "brick", "brief", "bring",
  "broad", "broke", "brown", "brush", "build", "built", "bunch", "burst", "buyer", "cabin",
  "cable", "carry", "catch", "cause", "chain", "chair", "chaos", "charm", "chart", "chase",
  "cheap", "check", "chess", "chest", "chief", "child", "china", "chose", "civil", "claim",
  "class", "clean", "clear", "click", "climb", "clock", "close", "cloud", "coach", "coast",
  "could", "count", "court", "cover", "craft", "crash", "cream", "crime", "cross", "crowd",
  "crown", "curve", "cycle", "daily", "dance", "dated", "dealt", "death", "debut", "delay",
  "depth", "dirty", "doubt", "dozen", "draft", "drain", "drama", "drank", "drawn", "dream",
  "dress", "drink", "drive", "drown", "drunk", "dying", "eager", "early", "earth", "eight",
  "elite", "empty", "enemy", "enjoy", "enter", "entry", "equal", "error", "event", "every",
  "exact", "exist", "extra", "faith", "false", "fault", "favor", "feast", "field", "fifth",
  "fifty", "fight", "final", "first", "fixed", "flash", "fleet", "flesh", "float", "floor",
  "fluid", "focus", "force", "forth", "forty", "forum", "found", "frame", "frank", "fraud",
  "fresh", "front", "fruit", "fully", "funny", "giant", "given", "glass", "globe", "glory",
  "going", "grace", "grade", "grain", "grand", "grant", "grass", "grave", "great", "green",
  "gross", "group", "grown", "guard", "guess", "guest", "guide", "guild", "happy", "harsh",
  "heart", "heavy", "hello", "hence", "henry", "horse", "hotel", "house", "human", "ideal",
  "image", "imply", "index", "inner", "input", "irony", "issue", "japan", "jimmy", "joint",
  "jones", "judge", "juice", "known", "label", "labor", "large", "laser", "later", "laugh",
  "layer", "learn", "lease", "least", "leave", "legal", "lemon", "level", "light", "limit",
  "local", "logic", "loose", "lower", "lucky", "lunch", "lying", "magic", "major", "maker",
  "march", "maria", "match", "maybe", "mayor", "meant", "media", "mercy", "merit", "metal",
  "might", "minor", "minus", "mixed", "model", "money", "month", "moral", "motor", "mount",
  "mouse", "mouth", "movie", "music", "naked", "named", "nerve", "never", "newly", "night",
  "noise", "north", "noted", "novel", "nurse", "occur", "ocean", "offer", "often", "opera",
  "orbit", "order", "other", "ought", "outer", "owner", "paint", "panel", "paper", "party",
  "patch", "pause", "peace", "phase", "phone", "photo", "piece", "pilot", "pitch", "place",
  "plain", "plane", "plant", "plate", "plaza", "point", "polar", "pound", "power", "press",
  "price", "pride", "prime", "print", "prior", "prize", "proof", "proud", "prove", "proxy",
  "queen", "quest", "quick", "quiet", "quite", "quote", "radio", "raise", "rally", "range",
  "rapid", "ratio", "reach", "react", "ready", "realm", "rebel", "refer", "relax", "reply",
  "rider", "ridge", "rifle", "right", "rigid", "risky", "rival", "river", "robin", "robot",
  "rocky", "roman", "rough", "round", "route", "royal", "rugby", "ruled", "rural", "saint",
  "salad", "sales", "sauce", "saved", "scale", "scene", "scope", "score", "sense", "serve",
  "seven", "shade", "shake", "shall", "shame", "shape", "share", "sharp", "sheep", "sheer",
  "sheet", "shelf", "shell", "shift", "shine", "shirt", "shock", "shore", "short", "shout",
  "shown", "sight", "silly", "simon", "since", "sixth", "sixty", "sized", "skill", "slave",
  "sleep", "slice", "slide", "slope", "small", "smart", "smell", "smile", "smith", "smoke",
  "snake", "solar", "solid", "solve", "sorry", "sound", "south", "space", "spare", "spark",
  "speak", "speed", "spend", "spent", "spike", "spine", "spirit","split", "spoke", "sport",
  "spray", "squad", "stack", "staff", "stage", "stake", "stand", "stark", "start", "state",
  "steak", "steam", "steel", "steep", "stick", "stiff", "still", "stock", "stone", "stood",
  "store", "storm", "story", "strip", "stuck", "study", "stuff", "style", "sugar", "suite",
  "super", "swear", "sweet", "swept", "swing", "swiss", "sword", "table", "taken", "taste",
  "taxes", "teach", "teeth", "terry", "texas", "thank", "theft", "their", "theme", "there",
  "these", "thick", "thing", "think", "third", "those", "three", "threw", "throw", "thumb",
  "tiger", "tight", "timer", "tired", "title", "today", "token", "tooth", "topic", "total",
  "touch", "tough", "tower", "trace", "track", "trade", "train", "trash", "treat", "trend",
  "trial", "tribe", "trick", "tried", "truck", "truly", "trump", "trunk", "trust", "truth",
  "tumor", "twice", "uncle", "under", "union", "unity", "until", "upper", "upset", "urban",
  "usage", "usual", "valid", "value", "video", "virus", "visit", "vital", "vivid", "vocal",
  "voice", "waste", "watch", "water", "waved", "weigh", "weird", "whale", "wheat", "wheel",
  "where", "which", "while", "white", "whole", "whose", "widow", "width", "woman", "world",
  "worry", "worse", "worst", "worth", "would", "wound", "write", "wrong", "wrote", "yield",
  "young", "youth", "zebra"
]

function getRandomWord(): string {
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)].toUpperCase()
}

// Room code is generated client-side and passed as the room ID

export default class WordleParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null

  async onStart() {
    // Try to load existing state
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

    const publicState: PublicGameState = {
      roomCode: this.state.roomCode,
      mode: this.state.mode,
      hostId: this.state.hostId,
      players: this.state.players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      winnerId: this.state.winnerId,
      currentTurn: this.state.currentTurn,
    }

    // Only include target word when game is playing or finished
    if (this.state.status !== "waiting") {
      publicState.targetWord = this.state.targetWord
    }

    return publicState
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
    // Parse URL for room creation params
    const url = new URL(ctx.request.url)
    const mode = (url.searchParams.get("mode") as GameMode) || "race"
    const isHost = url.searchParams.get("host") === "true"

    // Create new game if this is the host and no state exists
    if (isHost && !this.state) {
      this.state = {
        roomCode: this.room.id,
        mode,
        hostId: conn.id,
        targetWord: getRandomWord(),
        players: {},
        status: "waiting",
        maxPlayers: 8,
        winnerId: null,
        startedAt: null,
        finishedAt: null,
        currentTurn: 0,
      }
      await this.saveState()
    }

    // Send current state to connecting player
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
            attempts: 0,
            completed: false,
            won: false,
            guesses: [],
            currentGuess: 0,
            joinedAt: Date.now(),
            readyForNextTurn: false,
          }

          this.state.players[sender.id] = player
          await this.saveState()

          // Notify everyone
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
          // Generate a new word when starting
          this.state.targetWord = getRandomWord()
          await this.saveState()

          this.broadcast({
            type: "game-started",
            targetWord: this.state.targetWord,
          })
          this.broadcast({ type: "state", state: this.getPublicState() })
          break
        }

        case "guess": {
          if (this.state.status !== "playing") return

          const player = this.state.players[sender.id]
          if (!player || player.completed) return

          // In turns mode, block if player already submitted for this turn
          if (this.state.mode === "turns" && player.readyForNextTurn) {
            this.send(sender, { type: "error", message: "Waiting for other players..." })
            return
          }

          player.attempts++
          player.currentGuess++
          player.guesses.push(data.result as unknown as string[])

          // Mode-specific behavior
          if (this.state.mode === "race") {
            await this.saveState()
            // In race mode, broadcast progress (attempt count only)
            this.broadcast(
              { type: "player-progress", playerId: sender.id, attempts: player.attempts },
              sender.id
            )
          } else if (this.state.mode === "turns") {
            // In turns mode, mark player as ready and check if all ready
            player.readyForNextTurn = true
            await this.saveState()

            const activePlayers = Object.values(this.state.players).filter(p => !p.completed)
            const waitingFor = activePlayers.filter(p => !p.readyForNextTurn).map(p => p.name)

            if (waitingFor.length > 0) {
              // Notify everyone who we're waiting for
              this.broadcast({ type: "waiting-for-players", waitingFor })
            } else {
              // All players submitted - reveal guesses and move to next turn
              const playerGuesses: Record<string, string[]> = {}
              for (const p of activePlayers) {
                const lastGuess = p.guesses[p.guesses.length - 1]
                if (lastGuess) {
                  playerGuesses[p.id] = lastGuess as unknown as string[]
                }
                p.readyForNextTurn = false // Reset for next turn
              }

              this.state.currentTurn++
              await this.saveState()

              this.broadcast({
                type: "turn-complete",
                turn: this.state.currentTurn,
                playerGuesses,
              })
              this.broadcast({ type: "state", state: this.getPublicState() })
            }
          } else {
            // Hidden/versus mode - just save, don't broadcast anything until complete
            await this.saveState()
          }
          break
        }

        case "complete": {
          if (this.state.status !== "playing") return

          const player = this.state.players[sender.id]
          if (!player || player.completed) return

          player.completed = true
          player.won = data.won
          player.attempts = data.attempts
          player.readyForNextTurn = true // Mark as done for turns mode
          await this.saveState()

          // Mode-specific completion handling
          if (this.state.mode === "race") {
            // Broadcast completion to everyone
            this.broadcast({
              type: "player-completed",
              playerId: sender.id,
              won: data.won,
              attempts: data.attempts,
            })

            // In race mode, first winner ends the game immediately
            if (data.won && !this.state.winnerId) {
              this.state.winnerId = sender.id
              this.state.status = "finished"
              this.state.finishedAt = Date.now()
              await this.saveState()

              const results: PlayerResult[] = Object.values(this.state.players).map((p) => ({
                id: p.id,
                name: p.name,
                won: p.won,
                attempts: p.attempts,
              }))

              this.broadcast({
                type: "game-over",
                winnerId: this.state.winnerId,
                results,
              })
            }
          } else if (this.state.mode === "turns") {
            // In turns mode, broadcast completion
            this.broadcast({
              type: "player-completed",
              playerId: sender.id,
              won: data.won,
              attempts: data.attempts,
            })

            // Check if this was the last active player for this turn
            const activePlayers = Object.values(this.state.players).filter(p => !p.completed)
            const waitingFor = activePlayers.filter(p => !p.readyForNextTurn).map(p => p.name)

            if (waitingFor.length > 0) {
              this.broadcast({ type: "waiting-for-players", waitingFor })
            }
          }
          // In hidden/versus mode, don't broadcast individual completions

          // Check if all players completed (for all modes)
          const allCompleted = Object.values(this.state.players).every((p) => p.completed)
          if (allCompleted && this.state.status === "playing") {
            this.state.status = "finished"
            this.state.finishedAt = Date.now()

            // Find winner (fewest attempts among winners)
            const winners = Object.values(this.state.players).filter((p) => p.won)
            if (winners.length > 0) {
              winners.sort((a, b) => a.attempts - b.attempts)
              this.state.winnerId = winners[0].id
            }

            await this.saveState()

            const results: PlayerResult[] = Object.values(this.state.players).map((p) => ({
              id: p.id,
              name: p.name,
              won: p.won,
              attempts: p.attempts,
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

          // If host leaves, assign new host
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
      }
    } catch (e) {
      console.error("Error processing message:", e)
    }
  }

  async onClose(conn: Party.Connection) {
    if (!this.state) return

    // Remove player on disconnect
    if (this.state.players[conn.id]) {
      delete this.state.players[conn.id]

      // If host leaves, assign new host
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
