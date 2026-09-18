import type * as Party from "partykit/server"
import { isPresent, markConnected, markDisconnected } from "./shared/presence"

export const WORDLE_PROTOCOL_VERSION = 4
const STATE_SCHEMA_VERSION = 4
const MAX_PLAYERS = 8
const MAX_GUESSES = 6
const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000
const LOBBY_DISCONNECT_TTL_MS = 30 * 1000
const RECONNECT_GRACE_MS = 15 * 1000

export type GameMode = "race" | "classic" | "one-lie"
export type RevealMode = "after-round" | "at-end"
export type SeriesLength = 1 | 3 | 5
export type TileState = "correct" | "present" | "absent"

export interface EvaluatedLetter {
  char: string
  state: TileState
}

export interface Player {
  id: string
  name: string
  attempts: number
  completed: boolean
  won: boolean
  guesses: EvaluatedLetter[][]
  joinedAt: number
  connected: boolean
  disconnectedAt: number | null
  graceHandled: boolean
  readyForNextTurn: boolean
}

export interface PublicPlayer {
  id: string
  name: string
  attempts: number
  completed: boolean
  won: boolean
  joinedAt: number
  connected: boolean
  readyForNextTurn: boolean
}

export interface PlayerResult {
  id: string
  name: string
  won: boolean
  attempts: number
}

export interface PrivatePlayerState {
  playerId: string
  guesses: EvaluatedLetter[][]
  attempts: number
  completed: boolean
  won: boolean
}

export interface GameState {
  schemaVersion: number
  revision: number
  roundId: string
  roomCode: string
  mode: GameMode
  revealMode: RevealMode
  hardMode: boolean
  seriesLength: SeriesLength
  seriesRound: number
  seriesScores: Record<string, number>
  seriesWinnerIds: string[]
  seriesComplete: boolean
  hostId: string
  targetWord: string
  /** Players keyed by their private reconnect credential (the PartyKit connection ID). */
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  winnerIds: string[]
  startedAt: number | null
  finishedAt: number | null
  currentTurn: number
  participantIds: string[]
  revealedBoards: Record<string, EvaluatedLetter[][]>
  results: PlayerResult[]
}

export interface PublicGameState {
  protocolVersion: number
  revision: number
  roundId: string
  roomCode: string
  mode: GameMode
  revealMode: RevealMode
  hardMode: boolean
  seriesLength: SeriesLength
  seriesRound: number
  seriesScores: Record<string, number>
  seriesWinnerIds: string[]
  seriesComplete: boolean
  hostId: string
  players: Record<string, PublicPlayer>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  winnerIds: string[]
  winnerId: string | null
  targetWord: string | null
  currentTurn: number
  waitingFor: string[]
  revealedBoards: Record<string, EvaluatedLetter[][]>
  results: PlayerResult[]
}

export type ClientMessage =
  | { type: "join"; protocolVersion: number; name: string }
  | { type: "start"; protocolVersion: number; roundId: string }
  | { type: "guess"; protocolVersion: number; roundId: string; word: string }
  | { type: "leave"; protocolVersion: number }
  | { type: "restart"; protocolVersion: number; roundId: string }

type ServerPayload =
  | { type: "state"; state: PublicGameState }
  | { type: "private-state"; player: PrivatePlayerState }
  | { type: "round-reveal"; turn: number; playerGuesses: Record<string, EvaluatedLetter[][]> }
  | { type: "error"; message: string }

export type ServerMessage = ServerPayload & {
  protocolVersion: number
  revision: number
  roundId: string
}

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
  "speak", "speed", "spend", "spent", "spike", "spine", "spirit", "split", "spoke", "sport",
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
  "young", "youth", "zebra",
]

const WORD_LIST_URLS = [
  "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt",
  "https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/wordle-allowed-guesses.txt",
]

let validWordsPromise: Promise<Set<string>> | null = null

