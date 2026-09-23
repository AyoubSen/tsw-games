import type * as Party from "partykit/server"
import {
  BOMB_STRIKE_LIMIT, BOMB_SYMBOLS, BOMB_TIME_OPTIONS, WIRE_COLORS,
  type BombClientMessage, type BombDevice, type BombManual, type BombPlayer,
  type BombRoundResult, type BombServerMessage, type BombSubmission,
  type BombSymbol, type ModuleKind, type PublicBombState,
} from "../src/lib/bombDefusal"
import { withRoomCleanup } from "./shared/cleanup"
import { getGameNightResultMatch, validateGameNightConnection, type GameNightMember } from "./shared/gameNight"
import { canControlGame, isPresent, markConnected, markDisconnected, nextHost, presentCount } from "./shared/presence"

interface BombModule {
  kind: ModuleKind
  expertId: string
  solved: boolean
  revision: number
  device: BombDevice
  manual: BombManual
  answer: BombSubmission
}

interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, BombPlayer>
  playerTokens: Record<string, string>
  status: PublicBombState["status"]
  timeLimit: number
  order: string[]
  round: number
  missionId: string | null
  operatorId: string | null
  deadline: number | null
  strikes: number
  modules: BombModule[]
  outcome: PublicBombState["outcome"]
  lastAction: PublicBombState["lastAction"]
  history: BombRoundResult[]
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function generateModules(expertIds: string[]): BombModule[] {
  const repeatedColor = WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)]
  const colors = Array.from({ length: 5 }, () => WIRE_COLORS[Math.floor(Math.random() * WIRE_COLORS.length)])
  const serial = String(100 + Math.floor(Math.random() * 900))
  const [evenPosition, oddPosition] = shuffle([1, 2, 3, 4, 5])
  const wirePosition = colors.filter((color) => color === repeatedColor).length >= 2
    ? colors.lastIndexOf(repeatedColor) + 1
    : Number(serial) % 2 === 0 ? evenPosition : oddPosition
  const order = shuffle(Object.keys(BOMB_SYMBOLS) as BombSymbol[])
  const symbols = shuffle(order).slice(0, 4)
  const patterns = shuffle(Array.from({ length: 14 }, (_, index) => index + 1))
  const rows = Array.from({ length: 8 }, (_, index) => ({
    channel: Math.floor(index / 2) + 1,
    signal: index % 2 === 0 ? "steady" as const : "pulsing" as const,
    positions: Array.from({ length: 4 }, (_, bit) => Boolean(patterns[index] & (1 << bit))),
  }))
  const selectedRow = rows[Math.floor(Math.random() * rows.length)]
  return [
    {
      kind: "wires", expertId: expertIds[0], solved: false, revision: 0,
      device: { kind: "wires", serial, colors },
      manual: { kind: "wires", repeatedColor, evenPosition, oddPosition },
      answer: { kind: "wires", position: wirePosition },
    },
    {
      kind: "symbols", expertId: expertIds[1 % expertIds.length], solved: false, revision: 0,
      device: { kind: "symbols", symbols },
      manual: { kind: "symbols", order },
      answer: { kind: "symbols", sequence: order.filter((symbol) => symbols.includes(symbol)) },
    },
    {
      kind: "switches", expertId: expertIds[2 % expertIds.length], solved: false, revision: 0,
      device: { kind: "switches", channel: selectedRow.channel, signal: selectedRow.signal },
      manual: { kind: "switches", rows },
      answer: { kind: "switches", positions: [...selectedRow.positions] },
    },
  ]
}

function validSubmission(submission: BombSubmission, module: BombModule): boolean {
  if (!submission || submission.kind !== module.kind) return false
  if (submission.kind === "wires") return Number.isInteger(submission.position) && submission.position >= 1 && submission.position <= 5
  if (submission.kind === "switches") return Array.isArray(submission.positions) && submission.positions.length === 4 && submission.positions.every((value) => typeof value === "boolean")
  return Array.isArray(submission.sequence) && submission.sequence.length === 4 && new Set(submission.sequence).size === 4 &&
    module.device.kind === "symbols" && submission.sequence.every((symbol) => module.device.kind === "symbols" && module.device.symbols.includes(symbol))
}

function correctSubmission(submission: BombSubmission, answer: BombSubmission): boolean {
  if (submission.kind === "wires" && answer.kind === "wires") return submission.position === answer.position
  if (submission.kind === "symbols" && answer.kind === "symbols") return submission.sequence.every((symbol, index) => symbol === answer.sequence[index])
  if (submission.kind === "switches" && answer.kind === "switches") return submission.positions.every((position, index) => position === answer.positions[index])
  return false
}

