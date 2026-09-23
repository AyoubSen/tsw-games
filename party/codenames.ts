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

// Core types
export type Team = "red" | "blue"
export type PlayerRole = "spymaster" | "guesser"
export type CardType = "red" | "blue" | "neutral" | "assassin"
export type GamePhase = "waiting" | "team-selection" | "playing" | "finished"
export type TurnPhase = "giving-clue" | "guessing"
export type GameMode = "classic" | "hardcore" | "duet"
export type WinReason = "cards" | "assassin" | "wrong-guess" | "timeout"

export const DUET_TURN_LIMIT = 9
export type DuetCardType = "agent" | "bystander" | "assassin"
export interface DuetClue {
  word: string
  count: number
  giverId: string
  givenBy: string
}
interface DuetState {
  playerIds: string[]
  keys: Record<string, DuetCardType[]>
  found: number[]
  bystanders: Record<string, number[]>
  giverId: string
  phase: "giving-clue" | "guessing" | "sudden-death"
  turnsUsed: number
  turnId: string
  revision: number
  clue: DuetClue | null
  history: DuetClue[]
  guessesThisTurn: number
  outcome: "win" | "assassin" | "bystander" | "partner-left" | null
  lastGuess: { cardIndex: number; playerId: string; type: DuetCardType } | null
}
export interface PublicDuetState {
  turnLimit: number
  playerIds: string[]
  myKey: DuetCardType[]
  partnerKey: DuetCardType[] | null
  found: number[]
  bystanders: Record<string, number[]>
  giverId: string
  phase: DuetState["phase"]
  turnsUsed: number
  turnId: string
  revision: number
  clue: DuetClue | null
  history: DuetClue[]
  guessesThisTurn: number
  agentsRemaining: number
  myAgentsRemaining: number
  partnerAgentsRemaining: number
  outcome: DuetState["outcome"]
  lastGuess: DuetState["lastGuess"]
}

export interface GameSettings {
  gameMode: GameMode
  clueTimeLimit: number  // seconds, 0 = unlimited
  guessTimeLimit: number // seconds, 0 = unlimited
}

export interface Player {
  id: string
  name: string
  team: Team | null
  role: PlayerRole | null
  joinedAt: number
  /** False while their socket is away; they stay in the game and can rejoin. */
  connected?: boolean
}

export interface Card {
  word: string
  type: CardType
  revealed: boolean
  revealedBy: Team | null
}

export interface Clue {
  word: string
  count: number
  team: Team
  givenBy: string
  timestamp: number
}

export interface Turn {
  team: Team
  phase: TurnPhase
  clue: Clue | null
  guessesRemaining: number
  guessedThisTurn: number[]
  phaseStartedAt: number // timestamp for timer
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: GamePhase
  settings: GameSettings
  board: Card[]
  startingTeam: Team
  currentTurn: Turn | null
  clueHistory: Clue[]
  redCardsRemaining: number
  blueCardsRemaining: number
  winner: Team | null
  winReason: WinReason | null
  playerTokens: Record<string, string>
  duet: DuetState | null
}

// Public state sent to clients (hides card types for non-spymasters)
export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: GamePhase
  settings: GameSettings
  board: PublicCard[]
  startingTeam: Team
  currentTurn: Turn | null
  clueHistory: Clue[]
  redCardsRemaining: number
  blueCardsRemaining: number
  winner: Team | null
  winReason: WinReason | null
  duet: PublicDuetState | null
}

export interface PublicCard {
  word: string
  type: CardType | null // null if not revealed and viewer is not spymaster
  revealed: boolean
  revealedBy: Team | null
}

// Message types from client
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "leave" }
  | { type: "proceed-to-team-selection" }
  | { type: "select-team"; team: Team; role: PlayerRole }
  | { type: "start-game" }
  | { type: "give-clue"; word: string; count: number }
  | { type: "guess"; cardIndex: number }
  | { type: "end-guessing" }
  | { type: "restart" }
  | { type: "duet-clue"; turnId: string; revision: number; word: string; count: number }
  | { type: "duet-guess"; turnId: string; revision: number; cardIndex: number }
  | { type: "duet-pass"; turnId: string; revision: number }

// Message types to client
export type ServerMessage =
  | { type: "state"; state: PublicGameState; isSpymaster: boolean }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "player-updated"; player: Player }
  | { type: "game-started"; startingTeam: Team }
  | { type: "clue-given"; clue: Clue }
  | { type: "card-revealed"; cardIndex: number; cardType: CardType; team: Team }
  | { type: "turn-ended"; nextTeam: Team; reason: string }
  | { type: "timer-tick"; timeRemaining: number; phase: TurnPhase }
  | { type: "game-over"; winner: Team; reason: WinReason }
  | { type: "error"; message: string }

