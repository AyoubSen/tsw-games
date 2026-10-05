import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  getGameNightResultMatch,
  validateGameNightConnection,
  type GameNightMember,
} from "./shared/gameNight"
import { isReaction, takeReactionSlot, type Reaction, type ReactionMessage } from "../src/lib/reactions"

// ─── Types ───────────────────────────────────────────────────────────────────

export type MafiaRole =
  | "werewolf"
  | "villager"
  | "seer"
  | "doctor"
  | "hunter"
  | "witch"
  | "cupid"
  | "jester"

export type GamePhase =
  | "waiting"
  | "role-reveal"
  | "first-night"
  | "night"
  | "dawn"
  | "day-discussion"
  | "day-voting"
  | "day-elimination"
  | "hunter-revenge"
  | "game-over"

export type NightSubPhase =
  | "cupid"
  | "werewolves"
  | "seer"
  | "doctor"
  | "witch"
  | "done"

export type WinCondition = "villagers" | "werewolves" | "lovers" | "jester" | null

export interface MafiaSettings {
  discussionTime: number // seconds
  votingTime: number     // seconds
  nightTime: number      // seconds
}

export interface Player {
  id: string
  name: string
  role: MafiaRole
  alive: boolean
  connected: boolean
  isBot?: boolean
}

export type ChatChannel = "day" | "wolf" | "ghost"

export interface ChatMessage {
  id: string
  playerId: string
  playerName: string
  text: string
  timestamp: number
  dayNumber: number
}

export interface EventLogEntry {
  id: string
  text: string
  phase: GamePhase
  dayNumber: number
  timestamp: number
}

export type DeathCause = "night" | "vote" | "hunter" | "heartbreak"

/** One step of a server-paced reveal; every client shows the same beat at the same time. */
export type RevealBeat =
  | { kind: "sunrise" }
  | { kind: "peaceful" }
  | { kind: "death"; playerId: string; cause: DeathCause; byId?: string }
  | { kind: "tally"; eliminatedId: string | null }
  | { kind: "spared"; tie: boolean }
  | { kind: "win"; winner: Exclude<WinCondition, null> }

export interface Reveal {
  beats: RevealBeat[]
  index: number
  beatEndsAt: number
}

export interface PublicReveal {
  beat: RevealBeat
  index: number
  total: number
  endsAt: number
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  playerOrder: string[]
  status: "waiting" | "playing" | "finished"
  phase: GamePhase
  settings: MafiaSettings
  dayNumber: number

  // Night actions
  nightSubPhase: NightSubPhase
  werewolfVotes: Record<string, string>      // voterId -> targetId
  werewolfTarget: string | null
  seerTarget: string | null
  seerResult: boolean | null                  // true = werewolf
  seerChecks: Record<string, boolean>         // every inspection so far
  doctorTarget: string | null
  doctorLastTarget: string | null             // can't repeat
  witchHealUsed: boolean
  witchKillUsed: boolean
  witchHealTarget: string | null              // for this night
  witchKillTarget: string | null              // for this night
  witchActed: boolean
  cupidLovers: [string, string] | null
  cupidActed: boolean

  // Day actions
  dayVotes: Record<string, string>            // voterId -> targetId or "abstain"
  eliminatedToday: string | null
  chat: ChatMessage[]                         // village chat, every day
  wolfChat: ChatMessage[]
  ghostChat: ChatMessage[]

  // Hunter
  hunterPendingKill: boolean
  hunterPlayerId: string | null
  /** Where play resumes after the hunter's shot. */
  hunterReturn: "day" | "night"

  // Game result
  winner: WinCondition
  winningPlayerIds: string[]

  // Events
  events: EventLogEntry[]
  nightKills: string[]                        // player ids killed this night (for dawn reveal)
  reveal: Reveal | null

  // Timer
  phaseEndTime: number | null                 // timestamp when current phase ends
  playerTokens: Record<string, string>

  // Bots
  botAt: number | null
  botFor: string | null
}

export interface PublicPlayer {
  id: string
  name: string
  alive: boolean
  connected: boolean
  role: MafiaRole | null                      // only revealed if dead or game over
  isBot?: boolean
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  playerOrder: string[]
  status: "waiting" | "playing" | "finished"
  phase: GamePhase
  settings: MafiaSettings
  dayNumber: number

  // Per-player info
  myRole: MafiaRole | null
  myId: string

  // Night info (role-specific)
  nightSubPhase: NightSubPhase
  werewolfVotes: Record<string, string> | null    // only for werewolves
  seerResult: { targetId: string; isWerewolf: boolean } | null // only for seer
  seerChecks: Record<string, boolean> | null       // only for seer
  doctorLastTarget: string | null                  // only for doctor
  witchHealUsed: boolean                           // only for witch
  witchKillUsed: boolean                           // only for witch
  witchActed: boolean
  witchWerewolfTarget: string | null               // only for witch (who wolves targeted)
  cupidLovers: [string, string] | null             // only for cupid & the lovers themselves
  isLover: boolean

  // Day info
  dayVotes: Record<string, string>
  chat: ChatMessage[]
  wolfChat: ChatMessage[] | null                   // wolves, or everyone once the game is over
  ghostChat: ChatMessage[] | null                  // the dead, or everyone once the game is over
  eliminatedToday: string | null

  // Hunter
  hunterPendingKill: boolean
  hunterId: string | null
  isHunterRevenge: boolean                         // true if this player is the hunter needing to pick

  // Game result
  winner: WinCondition
  winningPlayerIds: string[]

  // Events & timer
  events: EventLogEntry[]
  reveal: PublicReveal | null
  phaseEndTime: number | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "leave" }
  | { type: "start-game" }
  | { type: "add-bot" }
  | { type: "remove-bot"; playerId: string }
  | { type: "night-action"; targetId: string }
  | { type: "witch-action"; heal: boolean; killTargetId: string | null }
  | { type: "cupid-action"; lover1: string; lover2: string }
  | { type: "hunter-kill"; targetId: string }
  | { type: "day-vote"; targetId: string }          // "abstain" for abstain
  | { type: "chat"; text: string; channel?: ChatChannel }
  | { type: "react"; reaction: Reaction }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: PublicPlayer }
  | { type: "player-left"; playerId: string }
  | { type: "error"; message: string }
  | ReactionMessage

