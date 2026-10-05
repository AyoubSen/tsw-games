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
import { JoinVerifier, reportDirectResult } from "./shared/account"
import {
  isReaction,
  takeReactionSlot,
  type Reaction,
  type ReactionMessage,
} from "../src/lib/reactions"

// Stroke data for drawing
export interface Stroke {
  points: { x: number; y: number }[]
  color: string
  size: number
  /** "fill" floods the region under its single point; a missing tool is a pen stroke. */
  tool?: "pen" | "fill"
}

/**
 * A line in the round's feed. `guess` is a wrong guess everyone sees,
 * `correct` is the "✓ Name got it" event (its text is never sent), `close` is
 * a near miss only its author sees, and `chat` is talk between the drawer and
 * the players who already got it.
 */
export interface Guess {
  playerId: string
  playerName: string
  text: string
  isCorrect: boolean
  timestamp: number
  kind: "guess" | "correct" | "close" | "chat"
  points?: number
}

export type DrawingGameMode =
  | "classic"
  | "league-of-legends"
  | "valorant"
  | "draw-vote"
  | "telephone"

/** Classic round beats: pick a word, hand off, draw, hold the reveal, land the points. */
export type ClassicStage = "choosing" | "handoff" | "drawing" | "reveal" | "score"

/**
 * Server-paced beats, advanced by the storage alarm so every client sees the
 * same timeline. Client animations are built to fit inside these.
 */
export const DRAW_PACE_MS = {
  /** The drawer picks 1 of 3 words; a random one is taken on timeout. */
  choose: 15000,
  /** "Name is drawing" before the round timer starts. */
  handoff: 2400,
  /** The word is held on screen while the drawing replays. */
  reveal: 5400,
  /** Inside the reveal beat: the replay starts after `replayDelay` and runs for `replay`. */
  replayDelay: 900,
  replay: 3800,
  /** Points float onto the seats. */
  score: 2600,
  /** Telephone reveal: a text entry flips in; a drawing replays and then holds. */
  telephoneText: 3400,
  telephoneDrawing: 7000,
  telephoneReplay: 4200,
  /** Draw & Vote results: each drawing reveals its artist and votes; then the winner. */
  voteEntry: 3600,
  voteSpotlight: 4200,
} as const

/** Letter hints land at these fractions of the drawing time. */
export const HINT_AT = [0.5, 0.75] as const

interface DrawVoteEntry {
  id: string
  authorId: string
  authorName: string
  strokes: Stroke[]
  revision: number
  submitted: boolean
}

interface DrawVoteReveal {
  /** Entry ids, fewest votes first, so the favourite lands last. */
  order: string[]
  /** 0..order.length-1 = that drawing, order.length = spotlight, order.length+1 = done. */
  step: number
  gains: Record<string, number>
}

interface DrawVoteState {
  phase: "drawing" | "voting" | "results"
  deadline: number | null
  participantIds: string[]
  entries: DrawVoteEntry[]
  votes: Record<string, string>
  reveal?: DrawVoteReveal | null
}

