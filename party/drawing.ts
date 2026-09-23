import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  markConnected,
  markDisconnected,
  nextHost,
  canControlGame,
} from "./shared/presence"
import {
  getGameNightResultMatch,
  validateGameNightConnection,
  type GameNightMember,
} from "./shared/gameNight"

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

export type DrawingGameMode =
  | "classic"
  | "league-of-legends"
  | "valorant"
  | "draw-vote"
  | "telephone"

interface DrawVoteEntry {
  id: string
  authorId: string
  authorName: string
  strokes: Stroke[]
  revision: number
  submitted: boolean
}

interface DrawVoteState {
  phase: "drawing" | "voting" | "results"
  deadline: number | null
  participantIds: string[]
  entries: DrawVoteEntry[]
  votes: Record<string, string>
}

export interface PublicDrawVoteState {
  phase: DrawVoteState["phase"]
  deadline: number | null
  participantCount: number
  submittedCount: number
  votedCount: number
  draft: Stroke[]
  draftRevision: number
  submitted: boolean
  selectedEntryId: string | null
  canVote: boolean
  entries: {
    id: string
    strokes: Stroke[]
    isOwn: boolean
    authorName: string | null
    votes: number | null
  }[]
}

export type TelephoneEntry =
  | { type: "text"; authorId: string; authorName: string; text: string }
  | { type: "drawing"; authorId: string; authorName: string; strokes: Stroke[] }

export interface TelephoneChain {
  id: string
  originPlayerId: string
  originPlayerName: string
  entries: TelephoneEntry[]
}

export interface TelephoneReaction {
  playerId: string
  playerName: string
  emoji: string
}

export type TelephoneAssignment =
  | { type: "write-prompt" }
  | { type: "draw"; prompt: string }
  | { type: "describe"; strokes: Stroke[] }

// Player state
export interface Player {
  id: string
  name: string
  score: number
  hasDrawn: boolean
  hasGuessedCorrectly: boolean
  joinedAt: number
  /** False while their socket is away; they stay in the game and can rejoin. */
  connected?: boolean
  drawCount: number // How many times this player has drawn
  lastGuessAt: number // Timestamp of last guess for cooldown
}

// Game state
export interface GameState {
  roomCode: string
  mode: DrawingGameMode
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "round-end" | "finished"
  maxPlayers: number
  currentDrawerId: string | null
  currentWord: string | null
  roundNumber: number
  totalRounds: number
  roundsPerPlayer: number // How many times each player draws
  roundStartedAt: number | null
  roundTimeLimit: number // in seconds
  strokes: Stroke[]
  guesses: Guess[]
  usedWords: string[]
  correctGuessers: string[] // IDs of players who guessed correctly this round
  telephoneStage: number
  telephonePlayerOrder: string[]
  telephoneSubmittedIds: string[]
  telephoneChains: Record<string, TelephoneChain>
  telephoneRevealChainIndex: number
  telephoneRevealEntryIndex: number
  telephoneRevealComplete: boolean
  telephoneReactions: Record<string, TelephoneReaction[]>
  playerTokens: Record<string, string>
  drawVote: DrawVoteState | null
}

// Public state (sent to clients - hides word from non-drawers)
export interface PublicGameState {
  roomCode: string
  mode: DrawingGameMode
  hostId: string
  canControl: boolean
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
  telephoneStage: number
  telephoneTotalStages: number
  telephoneSubmittedIds: string[]
  telephoneAssignment: TelephoneAssignment | null
  telephoneChains: TelephoneChain[]
  telephoneRevealChainIndex: number
  telephoneRevealEntryIndex: number
  telephoneRevealComplete: boolean
  telephoneReactions: TelephoneReaction[]
  drawVote: PublicDrawVoteState | null
}

// Message types from client
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "draw"; stroke: Stroke }
  | { type: "undo"; requestId: string }
  | { type: "clear" }
  | { type: "guess"; text: string }
  | { type: "draw-vote-edit"; round: number; action: "stroke" | "undo" | "clear"; stroke?: Stroke }
  | { type: "draw-vote-submit"; round: number }
  | { type: "draw-vote-vote"; round: number; entryId: string }
  | { type: "draw-vote-next"; round: number }
  | { type: "telephone-submit"; stage: number; text?: string; strokes?: Stroke[] }
  | {
      type: "telephone-reveal-next"
      chainIndex: number
      entryIndex: number
    }
  | {
      type: "telephone-react"
      chainIndex: number
      entryIndex: number
      emoji: string
    }
  | { type: "restart" }
  | { type: "leave" }

// Message types to client
export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "round-started"; drawerId: string; word: string | null; wordLength: number }
  | { type: "draw"; stroke: Stroke }
  | { type: "clear" }
  | { type: "canvas-state"; strokes: Stroke[]; undoRequestId?: string }
  | { type: "guess"; guess: Guess }
  | { type: "correct-guess"; playerId: string; playerName: string }
  | { type: "round-ended"; word: string; scores: Record<string, number> }
  | { type: "game-over"; results: PlayerResult[] }
  | { type: "game-restarted" }
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

