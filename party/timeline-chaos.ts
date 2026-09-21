import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  getCorrectTimeline,
  isTimelinePack,
  isValidTimelineOrder,
  pickTimelineEvents,
  publicTimelineEvents,
  scoreTimelineOrder,
  type PublicTimelineEvent,
  type TimelineEvent,
  type TimelinePack,
} from "../src/lib/timelineChaos"
import {
  canControlGame,
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

export type TimelineRoundCount = 5 | 8 | 10
export type TimelineSeconds = 15 | 20 | 30
export type TimelinePhase = "ordering" | "reveal"

export interface TimelineSettings {
  pack: TimelinePack
  rounds: TimelineRoundCount
  roundSeconds: TimelineSeconds
}

export interface TimelinePlayer {
  id: string
  name: string
  score: number
  perfectRounds: number
  correctPositions: number
  totalAnswerMs: number
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
}

export type PublicTimelinePlayer = Omit<TimelinePlayer, "disconnectedAt">

interface TimelineSubmission {
  order: string[]
  submittedAt: number
}

export interface TimelineRoundResult {
  order: string[] | null
  points: number
  correctPositions: number
  perfect: boolean
}

export interface TimelineGameState {
  roomCode: string
  hostId: string
  players: Record<string, TimelinePlayer>
  playerTokens: Record<string, string>
  maxPlayers: number
  settings: TimelineSettings
  status: "waiting" | "playing" | "finished"
  phase: TimelinePhase | null
  events: TimelineEvent[]
  usedEventIds: string[]
  submissions: Record<string, TimelineSubmission>
  roundResults: Record<string, TimelineRoundResult>
  roundNumber: number
  roundId: string
  roundStartedAt: number | null
  roundEndsAt: number | null
  finishedAt: number | null
  winnerIds: string[]
}

export interface PublicTimelineGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicTimelinePlayer>
  maxPlayers: number
  settings: TimelineSettings
  status: TimelineGameState["status"]
  phase: TimelinePhase | null
  events: PublicTimelineEvent[]
  correctOrder: string[]
  submittedPlayerIds: string[]
  myOrder: string[] | null
  roundResults: Record<string, TimelineRoundResult>
  roundNumber: number
  roundId: string
  roundEndsAt: number | null
  finishedAt: number | null
  winnerIds: string[]
  serverNow: number
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "submit-order"; roundId: unknown; order: unknown }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicTimelineGameState }
  | { type: "error"; message: string }

const ROUND_COUNTS = new Set([5, 8, 10])
const ROUND_SECONDS = new Set([15, 20, 30])
const REVEAL_MS = 6_000
const PLAYER_TTL_MS = 30 * 60 * 1000

function parseSettings(url: URL): TimelineSettings {
  const pack = url.searchParams.get("pack")
  const rounds = Number(url.searchParams.get("rounds"))
  const roundSeconds = Number(url.searchParams.get("roundSeconds"))
  return {
    pack: isTimelinePack(pack) ? pack : "mixed",
    rounds: ROUND_COUNTS.has(rounds) ? (rounds as TimelineRoundCount) : 8,
    roundSeconds: ROUND_SECONDS.has(roundSeconds) ? (roundSeconds as TimelineSeconds) : 20,
  }
}

function winners(players: Record<string, TimelinePlayer>): string[] {
  const sorted = Object.values(players).sort((left, right) =>
    right.score - left.score ||
    right.perfectRounds - left.perfectRounds ||
    left.totalAnswerMs - right.totalAnswerMs ||
    left.joinedAt - right.joinedAt,
  )
  const first = sorted[0]
  if (!first) return []
  return sorted
    .filter((player) =>
      player.score === first.score &&
      player.perfectRounds === first.perfectRounds &&
      player.totalAnswerMs === first.totalAnswerMs,
    )
    .map((player) => player.id)
}