export interface PublicDrawVoteState {
  phase: DrawVoteState["phase"]
  deadline: number | null
  participantCount: number
  submittedCount: number
  votedCount: number
  submittedIds: string[]
  draft: Stroke[]
  draftRevision: number
  submitted: boolean
  selectedEntryId: string | null
  canVote: boolean
  /** Results pacing; null outside results. */
  reveal: { order: string[]; step: number; spotlight: boolean; done: boolean } | null
  entries: {
    id: string
    strokes: Stroke[]
    isOwn: boolean
    authorId: string | null
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

/** One finished drawing from a Classic or Draw & Vote round, for the end-of-game gallery. */
export interface GalleryItem {
  id: string
  artistId: string
  artistName: string
  word: string
  round: number
  strokes: Stroke[]
  votes?: number
}

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
  /** Server-only: when the current game started, which keys its result. */
  startedAt?: number
  /** Server-only: player id -> verified account. Kept off Player, which is sent to clients as is. */
  accounts?: Record<string, string>
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
  stage: ClassicStage | null
  /** The current paced beat (classic stage, telephone reveal entry, draw-vote reveal step). */
  beatSeq: number
  beatStartedAt: number | null
  beatEndsAt: number | null
  wordChoices: string[]
  hintIndices: number[]
  hintsGiven: number
  /** Points earned this round; applied to scores when they land. */
  roundGains: Record<string, number>
  gallery: GalleryItem[]
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
  /** The word as guessers see it: letters are null until hinted; spaces and punctuation show. */
  wordMask: (string | null)[]
  roundNumber: number
  totalRounds: number
  roundStartedAt: number | null
  roundTimeLimit: number
  serverNow: number
  stage: ClassicStage | null
  beatSeq: number
  beatStartedAt: number | null
  beatEndsAt: number | null
  /** The drawer's three options while choosing; empty for everyone else. */
  wordChoices: string[]
  roundGains: Record<string, number>
  strokes: Stroke[]
  guesses: Guess[]
  correctGuessers: string[]
  /** Every drawing from the game, sent once it is over. */
  gallery: GalleryItem[]
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
  | { type: "join"; name: string; authToken?: unknown }
  | { type: "start" }
  | { type: "choose-word"; index: number }
  | { type: "draw"; stroke: Stroke }
  | { type: "undo"; requestId: string }
  | { type: "clear" }
  | { type: "guess"; text: string }
  | { type: "react"; reaction: Reaction }
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
  | { type: "canvas-state"; strokes: Stroke[]; undoRequestId?: string }
  | { type: "game-over"; results: PlayerResult[] }
  | { type: "game-restarted" }
  | { type: "error"; message: string }
  | ReactionMessage

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

const GUESS_COOLDOWN_MS = 3000
const CHAT_COOLDOWN_MS = 800
const MAX_STROKES = 1000

function getWordPool(mode: DrawingGameMode): string[] {
  if (mode === "league-of-legends") return LEAGUE_CHAMPIONS
  if (mode === "valorant") return VALORANT_AGENTS
  return DRAWING_WORDS
}

function getRandomWord(mode: DrawingGameMode, usedWords: string[]): string {
  return getWordChoices(mode, usedWords, 1)[0]!
}

/** `count` distinct words, unused ones first. */
function getWordChoices(mode: DrawingGameMode, usedWords: string[], count: number): string[] {
  const words = getWordPool(mode)
  const fresh = shuffle(words.filter((word) => !usedWords.includes(word)))
  const stale = shuffle(words.filter((word) => usedWords.includes(word)))
  return [...fresh, ...stale].slice(0, count)
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

function normalizeAnswer(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "")
}

const isLetter = (char: string) => /[\p{L}\p{N}]/u.test(char)

/** One insertion, deletion or substitution apart. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

function pluralVariants(word: string): string[] {
  const variants = [`${word}s`, `${word}es`]
  if (word.endsWith("s")) variants.push(word.slice(0, -1))
  if (word.endsWith("es")) variants.push(word.slice(0, -2))
  if (word.endsWith("y")) variants.push(`${word.slice(0, -1)}ies`)
  if (word.endsWith("ies")) variants.push(`${word.slice(0, -3)}y`)
  return variants
}

/** A near miss: one edit away, or the plural/singular of the word. */
function isCloseGuess(guess: string, word: string): boolean {
  if (!guess || guess === word || word.length < 3) return false
  return oneEditApart(guess, word) || pluralVariants(word).includes(guess)
}

/** Time-based points for a correct guesser, plus a bonus for being first. */
function guesserPoints(fractionLeft: number, first: boolean): number {
  const base = 50 + 200 * Math.max(0, Math.min(1, fractionLeft))
  return Math.round(base / 5) * 5 + (first ? 50 : 0)
}

/** Per correct guesser, scaled up the more of the room got it. */
function drawerPoints(correct: number, eligible: number): number {
  if (!correct || !eligible) return 0
  return Math.round((correct * 60 * (0.5 + 0.5 * (correct / eligible))) / 5) * 5
}

function isDrawingAndGuessingMode(mode: DrawingGameMode): boolean {
  return mode !== "telephone" && mode !== "draw-vote"
}

function sanitizeStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, MAX_STROKES).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return []

    const stroke = candidate as Partial<Stroke>
    if (!Array.isArray(stroke.points)) return []
    const fill = stroke.tool === "fill"

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
      .map((point) => ({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 }))
    if (fill ? points.length !== 1 : points.length < 2) return []

    const color =
      typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color)
        ? stroke.color.toLowerCase()
        : "#000000"
    const size = Number.isFinite(stroke.size)
      ? Math.min(64, Math.max(1, stroke.size!))
      : 8

    return [fill ? { points, color, size, tool: "fill" as const } : { points, color, size }]
  })
}

class DrawingParty implements Party.Server {
  constructor(readonly room: Party.Room) {
    this.joins = new JoinVerifier(room)
  }
  joins: JoinVerifier

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  reactedAt = new Map<string, number>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (stored) {
      this.state = {
        ...stored,
        mode: stored.mode ?? "classic",
        guesses: (stored.guesses ?? []).map((guess) => ({
          ...guess,
          kind: guess.kind ?? (guess.isCorrect ? "correct" : "guess"),
          text: guess.isCorrect ? "" : guess.text,
        })),
        stage: stored.stage ?? null,
        beatSeq: stored.beatSeq ?? 0,
        beatStartedAt: stored.beatStartedAt ?? null,
        beatEndsAt: stored.beatEndsAt ?? null,
        wordChoices: stored.wordChoices ?? [],
        hintIndices: stored.hintIndices ?? [],
        hintsGiven: stored.hintsGiven ?? 0,
        roundGains: stored.roundGains ?? {},
        gallery: stored.gallery ?? [],
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
      // A classic round persisted before stages existed carries on as a drawing round.
      if (
        isDrawingAndGuessingMode(this.state.mode) &&
        this.state.status === "playing" &&
        !this.state.stage &&
        this.state.roundStartedAt
      ) {
        this.state.stage = "drawing"
        this.state.beatStartedAt = this.state.roundStartedAt
        this.state.beatEndsAt = this.state.roundStartedAt + this.state.roundTimeLimit * 1000
      }
      for (const player of Object.values(this.state.players)) {
        player.connected = false
      }
      await this.saveState()
      await this.scheduleAlarm()
    }
  }

