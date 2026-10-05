import type * as Party from "partykit/server"
import {
  BOMB_DIFFICULTIES, BOMB_PACE_MS, BOMB_STRIKE_LIMIT, BOMB_SYMBOLS, BOMB_TIME_OPTIONS, BUTTON_COLORS, BUTTON_LABELS,
  MODULE_KINDS, SIMON_COLORS, WIRE_COLORS, formatBombTime, isBombDifficulty,
  type BombClientMessage, type BombDevice, type BombDifficulty, type BombLogEntry, type BombManual, type BombOutcome,
  type BombPace, type BombPlayer, type BombRoundResult, type BombServerMessage, type BombSubmission,
  type BombSymbol, type ButtonAction, type ButtonRule, type ModuleKind, type PublicBombState,
} from "../src/lib/bombDefusal"
import { isReaction, takeReactionSlot, type ReactionMessage } from "../src/lib/reactions"
import { withRoomCleanup } from "./shared/cleanup"
import { getGameNightResultMatch, validateGameNightConnection, type GameNightMember } from "./shared/gameNight"
import { JoinVerifier, reportDirectResult } from "./shared/account"
import { canControlGame, isPresent, markConnected, markDisconnected, nextHost, presentCount } from "./shared/presence"

interface BombModule {
  kind: ModuleKind
  expertId: string
  solved: boolean
  revision: number
  cut: number[]
  device: BombDevice
  manual: BombManual
}

interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, BombPlayer>
  playerTokens: Record<string, string>
  status: PublicBombState["status"]
  timeLimit: number
  difficulty: BombDifficulty
  order: string[]
  round: number
  missionId: string | null
  operatorId: string | null
  deadline: number | null
  serial: string
  strikes: number
  modules: BombModule[]
  outcome: BombOutcome | null
  lastAction: PublicBombState["lastAction"]
  paceSeq: number
  pace: BombPace | null
  frozenSecondsLeft: number | null
  log: BombLogEntry[]
  history: BombRoundResult[]
  /** Server-only: player id -> verified account. Kept off BombPlayer, which is sent to clients as is. */
  accounts?: Record<string, string>
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function generateSerial() {
  const letters = "ABCDEFGHJKLMNPQRSTVWXZ"
  return `${pick([...letters])}${pick([...letters])}${Math.floor(Math.random() * 10)}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`
}

function generateModule(kind: ModuleKind): Pick<BombModule, "device" | "manual"> {
  switch (kind) {
    case "wires": {
      const [evenPosition, oddPosition] = shuffle([1, 2, 3, 4, 5])
      return {
        device: { kind, colors: Array.from({ length: 5 }, () => pick(WIRE_COLORS)) },
        manual: { kind, repeatedColor: pick(WIRE_COLORS), evenPosition, oddPosition },
      }
    }
    case "symbols": {
      const order = shuffle(Object.keys(BOMB_SYMBOLS) as BombSymbol[])
      return { device: { kind, symbols: shuffle(order).slice(0, 4) }, manual: { kind, order } }
    }
    case "switches": {
      const patterns = shuffle(Array.from({ length: 14 }, (_, index) => index + 1))
      const rows = Array.from({ length: 8 }, (_, index) => ({
        channel: Math.floor(index / 2) + 1,
        signal: index % 2 === 0 ? "steady" as const : "pulsing" as const,
        positions: Array.from({ length: 4 }, (_, bit) => Boolean(patterns[index] & (1 << bit))),
      }))
      const row = pick(rows)
      return { device: { kind, channel: row.channel, signal: row.signal }, manual: { kind, rows } }
    }
    case "button": {
      const actions: ButtonAction[] = ["tap", "hold"]
      const rules: ButtonRule[] = [
        { color: pick(BUTTON_COLORS), label: pick(BUTTON_LABELS), action: pick(actions) },
        ...shuffle<ButtonRule>([
          { color: pick(BUTTON_COLORS), action: pick(actions) },
          { label: pick(BUTTON_LABELS), action: pick(actions) },
        ]),
      ]
      const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
      return {
        device: { kind, color: pick(BUTTON_COLORS), label: pick(BUTTON_LABELS), strip: pick(BUTTON_COLORS) },
        manual: {
          kind, rules, fallback: pick(actions),
          release: { red: digits[0], blue: digits[1], yellow: digits[2], white: digits[3] },
        },
      }
    }
    case "simon":
      return {
        device: { kind, flashes: Array.from({ length: Math.random() < 0.5 ? 3 : 4 }, () => pick(SIMON_COLORS)) },
        manual: { kind, table: Array.from({ length: BOMB_STRIKE_LIMIT }, () => shuffle(SIMON_COLORS)) },
      }
  }
}

