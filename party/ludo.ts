import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import { isBotLevel, type BotLevel } from "../src/lib/botLevel"
import { isReaction, pickReaction, takeReactionSlot, type Reaction, type ReactionMessage } from "../src/lib/reactions"
import {
  chooseBestMove,
  chooseBotMove,
  diceForRoll,
  getAllySeats,
  getPlayableMoves,
  getTeammateSeat,
  getTeamOfSeat,
  hasWon,
  LUDO_BASE,
  LUDO_CAPTURE_BONUS,
  LUDO_HOME_BONUS,
  LUDO_HOME_INDEX,
  LUDO_SEATS,
  rollLudoDice,
  tokensPerPlayer,
  type LudoDie,
  type LudoMode,
  type LudoMove,
} from "../src/lib/ludo"
import {
  canControlGame,
  isPresent,
  markConnected,
  markDisconnected,
  nextHost,
  presentCount,
} from "./shared/presence"
import {
  getGameNightResultMatch,
  validateGameNightConnection,
  type GameNightMember,
} from "./shared/gameNight"
import { clearSpectators, dropSpectator, MAX_SPECTATORS, publicSpectators, type PublicSpectator, type Spectator } from "./shared/spectators"

export interface Player {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
  seat: number | null
  tokens: number[]
  isBot?: boolean
  botLevel?: BotLevel
}

export interface WinnerSnapshot {
  /** One id in classic, both partners in 2v2. Bots are included. */
  ids: string[]
  name: string
  seat: number
  finishedAt: number
}

export interface LastMove {
  seat: number
  tokenIndex: number
  from: number
  to: number
  captured: boolean
  finishes: boolean
  moveId: number
}

export interface LogEntry {
  text: string
  /** The roll this happened in, so clients can hold it back while the dice tumble. */
  rollId: number
}

export interface LastRoll {
  seat: number
  values: [number, number]
  rollId: number
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  seatOrder: (string | null)[]
  status: "waiting" | "playing" | "finished"
  mode: LudoMode
  /** Quick game: two pawns each, entering on a 5 or a 6. */
  quick: boolean
  maxPlayers: number
  roundId: string
  turnSeat: number
  /** Moves still owed this roll; null until the seat in play rolls. */
  dice: LudoDie[] | null
  legalMoves: LudoMove[]
  /** Survives the moves so the UI can always show what was rolled. */
  lastRoll: LastRoll | null
  rollCount: number
  consecutiveDoubles: number
  /** The roll in play was doubles, so the seat rolls again once it is spent. */
  rollAgain: boolean
  turnDeadline: number | null
  lastEvent: string | null
  log: LogEntry[]
  lastMove: LastMove | null
  winner: WinnerSnapshot | null
  playerTokens: Record<string, string>
  /** People who joined mid-game; the host can seat them once the game is over. */
  spectators?: Record<string, Spectator>
}

export interface PublicPlayer {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  seat: number | null
  tokens: number[]
  isBot?: boolean
  botLevel?: BotLevel
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  seatOrder: (string | null)[]
  status: GameState["status"]
  mode: LudoMode
  quick: boolean
  maxPlayers: number
  roundId: string
  turnSeat: number
  dice: LudoDie[] | null
  legalMoves: LudoMove[]
  lastRoll: LastRoll | null
  turnDeadline: number | null
  lastEvent: string | null
  log: LogEntry[]
  lastMove: LastMove | null
  winner: WinnerSnapshot | null
  serverNow: number
  mySeat: number | null
  spectators: PublicSpectator[]
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "add-bot" }
  | { type: "remove-player"; playerId: unknown }
  | { type: "set-bot-level"; playerId: unknown; level: unknown }
  | { type: "set-mode"; mode: unknown }
  | { type: "set-quick"; quick: unknown }
  | { type: "roll"; roundId: unknown }
  | { type: "move"; moveId: unknown; roundId: unknown }
  | { type: "restart" }
  | { type: "leave" }
  | { type: "react"; reaction: unknown }
  | { type: "seat-spectator"; playerId: unknown }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "error"; message: string }
  | ReactionMessage

