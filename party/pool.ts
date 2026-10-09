import type * as Party from "partykit/server"
import { JoinVerifier, reportResult } from "./shared/account"
import { withRoomCleanup } from "./shared/cleanup"
import { isBotLevel, type BotLevel } from "../src/lib/botLevel"
import { isReaction, pickReaction, takeReactionSlot, type Reaction, type ReactionMessage } from "../src/lib/reactions"
import {
  chooseBotShot,
  defaultCueSpot,
  FOUL_TEXT,
  isOnEight,
  isValidPlacement,
  judgeShot,
  otherGroup,
  POCKET_NAMES,
  rackBalls,
  respotEight,
  simulateShot,
  speedFromPower,
  type BallInHand,
  type PlannedShot,
  type PoolBall,
  type PoolGroup,
} from "../src/lib/pool"
import { canControlGame, isPresent, markConnected, markDisconnected, nextHost, presentCount } from "./shared/presence"
import { clearSpectators, dropSpectator, MAX_SPECTATORS, publicSpectators, type PublicSpectator, type Spectator } from "./shared/spectators"

export interface Player {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
  seat: number | null
  isBot?: boolean
  botLevel?: BotLevel
  /** Clerk user id for signed-in players; never sent to clients. */
  userId?: string
  /** Public profile id; opens their profile card. */
  profileId?: string
  color?: string
  /** Cue id from their profile, drawn whenever they shoot. */
  cue?: string
}

export interface PoolShotRecord {
  id: number
  seat: number
  /** The table the shot was played from, cue ball already placed. */
  before: PoolBall[]
  dirX: number
  dirY: number
  speed: number
  spinX: number
  spinY: number
  startedAt: number
  durationMs: number
}

export interface PoolResult {
  shotId: number
  text: string
  foul: boolean
}

export interface LogEntry {
  text: string
  /** Held back by clients until this shot has finished rolling. */
  shotId: number
  tone: "info" | "pot" | "foul" | "win"
}

export interface PoolWinner {
  id: string
  name: string
  seat: number
  reason: string
}

/** A bot's next shot, shown as its cue lining up before it plays. */
export interface BotAim {
  dirX: number
  dirY: number
  spinY: number
  x: number | null
  y: number | null
}

interface PendingOutcome {
  balls: PoolBall[]
  groups: (PoolGroup | null)[]
  nextSeat: number
  ballInHand: BallInHand | null
  winner: PoolWinner | null
  logs: LogEntry[]
  result: PoolResult
  reactions: { playerId: string; options: Reaction[]; odds: number }[]
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  seatOrder: (string | null)[]
  status: "waiting" | "playing" | "finished"
  roundId: string
  rack: number
  breakerSeat: number
  balls: PoolBall[]
  groups: (PoolGroup | null)[]
  turnSeat: number
  turnId: number
  phase: "aim" | "rolling"
  ballInHand: BallInHand | null
  isBreak: boolean
  turnDeadline: number | null
  shotEndsAt: number | null
  shotCount: number
  shot: PoolShotRecord | null
  pending: PendingOutcome | null
  botPlan: PlannedShot | null
  result: PoolResult | null
  log: LogEntry[]
  winner: PoolWinner | null
  /** Racks won since the lobby, by player id. */
  wins: Record<string, number>
  playerTokens: Record<string, string>
  spectators?: Record<string, Spectator>
}

export interface PublicPlayer {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  seat: number | null
  isBot?: boolean
  botLevel?: BotLevel
  /** Signed in: the name is their profile name and can't be spoofed. */
  verified?: boolean
  profileId?: string
  color?: string
  cue?: string
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  seatOrder: (string | null)[]
  status: GameState["status"]
  roundId: string
  rack: number
  breakerSeat: number
  balls: PoolBall[]
  groups: (PoolGroup | null)[]
  turnSeat: number
  turnId: number
  phase: GameState["phase"]
  ballInHand: BallInHand | null
  isBreak: boolean
  turnDeadline: number | null
  shot: PoolShotRecord | null
  botAim: BotAim | null
  result: PoolResult | null
  log: LogEntry[]
  winner: PoolWinner | null
  wins: Record<string, number>
  serverNow: number
  mySeat: number | null
  spectators: PublicSpectator[]
}

