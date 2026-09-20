import type * as Party from "partykit/server"
import {
  buildCountryChoices,
  getCountryByCode,
  isCorrectCountryGuess,
  pickNextCountry,
} from "../src/lib/guessTheCountry"
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

export type GameMode =
  | "first-to-score"
  | "casual"
  | "timed"
  | "multiple-choice"

export type ChoicePhase = "guessing" | "reveal"

export interface GameSettings {
  mode: GameMode
  targetScore: 3 | 5 | 10
  timeLimit: 60 | 120 | 180
}

export interface Player {
  id: string
  name: string
  score: number
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
}

export type PublicPlayer = Omit<Player, "disconnectedAt">

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  settings: GameSettings
  countryCode: string | null
  usedCountryCodes: string[]
  roundNumber: number
  startedAt: number | null
  endsAt: number | null
  finishedAt: number | null
  winnerIds: string[]
  revealedCountryName: string | null
  playerTokens: Record<string, string>
  choicePhase: ChoicePhase | null
  choices: string[]
  choiceSubmissions: Record<string, string>
  roundAnswers: Record<string, string>
  correctCountryName: string | null
  roundEndsAt: number | null
}

export interface PublicGameState
  extends Omit<
    GameState,
    "usedCountryCodes" | "playerTokens" | "players" | "choiceSubmissions"
  > {
  players: Record<string, PublicPlayer>
  submittedPlayerIds: string[]
  myChoice: string | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "submit-guess"; guess: string }
  | { type: "submit-choice"; choice: string }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "guess-result"; correct: false; message: string }
  | {
      type: "round-won"
      playerId: string
      playerName: string
      countryName: string
    }
  | { type: "error"; message: string }

const TARGET_SCORES = new Set([3, 5, 10])
const TIME_LIMITS = new Set([60, 120, 180])
const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000
const CHOICE_ROUNDS = 10
const CHOICE_SECONDS = 10
const REVEAL_SECONDS = 3

function parseSettings(url: URL): GameSettings {
  const requestedMode = url.searchParams.get("mode")
  const mode: GameMode =
    requestedMode === "casual" ||
    requestedMode === "timed" ||
    requestedMode === "multiple-choice"
      ? requestedMode
      : "first-to-score"
  const requestedTarget = Number(url.searchParams.get("targetScore"))
  const requestedTime = Number(url.searchParams.get("timeLimit"))

  return {
    mode,
    targetScore: TARGET_SCORES.has(requestedTarget)
      ? (requestedTarget as GameSettings["targetScore"])
      : 5,
    timeLimit: TIME_LIMITS.has(requestedTime)
      ? (requestedTime as GameSettings["timeLimit"])
      : 60,
  }
}

function winnerIds(players: Record<string, Player>): string[] {
  const playerList = Object.values(players)
  const highestScore = Math.max(...playerList.map((player) => player.score), 0)
  return playerList
    .filter((player) => player.score === highestScore)
    .sort((left, right) => left.joinedAt - right.joinedAt)
    .map((player) => player.id)
}

