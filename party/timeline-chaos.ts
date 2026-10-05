import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  getCorrectTimeline,
  isTimelinePack,
  isValidTimelineOrder,
  nextRevealStage,
  pickTimelineEvents,
  publicTimelineEvents,
  revealStageMs,
  scoreTimelineOrder,
  TIMELINE_PACE_MS,
  type PublicTimelineEvent,
  type TimelineEvent,
  type TimelinePack,
  type TimelineRevealStage,
} from "../src/lib/timelineChaos"
import { isReaction, takeReactionSlot, type Reaction, type ReactionMessage } from "../src/lib/reactions"
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
import { JoinVerifier, reportDirectResult } from "./shared/account"

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
  correctPairs: number
  totalAnswerMs: number
  /** Quickest lock-in of the match (ms after the deal); null until they lock one in. */
  fastestLockMs: number | null
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
  /** Server-only: the verified account behind this player. */
  userId?: string
}

export type PublicTimelinePlayer = Omit<TimelinePlayer, "disconnectedAt">

interface TimelineSubmission {
  order: string[]
  submittedAt: number
  /** Taken from their full arrangement when time ran out, not locked in. */
  auto: boolean
}

export interface TimelineRoundResult {
  order: string[] | null
  points: number
  correctPairs: number
  correctPositions: number
  perfect: boolean
  /** Time to lock in; null when the order was taken at the buzzer or missing. */
  lockMs: number | null
}

export interface TimelineReveal {
  seq: number
  stage: TimelineRevealStage
  startedAt: number
  endsAt: number
}

export interface TimelineHistoryEntry {
  roundNumber: number
  events: PublicTimelineEvent[]
  correctOrder: string[]
  results: Record<string, TimelineRoundResult>
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
  reveal: TimelineReveal | null
  revealSeq: number
  events: TimelineEvent[]
  usedEventIds: string[]
  submissions: Record<string, TimelineSubmission>
  roundResults: Record<string, TimelineRoundResult>
  history: TimelineHistoryEntry[]
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
  reveal: TimelineReveal | null
  events: PublicTimelineEvent[]
  /** Empty until the years are stamped. */
  correctOrder: string[]
  /** Players who locked in (not those whose order was taken at the buzzer). */
  submittedPlayerIds: string[]
  myOrder: string[] | null
  /** My full, unlocked arrangement, so a reload keeps it. */
  myDraft: string[] | null
  /** Everyone's round results, from the room beat on. */
  roundResults: Record<string, TimelineRoundResult>
  history: TimelineHistoryEntry[]
  roundNumber: number
  roundId: string
  roundEndsAt: number | null
  finishedAt: number | null
  winnerIds: string[]
  serverNow: number
}

export type ClientMessage =
  | { type: "join"; name: string; authToken?: unknown }
  | { type: "start" }
  | { type: "arrange"; roundId: unknown; order: unknown }
  | { type: "submit-order"; roundId: unknown; order: unknown }
  | { type: "react"; reaction: Reaction }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicTimelineGameState }
  | { type: "error"; message: string }
  | ReactionMessage

const ROUND_COUNTS = new Set([5, 8, 10])
const ROUND_SECONDS = new Set([15, 20, 30])
const PLAYER_TTL_MS = 30 * 60 * 1000
const RESULT_STAGES = new Set<TimelineRevealStage>(["room", "score"])

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

function resetStats(player: TimelinePlayer) {
  player.score = 0
  player.perfectRounds = 0
  player.correctPositions = 0
  player.correctPairs = 0
  player.totalAnswerMs = 0
  player.fastestLockMs = null
}

class TimelineChaosParty implements Party.Server {
  constructor(readonly room: Party.Room) {
    this.joins = new JoinVerifier(room)
  }
  joins: JoinVerifier
  state: TimelineGameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  /** Full arrangements that aren't locked in yet, used if time runs out. Memory only. */
  drafts = new Map<string, { roundId: string; order: string[] }>()
  reactedAt = new Map<string, number>()

  async onStart() {
    const stored = await this.room.storage.get<TimelineGameState>("state")
    if (!stored) return
    stored.reveal ??= null
    stored.revealSeq ??= 0
    stored.history ??= []
    if (stored.status === "playing" && stored.phase === "reveal" && !stored.reveal) {
      stored.reveal = { seq: 0, stage: "score", startedAt: Date.now(), endsAt: Date.now() }
    }
    this.state = stored
    for (const player of Object.values(stored.players)) {
      player.connected = false
      player.disconnectedAt ??= Date.now()
      player.correctPairs ??= 0
      player.fastestLockMs ??= null
    }
    await this.scheduleAlarm()
    await this.save()
  }

