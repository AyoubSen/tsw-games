import type * as Party from "partykit/server"
import {
  CODE_LENGTH,
  evaluateCodeGuess,
  generateSecretCode,
  isValidCodeGuess,
  MAX_ATTEMPTS,
  type CodeColor,
  type GuessResult,
} from "../src/lib/codeBreaker"
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
  guesses: GuessResult[]
  solvedAt: number | null
}

export interface PublicPlayer {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  attempts: number
  solvedAt: number | null
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  secret: CodeColor[]
  startedAt: number | null
  finishedAt: number | null
  winnerIds: string[]
  playerTokens: Record<string, string>
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  status: GameState["status"]
  maxPlayers: number
  startedAt: number | null
  finishedAt: number | null
  winnerIds: string[]
  myGuesses: GuessResult[]
  revealedCode: CodeColor[] | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "submit-guess"; guess: unknown }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "error"; message: string }

const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000
const RACE_RECONNECT_GRACE_MS = 30 * 1000

export default class CodeBreakerParty implements Party.Server {
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
    await this.refreshDisconnectAlarm()
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
          attempts: player.guesses.length,
          solvedAt: player.solvedAt,
        },
      ]),
    )

    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      startedAt: this.state.startedAt,
      finishedAt: this.state.finishedAt,
      winnerIds: this.state.winnerIds,
      myGuesses: playerId
        ? [...(this.state.players[playerId]?.guesses ?? [])]
        : [],
      revealedCode:
        this.state.status === "finished" ? [...this.state.secret] : null,
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

  allPlayersExhausted() {
    if (!this.state) return false
    const players = Object.values(this.state.players)
    if (!players.some(isPresent)) return false
    const reconnectCutoff = Date.now() - RACE_RECONNECT_GRACE_MS
    const contenders = players.filter(
      (player) =>
        isPresent(player) ||
        !player.disconnectedAt ||
        player.disconnectedAt > reconnectCutoff,
    )
    return (
      contenders.length > 0 &&
      contenders.every(
        (player) => player.solvedAt !== null || player.guesses.length >= MAX_ATTEMPTS,
      )
    )
  }

  async refreshDisconnectAlarm() {
    if (!this.state || this.state.status !== "playing") {
      await this.room.storage.deleteAlarm()
      return
    }
    const now = Date.now()
    const nextDeadline = Object.values(this.state.players)
      .filter(
        (player) =>
          player.connected === false &&
          player.disconnectedAt &&
          player.disconnectedAt + RACE_RECONNECT_GRACE_MS > now &&
          player.guesses.length < MAX_ATTEMPTS,
      )
      .map((player) => player.disconnectedAt! + RACE_RECONNECT_GRACE_MS)
      .sort((left, right) => left - right)[0]

    if (nextDeadline) {
      await this.room.storage.setAlarm(nextDeadline)
    } else {
      await this.room.storage.deleteAlarm()
    }
  }

  finishGame(winnerId?: string) {
    if (!this.state) return
    this.state.status = "finished"
    this.state.finishedAt = Date.now()
    this.state.winnerIds = winnerId ? [winnerId] : []
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

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, "code-breaker")
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
        secret: [],
        startedAt: null,
        finishedAt: null,
        winnerIds: [],
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
            if (
              this.state.status === "playing" &&
              this.allPlayersExhausted()
            ) {
              this.finishGame()
            }
            await this.saveState()
            await this.refreshDisconnectAlarm()
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
            guesses: [],
            solvedAt: null,
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
              player.guesses = []
              player.solvedAt = null
            }
          }
          this.state.secret = generateSecretCode()
          this.state.status = "playing"
          this.state.startedAt = Date.now()
          this.state.finishedAt = null
          this.state.winnerIds = []
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "submit-guess": {
          if (this.state.status !== "playing") return
          const player = this.state.players[sender.id]
          if (!player || player.solvedAt || player.guesses.length >= MAX_ATTEMPTS) {
            return
          }
          if (!isValidCodeGuess(data.guess)) {
            this.send(sender, {
              type: "error",
              message: `Choose ${CODE_LENGTH} different colors`,
            })
            return
          }

          const result = evaluateCodeGuess(this.state.secret, data.guess)
          player.guesses.push(result)
          if (result.exact === CODE_LENGTH) {
            player.solvedAt = Date.now()
            this.finishGame(player.id)
          } else if (this.allPlayersExhausted()) {
            this.finishGame()
          }
          if (this.state.status === "finished") {
            await this.room.storage.deleteAlarm()
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
          this.state.secret = []
          this.state.startedAt = null
          this.state.finishedAt = null
          this.state.winnerIds = []
          for (const player of Object.values(this.state.players)) {
            player.guesses = []
            player.solvedAt = null
          }
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "leave": {
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
          this.state.winnerIds = this.state.winnerIds.filter(
            (id) => Boolean(this.state?.players[id]),
          )
          if (
            this.state.status === "playing" &&
            this.allPlayersExhausted()
          ) {
            this.finishGame()
          }
          await this.refreshDisconnectAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }
      }
    } catch (error) {
      console.error("Code Breaker message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
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
      this.state.status === "playing" &&
      this.allPlayersExhausted()
    ) {
      this.finishGame()
    }
    await this.refreshDisconnectAlarm()
    await this.saveState()
    this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "code-breaker")
    if (!match) return new Response("Not found", { status: 404 })
    const finished = this.state?.status === "finished"
    return Response.json({
      finished,
      scored: true,
      winnerIds: finished ? this.state?.winnerIds ?? [] : [],
    })
  }

  async onAlarm() {
    if (!this.state || this.state.status !== "playing") return
    if (this.allPlayersExhausted()) this.finishGame()
    await this.saveState()
    await this.refreshDisconnectAlarm()
    this.broadcastState()
  }
}