  async saveState() {
    if (this.state) {
      await this.room.storage.put("state", this.state)
    }
  }

  /** Persist, broadcast and re-arm the alarm after a change. */
  async commit() {
    await this.saveState()
    this.broadcastState()
    await this.scheduleAlarm()
  }

  isAuthenticated(conn: Party.Connection): boolean {
    if (!this.state) return false
    const token = this.connectionTokens.get(conn)
    return Boolean(token && this.state.playerTokens[conn.id] === token)
  }

  // ─── Pacing ──────────────────────────────────────────────────────────────

  setBeat(duration: number | null) {
    if (!this.state) return
    const now = Date.now()
    this.state.beatSeq++
    this.state.beatStartedAt = now
    this.state.beatEndsAt = duration === null ? null : now + duration
  }

  /** The one storage alarm drives every timer: stages, hints, deadlines and reveal beats. */
  nextDueAt(): number | null {
    const s = this.state
    if (!s) return null
    if (s.mode === "draw-vote") {
      const round = s.drawVote
      if (!round) return null
      if (round.phase === "results") return round.reveal && s.status === "round-end" ? s.beatEndsAt : null
      return s.status === "playing" ? round.deadline : null
    }
    if (s.mode === "telephone") {
      if (s.status === "playing" && s.roundStartedAt) return s.roundStartedAt + s.roundTimeLimit * 1000
      if (s.status === "finished" && !s.telephoneRevealComplete) return s.beatEndsAt
      return null
    }
    if ((s.status !== "playing" && s.status !== "round-end") || !s.beatEndsAt) return null
    const hint = s.stage === "drawing" ? this.nextHintAt() : null
    return hint !== null ? Math.min(hint, s.beatEndsAt) : s.beatEndsAt
  }

  nextHintAt(): number | null {
    const s = this.state
    if (!s?.roundStartedAt || s.hintsGiven >= HINT_AT.length) return null
    return s.roundStartedAt + s.roundTimeLimit * 1000 * HINT_AT[s.hintsGiven]!
  }

  async scheduleAlarm() {
    const at = this.nextDueAt()
    if (at) await this.room.storage.setAlarm(Math.max(Date.now() + 10, at))
    else await this.room.storage.deleteAlarm()
  }

  async onAlarm() {
    const s = this.state
    if (!s) return
    const now = Date.now()
    const due = (at: number | null | undefined) => at != null && now >= at - 50

    if (s.mode === "draw-vote") {
      const round = s.drawVote
      if (round?.phase === "results" && s.status === "round-end" && due(s.beatEndsAt)) {
        await this.advanceDrawVoteReveal()
        return
      }
      if (round && round.phase !== "results" && s.status === "playing" && due(round.deadline)) {
        await this.advanceDrawVotePhase()
        return
      }
    } else if (s.mode === "telephone") {
      if (s.status === "playing" && s.roundStartedAt && due(s.roundStartedAt + s.roundTimeLimit * 1000)) {
        await this.advanceTelephoneStage()
        return
      }
      if (s.status === "finished" && !s.telephoneRevealComplete && due(s.beatEndsAt)) {
        this.stepTelephoneReveal()
        await this.commit()
        return
      }
    } else if (s.status === "playing" || s.status === "round-end") {
      if (s.stage === "drawing" && due(this.nextHintAt()) && !due(s.beatEndsAt)) {
        this.giveHint()
        await this.commit()
        return
      }
      if (due(s.beatEndsAt)) {
        await this.advanceStage()
        return
      }
    }
    await this.scheduleAlarm()
  }

  // ─── Public state ────────────────────────────────────────────────────────

