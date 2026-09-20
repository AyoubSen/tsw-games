import type * as Party from "partykit/server"
import {
  generateMemoryBoard,
  isMemoryBoardIndex,
  MEMORY_BOARD_SIZE,
  MEMORY_COUNTDOWN_MS,
  MEMORY_MISMATCH_MS,
  type MemorySymbol,
} from "../src/lib/memoryMatch"
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
  matchedIndices: number[]
  firstFlip: number | null
  mismatchIndices: [number, number] | null
  lockedUntil: number | null
  moves: number
  completedAt: number | null
}

export interface PublicPlayer {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
  pairs: number
  moves: number
  completedAt: number | null
}

export interface WinnerSnapshot {
  id: string
  name: string
  moves: number
  completedAt: number
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  status: "waiting" | "playing" | "finished"
  maxPlayers: number
  board: MemorySymbol[]
  roundId: string
  startsAt: number | null
  finishedAt: number | null
  winner: WinnerSnapshot | null
  playerTokens: Record<string, string>
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  status: GameState["status"]
  maxPlayers: number
  roundId: string
  startsAt: number | null
  finishedAt: number | null
  winner: WinnerSnapshot | null
  serverNow: number
  myMatchedIndices: number[]
  myVisibleCards: Partial<Record<number, MemorySymbol>>
  myLockedUntil: number | null
  revealedBoard: MemorySymbol[] | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "flip"; index: unknown; roundId: unknown }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "error"; message: string }

const DISCONNECTED_PLAYER_TTL_MS = 30 * 60 * 1000