function getValidWords(): Promise<Set<string>> {
  if (validWordsPromise) return validWordsPromise
  validWordsPromise = Promise.all(WORD_LIST_URLS.map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Word list request failed: ${response.status}`)
    return response.text()
  }))
    .then(lists => {
      const words = new Set(ANSWER_WORDS.map(word => word.toUpperCase()))
      for (const list of lists) {
        for (const word of list.split(/[^a-zA-Z]+/)) {
          if (/^[a-zA-Z]{5}$/.test(word)) words.add(word.toUpperCase())
        }
      }
      return words
    })
    .catch(error => {
      console.error("Using bundled Wordle dictionary:", error)
      return new Set(ANSWER_WORDS.map(word => word.toUpperCase()))
    })
  return validWordsPromise
}

function getRandomWord(): string {
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)].toUpperCase()
}

function isGameMode(value: unknown): value is GameMode {
  return value === "race" || value === "classic" || value === "one-lie"
}

function isRevealMode(value: unknown): value is RevealMode {
  return value === "after-round" || value === "at-end"
}

function parseSeriesLength(value: unknown): SeriesLength {
  return value === 3 || value === "3" ? 3 : value === 5 || value === "5" ? 5 : 1
}

function evaluateGuess(guess: string, target: string): EvaluatedLetter[] {
  const result: EvaluatedLetter[] = new Array(5)
  const used = new Array(5).fill(false)

  for (let index = 0; index < 5; index++) {
    if (guess[index] === target[index]) {
      result[index] = { char: guess[index], state: "correct" }
      used[index] = true
    }
  }

  for (let index = 0; index < 5; index++) {
    if (result[index]) continue
    const match = target.split("").findIndex((letter, targetIndex) => letter === guess[index] && !used[targetIndex])
    if (match >= 0) {
      used[match] = true
      result[index] = { char: guess[index], state: "present" }
    } else {
      result[index] = { char: guess[index], state: "absent" }
    }
  }
  return result
}

function applyOneLie(result: EvaluatedLetter[], seed: string): EvaluatedLetter[] {
  const candidates = result
    .map((tile, index) => tile.state === "correct" ? -1 : index)
    .filter(index => index >= 0)
  if (candidates.length === 0) return result

  let hash = 0
  for (const char of seed) hash = Math.imul(31, hash) + char.charCodeAt(0) | 0
  const lieIndex = candidates[Math.abs(hash) % candidates.length]
  return result.map((tile, index) => index === lieIndex
    ? { ...tile, state: tile.state === "present" ? "absent" : "present" }
    : tile)
}

function getHardModeError(word: string, guesses: EvaluatedLetter[][]): string | null {
  const requiredCounts = new Map<string, number>()

  for (const guess of guesses) {
    const rowCounts = new Map<string, number>()
    for (let index = 0; index < guess.length; index++) {
      const tile = guess[index]
      if (tile.state === "correct" && word[index] !== tile.char) {
        return `${tile.char} must stay in position ${index + 1}`
      }
      if (tile.state === "present" && word[index] === tile.char) {
        return `${tile.char} cannot be used in position ${index + 1}`
      }
      if (tile.state === "correct" || tile.state === "present") {
        rowCounts.set(tile.char, (rowCounts.get(tile.char) ?? 0) + 1)
      }
    }
    for (const [char, count] of rowCounts) {
      requiredCounts.set(char, Math.max(requiredCounts.get(char) ?? 0, count))
    }
  }

  for (const [char, count] of requiredCounts) {
    if (word.split(char).length - 1 < count) return `Guess must contain ${char}`
  }
  return null
}

function cloneBoards(boards: Record<string, EvaluatedLetter[][]>): Record<string, EvaluatedLetter[][]> {
  return Object.fromEntries(Object.entries(boards).map(([id, guesses]) => [id, guesses.map(row => row.map(tile => ({ ...tile }))) ]))
}

function isValidEvaluatedGuess(value: unknown): value is EvaluatedLetter[] {
  return Array.isArray(value) && (value.length === 0 || (
    value.length === 5 && value.every(tile => {
      if (!tile || typeof tile !== "object") return false
      const candidate = tile as Partial<EvaluatedLetter>
      return typeof candidate.char === "string" && /^[A-Z]$/.test(candidate.char) &&
        (candidate.state === "correct" || candidate.state === "present" || candidate.state === "absent")
    })
  ))
}

function normalizeStoredState(value: unknown, roomCode: string): GameState | null {
  if (!value || typeof value !== "object") return null
  const stored = value as Partial<GameState>
  if (stored.roomCode !== roomCode || !isGameMode(stored.mode) || !isRevealMode(stored.revealMode)) return null
  if (stored.status !== "waiting" && stored.status !== "playing" && stored.status !== "finished") return null
  if (stored.schemaVersion !== STATE_SCHEMA_VERSION && stored.status !== "waiting") return null
  if (!stored.players || typeof stored.players !== "object" || Array.isArray(stored.players)) return null

  const players: Record<string, Player> = {}
  for (const [credential, raw] of Object.entries(stored.players)) {
    if (!raw || typeof raw !== "object") return null
    const player = raw as Partial<Player>
    if (typeof player.name !== "string" || !Array.isArray(player.guesses) || !player.guesses.every(isValidEvaluatedGuess)) return null
    const wasConnected = player.connected !== false
    players[credential] = {
      id: stored.schemaVersion === STATE_SCHEMA_VERSION && typeof player.id === "string"
        ? player.id
        : crypto.randomUUID(),
      name: player.name.trim().slice(0, 20),
      attempts: player.guesses.length,
      completed: Boolean(player.completed),
      won: Boolean(player.won),
      guesses: player.guesses,
      joinedAt: typeof player.joinedAt === "number" ? player.joinedAt : Date.now(),
      connected: false,
      disconnectedAt: !wasConnected && typeof player.disconnectedAt === "number" ? player.disconnectedAt : Date.now(),
      graceHandled: Boolean(player.graceHandled),
      readyForNextTurn: Boolean(player.readyForNextTurn),
    }
  }

  const storedHost = typeof stored.hostId === "string" ? stored.hostId : ""
  const normalizedHost = Object.values(players).find(player => player.id === storedHost)?.id ??
    players[storedHost]?.id ?? ""

  const targetWord = typeof stored.targetWord === "string" && /^[A-Z]{5}$/.test(stored.targetWord)
    ? stored.targetWord
    : ""
  if (stored.status !== "waiting" && !targetWord) return null

  const revealedBoards: Record<string, EvaluatedLetter[][]> = {}
  if (stored.revealedBoards && typeof stored.revealedBoards === "object") {
    for (const [id, guesses] of Object.entries(stored.revealedBoards)) {
      if (!Array.isArray(guesses) || !guesses.every(isValidEvaluatedGuess)) return null
      revealedBoards[id] = guesses
    }
  }

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision: Number.isInteger(stored.revision) && stored.revision! >= 0 ? stored.revision! : 0,
    roundId: typeof stored.roundId === "string" && stored.roundId ? stored.roundId : crypto.randomUUID(),
    roomCode,
    mode: stored.mode,
    revealMode: stored.mode === "classic" ? stored.revealMode : "at-end",
    hardMode: stored.mode === "one-lie" ? false : Boolean(stored.hardMode),
    seriesLength: parseSeriesLength(stored.seriesLength),
    seriesRound: Number.isInteger(stored.seriesRound) ? Math.max(1, stored.seriesRound!) : 1,
    seriesScores: stored.seriesScores && typeof stored.seriesScores === "object"
      ? Object.fromEntries(Object.entries(stored.seriesScores).filter((entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isInteger(entry[1]) && entry[1] >= 0))
      : {},
    seriesWinnerIds: Array.isArray(stored.seriesWinnerIds)
      ? stored.seriesWinnerIds.filter(id => typeof id === "string")
      : [],
    seriesComplete: Boolean(stored.seriesComplete),
    hostId: normalizedHost,
    targetWord,
    players,
    status: stored.status,
    maxPlayers: MAX_PLAYERS,
    winnerIds: Array.isArray(stored.winnerIds) ? stored.winnerIds.filter(id => typeof id === "string") : [],
    startedAt: typeof stored.startedAt === "number" ? stored.startedAt : null,
    finishedAt: typeof stored.finishedAt === "number" ? stored.finishedAt : null,
    currentTurn: Number.isInteger(stored.currentTurn) ? Math.max(0, Math.min(6, stored.currentTurn!)) : 0,
    participantIds: Array.isArray(stored.participantIds)
      ? stored.participantIds.filter(id => typeof id === "string")
      : Object.values(players).map(player => player.id),
    revealedBoards,
    results: Array.isArray(stored.results) ? stored.results.filter(result =>
      result && typeof result.id === "string" && typeof result.name === "string" &&
      typeof result.won === "boolean" && Number.isInteger(result.attempts)
    ) : [],
  }
}

export default class WordleParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null

  async onStart() {
    void getValidWords()
    const stored = await this.room.storage.get<unknown>("state")
    if (!stored) return
    const normalized = normalizeStoredState(stored, this.room.id)
    if (!normalized) {
      await this.room.storage.delete("state")
      return
    }
    this.state = normalized
    this.pruneDisconnectedPlayers()
    if (Object.keys(this.state.players).length === 0) {
      this.state = null
      await this.room.storage.delete("state")
      await this.room.storage.deleteAlarm()
      return
    }
    await this.saveState()
  }

  async saveState() {
    if (!this.state) return
    await this.room.storage.put("state", this.state)
    await this.scheduleCleanup()
  }

  async scheduleCleanup() {
    if (!this.state) return
    const now = Date.now()
    const deadlines: number[] = []
    if (this.state.status === "waiting" && Object.keys(this.state.players).length === 0) {
      deadlines.push(now + LOBBY_DISCONNECT_TTL_MS)
    }
    for (const player of Object.values(this.state.players)) {
      if (player.connected || player.disconnectedAt === null) continue
      const ttl = this.state.status === "waiting" ? LOBBY_DISCONNECT_TTL_MS : DISCONNECTED_PLAYER_TTL_MS
      if (this.state.status !== "finished") deadlines.push(Math.max(now + 1, player.disconnectedAt + ttl))
      if (!player.graceHandled && this.state.status === "playing") {
        deadlines.push(Math.max(now + 1, player.disconnectedAt + RECONNECT_GRACE_MS))
      }
    }
    const hasConnectedPlayers = Object.values(this.state.players).some(player => player.connected)
    if (this.state.status === "finished" && !hasConnectedPlayers && this.state.finishedAt !== null) {
      deadlines.push(Math.max(now + 1, this.state.finishedAt + DISCONNECTED_PLAYER_TTL_MS))
    }

    if (deadlines.length > 0) await this.room.storage.setAlarm(Math.min(...deadlines))
    else await this.room.storage.deleteAlarm()
  }

  bumpRevision() {
    if (this.state) this.state.revision++
  }

  toPublicPlayer(player: Player): PublicPlayer {
    const hideResult = this.state?.status === "playing" && this.state.mode === "classic" && this.state.revealMode === "at-end"
    return {
      id: player.id,
      name: player.name,
      attempts: hideResult ? 0 : player.attempts,
      completed: hideResult ? false : player.completed,
      won: hideResult ? false : player.won,
      joinedAt: player.joinedAt,
      connected: player.connected,
      readyForNextTurn: player.readyForNextTurn,
    }
  }

  getPublicState(): PublicGameState {
    if (!this.state) throw new Error("No game state")
    const visiblePlayers = this.state.status === "waiting"
      ? Object.values(this.state.players)
      : Object.values(this.state.players).filter(player => this.state!.participantIds.includes(player.id))
    const players = Object.fromEntries(visiblePlayers.map(player => [player.id, this.toPublicPlayer(player)]))
    const waitingFor = this.state.mode === "classic" && this.state.revealMode === "after-round" && this.state.status === "playing"
      ? Object.values(this.state.players)
          .filter(player => this.state!.participantIds.includes(player.id) && player.connected && !player.completed && !player.readyForNextTurn)
          .map(player => player.id)
      : []

    return {
      protocolVersion: WORDLE_PROTOCOL_VERSION,
      revision: this.state.revision,
      roundId: this.state.roundId,
      roomCode: this.state.roomCode,
      mode: this.state.mode,
      revealMode: this.state.revealMode,
      hardMode: this.state.hardMode,
      seriesLength: this.state.seriesLength,
      seriesRound: this.state.seriesRound,
      seriesScores: { ...this.state.seriesScores },
      seriesWinnerIds: [...this.state.seriesWinnerIds],
      seriesComplete: this.state.seriesComplete,
      hostId: this.state.hostId,
      players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      winnerIds: this.state.winnerIds,
      winnerId: this.state.winnerIds[0] ?? null,
      targetWord: this.state.status === "finished" ? this.state.targetWord : null,
      currentTurn: this.state.currentTurn,
      waitingFor,
      revealedBoards: this.state.revealMode === "after-round" || this.state.status === "finished"
        ? cloneBoards(this.state.revealedBoards)
        : {},
      results: this.state.status === "finished" ? this.state.results : [],
    }
  }

  getPrivateState(player: Player): PrivatePlayerState {
    return {
      playerId: player.id,
      guesses: player.guesses.map(row => row.map(tile => ({ ...tile }))),
      attempts: player.attempts,
      completed: player.completed,
      won: player.won,
    }
  }

  makeMessage(payload: ServerPayload): ServerMessage {
    return {
      ...payload,
      protocolVersion: WORDLE_PROTOCOL_VERSION,
      revision: this.state?.revision ?? 0,
      roundId: this.state?.roundId ?? "",
    }
  }

  send(conn: Party.Connection, payload: ServerPayload) {
    try {
      conn.send(JSON.stringify(this.makeMessage(payload)))
    } catch (error) {
      console.error(`Failed to send Wordle message to ${conn.id}:`, error)
    }
  }

  broadcast(payload: ServerPayload) {
    const message = JSON.stringify(this.makeMessage(payload))
    for (const conn of this.room.getConnections()) {
      if (!this.state?.players[conn.id]) continue
      try {
        conn.send(message)
      } catch (error) {
        console.error(`Failed to broadcast Wordle message to ${conn.id}:`, error)
      }
    }
  }

  broadcastState() {
    this.broadcast({ type: "state", state: this.getPublicState() })
  }

  sendResync(conn: Party.Connection) {
    if (!this.state) return
    const player = this.state.players[conn.id]
    if (!player) return
    this.send(conn, { type: "private-state", player: this.getPrivateState(player) })
    this.send(conn, { type: "state", state: this.getPublicState() })
  }

  electHost(excludingId?: string): string {
    if (!this.state) return ""
    const candidates = Object.values(this.state.players)
      .filter(player => player.id !== excludingId && isPresent(player))
      .sort((a, b) => a.joinedAt - b.joinedAt)
    return candidates[0]?.id ?? ""
  }

  pruneDisconnectedPlayers() {
    if (!this.state || this.state.status === "finished") return
    const ttl = this.state.status === "waiting" ? LOBBY_DISCONNECT_TTL_MS : DISCONNECTED_PLAYER_TTL_MS
    const cutoff = Date.now() - ttl
    for (const [credential, player] of Object.entries(this.state.players)) {
      if (player.connected || player.disconnectedAt === null || player.disconnectedAt > cutoff) continue
      delete this.state.players[credential]
      delete this.state.seriesScores[player.id]
      if (player.id === this.state.hostId) this.state.hostId = this.electHost(player.id)
    }
  }

  syncClassicPlayer(player: Player) {
    if (!this.state || this.state.status !== "playing" || this.state.mode !== "classic" || this.state.revealMode !== "after-round") return
    if (player.readyForNextTurn || player.completed) return
    while (player.guesses.length < this.state.currentTurn) player.guesses.push([])
    player.attempts = player.guesses.length
    if (player.attempts >= MAX_GUESSES) player.completed = true
  }

  finishGame(raceWinnerId?: string) {
    if (!this.state || this.state.status !== "playing") return
    const players = Object.values(this.state.players).filter(player => this.state!.participantIds.includes(player.id))
    this.state.status = "finished"
    this.state.finishedAt = Date.now()
    this.state.results = players.map(player => ({
      id: player.id,
      name: player.name,
      won: player.won,
      attempts: player.attempts,
    }))
    this.state.revealedBoards = cloneBoards(Object.fromEntries(players.map(player => [player.id, player.guesses])))

    if (raceWinnerId) {
      this.state.winnerIds = [raceWinnerId]
    } else {
      const winners = players.filter(player => player.won)
      const best = winners.length > 0 ? Math.min(...winners.map(player => player.attempts)) : null
      this.state.winnerIds = best === null ? [] : winners.filter(player => player.attempts === best).map(player => player.id)
    }

    for (const winnerId of this.state.winnerIds) {
      this.state.seriesScores[winnerId] = (this.state.seriesScores[winnerId] ?? 0) + 1
    }
    const winsNeeded = Math.floor(this.state.seriesLength / 2) + 1
    const reachedTarget = Object.values(this.state.seriesScores).some(score => score >= winsNeeded)
    this.state.seriesComplete = this.state.seriesLength === 1 || reachedTarget || this.state.seriesRound >= this.state.seriesLength
    if (this.state.seriesComplete && this.state.seriesLength > 1) {
      const highScore = Math.max(0, ...Object.values(this.state.seriesScores))
      this.state.seriesWinnerIds = highScore === 0
        ? []
        : Object.entries(this.state.seriesScores).filter(([, score]) => score === highScore).map(([id]) => id)
    }
  }

  finishIfEveryoneDone(): boolean {
    if (!this.state || this.state.status !== "playing") return false
    const now = Date.now()
    const activePlayers = Object.values(this.state.players).filter(player =>
      this.state!.participantIds.includes(player.id) && (
        player.connected || (player.disconnectedAt !== null && now - player.disconnectedAt < RECONNECT_GRACE_MS)
      )
    )
    if (activePlayers.length > 0 && activePlayers.every(player => player.completed)) {
      this.finishGame()
      return true
    }
    return false
  }

  advanceClassicRound(): { turn: number; playerGuesses: Record<string, EvaluatedLetter[][]> } | null {
    if (!this.state || this.state.status !== "playing" || this.state.mode !== "classic" || this.state.revealMode !== "after-round") return null
    const now = Date.now()
    const roundPlayers = Object.values(this.state.players).filter(player => this.state!.participantIds.includes(player.id))
    const waiting = roundPlayers.some(player =>
      !player.completed && !player.readyForNextTurn &&
      (player.connected || (player.disconnectedAt !== null && now - player.disconnectedAt < RECONNECT_GRACE_MS))
    )
    const submitted = roundPlayers.filter(player => player.readyForNextTurn)
    if (waiting || submitted.length === 0) {
      this.finishIfEveryoneDone()
      return null
    }

    for (const player of submitted) {
      this.state.revealedBoards[player.id] = player.guesses.map(row => row.map(tile => ({ ...tile })))
      player.readyForNextTurn = false
    }
    this.state.currentTurn = Math.min(MAX_GUESSES, this.state.currentTurn + 1)
    const reveal = { turn: this.state.currentTurn, playerGuesses: cloneBoards(this.state.revealedBoards) }
    if (this.finishIfEveryoneDone()) return null
    return reveal
  }

  canControl(senderId: string): boolean {
    if (!this.state || !this.state.players[senderId] || !isPresent(this.state.players[senderId])) return false
    return this.state.players[senderId].id === this.state.hostId
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    if (url.searchParams.get("protocolVersion") !== String(WORDLE_PROTOCOL_VERSION)) {
      this.send(conn, { type: "error", message: "Wordle was updated. Refresh this page to continue." })
      conn.close(1008, "Incompatible Wordle client")
      return
    }

    const modeParam = url.searchParams.get("mode")
    const revealParam = url.searchParams.get("revealMode")
    const mode = isGameMode(modeParam) ? modeParam : "race"
    const revealMode = mode === "classic" && isRevealMode(revealParam) ? revealParam : mode === "classic" ? "after-round" : "at-end"
    const hardMode = mode !== "one-lie" && url.searchParams.get("hardMode") === "true"
    const seriesLength = parseSeriesLength(url.searchParams.get("seriesLength"))
    const isHost = url.searchParams.get("host") === "true"

    if (isHost && !this.state) {
      this.state = {
        schemaVersion: STATE_SCHEMA_VERSION,
        revision: 1,
        roundId: crypto.randomUUID(),
        roomCode: this.room.id,
        mode,
        revealMode,
        hardMode,
        seriesLength,
        seriesRound: 1,
        seriesScores: {},
        seriesWinnerIds: [],
        seriesComplete: false,
        hostId: "",
        targetWord: "",
        players: {},
        status: "waiting",
        maxPlayers: MAX_PLAYERS,
        winnerIds: [],
        startedAt: null,
        finishedAt: null,
        currentTurn: 0,
        participantIds: [],
        revealedBoards: {},
        results: [],
      }
      await this.saveState()
    }

    if (!this.state) {
      this.send(conn, { type: "error", message: "Game not found" })
      return
    }

    const returning = markConnected(this.state.players, conn.id)
    if (!returning) return
    returning.disconnectedAt = null
    returning.graceHandled = false
    this.syncClassicPlayer(returning)
    const roundReveal = this.advanceClassicRound()
    this.finishIfEveryoneDone()
    this.bumpRevision()
    await this.saveState()
    this.sendResync(conn)
    if (roundReveal) this.broadcast({ type: "round-reveal", ...roundReveal })
    this.broadcastState()
  }

  isCurrentRound(roundId: unknown, sender: Party.Connection): boolean {
    if (this.state && roundId === this.state.roundId) return true
    this.send(sender, { type: "error", message: "That Wordle round is no longer active." })
    this.sendResync(sender)
    return false
  }

  async onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (!this.state) return
    if (typeof message !== "string") {
      this.send(sender, { type: "error", message: "Invalid Wordle message" })
      return
    }

    try {
      const data = JSON.parse(message) as Partial<ClientMessage>
      if (data.protocolVersion !== WORDLE_PROTOCOL_VERSION) {
        this.send(sender, { type: "error", message: "Wordle was updated. Refresh this page to continue." })
        return
      }
      if (data.type !== "join" && !this.state.players[sender.id]) {
        this.send(sender, { type: "error", message: "Join the game before sending actions" })
        return
      }

      switch (data.type) {
        case "join": {
          const name = typeof data.name === "string" ? data.name.trim().slice(0, 20) : ""
          if (!name) {
            this.send(sender, { type: "error", message: "Enter a player name" })
            return
          }

          const returning = this.state.players[sender.id]
          if (returning) {
            returning.connected = true
            returning.disconnectedAt = null
            returning.graceHandled = false
            if (this.state.status !== "finished") returning.name = name
            this.syncClassicPlayer(returning)
          } else {
            if (this.state.status !== "waiting") {
              this.send(sender, { type: "error", message: "Game already started" })
              return
            }
            if (this.state.seriesLength > 1 && this.state.seriesRound > 1) {
              this.send(sender, { type: "error", message: "Series already started" })
              return
            }
            if (Object.keys(this.state.players).length >= this.state.maxPlayers) this.pruneDisconnectedPlayers()
            if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
              this.send(sender, { type: "error", message: "Game is full" })
              return
            }
            this.state.players[sender.id] = {
              id: crypto.randomUUID(),
              name,
              attempts: 0,
              completed: false,
              won: false,
              guesses: [],
              joinedAt: Date.now(),
              connected: true,
              disconnectedAt: null,
              graceHandled: false,
              readyForNextTurn: false,
            }
            this.state.seriesScores[this.state.players[sender.id].id] = 0
          }
          const joinedPlayer = this.state.players[sender.id]
          if (!this.state.hostId || !Object.values(this.state.players).some(player => player.id === this.state!.hostId)) {
            this.state.hostId = joinedPlayer.id
          }

          this.bumpRevision()
          await this.saveState()
          this.send(sender, { type: "private-state", player: this.getPrivateState(this.state.players[sender.id]) })
          this.broadcastState()
          break
        }

        case "start": {
          if (!this.isCurrentRound(data.roundId, sender)) return
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game is not waiting to start" })
            return
          }
          if (!this.canControl(sender.id)) {
            this.send(sender, { type: "error", message: "Only host can start" })
            return
          }

          const liveIds = new Set(Array.from(this.room.getConnections(), connection => connection.id))
          for (const [credential, player] of Object.entries(this.state.players)) {
            player.connected = liveIds.has(credential)
            player.disconnectedAt = player.connected ? null : player.disconnectedAt ?? Date.now()
          }
          if (Object.values(this.state.players).filter(isPresent).length < 2) {
            this.bumpRevision()
            await this.saveState()
            this.broadcastState()
            this.send(sender, { type: "error", message: "Need at least 2 connected players" })
            return
          }
          this.pruneDisconnectedPlayers()
          const disconnectedPlayers = Object.values(this.state.players).filter(player => !player.connected)
          if (disconnectedPlayers.length > 0) {
            this.bumpRevision()
            await this.saveState()
            this.broadcastState()
            this.send(sender, { type: "error", message: "Wait for all players to reconnect before starting" })
            return
          }

          this.state.targetWord = getRandomWord()
          this.state.status = "playing"
          this.state.startedAt = Date.now()
          this.state.finishedAt = null
          this.state.currentTurn = 0
          this.state.participantIds = Object.values(this.state.players).map(player => player.id)
          this.state.winnerIds = []
          this.state.revealedBoards = {}
          this.state.results = []
          for (const player of Object.values(this.state.players)) {
            player.attempts = 0
            player.completed = false
            player.won = false
            player.guesses = []
            player.readyForNextTurn = false
          }

          this.bumpRevision()
          await this.saveState()
          this.broadcastState()
          for (const conn of this.room.getConnections()) {
            const player = this.state.players[conn.id]
            if (player) this.send(conn, { type: "private-state", player: this.getPrivateState(player) })
          }
          break
        }

        case "guess": {
          if (!this.isCurrentRound(data.roundId, sender)) return
          if (this.state.status !== "playing") return
          let player = this.state.players[sender.id]
          if (!player || !this.state.participantIds.includes(player.id) || !player.connected || player.completed) return
          if (this.state.mode === "classic" && this.state.revealMode === "after-round" && player.readyForNextTurn) {
            this.send(sender, { type: "error", message: "Waiting for other players..." })
            return
          }
          if (player.attempts >= MAX_GUESSES) return

          const word = typeof data.word === "string" ? data.word.trim().toUpperCase() : ""
          if (!/^[A-Z]{5}$/.test(word)) {
            this.send(sender, { type: "error", message: "Enter a five-letter word" })
            return
          }
          const validWords = await getValidWords()
          if (!validWords.has(word)) {
            this.send(sender, { type: "error", message: "Not in word list" })
            return
          }
          if (data.roundId !== this.state.roundId || this.state.status !== "playing") return
          player = this.state.players[sender.id]
          if (!player || !this.state.participantIds.includes(player.id) || !player.connected || player.completed) return
          if (this.state.mode === "classic" && this.state.revealMode === "after-round" && player.readyForNextTurn) return
          if (player.attempts >= MAX_GUESSES) return
          if (this.state.hardMode) {
            const hardModeError = getHardModeError(word, player.guesses)
            if (hardModeError) {
              this.send(sender, { type: "error", message: hardModeError })
              return
            }
          }

          const evaluated = evaluateGuess(word, this.state.targetWord)
          const result = this.state.mode === "one-lie" && word !== this.state.targetWord
            ? applyOneLie(evaluated, `${this.state.roundId}:${word}:${player.attempts}`)
            : evaluated
          player.guesses.push(result)
          player.attempts = player.guesses.length
          player.won = word === this.state.targetWord
          player.completed = player.won || player.attempts >= MAX_GUESSES
          player.readyForNextTurn = this.state.mode === "classic" && this.state.revealMode === "after-round"

          let roundReveal: ReturnType<WordleParty["advanceClassicRound"]> = null
          if ((this.state.mode === "race" || this.state.mode === "one-lie") && player.won) this.finishGame(player.id)
          else if (this.state.mode === "classic" && this.state.revealMode === "after-round") roundReveal = this.advanceClassicRound()
          else this.finishIfEveryoneDone()

          this.bumpRevision()
          await this.saveState()
          this.send(sender, { type: "private-state", player: this.getPrivateState(player) })
          if (roundReveal) this.broadcast({ type: "round-reveal", ...roundReveal })
          this.broadcastState()
          break
        }

        case "leave": {
          const leavingPlayer = this.state.players[sender.id]
          delete this.state.players[sender.id]
          if (leavingPlayer) delete this.state.seriesScores[leavingPlayer.id]
          if (Object.keys(this.state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (leavingPlayer?.id === this.state.hostId) this.state.hostId = this.electHost(leavingPlayer.id)
          const roundReveal = this.advanceClassicRound()
          this.finishIfEveryoneDone()
          this.bumpRevision()
          await this.saveState()
          if (roundReveal) this.broadcast({ type: "round-reveal", ...roundReveal })
          this.broadcastState()
          break
        }

        case "restart": {
          if (!this.isCurrentRound(data.roundId, sender)) return
          if (this.state.status !== "finished") {
            this.send(sender, { type: "error", message: "Game is not ready to restart" })
            return
          }
          if (!this.canControl(sender.id)) {
            this.send(sender, { type: "error", message: "Only host can restart" })
            return
          }

          const continueSeries = this.state.seriesLength > 1 && !this.state.seriesComplete
          this.state.roundId = crypto.randomUUID()
          if (continueSeries) {
            this.state.seriesRound++
          } else {
            this.state.seriesRound = 1
            this.state.seriesScores = Object.fromEntries(Object.values(this.state.players).map(player => [player.id, 0]))
          }
          this.state.seriesWinnerIds = []
          this.state.seriesComplete = false
          this.state.status = "waiting"
          this.state.targetWord = ""
          this.state.startedAt = null
          this.state.finishedAt = null
          this.state.currentTurn = 0
          this.state.participantIds = []
          this.state.winnerIds = []
          this.state.revealedBoards = {}
          this.state.results = []
          for (const player of Object.values(this.state.players)) {
            player.attempts = 0
            player.completed = false
            player.won = false
            player.guesses = []
            player.readyForNextTurn = false
          }

          this.bumpRevision()
          await this.saveState()
          this.broadcastState()
          break
        }
      }
    } catch (error) {
      console.error("Error processing Wordle message:", error)
      this.send(sender, { type: "error", message: "Could not process that Wordle action" })
    }
  }

  async handleDisconnect(conn: Party.Connection) {
    if (!this.state) return
    const replacementIsOpen = Array.from(this.room.getConnections()).some(
      connection => connection.id === conn.id && connection !== conn,
    )
    const player = this.state.players[conn.id]
    if (replacementIsOpen || !player || !player.connected) return

    markDisconnected(this.state.players, conn.id)
    player.disconnectedAt = Date.now()
    player.graceHandled = false
    this.bumpRevision()
    await this.saveState()
    this.broadcastState()
  }

  async onClose(conn: Party.Connection) {
    await this.handleDisconnect(conn)
  }

  async onError(conn: Party.Connection, error: Error) {
    console.error(`Wordle connection error for ${conn.id}:`, error)
    await this.handleDisconnect(conn)
  }

  async onAlarm() {
    if (!this.state) return
    this.pruneDisconnectedPlayers()
    if (Object.keys(this.state.players).length === 0) {
      this.state = null
      await this.room.storage.delete("state")
      await this.room.storage.deleteAlarm()
      return
    }

    if (this.state.status === "finished" && !Object.values(this.state.players).some(player => player.connected) &&
      this.state.finishedAt !== null &&
      Date.now() - this.state.finishedAt >= DISCONNECTED_PLAYER_TTL_MS) {
      this.state = null
      await this.room.storage.delete("state")
      await this.room.storage.deleteAlarm()
      return
    }

    for (const player of Object.values(this.state.players)) {
      if (!player.connected && player.disconnectedAt !== null && Date.now() - player.disconnectedAt >= RECONNECT_GRACE_MS) {
        player.graceHandled = true
      }
    }

    const roundReveal = this.advanceClassicRound()
    this.finishIfEveryoneDone()
    this.bumpRevision()
    await this.saveState()
    if (roundReveal) this.broadcast({ type: "round-reveal", ...roundReveal })
    this.broadcastState()
  }
}