  getPublicState(forPlayerId?: string): PublicGameState {
    if (!this.state) {
      throw new Error("No game state")
    }
    const s = this.state

    const isDrawer = forPlayerId === s.currentDrawerId
    const revealing = s.stage === "reveal" || s.stage === "score"
    // Show the word to everyone during the reveal, or to the drawer while playing
    const showWord =
      revealing ||
      (s.status === "finished" && isDrawingAndGuessingMode(s.mode)) ||
      isDrawer ||
      Boolean(forPlayerId && s.correctGuessers.includes(forPlayerId)) ||
      s.mode === "draw-vote"
    const telephoneChains = s.telephonePlayerOrder
      .map((id) => s.telephoneChains[id])
      .filter((chain): chain is TelephoneChain => Boolean(chain))
    const revealedTelephoneChains = s.telephoneRevealComplete
      ? telephoneChains
      : telephoneChains
          .slice(0, s.telephoneRevealChainIndex + 1)
          .map((chain, index) => ({
            ...chain,
            entries:
              index < s.telephoneRevealChainIndex
                ? chain.entries
                : chain.entries.slice(0, s.telephoneRevealEntryIndex + 1),
          }))
    const reactionKey = `${s.telephoneRevealChainIndex}:${s.telephoneRevealEntryIndex}`
    const word = s.currentWord ?? ""
    const inCircle = Boolean(forPlayerId && (isDrawer || s.correctGuessers.includes(forPlayerId)))
    const guesses = s.guesses.filter((guess) =>
      guess.kind === "close"
        ? guess.playerId === forPlayerId
        : guess.kind === "chat"
          ? inCircle || revealing
          : true
    )

    return {
      roomCode: s.roomCode,
      mode: s.mode,
      hostId: s.hostId,
      canControl: forPlayerId
        ? canControlGame(s.players, s.hostId, forPlayerId)
        : false,
      players: s.players,
      status: s.status,
      maxPlayers: s.maxPlayers,
      currentDrawerId: s.currentDrawerId,
      currentWord: showWord ? s.currentWord : null,
      wordLength: s.currentWord ? normalizeAnswer(s.currentWord).length : 0,
      wordMask: [...word].map((char, index) =>
        !isLetter(char) || s.hintIndices.includes(index) ? char : null
      ),
      roundNumber: s.roundNumber,
      totalRounds: s.totalRounds,
      roundStartedAt: s.roundStartedAt,
      roundTimeLimit: s.roundTimeLimit,
      serverNow: Date.now(),
      stage: s.stage,
      beatSeq: s.beatSeq,
      beatStartedAt: s.beatStartedAt,
      beatEndsAt: s.beatEndsAt,
      wordChoices: isDrawer && s.stage === "choosing" ? s.wordChoices : [],
      roundGains: s.roundGains,
      strokes: s.strokes,
      guesses,
      correctGuessers: s.correctGuessers,
      gallery: s.status === "finished" ? s.gallery : [],
      telephoneStage: s.telephoneStage,
      telephoneTotalStages: s.telephonePlayerOrder.length,
      telephoneSubmittedIds: s.telephoneSubmittedIds,
      telephoneAssignment: forPlayerId
        ? this.getTelephoneAssignment(forPlayerId)
        : null,
      telephoneChains:
        s.mode === "telephone" && s.status === "finished"
          ? revealedTelephoneChains
          : [],
      telephoneRevealChainIndex: s.telephoneRevealChainIndex,
      telephoneRevealEntryIndex: s.telephoneRevealEntryIndex,
      telephoneRevealComplete: s.telephoneRevealComplete,
      telephoneReactions: s.telephoneReactions[reactionKey] ?? [],
      drawVote: this.getPublicDrawVoteState(forPlayerId),
    }
  }

  getPublicDrawVoteState(playerId?: string): PublicDrawVoteState | null {
    const round = this.state?.drawVote
    if (this.state?.mode !== "draw-vote" || !round) return null
    const own = round.entries.find((entry) => entry.authorId === playerId)
    const reveal = round.phase === "results" ? round.reveal ?? null : null
    // An entry's artist and votes stay hidden until its reveal beat.
    const shown = (entryId: string) =>
      round.phase === "results" && (!reveal || reveal.order.indexOf(entryId) <= reveal.step)
    return {
      phase: round.phase,
      deadline: round.deadline,
      participantCount: round.participantIds.length,
      submittedCount: round.entries.filter((entry) => entry.submitted).length,
      votedCount: Object.keys(round.votes).length,
      submittedIds: round.entries.filter((entry) => entry.submitted).map((entry) => entry.authorId),
      draft: own?.strokes ?? [],
      draftRevision: own?.revision ?? 0,
      submitted: own?.submitted ?? false,
      selectedEntryId: playerId ? round.votes[playerId] ?? null : null,
      canVote: Boolean(playerId && round.phase === "voting" &&
        round.participantIds.includes(playerId) && !round.votes[playerId] &&
        round.entries.some((entry) => entry.authorId !== playerId && entry.strokes.length > 0)),
      reveal: reveal && {
        order: reveal.order,
        step: reveal.step,
        spotlight: reveal.step === reveal.order.length,
        done: reveal.step > reveal.order.length,
      },
      entries: round.phase === "drawing" ? [] : round.entries
        .filter((entry) => entry.strokes.length > 0)
        .map((entry) => ({
          id: entry.id,
          strokes: entry.strokes,
          isOwn: entry.authorId === playerId,
          authorId: shown(entry.id) ? entry.authorId : null,
          authorName: shown(entry.id) ? entry.authorName : null,
          votes: shown(entry.id) ? Object.values(round.votes).filter((id) => id === entry.id).length : null,
        })),
    }
  }

