import type * as Party from "partykit/server"

// Core types
export type Team = "red" | "blue"
export type PlayerRole = "spymaster" | "guesser"
export type CardType = "red" | "blue" | "neutral" | "assassin"
export type GamePhase = "waiting" | "team-selection" | "playing" | "finished"
export type TurnPhase = "giving-clue" | "guessing"
export type GameMode = "classic" | "hardcore"
export type WinReason = "cards" | "assassin" | "wrong-guess" | "timeout"

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

export default class CodenamesParty implements Party.Server {
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

  getPublicState(playerId: string): PublicGameState {
    if (!this.state) {
      throw new Error("No game state")
    }

    const player = this.state.players[playerId]
    const isSpymaster = player?.role === "spymaster"

    const publicBoard: PublicCard[] = this.state.board.map((card) => ({
      word: card.word,
      type: card.revealed || isSpymaster ? card.type : null,
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
    }
  }

  isSpymaster(playerId: string): boolean {
    if (!this.state) return false
    return this.state.players[playerId]?.role === "spymaster"
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
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

    const players = Object.values(this.state.players)

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
    const isHost = url.searchParams.get("host") === "true"

    // Parse game settings from query params
    const gameMode = (url.searchParams.get("gameMode") || "classic") as GameMode
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
          clueTimeLimit: Math.max(0, Math.min(120, clueTimeLimit)),
          guessTimeLimit: Math.max(0, Math.min(60, guessTimeLimit)),
        },
        board: [],
        startingTeam,
        currentTurn: null,
        clueHistory: [],
        redCardsRemaining: startingTeam === "red" ? 9 : 8,
        blueCardsRemaining: startingTeam === "blue" ? 9 : 8,
        winner: null,
        winReason: null,
      }
      await this.saveState()
    }

    if (this.state) {
      this.send(conn, {
        type: "state",
        state: this.getPublicState(conn.id),
        isSpymaster: this.isSpymaster(conn.id),
      })
    } else {
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

      switch (data.type) {
        case "join": {
          if (this.state.status === "playing") {
            this.send(sender, { type: "error", message: "Game already in progress" })
            return
          }

          const player: Player = {
            id: sender.id,
            name: data.name,
            team: null,
            role: null,
            joinedAt: Date.now(),
          }

          this.state.players[sender.id] = player
          await this.saveState()

          this.broadcast({ type: "player-joined", player })
          this.broadcastState()
          break
        }

        case "proceed-to-team-selection": {
          if (sender.id !== this.state.hostId) {
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
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can start the game" })
            return
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

        case "restart": {
          if (sender.id !== this.state.hostId) {
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

          await this.saveState()
          this.broadcastState()
          break
        }

        case "leave": {
          delete this.state.players[sender.id]

          // Transfer host if needed
          if (sender.id === this.state.hostId) {
            const remaining = Object.keys(this.state.players)
            if (remaining.length > 0) {
              this.state.hostId = remaining[0]
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
    if (!this.state) return

    if (this.state.players[conn.id]) {
      delete this.state.players[conn.id]

      // Transfer host if needed
      if (conn.id === this.state.hostId) {
        const remaining = Object.keys(this.state.players)
        if (remaining.length > 0) {
          this.state.hostId = remaining[0]
        }
      }

      await this.saveState()
      this.broadcast({ type: "player-left", playerId: conn.id })
      this.broadcastState()
    }
  }
}