const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000
const TURN_TIMEOUT_MS = 45 * 1000
/** Clients tumble, show and hold each roll for ~2.6s - bots wait that out. */
const BOT_TURN_MS = 3400
/** Gap between a bot's moves within one roll, so each one can be followed. */
const BOT_STEP_MS = 1300
const BOT_NAMES = ["Ada", "Baxter", "Cleo", "Dodge"]
/** Bots react once the pawn has finished sliding. */
const BOT_REACT_MS = 1000

function freshTokens(quick: boolean): number[] {
  return Array.from({ length: tokensPerPlayer(quick) }, () => LUDO_BASE)
}

class LudoParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  reactedAt = new Map<string, number>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (!stored) return

    this.state = stored
    // Rooms saved under the old single-die Ludo rules.
    if (stored.dice !== null && !Array.isArray(stored.dice)) stored.dice = null
    if (stored.lastRoll && !Array.isArray(stored.lastRoll.values)) stored.lastRoll = null
    stored.consecutiveDoubles ??= 0
    stored.log ??= []
    stored.lastMove ??= null
    stored.rollAgain ??= false
    stored.quick ??= false
    clearSpectators(stored)
    for (const player of Object.values(stored.players)) {
      const wasConnected = player.connected !== false
      player.connected = false
      if (wasConnected || !player.disconnectedAt) {
        player.disconnectedAt = Date.now()
      }
    }
    await this.saveState()
    await this.refreshTurnAlarm()
  }

  async saveState() {
    if (this.state) await this.room.storage.put("state", this.state)
  }

  async refreshTurnAlarm() {
    if (!this.state || this.state.status !== "playing" || !this.state.turnDeadline) {
      await this.room.storage.deleteAlarm()
      return
    }
    await this.room.storage.setAlarm(this.state.turnDeadline)
  }

  seatPlayer(seat: number): Player | null {
    if (!this.state) return null
    const id = this.state.seatOrder[seat]
    return id ? (this.state.players[id] ?? null) : null
  }

  allTokens(): number[][] {
    if (!this.state) return []
    return this.state.seatOrder.map(
      (id) => (id ? this.state?.players[id]?.tokens : null) ?? freshTokens(this.state?.quick ?? false),
    )
  }

  getPublicState(playerId?: string): PublicGameState {
    if (!this.state) throw new Error("No game state")
    const players = Object.fromEntries(
      Object.entries(this.state.players).map(([id, player]) => [
        id,
        {
          id: player.id,
          name: player.name,
          joinedAt: player.joinedAt,
          connected: player.connected,
          seat: player.seat,
          tokens: [...player.tokens],
          isBot: player.isBot,
          botLevel: player.isBot ? player.botLevel ?? "normal" : undefined,
        },
      ]),
    )

    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players,
      seatOrder: [...this.state.seatOrder],
      status: this.state.status,
      mode: this.state.mode,
      quick: this.state.quick,
      maxPlayers: this.state.maxPlayers,
      roundId: this.state.roundId,
      turnSeat: this.state.turnSeat,
      dice: this.state.dice?.map((die) => ({ ...die })) ?? null,
      legalMoves: this.state.legalMoves.map((move) => ({ ...move })),
      lastRoll: this.state.lastRoll,
      turnDeadline: this.state.turnDeadline,
      lastEvent: this.state.lastEvent,
      log: this.state.log.map((entry) => ({ ...entry })),
      lastMove: this.state.lastMove,
      winner: this.state.winner,
      serverNow: Date.now(),
      mySeat: playerId ? (this.state.players[playerId]?.seat ?? null) : null,
      spectators: publicSpectators(this.state.spectators),
    }
  }

  isAuthenticated(connection: Party.Connection) {
    if (!this.state) return false
    const token = this.connectionTokens.get(connection)
    return Boolean(token && this.state.playerTokens[connection.id] === token)
  }

  humanCount(): number {
    if (!this.state) return 0
    return Object.values(this.state.players).filter((player) => !player.isBot)
      .length
  }

  pruneDisconnectedPlayers() {
    if (!this.state) return
    const cutoff = Date.now() - DISCONNECTED_PLAYER_TTL_MS
    for (const [id, player] of Object.entries(this.state.players)) {
      if (
        player.isBot ||
        player.connected !== false ||
        !player.disconnectedAt ||
        player.disconnectedAt > cutoff
      ) {
        continue
      }
      delete this.state.players[id]
      delete this.state.playerTokens[id]
    }
  }

  react(playerId: string, reaction: Reaction, delayMs?: number) {
    if (!takeReactionSlot(this.reactedAt, playerId)) return
    const message: ReactionMessage = { type: "reaction", playerId, reaction, ...(delayMs ? { delayMs } : {}) }
    this.room.broadcast(JSON.stringify(message))
  }

  /** Now and then a bot reacts to a big moment while someone is watching. */
  botReact(player: Player | null | undefined, options: readonly Reaction[], odds: number) {
    if (!player?.isBot || Math.random() >= odds) return
    if (!Object.values(this.state?.players ?? {}).some((other) => !other.isBot && other.connected !== false)) return
    this.react(player.id, pickReaction(options), BOT_REACT_MS)
  }

  send(connection: Party.Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message))
  }

  broadcastState() {
    for (const connection of this.room.getConnections()) {
      if (!this.isAuthenticated(connection)) continue
      this.send(connection, {
        type: "state",
        state: this.getPublicState(connection.id),
      })
    }
  }

  /** Bots move on a short beat; humans get the full timeout. */
  turnDeadlineFor(seat: number): number {
    const player = this.seatPlayer(seat)
    return Date.now() + (player?.isBot ? BOT_TURN_MS : TURN_TIMEOUT_MS)
  }

  /**
   * The seats this one may move. In 2v2, a player whose own tokens are all
   * home plays their partner's rather than sitting out the rest of the game.
   */
  controlledSeats(seat: number): number[] {
    if (!this.state || this.state.mode !== "teams") return [seat]
    const own = this.seatPlayer(seat)
    if (!own || !hasWon(own.tokens)) return [seat]
    const partner = getTeammateSeat(seat)
    return this.seatPlayer(partner) ? [partner] : [seat]
  }

  allySeats(seat: number): number[] {
    if (!this.state) return [seat]
    return getAllySeats(seat, this.state.mode)
  }

  /** Hand the turn to a seat with a clean dice slot. */
  beginTurn(seat: number) {
    if (!this.state) return
    this.state.turnSeat = seat
    this.state.dice = null
    this.state.legalMoves = []
    this.state.consecutiveDoubles = 0
    this.state.rollAgain = false
    this.state.turnDeadline = this.turnDeadlineFor(seat)
  }

  occupiedSeats(): number[] {
    if (!this.state) return []
    return this.state.seatOrder
      .map((id, seat) => (id && this.state?.players[id] ? seat : -1))
      .filter((seat) => seat !== -1)
  }

  /** A game cannot continue with one player - award it to whoever is left. */
  finishIfOnlyOneSideLeft(): boolean {
    if (!this.state || this.state.status !== "playing") return false
    const remaining = this.occupiedSeats()
    const sides =
      this.state.mode === "teams"
        ? new Set(remaining.map((seat) => getTeamOfSeat(seat))).size
        : remaining.length
    if (sides > 1) return false

    const survivors = remaining
      .map((seat) => this.seatPlayer(seat))
      .filter((player): player is Player => Boolean(player))
    this.state.status = "finished"
    this.state.dice = null
    this.state.legalMoves = []
    this.state.turnDeadline = null
    this.state.winner =
      survivors.length > 0
        ? {
            ids: survivors.map((player) => player.id),
            name: survivors.map((player) => player.name).join(" & "),
            seat: remaining[0],
            finishedAt: Date.now(),
          }
        : null
    this.logEvent(
      survivors.length > 0
        ? `${this.state.winner?.name} wins - everyone else left`
        : "Everyone left the game",
    )
    return true
  }

  nextSeat(seat: number): number {
    if (!this.state) return seat
    for (let step = 1; step <= LUDO_SEATS; step++) {
      const candidate = (seat + step) % LUDO_SEATS
      if (this.seatPlayer(candidate)) return candidate
    }
    return seat
  }

  endTurn() {
    if (!this.state) return
    this.beginTurn(this.nextSeat(this.state.turnSeat))
  }

  /** Show an event and keep it in the short history. */
  logEvent(text: string) {
    if (!this.state) return
    this.state.lastEvent = text
    this.state.log = [
      ...this.state.log,
      { text, rollId: this.state.rollCount ?? 0 },
    ].slice(-12)
  }

  computeMoves(): LudoMove[] {
    if (!this.state?.dice) return []
    return getPlayableMoves(
      this.controlledSeats(this.state.turnSeat),
      this.state.dice,
      this.allTokens(),
      this.allySeats(this.state.turnSeat),
      this.state.quick,
    )
  }

  /** Roll both dice for the seat in play, then wait for its moves. */
  rollForCurrentSeat() {
    if (!this.state) return
    const seat = this.state.turnSeat
    const player = this.seatPlayer(seat)
    if (!player) {
      this.endTurn()
      return
    }

    const values = rollLudoDice()
    const doubles = values[0] === values[1]
    const rollId = (this.state.rollCount ?? 0) + 1
    this.state.rollCount = rollId
    this.state.lastRoll = { seat, values, rollId }

    if (doubles) {
      this.state.consecutiveDoubles += 1
      if (this.state.consecutiveDoubles >= 3) {
        this.sendLeadPawnHome(seat)
        this.endTurn()
        return
      }
    }
    this.state.rollAgain = doubles

    const allOut = this.controlledSeats(seat).every((controlled) =>
      (this.seatPlayer(controlled)?.tokens ?? []).every(
        (position) => position !== LUDO_BASE,
      ),
    )
    this.state.dice = diceForRoll(values, allOut)
    this.state.legalMoves = this.computeMoves()
    const rolled = doubles
      ? `${player.name} rolled double ${values[0]}s`
      : `${player.name} rolled ${values[0]} and ${values[1]}`

    if (this.state.legalMoves.length === 0) {
      this.logEvent(`${rolled} and cannot move`)
      this.finishRoll()
      return
    }
    this.logEvent(rolled)
    this.state.turnDeadline = this.turnDeadlineFor(seat)
  }

  /** Three doubles in a row: the pawn furthest along goes back to the nest. */
  sendLeadPawnHome(seat: number) {
    if (!this.state) return
    const player = this.seatPlayer(seat)
    if (!player) return
    let lead = -1
    player.tokens.forEach((position, tokenIndex) => {
      if (position === LUDO_HOME_INDEX || position === LUDO_BASE) return
      if (lead === -1 || position > player.tokens[lead]) lead = tokenIndex
    })
    if (lead !== -1) player.tokens[lead] = LUDO_BASE
    this.logEvent(
      lead !== -1
        ? `${player.name} rolled three doubles - their lead pawn goes back to the nest`
        : `${player.name} rolled three doubles and loses the turn`,
    )
  }

  /** The roll is spent or stuck: roll again on doubles, else pass the turn. */
  finishRoll() {
    if (!this.state) return
    this.state.dice = null
    this.state.legalMoves = []
    if (this.state.rollAgain) {
      this.state.rollAgain = false
      this.state.turnDeadline = this.turnDeadlineFor(this.state.turnSeat)
      return
    }
    this.endTurn()
  }

  /** `auto` moves (bots, timeouts) keep the rest of the roll on the quick beat. */
  applyMove(move: LudoMove, auto = false) {
    if (!this.state?.dice) return
    const turnSeat = this.state.turnSeat
    const actor = this.seatPlayer(turnSeat)
    const player = this.seatPlayer(move.seat)
    if (!actor || !player) return

    const dice = this.state.dice.filter((_, index) => !move.dice.includes(index))
    const victim = move.captured ? this.seatPlayer(move.captured.seat) : null
    if (move.captured && victim) {
      victim.tokens[move.captured.tokenIndex] = LUDO_BASE
      dice.push({ value: LUDO_CAPTURE_BONUS, bonus: true })
    }
    if (move.finishes) dice.push({ value: LUDO_HOME_BONUS, bonus: true })
    player.tokens[move.tokenIndex] = move.to
    this.state.dice = dice
    this.state.lastMove = {
      seat: move.seat,
      tokenIndex: move.tokenIndex,
      from: move.from,
      to: move.to,
      captured: Boolean(victim),
      finishes: move.finishes,
      moveId: (this.state.lastMove?.moveId ?? 0) + 1,
    }

    const moved =
      move.seat === turnSeat ? actor.name : `${actor.name} (for ${player.name})`
    if (victim) {
      this.logEvent(`${moved} captured ${victim.name} - bonus ${LUDO_CAPTURE_BONUS}`)
    } else if (move.finishes) {
      this.logEvent(`${moved} brought a pawn home - bonus ${LUDO_HOME_BONUS}`)
    } else if (move.from === LUDO_BASE) {
      this.logEvent(`${moved} entered a pawn`)
    }

    if (victim) {
      this.botReact(victim, ["😤", "😱"], 0.6)
      this.botReact(actor, ["😂", "🔥"], 0.3)
    }

    const winner = this.findWinner()
    if (winner) {
      const bots = Object.values(this.state.players).filter((other) => other.isBot && other.seat !== null)
      const botWinner = bots.find((bot) => winner.ids.includes(bot.id))
      if (botWinner) this.botReact(botWinner, ["GG", "🔥"], 0.7)
      else this.botReact(bots[Math.floor(Math.random() * bots.length)], ["GG", "👏"], 0.7)
      this.state.status = "finished"
      this.state.dice = null
      this.state.legalMoves = []
      this.state.turnDeadline = null
      this.state.winner = winner
      this.logEvent(`${winner.name} got every pawn home`)
      return
    }

    this.state.legalMoves = this.computeMoves()
    if (this.state.legalMoves.length === 0) {
      this.finishRoll()
      return
    }
    this.state.turnDeadline =
      auto || actor.isBot ? Date.now() + BOT_STEP_MS : this.turnDeadlineFor(turnSeat)
  }

  /** In 2v2 both partners must be home; in classic one player is enough. */
  findWinner(): WinnerSnapshot | null {
    if (!this.state) return null
    if (this.state.mode === "teams") {
      for (const team of [0, 1]) {
        const seats = this.occupiedSeats().filter(
          (seat) => getTeamOfSeat(seat) === team,
        )
        const members = seats
          .map((seat) => this.seatPlayer(seat))
          .filter((player): player is Player => Boolean(player))
        if (members.length === 0) continue
        if (!members.every((member) => hasWon(member.tokens))) continue
        return {
          ids: members.map((member) => member.id),
          name: members.map((member) => member.name).join(" & "),
          seat: seats[0],
          finishedAt: Date.now(),
        }
      }
      return null
    }
    for (const seat of this.occupiedSeats()) {
      const player = this.seatPlayer(seat)
      if (player && hasWon(player.tokens)) {
        return {
          ids: [player.id],
          name: player.name,
          seat,
          finishedAt: Date.now(),
        }
      }
    }
    return null
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, "ludo")
    if (gameNight.mode === "invalid") {
      this.send(connection, { type: "error", message: "Game not found" })
      return
    }
    if (gameNight.mode === "game-night") this.gameNightMembers.set(connection, gameNight.member)
    const url = new URL(context.request.url)
    const playerToken = url.searchParams.get("playerToken") ?? ""
    if (playerToken) this.connectionTokens.set(connection, playerToken)

    const canCreate = gameNight.mode === "game-night"
      ? gameNight.member.isHost
      : url.searchParams.get("host") === "true"
    if (canCreate && !this.state) {
      this.state = {
        roomCode: this.room.id,
        hostId: connection.id,
        players: {},
        seatOrder: Array.from({ length: LUDO_SEATS }, () => null),
        status: "waiting",
        mode: "classic",
        quick: false,
        maxPlayers: LUDO_SEATS,
        roundId: crypto.randomUUID(),
        turnSeat: 0,
        dice: null,
        legalMoves: [],
        lastRoll: null,
        rollCount: 0,
        consecutiveDoubles: 0,
        rollAgain: false,
        turnDeadline: null,
        lastEvent: null,
        log: [],
        lastMove: null,
        winner: null,
        playerTokens: {},
      }
      await this.saveState()
    }

    if (!this.state) {
      this.send(connection, { type: "error", message: "Game not found" })
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return

    try {
      const data = JSON.parse(message) as ClientMessage

      if (data.type !== "join" && !this.isAuthenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }

      // Spectators only watch: the one thing they can do besides joining is leave.
      if (data.type !== "join" && this.state.spectators?.[sender.id]) {
        if (data.type === "leave") {
          dropSpectator(this.state, sender.id)
          await this.saveState()
          this.broadcastState()
        }
        return
      }

      switch (data.type) {
        case "join": {
          const gameNightMember = this.gameNightMembers.get(sender)
          const playerToken = this.connectionTokens.get(sender)
          if (!playerToken) {
            this.send(sender, { type: "error", message: "Invalid player session" })
            return
          }

          const returning = this.state.players[sender.id]
          if (returning) {
            if (this.state.playerTokens[sender.id] !== playerToken) {
              this.send(sender, { type: "error", message: "Invalid player session" })
              return
            }
            markConnected(this.state.players, sender.id)
            returning.name = gameNightMember?.name ?? (data.name.trim().slice(0, 20) || returning.name)
            returning.disconnectedAt = null
            if (
              !this.state.hostId ||
              !isPresent(this.state.players[this.state.hostId])
            ) {
              this.state.hostId = sender.id
            }
            await this.saveState()
            this.broadcastState()
            return
          }

          const watching = this.state.spectators?.[sender.id]
          if (watching) {
            if (this.state.playerTokens[sender.id] !== playerToken) {
              this.send(sender, { type: "error", message: "Invalid player session" })
              return
            }
            watching.name = gameNightMember?.name ?? (data.name.trim().slice(0, 20) || watching.name)
            await this.saveState()
            this.broadcastState()
            return
          }

          if (this.state.status !== "waiting") {
            const name = gameNightMember?.name ?? data.name.trim().slice(0, 20)
            if (!name) {
              this.send(sender, { type: "error", message: "Enter a player name" })
              return
            }
            this.state.spectators ??= {}
            if (Object.keys(this.state.spectators).length >= MAX_SPECTATORS) {
              this.send(sender, { type: "error", message: "Too many people are watching" })
              return
            }
            this.state.spectators[sender.id] = { id: sender.id, name, joinedAt: Date.now() }
            this.state.playerTokens[sender.id] = playerToken
            await this.saveState()
            this.broadcastState()
            return
          }
          if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
            this.pruneDisconnectedPlayers()
          }
          if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
            this.send(sender, { type: "error", message: "Game is full" })
            return
          }

          const name = gameNightMember?.name ?? data.name.trim().slice(0, 20)
          if (!name) {
            this.send(sender, { type: "error", message: "Enter a player name" })
            return
          }

          this.state.players[sender.id] = {
            id: sender.id,
            name,
            joinedAt: Date.now(),
            connected: true,
            disconnectedAt: null,
            seat: null,
            tokens: freshTokens(this.state.quick),
          }
          this.state.playerTokens[sender.id] = playerToken
          if (
            !this.state.hostId ||
            !isPresent(this.state.players[this.state.hostId])
          ) {
            this.state.hostId = sender.id
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "seat-spectator": {
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can seat spectators" })
            return
          }
          if (this.state.status === "playing") {
            this.send(sender, { type: "error", message: "Seat them once this game is over" })
            return
          }
          const spectator =
            typeof data.playerId === "string"
              ? this.state.spectators?.[data.playerId]
              : undefined
          if (!spectator) {
            this.send(sender, { type: "error", message: "They're no longer watching" })
            return
          }
          if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
            this.pruneDisconnectedPlayers()
          }
          if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
            this.send(sender, { type: "error", message: "No empty seats" })
            return
          }
          delete this.state.spectators![spectator.id]
          this.state.players[spectator.id] = {
            id: spectator.id,
            name: spectator.name,
            joinedAt: Date.now(),
            connected: true,
            disconnectedAt: null,
            seat: null,
            tokens: freshTokens(this.state.quick),
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "add-bot": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can add bots" })
            return
          }
          if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
            this.send(sender, { type: "error", message: "Game is full" })
            return
          }

          const taken = new Set(
            Object.values(this.state.players).map((player) => player.name),
          )
          const name = BOT_NAMES.find((candidate) => !taken.has(candidate))
          const id = `bot-${crypto.randomUUID().slice(0, 8)}`
          this.state.players[id] = {
            id,
            name: name ?? `Bot ${Object.keys(this.state.players).length + 1}`,
            joinedAt: Date.now(),
            connected: true,
            disconnectedAt: null,
            seat: null,
            tokens: freshTokens(this.state.quick),
            isBot: true,
            botLevel: "normal",
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "remove-player": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can remove players" })
            return
          }
          const target =
            typeof data.playerId === "string"
              ? this.state.players[data.playerId]
              : undefined
          if (!target || !target.isBot) {
            this.send(sender, { type: "error", message: "Only bots can be removed" })
            return
          }
          delete this.state.players[target.id]
          await this.saveState()
          this.broadcastState()
          return
        }

        case "set-bot-level": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can change bots" })
            return
          }
          const bot =
            typeof data.playerId === "string"
              ? this.state.players[data.playerId]
              : undefined
          if (!bot?.isBot || !isBotLevel(data.level)) {
            this.send(sender, { type: "error", message: "Only bots have a level" })
            return
          }
          bot.botLevel = data.level
          await this.saveState()
          this.broadcastState()
          return
        }

        case "set-mode": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can change the mode" })
            return
          }
          if (data.mode !== "classic" && data.mode !== "teams") {
            this.send(sender, { type: "error", message: "Unknown mode" })
            return
          }
          this.state.mode = data.mode
          await this.saveState()
          this.broadcastState()
          return
        }

        case "set-quick": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can change the mode" })
            return
          }
          if (typeof data.quick !== "boolean") {
            this.send(sender, { type: "error", message: "Unknown mode" })
            return
          }
          this.state.quick = data.quick
          for (const player of Object.values(this.state.players)) {
            player.tokens = freshTokens(this.state.quick)
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "start": {
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game is not waiting to start" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can start" })
            return
          }
          if (presentCount(this.state.players) < 2) {
            this.send(sender, { type: "error", message: "Need at least 2 players" })
            return
          }
          if (
            this.state.mode === "teams" &&
            presentCount(this.state.players) !== LUDO_SEATS
          ) {
            this.send(sender, {
              type: "error",
              message: "Teams need exactly 4 players",
            })
            return
          }

          for (const player of Object.values(this.state.players)) {
            if (player.connected === false) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            }
          }
          const seated = Object.values(this.state.players).sort(
            (left, right) => left.joinedAt - right.joinedAt,
          )
          const seatOrder: (string | null)[] = Array.from(
            { length: LUDO_SEATS },
            () => null,
          )
          seated.forEach((player, index) => {
            player.seat = index
            player.tokens = freshTokens(this.state.quick)
            seatOrder[index] = player.id
          })
          this.state.seatOrder = seatOrder

          this.state.status = "playing"
          this.state.roundId = crypto.randomUUID()
          this.state.lastRoll = null
          this.state.winner = null
          this.state.lastEvent = null
          this.state.log = []
          this.state.lastMove = null
          this.beginTurn(0)
          await this.saveState()
          await this.refreshTurnAlarm()
          this.broadcastState()
          return
        }

        case "roll": {
          if (this.state.status !== "playing") return
          if (data.roundId !== this.state.roundId) return
          const player = this.state.players[sender.id]
          if (!player || player.seat !== this.state.turnSeat) {
            this.send(sender, { type: "error", message: "It is not your turn" })
            return
          }
          if (this.state.dice !== null) {
            this.send(sender, { type: "error", message: "Use your dice first" })
            return
          }

          this.rollForCurrentSeat()
          await this.saveState()
          await this.refreshTurnAlarm()
          this.broadcastState()
          return
        }

        case "move": {
          if (this.state.status !== "playing") return
          if (data.roundId !== this.state.roundId) return
          const player = this.state.players[sender.id]
          if (!player || player.seat !== this.state.turnSeat) {
            this.send(sender, { type: "error", message: "It is not your turn" })
            return
          }
          const move = this.state.legalMoves.find(
            (candidate) => candidate.id === data.moveId,
          )
          if (!move) {
            this.send(sender, { type: "error", message: "That pawn cannot move" })
            return
          }

          this.applyMove(move)
          await this.saveState()
          await this.refreshTurnAlarm()
          this.broadcastState()
          return
        }

        case "react": {
          if (this.state.players[sender.id] && isReaction(data.reaction)) this.react(sender.id, data.reaction)
          return
        }

        case "restart": {
          if (this.state.status !== "finished") {
            this.send(sender, { type: "error", message: "The game is still active" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can restart" })
            return
          }

          this.state.status = "waiting"
          this.state.roundId = crypto.randomUUID()
          this.state.seatOrder = Array.from({ length: LUDO_SEATS }, () => null)
          this.state.rollCount = 0
          this.state.turnSeat = 0
          this.state.dice = null
          this.state.legalMoves = []
          this.state.lastRoll = null
          this.state.consecutiveDoubles = 0
          this.state.rollAgain = false
          this.state.turnDeadline = null
          this.state.lastEvent = null
          this.state.log = []
          this.state.lastMove = null
          this.state.winner = null
          for (const player of Object.values(this.state.players)) {
            player.seat = null
            player.tokens = freshTokens(this.state.quick)
          }
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "leave": {
          const leaving = this.state.players[sender.id]
          const wasTurn =
            this.state.status === "playing" && leaving?.seat === this.state.turnSeat
          if (leaving && leaving.seat !== null) {
            this.state.seatOrder[leaving.seat] = null
          }
          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]
          if (Object.keys(this.state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (sender.id === this.state.hostId) {
            this.state.hostId = nextHost(this.state.players, sender.id) ?? ""
          }
          if (this.humanCount() === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (!this.finishIfOnlyOneSideLeft() && wasTurn) this.endTurn()
          await this.saveState()
          await this.refreshTurnAlarm()
          this.broadcastState()
          return
        }
      }
    } catch (error) {
      console.error("Ludo message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    if (!this.state || this.state.status !== "playing") return
    if (!this.state.turnDeadline || this.state.turnDeadline > Date.now()) {
      await this.refreshTurnAlarm()
      return
    }

    if (this.state.dice === null) {
      this.rollForCurrentSeat()
    } else if (this.state.legalMoves.length > 0) {
      // Timed-out humans get the normal pick; bots play at their level.
      const actor = this.seatPlayer(this.state.turnSeat)
      const move = actor?.isBot
        ? chooseBotMove(
            this.state.legalMoves,
            actor.botLevel ?? "normal",
            this.allTokens(),
            this.allySeats(this.state.turnSeat),
          )
        : chooseBestMove(this.state.legalMoves)
      this.applyMove(move ?? this.state.legalMoves[0], true)
    } else {
      this.finishRoll()
    }
    await this.saveState()
    await this.refreshTurnAlarm()
    this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "ludo")
    if (!match) return new Response("Not found", { status: 404 })
    const finished = this.state?.status === "finished"
    const winnerIds =
      finished && this.state?.winner
        ? this.state.winner.ids.filter(
            (id) => this.state?.players[id]?.isBot !== true,
          )
        : []
    return Response.json({ finished, scored: true, winnerIds })
  }

  async onClose(connection: Party.Connection) {
    if (!this.state) return
    const replacementIsOpen = Array.from(this.room.getConnections()).some(
      (candidate) => candidate.id === connection.id && candidate !== connection,
    )
    if (replacementIsOpen) return
    if (dropSpectator(this.state, connection.id)) {
      await this.saveState()
      this.broadcastState()
      return
    }
    if (!this.state.players[connection.id]) return

    markDisconnected(this.state.players, connection.id)
    this.state.players[connection.id].disconnectedAt = Date.now()
    if (connection.id === this.state.hostId) {
      const replacement = nextHost(this.state.players, connection.id)
      if (replacement) this.state.hostId = replacement
    }
    await this.saveState()
    this.broadcastState()
  }
}

export default withRoomCleanup(LudoParty, "ludo")