// ─── Pacing ─────────────────────────────────────────────────────────────────

/** How long each reveal beat holds. MafiaGame.tsx times its in-beat animation (death at 1.4s, role flip at 2.4s) against these. */
const BEAT_MS: Record<RevealBeat["kind"], number> = {
  sunrise: 2600,
  peaceful: 3800,
  death: 5200,
  tally: 4200,
  spared: 3400,
  win: 5500,
}
const ROLE_REVEAL_SECONDS = 10
const HUNTER_SECONDS = 20
const MIN_PLAYERS = 5
const MAX_PLAYERS = 12
const BOT_NAMES = ["Ada", "Baxter", "Cleo", "Dodge", "Echo", "Fern", "Gus", "Hazel", "Ivo", "June", "Kit", "Lark"]

const ROLE_NAME: Record<MafiaRole, string> = {
  werewolf: "a Werewolf",
  villager: "a Villager",
  seer: "the Seer",
  doctor: "the Doctor",
  hunter: "the Hunter",
  witch: "the Witch",
  cupid: "Cupid",
  jester: "the Jester",
}

// ─── Role Distribution ──────────────────────────────────────────────────────

function getRoleDistribution(playerCount: number): MafiaRole[] {
  const roles: MafiaRole[] = []

  if (playerCount <= 5) {
    roles.push("werewolf")
    roles.push("seer", "doctor")
  } else if (playerCount === 6) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor")
  } else if (playerCount === 7) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter")
  } else if (playerCount === 8) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter", "witch")
  } else if (playerCount === 9) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter", "witch", "cupid")
  } else {
    // 10+
    roles.push("werewolf", "werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter", "witch", "cupid", "jester")
  }
  while (roles.length < playerCount) roles.push("villager")

  return roles
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)]
}