export default class GuessTheCountryParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state")
    if (!stored) return

    this.state = stored
    stored.choicePhase ??= null
    stored.choices ??= []
    stored.choiceSubmissions ??= {}
    stored.roundAnswers ??= {}
    stored.correctCountryName ??= null
    stored.roundEndsAt ??= null
    for (const player of Object.values(stored.players)) {
      const wasConnected = player.connected !== false
      player.connected = false
      if (wasConnected || !player.disconnectedAt) {
        player.disconnectedAt = Date.now()
      }
    }

    if (stored.status === "playing") {
      if (stored.settings.mode === "timed" && stored.endsAt) {
        if (stored.endsAt <= Date.now()) {
          this.finishGame(
            stored.countryCode
              ? (getCountryByCode(stored.countryCode)?.name ?? null)
              : null,
          )
        } else {
          await this.room.storage.setAlarm(stored.endsAt)
        }
      } else if (stored.settings.mode === "multiple-choice") {
        if (!stored.roundEndsAt || stored.roundEndsAt <= Date.now()) {
          if (stored.choicePhase === "reveal") {
            if (stored.roundNumber >= CHOICE_ROUNDS) {
              this.finishGame(stored.correctCountryName)
            } else {
              await this.startChoiceRound()
            }
          } else {
            await this.revealChoiceRound()
          }
        } else {
          await this.room.storage.setAlarm(stored.roundEndsAt)
        }
      }
    }

    await this.saveState()
  }

  getPublicState(playerId?: string): PublicGameState {
    if (!this.state) throw new Error("No game state")
    const players = Object.fromEntries(
      Object.entries(this.state.players).map(([id, player]) => [
        id,
        {
          id: player.id,
          name: player.name,
          score: player.score,
          joinedAt: player.joinedAt,
          connected: player.connected,
        },
      ]),
    )
    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      settings: this.state.settings,
      countryCode: this.state.countryCode,
      roundNumber: this.state.roundNumber,
      startedAt: this.state.startedAt,
      endsAt: this.state.endsAt,
      finishedAt: this.state.finishedAt,
      winnerIds: this.state.winnerIds,
      revealedCountryName: this.state.revealedCountryName,
      choicePhase: this.state.choicePhase,
      choices: this.state.choices,
      roundAnswers:
        this.state.choicePhase === "reveal" ? this.state.roundAnswers : {},
      correctCountryName:
        this.state.choicePhase === "reveal"
          ? this.state.correctCountryName
          : null,
      roundEndsAt: this.state.roundEndsAt,
      submittedPlayerIds: Object.keys(this.state.choiceSubmissions),
      myChoice: playerId
        ? (this.state.choiceSubmissions[playerId] ?? null)
        : null,
    }
  }

  async saveState() {
    if (this.state) await this.room.storage.put("state", this.state)
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

  broadcast(message: ServerMessage) {
    const serialized = JSON.stringify(message)
    for (const connection of this.room.getConnections()) connection.send(serialized)
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

  chooseNextCountry() {
    if (!this.state) return
    const next = pickNextCountry(this.state.usedCountryCodes)
    this.state.countryCode = next.country.code
    this.state.usedCountryCodes = [...next.usedCodes]
    this.state.roundNumber += 1
  }

  async startChoiceRound() {
    if (!this.state) return
    this.chooseNextCountry()
    const country = this.state.countryCode
      ? getCountryByCode(this.state.countryCode)
      : undefined
    if (!country) {
      this.finishGame()
      return
    }

    this.state.choicePhase = "guessing"
    this.state.choices = buildCountryChoices(country)
    this.state.choiceSubmissions = {}
    this.state.roundAnswers = {}
    this.state.correctCountryName = null
    this.state.revealedCountryName = null
    this.state.roundEndsAt = Date.now() + CHOICE_SECONDS * 1000
    await this.room.storage.setAlarm(this.state.roundEndsAt)
  }

  async revealChoiceRound() {
    if (
      !this.state ||
      this.state.status !== "playing" ||
      this.state.settings.mode !== "multiple-choice" ||
      this.state.choicePhase === "reveal"
    ) {
      return
    }

    const country = this.state.countryCode
      ? getCountryByCode(this.state.countryCode)
      : undefined
    if (!country) {
      this.finishGame()
      return
    }

    for (const [playerId, choice] of Object.entries(
      this.state.choiceSubmissions,
    )) {
      if (choice === country.name && this.state.players[playerId]) {
        this.state.players[playerId].score += 1
      }
    }

    this.state.choicePhase = "reveal"
    this.state.roundAnswers = { ...this.state.choiceSubmissions }
    this.state.correctCountryName = country.name
    this.state.revealedCountryName = country.name
    this.state.roundEndsAt = Date.now() + REVEAL_SECONDS * 1000
    await this.room.storage.setAlarm(this.state.roundEndsAt)
  }

  allPlayersSubmitted() {
    if (!this.state) return false
    const players = Object.values(this.state.players).filter(isPresent)
    return (
      players.length > 0 &&
      players.every((player) =>
        Object.hasOwn(this.state?.choiceSubmissions ?? {}, player.id),
      )
    )
  }

  finishGame(revealedCountryName: string | null = null) {
    if (!this.state) return
    this.state.status = "finished"
    this.state.finishedAt = Date.now()
    this.state.winnerIds = winnerIds(this.state.players)
    this.state.revealedCountryName = revealedCountryName
    this.state.roundEndsAt = null
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, "guess-the-country")
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
        status: "waiting",
        maxPlayers: 8,
        settings: parseSettings(url),
        countryCode: null,
        usedCountryCodes: [],
        roundNumber: 0,
        startedAt: null,
        endsAt: null,
        finishedAt: null,
        winnerIds: [],
        revealedCountryName: null,
        playerTokens: {},
        choicePhase: null,
        choices: [],
        choiceSubmissions: {},
        roundAnswers: {},
        correctCountryName: null,
        roundEndsAt: null,
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
            score: 0,
            joinedAt: Date.now(),
            connected: true,
            disconnectedAt: null,
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

          for (const player of Object.values(this.state.players)) {
            if (player.connected === false) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            } else {
              player.score = 0
            }
          }

          this.state.status = "playing"
          this.state.usedCountryCodes = []
          this.state.roundNumber = 0
          this.state.startedAt = Date.now()
          this.state.endsAt =
            this.state.settings.mode === "timed"
              ? this.state.startedAt + this.state.settings.timeLimit * 1000
              : null
          this.state.finishedAt = null
          this.state.winnerIds = []
          this.state.revealedCountryName = null
          this.state.choicePhase = null
          this.state.choices = []
          this.state.choiceSubmissions = {}
          this.state.roundAnswers = {}
          this.state.correctCountryName = null
          this.state.roundEndsAt = null

          if (this.state.settings.mode === "multiple-choice") {
            await this.startChoiceRound()
          } else {
            this.chooseNextCountry()
            if (this.state.endsAt) {
              await this.room.storage.setAlarm(this.state.endsAt)
            } else {
              await this.room.storage.deleteAlarm()
            }
          }

          await this.saveState()
          this.broadcastState()
          return
        }

        case "submit-guess": {
          if (this.state.settings.mode === "multiple-choice") return
          if (this.state.status !== "playing" || !this.state.countryCode) return
          if (
            this.state.settings.mode === "timed" &&
            this.state.endsAt &&
            Date.now() >= this.state.endsAt
          ) {
            this.finishGame(getCountryByCode(this.state.countryCode)?.name ?? null)
            await this.room.storage.deleteAlarm()
            await this.saveState()
            this.broadcastState()
            return
          }
          const player = this.state.players[sender.id]
          const country = getCountryByCode(this.state.countryCode)
          if (!player || !country) return

          const guess = typeof data.guess === "string" ? data.guess.trim().slice(0, 80) : ""
          if (!guess) return
          if (!isCorrectCountryGuess(guess, country)) {
            this.send(sender, {
              type: "guess-result",
              correct: false,
              message: "Not that country. Try again.",
            })
            return
          }

          player.score += 1
          this.broadcast({
            type: "round-won",
            playerId: player.id,
            playerName: player.name,
            countryName: country.name,
          })

          if (
            this.state.settings.mode === "first-to-score" &&
            player.score >= this.state.settings.targetScore
          ) {
            this.finishGame(country.name)
            await this.room.storage.deleteAlarm()
          } else {
            this.state.revealedCountryName = null
            this.chooseNextCountry()
          }

          await this.saveState()
          this.broadcastState()
          return
        }

        case "submit-choice": {
          if (
            this.state.status !== "playing" ||
            this.state.settings.mode !== "multiple-choice" ||
            this.state.choicePhase !== "guessing"
          ) {
            return
          }
          if (this.state.roundEndsAt && Date.now() >= this.state.roundEndsAt) {
            await this.revealChoiceRound()
            await this.saveState()
            this.broadcastState()
            return
          }

          const player = this.state.players[sender.id]
          if (!player || Object.hasOwn(this.state.choiceSubmissions, sender.id)) {
            return
          }
          const choice =
            typeof data.choice === "string" ? data.choice.trim().slice(0, 80) : ""
          if (!this.state.choices.includes(choice)) {
            this.send(sender, { type: "error", message: "Invalid country choice" })
            return
          }

          this.state.choiceSubmissions[sender.id] = choice
          if (this.allPlayersSubmitted()) {
            await this.revealChoiceRound()
          }
          await this.saveState()
          this.broadcastState()
          return
        }

        case "restart": {
          if (this.state.status !== "finished") {
            this.send(sender, { type: "error", message: "The match is still active" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can restart" })
            return
          }

          this.state.status = "waiting"
          this.state.countryCode = null
          this.state.usedCountryCodes = []
          this.state.roundNumber = 0
          this.state.startedAt = null
          this.state.endsAt = null
          this.state.finishedAt = null
          this.state.winnerIds = []
          this.state.revealedCountryName = null
          this.state.choicePhase = null
          this.state.choices = []
          this.state.choiceSubmissions = {}
          this.state.roundAnswers = {}
          this.state.correctCountryName = null
          this.state.roundEndsAt = null
          for (const player of Object.values(this.state.players)) player.score = 0
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "leave": {
          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]
          delete this.state.choiceSubmissions[sender.id]
          delete this.state.roundAnswers[sender.id]
          if (Object.keys(this.state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }

          if (sender.id === this.state.hostId) {
            const replacement = nextHost(this.state.players, sender.id)
            this.state.hostId = replacement ?? ""
          }
          if (this.state.status === "finished") {
            this.state.winnerIds = winnerIds(this.state.players)
          }
          if (
            this.state.settings.mode === "multiple-choice" &&
            this.state.choicePhase === "guessing" &&
            this.allPlayersSubmitted()
          ) {
            await this.revealChoiceRound()
          }
          await this.saveState()
          this.broadcastState()
          return
        }
      }
    } catch (error) {
      console.error("Guess the Country message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    if (!this.state || this.state.status !== "playing") return

    if (this.state.settings.mode === "multiple-choice") {
      if (this.state.roundEndsAt && Date.now() < this.state.roundEndsAt) {
        await this.room.storage.setAlarm(this.state.roundEndsAt)
        return
      }
      if (this.state.choicePhase === "guessing") {
        await this.revealChoiceRound()
      } else if (this.state.choicePhase === "reveal") {
        if (this.state.roundNumber >= CHOICE_ROUNDS) {
          this.finishGame(this.state.correctCountryName)
          await this.room.storage.deleteAlarm()
        } else {
          await this.startChoiceRound()
        }
      }
      await this.saveState()
      this.broadcastState()
      return
    }

    if (this.state.settings.mode !== "timed") return

    this.finishGame(
      this.state.countryCode
        ? (getCountryByCode(this.state.countryCode)?.name ?? null)
        : null,
    )
    await this.saveState()
    this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "guess-the-country")
    if (!match) return new Response("Not found", { status: 404 })
    const finished = this.state?.status === "finished"
    return Response.json({
      finished,
      scored: true,
      winnerIds: finished ? this.state?.winnerIds ?? [] : [],
    })
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
    if (
      this.state.settings.mode === "multiple-choice" &&
      this.state.choicePhase === "guessing" &&
      this.allPlayersSubmitted()
    ) {
      await this.revealChoiceRound()
    }
    await this.saveState()
    this.broadcastState()
  }
}