const LEAGUE_CHAMPIONS = [
  "Aatrox", "Ahri", "Akali", "Akshan", "Alistar", "Ambessa", "Amumu", "Anivia",
  "Annie", "Aphelios", "Ashe", "Aurelion Sol", "Aurora", "Azir", "Bard", "Bel'Veth",
  "Blitzcrank", "Brand", "Braum", "Briar", "Caitlyn", "Camille", "Cassiopeia",
  "Cho'Gath", "Corki", "Darius", "Diana", "Dr. Mundo", "Draven", "Ekko", "Elise",
  "Evelynn", "Ezreal", "Fiddlesticks", "Fiora", "Fizz", "Galio", "Gangplank", "Garen",
  "Gnar", "Gragas", "Graves", "Gwen", "Hecarim", "Heimerdinger", "Hwei", "Illaoi",
  "Irelia", "Ivern", "Janna", "Jarvan IV", "Jax", "Jayce", "Jhin", "Jinx", "K'Sante",
  "Kai'Sa", "Kalista", "Karma", "Karthus", "Kassadin", "Katarina", "Kayle", "Kayn",
  "Kennen", "Kha'Zix", "Kindred", "Kled", "Kog'Maw", "LeBlanc", "Lee Sin", "Leona",
  "Lillia", "Lissandra", "Lucian", "Lulu", "Lux", "Malphite", "Malzahar", "Maokai",
  "Master Yi", "Mel", "Milio", "Miss Fortune", "Mordekaiser", "Morgana", "Naafiri",
  "Nami", "Nasus", "Nautilus", "Neeko", "Nidalee", "Nilah", "Nocturne",
  "Nunu & Willump", "Olaf", "Orianna", "Ornn", "Pantheon", "Poppy", "Pyke", "Qiyana",
  "Quinn", "Rakan", "Rammus", "Rek'Sai", "Rell", "Renata Glasc", "Renekton", "Rengar",
  "Riven", "Rumble", "Ryze", "Samira", "Sejuani", "Senna", "Seraphine", "Sett",
  "Shaco", "Shen", "Shyvana", "Singed", "Sion", "Sivir", "Skarner", "Smolder", "Sona",
  "Soraka", "Swain", "Sylas", "Syndra", "Tahm Kench", "Taliyah", "Talon", "Taric",
  "Teemo", "Thresh", "Tristana", "Trundle", "Tryndamere", "Twisted Fate", "Twitch",
  "Udyr", "Urgot", "Varus", "Vayne", "Veigar", "Vel'Koz", "Vex", "Vi", "Viego",
  "Viktor", "Vladimir", "Volibear", "Warwick", "Wukong", "Xayah", "Xerath", "Xin Zhao",
  "Yasuo", "Yone", "Yorick", "Yunara", "Yuumi", "Zaahen", "Zac", "Zed", "Zeri",
  "Ziggs", "Zilean", "Zoe", "Zyra",
]

const VALORANT_AGENTS = [
  "Astra", "Breach", "Brimstone", "Chamber", "Clove", "Cypher", "Deadlock", "Fade",
  "Gekko", "Harbor", "Iso", "Jett", "KAY/O", "Killjoy", "Neon", "Omen", "Phoenix",
  "Raze", "Reyna", "Sage", "Skye", "Sova", "Tejo", "Veto", "Viper", "Vyse", "Waylay",
  "Yoru",
]

const TELEPHONE_REACTIONS = new Set([
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F92F}",
  "\u{2764}\u{FE0F}",
])

function getWordPool(mode: DrawingGameMode): string[] {
  if (mode === "league-of-legends") return LEAGUE_CHAMPIONS
  if (mode === "valorant") return VALORANT_AGENTS
  return DRAWING_WORDS
}

function getRandomWord(mode: DrawingGameMode, usedWords: string[]): string {
  const words = getWordPool(mode)
  const available = words.filter((word) => !usedWords.includes(word))
  if (available.length === 0) {
    return words[Math.floor(Math.random() * words.length)]
  }
  return available[Math.floor(Math.random() * available.length)]
}

function normalizeAnswer(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function isDrawingAndGuessingMode(mode: DrawingGameMode): boolean {
  return mode !== "telephone" && mode !== "draw-vote"
}

function sanitizeStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, 1000).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return []

    const stroke = candidate as Partial<Stroke>
    if (!Array.isArray(stroke.points)) return []

    const points = stroke.points
      .slice(0, 2000)
      .filter(
        (point) =>
          point &&
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= 0 &&
          point.x <= 1200 &&
          point.y >= 0 &&
          point.y <= 800
      )
      .map((point) => ({ x: point.x, y: point.y }))
    if (points.length < 2) return []

    const color =
      typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color)
        ? stroke.color
        : "#000000"
    const size = Number.isFinite(stroke.size)
      ? Math.min(64, Math.max(1, stroke.size!))
      : 8

    return [{ points, color, size }]
  })
}

class DrawingParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  roundTimer: ReturnType<typeof setTimeout> | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (stored) {
      this.state = {
        ...stored,
        mode: stored.mode ?? "classic",
        telephoneStage: stored.telephoneStage ?? 0,
        telephonePlayerOrder: stored.telephonePlayerOrder ?? [],
        telephoneSubmittedIds: stored.telephoneSubmittedIds ?? [],
        telephoneChains: stored.telephoneChains ?? {},
        telephoneRevealChainIndex: stored.telephoneRevealChainIndex ?? 0,
        telephoneRevealEntryIndex: stored.telephoneRevealEntryIndex ?? 0,
        telephoneRevealComplete:
          stored.telephoneRevealComplete ??
          (stored.mode === "telephone" && stored.status === "finished"),
        telephoneReactions: stored.telephoneReactions ?? {},
        playerTokens: stored.playerTokens ?? {},
        drawVote: stored.drawVote ?? null,
      }
		for (const player of Object.values(this.state.players)) {
			player.connected = false
		}
		await this.saveState()
      // Resume round timer if game was in progress
      if (this.state.mode === "draw-vote" && this.state.drawVote?.deadline) {
        this.startRoundTimer(Math.max(0, this.state.drawVote.deadline - Date.now()))
      } else if (this.state.status === "playing" && this.state.roundStartedAt) {
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

  isAuthenticated(conn: Party.Connection): boolean {
    if (!this.state) return false
    const token = this.connectionTokens.get(conn)
    return Boolean(token && this.state.playerTokens[conn.id] === token)
  }

  getPublicState(forPlayerId?: string): PublicGameState {
    if (!this.state) {
      throw new Error("No game state")
    }

    const isDrawer = forPlayerId === this.state.currentDrawerId
    // Show word to everyone during round-end, or to drawer during playing
    const showWord = this.state.status === "round-end" || isDrawer || this.state.mode === "draw-vote"
    const telephoneChains = this.state.telephonePlayerOrder
      .map((id) => this.state!.telephoneChains[id])
      .filter((chain): chain is TelephoneChain => Boolean(chain))
    const revealedTelephoneChains = this.state.telephoneRevealComplete
      ? telephoneChains
      : telephoneChains
          .slice(0, this.state.telephoneRevealChainIndex + 1)
          .map((chain, index) => ({
            ...chain,
            entries:
              index < this.state!.telephoneRevealChainIndex
                ? chain.entries
                : chain.entries.slice(0, this.state!.telephoneRevealEntryIndex + 1),
          }))
    const reactionKey = `${this.state.telephoneRevealChainIndex}:${this.state.telephoneRevealEntryIndex}`

    return {
      roomCode: this.state.roomCode,
      mode: this.state.mode,
      hostId: this.state.hostId,
      canControl: forPlayerId
        ? canControlGame(this.state.players, this.state.hostId, forPlayerId)
        : false,
      players: this.state.players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      currentDrawerId: this.state.currentDrawerId,
      currentWord: showWord ? this.state.currentWord : null,
      wordLength: this.state.currentWord
        ? normalizeAnswer(this.state.currentWord).length
        : 0,
      roundNumber: this.state.roundNumber,
      totalRounds: this.state.totalRounds,
      roundStartedAt: this.state.roundStartedAt,
      roundTimeLimit: this.state.roundTimeLimit,
      strokes: this.state.strokes,
      guesses: this.state.guesses,
      correctGuessers: this.state.correctGuessers,
      telephoneStage: this.state.telephoneStage,
      telephoneTotalStages: this.state.telephonePlayerOrder.length,
      telephoneSubmittedIds: this.state.telephoneSubmittedIds,
      telephoneAssignment: forPlayerId
        ? this.getTelephoneAssignment(forPlayerId)
        : null,
      telephoneChains:
        this.state.mode === "telephone" && this.state.status === "finished"
          ? revealedTelephoneChains
          : [],
      telephoneRevealChainIndex: this.state.telephoneRevealChainIndex,
      telephoneRevealEntryIndex: this.state.telephoneRevealEntryIndex,
      telephoneRevealComplete: this.state.telephoneRevealComplete,
      telephoneReactions: this.state.telephoneReactions[reactionKey] ?? [],
      drawVote: this.getPublicDrawVoteState(forPlayerId),
    }
  }

  getPublicDrawVoteState(playerId?: string): PublicDrawVoteState | null {
    const round = this.state?.drawVote
    if (this.state?.mode !== "draw-vote" || !round) return null
    const own = round.entries.find((entry) => entry.authorId === playerId)
    const revealed = round.phase === "results"
    return {
      phase: round.phase,
      deadline: round.deadline,
      participantCount: round.participantIds.length,
      submittedCount: round.entries.filter((entry) => entry.submitted).length,
      votedCount: Object.keys(round.votes).length,
      draft: own?.strokes ?? [],
      draftRevision: own?.revision ?? 0,
      submitted: own?.submitted ?? false,
      selectedEntryId: playerId ? round.votes[playerId] ?? null : null,
      canVote: Boolean(playerId && round.phase === "voting" &&
        round.participantIds.includes(playerId) && !round.votes[playerId] &&
        round.entries.some((entry) => entry.authorId !== playerId && entry.strokes.length > 0)),
      entries: round.phase === "drawing" ? [] : round.entries
        .filter((entry) => entry.strokes.length > 0)
        .map((entry) => ({
          id: entry.id,
          strokes: entry.strokes,
          isOwn: entry.authorId === playerId,
          authorName: revealed ? entry.authorName : null,
          votes: revealed ? Object.values(round.votes).filter((id) => id === entry.id).length : null,
        })),
    }
  }

  async startDrawVoteRound() {
    if (!this.state || this.state.mode !== "draw-vote") return
    const players = Object.values(this.state.players)
    if (players.length < 3 || this.state.roundNumber >= this.state.totalRounds) {
      await this.endGame()
      return
    }
    this.state.roundNumber++
    this.state.currentWord = getRandomWord("classic", this.state.usedWords)
    this.state.usedWords.push(this.state.currentWord)
    this.state.status = "playing"
    this.state.roundStartedAt = Date.now()
    this.state.drawVote = {
      phase: "drawing",
      deadline: Date.now() + this.state.roundTimeLimit * 1000,
      participantIds: players.map((player) => player.id),
      entries: players.map((player) => ({
        id: crypto.randomUUID(), authorId: player.id, authorName: player.name,
        strokes: [], revision: 0, submitted: false,
      })),
      votes: {},
    }
    this.startRoundTimer(this.state.roundTimeLimit * 1000)
    await this.saveState()
    this.broadcastState()
  }

  async advanceDrawVotePhase() {
    const round = this.state?.drawVote
    if (!this.state || this.state.mode !== "draw-vote" || !round || round.phase === "results") return
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.roundTimer = null
    if (round.phase === "drawing") {
      round.phase = "voting"
      for (const entry of round.entries) entry.submitted = true
      // Shuffle once, so anonymous labels stay stable for the whole room.
      for (let i = round.entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[round.entries[i], round.entries[j]] = [round.entries[j], round.entries[i]]
      }
      this.state.roundStartedAt = Date.now()
      round.deadline = Date.now() + 30000
      if (this.drawVoteBallotsComplete()) {
        await this.advanceDrawVotePhase()
        return
      }
      this.startRoundTimer(30000)
    } else {
      round.phase = "results"
      round.deadline = null
      this.state.roundStartedAt = null
      this.state.status = "round-end"
      for (const entryId of Object.values(round.votes)) {
        const entry = round.entries.find((candidate) => candidate.id === entryId)
        const player = entry && this.state.players[entry.authorId]
        if (player) player.score++
      }
      if (this.state.roundNumber >= this.state.totalRounds || Object.keys(this.state.players).length < 3) {
        await this.endGame()
        return
      }
    }
    await this.saveState()
    this.broadcastState()
  }

  drawVoteBallotsComplete(): boolean {
    const round = this.state?.drawVote
    if (!round) return false
    return round.participantIds.every((id) => Boolean(round.votes[id]) ||
      !round.entries.some((entry) => entry.authorId !== id && entry.strokes.length > 0))
  }

  getTelephoneAssignment(playerId: string): TelephoneAssignment | null {
    if (
      !this.state ||
      this.state.mode !== "telephone" ||
      this.state.status !== "playing"
    ) {
      return null
    }

    if (this.state.telephoneStage === 0) {
      return { type: "write-prompt" }
    }

    const playerIndex = this.state.telephonePlayerOrder.indexOf(playerId)
    if (playerIndex === -1) return null

    const chainCount = this.state.telephonePlayerOrder.length
    const chainIndex =
      (playerIndex - this.state.telephoneStage + chainCount) % chainCount
    const chainId = this.state.telephonePlayerOrder[chainIndex]
    const chain = this.state.telephoneChains[chainId]
    const previousEntry = chain?.entries[chain.entries.length - 1]

    if (this.state.telephoneStage % 2 === 1 && previousEntry?.type === "text") {
      return { type: "draw", prompt: previousEntry.text }
    }

    if (this.state.telephoneStage % 2 === 0 && previousEntry?.type === "drawing") {
      return { type: "describe", strokes: previousEntry.strokes }
    }

    return null
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
      conn.send(
        JSON.stringify({
          type: "state",
          state: this.getPublicState(this.isAuthenticated(conn) ? conn.id : undefined),
        })
      )
    }
  }

