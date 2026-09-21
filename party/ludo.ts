import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  chooseBestMove,
  getAllySeats,
  getCapturedTokens,
  getLegalMoves,
  getTeammateSeat,
  getTeamOfSeat,
  hasWon,
  LUDO_BASE,
  LUDO_SEATS,
  LUDO_TOKENS_PER_PLAYER,
  rollLudoDice,
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

export interface Player {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
  seat: number | null
  tokens: number[]
  isBot?: boolean
}

export interface WinnerSnapshot {
  /** One id in classic, both partners in 2v2. Bots are included. */
  ids: string[]
  name: string
  seat: number
  finishedAt: number
}

export interface LastRoll {
  seat: number
  value: number
  rollId: number
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  seatOrder: (string | null)[]
  status: "waiting" | "playing" | "finished"
  mode: LudoMode
  maxPlayers: number
  roundId: string
  turnSeat: number
  dice: number | null
  legalMoves: LudoMove[]
  /** Survives the auto-played move so the UI can always show what was rolled. */
  lastRoll: LastRoll | null
  rollCount: number
  consecutiveSixes: number
  turnDeadline: number | null
  lastEvent: string | null
  winner: WinnerSnapshot | null
  playerTokens: Record<string, string>
}

export interface PublicPlayer {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  seat: number | null
  tokens: number[]
  isBot?: boolean
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  seatOrder: (string | null)[]
  status: GameState["status"]
  mode: LudoMode
  maxPlayers: number
  roundId: string
  turnSeat: number
  dice: number | null
  legalMoves: LudoMove[]
  lastRoll: LastRoll | null
  turnDeadline: number | null
  lastEvent: string | null
  winner: WinnerSnapshot | null
  serverNow: number
  mySeat: number | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "add-bot" }
  | { type: "remove-player"; playerId: unknown }
  | { type: "set-mode"; mode: unknown }
  | { type: "roll"; roundId: unknown }
  | { type: "move"; seat: unknown; tokenIndex: unknown; roundId: unknown }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "error"; message: string }

const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000
const TURN_TIMEOUT_MS = 45 * 1000
/** Long enough to read the roll, short enough not to feel like a stall. */
const BOT_TURN_MS = 1400
const BOT_NAMES = ["Ada", "Baxter", "Cleo", "Dodge"]

function freshTokens(): number[] {
  return Array.from({ length: LUDO_TOKENS_PER_PLAYER }, () => LUDO_BASE)
}

class LudoParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (!stored) return

    this.state = stored
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
      (id) => (id ? this.state?.players[id]?.tokens : null) ?? freshTokens(),
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
      maxPlayers: this.state.maxPlayers,
      roundId: this.state.roundId,
      turnSeat: this.state.turnSeat,
      dice: this.state.dice,
      legalMoves: this.state.legalMoves.map((move) => ({ ...move })),
      lastRoll: this.state.lastRoll,
      turnDeadline: this.state.turnDeadline,
      lastEvent: this.state.lastEvent,
      winner: this.state.winner,
      serverNow: Date.now(),
      mySeat: playerId ? (this.state.players[playerId]?.seat ?? null) : null,
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
    this.state.consecutiveSixes = 0
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
    this.state.lastEvent =
      survivors.length > 0
        ? `${this.state.winner?.name} wins - everyone else left`
        : "Everyone left the game"
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

  /** Roll for the seat in play, then auto-resolve or await a token choice. */
  rollForCurrentSeat() {
    if (!this.state) return
    const player = this.seatPlayer(this.state.turnSeat)
    if (!player) {
      this.endTurn()
      return
    }

    const dice = rollLudoDice()
    const rollId = (this.state.rollCount ?? 0) + 1
    this.state.rollCount = rollId
    this.state.lastRoll = { seat: this.state.turnSeat, value: dice, rollId }
    this.state.dice = dice
    this.state.turnDeadline = this.turnDeadlineFor(this.state.turnSeat)
    const sixes = dice === 6 ? this.state.consecutiveSixes + 1 : 0
    this.state.consecutiveSixes = sixes

    if (sixes >= 3) {
      this.state.lastEvent = `${player.name} rolled three sixes and forfeits the turn`
      this.endTurn()
      return
    }

    const moves = getLegalMoves(
      this.controlledSeats(this.state.turnSeat),
      dice,
      this.allTokens(),
      this.allySeats(this.state.turnSeat),
    )
    this.state.legalMoves = moves

    if (moves.length === 0) {
      this.state.lastEvent = `${player.name} rolled ${dice} and cannot move`
      this.endTurn()
      return
    }
    this.state.lastEvent = `${player.name} rolled ${dice}`
    if (moves.length === 1) {
      this.applyMove(moves[0])
    } else if (player.isBot) {
      const choice = chooseBestMove(moves)
      if (choice) this.applyMove(choice)
    }
  }

  applyMove(move: LudoMove) {
    if (!this.state) return
    const turnSeat = this.state.turnSeat
    const actor = this.seatPlayer(turnSeat)
    const player = this.seatPlayer(move.seat)
    if (!actor || !player) return

    const captured = getCapturedTokens(
      move.seat,
      move.to,
      this.allTokens(),
      this.allySeats(turnSeat),
    )
    for (const target of captured) {
      const victim = this.seatPlayer(target.seat)
      if (victim) victim.tokens[target.tokenIndex] = LUDO_BASE
    }
    player.tokens[move.tokenIndex] = move.to

    const capturedNames = [
      ...new Set(
        captured
          .map((target) => this.seatPlayer(target.seat)?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ]
    const moved =
      move.seat === turnSeat ? actor.name : `${actor.name} (for ${player.name})`
    if (capturedNames.length > 0) {
      this.state.lastEvent = `${moved} knocked out ${capturedNames.join(", ")}`
    } else if (move.finishes) {
      this.state.lastEvent = `${moved} brought a token home`
    } else if (move.from === LUDO_BASE) {
      this.state.lastEvent = `${moved} released a token`
    }

    const winner = this.findWinner()
    if (winner) {
      this.state.status = "finished"
      this.state.dice = null
      this.state.legalMoves = []
      this.state.turnDeadline = null
      this.state.winner = winner
      this.state.lastEvent = `${winner.name} got every token home`
      return
    }

    const extraTurn =
      this.state.dice === 6 || captured.length > 0 || move.finishes
    if (extraTurn) {
      this.state.dice = null
      this.state.legalMoves = []
      this.state.turnDeadline = this.turnDeadlineFor(turnSeat)
      return
    }
    this.endTurn()
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
        maxPlayers: LUDO_SEATS,
        roundId: crypto.randomUUID(),
        turnSeat: 0,
        dice: null,
        legalMoves: [],
        lastRoll: null,
        rollCount: 0,
        consecutiveSixes: 0,
        turnDeadline: null,
        lastEvent: null,
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

          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
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
            tokens: freshTokens(),
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
            tokens: freshTokens(),
            isBot: true,
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
            player.tokens = freshTokens()
            seatOrder[index] = player.id
          })
          this.state.seatOrder = seatOrder

          this.state.status = "playing"
          this.state.roundId = crypto.randomUUID()
          this.state.lastRoll = null
          this.state.winner = null
          this.state.lastEvent = null
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
            this.send(sender, { type: "error", message: "Move a token first" })
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
            (candidate) =>
              candidate.tokenIndex === data.tokenIndex &&
              candidate.seat === data.seat,
          )
          if (!move) {
            this.send(sender, { type: "error", message: "That token cannot move" })
            return
          }

          this.applyMove(move)
          await this.saveState()
          await this.refreshTurnAlarm()
          this.broadcastState()
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
          this.state.consecutiveSixes = 0
          this.state.turnDeadline = null
          this.state.lastEvent = null
          this.state.winner = null
          for (const player of Object.values(this.state.players)) {
            player.seat = null
            player.tokens = freshTokens()
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
      this.applyMove(
        chooseBestMove(this.state.legalMoves) ?? this.state.legalMoves[0],
      )
    } else {
      this.endTurn()
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
    if (!this.state?.players[connection.id]) return
    const replacementIsOpen = Array.from(this.room.getConnections()).some(
      (candidate) => candidate.id === connection.id && candidate !== connection,
    )
    if (replacementIsOpen) return

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