export default class MemoryMatchParty implements Party.Server {
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
    this.clearExpiredMismatches()
    await this.saveState()
    await this.refreshMismatchAlarm()
  }

  clearExpiredMismatches() {
    if (!this.state) return false
    const now = Date.now()
    let changed = false
    for (const player of Object.values(this.state.players)) {
      if (player.lockedUntil && player.lockedUntil <= now) {
        player.mismatchIndices = null
        player.lockedUntil = null
        changed = true
      }
    }
    return changed
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
          pairs: player.matchedIndices.length / 2,
          moves: player.moves,
          completedAt: player.completedAt,
        },
      ]),
    )
    const player = playerId ? this.state.players[playerId] : undefined
    const visibleIndices = new Set(player?.matchedIndices ?? [])
    if (player?.firstFlip !== null && player?.firstFlip !== undefined) {
      visibleIndices.add(player.firstFlip)
    }
    if (
      player?.mismatchIndices &&
      player.lockedUntil &&
      player.lockedUntil > Date.now()
    ) {
      for (const index of player.mismatchIndices) visibleIndices.add(index)
    }
    const myVisibleCards = Object.fromEntries(
      [...visibleIndices].map((index) => [index, this.state?.board[index]]),
    ) as Partial<Record<number, MemorySymbol>>

    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players,
      status: this.state.status,
      maxPlayers: this.state.maxPlayers,
      roundId: this.state.roundId,
      startsAt: this.state.startsAt,
      finishedAt: this.state.finishedAt,
      winner: this.state.winner,
      serverNow: Date.now(),
      myMatchedIndices: [...(player?.matchedIndices ?? [])],
      myVisibleCards,
      myLockedUntil: player?.lockedUntil ?? null,
      revealedBoard:
        this.state.status === "finished" ? [...this.state.board] : null,
    }
  }

  async saveState() {
    if (this.state) await this.room.storage.put("state", this.state)
  }

  async refreshMismatchAlarm() {
    if (!this.state || this.state.status !== "playing") {
      await this.room.storage.deleteAlarm()
      return
    }
    const now = Date.now()
    const nextDeadline = Object.values(this.state.players)
      .map((player) => player.lockedUntil)
      .filter((deadline): deadline is number => Boolean(deadline && deadline > now))
      .sort((left, right) => left - right)[0]

    if (nextDeadline) {
      await this.room.storage.setAlarm(nextDeadline)
    } else {
      await this.room.storage.deleteAlarm()
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

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, "memory-match")
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
        board: [],
        roundId: crypto.randomUUID(),
        startsAt: null,
        finishedAt: null,
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
            this.clearExpiredMismatches()
            await this.saveState()
            await this.refreshMismatchAlarm()
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
            matchedIndices: [],
            firstFlip: null,
            mismatchIndices: null,
            lockedUntil: null,
            moves: 0,
            completedAt: null,
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
              player.matchedIndices = []
              player.firstFlip = null
              player.mismatchIndices = null
              player.lockedUntil = null
              player.moves = 0
              player.completedAt = null
            }
          }
          this.state.board = generateMemoryBoard()
          this.state.roundId = crypto.randomUUID()
          this.state.status = "playing"
          this.state.startsAt = Date.now() + MEMORY_COUNTDOWN_MS
          this.state.finishedAt = null
          this.state.winner = null
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          return
        }

        case "flip": {
          if (this.state.status !== "playing") return
          if (data.roundId !== this.state.roundId) {
            this.send(sender, {
              type: "state",
              state: this.getPublicState(sender.id),
            })
            return
          }
          if (this.state.startsAt && Date.now() < this.state.startsAt) return
          if (!isMemoryBoardIndex(data.index)) {
            this.send(sender, { type: "error", message: "Invalid card" })
            return
          }

          const player = this.state.players[sender.id]
          if (!player || player.completedAt) return
          if (player.lockedUntil && player.lockedUntil <= Date.now()) {
            player.mismatchIndices = null
            player.lockedUntil = null
          }
          if (player.lockedUntil || player.matchedIndices.includes(data.index)) return
          if (player.firstFlip === data.index) return

          if (player.firstFlip === null) {
            player.firstFlip = data.index
          } else {
            const firstIndex = player.firstFlip
            player.firstFlip = null
            player.moves += 1
            if (this.state.board[firstIndex] === this.state.board[data.index]) {
              player.matchedIndices = [
                ...player.matchedIndices,
                firstIndex,
                data.index,
              ]
              if (player.matchedIndices.length === MEMORY_BOARD_SIZE) {
                player.completedAt = Date.now()
                this.state.status = "finished"
                this.state.finishedAt = player.completedAt
                this.state.winner = {
                  id: player.id,
                  name: player.name,
                  moves: player.moves,
                  completedAt: player.completedAt,
                }
              }
            } else {
              player.mismatchIndices = [firstIndex, data.index]
              player.lockedUntil = Date.now() + MEMORY_MISMATCH_MS
            }
          }

          await this.saveState()
          await this.refreshMismatchAlarm()
          this.broadcastState()
          return
        }

        case "restart": {
          if (this.state.status !== "finished") {
            this.send(sender, { type: "error", message: "The race is still active" })
            return
          }
          if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
            this.send(sender, { type: "error", message: "Only the host can restart" })
            return
          }

          this.state.status = "waiting"
          this.state.board = []
          this.state.roundId = crypto.randomUUID()
          this.state.startsAt = null
          this.state.finishedAt = null
          this.state.winner = null
          for (const player of Object.values(this.state.players)) {
            player.matchedIndices = []
            player.firstFlip = null
            player.mismatchIndices = null
            player.lockedUntil = null
            player.moves = 0
            player.completedAt = null
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
          await this.saveState()
          await this.refreshMismatchAlarm()
          this.broadcastState()
          return
        }
      }
    } catch (error) {
      console.error("Memory Match message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onAlarm() {
    if (!this.state || this.state.status !== "playing") return
    const changed = this.clearExpiredMismatches()
    if (changed) await this.saveState()
    await this.refreshMismatchAlarm()
    if (changed) this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, "memory-match")
    if (!match) return new Response("Not found", { status: 404 })
    const finished = this.state?.status === "finished"
    return Response.json({
      finished,
      scored: true,
      winnerIds: finished && this.state?.winner ? [this.state.winner.id] : [],
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
    await this.saveState()
    this.broadcastState()
  }
}