function generateModules(difficulty: BombDifficulty, expertIds: string[]): BombModule[] {
  const kinds = shuffle(MODULE_KINDS).slice(0, BOMB_DIFFICULTIES[difficulty].modules)
  return kinds.map((kind, index) => ({
    kind, expertId: expertIds[index % expertIds.length], solved: false, revision: 0, cut: [], ...generateModule(kind),
  }))
}

function buttonAction(device: Extract<BombDevice, { kind: "button" }>, manual: Extract<BombManual, { kind: "button" }>): ButtonAction {
  const rule = manual.rules.find((candidate) =>
    (!candidate.color || candidate.color === device.color) && (!candidate.label || candidate.label === device.label))
  return rule?.action ?? manual.fallback
}

function validSubmission(submission: BombSubmission, module: BombModule): boolean {
  if (!submission || submission.kind !== module.kind) return false
  const device = module.device
  switch (submission.kind) {
    case "wires": return Number.isInteger(submission.position) && submission.position >= 1 && submission.position <= 5 && !module.cut.includes(submission.position)
    case "switches": return Array.isArray(submission.positions) && submission.positions.length === 4 && submission.positions.every((value) => typeof value === "boolean")
    case "symbols": return device.kind === "symbols" && Array.isArray(submission.sequence) && submission.sequence.length === 4 &&
      new Set(submission.sequence).size === 4 && submission.sequence.every((symbol) => device.symbols.includes(symbol))
    case "button": return submission.action === "tap" || (submission.action === "hold" && Number.isInteger(submission.secondsLeft))
    case "simon": return device.kind === "simon" && Array.isArray(submission.sequence) && submission.sequence.length === device.flashes.length &&
      submission.sequence.every((color) => (SIMON_COLORS as readonly string[]).includes(color))
  }
}

function correctSubmission(submission: BombSubmission, module: BombModule, strikes: number, serial: string): boolean {
  const { device, manual } = module
  if (submission.kind === "wires" && device.kind === "wires" && manual.kind === "wires") {
    const answer = device.colors.filter((color) => color === manual.repeatedColor).length >= 2
      ? device.colors.lastIndexOf(manual.repeatedColor) + 1
      : Number(serial.at(-1)) % 2 === 0 ? manual.evenPosition : manual.oddPosition
    return submission.position === answer
  }
  if (submission.kind === "symbols" && device.kind === "symbols" && manual.kind === "symbols") {
    const answer = manual.order.filter((symbol) => device.symbols.includes(symbol))
    return submission.sequence.every((symbol, index) => symbol === answer[index])
  }
  if (submission.kind === "switches" && device.kind === "switches" && manual.kind === "switches") {
    const row = manual.rows.find((candidate) => candidate.channel === device.channel && candidate.signal === device.signal)
    return Boolean(row && submission.positions.every((position, index) => position === row.positions[index]))
  }
  if (submission.kind === "button" && device.kind === "button" && manual.kind === "button") {
    const action = buttonAction(device, manual)
    if (submission.action !== action) return false
    return submission.action === "tap" || formatBombTime(submission.secondsLeft).includes(String(manual.release[device.strip]))
  }
  if (submission.kind === "simon" && device.kind === "simon" && manual.kind === "simon") {
    const row = manual.table[Math.min(strikes, manual.table.length - 1)]
    return device.flashes.every((color, index) => submission.sequence[index] === row[SIMON_COLORS.indexOf(color)])
  }
  return false
}

