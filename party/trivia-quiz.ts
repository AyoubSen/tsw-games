import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  isTriviaPack,
  pickTriviaQuestion,
  scoreTriviaAnswer,
  type TriviaChoice,
  type TriviaPack,
  type TriviaQuestion,
} from "../src/lib/trivia"
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

export type TriviaRoundCount = 5 | 10 | 15
export type TriviaQuestionSeconds = 10 | 15 | 20
export type TriviaPhase = "answering" | "reveal"

export interface TriviaSettings {
  pack: TriviaPack
  rounds: TriviaRoundCount
  questionSeconds: TriviaQuestionSeconds
}

export interface TriviaPlayer {
  id: string
  name: string
  score: number
  correctAnswers: number
  totalAnswerMs: number
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
}

export type PublicTriviaPlayer = Omit<TriviaPlayer, "disconnectedAt">

interface TriviaSubmission {
  choiceId: string
  submittedAt: number
}

export interface TriviaRoundResult {
  choiceId: string | null
  correct: boolean
  points: number
  responseMs: number | null
}

export interface TriviaGameState {
  roomCode: string
  hostId: string
  players: Record<string, TriviaPlayer>
  playerTokens: Record<string, string>
  maxPlayers: number
  settings: TriviaSettings
  status: "waiting" | "playing" | "finished"
  phase: TriviaPhase | null
  question: TriviaQuestion | null
  usedQuestionIds: string[]
  submissions: Record<string, TriviaSubmission>
  roundResults: Record<string, TriviaRoundResult>
  roundNumber: number
  roundId: string
  roundStartedAt: number | null
  roundEndsAt: number | null
  finishedAt: number | null
  winnerIds: string[]
}

export interface PublicTriviaQuestion {
  id: string
  pack: TriviaQuestion["pack"]
  categoryLabel: string
  format: TriviaQuestion["format"]
  prompt: string
  choices: TriviaChoice[]
  correctChoiceId: string | null
  explanation: string | null
}

export interface PublicTriviaGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicTriviaPlayer>
  maxPlayers: number
  settings: TriviaSettings
  status: TriviaGameState["status"]
  phase: TriviaPhase | null
  question: PublicTriviaQuestion | null
  submittedPlayerIds: string[]
  myChoiceId: string | null
  roundResults: Record<string, TriviaRoundResult>
  roundNumber: number
  roundId: string
  roundStartedAt: number | null
  roundEndsAt: number | null
  finishedAt: number | null
  winnerIds: string[]
  serverNow: number
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "answer"; roundId: unknown; choiceId: unknown }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicTriviaGameState }
  | { type: "error"; message: string }

const ROUND_COUNTS = new Set([5, 10, 15])
const QUESTION_SECONDS = new Set([10, 15, 20])
const REVEAL_MS = 4_000
const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000

function parseSettings(url: URL): TriviaSettings {
  const requestedPack = url.searchParams.get("pack")
  const requestedRounds = Number(url.searchParams.get("rounds"))
  const requestedSeconds = Number(url.searchParams.get("questionSeconds"))
  return {
    pack: isTriviaPack(requestedPack) ? requestedPack : "mixed",
    rounds: ROUND_COUNTS.has(requestedRounds)
      ? (requestedRounds as TriviaRoundCount)
      : 10,
    questionSeconds: QUESTION_SECONDS.has(requestedSeconds)
      ? (requestedSeconds as TriviaQuestionSeconds)
      : 15,
  }
}

function getWinnerIds(players: Record<string, TriviaPlayer>): string[] {
  const list = Object.values(players)
  if (list.length === 0) return []
  return [...list]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (right.correctAnswers !== left.correctAnswers) {
        return right.correctAnswers - left.correctAnswers
      }
      if (left.totalAnswerMs !== right.totalAnswerMs) {
        return left.totalAnswerMs - right.totalAnswerMs
      }
      return left.joinedAt - right.joinedAt
    })
    .filter((player, _index, sorted) => {
      const leader = sorted[0]
      return Boolean(
        leader &&
          player.score === leader.score &&
          player.correctAnswers === leader.correctAnswers &&
          player.totalAnswerMs === leader.totalAnswerMs,
      )
    })
    .map((player) => player.id)
}

class TriviaQuizParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: TriviaGameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<TriviaGameState>("state")
    if (!stored) return
    this.state = stored
    for (const player of Object.values(stored.players)) {
      const wasConnected = player.connected !== false
      player.connected = false
      if (wasConnected || !player.disconnectedAt) player.disconnectedAt = Date.now()
    }

    if (stored.status === "playing" && stored.roundEndsAt) {
      if (stored.roundEndsAt <= Date.now()) {
        if (stored.phase === "answering") await this.revealRound()
        else await this.advanceAfterReveal()
      } else {
        await this.room.storage.setAlarm(stored.roundEndsAt)
      }
    }
    await this.saveState()
  }

  getPublicState(playerId?: string): PublicTriviaGameState {
    if (!this.state) throw new Error("No trivia state")
    const revealing = this.state.phase === "reveal" || this.state.status === "finished"
    const question = this.state.question
    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players: Object.fromEntries(
        Object.entries(this.state.players).map(([id, player]) => [
          id,
          {
            id: player.id,
            name: player.name,
            score: player.score,
            correctAnswers: player.correctAnswers,
            totalAnswerMs: player.totalAnswerMs,
            joinedAt: player.joinedAt,
            connected: player.connected,
          },
        ]),
      ),
      maxPlayers: this.state.maxPlayers,
      settings: this.state.settings,
      status: this.state.status,
      phase: this.state.phase,
      question: question
        ? {
            id: question.id,
            pack: question.pack,
            categoryLabel: question.categoryLabel,
            format: question.format,
            prompt: question.prompt,
            choices: question.choices,
            correctChoiceId: revealing ? question.correctChoiceId : null,
            explanation: revealing ? question.explanation : null,
          }
        : null,
      submittedPlayerIds: Object.keys(this.state.submissions),
      myChoiceId: playerId ? (this.state.submissions[playerId]?.choiceId ?? null) : null,
      roundResults: revealing ? this.state.roundResults : {},
      roundNumber: this.state.roundNumber,
      roundId: this.state.roundId,
      roundStartedAt: this.state.roundStartedAt,
      roundEndsAt: this.state.roundEndsAt,
      finishedAt: this.state.finishedAt,
      winnerIds: this.state.winnerIds,
      serverNow: Date.now(),
    }
  }

  async saveState() {
    if (this.state) await this.room.storage.put("state", this.state)
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

  isAuthenticated(connection: Party.Connection) {
    if (!this.state) return false
    const token = this.connectionTokens.get(connection)
    return Boolean(token && this.state.playerTokens[connection.id] === token)
  }

  pruneDisconnectedPlayers() {
    if (!this.state) return
    const cutoff = Date.now() - DISCONNECTED_PLAYER_TTL_MS
    for (const [id, player] of Object.entries(this.state.players)) {
      if (
        player.connected === false &&
        player.disconnectedAt &&
        player.disconnectedAt <= cutoff
      ) {
        delete this.state.players[id]
        delete this.state.playerTokens[id]
      }
    }
  }

  async startRound() {
    if (!this.state) return
    const picked = pickTriviaQuestion(
      this.state.settings.pack,
      this.state.usedQuestionIds,
    )
    const now = Date.now()
    this.state.question = picked.question
    this.state.usedQuestionIds = picked.usedQuestionIds
    this.state.submissions = {}
    this.state.roundResults = {}
    this.state.roundNumber += 1
    this.state.roundId = crypto.randomUUID()
    this.state.phase = "answering"
    this.state.roundStartedAt = now
    this.state.roundEndsAt = now + this.state.settings.questionSeconds * 1000
    await this.room.storage.setAlarm(this.state.roundEndsAt)
  }

  async revealRound() {
    if (
      !this.state ||
      this.state.status !== "playing" ||
      this.state.phase !== "answering" ||
      !this.state.question ||
      !this.state.roundStartedAt ||
      !this.state.roundEndsAt
    ) {
      return
    }

    for (const player of Object.values(this.state.players)) {
      const submission = this.state.submissions[player.id]
      const correct = submission?.choiceId === this.state.question.correctChoiceId
      const responseMs = submission
        ? Math.max(0, submission.submittedAt - this.state.roundStartedAt)
        : null
      const points =
        correct && submission
          ? scoreTriviaAnswer(
              submission.submittedAt,
              this.state.roundStartedAt,
              this.state.roundEndsAt,
            )
          : 0
      player.score += points
      if (correct) player.correctAnswers += 1
      if (correct && responseMs !== null) player.totalAnswerMs += responseMs
      this.state.roundResults[player.id] = {
        choiceId: submission?.choiceId ?? null,
        correct,
        points,
        responseMs,
      }
    }

    this.state.phase = "reveal"
    this.state.roundEndsAt = Date.now() + REVEAL_MS
    await this.room.storage.setAlarm(this.state.roundEndsAt)
  }

  async advanceAfterReveal() {
    if (!this.state || this.state.status !== "playing" || this.state.phase !== "reveal") {
      return
    }
    if (this.state.roundNumber >= this.state.settings.rounds) {
      this.state.status = "finished"
      this.state.finishedAt = Date.now()
      this.state.winnerIds = getWinnerIds(this.state.players)
      this.state.roundEndsAt = null
      await this.room.storage.deleteAlarm()
      return
    }
    await this.startRound()
  }

  allPresentPlayersAnswered() {
    if (!this.state) return false
    const presentPlayers = Object.values(this.state.players).filter(isPresent)
    return (
      presentPlayers.length > 0 &&
      presentPlayers.every((player) => Object.hasOwn(this.state?.submissions ?? {}, player.id))
    )
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, "trivia-quiz")
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
        roomCode: this.room.id,
        hostId: connection.id,
        players: {},
        playerTokens: {},
        maxPlayers: 12,
        settings: parseSettings(url),
        status: "waiting",
        phase: null,
        question: null,
        usedQuestionIds: [],
        submissions: {},
        roundResults: {},
        roundNumber: 0,
        roundId: crypto.randomUUID(),
        roundStartedAt: null,
        roundEndsAt: null,
        finishedAt: null,
        winnerIds: [],
      }
      await this.saveState()
    }

    if (!this.state) this.send(connection, { type: "error", message: "Game not found" })
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
          const token = this.connectionTokens.get(sender)
          if (!token) {
            this.send(sender, { type: "error", message: "Invalid player session" })
            return
          }
          const returning = this.state.players[sender.id]
          if (returning) {
            if (this.state.playerTokens[sender.id] !== token) {
              this.send(sender, { type: "error", message: "Invalid player session" })
              return
            }
            markConnected(this.state.players, sender.id)
            returning.name = gameNightMember?.name ?? (data.name.trim().slice(0, 20) || returning.name)
            returning.disconnectedAt = null
            if (!this.state.hostId) this.state.hostId = sender.id
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
            score: 0,
            correctAnswers: 0,
            totalAnswerMs: 0,
            joinedAt: Date.now(),
            connected: true,
            disconnectedAt: null,
          }
          this.state.playerTokens[sender.id] = token
          if (!this.state.hostId) this.state.hostId = sender.id
          await this.saveState()
          this.broadcastState()
          return
        }

        case "start": {
          if (this.state.status !== "waiting") return
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can start" })
            return
          }
          if (presentCount(this.state.players) < 2) {
            this.send(sender, { type: "error", message: "Need at least 2 players" })
            return
          }
          for (const player of Object.values(this.state.players)) {
            if (player.connected === false) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            } else {
              player.score = 0
              player.correctAnswers = 0
              player.totalAnswerMs = 0
            }
          }
          this.state.status = "playing"
          this.state.phase = null
          this.state.question = null
          this.state.usedQuestionIds = []
          this.state.roundNumber = 0
          this.state.finishedAt = null
          this.state.winnerIds = []
          await this.startRound()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "answer": {
          if (
            this.state.status !== "playing" ||
            this.state.phase !== "answering" ||
            data.roundId !== this.state.roundId ||
            !this.state.question ||
            !this.state.roundEndsAt
          ) {
            return
          }
          if (Date.now() >= this.state.roundEndsAt) {
            await this.revealRound()
            await this.saveState()
            this.broadcastState()
            return
          }
          if (!this.state.players[sender.id] || this.state.submissions[sender.id]) return
          if (
            typeof data.choiceId !== "string" ||
            !this.state.question.choices.some((choice) => choice.id === data.choiceId)
          ) {
            this.send(sender, { type: "error", message: "Invalid answer" })
            return
          }
          this.state.submissions[sender.id] = {
            choiceId: data.choiceId,
            submittedAt: Date.now(),
          }
          if (this.allPresentPlayersAnswered()) await this.revealRound()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "restart": {
          if (this.state.status !== "finished") return
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can restart" })
            return
          }
          this.state.status = "waiting"
          this.state.phase = null
          this.state.question = null
          this.state.usedQuestionIds = []
          this.state.submissions = {}
          this.state.roundResults = {}
          this.state.roundNumber = 0
          this.state.roundId = crypto.randomUUID()
          this.state.roundStartedAt = null
          this.state.roundEndsAt = null
          this.state.finishedAt = null
          this.state.winnerIds = []
          for (const player of Object.values(this.state.players)) {
            player.score = 0
            player.correctAnswers = 0
            player.totalAnswerMs = 0
          }
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "leave": {
          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]
          delete this.state.submissions[sender.id]
          delete this.state.roundResults[sender.id]
          if (Object.keys(this.state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (sender.id === this.state.hostId) {
            this.state.hostId = nextHost(this.state.players, sender.id) ?? ""
          }
          if (this.state.status === "finished") {
            this.state.winnerIds = getWinnerIds(this.state.players)
          }
          if (this.state.phase === "answering" && this.allPresentPlayersAnswered()) {
            await this.revealRound()
          }
          await this.saveState()
          this.broadcastState()
          return
        }
      }
    } catch (error) {
      console.error("Trivia Quiz message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    if (!this.state || this.state.status !== "playing") return
    if (this.state.roundEndsAt && Date.now() < this.state.roundEndsAt) {
      await this.room.storage.setAlarm(this.state.roundEndsAt)
      return
    }
    if (this.state.phase === "answering") await this.revealRound()
    else await this.advanceAfterReveal()
    await this.saveState()
    this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "trivia-quiz")
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
    if (
      Object.keys(this.state.players).length === 0 &&
      this.state.hostId === connection.id
    ) {
      this.state = null
      await this.room.storage.delete("state")
      await this.room.storage.deleteAlarm()
      return
    }
    if (!this.state.players[connection.id]) return
    const replacementIsOpen = Array.from(this.room.getConnections()).some(
      (candidate) => candidate.id === connection.id && candidate !== connection,
    )
    if (replacementIsOpen) return
    markDisconnected(this.state.players, connection.id)
    this.state.players[connection.id].disconnectedAt = Date.now()
    if (this.state.phase === "answering" && this.allPresentPlayersAnswered()) {
      await this.revealRound()
    }
    await this.saveState()
    this.broadcastState()
  }
}

export default withRoomCleanup(TriviaQuizParty, "triviaquiz")