  // ─── Draw & Vote ─────────────────────────────────────────────────────────

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
    this.state.roundGains = {}
    this.state.drawVote = {
      phase: "drawing",
      deadline: Date.now() + this.state.roundTimeLimit * 1000,
      participantIds: players.map((player) => player.id),
      entries: players.map((player) => ({
        id: crypto.randomUUID(), authorId: player.id, authorName: player.name,
        strokes: [], revision: 0, submitted: false,
      })),
      votes: {},
      reveal: null,
    }
    await this.commit()
  }

  async advanceDrawVotePhase() {
    const round = this.state?.drawVote
    if (!this.state || this.state.mode !== "draw-vote" || !round || round.phase === "results") return
    if (round.phase === "drawing") {
      round.phase = "voting"
      for (const entry of round.entries) entry.submitted = true
      // Shuffle once, so anonymous labels stay stable for the whole room.
      round.entries = shuffle(round.entries)
      this.state.roundStartedAt = Date.now()
      round.deadline = Date.now() + 30000
      if (this.drawVoteBallotsComplete()) {
        await this.advanceDrawVotePhase()
        return
      }
    } else {
      round.phase = "results"
      round.deadline = null
      this.state.roundStartedAt = null
      this.state.status = "round-end"
      const tally = (entryId: string) => Object.values(round.votes).filter((id) => id === entryId).length
      const drawn = round.entries.filter((entry) => entry.strokes.length > 0)
      const gains: Record<string, number> = {}
      for (const entry of drawn) if (tally(entry.id)) gains[entry.authorId] = tally(entry.id)
      // Fewest votes first; the current shuffle breaks ties.
      const order = [...drawn].sort((left, right) => tally(left.id) - tally(right.id)).map((entry) => entry.id)
      round.reveal = { order, step: 0, gains }
      for (const entry of drawn) {
        this.state.gallery.push({
          id: entry.id,
          artistId: entry.authorId,
          artistName: entry.authorName,
          word: this.state.currentWord ?? "",
          round: this.state.roundNumber,
          strokes: entry.strokes,
          votes: tally(entry.id),
        })
      }
      if (order.length === 0) {
        await this.finishDrawVoteReveal()
        return
      }
      this.setBeat(DRAW_PACE_MS.voteEntry)
    }
    await this.commit()
  }

  async advanceDrawVoteReveal() {
    const round = this.state?.drawVote
    const reveal = round?.reveal
    if (!this.state || !round || !reveal || round.phase !== "results") return
    reveal.step++
    if (reveal.step < reveal.order.length) {
      this.setBeat(DRAW_PACE_MS.voteEntry)
    } else if (reveal.step === reveal.order.length && Object.keys(reveal.gains).length > 0) {
      this.setBeat(DRAW_PACE_MS.voteSpotlight)
    } else {
      await this.finishDrawVoteReveal()
      return
    }
    await this.commit()
  }

  /** Votes become points, then the host moves on (or the game ends). */
  async finishDrawVoteReveal() {
    const round = this.state?.drawVote
    if (!this.state || !round?.reveal) return
    round.reveal.step = round.reveal.order.length + 1
    this.state.roundGains = round.reveal.gains
    for (const [id, points] of Object.entries(round.reveal.gains)) {
      const player = this.state.players[id]
      if (player) player.score += points
    }
    this.setBeat(null)
    if (this.state.roundNumber >= this.state.totalRounds || Object.keys(this.state.players).length < 3) {
      await this.endGame()
      return
    }
    await this.commit()
  }

  drawVoteBallotsComplete(): boolean {
    const round = this.state?.drawVote
    if (!round) return false
    return round.participantIds.every((id) => Boolean(round.votes[id]) ||
      !round.entries.some((entry) => entry.authorId !== id && entry.strokes.length > 0))
  }

  // ─── Telephone ───────────────────────────────────────────────────────────

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

    const chain = this.getTelephoneChainForPlayer(playerId)
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

  // ─── Classic ─────────────────────────────────────────────────────────────

  async startNewRound() {
    if (!this.state) return

    // Next drawer: fewest draws, then join order. Someone who is away waits for a later turn.
    const players = Object.values(this.state.players)
    const eligibleDrawers = players.filter(
      (p) => p.drawCount < this.state!.roundsPerPlayer && p.connected !== false
    )

    if (eligibleDrawers.length === 0) {
      await this.endGame()
      return
    }

    eligibleDrawers.sort((a, b) => {
      if (a.drawCount !== b.drawCount) return a.drawCount - b.drawCount
      return a.joinedAt - b.joinedAt
    })
    const drawer = eligibleDrawers[0]!
    drawer.drawCount++

    this.state.currentDrawerId = drawer.id
    this.state.currentWord = null
    this.state.wordChoices = getWordChoices(this.state.mode, this.state.usedWords, 3)
    this.state.roundNumber++
    this.state.roundStartedAt = null
    this.state.strokes = []
    this.state.guesses = []
    this.state.correctGuessers = []
    this.state.hintIndices = []
    this.state.hintsGiven = 0
    this.state.roundGains = {}
    this.state.status = "playing"
    this.state.stage = "choosing"
    for (const player of Object.values(this.state.players)) {
      player.hasGuessedCorrectly = false
    }
    this.setBeat(DRAW_PACE_MS.choose)
    await this.commit()
  }

  async chooseWord(word: string) {
    if (!this.state || this.state.stage !== "choosing") return
    this.state.currentWord = word
    this.state.usedWords.push(word)
    this.state.wordChoices = []
    this.state.stage = "handoff"
    this.setBeat(DRAW_PACE_MS.handoff)
    await this.commit()
  }

  async advanceStage() {
    const s = this.state
    if (!s) return
    switch (s.stage) {
      case "choosing": {
        const choices = s.wordChoices.length ? s.wordChoices : getWordChoices(s.mode, s.usedWords, 1)
        await this.chooseWord(choices[Math.floor(Math.random() * choices.length)]!)
        return
      }
      case "handoff":
        s.stage = "drawing"
        this.setBeat(s.roundTimeLimit * 1000)
        s.roundStartedAt = s.beatStartedAt
        await this.commit()
        return
      case "drawing":
        await this.endRound()
        return
      case "reveal":
        s.stage = "score"
        for (const [id, points] of Object.entries(s.roundGains)) {
          const player = s.players[id]
          if (player) player.score += points
        }
        this.setBeat(DRAW_PACE_MS.score)
        await this.commit()
        return
      case "score":
        await this.startNewRound()
        return
    }
  }

  /** Reveals random hidden letters, never more than half of them in total. */
  giveHint() {
    const s = this.state
    if (!s?.currentWord) return
    s.hintsGiven++
    const letters = [...s.currentWord].flatMap((char, index) => (isLetter(char) ? [index] : []))
    const cap = Math.floor(letters.length / 2)
    const perHint = Math.max(1, Math.round(letters.length / 6))
    const hidden = shuffle(letters.filter((index) => !s.hintIndices.includes(index)))
    const count = Math.min(perHint, cap - s.hintIndices.length)
    if (count > 0) s.hintIndices.push(...hidden.slice(0, count))
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

    await this.commit()
  }

  getTelephoneChainForPlayer(playerId: string): TelephoneChain | null {
    if (!this.state) return null

    const playerIndex = this.state.telephonePlayerOrder.indexOf(playerId)
    if (playerIndex === -1) return null

    const chainCount = this.state.telephonePlayerOrder.length
    const chainIndex =
      (playerIndex - this.state.telephoneStage + chainCount) % chainCount
    const chainId = this.state.telephonePlayerOrder[chainIndex]!
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
      await this.commit()
    }
  }

  async advanceTelephoneStage() {
    if (!this.state || this.state.mode !== "telephone") return

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

    await this.commit()
  }

  /** Beat length for the telephone entry being revealed: drawings replay, then hold. */
  telephoneBeatLength(): number {
    const s = this.state!
    const chain = s.telephoneChains[s.telephonePlayerOrder[s.telephoneRevealChainIndex] ?? ""]
    const entry = chain?.entries[s.telephoneRevealEntryIndex]
    return entry?.type === "drawing" && entry.strokes.length > 0
      ? DRAW_PACE_MS.telephoneDrawing
      : DRAW_PACE_MS.telephoneText
  }

  /** Moves the telephone reveal on by one entry (the alarm, or the host skipping ahead). */
  stepTelephoneReveal() {
    const s = this.state
    if (!s || s.telephoneRevealComplete) return
    const chainId = s.telephonePlayerOrder[s.telephoneRevealChainIndex]
    const chain = chainId ? s.telephoneChains[chainId] : undefined

    if (chain && s.telephoneRevealEntryIndex + 1 < chain.entries.length) {
      s.telephoneRevealEntryIndex++
    } else if (s.telephoneRevealChainIndex + 1 < s.telephonePlayerOrder.length) {
      s.telephoneRevealChainIndex++
      s.telephoneRevealEntryIndex = 0
    } else {
      s.telephoneRevealComplete = true
      this.setBeat(null)
      return
    }
    this.setBeat(this.telephoneBeatLength())
  }

  async endRound() {
    const s = this.state
    if (!s || s.status !== "playing") return

    if (s.mode === "draw-vote") {
      await this.advanceDrawVotePhase()
      return
    }

    if (s.mode === "telephone") {
      await this.advanceTelephoneStage()
      return
    }

    // Nothing was drawn yet (the drawer left while choosing): straight on to the next turn.
    if (s.stage === "choosing" || s.stage === "handoff" || !s.currentWord) {
      await this.startNewRound()
      return
    }

    const drawerId = s.currentDrawerId
    if (drawerId && s.players[drawerId]) {
      const eligible = Object.values(s.players).filter((p) => p.id !== drawerId).length
      const points = drawerPoints(s.correctGuessers.length, eligible)
      if (points) s.roundGains[drawerId] = points
    }
    if (s.strokes.length > 0) {
      s.gallery.push({
        id: `${s.roundNumber}:${drawerId}`,
        artistId: drawerId ?? "",
        artistName: (drawerId && s.players[drawerId]?.name) || "Someone who left",
        word: s.currentWord,
        round: s.roundNumber,
        strokes: s.strokes,
      })
    }
    s.status = "round-end"
    s.stage = "reveal"
    this.setBeat(DRAW_PACE_MS.reveal)
    await this.commit()
  }

  /** Same winners as the Game Night result: top score wins; Telephone has no winner. */
  reportFinish() {
    if (!this.state) return
    const players = Object.values(this.state.players)
    const highestScore = this.state.mode === "telephone" ? 0 : Math.max(...players.map((player) => player.score), 0)
    const accounts = this.state.accounts ?? {}
    void reportDirectResult(this.room, {
      resultId: `drawing:${this.state.roomCode}:${this.state.startedAt}`,
      game: "drawing",
      vsBot: false,
      players: players.map((player) => ({ userId: accounts[player.id], won: highestScore > 0 && player.score === highestScore })),
    })
  }

  async endGame() {
    if (!this.state) return

    this.state.status = "finished"
    this.state.stage = null
    this.setBeat(null)
    if (this.state.mode === "telephone") {
      this.state.telephoneRevealChainIndex = 0
      this.state.telephoneRevealEntryIndex = 0
      this.state.telephoneRevealComplete = false
      this.setBeat(this.telephoneBeatLength())
    }
    await this.saveState()
    this.reportFinish()

    const results: PlayerResult[] = Object.values(this.state.players)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      }))
      .sort((a, b) => b.score - a.score)

    this.broadcast({ type: "game-over", results })
    this.broadcastState()
    await this.scheduleAlarm()
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
        roundsPerPlayer: [1, 2, 3].includes(roundsPerPlayer) ? roundsPerPlayer : 1,
        roundStartedAt: null,
        roundTimeLimit: [30, 60, 90, 120].includes(roundTimeLimit) ? roundTimeLimit : 60,
        strokes: [],
        guesses: [],
        usedWords: [],
        correctGuessers: [],
        stage: null,
        beatSeq: 0,
        beatStartedAt: null,
        beatEndsAt: null,
        wordChoices: [],
        hintIndices: [],
        hintsGiven: 0,
        roundGains: {},
        gallery: [],
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
      if (data.type !== "join") await this.joins.settled(sender)
      if (!this.state) return

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
          const account = await this.joins.verify(sender, data.authToken)
          if (!this.state) return
          const playerName = member?.name ?? account?.displayName ?? data.name
          const returningPlayer = this.state.players[sender.id]
          const expectedToken = this.state.playerTokens[sender.id]
          if (returningPlayer && expectedToken !== playerToken) {
            this.send(sender, { type: "error", message: "Invalid player session" })
            return
          }

          if (account) this.state.accounts = { ...this.state.accounts, [sender.id]: account.userId }
          const returning = markConnected(this.state.players, sender.id)
          if (returning) {
            this.state.playerTokens[sender.id] = playerToken
            // A verified player keeps their profile name even if a later join comes without a token.
            if (member || account || !this.state.accounts?.[sender.id]) returning.name = playerName || returning.name
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

          this.state.startedAt = Date.now()
          if (this.state.mode === "telephone") {
            await this.startTelephoneGame()
          } else if (this.state.mode === "draw-vote") {
            this.state.totalRounds = this.state.roundsPerPlayer
            await this.startDrawVoteRound()
          } else {
            // Total rounds = number of players * rounds per player
            this.state.totalRounds = Object.keys(this.state.players).length * this.state.roundsPerPlayer
            await this.startNewRound()
          }
          break
        }

        case "choose-word": {
          if (
            !isDrawingAndGuessingMode(this.state.mode) ||
            this.state.stage !== "choosing" ||
            sender.id !== this.state.currentDrawerId
          ) return
          const word = this.state.wordChoices[data.index]
          if (word) await this.chooseWord(word)
          break
        }

        case "draw": {
          const stroke = sanitizeStrokes([data.stroke])[0]
          if (
            !isDrawingAndGuessingMode(this.state.mode) ||
            this.state.stage !== "drawing" ||
            sender.id !== this.state.currentDrawerId ||
            !stroke ||
            this.state.strokes.length >= MAX_STROKES
          ) {
            this.send(sender, { type: "canvas-state", strokes: this.state.strokes })
            return
          }

          this.state.strokes.push(stroke)
          await this.saveState()

          this.broadcast({ type: "canvas-state", strokes: this.state.strokes })
          break
        }

        case "undo": {
          if (
            !isDrawingAndGuessingMode(this.state.mode) ||
            this.state.stage !== "drawing" ||
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
            this.state.stage !== "drawing" ||
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
          const s = this.state
          if (!isDrawingAndGuessingMode(s.mode) || s.stage !== "drawing") return
          const player = s.players[sender.id]
          const text = typeof data.text === "string" ? data.text.trim().slice(0, 100) : ""
          if (!player || !text) return

          const now = Date.now()
          const isDrawer = sender.id === s.currentDrawerId
          // The drawer and those who already got it talk among themselves.
          const inCircle = isDrawer || player.hasGuessedCorrectly
          const cooldownMs = inCircle ? CHAT_COOLDOWN_MS : GUESS_COOLDOWN_MS
          if (player.lastGuessAt && now - player.lastGuessAt < cooldownMs) {
            this.send(sender, { type: "error", message: "Please wait before guessing again" })
            return
          }
          player.lastGuessAt = now

          const base = { playerId: sender.id, playerName: player.name, timestamp: now }
          if (inCircle) {
            s.guesses.push({ ...base, text, isCorrect: false, kind: "chat" })
            await this.commit()
            return
          }

          const guessText = normalizeAnswer(text)
          const correctWord = normalizeAnswer(s.currentWord ?? "")

          if (guessText && guessText === correctWord) {
            const first = s.correctGuessers.length === 0
            const fractionLeft = s.beatEndsAt ? (s.beatEndsAt - now) / (s.roundTimeLimit * 1000) : 0
            const points = guesserPoints(fractionLeft, first)
            player.hasGuessedCorrectly = true
            s.correctGuessers.push(sender.id)
            s.roundGains[sender.id] = points
            s.guesses.push({ ...base, text: "", isCorrect: true, kind: "correct", points })

            const waiting = Object.values(s.players).filter(
              (p) => p.id !== s.currentDrawerId && p.connected !== false && !p.hasGuessedCorrectly
            )
            if (waiting.length === 0) {
              await this.endRound()
            } else {
              await this.commit()
            }
            return
          }

          s.guesses.push({
            ...base,
            text,
            isCorrect: false,
            kind: isCloseGuess(guessText, correctWord) ? "close" : "guess",
          })
          await this.commit()
          break
        }

        case "react": {
          if (!this.state.players[sender.id] || !isReaction(data.reaction)) return
          if (!takeReactionSlot(this.reactedAt, sender.id)) return
          this.broadcast({ type: "reaction", playerId: sender.id, reaction: data.reaction })
          break
        }

        case "draw-vote-edit":
        case "draw-vote-submit":
        case "draw-vote-vote":
        case "draw-vote-next": {
          const round = this.state.drawVote
          if (this.state.mode !== "draw-vote" || !round || data.round !== this.state.roundNumber ||
            !this.state.players[sender.id]) return
          if (round.phase !== "results" && round.deadline && Date.now() >= round.deadline) {
            await this.advanceDrawVotePhase()
            return
          }
          if (data.type === "draw-vote-next") {
            if (round.phase !== "results" || this.state.status !== "round-end" ||
              (round.reveal && round.reveal.step <= round.reveal.order.length) ||
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
                if (!stroke || entry.strokes.length >= MAX_STROKES) return
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
          await this.commit()
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

          this.stepTelephoneReveal()
          await this.commit()
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
          } else if (reactions[existingIndex]!.emoji === data.emoji) {
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
          this.state.stage = null
          this.state.beatStartedAt = null
          this.state.beatEndsAt = null
          this.state.wordChoices = []
          this.state.hintIndices = []
          this.state.hintsGiven = 0
          this.state.roundGains = {}
          this.state.gallery = []
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
          await this.scheduleAlarm()
          break
        }

        case "leave": {
          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]

          if (Object.keys(this.state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
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
            if (this.state.status === "round-end" && Object.keys(this.state.players).length < 3 &&
              round.phase === "results" && round.reveal && round.reveal.step > round.reveal.order.length) await this.endGame()
          }

          // The drawer leaving ends their turn (or skips it, if no word was picked yet)
          if (
            isDrawingAndGuessingMode(this.state.mode) &&
            this.state.status === "playing" &&
            sender.id === this.state.currentDrawerId
          ) {
            await this.endRound()
          } else if (
            isDrawingAndGuessingMode(this.state.mode) &&
            this.state.stage === "drawing" &&
            this.state.correctGuessers.length > 0 &&
            Object.values(this.state.players).every(
              (p) => p.id === this.state!.currentDrawerId || p.connected === false || p.hasGuessedCorrectly
            )
          ) {
            // The last player still guessing left; everyone else already has it.
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
          await this.scheduleAlarm()
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
      // can reconnect and carry on. If they never come back, the round timer
      // ends it anyway. An explicit "leave" still ends the round.

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
    if (highestScore === 0) {
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