  send(conn: Party.Connection, message: ServerMessage) {
    conn.send(JSON.stringify(message))
  }

  startRoundTimer(duration: number) {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
    }
    const roundStartedAt = this.state?.roundStartedAt
    const drawVotePhase = this.state?.drawVote?.phase
    this.roundTimer = setTimeout(async () => {
      if (this.state?.roundStartedAt !== roundStartedAt || this.state?.drawVote?.phase !== drawVotePhase) return
      await this.endRound()
    }, duration)
  }

  async startNewRound() {
    if (!this.state) return

    // Find next drawer - player with fewest draws who hasn't reached roundsPerPlayer
    const players = Object.values(this.state.players)
    const eligibleDrawers = players.filter((p) => p.drawCount < this.state!.roundsPerPlayer)

    if (eligibleDrawers.length === 0) {
      // All players have drawn their required rounds, game over
      await this.endGame()
      return
    }

    // Pick player with fewest draws, then by join order
    eligibleDrawers.sort((a, b) => {
      if (a.drawCount !== b.drawCount) return a.drawCount - b.drawCount
      return a.joinedAt - b.joinedAt
    })
    const drawer = eligibleDrawers[0]

    // Increment drawer's draw count
    drawer.drawCount++

    // Reset round state
    this.state.currentDrawerId = drawer.id
    this.state.currentWord = getRandomWord(this.state.mode, this.state.usedWords)
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
      const isDrawer = this.isAuthenticated(conn) && conn.id === drawer.id
      this.send(conn, {
        type: "round-started",
        drawerId: drawer.id,
        word: isDrawer ? this.state.currentWord : null,
        wordLength: normalizeAnswer(this.state.currentWord!).length,
      })
    }

    this.broadcastState()

    // Start round timer
    this.startRoundTimer(this.state.roundTimeLimit * 1000)
  }

  async startTelephoneGame() {
    if (!this.state) return

    const players = Object.values(this.state.players)
      .filter((player) => player.connected !== false)
      .sort(
      (a, b) => a.joinedAt - b.joinedAt
      )
    this.state.telephonePlayerOrder = players.map((player) => player.id)
    this.state.telephoneChains = Object.fromEntries(
      players.map((player) => [
        player.id,
        {
          id: player.id,
          originPlayerId: player.id,
          originPlayerName: player.name,
          entries: [],
        },
      ])
    )
    this.state.telephoneStage = 0
    this.state.telephoneSubmittedIds = []
    this.state.telephoneRevealChainIndex = 0
    this.state.telephoneRevealEntryIndex = 0
    this.state.telephoneRevealComplete = false
    this.state.telephoneReactions = {}
    this.state.status = "playing"
    this.state.roundNumber = 1
    this.state.totalRounds = players.length
    this.state.roundStartedAt = Date.now()

    await this.saveState()
    this.broadcastState()
    this.startRoundTimer(this.state.roundTimeLimit * 1000)
  }

  getTelephoneChainForPlayer(playerId: string): TelephoneChain | null {
    if (!this.state) return null

    const playerIndex = this.state.telephonePlayerOrder.indexOf(playerId)
    if (playerIndex === -1) return null

    const chainCount = this.state.telephonePlayerOrder.length
    const chainIndex =
      (playerIndex - this.state.telephoneStage + chainCount) % chainCount
    const chainId = this.state.telephonePlayerOrder[chainIndex]
    return this.state.telephoneChains[chainId] ?? null
  }

  addTelephoneEntry(
    playerId: string,
    entry:
      | { type: "text"; text: string }
      | { type: "drawing"; strokes: Stroke[] }
  ) {
    if (!this.state) return

    const player = this.state.players[playerId]
    const originalChain = this.state.telephoneChains[playerId]
    const chain = this.getTelephoneChainForPlayer(playerId)
    if (!chain) return

    chain.entries.push({
      ...entry,
      authorId: playerId,
      authorName: player?.name ?? originalChain?.originPlayerName ?? "Player",
    } as TelephoneEntry)
    this.state.telephoneSubmittedIds.push(playerId)
  }

  async submitTelephoneEntry(
    playerId: string,
    submission: Extract<ClientMessage, { type: "telephone-submit" }>
  ) {
    if (
      !this.state ||
      this.state.mode !== "telephone" ||
      this.state.status !== "playing" ||
      submission.stage !== this.state.telephoneStage ||
      !this.state.telephonePlayerOrder.includes(playerId) ||
      this.state.telephoneSubmittedIds.includes(playerId)
    ) {
      return
    }

    if (this.state.telephoneStage % 2 === 1) {
      const strokes = sanitizeStrokes(submission.strokes)
      this.addTelephoneEntry(playerId, { type: "drawing", strokes })
    } else {
      const text = submission.text?.trim().slice(0, 120)
      if (!text) return
      this.addTelephoneEntry(playerId, { type: "text", text })
    }

    if (
      this.state.telephoneSubmittedIds.length ===
      this.state.telephonePlayerOrder.length
    ) {
      await this.advanceTelephoneStage()
    } else {
      await this.saveState()
      this.broadcastState()
    }
  }

  async advanceTelephoneStage() {
    if (!this.state || this.state.mode !== "telephone") return

    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
      this.roundTimer = null
    }

    const missingPlayers = this.state.telephonePlayerOrder.filter(
      (id) => !this.state!.telephoneSubmittedIds.includes(id)
    )
    for (const playerId of missingPlayers) {
      if (this.state.telephoneStage % 2 === 1) {
        this.addTelephoneEntry(playerId, { type: "drawing", strokes: [] })
      } else {
        this.addTelephoneEntry(playerId, { type: "text", text: "No description" })
      }
    }

    if (this.state.telephoneStage + 1 >= this.state.telephonePlayerOrder.length) {
      await this.endGame()
      return
    }

    this.state.telephoneStage++
    this.state.roundNumber = this.state.telephoneStage + 1
    this.state.telephoneSubmittedIds = []
    this.state.roundStartedAt = Date.now()

    for (const playerId of this.state.telephonePlayerOrder) {
      if (!this.state.players[playerId]) {
        if (this.state.telephoneStage % 2 === 1) {
          this.addTelephoneEntry(playerId, { type: "drawing", strokes: [] })
        } else {
          this.addTelephoneEntry(playerId, { type: "text", text: "No description" })
        }
      }
    }

    if (
      this.state.telephoneSubmittedIds.length ===
      this.state.telephonePlayerOrder.length
    ) {
      await this.advanceTelephoneStage()
      return
    }

    await this.saveState()
    this.broadcastState()
    this.startRoundTimer(this.state.roundTimeLimit * 1000)
  }

  async endRound() {
    if (!this.state || this.state.status !== "playing") return

    if (this.state.mode === "draw-vote") {
      await this.advanceDrawVotePhase()
      return
    }

    if (this.state.mode === "telephone") {
      await this.advanceTelephoneStage()
      return
    }

    if (this.roundTimer) {
      clearTimeout(this.roundTimer)
      this.roundTimer = null
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
    if (this.state.mode === "telephone") {
      this.state.telephoneRevealChainIndex = 0
      this.state.telephoneRevealEntryIndex = 0
      this.state.telephoneRevealComplete = false
    }
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
    const gameNight = await validateGameNightConnection(this.room, conn, ctx, "drawing")
    if (gameNight.mode === "invalid") {
      conn.close(1008, "Invalid Game Night connection")
      return
    }
    if (gameNight.mode === "game-night") this.gameNightMembers.set(conn, gameNight.member)
    const roundTimeLimit = parseInt(url.searchParams.get("roundTimeLimit") || "60", 10)
    const roundsPerPlayer = parseInt(url.searchParams.get("roundsPerPlayer") || "1", 10)
    const requestedMode = url.searchParams.get("mode")
    const mode: DrawingGameMode =
      requestedMode === "telephone" ||
      requestedMode === "draw-vote" ||
      requestedMode === "league-of-legends" ||
      requestedMode === "valorant"
        ? requestedMode
        : "classic"
    const playerToken = url.searchParams.get("playerToken") || ""
    if (playerToken) this.connectionTokens.set(conn, playerToken)

    if (
      !this.state &&
      (gameNight.mode === "game-night" ? gameNight.member.isHost : isHost)
    ) {
      this.state = {
        roomCode: this.room.id,
        mode,
        hostId: conn.id,
        players: {},
        status: "waiting",
        maxPlayers: 8,
        currentDrawerId: null,
        currentWord: null,
        roundNumber: 0,
        totalRounds: 0, // Will be calculated when game starts
        roundsPerPlayer: mode === "draw-vote" ? ([1, 2, 3].includes(roundsPerPlayer) ? roundsPerPlayer : 1) : roundsPerPlayer,
        roundStartedAt: null,
        roundTimeLimit: mode === "draw-vote" ? ([30, 60, 90, 120].includes(roundTimeLimit) ? roundTimeLimit : 60) : roundTimeLimit,
        strokes: [],
        guesses: [],
        usedWords: [],
        correctGuessers: [],
        telephoneStage: 0,
        telephonePlayerOrder: [],
        telephoneSubmittedIds: [],
        telephoneChains: {},
        telephoneRevealChainIndex: 0,
        telephoneRevealEntryIndex: 0,
        telephoneRevealComplete: false,
        telephoneReactions: {},
        playerTokens: {},
        drawVote: null,
      }
      await this.saveState()
    }

    if (!this.state) {
      this.send(conn, { type: "error", message: "Game not found" })
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return

    try {
      const data: ClientMessage = JSON.parse(message)

      if (data.type !== "join" && !this.isAuthenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }

      switch (data.type) {
        case "join": {
          // A reconnect, not a new player. broadcastState is per-connection,
          // so a returning drawer gets the word back and guessers do not.
          const playerToken = this.connectionTokens.get(sender)
          if (!playerToken) {
            this.send(sender, { type: "error", message: "Invalid player session" })
            return
          }

          const member = this.gameNightMembers.get(sender)
          const playerName = member?.name ?? data.name
          const returningPlayer = this.state.players[sender.id]
          const expectedToken = this.state.playerTokens[sender.id]
          if (returningPlayer && expectedToken !== playerToken) {
            this.send(sender, { type: "error", message: "Invalid player session" })
            return
          }

          const returning = markConnected(this.state.players, sender.id)
          if (returning) {
            this.state.playerTokens[sender.id] = playerToken
            returning.name = playerName || returning.name
            await this.saveState()
            this.broadcast({ type: "player-joined", player: returning })
            this.broadcastState()
            break
          }

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
            name: playerName,
            score: 0,
            hasDrawn: false,
            hasGuessedCorrectly: false,
            joinedAt: Date.now(),
            connected: true,
            drawCount: 0,
            lastGuessAt: 0,
          }

          this.state.players[sender.id] = player
          this.state.playerTokens[sender.id] = playerToken
          // Total rounds = number of players * rounds per player
          this.state.totalRounds =
            this.state.mode === "draw-vote" ? this.state.roundsPerPlayer : this.state.mode === "telephone"
              ? Object.keys(this.state.players).length
              : Object.keys(this.state.players).length * this.state.roundsPerPlayer
          await this.saveState()

          this.broadcast({ type: "player-joined", player })
          this.broadcastState()
          break
        }

        case "start": {
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can start" })
            return
          }

          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }

          const availablePlayers = Object.values(this.state.players).filter(
            (player) => player.connected !== false
          )
          const minimumPlayers = this.state.mode === "telephone" || this.state.mode === "draw-vote" ? 3 : 2
          if (availablePlayers.length < minimumPlayers) {
            this.send(sender, {
              type: "error",
              message: `Need at least ${minimumPlayers} players`,
            })
            return
          }

          for (const player of Object.values(this.state.players)) {
            if (player.connected === false) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            }
          }

          if (this.state.mode === "telephone") {
            await this.startTelephoneGame()
          } else if (this.state.mode === "draw-vote") {
            this.state.totalRounds = this.state.roundsPerPlayer
            await this.startDrawVoteRound()
          } else {
            // Total rounds = number of players * rounds per player
            this.state.totalRounds = Object.keys(this.state.players).length * this.state.roundsPerPlayer
            await this.saveState()
            await this.startNewRound()
          }
          break
        }

        case "draw": {
          if (
            !isDrawingAndGuessingMode(this.state.mode) ||
            this.state.status !== "playing" ||
            sender.id !== this.state.currentDrawerId
          ) {
            this.send(sender, { type: "canvas-state", strokes: this.state.strokes })
            return
          }

          this.state.strokes.push(data.stroke)
          await this.saveState()

          this.broadcast({ type: "canvas-state", strokes: this.state.strokes })
          break
        }

        case "undo": {
          if (
            !isDrawingAndGuessingMode(this.state.mode) ||
            this.state.status !== "playing" ||
            sender.id !== this.state.currentDrawerId ||
            this.state.strokes.length === 0
          ) {
            this.send(sender, {
              type: "canvas-state",
              strokes: this.state.strokes,
              undoRequestId: data.requestId,
            })
            return
          }

          this.state.strokes.pop()
          await this.saveState()
          this.broadcast({
            type: "canvas-state",
            strokes: this.state.strokes,
            undoRequestId: data.requestId,
          })
          break
        }

        case "clear": {
          if (
            !isDrawingAndGuessingMode(this.state.mode) ||
            this.state.status !== "playing" ||
            sender.id !== this.state.currentDrawerId
          ) {
            this.send(sender, { type: "canvas-state", strokes: this.state.strokes })
            return
          }

          this.state.strokes = []
          await this.saveState()

          this.broadcast({ type: "canvas-state", strokes: this.state.strokes })
          break
        }

        case "guess": {
          if (!isDrawingAndGuessingMode(this.state.mode)) return
          if (this.state.status !== "playing") return
          if (sender.id === this.state.currentDrawerId) return // Drawer can't guess

          const player = this.state.players[sender.id]
          if (!player || player.hasGuessedCorrectly) return // Already guessed correctly

          // Check 3-second cooldown
          const now = Date.now()
          const cooldownMs = 3000
          if (player.lastGuessAt && now - player.lastGuessAt < cooldownMs) {
            this.send(sender, { type: "error", message: "Please wait before guessing again" })
            return
          }

          // Update last guess timestamp
          player.lastGuessAt = now

          const guessText = normalizeAnswer(data.text)
          const correctWord = this.state.currentWord
            ? normalizeAnswer(this.state.currentWord)
            : undefined
          const isCorrect = guessText === correctWord

          const guess: Guess = {
            playerId: sender.id,
            playerName: player.name,
            text: data.text.trim(),
            isCorrect,
            timestamp: now,
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

        case "draw-vote-edit":
        case "draw-vote-submit":
        case "draw-vote-vote":
        case "draw-vote-next": {
          const round = this.state.drawVote
          if (this.state.mode !== "draw-vote" || !round || data.round !== this.state.roundNumber ||
            !this.state.players[sender.id]) return
          if (round.deadline && Date.now() >= round.deadline) {
            await this.advanceDrawVotePhase()
            return
          }
          if (data.type === "draw-vote-next") {
            if (round.phase !== "results" || this.state.status !== "round-end" ||
              !canControlGame(this.state.players, this.state.hostId, sender.id)) return
            await this.startDrawVoteRound()
            return
          }
          if (this.state.status !== "playing" || !round.participantIds.includes(sender.id)) return
          if (data.type === "draw-vote-vote") {
            const entry = round.entries.find((candidate) => candidate.id === data.entryId)
            if (round.phase !== "voting" || round.votes[sender.id] || !entry ||
              entry.authorId === sender.id || entry.strokes.length === 0) return
            round.votes[sender.id] = entry.id
            if (this.drawVoteBallotsComplete()) {
              await this.advanceDrawVotePhase()
              return
            }
          } else {
            const entry = round.entries.find((candidate) => candidate.authorId === sender.id)
            if (round.phase !== "drawing" || !entry || entry.submitted) return
            if (data.type === "draw-vote-edit") {
              if (data.action === "stroke") {
                const stroke = sanitizeStrokes([data.stroke])[0]
                if (!stroke || entry.strokes.length >= 1000) return
                entry.strokes.push(stroke)
              } else if (data.action === "undo") entry.strokes.pop()
              else if (data.action === "clear") entry.strokes = []
              else return
              entry.revision++
              await this.saveState()
              this.send(sender, { type: "state", state: this.getPublicState(sender.id) })
              return
            }
            entry.submitted = true
            if (round.entries.every((candidate) => candidate.submitted)) {
              await this.advanceDrawVotePhase()
              return
            }
          }
          await this.saveState()
          this.broadcastState()
          break
        }

        case "telephone-submit": {
          await this.submitTelephoneEntry(sender.id, data)
          break
        }

        case "telephone-reveal-next": {
          if (
            this.state.mode !== "telephone" ||
            this.state.status !== "finished" ||
            this.state.telephoneRevealComplete
          ) {
            return
          }

          if (
            data.chainIndex !== this.state.telephoneRevealChainIndex ||
            data.entryIndex !== this.state.telephoneRevealEntryIndex
          ) {
            return
          }

          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can reveal" })
            return
          }

          const chainId =
            this.state.telephonePlayerOrder[this.state.telephoneRevealChainIndex]
          const chain = this.state.telephoneChains[chainId]
          if (!chain) return

          if (this.state.telephoneRevealEntryIndex + 1 < chain.entries.length) {
            this.state.telephoneRevealEntryIndex++
          } else if (
            this.state.telephoneRevealChainIndex + 1 <
            this.state.telephonePlayerOrder.length
          ) {
            this.state.telephoneRevealChainIndex++
            this.state.telephoneRevealEntryIndex = 0
          } else {
            this.state.telephoneRevealComplete = true
          }

          await this.saveState()
          this.broadcastState()
          break
        }

        case "telephone-react": {
          if (
            this.state.mode !== "telephone" ||
            this.state.status !== "finished" ||
            this.state.telephoneRevealComplete ||
            data.chainIndex !== this.state.telephoneRevealChainIndex ||
            data.entryIndex !== this.state.telephoneRevealEntryIndex ||
            !TELEPHONE_REACTIONS.has(data.emoji)
          ) {
            return
          }

          const player = this.state.players[sender.id]
          if (!player) return

          const reactionKey = `${data.chainIndex}:${data.entryIndex}`
          const reactions = this.state.telephoneReactions[reactionKey] ?? []
          const existingIndex = reactions.findIndex(
            (reaction) => reaction.playerId === sender.id
          )

          if (existingIndex === -1) {
            reactions.push({
              playerId: sender.id,
              playerName: player.name,
              emoji: data.emoji,
            })
          } else if (reactions[existingIndex].emoji === data.emoji) {
            reactions.splice(existingIndex, 1)
          } else {
            reactions[existingIndex] = {
              playerId: sender.id,
              playerName: player.name,
              emoji: data.emoji,
            }
          }

          this.state.telephoneReactions[reactionKey] = reactions
          await this.saveState()
          this.broadcastState()
          break
        }

        case "restart": {
          // Only host can restart, and only when game is finished
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can restart" })
            return
          }

          if (this.state.status !== "finished") {
            this.send(sender, { type: "error", message: "Game is not finished" })
            return
          }

          if (
            this.state.mode === "telephone" &&
            !this.state.telephoneRevealComplete
          ) {
            this.send(sender, { type: "error", message: "Finish the reveal first" })
            return
          }

          // Reset game state to waiting, keeping players and settings
          this.state.status = "waiting"
          this.state.currentDrawerId = null
          this.state.currentWord = null
          this.state.roundNumber = 0
          this.state.roundStartedAt = null
          this.state.strokes = []
          this.state.guesses = []
          this.state.usedWords = []
          this.state.correctGuessers = []
          this.state.telephoneStage = 0
          this.state.telephonePlayerOrder = []
          this.state.telephoneSubmittedIds = []
          this.state.telephoneChains = {}
          this.state.telephoneRevealChainIndex = 0
          this.state.telephoneRevealEntryIndex = 0
          this.state.telephoneRevealComplete = false
          this.state.telephoneReactions = {}
          this.state.drawVote = null

          // Reset player states
          for (const player of Object.values(this.state.players)) {
            player.score = 0
            player.hasDrawn = false
            player.hasGuessedCorrectly = false
            player.drawCount = 0
            player.lastGuessAt = 0
          }

          // Recalculate total rounds
          this.state.totalRounds =
            this.state.mode === "draw-vote" ? this.state.roundsPerPlayer : this.state.mode === "telephone"
              ? Object.keys(this.state.players).length
              : Object.keys(this.state.players).length * this.state.roundsPerPlayer

          await this.saveState()
          this.broadcast({ type: "game-restarted" })
          this.broadcastState()
          break
        }

        case "leave": {
          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]

			  if (Object.keys(this.state.players).length === 0) {
				if (this.roundTimer) clearTimeout(this.roundTimer)
				this.roundTimer = null
				this.state = null
				await this.room.storage.delete("state")
				return
			  }

          if (sender.id === this.state.hostId) {
            const next = nextHost(this.state.players, sender.id)
            if (next) this.state.hostId = next
          }

          if (this.state.mode === "draw-vote" && this.state.drawVote) {
            const round = this.state.drawVote
            round.participantIds = round.participantIds.filter((id) => id !== sender.id)
            if (round.phase === "drawing") {
              round.entries = round.entries.filter((entry) => entry.authorId !== sender.id)
              if (round.entries.every((entry) => entry.submitted)) await this.advanceDrawVotePhase()
            } else if (round.phase === "voting" && this.drawVoteBallotsComplete()) {
              await this.advanceDrawVotePhase()
            }
            if (this.state.status !== "finished" && Object.keys(this.state.players).length < 3 && round.phase === "results") await this.endGame()
          }

          // If drawer leaves during a classic round, end the round
          if (
            isDrawingAndGuessingMode(this.state.mode) &&
            this.state.status === "playing" &&
            sender.id === this.state.currentDrawerId
          ) {
            await this.endRound()
          }

          if (
            this.state.mode === "telephone" &&
            this.state.status === "playing" &&
            this.state.telephonePlayerOrder.includes(sender.id) &&
            !this.state.telephoneSubmittedIds.includes(sender.id)
          ) {
            if (this.state.telephoneStage % 2 === 1) {
              this.addTelephoneEntry(sender.id, { type: "drawing", strokes: [] })
            } else {
              this.addTelephoneEntry(sender.id, {
                type: "text",
                text: "No description",
              })
            }

            if (
              this.state.telephoneSubmittedIds.length ===
              this.state.telephonePlayerOrder.length
            ) {
              await this.advanceTelephoneStage()
            }
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
    this.gameNightMembers.delete(conn)
    if (!this.state) return
	const replacementIsOpen = Array.from(this.room.getConnections()).some(
	  connection => connection.id === conn.id && connection !== conn,
	)
	if (replacementIsOpen) {
	  this.connectionTokens.delete(conn)
	  return
	}

    if (this.state.players[conn.id] && this.isAuthenticated(conn)) {
      markDisconnected(this.state.players, conn.id)

      // The round is deliberately NOT ended when the drawer's socket drops.
      // A brief blip would otherwise cost everyone the round, and the drawer
      // can reconnect and carry on. If they never come back, the existing
      // round timer ends it anyway. An explicit "leave" still ends the round.

      await this.saveState()
      // No "player-left": they may be back shortly and clients remove on that.
      this.broadcastState()
    }
    this.connectionTokens.delete(conn)
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "drawing")
    if (!match) return new Response("Not found", { status: 404 })
    if (!this.state || this.state.status !== "finished") {
      return Response.json({ finished: false, scored: false, winnerIds: [] })
    }
    if (this.state.mode === "telephone") {
      return Response.json({ finished: true, scored: false, winnerIds: [] })
    }
    const players = Object.values(this.state.players)
    const highestScore = Math.max(...players.map((player) => player.score), 0)
    if (this.state.mode === "draw-vote" && highestScore === 0) {
      return Response.json({ finished: true, scored: true, winnerIds: [] })
    }
    return Response.json({
      finished: true,
      scored: true,
      winnerIds: players
        .filter((player) => player.score === highestScore)
        .map((player) => player.id),
    })
  }
}

export default withRoomCleanup(DrawingParty, "drawing")