export type ClientMessage =
  | { type: "join"; name: string; authToken?: unknown }
  | { type: "start" }
  | { type: "add-bot"; level?: unknown }
  | { type: "remove-player"; playerId: unknown }
  | { type: "set-bot-level"; playerId: unknown; level: unknown }
  | { type: "aim"; turnId: unknown; dirX: unknown; dirY: unknown; pull: unknown; x?: unknown; y?: unknown; spinX: unknown; spinY: unknown }
  | { type: "shoot"; turnId: unknown; dirX: unknown; dirY: unknown; power: unknown; spinX: unknown; spinY: unknown; x?: unknown; y?: unknown; pocket?: unknown }
  | { type: "restart" }
  | { type: "leave" }
  | { type: "react"; reaction: unknown }
  | { type: "seat-spectator"; playerId: unknown }

export interface AimMessage {
  type: "aim"
  turnId: number
  seat: number
  dirX: number
  dirY: number
  pull: number
  x: number | null
  y: number | null
  spinX: number
  spinY: number
}

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "error"; message: string }
  | ReactionMessage
  | AimMessage

export const POOL_SEATS = 2
const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000
export const POOL_TURN_MS = 60 * 1000
/** Balls rest on screen this long before the next turn, so everyone sees how it ended. */
const SETTLE_MS = 1300
const BOT_THINK_MS = 2400
const BOT_NAMES = ["Chalky", "Rex", "Dot"]
const BOT_REACT_MS = 600
const AIM_RELAY_MS = 50
/** After an alarm error, try again this soon instead of re-firing on a time that has already passed. */
const ALARM_RETRY_MS = 2000

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function ballList(numbers: number[]) {
  if (numbers.length === 1) return `the ${numbers[0]}`
  return `the ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`
}