class BombDefusalParty implements Party.Server {
  constructor(readonly room: Party.Room) {}
  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    this.state = await this.room.storage.get<GameState>("state") ?? null
    if (!this.state) return
    for (const player of Object.values(this.state.players)) player.connected = false
    this.expireIfDue()
    await this.persist()
  }

  isAuthenticated(connection: Party.Connection) {
    const token = this.connectionTokens.get(connection)
    return Boolean(this.state?.players[connection.id] && token && this.state.playerTokens[connection.id] === token)
  }

  send(connection: Party.Connection, message: BombServerMessage) {
    connection.send(JSON.stringify(message))
  }

  getPublicState(playerId: string): PublicBombState {
    if (!this.state) throw new Error("No game state")
    const state = this.state
    const isOperator = state.operatorId === playerId
    const reveal = state.status === "round-end" || state.status === "finished"
    return {
      roomCode: state.roomCode, hostId: state.hostId,
      canControl: canControlGame(state.players, state.hostId, playerId),
      players: state.players, status: state.status, timeLimit: state.timeLimit,
      round: state.round, totalRounds: state.order.length, missionId: state.missionId,
      operatorId: state.operatorId, nextOperatorId: state.order[state.round] ?? null,
      deadline: state.deadline, serverTime: Date.now(), strikes: state.strikes,
      modules: state.modules.map((module) => ({
        kind: module.kind, expertId: module.expertId, solved: module.solved, revision: module.revision,
        device: isOperator || reveal ? module.device : null,
        manual: (!isOperator && module.expertId === playerId) || reveal ? module.manual : null,
      })),
      outcome: state.outcome, lastAction: state.lastAction, history: state.history,
    }
  }

  broadcastState() {
    for (const connection of this.room.getConnections()) {
      if (this.isAuthenticated(connection)) this.send(connection, { type: "state", state: this.getPublicState(connection.id) })
    }
  }

  async persist() {
    if (!this.state) return
    await this.room.storage.put("state", this.state)
    if (this.state.status === "playing" && this.state.deadline) await this.room.storage.setAlarm(this.state.deadline)
    else await this.room.storage.deleteAlarm()
  }

  expireIfDue() {
    if (this.state?.status === "playing" && this.state.deadline && Date.now() >= this.state.deadline) {
      this.finishRound("time")
      return true
    }
    return false
  }

  startRound() {
    if (!this.state) return
    const state = this.state
    state.operatorId = state.order[state.round]
    state.round++
    state.missionId = crypto.randomUUID()
    state.strikes = 0
    state.lastAction = null
    state.outcome = null
    state.modules = generateModules(state.order.filter((id) => id !== state.operatorId))
    state.status = "playing"
    state.deadline = Date.now() + state.timeLimit * 1000
  }

  finishRound(outcome: NonNullable<PublicBombState["outcome"]>) {
    if (!this.state) return
    const state = this.state
    if (state.status === "playing") {
      state.history.push({
        round: state.round, operatorName: state.players[state.operatorId ?? ""]?.name ?? "Departed operator",
        defused: outcome === "defused", solvedModules: state.modules.filter((module) => module.solved).length,
        strikes: state.strikes, secondsLeft: Math.max(0, Math.ceil(((state.deadline ?? Date.now()) - Date.now()) / 1000)),
      })
    }
    state.outcome = outcome
    state.deadline = null
    state.status = outcome === "defused" && state.round < state.order.length ? "round-end" : "finished"
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const night = await validateGameNightConnection(this.room, connection, context, "bomb-defusal")
    if (night.mode === "invalid") return
    if (night.mode === "game-night") this.gameNightMembers.set(connection, night.member)
    const url = new URL(context.request.url)
    const token = url.searchParams.get("playerToken") ?? ""
    if (token) this.connectionTokens.set(connection, token)
    const canCreate = night.mode === "game-night" ? night.member.isHost : url.searchParams.get("host") === "true"
    if (canCreate && !this.state) {
      const requestedTime = Number(url.searchParams.get("timeLimit"))
      this.state = {
        roomCode: this.room.id, hostId: connection.id, players: {}, playerTokens: {},
        status: "waiting", timeLimit: BOMB_TIME_OPTIONS.find((value) => value === requestedTime) ?? 240,
        order: [], round: 0, missionId: null, operatorId: null, deadline: null,
        strikes: 0, modules: [], outcome: null, lastAction: null, history: [],
      }
      await this.persist()
    }
    if (!this.state) this.send(connection, { type: "error", message: "Game not found" })
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return
    try {
      const data = JSON.parse(message) as BombClientMessage
      if (!data || typeof data !== "object") return
      const error = (text: string) => this.send(sender, { type: "error", message: text })
      if (data.type !== "join" && !this.isAuthenticated(sender)) return error("Invalid player session")
      const state = this.state
      if (this.expireIfDue()) {
        await this.persist()
        this.broadcastState()
        if (data.type === "attempt") return
      }

      switch (data.type) {
        case "join": {
          const token = this.connectionTokens.get(sender)
          if (!token) return error("Invalid player session")
          const name = this.gameNightMembers.get(sender)?.name ?? (typeof data.name === "string" ? data.name.trim().slice(0, 20) : "")
          if (!name) return error("Enter your name first")
          if (state.players[sender.id]) {
            if (state.playerTokens[sender.id] !== token) return error("Invalid player session")
            markConnected(state.players, sender.id)
            state.players[sender.id].name = name
          } else {
            if (state.status !== "waiting") return error("Game already started")
            if (Object.keys(state.players).length >= 4) return error("Game is full")
            state.players[sender.id] = { id: sender.id, name, joinedAt: Date.now(), connected: true }
            state.playerTokens[sender.id] = token
            if (!state.players[state.hostId]) state.hostId = sender.id
          }
          break
        }
        case "start": {
          if (state.status !== "waiting" || !canControlGame(state.players, state.hostId, sender.id)) return error("Only the host can start from the lobby")
          if (presentCount(state.players) < 2) return error("Need at least 2 connected players")
          for (const player of Object.values(state.players)) {
            if (!isPresent(player)) {
              delete state.players[player.id]
              delete state.playerTokens[player.id]
            }
          }
          state.order = Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt).map((player) => player.id)
          this.startRound()
          break
        }
        case "next": {
          if (state.status !== "round-end" || data.missionId !== state.missionId || !canControlGame(state.players, state.hostId, sender.id)) return
          if (!state.order.every((id) => isPresent(state.players[id]))) return error("Wait for the whole crew to reconnect before rotating roles")
          this.startRound()
          break
        }
        case "attempt": {
          if (state.status !== "playing") break
          if (sender.id !== state.operatorId) return error("Only the operator can touch the device")
          if (data.missionId !== state.missionId || !data.submission) return
          const module = state.modules.find((candidate) => candidate.kind === data.submission.kind)
          if (!module || module.solved || data.revision !== module.revision) return
          if (!validSubmission(data.submission, module)) return error("Complete the module controls before submitting")
          const correct = correctSubmission(data.submission, module.answer)
          module.revision++
          module.solved = correct
          state.lastAction = { kind: module.kind, correct }
          if (!correct) state.strikes++
          if (state.strikes >= BOMB_STRIKE_LIMIT) this.finishRound("strikes")
          else if (state.modules.every((candidate) => candidate.solved)) this.finishRound("defused")
          break
        }
        case "restart": {
          if (state.status !== "finished" || !canControlGame(state.players, state.hostId, sender.id)) return
          state.status = "waiting"
          state.order = []
          state.round = 0
          state.missionId = null
          state.operatorId = null
          state.modules = []
          state.strikes = 0
          state.deadline = null
          state.outcome = null
          state.lastAction = null
          state.history = []
          break
        }
        case "leave": {
          if (state.status === "playing" || state.status === "round-end") this.finishRound("crew-left")
          delete state.players[sender.id]
          delete state.playerTokens[sender.id]
          if (Object.keys(state.players).length === 0) {
            this.state = null
            await this.room.storage.delete("state")
            await this.room.storage.deleteAlarm()
            return
          }
          if (state.hostId === sender.id) state.hostId = nextHost(state.players, sender.id) ?? Object.keys(state.players)[0]
          break
        }
        default: return
      }
      await this.persist()
      this.broadcastState()
    } catch (error) {
      console.error("Bomb Defusal message error:", error)
      this.send(sender, { type: "error", message: "Could not process that action" })
    }
  }

  async onClose(connection: Party.Connection) {
    if (!this.state || !this.isAuthenticated(connection)) return
    if (Array.from(this.room.getConnections()).some((candidate) => candidate.id === connection.id && candidate !== connection)) return
    markDisconnected(this.state.players, connection.id)
    this.connectionTokens.delete(connection)
    this.gameNightMembers.delete(connection)
    this.expireIfDue()
    await this.persist()
    this.broadcastState()
  }

  async onAlarm() {
    if (!this.state) return
    this.expireIfDue()
    await this.persist()
    this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    if (!await getGameNightResultMatch(this.room, request, "bomb-defusal")) return new Response("Not found", { status: 404 })
    if (this.expireIfDue()) { await this.persist(); this.broadcastState() }
    const finished = this.state?.status === "finished"
    return Response.json({
      finished, scored: true,
      winnerIds: finished && this.state?.outcome === "defused" ? this.state.order.filter((id) => Boolean(this.state?.players[id])) : [],
    })
  }
}

export default withRoomCleanup(BombDefusalParty, "bombdefusal")