class TimelineChaosParty implements Party.Server {
  constructor(readonly room: Party.Room) {}
  state: TimelineGameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<TimelineGameState>("state")
    if (!stored) return
    this.state = stored
    for (const player of Object.values(stored.players)) {
      player.connected = false
      player.disconnectedAt ??= Date.now()
    }
    if (stored.status === "playing" && stored.roundEndsAt) {
      if (stored.roundEndsAt <= Date.now()) {
        if (stored.phase === "ordering") await this.revealRound()
        else await this.advanceRound()
      } else await this.room.storage.setAlarm(stored.roundEndsAt)
    }
    await this.save()
  }

  publicState(playerId?: string): PublicTimelineGameState {
    if (!this.state) throw new Error("No timeline state")
    const revealed = this.state.phase === "reveal" || this.state.status === "finished"
    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players: Object.fromEntries(Object.entries(this.state.players).map(([id, player]) => [id, {
        id: player.id,
        name: player.name,
        score: player.score,
        perfectRounds: player.perfectRounds,
        correctPositions: player.correctPositions,
        totalAnswerMs: player.totalAnswerMs,
        joinedAt: player.joinedAt,
        connected: player.connected,
      }])),
      maxPlayers: this.state.maxPlayers,
      settings: this.state.settings,
      status: this.state.status,
      phase: this.state.phase,
      events: publicTimelineEvents(this.state.events, revealed),
      correctOrder: revealed ? getCorrectTimeline(this.state.events) : [],
      submittedPlayerIds: Object.keys(this.state.submissions),
      myOrder: playerId ? (this.state.submissions[playerId]?.order ?? null) : null,
      roundResults: revealed ? this.state.roundResults : {},
      roundNumber: this.state.roundNumber,
      roundId: this.state.roundId,
      roundEndsAt: this.state.roundEndsAt,
      finishedAt: this.state.finishedAt,
      winnerIds: this.state.winnerIds,
      serverNow: Date.now(),
    }
  }

  async save() {
    if (this.state) await this.room.storage.put("state", this.state)
  }

  send(connection: Party.Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message))
  }

  authenticated(connection: Party.Connection) {
    const token = this.connectionTokens.get(connection)
    return Boolean(this.state && token && this.state.playerTokens[connection.id] === token)
  }

  broadcast() {
    for (const connection of this.room.getConnections()) {
      if (this.authenticated(connection)) this.send(connection, { type: "state", state: this.publicState(connection.id) })
    }
  }

  async startRound() {
    if (!this.state) return
    const picked = pickTimelineEvents(this.state.settings.pack, this.state.usedEventIds)
    this.state.events = picked.events
    this.state.usedEventIds = picked.usedEventIds
    this.state.submissions = {}
    this.state.roundResults = {}
    this.state.roundNumber += 1
    this.state.roundId = crypto.randomUUID()
    this.state.phase = "ordering"
    this.state.roundStartedAt = Date.now()
    this.state.roundEndsAt = this.state.roundStartedAt + this.state.settings.roundSeconds * 1000
    await this.room.storage.setAlarm(this.state.roundEndsAt)
  }

  async revealRound() {
    if (!this.state || this.state.status !== "playing" || this.state.phase !== "ordering" || !this.state.roundStartedAt || !this.state.roundEndsAt) return
    const correctOrder = getCorrectTimeline(this.state.events)
    for (const player of Object.values(this.state.players)) {
      const submission = this.state.submissions[player.id]
      const result = submission
        ? scoreTimelineOrder(submission.order, correctOrder, submission.submittedAt, this.state.roundStartedAt, this.state.roundEndsAt)
        : { points: 0, correctPositions: 0, perfect: false }
      player.score += result.points
      player.correctPositions += result.correctPositions
      if (result.perfect) {
        player.perfectRounds += 1
        player.totalAnswerMs += submission!.submittedAt - this.state.roundStartedAt
      }
      this.state.roundResults[player.id] = { order: submission?.order ?? null, ...result }
    }
    this.state.phase = "reveal"
    this.state.roundEndsAt = Date.now() + REVEAL_MS
    await this.room.storage.setAlarm(this.state.roundEndsAt)
  }

  async advanceRound() {
    if (!this.state || this.state.status !== "playing" || this.state.phase !== "reveal") return
    if (this.state.roundNumber >= this.state.settings.rounds) {
      this.state.status = "finished"
      this.state.finishedAt = Date.now()
      this.state.winnerIds = winners(this.state.players)
      this.state.roundEndsAt = null
      await this.room.storage.deleteAlarm()
    } else await this.startRound()
  }

  allAnswered() {
    if (!this.state) return false
    const players = Object.values(this.state.players)
    return players.length > 0 && players.every((player) => this.state && Object.hasOwn(this.state.submissions, player.id))
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, "timeline-chaos")
    if (gameNight.mode === "invalid") {
      this.send(connection, { type: "error", message: "Game not found" })
      return
    }
    if (gameNight.mode === "game-night") this.gameNightMembers.set(connection, gameNight.member)
    const url = new URL(context.request.url)
    const token = url.searchParams.get("playerToken") ?? ""
    if (token) this.connectionTokens.set(connection, token)
    const canCreate = gameNight.mode === "game-night"
      ? gameNight.member.isHost
      : url.searchParams.get("host") === "true"
    if (canCreate && !this.state) {
      this.state = {
        roomCode: this.room.id, hostId: connection.id, players: {}, playerTokens: {}, maxPlayers: 12,
        settings: parseSettings(url), status: "waiting", phase: null, events: [], usedEventIds: [],
        submissions: {}, roundResults: {}, roundNumber: 0, roundId: crypto.randomUUID(),
        roundStartedAt: null, roundEndsAt: null, finishedAt: null, winnerIds: [],
      }
      await this.save()
    }
    if (!this.state) this.send(connection, { type: "error", message: "Game not found" })
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return
    try {
      const data = JSON.parse(message) as ClientMessage
      if (data.type !== "join" && !this.authenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }
      if (data.type === "join") {
        const gameNightMember = this.gameNightMembers.get(sender)
        const token = this.connectionTokens.get(sender)
        if (!token) return this.send(sender, { type: "error", message: "Invalid player session" })
        const returning = this.state.players[sender.id]
        if (returning) {
          if (this.state.playerTokens[sender.id] !== token) return this.send(sender, { type: "error", message: "Invalid player session" })
          markConnected(this.state.players, sender.id)
          returning.disconnectedAt = null
          returning.name = gameNightMember?.name ?? (data.name.trim().slice(0, 20) || returning.name)
          if (!this.state.players[this.state.hostId]) this.state.hostId = sender.id
          await this.save(); this.broadcast(); return
        }
        if (this.state.status !== "waiting") return this.send(sender, { type: "error", message: "Game already started" })
        const cutoff = Date.now() - PLAYER_TTL_MS
        for (const [id, player] of Object.entries(this.state.players)) {
          if (player.connected === false && player.disconnectedAt && player.disconnectedAt <= cutoff) {
            delete this.state.players[id]; delete this.state.playerTokens[id]
          }
        }
        if (Object.keys(this.state.players).length >= 12) return this.send(sender, { type: "error", message: "Game is full" })
        const name = gameNightMember?.name ?? data.name.trim().slice(0, 20)
        if (!name) return this.send(sender, { type: "error", message: "Enter a player name" })
        this.state.players[sender.id] = { id: sender.id, name, score: 0, perfectRounds: 0, correctPositions: 0, totalAnswerMs: 0, joinedAt: Date.now(), connected: true, disconnectedAt: null }
        this.state.playerTokens[sender.id] = token
        if (!this.state.players[this.state.hostId]) this.state.hostId = sender.id
        await this.save(); this.broadcast(); return
      }
      if (data.type === "start") {
        if (this.state.status !== "waiting" || !canControlGame(this.state.players, this.state.hostId, sender.id)) return
        if (presentCount(this.state.players) < 2) return this.send(sender, { type: "error", message: "Need at least 2 players" })
        for (const player of Object.values(this.state.players)) {
          if (player.connected === false) { delete this.state.players[player.id]; delete this.state.playerTokens[player.id] }
          else { player.score = 0; player.perfectRounds = 0; player.correctPositions = 0; player.totalAnswerMs = 0 }
        }
        this.state.status = "playing"; this.state.usedEventIds = []; this.state.roundNumber = 0; this.state.finishedAt = null; this.state.winnerIds = []
        await this.startRound(); await this.save(); this.broadcast(); return
      }
      if (data.type === "submit-order") {
        if (this.state.status !== "playing" || this.state.phase !== "ordering" || data.roundId !== this.state.roundId || !this.state.roundEndsAt) return
        if (Date.now() >= this.state.roundEndsAt) { await this.revealRound(); await this.save(); this.broadcast(); return }
        if (this.state.submissions[sender.id] || !isValidTimelineOrder(data.order, this.state.events.map((event) => event.id))) return
        this.state.submissions[sender.id] = { order: [...data.order], submittedAt: Date.now() }
        if (this.allAnswered()) await this.revealRound()
        await this.save(); this.broadcast(); return
      }
      if (data.type === "restart") {
        if (this.state.status !== "finished" || !canControlGame(this.state.players, this.state.hostId, sender.id)) return
        Object.values(this.state.players).forEach((player) => {
          if (player.connected === false) {
            delete this.state!.players[player.id]
            delete this.state!.playerTokens[player.id]
          } else {
            player.score = 0
            player.perfectRounds = 0
            player.correctPositions = 0
            player.totalAnswerMs = 0
          }
        })
        Object.assign(this.state, { status: "waiting", phase: null, events: [], usedEventIds: [], submissions: {}, roundResults: {}, roundNumber: 0, roundId: crypto.randomUUID(), roundStartedAt: null, roundEndsAt: null, finishedAt: null, winnerIds: [] })
        await this.room.storage.deleteAlarm(); await this.save(); this.broadcast(); return
      }
      if (data.type === "leave") {
        delete this.state.players[sender.id]; delete this.state.playerTokens[sender.id]; delete this.state.submissions[sender.id]; delete this.state.roundResults[sender.id]
        if (Object.keys(this.state.players).length === 0) { this.state = null; await this.room.storage.delete("state"); await this.room.storage.deleteAlarm(); return }
        if (sender.id === this.state.hostId) this.state.hostId = nextHost(this.state.players, sender.id) ?? ""
        if (this.state.status === "finished") this.state.winnerIds = winners(this.state.players)
        if (this.state.phase === "ordering" && this.allAnswered()) await this.revealRound()
        await this.save(); this.broadcast()
      }
    } catch (error) {
      console.error("Timeline Chaos message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    if (!this.state || this.state.status !== "playing") return
    if (this.state.roundEndsAt && Date.now() < this.state.roundEndsAt) return this.room.storage.setAlarm(this.state.roundEndsAt)
    if (this.state.phase === "ordering") await this.revealRound(); else await this.advanceRound()
    await this.save(); this.broadcast()
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "timeline-chaos")
    if (!match) return new Response("Not found", { status: 404 })
    const finished = this.state?.status === "finished"
    return Response.json({
      finished,
      scored: true,
      winnerIds: finished ? this.state?.winnerIds ?? [] : [],
    })
  }

  async onClose(connection: Party.Connection) {
    if (!this.state) return
    if (Object.keys(this.state.players).length === 0 && this.state.hostId === connection.id) {
      this.state = null; await this.room.storage.delete("state"); await this.room.storage.deleteAlarm(); return
    }
    if (!this.state.players[connection.id]) return
    if (Array.from(this.room.getConnections()).some((candidate) => candidate.id === connection.id && candidate !== connection)) return
    markDisconnected(this.state.players, connection.id)
    this.state.players[connection.id].disconnectedAt = Date.now()
    await this.save(); this.broadcast()
  }
}

export default withRoomCleanup(TimelineChaosParty, "timelinechaos")