class PoolParty implements Party.Server {
  constructor(readonly room: Party.Room) {
    this.joins = new JoinVerifier(room)
  }

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  joins: JoinVerifier
  reactedAt = new Map<string, number>()
  aimedAt = new Map<string, number>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (!stored) return
    this.state = stored
    clearSpectators(stored)
    for (const player of Object.values(stored.players)) {
      const wasConnected = player.connected !== false
      player.connected = false
      if (wasConnected || !player.disconnectedAt) player.disconnectedAt = Date.now()
    }
    await this.saveState()
    await this.refreshAlarm()
  }

  async saveState() {
    if (this.state) await this.room.storage.put("state", this.state)
  }

  async refreshAlarm() {
    const state = this.state
    // A table in play always has a next step: a missing time means it is due now. Dropping the alarm here froze the table.
    const at = state?.status === "playing" ? ((state.phase === "rolling" ? state.shotEndsAt : state.turnDeadline) ?? Date.now()) : null
    if (!at) {
      await this.room.storage.deleteAlarm()
      return
    }
    await this.room.storage.setAlarm(at)
  }

  seatPlayer(seat: number): Player | null {
    const id = this.state?.seatOrder[seat]
    return id ? (this.state?.players[id] ?? null) : null
  }

  getPublicState(playerId?: string): PublicGameState {
    const state = this.state
    if (!state) throw new Error("No game state")
    const players = Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [
        id,
        {
          id: player.id,
          name: player.name,
          joinedAt: player.joinedAt,
          connected: player.connected,
          seat: player.seat,
          isBot: player.isBot,
          botLevel: player.isBot ? (player.botLevel ?? "normal") : undefined,
          verified: player.userId ? true : undefined,
          profileId: player.profileId,
          color: player.color,
          cue: player.cue,
        },
      ]),
    )
    const plan = state.phase === "aim" ? state.botPlan : null
    return {
      roomCode: state.roomCode,
      hostId: state.hostId,
      players,
      seatOrder: [...state.seatOrder],
      status: state.status,
      roundId: state.roundId,
      rack: state.rack,
      breakerSeat: state.breakerSeat,
      balls: state.balls.map((ball) => ({ ...ball })),
      groups: [...state.groups],
      turnSeat: state.turnSeat,
      turnId: state.turnId,
      phase: state.phase,
      ballInHand: state.ballInHand,
      isBreak: state.isBreak,
      turnDeadline: state.turnDeadline,
      shot: state.shot,
      botAim: plan ? { dirX: plan.dirX, dirY: plan.dirY, spinY: plan.spinY, x: plan.cue?.x ?? null, y: plan.cue?.y ?? null } : null,
      result: state.result,
      log: state.log.map((entry) => ({ ...entry })),
      winner: state.winner,
      wins: { ...state.wins },
      serverNow: Date.now(),
      mySeat: playerId ? (state.players[playerId]?.seat ?? null) : null,
      spectators: publicSpectators(state.spectators),
    }
  }

  isAuthenticated(connection: Party.Connection) {
    if (!this.state) return false
    const token = this.connectionTokens.get(connection)
    return Boolean(token && this.state.playerTokens[connection.id] === token)
  }

  humanCount(): number {
    return Object.values(this.state?.players ?? {}).filter((player) => !player.isBot).length
  }

  pruneDisconnectedPlayers() {
    if (!this.state) return
    const cutoff = Date.now() - DISCONNECTED_PLAYER_TTL_MS
    for (const [id, player] of Object.entries(this.state.players)) {
      if (player.isBot || player.connected !== false || !player.disconnectedAt || player.disconnectedAt > cutoff) continue
      delete this.state.players[id]
      delete this.state.playerTokens[id]
    }
  }

  react(playerId: string, reaction: Reaction, delayMs?: number) {
    if (!takeReactionSlot(this.reactedAt, playerId)) return
    const message: ReactionMessage = { type: "reaction", playerId, reaction, ...(delayMs ? { delayMs } : {}) }
    this.room.broadcast(JSON.stringify(message))
  }

  send(connection: Party.Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message))
  }

  broadcastState() {
    for (const connection of this.room.getConnections()) {
      if (!this.isAuthenticated(connection)) continue
      this.send(connection, { type: "state", state: this.getPublicState(connection.id) })
    }
  }

  logEntry(text: string, tone: LogEntry["tone"], shotId = this.state?.shotCount ?? 0): LogEntry {
    return { text, tone, shotId }
  }

  pushLog(entries: LogEntry[]) {
    if (!this.state) return
    this.state.log = [...this.state.log, ...entries].slice(-30)
  }

  startRack() {
    const state = this.state
    if (!state) return
    state.status = "playing"
    state.rack += 1
    state.roundId = crypto.randomUUID()
    state.balls = rackBalls()
    state.groups = [null, null]
    state.isBreak = true
    state.shot = null
    state.pending = null
    state.result = null
    state.winner = null
    state.log = []
    const breaker = this.seatPlayer(state.breakerSeat)
    this.pushLog([this.logEntry(`Rack ${state.rack} - ${breaker?.name ?? "Someone"} breaks`, "info")])
    this.beginTurn(state.breakerSeat, "kitchen")
  }

  beginTurn(seat: number, ballInHand: BallInHand | null) {
    const state = this.state
    if (!state) return
    state.turnSeat = seat
    state.turnId += 1
    state.phase = "aim"
    state.ballInHand = ballInHand
    state.shotEndsAt = null
    const player = this.seatPlayer(seat)
    if (player?.isBot) {
      try {
        state.botPlan = chooseBotShot(state.balls, {
          group: state.groups[seat],
          isBreak: state.isBreak,
          ballInHand,
          level: player.botLevel ?? "normal",
        })
      } catch (error) {
        // Without a plan the bot just runs out of time, which still moves the game on.
        console.error("Pool bot could not plan a shot", error)
        state.botPlan = null
      }
      state.turnDeadline = Date.now() + BOT_THINK_MS + Math.random() * 900 + (ballInHand ? 700 : 0)
    } else {
      state.botPlan = null
      state.turnDeadline = Date.now() + POOL_TURN_MS
    }
  }

  /** Plays a shot for the seat in turn. Returns an error for the shooter, or null once it is rolling. */
  takeShot(seat: number, input: { dirX: number; dirY: number; power: number; spinX: number; spinY: number; cue: { x: number; y: number } | null; pocket: number | null }): string | null {
    const state = this.state
    if (!state) return "No game"
    const shooter = this.seatPlayer(seat)
    const opponentSeat = 1 - seat
    const opponent = this.seatPlayer(opponentSeat)
    if (!shooter) return "No shooter"

    let before = state.balls.map((ball) => ({ ...ball }))
    if (state.ballInHand) {
      const wanted = input.cue
      const valid = wanted !== null && isValidPlacement(before, wanted.x, wanted.y, state.ballInHand)
      if (wanted && !valid && !shooter.isBot) return state.ballInHand === "kitchen" ? "Place the cue ball behind the line" : "The cue ball can't go there"
      const spot = valid && wanted ? wanted : defaultCueSpot(before, state.ballInHand)
      before = before.map((ball) => (ball.n === 0 ? { n: 0, x: spot.x, y: spot.y, down: false } : ball))
    }

    const length = Math.sqrt(input.dirX * input.dirX + input.dirY * input.dirY)
    if (!(length > 0)) return "Pick a direction"
    const shot = {
      dirX: input.dirX / length,
      dirY: input.dirY / length,
      speed: speedFromPower(input.power),
      spinX: clamp(input.spinX, -1, 1),
      spinY: clamp(input.spinY, -1, 1),
    }
    const group = state.groups[seat]
    const onEight = !state.isBreak && isOnEight(before, group)
    const calledPocket = onEight && input.pocket !== null ? input.pocket : null
    const result = simulateShot(before, shot)
    const judged = judgeShot(before, result, { group, isBreak: state.isBreak, calledPocket })
    const shotId = state.shotCount + 1

    let balls = result.balls
    if (judged.eight === "respot") balls = respotEight(balls)
    const groups = [...state.groups]
    if (judged.assigned) {
      groups[seat] = judged.assigned
      groups[opponentSeat] = otherGroup(judged.assigned)
    }

    const logs: LogEntry[] = []
    const reactions: PendingOutcome["reactions"] = []
    const name = shooter.name
    const objectPots = judged.potted.filter((ball) => ball !== 8)
    if (state.isBreak) {
      logs.push(this.logEntry(objectPots.length > 0 ? `${name} broke and potted ${ballList(objectPots)}` : `${name} broke - nothing dropped`, objectPots.length > 0 ? "pot" : "info", shotId))
      if (judged.eight === "respot") logs.push(this.logEntry("The 8 dropped on the break - it goes back on the spot", "info", shotId))
    } else if (objectPots.length > 0) {
      logs.push(this.logEntry(`${name} potted ${ballList(objectPots)}`, "pot", shotId))
    }
    if (judged.assigned) logs.push(this.logEntry(`${name} takes ${judged.assigned}`, "info", shotId))

    let winner: PoolWinner | null = null
    let text: string
    if (judged.eight === "win") {
      winner = { id: shooter.id, name, seat, reason: `${name} sank the 8${calledPocket !== null ? ` in the ${POCKET_NAMES[calledPocket]}` : ""}` }
      text = `${name} sinks the 8 and wins the rack!`
      logs.push(this.logEntry(text, "win", shotId))
      if (opponent) reactions.push({ playerId: opponent.id, options: ["GG", "👏"], odds: 0.7 })
    } else if (judged.eight === "lose" && opponent) {
      const why = judged.foul === "scratch" ? "scratched on the 8" : !onEight ? "potted the 8 too early" : judged.foul ? `fouled on the 8 (${FOUL_TEXT[judged.foul]})` : "potted the 8 in the wrong pocket"
      winner = { id: opponent.id, name: opponent.name, seat: opponentSeat, reason: `${name} ${why}` }
      text = `${name} ${why} - ${opponent.name} wins the rack`
      logs.push(this.logEntry(text, "foul", shotId))
      reactions.push({ playerId: shooter.id, options: ["😱", "😤"], odds: 0.6 })
      reactions.push({ playerId: opponent.id, options: ["😂", "GG"], odds: 0.5 })
    } else if (judged.foul) {
      text = `Foul - ${name} ${FOUL_TEXT[judged.foul]}. Ball in hand for ${opponent?.name ?? "the other player"}`
      logs.push(this.logEntry(`Foul: ${name} ${FOUL_TEXT[judged.foul]}`, "foul", shotId))
      reactions.push({ playerId: shooter.id, options: ["😤", "😱"], odds: 0.35 })
    } else if (judged.continueTurn) {
      text = judged.assigned ? `${name} is on ${judged.assigned} - shoot again` : `${name} shoots again`
    } else {
      text = `${name} misses - ${opponent?.name ?? "next player"} to shoot`
    }

    if (judged.scratch) balls = balls.map((ball) => (ball.n === 0 ? { ...ball, down: true } : ball))

    state.pending = {
      balls,
      groups,
      nextSeat: judged.continueTurn ? seat : opponentSeat,
      ballInHand: judged.foul ? "table" : null,
      winner,
      logs,
      result: { shotId, text, foul: Boolean(judged.foul) || judged.eight === "lose" },
      reactions,
    }
    state.shotCount = shotId
    state.shot = { id: shotId, seat, before, ...shot, startedAt: Date.now(), durationMs: Math.round(result.duration * 1000) }
    state.balls = before
    state.phase = "rolling"
    state.shotEndsAt = Date.now() + state.shot.durationMs + SETTLE_MS
    state.turnDeadline = null
    state.botPlan = null
    return null
  }

  applyPending() {
    const state = this.state
    const pending = state?.pending
    if (!state || !pending) return
    state.pending = null
    state.balls = pending.balls
    state.groups = pending.groups
    state.isBreak = false
    state.result = pending.result
    this.pushLog(pending.logs)
    for (const reaction of pending.reactions) {
      const player = state.players[reaction.playerId]
      if (player?.isBot && Math.random() < reaction.odds && this.humanCount() > 0) this.react(player.id, pickReaction(reaction.options), BOT_REACT_MS)
    }
    if (pending.winner) {
      this.finish(pending.winner)
      return
    }
    this.beginTurn(pending.nextSeat, pending.ballInHand)
  }

  finish(winner: PoolWinner) {
    const state = this.state
    if (!state) return
    state.status = "finished"
    state.phase = "aim"
    state.winner = winner
    state.turnDeadline = null
    state.shotEndsAt = null
    state.botPlan = null
    state.pending = null
    state.wins[winner.id] = (state.wins[winner.id] ?? 0) + 1
    const seated = state.seatOrder.map((id) => (id ? state.players[id] : undefined)).filter((player) => player !== undefined)
    void reportResult(this.room, {
      // Not this.room.id: finish() runs inside onAlarm, where PartyKit throws on reading it.
      resultId: `pool:${state.roomCode}:${state.roundId}`,
      game: "pool",
      vsBot: seated.some((player) => player.isBot),
      players: seated.flatMap((player) => (player.userId ? [{ userId: player.userId, won: player.id === winner.id }] : [])),
    })
  }

  /** With one seat left there is no game: the remaining player takes the rack. */
  finishIfAlone(leftName: string) {
    const state = this.state
    if (!state || state.status !== "playing") return
    const seat = state.seatOrder.findIndex((id) => id && state.players[id])
    const player = seat >= 0 ? this.seatPlayer(seat) : null
    if (!player) return
    this.finish({ id: player.id, name: player.name, seat, reason: `${leftName} left the table` })
    this.pushLog([this.logEntry(`${leftName} left - ${player.name} wins the rack`, "win")])
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const url = new URL(context.request.url)
    const playerToken = url.searchParams.get("playerToken") ?? ""
    if (playerToken) this.connectionTokens.set(connection, playerToken)

    if (url.searchParams.get("host") === "true" && !this.state) {
      this.state = {
        roomCode: this.room.id,
        hostId: connection.id,
        players: {},
        seatOrder: Array.from({ length: POOL_SEATS }, () => null),
        status: "waiting",
        roundId: crypto.randomUUID(),
        rack: 0,
        breakerSeat: 0,
        balls: rackBalls(),
        groups: [null, null],
        turnSeat: 0,
        turnId: 0,
        phase: "aim",
        ballInHand: null,
        isBreak: true,
        turnDeadline: null,
        shotEndsAt: null,
        shotCount: 0,
        shot: null,
        pending: null,
        botPlan: null,
        result: null,
        log: [],
        winner: null,
        wins: {},
        playerTokens: {},
      }
      await this.saveState()
    }
    if (!this.state) this.send(connection, { type: "error", message: "Game not found" })
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return
    try {
      const data = JSON.parse(message) as ClientMessage
      if (data.type !== "join") await this.joins.settled(sender)
      const state = this.state
      if (!state) return

      if (data.type !== "join" && !this.isAuthenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }
      if (data.type !== "join" && state.spectators?.[sender.id]) {
        if (data.type === "leave") {
          dropSpectator(state, sender.id)
          await this.saveState()
          this.broadcastState()
        }
        return
      }

      switch (data.type) {
        case "join": {
          const playerToken = this.connectionTokens.get(sender)
          if (!playerToken) {
            this.send(sender, { type: "error", message: "Invalid player session" })
            return
          }
          const account = await this.joins.verify(sender, data.authToken)
          const name = account?.displayName ?? (typeof data.name === "string" ? data.name.trim().slice(0, 20) : "")
          const identity = account ? { userId: account.userId, profileId: account.profileId, color: account.color, cue: account.poolCue } : {}
          const returning = state.players[sender.id]
          if (returning) {
            if (state.playerTokens[sender.id] !== playerToken) {
              this.send(sender, { type: "error", message: "Invalid player session" })
              return
            }
            markConnected(state.players, sender.id)
            // A verified player keeps their profile name even if a later join comes without a token.
            if (account || !returning.userId) returning.name = name || returning.name
            Object.assign(returning, identity)
            returning.disconnectedAt = null
            if (!state.hostId || !isPresent(state.players[state.hostId])) state.hostId = sender.id
            await this.saveState()
            this.broadcastState()
            return
          }
          const watching = state.spectators?.[sender.id]
          if (watching) {
            if (state.playerTokens[sender.id] !== playerToken) {
              this.send(sender, { type: "error", message: "Invalid player session" })
              return
            }
            if (account || !watching.userId) watching.name = name || watching.name
            Object.assign(watching, identity)
            await this.saveState()
            this.broadcastState()
            return
          }
          if (!name) {
            this.send(sender, { type: "error", message: "Enter a player name" })
            return
          }
          if (Object.keys(state.players).length >= POOL_SEATS) this.pruneDisconnectedPlayers()
          if (state.status !== "waiting" || Object.keys(state.players).length >= POOL_SEATS) {
            state.spectators ??= {}
            if (Object.keys(state.spectators).length >= MAX_SPECTATORS) {
              this.send(sender, { type: "error", message: "Too many people are watching" })
              return
            }
            state.spectators[sender.id] = { id: sender.id, name, joinedAt: Date.now(), ...identity }
            state.playerTokens[sender.id] = playerToken
            await this.saveState()
            this.broadcastState()
            return
          }
          state.players[sender.id] = { id: sender.id, name, joinedAt: Date.now(), connected: true, disconnectedAt: null, seat: null, ...identity }
          state.playerTokens[sender.id] = playerToken
          if (!state.hostId || !isPresent(state.players[state.hostId])) state.hostId = sender.id
          await this.saveState()
          this.broadcastState()
          return
        }

        case "seat-spectator": {
          if (!canControlGame(state.players, state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can seat spectators" })
            return
          }
          if (state.status === "playing") {
            this.send(sender, { type: "error", message: "Seat them once this rack is over" })
            return
          }
          const spectator = typeof data.playerId === "string" ? state.spectators?.[data.playerId] : undefined
          if (!spectator) {
            this.send(sender, { type: "error", message: "They're no longer watching" })
            return
          }
          this.pruneDisconnectedPlayers()
          if (Object.keys(state.players).length >= POOL_SEATS) {
            this.send(sender, { type: "error", message: "Both cues are taken - remove a bot first" })
            return
          }
          delete state.spectators![spectator.id]
          state.players[spectator.id] = { id: spectator.id, name: spectator.name, joinedAt: Date.now(), connected: true, disconnectedAt: null, seat: null, userId: spectator.userId, profileId: spectator.profileId, color: spectator.color, cue: spectator.cue }
          if (state.status === "finished") {
            state.status = "waiting"
            state.seatOrder = Array.from({ length: POOL_SEATS }, () => null)
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "add-bot": {
          if (state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(state.players, state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can add bots" })
            return
          }
          if (Object.keys(state.players).length >= POOL_SEATS) {
            this.send(sender, { type: "error", message: "Both cues are taken" })
            return
          }
          const taken = new Set(Object.values(state.players).map((player) => player.name))
          const id = `bot-${crypto.randomUUID().slice(0, 8)}`
          state.players[id] = {
            id,
            name: BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? "Bot",
            joinedAt: Date.now(),
            connected: true,
            disconnectedAt: null,
            seat: null,
            isBot: true,
            botLevel: isBotLevel(data.level) ? data.level : "normal",
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "remove-player": {
          if (state.status === "playing") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(state.players, state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can remove players" })
            return
          }
          const target = typeof data.playerId === "string" ? state.players[data.playerId] : undefined
          if (!target?.isBot) {
            this.send(sender, { type: "error", message: "Only bots can be removed" })
            return
          }
          delete state.players[target.id]
          if (state.status === "finished") {
            state.status = "waiting"
            state.seatOrder = Array.from({ length: POOL_SEATS }, () => null)
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "set-bot-level": {
          if (state.status === "playing") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!canControlGame(state.players, state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can change bots" })
            return
          }
          const bot = typeof data.playerId === "string" ? state.players[data.playerId] : undefined
          if (!bot?.isBot || !isBotLevel(data.level)) {
            this.send(sender, { type: "error", message: "Only bots have a level" })
            return
          }
          bot.botLevel = data.level
          await this.saveState()
          this.broadcastState()
          return
        }

        case "start": {
          if (state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game is not waiting to start" })
            return
          }
          if (!canControlGame(state.players, state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can start" })
            return
          }
          for (const player of Object.values(state.players)) {
            if (player.connected === false) {
              delete state.players[player.id]
              delete state.playerTokens[player.id]
            }
          }
          if (presentCount(state.players) !== POOL_SEATS) {
            this.send(sender, { type: "error", message: "Pool needs two players - add a bot to play solo" })
            return
          }
          const seated = Object.values(state.players).sort((left, right) => left.joinedAt - right.joinedAt)
          state.seatOrder = seated.map((player, index) => {
            player.seat = index
            return player.id
          })
          state.breakerSeat = 0
          state.rack = 0
          state.wins = {}
          this.startRack()
          await this.saveState()
          await this.refreshAlarm()
          this.broadcastState()
          return
        }

        case "aim": {
          if (state.status !== "playing" || state.phase !== "aim" || data.turnId !== state.turnId) return
          const player = state.players[sender.id]
          if (!player || player.seat !== state.turnSeat) return
          if (![data.dirX, data.dirY, data.pull, data.spinX, data.spinY].every(finite)) return
          const now = Date.now()
          if (now - (this.aimedAt.get(sender.id) ?? 0) < AIM_RELAY_MS) return
          this.aimedAt.set(sender.id, now)
          const relay: AimMessage = {
            type: "aim",
            turnId: state.turnId,
            seat: state.turnSeat,
            dirX: data.dirX as number,
            dirY: data.dirY as number,
            pull: clamp(data.pull as number, 0, 1),
            x: state.ballInHand && finite(data.x) ? data.x : null,
            y: state.ballInHand && finite(data.y) ? data.y : null,
            spinX: clamp(data.spinX as number, -1, 1),
            spinY: clamp(data.spinY as number, -1, 1),
          }
          const encoded = JSON.stringify(relay)
          for (const connection of this.room.getConnections()) {
            if (connection.id !== sender.id && this.isAuthenticated(connection)) connection.send(encoded)
          }
          return
        }

        case "shoot": {
          if (state.status !== "playing" || state.phase !== "aim") return
          if (data.turnId !== state.turnId) return
          const player = state.players[sender.id]
          if (!player || player.seat !== state.turnSeat) {
            this.send(sender, { type: "error", message: "It is not your shot" })
            return
          }
          if (![data.dirX, data.dirY, data.power, data.spinX, data.spinY].every(finite)) {
            this.send(sender, { type: "error", message: "Could not read that shot" })
            return
          }
          const cue = finite(data.x) && finite(data.y) ? { x: data.x, y: data.y } : null
          const pocket = typeof data.pocket === "number" && Number.isInteger(data.pocket) && data.pocket >= 0 && data.pocket < 6 ? data.pocket : null
          const error = this.takeShot(state.turnSeat, {
            dirX: data.dirX as number,
            dirY: data.dirY as number,
            power: clamp(data.power as number, 0, 1),
            spinX: data.spinX as number,
            spinY: data.spinY as number,
            cue,
            pocket,
          })
          if (error) {
            this.send(sender, { type: "error", message: error })
            return
          }
          await this.saveState()
          await this.refreshAlarm()
          this.broadcastState()
          return
        }

        case "react": {
          if (state.players[sender.id] && isReaction(data.reaction)) this.react(sender.id, data.reaction)
          return
        }

        case "restart": {
          if (state.status !== "finished") {
            this.send(sender, { type: "error", message: "The rack is still being played" })
            return
          }
          if (!canControlGame(state.players, state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can rack again" })
            return
          }
          const seatedPresent = state.seatOrder.filter((id) => id && isPresent(state.players[id])).length
          if (seatedPresent === POOL_SEATS) {
            // Rematch: same players, the other one breaks.
            state.breakerSeat = 1 - state.breakerSeat
            this.startRack()
          } else {
            state.status = "waiting"
            state.seatOrder = Array.from({ length: POOL_SEATS }, () => null)
            state.winner = null
            state.log = []
            state.shot = null
            state.result = null
            for (const player of Object.values(state.players)) player.seat = null
          }
          await this.saveState()
          await this.refreshAlarm()
          this.broadcastState()
          return
        }

        case "leave": {
          const leaving = state.players[sender.id]
          if (leaving && leaving.seat !== null) state.seatOrder[leaving.seat] = null
          delete state.players[sender.id]
          delete state.playerTokens[sender.id]
          if (this.humanCount() === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (sender.id === state.hostId) state.hostId = nextHost(state.players, sender.id) ?? ""
          if (leaving) this.finishIfAlone(leaving.name)
          await this.saveState()
          await this.refreshAlarm()
          this.broadcastState()
          return
        }
      }
    } catch (error) {
      console.error("Pool message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    const state = this.state
    if (!state || state.status !== "playing") return
    // A throw here used to leave the table half-moved, unsaved and with no alarm: stuck on "balls rolling".
    // Whatever happens, the state is saved, re-armed and sent below.
    try {
      if (state.phase === "rolling") {
        if (state.shotEndsAt && state.shotEndsAt > Date.now()) {
          await this.refreshAlarm()
          return
        }
        if (state.pending) this.applyPending()
        // The outcome was lost to an earlier error: the shooter plays from the same table again.
        else this.beginTurn(state.turnSeat, state.ballInHand)
      } else {
        if (state.turnDeadline && state.turnDeadline > Date.now()) {
          await this.refreshAlarm()
          return
        }
        const plan = this.seatPlayer(state.turnSeat)?.isBot ? state.botPlan : null
        // A refused bot shot used to leave the turn on a passed deadline, re-firing forever without moving on.
        const refused = plan ? this.takeShot(state.turnSeat, { ...plan }) : null
        if (refused) console.error("Pool bot shot refused:", refused)
        if (!plan || refused) {
          // A human ran out of time: the other player gets ball in hand (or the break).
          const player = this.seatPlayer(state.turnSeat)
          const text = `${player?.name ?? "The shooter"} ran out of time`
          state.shotCount += 1
          state.result = { shotId: state.shotCount, text: `${text} - ball in hand`, foul: true }
          this.pushLog([this.logEntry(text, "foul")])
          this.beginTurn(1 - state.turnSeat, state.isBreak ? "kitchen" : "table")
        }
      }
    } catch (error) {
      console.error("Pool alarm error:", error)
      // Retry shortly: rolling falls back to a fresh turn (its outcome is gone or applied), aiming falls back to a timeout.
      if (state.status === "playing") {
        if (state.phase === "rolling") state.shotEndsAt = Date.now() + ALARM_RETRY_MS
        else {
          state.botPlan = null
          state.turnDeadline = Date.now() + ALARM_RETRY_MS
        }
      }
    }
    await this.saveState()
    await this.refreshAlarm()
    this.broadcastState()
  }

  async onClose(connection: Party.Connection) {
    if (!this.state) return
    const replacementIsOpen = Array.from(this.room.getConnections()).some((candidate) => candidate.id === connection.id && candidate !== connection)
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

export default withRoomCleanup(PoolParty, "pool")