  publicState(playerId?: string): PublicTimelineGameState {
    if (!this.state) throw new Error("No timeline state")
    const s = this.state
    const stage = s.reveal?.stage ?? null
    const finished = s.status === "finished"
    const revealed = finished || (s.phase === "reveal" && stage !== "tension")
    const draft = playerId ? this.drafts.get(playerId) : undefined
    return {
      roomCode: s.roomCode,
      hostId: s.hostId,
      players: Object.fromEntries(Object.entries(s.players).map(([id, player]) => [id, {
        id: player.id,
        name: player.name,
        score: player.score,
        perfectRounds: player.perfectRounds,
        correctPositions: player.correctPositions,
        correctPairs: player.correctPairs,
        totalAnswerMs: player.totalAnswerMs,
        fastestLockMs: player.fastestLockMs,
        joinedAt: player.joinedAt,
        connected: player.connected,
      }])),
      maxPlayers: s.maxPlayers,
      settings: s.settings,
      status: s.status,
      phase: s.phase,
      reveal: s.reveal,
      events: publicTimelineEvents(s.events, revealed),
      correctOrder: revealed ? getCorrectTimeline(s.events) : [],
      submittedPlayerIds: Object.entries(s.submissions).filter(([, submission]) => !submission.auto).map(([id]) => id),
      myOrder: playerId ? (s.submissions[playerId]?.order ?? null) : null,
      myDraft: s.phase === "ordering" && draft?.roundId === s.roundId ? draft.order : null,
      roundResults: finished || (stage && RESULT_STAGES.has(stage)) ? s.roundResults : {},
      history: s.history,
      roundNumber: s.roundNumber,
      roundId: s.roundId,
      roundEndsAt: s.roundEndsAt,
      finishedAt: s.finishedAt,
      winnerIds: s.winnerIds,
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

  broadcast(message?: ServerMessage) {
    for (const connection of this.room.getConnections()) {
      if (this.authenticated(connection)) this.send(connection, message ?? { type: "state", state: this.publicState(connection.id) })
    }
  }

  /** The alarm drives the ordering clock and every reveal beat. */
  async scheduleAlarm() {
    const s = this.state
    const at = s?.status === "playing" ? (s.phase === "ordering" ? s.roundEndsAt : s.reveal?.endsAt) : null
    if (at) await this.room.storage.setAlarm(Math.max(Date.now() + 10, at))
    else await this.room.storage.deleteAlarm()
  }

  async startRound() {
    if (!this.state) return
    const picked = pickTimelineEvents(this.state.settings.pack, this.state.usedEventIds)
    this.state.events = picked.events
    this.state.usedEventIds = picked.usedEventIds
    this.state.submissions = {}
    this.state.roundResults = {}
    this.drafts.clear()
    this.state.roundNumber += 1
    this.state.roundId = crypto.randomUUID()
    this.state.phase = "ordering"
    this.state.reveal = null
    // The clock starts once the cards have been dealt.
    this.state.roundStartedAt = Date.now() + TIMELINE_PACE_MS.deal
    this.state.roundEndsAt = this.state.roundStartedAt + this.state.settings.roundSeconds * 1000
  }

  beginStage(stage: TimelineRevealStage) {
    if (!this.state) return
    const startedAt = Date.now()
    this.state.revealSeq += 1
    this.state.reveal = { seq: this.state.revealSeq, stage, startedAt, endsAt: startedAt + revealStageMs(stage, this.state.events.length) }
  }

  /** Closes the round. Results are worked out now; points only land on the score beat. */
  revealRound() {
    const s = this.state
    if (!s || s.status !== "playing" || s.phase !== "ordering" || !s.roundStartedAt || !s.roundEndsAt) return
    const correctOrder = getCorrectTimeline(s.events)
    for (const player of Object.values(s.players)) {
      const draft = this.drafts.get(player.id)
      if (!s.submissions[player.id] && draft?.roundId === s.roundId) {
        s.submissions[player.id] = { order: draft.order, submittedAt: s.roundEndsAt, auto: true }
      }
      const submission = s.submissions[player.id]
      const result = submission
        ? scoreTimelineOrder(submission.order, correctOrder, submission.submittedAt, s.roundStartedAt, s.roundEndsAt)
        : { points: 0, correctPairs: 0, correctPositions: 0, perfect: false }
      s.roundResults[player.id] = {
        order: submission?.order ?? null,
        ...result,
        lockMs: submission && !submission.auto ? Math.max(0, submission.submittedAt - s.roundStartedAt) : null,
      }
    }
    this.drafts.clear()
    s.phase = "reveal"
    s.roundEndsAt = null
    this.beginStage("tension")
  }

  async advanceReveal() {
    const s = this.state
    if (!s || s.status !== "playing" || s.phase !== "reveal" || !s.reveal) return
    const next = nextRevealStage(s.reveal.stage, true)
    if (next) {
      if (next === "score") this.applyPoints()
      this.beginStage(next)
      return
    }
    if (s.roundNumber >= s.settings.rounds) {
      s.status = "finished"
      s.phase = null
      s.reveal = null
      s.finishedAt = Date.now()
      s.winnerIds = winners(s.players)
      const winnerIds = new Set(s.winnerIds)
      void reportDirectResult(this.room, {
        resultId: `timeline-chaos:${s.roomCode}:${s.roundId}`,
        game: "timeline-chaos",
        vsBot: false,
        players: Object.values(s.players).map((player) => ({ userId: player.userId, won: winnerIds.has(player.id) })),
      })
    } else await this.startRound()
  }

  applyPoints() {
    const s = this.state
    if (!s) return
    for (const player of Object.values(s.players)) {
      const result = s.roundResults[player.id]
      if (!result) continue
      player.score += result.points
      player.correctPairs += result.correctPairs
      player.correctPositions += result.correctPositions
      const submission = s.submissions[player.id]
      if (result.perfect && submission && s.roundStartedAt) {
        player.perfectRounds += 1
        player.totalAnswerMs += Math.max(0, submission.submittedAt - s.roundStartedAt)
      }
      if (result.lockMs !== null) player.fastestLockMs = Math.min(player.fastestLockMs ?? Infinity, result.lockMs)
    }
    s.history.push({
      roundNumber: s.roundNumber,
      events: publicTimelineEvents(s.events, true),
      correctOrder: getCorrectTimeline(s.events),
      results: { ...s.roundResults },
    })
  }

  /** Everyone still at the table has locked in. */
  allAnswered() {
    if (!this.state) return false
    const present = Object.values(this.state.players).filter((player) => player.connected !== false)
    return present.length > 0 && present.every((player) => this.state && Object.hasOwn(this.state.submissions, player.id))
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
        settings: parseSettings(url), status: "waiting", phase: null, reveal: null, revealSeq: 0, events: [], usedEventIds: [],
        submissions: {}, roundResults: {}, history: [], roundNumber: 0, roundId: crypto.randomUUID(),
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
      if (data.type !== "join") await this.joins.settled(sender)
      if (!this.state) return
      if (data.type !== "join" && !this.authenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }
      if (data.type === "join") {
        const gameNightMember = this.gameNightMembers.get(sender)
        const token = this.connectionTokens.get(sender)
        if (!token) return this.send(sender, { type: "error", message: "Invalid player session" })
        const account = await this.joins.verify(sender, data.authToken)
        if (!this.state) return
        const returning = this.state.players[sender.id]
        if (returning) {
          if (this.state.playerTokens[sender.id] !== token) return this.send(sender, { type: "error", message: "Invalid player session" })
          markConnected(this.state.players, sender.id)
          returning.disconnectedAt = null
          // A verified player keeps their profile name even if a later join comes without a token.
          returning.name = gameNightMember?.name ?? account?.displayName ?? (returning.userId ? returning.name : data.name.trim().slice(0, 20) || returning.name)
          if (account) returning.userId = account.userId
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
        const name = gameNightMember?.name ?? account?.displayName ?? data.name.trim().slice(0, 20)
        if (!name) return this.send(sender, { type: "error", message: "Enter a player name" })
        this.state.players[sender.id] = {
          id: sender.id, name, score: 0, perfectRounds: 0, correctPositions: 0, correctPairs: 0, totalAnswerMs: 0, fastestLockMs: null,
          joinedAt: Date.now(), connected: true, disconnectedAt: null, userId: account?.userId,
        }
        this.state.playerTokens[sender.id] = token
        if (!this.state.players[this.state.hostId]) this.state.hostId = sender.id
        await this.save(); this.broadcast(); return
      }
      if (data.type === "start") {
        if (this.state.status !== "waiting" || !canControlGame(this.state.players, this.state.hostId, sender.id)) return
        if (presentCount(this.state.players) < 2) return this.send(sender, { type: "error", message: "Need at least 2 players" })
        for (const player of Object.values(this.state.players)) {
          if (player.connected === false) { delete this.state.players[player.id]; delete this.state.playerTokens[player.id] }
          else resetStats(player)
        }
        Object.assign(this.state, { status: "playing", usedEventIds: [], history: [], roundNumber: 0, finishedAt: null, winnerIds: [] })
        await this.startRound(); await this.scheduleAlarm(); await this.save(); this.broadcast(); return
      }
      if (data.type === "arrange") {
        const s = this.state
        if (s.status !== "playing" || s.phase !== "ordering" || data.roundId !== s.roundId || s.submissions[sender.id]) return
        if (data.order === null) this.drafts.delete(sender.id)
        else if (isValidTimelineOrder(data.order, s.events.map((event) => event.id))) this.drafts.set(sender.id, { roundId: s.roundId, order: [...data.order] })
        return
      }
      if (data.type === "submit-order") {
        const s = this.state
        if (s.status !== "playing" || s.phase !== "ordering" || data.roundId !== s.roundId || !s.roundEndsAt) return
        if (Date.now() >= s.roundEndsAt) { this.revealRound(); await this.scheduleAlarm(); await this.save(); this.broadcast(); return }
        if (s.submissions[sender.id] || !isValidTimelineOrder(data.order, s.events.map((event) => event.id))) return
        s.submissions[sender.id] = { order: [...data.order], submittedAt: Date.now(), auto: false }
        this.drafts.delete(sender.id)
        if (this.allAnswered()) { this.revealRound(); await this.scheduleAlarm() }
        await this.save(); this.broadcast(); return
      }
      if (data.type === "react") {
        if (!this.state.players[sender.id] || !isReaction(data.reaction)) return
        if (!takeReactionSlot(this.reactedAt, sender.id)) return
        this.broadcast({ type: "reaction", playerId: sender.id, reaction: data.reaction })
        return
      }
      if (data.type === "restart") {
        if (this.state.status !== "finished" || !canControlGame(this.state.players, this.state.hostId, sender.id)) return
        Object.values(this.state.players).forEach((player) => {
          if (player.connected === false) {
            delete this.state!.players[player.id]
            delete this.state!.playerTokens[player.id]
          } else resetStats(player)
        })
        Object.assign(this.state, {
          status: "waiting", phase: null, reveal: null, events: [], usedEventIds: [], submissions: {}, roundResults: {}, history: [],
          roundNumber: 0, roundId: crypto.randomUUID(), roundStartedAt: null, roundEndsAt: null, finishedAt: null, winnerIds: [],
        })
        this.drafts.clear()
        await this.scheduleAlarm(); await this.save(); this.broadcast(); return
      }
      if (data.type === "leave") {
        delete this.state.players[sender.id]; delete this.state.playerTokens[sender.id]; delete this.state.submissions[sender.id]; delete this.state.roundResults[sender.id]
        this.drafts.delete(sender.id)
        if (Object.keys(this.state.players).length === 0) { this.state = null; await this.room.storage.delete("state"); await this.room.storage.deleteAlarm(); return }
        if (sender.id === this.state.hostId) this.state.hostId = nextHost(this.state.players, sender.id) ?? ""
        if (this.state.status === "finished") this.state.winnerIds = winners(this.state.players)
        if (this.state.phase === "ordering" && this.allAnswered()) { this.revealRound(); await this.scheduleAlarm() }
        await this.save(); this.broadcast()
      }
    } catch (error) {
      console.error("Timeline Chaos message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    const s = this.state
    if (!s || s.status !== "playing") return
    const due = s.phase === "ordering" ? s.roundEndsAt : s.reveal?.endsAt
    if (due && Date.now() < due - 50) return this.scheduleAlarm()
    if (s.phase === "ordering") this.revealRound()
    else await this.advanceReveal()
    await this.scheduleAlarm()
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
    if (this.state.phase === "ordering" && this.allAnswered()) { this.revealRound(); await this.scheduleAlarm() }
    await this.save(); this.broadcast()
  }
}

export default withRoomCleanup(TimelineChaosParty, "timelinechaos")