const SWITCH_NAMES = ["A", "B", "C", "D"]
function describe(submission: BombSubmission): string {
  switch (submission.kind) {
    case "wires": return `Cut wire ${submission.position}`
    case "symbols": return `Pressed ${submission.sequence.map((symbol) => BOMB_SYMBOLS[symbol].label).join(" → ")}`
    case "switches": return `Set switches ${submission.positions.map((up, index) => `${SWITCH_NAMES[index]}${up ? "↑" : "↓"}`).join(" ")}`
    case "button": return submission.action === "tap" ? "Tapped the button" : `Held the button, released at ${formatBombTime(submission.secondsLeft)}`
    case "simon": return `Pressed ${submission.sequence.join(" → ")}`
  }
}

class BombDefusalParty implements Party.Server {
  constructor(readonly room: Party.Room) {
    this.joins = new JoinVerifier(room)
  }
  joins: JoinVerifier
  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  reactedAt = new Map<string, number>()

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state") ?? null
    if (!stored) return
    stored.difficulty ??= "normal"
    stored.serial ??= generateSerial()
    stored.paceSeq ??= 0
    stored.pace ??= null
    stored.frozenSecondsLeft ??= null
    stored.log ??= []
    for (const module of stored.modules) module.cut ??= []
    this.state = stored
    for (const player of Object.values(stored.players)) player.connected = false
    this.advanceIfDue()
    await this.persist()
  }

  isAuthenticated(connection: Party.Connection) {
    const token = this.connectionTokens.get(connection)
    return Boolean(this.state?.players[connection.id] && token && this.state.playerTokens[connection.id] === token)
  }

  send(connection: Party.Connection, message: BombServerMessage) {
    connection.send(JSON.stringify(message))
  }

  secondsLeft() {
    const deadline = this.state?.deadline
    return deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0
  }

  getPublicState(playerId: string): PublicBombState {
    if (!this.state) throw new Error("No game state")
    const state = this.state
    const isOperator = state.operatorId === playerId
    const live = state.status === "playing" || state.status === "resolving"
    const reveal = state.status === "round-end" || state.status === "finished"
    const seesDevice = (live && isOperator) || reveal
    return {
      roomCode: state.roomCode, hostId: state.hostId,
      canControl: canControlGame(state.players, state.hostId, playerId),
      players: state.players, status: state.status, timeLimit: state.timeLimit, difficulty: state.difficulty,
      round: state.round, totalRounds: state.order.length, missionId: state.missionId,
      operatorId: state.operatorId, nextOperatorId: state.order[state.round] ?? null,
      deadline: state.deadline, serverTime: Date.now(),
      serial: seesDevice && state.modules.length ? state.serial : null,
      strikes: state.strikes,
      modules: state.modules.map((module) => ({
        kind: module.kind, expertId: module.expertId, solved: module.solved, revision: module.revision, cut: module.cut,
        device: seesDevice ? module.device : null,
        manual: (live && !isOperator && module.expertId === playerId) || reveal ? module.manual : null,
      })),
      outcome: state.outcome, lastAction: state.lastAction, pace: state.pace,
      frozenSecondsLeft: state.frozenSecondsLeft, log: state.log, history: state.history,
    }
  }

  broadcastState() {
    for (const connection of this.room.getConnections()) {
      if (this.isAuthenticated(connection)) this.send(connection, { type: "state", state: this.getPublicState(connection.id) })
    }
  }

  broadcastReaction(message: ReactionMessage) {
    for (const connection of this.room.getConnections()) {
      if (this.isAuthenticated(connection)) this.send(connection, message)
    }
  }

  async persist() {
    if (!this.state) return
    await this.room.storage.put("state", this.state)
    const at = this.state.status === "playing" ? this.state.deadline : this.state.pace?.endsAt ?? null
    if (at) await this.room.storage.setAlarm(Math.max(Date.now() + 10, at))
    else await this.room.storage.deleteAlarm()
  }

  beat(stage: BombPace["stage"], duration: number) {
    if (!this.state) return
    this.state.pace = { seq: ++this.state.paceSeq, stage, endsAt: Date.now() + duration }
  }

  /** Runs the clock and any finished beat; true when something changed. */
  advanceIfDue() {
    const state = this.state
    if (!state) return false
    const now = Date.now()
    if (state.status === "playing" && state.deadline && now >= state.deadline) {
      this.finishRound("time")
      return true
    }
    if (!state.pace || now < state.pace.endsAt - 50) return false
    if (state.status === "handoff") {
      state.status = "playing"
      state.pace = null
      state.deadline = now + state.timeLimit * 1000
    } else if (state.status === "resolving") {
      state.status = state.outcome === "defused" && state.round < state.order.length ? "round-end" : "finished"
      state.pace = null
      if (state.status === "finished") this.reportFinish()
    } else {
      state.pace = null
    }
    return true
  }

  /** The next operator takes the device; their clock starts when the handoff beat ends. */
  startHandoff() {
    if (!this.state) return
    const state = this.state
    state.operatorId = state.order[state.round]
    state.round++
    state.missionId = crypto.randomUUID()
    state.serial = generateSerial()
    state.strikes = 0
    state.lastAction = null
    state.outcome = null
    state.frozenSecondsLeft = null
    state.log = []
    state.modules = generateModules(state.difficulty, state.order.filter((id) => id !== state.operatorId))
    state.deadline = null
    state.status = "handoff"
    this.beat("handoff", BOMB_PACE_MS.handoff)
  }

  finishRound(outcome: BombOutcome) {
    if (!this.state) return
    const state = this.state
    if (state.status === "playing") {
      const secondsLeft = outcome === "time" ? 0 : this.secondsLeft()
      state.frozenSecondsLeft = secondsLeft
      state.history.push({
        round: state.round, operatorName: state.players[state.operatorId ?? ""]?.name ?? "Departed operator",
        defused: outcome === "defused", outcome, difficulty: state.difficulty, moduleCount: state.modules.length,
        solvedModules: state.modules.filter((module) => module.solved).length, strikes: state.strikes, secondsLeft,
      })
    }
    state.outcome = outcome
    state.deadline = null
    if (outcome === "crew-left") {
      state.status = "finished"
      state.pace = null
      this.reportFinish()
      return
    }
    state.status = "resolving"
    if (outcome === "defused") this.beat("defused", BOMB_PACE_MS.defused)
    else this.beat("exploded", BOMB_PACE_MS.exploded + (outcome === "strikes" ? BOMB_PACE_MS.boomDelay : 0))
  }

  /** Same winners as the Game Night result: the whole crew wins if the last bomb was defused. */
  reportFinish() {
    if (!this.state) return
    const state = this.state
    const accounts = state.accounts ?? {}
    void reportDirectResult(this.room, {
      resultId: `bomb-defusal:${state.roomCode}:${state.missionId}`,
      game: "bomb-defusal",
      vsBot: false,
      players: state.order.filter((id) => state.players[id]).map((id) => ({ userId: accounts[id], won: state.outcome === "defused" })),
    })
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
      const requestedDifficulty = url.searchParams.get("difficulty")
      this.state = {
        roomCode: this.room.id, hostId: connection.id, players: {}, playerTokens: {},
        status: "waiting", timeLimit: BOMB_TIME_OPTIONS.find((value) => value === requestedTime) ?? 240,
        difficulty: isBombDifficulty(requestedDifficulty) ? requestedDifficulty : "normal",
        order: [], round: 0, missionId: null, operatorId: null, deadline: null, serial: generateSerial(),
        strikes: 0, modules: [], outcome: null, lastAction: null, paceSeq: 0, pace: null,
        frozenSecondsLeft: null, log: [], history: [],
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
      if (data.type !== "join") await this.joins.settled(sender)
      if (!this.state) return
      const error = (text: string) => this.send(sender, { type: "error", message: text })
      if (data.type !== "join" && !this.isAuthenticated(sender)) return error("Invalid player session")
      const state = this.state
      if (this.advanceIfDue()) {
        await this.persist()
        this.broadcastState()
        if (data.type === "attempt") return
      }

      switch (data.type) {
        case "join": {
          const token = this.connectionTokens.get(sender)
          if (!token) return error("Invalid player session")
          const account = await this.joins.verify(sender, data.authToken)
          if (this.state !== state) return
          const typedName = typeof data.name === "string" ? data.name.trim().slice(0, 20) : ""
          const member = this.gameNightMembers.get(sender)
          // A verified player keeps their profile name even if a later join comes without a token.
          const keptName = !member && !account && state.accounts?.[sender.id] ? state.players[sender.id]?.name : undefined
          const name = member?.name ?? account?.displayName ?? keptName ?? typedName
          if (!name) return error("Enter your name first")
          if (state.players[sender.id]) {
            if (state.playerTokens[sender.id] !== token) return error("Invalid player session")
            markConnected(state.players, sender.id)
            state.players[sender.id].name = name
            if (account) state.accounts = { ...state.accounts, [sender.id]: account.userId }
          } else {
            if (state.status !== "waiting") return error("Game already started")
            if (Object.keys(state.players).length >= 4) return error("Game is full")
            state.players[sender.id] = { id: sender.id, name, joinedAt: Date.now(), connected: true }
            state.playerTokens[sender.id] = token
            if (account) state.accounts = { ...state.accounts, [sender.id]: account.userId }
            if (!state.players[state.hostId]) state.hostId = sender.id
          }
          break
        }
        case "settings": {
          if (state.status !== "waiting" || !canControlGame(state.players, state.hostId, sender.id)) return
          const time = BOMB_TIME_OPTIONS.find((value) => value === data.timeLimit)
          if (time) state.timeLimit = time
          if (isBombDifficulty(data.difficulty)) state.difficulty = data.difficulty
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
          this.startHandoff()
          break
        }
        case "next": {
          if (state.status !== "round-end" || data.missionId !== state.missionId || !canControlGame(state.players, state.hostId, sender.id)) return
          if (!state.order.every((id) => isPresent(state.players[id]))) return error("Wait for the whole crew to reconnect before rotating roles")
          this.startHandoff()
          break
        }
        case "attempt": {
          if (state.status !== "playing") return
          if (sender.id !== state.operatorId) return error("Only the operator can touch the device")
          if (data.missionId !== state.missionId || !data.submission) return
          const submission = data.submission
          const module = state.modules.find((candidate) => candidate.kind === submission.kind)
          if (!module || module.solved || data.revision !== module.revision) return
          if (!validSubmission(submission, module)) return error("Complete the module controls before submitting")
          const secondsLeft = this.secondsLeft()
          // A release is checked against the clock the operator saw, allowing for the trip here.
          if (submission.kind === "button" && submission.action === "hold" &&
            (submission.secondsLeft < secondsLeft - 1 || submission.secondsLeft > secondsLeft + 3)) {
            module.revision++
            error("That release didn't register. Try again.")
            break
          }
          const correct = correctSubmission(submission, module, state.strikes, state.serial)
          module.revision++
          module.solved = correct
          if (submission.kind === "wires") module.cut.push(submission.position)
          if (!correct) state.strikes++
          state.lastAction = { seq: (state.lastAction?.seq ?? 0) + 1, kind: module.kind, correct }
          state.log.push({ seq: state.log.length + 1, secondsLeft, kind: module.kind, text: describe(submission), correct, strikes: state.strikes })
          if (state.strikes >= BOMB_STRIKE_LIMIT) this.finishRound("strikes")
          else if (state.modules.every((candidate) => candidate.solved)) this.finishRound("defused")
          break
        }
        case "react": {
          if (!isReaction(data.reaction) || !takeReactionSlot(this.reactedAt, sender.id)) return
          this.broadcastReaction({ type: "reaction", playerId: sender.id, reaction: data.reaction })
          return
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
          state.pace = null
          state.frozenSecondsLeft = null
          state.log = []
          state.history = []
          break
        }
        case "leave": {
          if (state.status !== "waiting" && state.status !== "finished") this.finishRound("crew-left")
          delete state.players[sender.id]
          delete state.playerTokens[sender.id]
          delete state.accounts?.[sender.id]
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
    this.advanceIfDue()
    await this.persist()
    this.broadcastState()
  }

  async onAlarm() {
    if (!this.state) return
    this.advanceIfDue()
    await this.persist()
    this.broadcastState()
  }

  async onRequest(request: Party.Request) {
    if (!await getGameNightResultMatch(this.room, request, "bomb-defusal")) return new Response("Not found", { status: 404 })
    if (this.advanceIfDue()) { await this.persist(); this.broadcastState() }
    const finished = this.state?.status === "finished"
    return Response.json({
      finished, scored: true,
      winnerIds: finished && this.state?.outcome === "defused" ? this.state.order.filter((id) => Boolean(this.state?.players[id])) : [],
    })
  }
}

export default withRoomCleanup(BombDefusalParty, "bombdefusal")