function between(min: number, max: number) {
  return min + Math.random() * (max - min)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAlivePlayers(state: GameState): Player[] {
  return state.playerOrder
    .map((id) => state.players[id])
    .filter((p) => p && p.alive)
}

function getAlivePlayersByRole(state: GameState, role: MafiaRole): Player[] {
  return getAlivePlayers(state).filter((p) => p.role === role)
}

function hasAliveRole(state: GameState, role: MafiaRole): boolean {
  return getAlivePlayersByRole(state, role).length > 0
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

// ─── Server ─────────────────────────────────────────────────────────────────

class MafiaParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  reactedAt = new Map<string, number>()

  async onStart() {
    const stored = await this.room.storage.get<string>("state")
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GameState
        parsed.playerTokens ??= {}
        parsed.wolfChat ??= []
        parsed.ghostChat ??= []
        parsed.seerChecks ??= {}
        parsed.reveal ??= null
        parsed.hunterReturn ??= "night"
        parsed.botAt = null
        parsed.botFor = null
        this.state = parsed
        for (const player of Object.values(this.state.players)) {
          if (!player.isBot) player.connected = false
        }
        await this.saveState()
      } catch {
        this.state = null
      }
    }
  }

  /** Persists state and points the single storage alarm at the next reveal beat, phase deadline or bot move. */
  async saveState() {
    const s = this.state
    if (!s) return
    this.syncBots()
    await this.room.storage.put("state", JSON.stringify(s))
    const deadlines = [s.reveal ? s.reveal.beatEndsAt : s.phaseEndTime, s.botAt]
      .filter((deadline): deadline is number => typeof deadline === "number")
    if (deadlines.length) await this.room.storage.setAlarm(Math.min(...deadlines))
    else await this.room.storage.deleteAlarm()
  }

  isAuthenticated(conn: Party.Connection): boolean {
    if (!this.state) return false
    const token = this.connectionTokens.get(conn)
    return Boolean(token && this.state.playerTokens[conn.id] === token)
  }

  humansConnected(): boolean {
    return Boolean(this.state && Object.values(this.state.players).some((p) => !p.isBot && p.connected))
  }

  getPublicState(playerId: string): PublicGameState {
    if (!this.state) throw new Error("No game state")
    const s = this.state
    const me = s.players[playerId]
    const isGameOver = s.phase === "game-over"
    const myRole = me?.role ?? null

    const players: Record<string, PublicPlayer> = {}
    for (const [id, p] of Object.entries(s.players)) {
      players[id] = {
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        role: (!p.alive || isGameOver) ? p.role : null,
        isBot: p.isBot,
      }
    }

    // Werewolf teammates visible to other werewolves
    if (myRole === "werewolf") {
      for (const [id, p] of Object.entries(s.players)) {
        if (p.role === "werewolf") {
          players[id].role = "werewolf"
        }
      }
    }

    // Deaths the reveal hasn't reached yet still look alive.
    if (s.reveal) {
      s.reveal.beats.forEach((beat, index) => {
        if (index <= s.reveal!.index || beat.kind !== "death") return
        const shown = players[beat.playerId]
        if (!shown) return
        shown.alive = true
        if (!(myRole === "werewolf" && s.players[beat.playerId].role === "werewolf")) shown.role = null
      })
    }

    const isLover = s.cupidLovers
      ? s.cupidLovers.includes(playerId)
      : false

    // Seer result: only show after seer has acted this night
    let seerResult: PublicGameState["seerResult"] = null
    if (myRole === "seer" && s.seerTarget && s.seerResult !== null) {
      seerResult = { targetId: s.seerTarget, isWerewolf: s.seerResult }
    }

    // Witch: show werewolf target so she can decide to heal
    let witchWerewolfTarget: string | null = null
    if (myRole === "witch" && s.nightSubPhase === "witch") {
      witchWerewolfTarget = s.werewolfTarget
    }

    // Cupid lovers visible to lovers
    let cupidLovers = s.cupidLovers
    if (cupidLovers && !isLover && myRole !== "cupid" && !isGameOver) {
      cupidLovers = null
    }

    const reveal: PublicReveal | null = s.reveal
      ? { beat: s.reveal.beats[s.reveal.index], index: s.reveal.index, total: s.reveal.beats.length, endsAt: s.reveal.beatEndsAt }
      : null
    const iAmDead = Boolean(me && !players[playerId]?.alive && s.status !== "waiting")

    return {
      roomCode: s.roomCode,
      hostId: s.hostId,
      players,
      playerOrder: s.playerOrder,
      status: s.status,
      phase: s.phase,
      settings: s.settings,
      dayNumber: s.dayNumber,
      myRole: s.status === "playing" || s.status === "finished" ? myRole : null,
      myId: playerId,
      nightSubPhase: s.nightSubPhase,
      werewolfVotes: myRole === "werewolf" ? s.werewolfVotes : null,
      seerResult,
      seerChecks: myRole === "seer" ? s.seerChecks : null,
      doctorLastTarget: myRole === "doctor" ? s.doctorLastTarget : null,
      witchHealUsed: s.witchHealUsed,
      witchKillUsed: s.witchKillUsed,
      witchActed: myRole === "witch" && s.witchActed,
      witchWerewolfTarget,
      cupidLovers,
      isLover,
      dayVotes: s.dayVotes,
      chat: s.chat,
      wolfChat: myRole === "werewolf" || isGameOver ? s.wolfChat : null,
      ghostChat: iAmDead || isGameOver ? s.ghostChat : null,
      eliminatedToday: s.eliminatedToday,
      hunterPendingKill: s.hunterPendingKill,
      hunterId: s.phase === "hunter-revenge" ? s.hunterPlayerId : null,
      isHunterRevenge:
        s.hunterPendingKill && s.hunterPlayerId === playerId && !s.reveal,
      winner: s.winner,
      winningPlayerIds: s.winningPlayerIds,
      events: s.events,
      reveal,
      phaseEndTime: s.reveal ? null : s.phaseEndTime,
    }
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
      if (!this.isAuthenticated(conn)) continue
      const pubState = this.getPublicState(conn.id)
      conn.send(JSON.stringify({ type: "state", state: pubState } as ServerMessage))
    }
  }

  sendError(conn: Party.Connection, message: string) {
    conn.send(JSON.stringify({ type: "error", message } as ServerMessage))
  }

  addEvent(text: string) {
    if (!this.state) return
    this.state.events.push({
      id: generateId(),
      text,
      phase: this.state.phase,
      dayNumber: this.state.dayNumber,
      timestamp: Date.now(),
    })
  }

  // ─── Phase Transitions ──────────────────────────────────────────────────
  // Transitions only mutate state; the message/alarm handler broadcasts and saves once.

  setPhase(phase: GamePhase, timerSeconds?: number) {
    if (!this.state) return
    this.state.phase = phase
    this.state.phaseEndTime = timerSeconds && timerSeconds > 0 ? Date.now() + timerSeconds * 1000 : null
  }

  startGame() {
    if (!this.state) return
    const playerIds = this.state.playerOrder
    const count = playerIds.length

    if (count < MIN_PLAYERS) return

    // Assign roles
    const roles = shuffleArray(getRoleDistribution(count))
    for (let i = 0; i < count; i++) {
      this.state.players[playerIds[i]].role = roles[i]
    }

    this.state.status = "playing"
    this.state.dayNumber = 0

    this.addEvent("The village falls asleep... roles are being revealed.")

    this.setPhase("role-reveal", ROLE_REVEAL_SECONDS)
  }

  /** The current phase's timer ran out (no reveal is playing). */
  onPhaseTimeout() {
    if (!this.state) return
    switch (this.state.phase) {
      case "role-reveal":
        this.startNight(true)
        break
      case "first-night":
      case "night":
        // Auto-skip current night sub-phase
        this.advanceNightSubPhase()
        break
      case "day-discussion":
        this.startDayVoting()
        break
      case "day-voting":
        this.resolveDayVotes()
        break
      case "hunter-revenge":
        // Hunter didn't pick, auto-skip
        if (this.state.hunterPendingKill) {
          this.addEvent(`${this.state.players[this.state.hunterPlayerId!]?.name ?? "The Hunter"} lowered their weapon.`)
          this.state.hunterPendingKill = false
          this.state.hunterPlayerId = null
        }
        this.finishHunter()
        break
    }
  }

  async onAlarm() {
    const s = this.state
    if (!s) return
    const now = Date.now() + 50

    if (s.reveal) {
      if (now >= s.reveal.beatEndsAt) this.advanceReveal()
    } else if (s.phaseEndTime && now >= s.phaseEndTime) {
      s.phaseEndTime = null
      this.onPhaseTimeout()
    }

    if (this.state?.botAt && now >= this.state.botAt) {
      this.state.botAt = null
      this.botStep()
    }

    this.broadcastState()
    await this.saveState()
  }

  // ─── Reveals ────────────────────────────────────────────────────────────

  startReveal(beats: RevealBeat[]) {
    if (!this.state || beats.length === 0) return
    this.state.phaseEndTime = null
    this.state.reveal = { beats, index: 0, beatEndsAt: Date.now() + BEAT_MS[beats[0].kind] }
    this.logBeat(beats[0])
  }

  advanceReveal() {
    const s = this.state
    if (!s?.reveal) return
    const reveal = s.reveal
    if (reveal.index + 1 < reveal.beats.length) {
      reveal.index++
      const beat = reveal.beats[reveal.index]
      reveal.beatEndsAt = Date.now() + BEAT_MS[beat.kind]
      this.logBeat(beat)
      return
    }
    s.reveal = null
    switch (s.phase) {
      case "dawn":
        this.startDayDiscussion()
        break
      case "day-elimination":
        this.afterElimination()
        break
      case "hunter-revenge":
        this.finishHunter()
        break
    }
  }

  /** Log entries are written as each beat plays, so the log never spoils a reveal. */
  logBeat(beat: RevealBeat) {
    const s = this.state
    if (!s) return
    const name = (id: string | undefined) => (id && s.players[id]?.name) || "Someone"
    switch (beat.kind) {
      case "peaceful":
        this.addEvent("The village wakes peacefully. No one was killed last night.")
        break
      case "death": {
        const role = ROLE_NAME[s.players[beat.playerId]?.role ?? "villager"]
        const line = {
          night: `${name(beat.playerId)} was found dead.`,
          vote: `${name(beat.playerId)} was voted out.`,
          hunter: `${name(beat.byId)} the Hunter took down ${name(beat.playerId)}.`,
          heartbreak: `${name(beat.playerId)} died of a broken heart.`,
        }[beat.cause]
        this.addEvent(`${line} They were ${role}.`)
        break
      }
      case "spared":
        this.addEvent(beat.tie ? "The vote was tied. No one is eliminated." : "The village held back. No one is eliminated.")
        break
    }
  }

  loverOf(id: string): string | null {
    const lovers = this.state?.cupidLovers
    if (!lovers || !lovers.includes(id)) return null
    return lovers[0] === id ? lovers[1] : lovers[0]
  }

  /** Kills a player (and a grieving lover), arming the Hunter's revenge; returns the death beats in order. */
  killPlayer(id: string, cause: DeathCause, byId?: string): RevealBeat[] {
    const s = this.state
    const player = s?.players[id]
    if (!s || !player?.alive) return []
    player.alive = false
    const beats: RevealBeat[] = [{ kind: "death", playerId: id, cause, ...(byId ? { byId } : {}) }]
    if (player.role === "hunter" && !s.hunterPendingKill && cause !== "hunter") {
      s.hunterPendingKill = true
      s.hunterPlayerId = id
    }
    const lover = this.loverOf(id)
    if (lover) beats.push(...this.killPlayer(lover, "heartbreak"))
    return beats
  }

  // ─── Night ──────────────────────────────────────────────────────────────

  startNight(isFirst: boolean) {
    if (!this.state) return

    if (isFirst) {
      this.state.dayNumber = 1
    } else {
      this.state.dayNumber++
    }

    // Reset night state
    this.state.werewolfVotes = {}
    this.state.werewolfTarget = null
    this.state.seerTarget = null
    this.state.seerResult = null
    this.state.doctorTarget = null
    this.state.witchHealTarget = null
    this.state.witchKillTarget = null
    this.state.witchActed = false
    this.state.nightKills = []
    this.state.dayVotes = {}

    const hasCupid = hasAliveRole(this.state, "cupid") && !this.state.cupidActed
    const phase = isFirst && hasCupid ? "first-night" : "night"

    this.addEvent(`Night ${this.state.dayNumber} falls... the village sleeps.`)
    this.setPhase(phase, this.state.settings.nightTime)

    // Determine first night sub-phase
    if (isFirst && hasCupid) {
      this.state.nightSubPhase = "cupid"
    } else {
      this.state.nightSubPhase = "werewolves"
      // Skip if no werewolves alive
      if (!hasAliveRole(this.state, "werewolf")) {
        this.advanceNightSubPhaseFrom("werewolves")
      }
    }
  }

  getNextNightSubPhase(current: NightSubPhase): NightSubPhase {
    if (!this.state) return "done"
    const order: NightSubPhase[] = ["cupid", "werewolves", "seer", "doctor", "witch", "done"]
    const idx = order.indexOf(current)

    for (let i = idx + 1; i < order.length; i++) {
      const phase = order[i]
      if (phase === "done") return "done"
      if (phase === "cupid") continue // cupid only on first night
      if (phase === "werewolves" && hasAliveRole(this.state, "werewolf")) return phase
      if (phase === "seer" && hasAliveRole(this.state, "seer")) return phase
      if (phase === "doctor" && hasAliveRole(this.state, "doctor")) return phase
      if (phase === "witch" && hasAliveRole(this.state, "witch") && (!this.state.witchHealUsed || !this.state.witchKillUsed)) return phase
    }
    return "done"
  }

  advanceNightSubPhaseFrom(current: NightSubPhase) {
    if (!this.state) return
    if (current === "werewolves") this.state.werewolfTarget = this.wolfMajority()
    const next = this.getNextNightSubPhase(current)
    this.state.nightSubPhase = next

    if (next === "done") {
      this.resolveNight()
    } else {
      // Reset timer for each sub-phase
      this.state.phaseEndTime = Date.now() + this.state.settings.nightTime * 1000
    }
  }

  advanceNightSubPhase() {
    if (!this.state) return
    this.advanceNightSubPhaseFrom(this.state.nightSubPhase)
  }

  /** The pack's target: most votes, earliest vote breaking ties. */
  wolfMajority(): string | null {
    if (!this.state) return null
    const voteCounts: Record<string, number> = {}
    for (const target of Object.values(this.state.werewolfVotes)) {
      voteCounts[target] = (voteCounts[target] || 0) + 1
    }
    let maxVotes = 0
    let target: string | null = null
    for (const [t, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count
        target = t
      }
    }
    return target
  }

  resolveNight() {
    const s = this.state
    if (!s) return

    let savedPlayer: string | null = null
    s.werewolfTarget = this.wolfMajority()

    // Doctor save
    if (s.doctorTarget && s.doctorTarget === s.werewolfTarget) {
      savedPlayer = s.doctorTarget
    }

    // Witch heal
    if (s.witchHealTarget && s.witchHealTarget === s.werewolfTarget) {
      savedPlayer = s.witchHealTarget
    }

    const beats: RevealBeat[] = []
    // Werewolf kill (if not saved), then the witch's poison
    if (s.werewolfTarget && s.werewolfTarget !== savedPlayer) beats.push(...this.killPlayer(s.werewolfTarget, "night"))
    if (s.witchKillTarget) beats.push(...this.killPlayer(s.witchKillTarget, "night"))

    s.nightKills = beats.flatMap((beat) => (beat.kind === "death" ? [beat.playerId] : []))

    this.addEvent("Dawn breaks over the village...")
    this.setPhase("dawn")
    this.startReveal([{ kind: "sunrise" }, ...(beats.length ? beats : [{ kind: "peaceful" } as RevealBeat])])
  }

  // ─── Day ────────────────────────────────────────────────────────────────

  startDayDiscussion() {
    if (!this.state) return

    // The Hunter's shot comes before anything else
    if (this.state.hunterPendingKill && this.state.hunterPlayerId) {
      this.startHunterRevenge("day")
      return
    }

    const winner = this.checkWinCondition()
    if (winner) {
      this.endGame(winner)
      return
    }

    this.state.dayVotes = {}
    this.state.eliminatedToday = null

    this.addEvent(`Day ${this.state.dayNumber} begins. The village gathers to discuss.`)
    this.setPhase("day-discussion", this.state.settings.discussionTime)
  }

  startDayVoting() {
    if (!this.state) return

    this.state.dayVotes = {}
    this.addEvent("Time to vote! Choose who to eliminate or abstain.")
    this.setPhase("day-voting", this.state.settings.votingTime)
  }

  resolveDayVotes() {
    const s = this.state
    if (!s) return

    const voteCounts: Record<string, number> = {}
    for (const targetId of Object.values(s.dayVotes)) {
      if (targetId !== "abstain") {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
      }
    }

    let maxVotes = 0
    let eliminated: string | null = null
    let isTie = false

    for (const [targetId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count
        eliminated = targetId
        isTie = false
      } else if (count === maxVotes) {
        isTie = true
      }
    }

    // Plurality with no tie
    if (isTie || maxVotes === 0) {
      eliminated = null
    }

    s.eliminatedToday = eliminated
    this.setPhase("day-elimination")
    const beats: RevealBeat[] = [{ kind: "tally", eliminatedId: eliminated }]
    if (eliminated) beats.push(...this.killPlayer(eliminated, "vote"))
    else beats.push({ kind: "spared", tie: isTie })
    this.startReveal(beats)
  }

  afterElimination() {
    const s = this.state
    if (!s) return

    const eliminated = s.eliminatedToday ? s.players[s.eliminatedToday] : null
    if (eliminated?.role === "jester") {
      this.endGame("jester", [eliminated.id])
      return
    }

    if (s.hunterPendingKill && s.hunterPlayerId) {
      this.startHunterRevenge("night")
      return
    }

    this.checkWinConditionAndProceed()
  }

  // ─── Hunter ─────────────────────────────────────────────────────────────

  startHunterRevenge(returnTo: "day" | "night") {
    if (!this.state?.hunterPlayerId) return
    this.state.hunterReturn = returnTo
    this.setPhase("hunter-revenge", HUNTER_SECONDS)
    this.addEvent(`${this.state.players[this.state.hunterPlayerId].name} the Hunter takes aim...`)
  }

  handleHunterKill(hunterId: string, targetId: string) {
    const s = this.state
    if (!s || s.phase !== "hunter-revenge" || s.reveal) return
    if (!s.hunterPendingKill || s.hunterPlayerId !== hunterId) return

    const target = s.players[targetId]
    if (!target || !target.alive) return

    s.hunterPendingKill = false
    this.startReveal(this.killPlayer(targetId, "hunter", hunterId))
  }

  /** After the shot (or a missed chance), resume where the Hunter interrupted. */
  finishHunter() {
    if (!this.state) return
    this.state.hunterPlayerId = null
    this.state.hunterPendingKill = false
    if (this.state.hunterReturn === "day") this.startDayDiscussion()
    else this.checkWinConditionAndProceed()
  }

  // ─── Win Conditions ─────────────────────────────────────────────────────

  checkWinCondition(): WinCondition {
    if (!this.state) return null

    const alive = getAlivePlayers(this.state)
    const wolves = alive.filter((p) => p.role === "werewolf")
    const nonWolves = alive.filter((p) => p.role !== "werewolf")

    // Lover win: last 2 alive are the lovers
    if (this.state.cupidLovers && alive.length === 2) {
      const [l1, l2] = this.state.cupidLovers
      if (alive.some((p) => p.id === l1) && alive.some((p) => p.id === l2)) {
        return "lovers"
      }
    }

    // Werewolves win: werewolves >= non-werewolves
    if (wolves.length > 0 && wolves.length >= nonWolves.length) {
      return "werewolves"
    }

    // Villagers win: all werewolves dead
    if (wolves.length === 0) {
      return "villagers"
    }

    return null
  }

  checkWinConditionAndProceed() {
    const winner = this.checkWinCondition()
    if (winner) {
      this.endGame(winner)
    } else {
      this.startNight(false)
    }
  }

  endGame(winner: Exclude<WinCondition, null>, specificWinners?: string[]) {
    if (!this.state) return

    let winningIds: string[] = specificWinners || []

    if (!specificWinners) {
      switch (winner) {
        case "villagers":
          winningIds = this.state.playerOrder.filter(
            (id) => this.state!.players[id].role !== "werewolf" && this.state!.players[id].role !== "jester"
          )
          break
        case "werewolves":
          winningIds = this.state.playerOrder.filter(
            (id) => this.state!.players[id].role === "werewolf"
          )
          break
        case "lovers":
          winningIds = this.state.cupidLovers ? [...this.state.cupidLovers] : []
          break
      }
    }

    this.state.winner = winner
    this.state.winningPlayerIds = winningIds
    this.state.status = "finished"

    const winText: Record<string, string> = {
      villagers: "The village wins! All werewolves have been eliminated.",
      werewolves: "The werewolves win! They have overtaken the village.",
      lovers: "The Lovers win! They are the last ones standing.",
      jester: "The Jester wins! They fooled the village into voting them out.",
    }
    this.addEvent(winText[winner] || "The game is over.")

    this.setPhase("game-over")
    this.startReveal([{ kind: "win", winner }])
  }

  // ─── Night Action Handlers ──────────────────────────────────────────────

  handleWerewolfVote(playerId: string, targetId: string) {
    if (!this.state) return
    if (this.state.nightSubPhase !== "werewolves") return

    const player = this.state.players[playerId]
    if (!player || !player.alive || player.role !== "werewolf") return

    const target = this.state.players[targetId]
    if (!target || !target.alive || target.role === "werewolf") return

    this.state.werewolfVotes[playerId] = targetId

    // Check if all alive wolves have voted
    const aliveWolves = getAlivePlayersByRole(this.state, "werewolf")
    const allVoted = aliveWolves.every((w) => this.state!.werewolfVotes[w.id])

    if (allVoted) {
      this.advanceNightSubPhaseFrom("werewolves")
    }
  }

  handleSeerInspect(playerId: string, targetId: string) {
    if (!this.state) return
    if (this.state.nightSubPhase !== "seer") return

    const player = this.state.players[playerId]
    if (!player || !player.alive || player.role !== "seer") return

    const target = this.state.players[targetId]
    if (!target || !target.alive || targetId === playerId) return

    this.state.seerTarget = targetId
    this.state.seerResult = target.role === "werewolf"
    this.state.seerChecks[targetId] = this.state.seerResult

    this.advanceNightSubPhaseFrom("seer")
  }

  handleDoctorProtect(playerId: string, targetId: string) {
    if (!this.state) return
    if (this.state.nightSubPhase !== "doctor") return

    const player = this.state.players[playerId]
    if (!player || !player.alive || player.role !== "doctor") return

    const target = this.state.players[targetId]
    if (!target || !target.alive) return

    // Can't protect same person twice in a row
    if (targetId === this.state.doctorLastTarget) return

    this.state.doctorTarget = targetId
    this.state.doctorLastTarget = targetId

    this.advanceNightSubPhaseFrom("doctor")
  }

  handleWitchAction(playerId: string, heal: boolean, killTargetId: string | null) {
    if (!this.state) return
    if (this.state.nightSubPhase !== "witch") return
    if (this.state.witchActed) return

    const player = this.state.players[playerId]
    if (!player || !player.alive || player.role !== "witch") return

    if (heal && !this.state.witchHealUsed && this.state.werewolfTarget) {
      this.state.witchHealTarget = this.state.werewolfTarget
      this.state.witchHealUsed = true
    }

    if (killTargetId && !this.state.witchKillUsed) {
      const killTarget = this.state.players[killTargetId]
      if (killTarget && killTarget.alive && killTargetId !== playerId) {
        this.state.witchKillTarget = killTargetId
        this.state.witchKillUsed = true
      }
    }

    this.state.witchActed = true
    this.advanceNightSubPhaseFrom("witch")
  }

  handleCupidAction(playerId: string, lover1: string, lover2: string) {
    if (!this.state) return
    if (this.state.nightSubPhase !== "cupid") return
    if (this.state.cupidActed) return

    const player = this.state.players[playerId]
    if (!player || !player.alive || player.role !== "cupid") return

    const p1 = this.state.players[lover1]
    const p2 = this.state.players[lover2]
    if (!p1 || !p2 || !p1.alive || !p2.alive || lover1 === lover2) return

    this.state.cupidLovers = [lover1, lover2]
    this.state.cupidActed = true

    this.addEvent("Cupid has linked two lovers...")

    this.advanceNightSubPhaseFrom("cupid")
  }

  // ─── Day Action Handlers ────────────────────────────────────────────────

  handleDayVote(playerId: string, targetId: string) {
    if (!this.state) return
    if (this.state.phase !== "day-voting") return

    const player = this.state.players[playerId]
    if (!player || !player.alive) return

    if (targetId !== "abstain") {
      const target = this.state.players[targetId]
      if (!target || !target.alive) return
    }

    this.state.dayVotes[playerId] = targetId

    // Resolve as soon as every living player has voted
    const alive = getAlivePlayers(this.state)
    if (alive.every((p) => this.state!.dayVotes[p.id])) {
      this.resolveDayVotes()
    }
  }

  handleChat(playerId: string, text: string, channel: ChatChannel): boolean {
    const s = this.state
    if (!s || s.status !== "playing") return false

    const player = s.players[playerId]
    if (!player) return false

    const night = s.phase === "night" || s.phase === "first-night"
    const allowed = {
      day: player.alive && (s.phase === "day-discussion" || s.phase === "day-voting"),
      wolf: player.alive && player.role === "werewolf" && night,
      ghost: !player.alive,
    }[channel]
    if (!allowed) return false

    const trimmed = text.trim().slice(0, 200)
    if (!trimmed) return false

    const key = channel === "day" ? "chat" : channel === "wolf" ? "wolfChat" : "ghostChat"
    const messages = s[key]

    // Rate limit: max 1 message per second per player
    const now = Date.now()
    if (messages.some((m) => m.playerId === playerId && now - m.timestamp < 1000)) return false

    messages.push({
      id: generateId(),
      playerId,
      playerName: player.name,
      text: trimmed,
      timestamp: now,
      dayNumber: s.dayNumber,
    })

    // Keep the latest messages
    if (messages.length > 300) s[key] = messages.slice(-300)
    return true
  }

  react(playerId: string, reaction: Reaction) {
    const s = this.state
    const player = s?.players[playerId]
    if (!s || !player || s.status === "waiting") return
    // The dead stay silent until the game is over.
    if (!player.alive && s.status !== "finished") return
    if (!takeReactionSlot(this.reactedAt, playerId)) return
    const message: ReactionMessage = { type: "reaction", playerId, reaction }
    this.room.broadcast(JSON.stringify(message))
  }

  // ─── Bots ───────────────────────────────────────────────────────────────

  /** Bots that owe a move right now, in seat order. */
  botQueue(): Player[] {
    const s = this.state
    if (!s || s.status !== "playing" || s.reveal) return []
    const night = s.phase === "night" || s.phase === "first-night"
    return s.playerOrder
      .map((id) => s.players[id])
      .filter((bot): bot is Player => {
        if (!bot?.isBot) return false
        if (s.phase === "hunter-revenge") return s.hunterPendingKill && s.hunterPlayerId === bot.id
        if (!bot.alive) return false
        if (s.phase === "day-voting") return !s.dayVotes[bot.id]
        if (!night) return false
        switch (s.nightSubPhase) {
          case "werewolves": return bot.role === "werewolf" && !s.werewolfVotes[bot.id]
          case "seer": return bot.role === "seer"
          case "doctor": return bot.role === "doctor"
          case "witch": return bot.role === "witch" && !s.witchActed
          case "cupid": return bot.role === "cupid" && !s.cupidActed
          default: return false
        }
      })
  }

  /** One bot moves per alarm, after a short think, so votes trickle in; bots wait while no human is watching. */
  syncBots() {
    const s = this.state
    if (!s) return
    const key = `${s.phase}:${s.nightSubPhase}:${s.dayNumber}`
    if (s.botFor !== key) {
      s.botFor = key
      s.botAt = null
    }
    if (!this.humansConnected() || this.botQueue().length === 0) {
      s.botAt = null
      return
    }
    s.botAt ??= Date.now() + (s.phase === "day-voting" ? between(1800, 4200) : between(1600, 3400))
  }

  botStep() {
    const s = this.state
    const bot = this.botQueue()[0]
    if (!s || !bot) return
    const others = getAlivePlayers(s).filter((p) => p.id !== bot.id)

    if (s.phase === "hunter-revenge") {
      const target = pick(others)
      if (target) this.handleHunterKill(bot.id, target.id)
      return
    }

    if (s.phase === "day-voting") {
      const wolf = bot.role === "werewolf"
      const choices = others.filter((p) => !(wolf && p.role === "werewolf"))
      const counts: Record<string, number> = {}
      for (const target of Object.values(s.dayVotes)) if (target !== "abstain") counts[target] = (counts[target] ?? 0) + 1
      const leader = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
      const roll = Math.random()
      let target = "abstain"
      if (roll >= 0.2) {
        const follow = roll < 0.65 && leader && choices.some((p) => p.id === leader)
        target = follow ? leader! : pick(choices)?.id ?? "abstain"
      }
      this.handleDayVote(bot.id, target)
      return
    }

    switch (s.nightSubPhase) {
      case "werewolves": {
        // Follow whoever in the pack already chose; otherwise pick a victim.
        const packChoice = Object.values(s.werewolfVotes).find((id) => s.players[id]?.alive && s.players[id].role !== "werewolf")
        const target = packChoice ?? pick(others.filter((p) => p.role !== "werewolf"))?.id
        if (target) this.handleWerewolfVote(bot.id, target)
        break
      }
      case "seer": {
        const unchecked = others.filter((p) => !(p.id in s.seerChecks))
        const target = pick(unchecked.length ? unchecked : others)
        if (target) this.handleSeerInspect(bot.id, target.id)
        break
      }
      case "doctor": {
        const target = pick(getAlivePlayers(s).filter((p) => p.id !== s.doctorLastTarget))
        if (target) this.handleDoctorProtect(bot.id, target.id)
        break
      }
      case "witch": {
        const heal = !s.witchHealUsed && Boolean(s.werewolfTarget) && Math.random() < 0.5
        const poison = !s.witchKillUsed && Math.random() < 0.15 ? pick(others)?.id ?? null : null
        this.handleWitchAction(bot.id, heal, poison)
        break
      }
      case "cupid": {
        const [a, b] = shuffleArray(getAlivePlayers(s))
        if (a && b) this.handleCupidAction(bot.id, a.id, b.id)
        break
      }
    }
  }

  // ─── Connection Handlers ────────────────────────────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const gameNight = await validateGameNightConnection(this.room, conn, ctx, "mafia")
    if (gameNight.mode === "invalid") {
      this.sendError(conn, "Invalid Game Night connection")
      conn.close(1008, "Invalid Game Night connection")
      return
    }
    if (gameNight.mode === "game-night") this.gameNightMembers.set(conn, gameNight.member)
    const isHost = gameNight.mode === "game-night"
      ? gameNight.member.isHost
      : url.searchParams.get("host") === "true"
    const playerToken = url.searchParams.get("playerToken") || ""
    if (playerToken) this.connectionTokens.set(conn, playerToken)

    if (isHost && !this.state) {
      const roomCode = this.room.id
      const discussionTime = Number.parseInt(url.searchParams.get("discussionTime") || "90")
      const votingTime = Number.parseInt(url.searchParams.get("votingTime") || "30")
      const nightTime = Number.parseInt(url.searchParams.get("nightTime") || "30")

      this.state = {
        roomCode,
        hostId: conn.id,
        players: {},
        playerOrder: [],
        status: "waiting",
        phase: "waiting",
        settings: { discussionTime, votingTime, nightTime },
        dayNumber: 0,
        nightSubPhase: "done",
        werewolfVotes: {},
        werewolfTarget: null,
        seerTarget: null,
        seerResult: null,
        seerChecks: {},
        doctorTarget: null,
        doctorLastTarget: null,
        witchHealUsed: false,
        witchKillUsed: false,
        witchHealTarget: null,
        witchKillTarget: null,
        witchActed: false,
        cupidLovers: null,
        cupidActed: false,
        dayVotes: {},
        eliminatedToday: null,
        chat: [],
        wolfChat: [],
        ghostChat: [],
        hunterPendingKill: false,
        hunterPlayerId: null,
        hunterReturn: "night",
        winner: null,
        winningPlayerIds: [],
        events: [],
        nightKills: [],
        reveal: null,
        phaseEndTime: null,
        playerTokens: {},
        botAt: null,
        botFor: null,
      }
      await this.saveState()
    }

	if (!this.state) this.sendError(conn, "Game not found")
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return

    try {
      const msg: ClientMessage = JSON.parse(message)

	  if (msg.type !== "join" && !this.isAuthenticated(sender)) {
		this.sendError(sender, "Invalid player session")
		return
	  }

      switch (msg.type) {
        case "join": {
		  const playerToken = this.connectionTokens.get(sender)
		  if (!playerToken) {
			this.sendError(sender, "Invalid player session")
			return
		  }
		  const coordinatorName = this.gameNightMembers.get(sender)?.name
		  const returningPlayer = this.state.players[sender.id]
		  const expectedToken = this.state.playerTokens[sender.id]
		  if (returningPlayer && expectedToken !== playerToken) {
			this.sendError(sender, "Invalid player session")
			return
		  }
          // Check for a returning player FIRST. This used to sit below the
          // status guard, so anyone who dropped mid-game was told "Game
          // already in progress" and could never get back to their role.
          const returning = this.state.players[sender.id]
          if (returning) {
			this.state.playerTokens[sender.id] = playerToken
            returning.connected = true
            returning.name = coordinatorName || msg.name.trim().slice(0, 20) || returning.name
            await this.saveState()
            // Per-connection state, so they get their own role back and only theirs.
            this.broadcastState()
            return
          }

          if (this.state.status !== "waiting") {
            this.sendError(sender, "Game already in progress")
            return
          }
          if (Object.keys(this.state.players).length >= MAX_PLAYERS) {
            this.sendError(sender, `Game is full (max ${MAX_PLAYERS} players)`)
            return
          }

          const player: Player = {
            id: sender.id,
            name: coordinatorName || msg.name.trim().slice(0, 20) || "Player",
            role: "villager", // placeholder until game starts
            alive: true,
            connected: true,
          }
          this.state.players[sender.id] = player
          this.state.playerOrder.push(sender.id)
		  this.state.playerTokens[sender.id] = playerToken

          // Broadcast join to others
          for (const conn of this.room.getConnections()) {
            if (conn.id !== sender.id) {
              conn.send(
                JSON.stringify({
                  type: "player-joined",
                  player: {
                    id: player.id,
                    name: player.name,
                    alive: true,
                    connected: true,
                    role: null,
                  },
                } as ServerMessage)
              )
            }
          }

          this.broadcastState()
          await this.saveState()
          return
        }

        case "leave": {
          await this.handlePlayerLeave(sender.id)
          return
        }

        case "react": {
          if (isReaction(msg.reaction)) this.react(sender.id, msg.reaction)
          return
        }

        case "add-bot":
        case "remove-bot": {
          if (sender.id !== this.state.hostId) {
            this.sendError(sender, "Only the host can change bots")
            return
          }
          if (this.state.status !== "waiting") return
          if (msg.type === "remove-bot") {
            if (!this.state.players[msg.playerId]?.isBot) return
            delete this.state.players[msg.playerId]
            this.state.playerOrder = this.state.playerOrder.filter((id) => id !== msg.playerId)
          } else {
            if (this.state.playerOrder.length >= MAX_PLAYERS) {
              this.sendError(sender, `Game is full (max ${MAX_PLAYERS} players)`)
              return
            }
            const taken = new Set(Object.values(this.state.players).map((p) => p.name))
            const id = `bot-${crypto.randomUUID().slice(0, 8)}`
            const name = BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? `Bot ${this.state.playerOrder.length + 1}`
            this.state.players[id] = { id, name, role: "villager", alive: true, connected: true, isBot: true }
            this.state.playerOrder.push(id)
          }
          break
        }

        case "start-game": {
          if (sender.id !== this.state.hostId) {
            this.sendError(sender, "Only the host can start the game")
            return
          }
          if (this.state.status !== "waiting") return
          if (Object.values(this.state.players).filter((player) => player.connected).length < MIN_PLAYERS) {
            this.sendError(sender, `Need at least ${MIN_PLAYERS} players to start`)
            return
          }
          for (const player of Object.values(this.state.players)) {
            if (!player.connected) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            }
          }
          this.state.playerOrder = this.state.playerOrder.filter(
            (playerId) => this.state!.players[playerId],
          )
          this.startGame()
          break
        }

        case "night-action": {
          const player = this.state.players[sender.id]
          if (!player || !player.alive) return

          switch (player.role) {
            case "werewolf":
              this.handleWerewolfVote(sender.id, msg.targetId)
              break
            case "seer":
              this.handleSeerInspect(sender.id, msg.targetId)
              break
            case "doctor":
              this.handleDoctorProtect(sender.id, msg.targetId)
              break
          }
          break
        }

        case "witch-action": {
          this.handleWitchAction(sender.id, msg.heal, msg.killTargetId)
          break
        }

        case "cupid-action": {
          this.handleCupidAction(sender.id, msg.lover1, msg.lover2)
          break
        }

        case "hunter-kill": {
          this.handleHunterKill(sender.id, msg.targetId)
          break
        }

        case "day-vote": {
          this.handleDayVote(sender.id, msg.targetId)
          break
        }

        case "chat": {
          const channel: ChatChannel = msg.channel === "wolf" || msg.channel === "ghost" ? msg.channel : "day"
          if (!this.handleChat(sender.id, msg.text, channel)) return
          break
        }

        default:
          return
      }

      this.broadcastState()
      await this.saveState()
    } catch (e) {
      console.error("Failed to process message:", e)
    }
  }

  async handlePlayerLeave(playerId: string) {
    if (!this.state) return
	delete this.state.playerTokens[playerId]

    if (this.state.status === "waiting") {
      delete this.state.players[playerId]
      this.state.playerOrder = this.state.playerOrder.filter((id) => id !== playerId)

      const humans = this.state.playerOrder.filter((id) => !this.state!.players[id]?.isBot)

      // Transfer host
      if (playerId === this.state.hostId && humans.length > 0) {
        this.state.hostId = humans[0]
      }

	  if (humans.length === 0) {
		this.state = null
		await this.room.storage.delete("state")
		await this.room.storage.deleteAlarm()
		return
	  }

      for (const conn of this.room.getConnections()) {
        conn.send(JSON.stringify({ type: "player-left", playerId } as ServerMessage))
      }
    } else {
      // During game, mark as disconnected
      const player = this.state.players[playerId]
      if (player) {
        player.connected = false
      }

      // Transfer host
      if (playerId === this.state.hostId) {
        const connected = this.state.playerOrder.find(
          (id) => id !== playerId && this.state!.players[id]?.connected && !this.state!.players[id]?.isBot
        )
        if (connected) {
          this.state.hostId = connected
        }
      }
    }

    this.broadcastState()
    await this.saveState()
  }

  async onClose(conn: Party.Connection) {
    if (!this.state) return
	const replacementIsOpen = Array.from(this.room.getConnections()).some(
	  connection => connection.id === conn.id && connection !== conn,
	)
	if (replacementIsOpen) {
	  this.connectionTokens.delete(conn)
	  return
	}

    const player = this.state.players[conn.id]
    if (player && this.isAuthenticated(conn)) {
      player.connected = false

      this.broadcastState()
      await this.saveState()
    }
	this.connectionTokens.delete(conn)
  }

  async onRequest(request: Party.Request) {
    try {
      const match = await getGameNightResultMatch(this.room, request, "mafia")
      if (!match) return new Response("Not found", { status: 404 })
      const finished = this.state?.status === "finished"
      return Response.json({
        finished,
        scored: true,
        winnerIds: finished ? this.state!.winningPlayerIds.filter((id) => !this.state!.players[id]?.isBot) : [],
        vsBot: Object.values(this.state?.players ?? {}).some((player) => player.isBot),
      })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
}

export default withRoomCleanup(MafiaParty, "mafia")

MafiaParty satisfies Party.Worker