// Word list (~400 words)
const CODENAMES_WORDS = [
  "AFRICA", "AGENT", "AIR", "ALIEN", "ALPS", "AMAZON", "AMBULANCE", "AMERICA",
  "ANGEL", "ANTARCTICA", "APPLE", "ARM", "ATLANTIS", "AUSTRALIA", "AZTEC",
  "BACK", "BALL", "BAND", "BANK", "BAR", "BARK", "BAT", "BATTERY", "BEACH",
  "BEAR", "BEAT", "BED", "BEIJING", "BELL", "BELT", "BERLIN", "BERMUDA",
  "BERRY", "BILL", "BLOCK", "BOARD", "BOLT", "BOMB", "BOND", "BOOM", "BOOT",
  "BOTTLE", "BOW", "BOX", "BRIDGE", "BRUSH", "BUCK", "BUFFALO", "BUG",
  "BUGLE", "BUTTON", "CALF", "CANADA", "CAP", "CAPITAL", "CAR", "CARD",
  "CARROT", "CASINO", "CAST", "CAT", "CELL", "CENTAUR", "CENTER", "CHAIR",
  "CHANGE", "CHARGE", "CHECK", "CHEST", "CHICK", "CHINA", "CHOCOLATE",
  "CHURCH", "CIRCLE", "CLIFF", "CLOAK", "CLUB", "CODE", "COLD", "COMIC",
  "COMPOUND", "CONCERT", "CONDUCTOR", "CONTRACT", "COOK", "COPPER", "COTTON",
  "COURT", "COVER", "CRANE", "CRASH", "CRICKET", "CROSS", "CROWN", "CYCLE",
  "CZECH", "DANCE", "DATE", "DAY", "DEATH", "DECK", "DEGREE", "DIAMOND",
  "DICE", "DINOSAUR", "DISEASE", "DOCTOR", "DOG", "DRAFT", "DRAGON", "DRESS",
  "DRILL", "DROP", "DUCK", "DWARF", "EAGLE", "EGYPT", "EMBASSY", "ENGINE",
  "ENGLAND", "EUROPE", "EYE", "FACE", "FAIR", "FALL", "FAN", "FENCE", "FIELD",
  "FIGHTER", "FIGURE", "FILE", "FILM", "FIRE", "FISH", "FLUTE", "FLY", "FOOT",
  "FORCE", "FOREST", "FORK", "FRANCE", "GAME", "GAS", "GENIUS", "GERMANY",
  "GHOST", "GIANT", "GLASS", "GLOVE", "GOLD", "GRACE", "GRASS", "GREECE",
  "GREEN", "GROUND", "HAM", "HAND", "HAWK", "HEAD", "HEART", "HELICOPTER",
  "HIMALAYAS", "HOLE", "HOLLYWOOD", "HONEY", "HOOD", "HOOK", "HORN", "HORSE",
  "HOSPITAL", "HOTEL", "ICE", "ICELAND", "IMAGE", "INDIA", "IRON", "IVORY",
  "IVY", "JACK", "JAM", "JET", "JUPITER", "KANGAROO", "KETCHUP", "KEY", "KID",
  "KING", "KIWI", "KNIFE", "KNIGHT", "LAB", "LAP", "LASER", "LAWYER", "LEAD",
  "LEMON", "LEPRECHAUN", "LIFE", "LIGHT", "LIMOUSINE", "LINE", "LINK", "LION",
  "LITTER", "LOCH", "LOCK", "LOG", "LONDON", "LUCK", "MAIL", "MAMMOTH", "MAPLE",
  "MARBLE", "MARCH", "MASS", "MATCH", "MERCURY", "MEXICO", "MICROSCOPE", "MILLIONAIRE",
  "MINE", "MINT", "MISSILE", "MODEL", "MOLE", "MOON", "MOSCOW", "MOUNT", "MOUSE",
  "MOUTH", "MUG", "NAIL", "NEEDLE", "NET", "NEW", "NIGHT", "NINJA", "NOTE",
  "NOVEL", "NURSE", "NUT", "OCTOPUS", "OIL", "OLIVE", "OLYMPUS", "OPERA",
  "ORANGE", "ORGAN", "PALM", "PAN", "PANTS", "PAPER", "PARACHUTE", "PARK",
  "PART", "PASS", "PASTE", "PENGUIN", "PHOENIX", "PIANO", "PIE", "PILOT",
  "PIN", "PIPE", "PIRATE", "PISTOL", "PIT", "PITCH", "PLANE", "PLASTIC",
  "PLATE", "PLATYPUS", "PLAY", "PLOT", "POINT", "POISON", "POLE", "POLICE",
  "POND", "POOL", "PORT", "POST", "POUND", "PRESS", "PRINCESS", "PUMPKIN",
  "PUPIL", "PYRAMID", "QUEEN", "RABBIT", "RACKET", "RAY", "REVOLUTION", "RING",
  "ROBIN", "ROBOT", "ROCK", "ROME", "ROOT", "ROSE", "ROULETTE", "ROUND", "ROW",
  "RULER", "SATELLITE", "SATURN", "SCALE", "SCHOOL", "SCIENTIST", "SCORPION",
  "SCREEN", "SEAL", "SERVER", "SHADOW", "SHAKESPEARE", "SHARK", "SHIP", "SHOE",
  "SHOP", "SHOT", "SHOULDER", "SINK", "SKYSCRAPER", "SLIP", "SLUG", "SMUGGLER",
  "SNOW", "SNOWMAN", "SOCK", "SOLDIER", "SOUL", "SOUND", "SPACE", "SPELL",
  "SPIDER", "SPIKE", "SPINE", "SPOT", "SPRING", "SPY", "SQUARE", "STADIUM",
  "STAFF", "STAR", "STATE", "STICK", "STOCK", "STRAW", "STREAM", "STRIKE",
  "STRING", "SUB", "SUIT", "SUPERHERO", "SWING", "SWITCH", "TABLE", "TABLET",
  "TAG", "TAIL", "TAP", "TEACHER", "TELESCOPE", "TEMPLE", "THIEF", "THUMB",
  "TICK", "TIE", "TIME", "TOKYO", "TOOTH", "TORCH", "TOWER", "TRACK", "TRAIN",
  "TRIANGLE", "TRIP", "TRUNK", "TUBE", "TURKEY", "UNDERTAKER", "UNICORN",
  "VACUUM", "VAN", "VET", "WAKE", "WALL", "WAR", "WASHER", "WASHINGTON",
  "WATCH", "WATER", "WAVE", "WEB", "WELL", "WHALE", "WHIP", "WIND", "WITCH",
  "WORM", "YARD", "YORK"
]

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function generateBoard(startingTeam: Team): Card[] {
  // Pick 25 random words
  const words = shuffleArray(CODENAMES_WORDS).slice(0, 25)

  // Determine card types: 9 for starting team, 8 for other, 7 neutral, 1 assassin
  const startingCount = 9
  const otherCount = 8
  const neutralCount = 7
  const assassinCount = 1

  const types: CardType[] = [
    ...Array(startingCount).fill(startingTeam),
    ...Array(otherCount).fill(startingTeam === "red" ? "blue" : "red"),
    ...Array(neutralCount).fill("neutral"),
    ...Array(assassinCount).fill("assassin"),
  ]

  const shuffledTypes = shuffleArray(types)

  return words.map((word, i) => ({
    word,
    type: shuffledTypes[i],
    revealed: false,
    revealedBy: null,
  }))
}

class CodenamesParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (stored) {
      stored.playerTokens ??= {}
      stored.duet ??= null
      this.state = stored
      for (const player of Object.values(this.state.players)) {
        player.connected = false
      }
      await this.saveState()
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

  getPublicState(playerId: string): PublicGameState {
    if (!this.state) {
      throw new Error("No game state")
    }

    const player = this.state.players[playerId]
    const isSpymaster = player?.role === "spymaster"

    const publicBoard: PublicCard[] = this.state.board.map((card) => ({
      word: card.word,
      type: this.state!.settings.gameMode === "duet" ? null : card.revealed || isSpymaster ? card.type : null,
      revealed: card.revealed,
      revealedBy: card.revealedBy,
    }))

    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players: this.state.players,
      status: this.state.status,
      settings: this.state.settings,
      board: publicBoard,
      startingTeam: this.state.startingTeam,
      currentTurn: this.state.currentTurn,
      clueHistory: this.state.clueHistory,
      redCardsRemaining: this.state.redCardsRemaining,
      blueCardsRemaining: this.state.blueCardsRemaining,
      winner: this.state.winner,
      winReason: this.state.winReason,
      duet: this.getPublicDuetState(playerId),
    }
  }

  duetRemaining(keyOwnerId: string): number {
    const duet = this.state?.duet
    if (!duet) return 0
    return duet.keys[keyOwnerId]?.filter((type, index) => type === "agent" && !duet.found.includes(index)).length ?? 0
  }

  getPublicDuetState(playerId: string): PublicDuetState | null {
    const duet = this.state?.duet
    if (!duet || !duet.playerIds.includes(playerId)) return null
    const partnerId = duet.playerIds.find((id) => id !== playerId)!
    return {
      turnLimit: DUET_TURN_LIMIT,
      playerIds: duet.playerIds, myKey: duet.keys[playerId],
      partnerKey: this.state?.status === "finished" ? duet.keys[partnerId] : null,
      found: duet.found, bystanders: duet.bystanders, giverId: duet.giverId,
      phase: duet.phase, turnsUsed: duet.turnsUsed, turnId: duet.turnId, revision: duet.revision,
      clue: duet.clue, history: duet.history, guessesThisTurn: duet.guessesThisTurn,
      agentsRemaining: 15 - duet.found.length,
      myAgentsRemaining: this.duetRemaining(playerId), partnerAgentsRemaining: this.duetRemaining(partnerId),
      outcome: duet.outcome, lastGuess: duet.lastGuess,
    }
  }

  startDuet() {
    if (!this.state) return
    const ids = Object.values(this.state.players).sort((a, b) => a.joinedAt - b.joinedAt).map((player) => player.id)
    // Each key has 9 agents and 3 assassins; 3 agents and 1 assassin overlap.
    const pairs: [DuetCardType, DuetCardType][] = []
    const add = (first: DuetCardType, second: DuetCardType, count: number) => {
      for (let i = 0; i < count; i++) pairs.push([first, second])
    }
    add("agent", "agent", 3)
    add("agent", "bystander", 5)
    add("agent", "assassin", 1)
    add("bystander", "agent", 5)
    add("bystander", "bystander", 7)
    add("bystander", "assassin", 1)
    add("assassin", "agent", 1)
    add("assassin", "bystander", 1)
    add("assassin", "assassin", 1)
    const shuffledPairs = shuffleArray(pairs)
    this.state.board = shuffleArray(CODENAMES_WORDS).slice(0, 25).map((word) => ({ word, type: "neutral", revealed: false, revealedBy: null }))
    this.state.duet = {
      playerIds: ids, keys: { [ids[0]]: shuffledPairs.map((pair) => pair[0]), [ids[1]]: shuffledPairs.map((pair) => pair[1]) },
      found: [], bystanders: { [ids[0]]: [], [ids[1]]: [] },
      giverId: ids[Math.floor(Math.random() * 2)], phase: "giving-clue",
      turnsUsed: 0, turnId: crypto.randomUUID(), revision: 0, clue: null, history: [],
      guessesThisTurn: 0, outcome: null, lastGuess: null,
    }
    this.state.status = "playing"
    this.state.currentTurn = null
  }

  finishDuet(outcome: NonNullable<DuetState["outcome"]>) {
    if (!this.state?.duet) return
    this.state.duet.outcome = outcome
    this.state.status = "finished"
  }

  endDuetTurn() {
    const duet = this.state?.duet
    if (!duet) return
    duet.turnsUsed++
    duet.turnId = crypto.randomUUID()
    duet.clue = null
    duet.guessesThisTurn = 0
    if (duet.turnsUsed >= DUET_TURN_LIMIT) {
      duet.phase = "sudden-death"
      return
    }
    const partnerId = duet.playerIds.find((id) => id !== duet.giverId)!
    if (this.duetRemaining(partnerId) > 0) duet.giverId = partnerId
    duet.phase = "giving-clue"
  }

  handleDuetAction(data: Extract<ClientMessage, { type: "duet-clue" | "duet-guess" | "duet-pass" }>, sender: Party.Connection) {
    const duet = this.state?.duet
    if (!this.state || this.state.settings.gameMode !== "duet" || this.state.status !== "playing" || !duet ||
      !duet.playerIds.includes(sender.id) || data.turnId !== duet.turnId || data.revision !== duet.revision) return
    const error = (message: string) => this.send(sender, { type: "error", message })
    const partnerId = duet.playerIds.find((id) => id !== sender.id)!
    if (data.type === "duet-clue") {
      if (duet.phase !== "giving-clue" || sender.id !== duet.giverId) return error("It is your partner's turn to give a clue")
      const word = typeof data.word === "string" ? data.word.trim().toUpperCase() : ""
      if (!/^[A-Z]{1,30}$/.test(word)) return error("Use one word with letters only (up to 30 characters)")
      if (this.state.board.some((card, index) => !duet.found.includes(index) && card.word === word)) return error("Your clue cannot be an unfound word on the board")
      if (!Number.isInteger(data.count) || data.count < 1 || data.count > this.duetRemaining(sender.id)) return error("Choose a count from 1 to your remaining agents")
      duet.clue = { word, count: data.count, giverId: sender.id, givenBy: this.state.players[sender.id].name }
      duet.history.push(duet.clue)
      duet.phase = "guessing"
    } else if (data.type === "duet-pass") {
      if (duet.phase !== "guessing" || sender.id === duet.giverId || duet.guessesThisTurn < 1) return error("The guesser must make at least one guess before ending the turn")
      this.endDuetTurn()
    } else {
      if (duet.phase !== "sudden-death" && (duet.phase !== "guessing" || sender.id === duet.giverId)) return error("Wait for your partner's clue before guessing")
      if (this.duetRemaining(partnerId) === 0) return error("You have already found all agents on your partner's key")
      const index = data.cardIndex
      if (!Number.isInteger(index) || index < 0 || index >= 25 || duet.found.includes(index) || duet.bystanders[sender.id].includes(index)) return error("Choose an unfound card you have not ruled out")
      // Always evaluate against the clue giver's key, never the guesser's own key.
      const type = duet.keys[partnerId][index]
      duet.lastGuess = { cardIndex: index, playerId: sender.id, type }
      duet.guessesThisTurn++
      if (type === "assassin") this.finishDuet("assassin")
      else if (type === "bystander") {
        duet.bystanders[sender.id].push(index)
        if (duet.phase === "sudden-death") this.finishDuet("bystander")
        else this.endDuetTurn()
      } else {
        duet.found.push(index)
        this.state.board[index].revealed = true
        if (duet.found.length === 15) this.finishDuet("win")
        else if (duet.phase !== "sudden-death" && this.duetRemaining(partnerId) === 0) this.endDuetTurn()
      }
    }
    duet.revision++
    return true
  }

  isSpymaster(playerId: string): boolean {
    if (!this.state) return false
    return this.state.players[playerId]?.role === "spymaster"
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
      if (!this.isAuthenticated(conn)) continue
      this.send(conn, {
        type: "state",
        state: this.getPublicState(conn.id),
        isSpymaster: this.isSpymaster(conn.id),
      })
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

  validateTeamSelection(): { valid: boolean; message: string } {
    if (!this.state) return { valid: false, message: "No game state" }

    const players = Object.values(this.state.players).filter(
      (player) => player.connected !== false,
    )

    const redTeam = players.filter((p) => p.team === "red")
    const blueTeam = players.filter((p) => p.team === "blue")

    const redSpymasters = redTeam.filter((p) => p.role === "spymaster")
    const blueSpymasters = blueTeam.filter((p) => p.role === "spymaster")

    const redGuessers = redTeam.filter((p) => p.role === "guesser")
    const blueGuessers = blueTeam.filter((p) => p.role === "guesser")

    if (redSpymasters.length !== 1) {
      return { valid: false, message: "Red team needs exactly 1 Spymaster" }
    }
    if (blueSpymasters.length !== 1) {
      return { valid: false, message: "Blue team needs exactly 1 Spymaster" }
    }
    if (redGuessers.length < 1) {
      return { valid: false, message: "Red team needs at least 1 Guesser" }
    }
    if (blueGuessers.length < 1) {
      return { valid: false, message: "Blue team needs at least 1 Guesser" }
    }

    return { valid: true, message: "Teams are ready" }
  }

  handleGuess(cardIndex: number, guessingTeam: Team): void {
    if (!this.state || !this.state.currentTurn) return

    const card = this.state.board[cardIndex]
    if (!card || card.revealed) return

    // Reveal the card
    card.revealed = true
    card.revealedBy = guessingTeam

    // Update remaining counts
    if (card.type === "red") {
      this.state.redCardsRemaining--
    } else if (card.type === "blue") {
      this.state.blueCardsRemaining--
    }

    // Track this guess
    this.state.currentTurn.guessedThisTurn.push(cardIndex)

    // Broadcast card reveal
    this.broadcast({
      type: "card-revealed",
      cardIndex,
      cardType: card.type,
      team: guessingTeam,
    })

    // Check win conditions
    if (card.type === "assassin") {
      // Guessing team loses
      const winner = guessingTeam === "red" ? "blue" : "red"
      this.endGame(winner, "assassin")
      return
    }

    // Check if any team found all their cards
    if (this.state.redCardsRemaining === 0) {
      this.endGame("red", "cards")
      return
    }
    if (this.state.blueCardsRemaining === 0) {
      this.endGame("blue", "cards")
      return
    }

    // Check turn flow
    if (card.type !== guessingTeam) {
      // Wrong team's card or neutral

      // In hardcore mode, any wrong guess = instant loss
      if (this.state.settings.gameMode === "hardcore") {
        const winner = guessingTeam === "red" ? "blue" : "red"
        this.endGame(winner, "wrong-guess")
        return
      }

      // Classic mode - just end turn
      this.switchTurn("wrong guess")
    } else {
      // Correct guess
      this.state.currentTurn.guessesRemaining--

      // Reset guess timer if in speed mode
      if (this.state.settings.guessTimeLimit > 0) {
        this.state.currentTurn.phaseStartedAt = Date.now()
        this.setGuessTimer()
      }

      // Check if out of guesses (unless unlimited with count=0)
      if (
        this.state.currentTurn.clue?.count !== 0 &&
        this.state.currentTurn.guessesRemaining <= 0
      ) {
        this.switchTurn("out of guesses")
      }
      // Otherwise, they can continue guessing
    }
  }

  switchTurn(reason: string) {
    if (!this.state || !this.state.currentTurn) return

    // Cancel any existing timer
    this.room.storage.deleteAlarm()

    const nextTeam = this.state.currentTurn.team === "red" ? "blue" : "red"

    this.state.currentTurn = {
      team: nextTeam,
      phase: "giving-clue",
      clue: null,
      guessesRemaining: 0,
      guessedThisTurn: [],
      phaseStartedAt: Date.now(),
    }

    this.broadcast({ type: "turn-ended", nextTeam, reason })
    this.broadcastState()

    // Set clue timer if in speed mode
    if (this.state.settings.clueTimeLimit > 0) {
      this.setClueTimer()
    }
  }

  setClueTimer() {
    if (!this.state || this.state.settings.clueTimeLimit === 0) return
    const timeout = this.state.settings.clueTimeLimit * 1000
    this.room.storage.setAlarm(Date.now() + timeout)
  }

  setGuessTimer() {
    if (!this.state || this.state.settings.guessTimeLimit === 0) return
    const timeout = this.state.settings.guessTimeLimit * 1000
    this.room.storage.setAlarm(Date.now() + timeout)
  }

  async onAlarm() {
    if (this.state?.settings.gameMode === "duet") return
    if (!this.state || this.state.status !== "playing" || !this.state.currentTurn) {
      return
    }

    const turn = this.state.currentTurn
    const now = Date.now()
    const elapsed = now - turn.phaseStartedAt

    if (turn.phase === "giving-clue") {
      // Clue timer expired - skip turn
      const timeLimit = this.state.settings.clueTimeLimit * 1000
      if (elapsed >= timeLimit - 500) {
        // In hardcore mode, timeout = loss
        if (this.state.settings.gameMode === "hardcore") {
          const winner = turn.team === "red" ? "blue" : "red"
          this.endGame(winner, "timeout")
        } else {
          this.switchTurn("time expired")
        }
        await this.saveState()
      }
    } else if (turn.phase === "guessing") {
      // Guess timer expired - end guessing phase
      const timeLimit = this.state.settings.guessTimeLimit * 1000
      if (elapsed >= timeLimit - 500) {
        // In hardcore mode with no guesses made, it's a loss
        if (this.state.settings.gameMode === "hardcore" && turn.guessedThisTurn.length === 0) {
          const winner = turn.team === "red" ? "blue" : "red"
          this.endGame(winner, "timeout")
        } else {
          this.switchTurn("time expired")
        }
        await this.saveState()
      }
    }
  }

  endGame(winner: Team, reason: WinReason) {
    if (!this.state) return

    // Cancel any pending timer
    this.room.storage.deleteAlarm()

    this.state.status = "finished"
    this.state.winner = winner
    this.state.winReason = reason
    this.state.currentTurn = null

    this.broadcast({ type: "game-over", winner, reason })
    this.broadcastState()
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const gameNight = await validateGameNightConnection(this.room, conn, ctx, "codenames")
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

    // Parse game settings from query params
    const requestedMode = url.searchParams.get("gameMode")
    const gameMode: GameMode = requestedMode === "duet" || requestedMode === "hardcore" ? requestedMode : "classic"
    const clueTimeLimit = parseInt(url.searchParams.get("clueTimeLimit") || "0", 10)
    const guessTimeLimit = parseInt(url.searchParams.get("guessTimeLimit") || "0", 10)

    if (isHost && !this.state) {
      // Randomly select starting team
      const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue"

      this.state = {
        roomCode: this.room.id,
        hostId: conn.id,
        players: {},
        status: "waiting",
        settings: {
          gameMode,
          clueTimeLimit: gameMode === "duet" ? 0 : Math.max(0, Math.min(120, clueTimeLimit)),
          guessTimeLimit: gameMode === "duet" ? 0 : Math.max(0, Math.min(60, guessTimeLimit)),
        },
        board: [],
        startingTeam,
        currentTurn: null,
        clueHistory: [],
        redCardsRemaining: startingTeam === "red" ? 9 : 8,
        blueCardsRemaining: startingTeam === "blue" ? 9 : 8,
        winner: null,
        winReason: null,
        playerTokens: {},
        duet: null,
      }
      await this.saveState()
    }

    if (!this.state) {
      this.send(conn, { type: "error", message: "Game not found" })
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) {
      this.send(sender, { type: "error", message: "Game not found. Please try rejoining." })
      return
    }

    try {
      const data: ClientMessage = JSON.parse(message)

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
		  const gameNightName = this.gameNightMembers.get(sender)?.name
		  const returningPlayer = this.state.players[sender.id]
		  const expectedToken = this.state.playerTokens[sender.id]
		  if (returningPlayer && expectedToken !== playerToken) {
			this.send(sender, { type: "error", message: "Invalid player session" })
			return
		  }
          // A known player is reconnecting, not joining. Their team and role
          // are still on record, so broadcastState hands the spymaster their
          // spymaster view again - and only them.
          const returning = markConnected(this.state.players, sender.id)
          if (returning) {
			this.state.playerTokens[sender.id] = playerToken
            returning.name = gameNightName || data.name || returning.name
            await this.saveState()
            this.broadcast({ type: "player-joined", player: returning })
            this.broadcastState()
            break
          }

          if (this.state.status === "playing" || (this.state.settings.gameMode === "duet" && this.state.status !== "waiting")) {
            this.send(sender, { type: "error", message: "Game already in progress" })
            return
          }

		  if (Object.keys(this.state.players).length >= (this.state.settings.gameMode === "duet" ? 2 : 8)) {
			this.send(sender, { type: "error", message: "Game is full" })
			return
		  }

          const player: Player = {
            id: sender.id,
            name: gameNightName || data.name,
            team: null,
            role: null,
            joinedAt: Date.now(),
            connected: true,
          }

          this.state.players[sender.id] = player
		  this.state.playerTokens[sender.id] = playerToken
          await this.saveState()

          this.broadcast({ type: "player-joined", player })
          this.broadcastState()
          break
        }

        case "proceed-to-team-selection": {
          if (this.state.settings.gameMode === "duet") return
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can proceed" })
            return
          }

          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already in team selection or playing" })
            return
          }

          this.state.status = "team-selection"
          await this.saveState()
          this.broadcastState()
          break
        }

        case "select-team": {
          if (this.state.settings.gameMode === "duet") return
          if (this.state.status !== "waiting" && this.state.status !== "team-selection") {
            this.send(sender, { type: "error", message: "Cannot change team now" })
            return
          }

          const player = this.state.players[sender.id]
          if (!player) {
            this.send(sender, { type: "error", message: "Player not found" })
            return
          }

          // Check spymaster limit
          if (data.role === "spymaster") {
            const existingSpymaster = Object.values(this.state.players).find(
              (p) => p.id !== sender.id && p.team === data.team && p.role === "spymaster"
            )
            if (existingSpymaster) {
              this.send(sender, {
                type: "error",
                message: `${data.team === "red" ? "Red" : "Blue"} team already has a Spymaster`,
              })
              return
            }
          }

          player.team = data.team
          player.role = data.role

          // Move to team-selection phase if still waiting
          if (this.state.status === "waiting") {
            this.state.status = "team-selection"
          }

          await this.saveState()

          this.broadcast({ type: "player-updated", player })
          this.broadcastState()
          break
        }

        case "start-game": {
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can start the game" })
            return
          }

          if (this.state.settings.gameMode === "duet") {
            if (this.state.status !== "waiting") return
            const players = Object.values(this.state.players)
            if (players.length !== 2 || players.some((player) => player.connected === false)) {
              this.send(sender, { type: "error", message: "Duet needs exactly 2 connected players" })
              return
            }
            this.startDuet()
            await this.room.storage.deleteAlarm()
            await this.saveState()
            this.broadcastState()
            break
          }

          for (const player of Object.values(this.state.players)) {
            if (player.connected === false) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            }
          }

          const validation = this.validateTeamSelection()
          if (!validation.valid) {
            this.send(sender, { type: "error", message: validation.message })
            return
          }

          // Generate the board
          this.state.board = generateBoard(this.state.startingTeam)
          this.state.status = "playing"
          this.state.currentTurn = {
            team: this.state.startingTeam,
            phase: "giving-clue",
            clue: null,
            guessesRemaining: 0,
            guessedThisTurn: [],
            phaseStartedAt: Date.now(),
          }

          await this.saveState()

          this.broadcast({ type: "game-started", startingTeam: this.state.startingTeam })
          this.broadcastState()

          // Start clue timer if in speed mode
          if (this.state.settings.clueTimeLimit > 0) {
            this.setClueTimer()
          }
          break
        }

        case "give-clue": {
          if (this.state.settings.gameMode === "duet") return
          if (this.state.status !== "playing" || !this.state.currentTurn) {
            this.send(sender, { type: "error", message: "Cannot give clue now" })
            return
          }

          if (this.state.currentTurn.phase !== "giving-clue") {
            this.send(sender, { type: "error", message: "Not the clue-giving phase" })
            return
          }

          const player = this.state.players[sender.id]
          if (!player || player.role !== "spymaster") {
            this.send(sender, { type: "error", message: "Only Spymaster can give clues" })
            return
          }

          if (player.team !== this.state.currentTurn.team) {
            this.send(sender, { type: "error", message: "Not your team's turn" })
            return
          }

          // Validate clue
          const clueWord = data.word.toUpperCase().trim()
          if (!clueWord || clueWord.includes(" ") || clueWord.includes("-")) {
            this.send(sender, { type: "error", message: "Clue must be a single word" })
            return
          }

          // Check if clue matches any board word
          const matchesBoard = this.state.board.some(
            (card) => !card.revealed && card.word.toUpperCase() === clueWord
          )
          if (matchesBoard) {
            this.send(sender, { type: "error", message: "Clue cannot be a word on the board" })
            return
          }

          if (data.count < 0 || data.count > 9) {
            this.send(sender, { type: "error", message: "Count must be 0-9" })
            return
          }

          // Cancel clue timer
          this.room.storage.deleteAlarm()

          const clue: Clue = {
            word: clueWord,
            count: data.count,
            team: this.state.currentTurn.team,
            givenBy: player.name,
            timestamp: Date.now(),
          }

          this.state.currentTurn.clue = clue
          this.state.currentTurn.phase = "guessing"
          this.state.currentTurn.phaseStartedAt = Date.now()
          // +1 guess allowed (or unlimited if count=0)
          this.state.currentTurn.guessesRemaining = data.count === 0 ? 999 : data.count + 1
          this.state.clueHistory.push(clue)

          await this.saveState()

          this.broadcast({ type: "clue-given", clue })
          this.broadcastState()

          // Start guess timer if in speed mode
          if (this.state.settings.guessTimeLimit > 0) {
            this.setGuessTimer()
          }
          break
        }

        case "guess": {
          if (this.state.settings.gameMode === "duet") return
          if (this.state.status !== "playing" || !this.state.currentTurn) {
            this.send(sender, { type: "error", message: "Cannot guess now" })
            return
          }

          if (this.state.currentTurn.phase !== "guessing") {
            this.send(sender, { type: "error", message: "Not the guessing phase" })
            return
          }

          const player = this.state.players[sender.id]
          if (!player || player.role !== "guesser") {
            this.send(sender, { type: "error", message: "Only Guessers can guess" })
            return
          }

          if (player.team !== this.state.currentTurn.team) {
            this.send(sender, { type: "error", message: "Not your team's turn" })
            return
          }

          if (data.cardIndex < 0 || data.cardIndex >= 25) {
            this.send(sender, { type: "error", message: "Invalid card index" })
            return
          }

          const card = this.state.board[data.cardIndex]
          if (card.revealed) {
            this.send(sender, { type: "error", message: "Card already revealed" })
            return
          }

          this.handleGuess(data.cardIndex, this.state.currentTurn.team)
          await this.saveState()
          break
        }

        case "end-guessing": {
          if (this.state.settings.gameMode === "duet") return
          if (this.state.status !== "playing" || !this.state.currentTurn) {
            this.send(sender, { type: "error", message: "Cannot end turn now" })
            return
          }

          if (this.state.currentTurn.phase !== "guessing") {
            this.send(sender, { type: "error", message: "Not the guessing phase" })
            return
          }

          const player = this.state.players[sender.id]
          if (!player || player.team !== this.state.currentTurn.team) {
            this.send(sender, { type: "error", message: "Not your team's turn" })
            return
          }

          // Must have made at least one guess
          if (this.state.currentTurn.guessedThisTurn.length === 0) {
            this.send(sender, { type: "error", message: "Must make at least one guess" })
            return
          }

          this.switchTurn("passed")
          await this.saveState()
          break
        }

        case "duet-clue":
        case "duet-guess":
        case "duet-pass": {
          if (!this.handleDuetAction(data, sender)) break
          await this.saveState()
          this.broadcastState()
          break
        }

        case "restart": {
          if (this.state.settings.gameMode === "duet" && this.state.status !== "finished") return
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only host can restart" })
            return
          }

          // Cancel any pending timer
          this.room.storage.deleteAlarm()

          // Keep players but reset their team/role
          for (const player of Object.values(this.state.players)) {
            player.team = null
            player.role = null
          }

          // Randomly select new starting team
          const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue"

          this.state.status = "waiting"
          this.state.board = []
          this.state.startingTeam = startingTeam
          this.state.currentTurn = null
          this.state.clueHistory = []
          this.state.redCardsRemaining = startingTeam === "red" ? 9 : 8
          this.state.blueCardsRemaining = startingTeam === "blue" ? 9 : 8
          this.state.winner = null
          this.state.winReason = null
          this.state.duet = null

          await this.saveState()
          this.broadcastState()
          break
        }

        case "leave": {
          if (this.state.settings.gameMode === "duet" && this.state.status === "playing") this.finishDuet("partner-left")
          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]

		  if (Object.keys(this.state.players).length === 0) {
			this.state = null
			await this.room.storage.delete("state")
			await this.room.storage.deleteAlarm()
			return
		  }

          // Transfer host if needed
          if (sender.id === this.state.hostId) {
            const next = nextHost(this.state.players, sender.id)
            if (next) this.state.hostId = next
            else if (this.state.settings.gameMode === "duet") this.state.hostId = Object.keys(this.state.players)[0]
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
	const replacementIsOpen = Array.from(this.room.getConnections()).some(
	  connection => connection.id === conn.id && connection !== conn,
	)
	if (replacementIsOpen) {
	  this.connectionTokens.delete(conn)
	  return
	}

    if (this.state.players[conn.id] && this.isAuthenticated(conn)) {
      markDisconnected(this.state.players, conn.id)

      await this.saveState()
      // No "player-left": they may be back shortly and clients remove on that.
      this.broadcastState()
    }
	this.connectionTokens.delete(conn)
  }

  async onRequest(request: Party.Request) {
    try {
      const match = await getGameNightResultMatch(this.room, request, "codenames")
      if (!match) return new Response("Not found", { status: 404 })
      if (this.state?.settings.gameMode === "duet") {
        const finished = this.state.status === "finished"
        return Response.json({ finished, scored: true, winnerIds: finished && this.state.duet?.outcome === "win" ? this.state.duet.playerIds : [] })
      }
      const finished = this.state?.status === "finished" && this.state.winner !== null
      const winnerIds = finished
        ? Object.values(this.state!.players).filter((player) => player.team === this.state!.winner).map((player) => player.id)
        : []
      return Response.json({ finished, scored: true, winnerIds })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
}

export default withRoomCleanup(CodenamesParty, "codenames")
