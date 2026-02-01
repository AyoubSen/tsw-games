import type * as Party from "partykit/server"

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
}

export interface ChatMessage {
  id: string
  playerId: string
  playerName: string
  text: string
  timestamp: number
}

export interface EventLogEntry {
  id: string
  text: string
  phase: GamePhase
  dayNumber: number
  timestamp: number
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
  chat: ChatMessage[]

  // Hunter
  hunterPendingKill: boolean
  hunterPlayerId: string | null

  // Game result
  winner: WinCondition
  winningPlayerIds: string[]

  // Events
  events: EventLogEntry[]
  nightKills: string[]                        // player ids killed this night (for dawn reveal)

  // Timer
  phaseEndTime: number | null                 // timestamp when current phase ends
}

export interface PublicPlayer {
  id: string
  name: string
  alive: boolean
  connected: boolean
  role: MafiaRole | null                      // only revealed if dead or game over
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
  doctorLastTarget: string | null                  // only for doctor
  witchHealUsed: boolean                           // only for witch
  witchKillUsed: boolean                           // only for witch
  witchWerewolfTarget: string | null               // only for witch (who wolves targeted)
  cupidLovers: [string, string] | null             // only for cupid & the lovers themselves
  isLover: boolean

  // Day info
  dayVotes: Record<string, string>
  chat: ChatMessage[]
  eliminatedToday: string | null

  // Hunter
  hunterPendingKill: boolean
  isHunterRevenge: boolean                         // true if this player is the hunter needing to pick

  // Game result
  winner: WinCondition
  winningPlayerIds: string[]

  // Events & timer
  events: EventLogEntry[]
  phaseEndTime: number | null
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "leave" }
  | { type: "start-game" }
  | { type: "night-action"; targetId: string }
  | { type: "witch-action"; heal: boolean; killTargetId: string | null }
  | { type: "cupid-action"; lover1: string; lover2: string }
  | { type: "hunter-kill"; targetId: string }
  | { type: "day-vote"; targetId: string }          // "abstain" for abstain
  | { type: "chat"; text: string }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: PublicPlayer }
  | { type: "player-left"; playerId: string }
  | { type: "error"; message: string }

// ─── Role Distribution ──────────────────────────────────────────────────────

function getRoleDistribution(playerCount: number): MafiaRole[] {
  const roles: MafiaRole[] = []

  if (playerCount <= 5) {
    roles.push("werewolf")
    roles.push("seer", "doctor")
    while (roles.length < playerCount) roles.push("villager")
  } else if (playerCount === 6) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor")
    while (roles.length < playerCount) roles.push("villager")
  } else if (playerCount === 7) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter")
    while (roles.length < playerCount) roles.push("villager")
  } else if (playerCount === 8) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter", "witch")
    while (roles.length < playerCount) roles.push("villager")
  } else if (playerCount === 9) {
    roles.push("werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter", "witch", "cupid")
    while (roles.length < playerCount) roles.push("villager")
  } else {
    // 10+
    roles.push("werewolf", "werewolf", "werewolf")
    roles.push("seer", "doctor", "hunter", "witch", "cupid", "jester")
    while (roles.length < playerCount) roles.push("villager")
  }

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

export default class MafiaParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null

  async onStart() {
    const stored = await this.room.storage.get<string>("state")
    if (stored) {
      try {
        this.state = JSON.parse(stored)
      } catch {
        this.state = null
      }
    }
  }

  async saveState() {
    if (this.state) {
      await this.room.storage.put("state", JSON.stringify(this.state))
    }
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
      doctorLastTarget: myRole === "doctor" ? s.doctorLastTarget : null,
      witchHealUsed: s.witchHealUsed,
      witchKillUsed: s.witchKillUsed,
      witchWerewolfTarget,
      cupidLovers,
      isLover,
      dayVotes: s.dayVotes,
      chat: s.chat,
      eliminatedToday: s.eliminatedToday,
      hunterPendingKill: s.hunterPendingKill,
      isHunterRevenge:
        s.hunterPendingKill && s.hunterPlayerId === playerId,
      winner: s.winner,
      winningPlayerIds: s.winningPlayerIds,
      events: s.events,
      phaseEndTime: s.phaseEndTime,
    }
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
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

  async setPhase(phase: GamePhase, timerSeconds?: number) {
    if (!this.state) return
    this.state.phase = phase

    if (timerSeconds && timerSeconds > 0) {
      this.state.phaseEndTime = Date.now() + timerSeconds * 1000
      await this.room.storage.setAlarm(Date.now() + timerSeconds * 1000)
    } else {
      this.state.phaseEndTime = null
    }
  }

  async startGame() {
    if (!this.state) return
    const playerIds = this.state.playerOrder
    const count = playerIds.length

    if (count < 5) return

    // Assign roles
    const roles = shuffleArray(getRoleDistribution(count))
    for (let i = 0; i < count; i++) {
      this.state.players[playerIds[i]].role = roles[i]
    }

    this.state.status = "playing"
    this.state.dayNumber = 0

    this.addEvent("The village falls asleep... roles are being revealed.")

    await this.setPhase("role-reveal", 8)
    this.broadcastState()
    await this.saveState()
  }

  async onAlarm() {
    if (!this.state) return

    switch (this.state.phase) {
      case "role-reveal":
        await this.startNight(true)
        break
      case "first-night":
      case "night":
        // Auto-skip current night sub-phase
        await this.advanceNightSubPhase()
        break
      case "dawn":
        await this.startDayDiscussion()
        break
      case "day-discussion":
        await this.startDayVoting()
        break
      case "day-voting":
        await this.resolveDayVotes()
        break
      case "day-elimination":
        await this.afterElimination()
        break
      case "hunter-revenge":
        // Hunter didn't pick, auto-skip
        if (this.state.hunterPendingKill) {
          this.state.hunterPendingKill = false
          this.state.hunterPlayerId = null
          await this.checkWinConditionAndProceed()
        }
        break
    }

    this.broadcastState()
    await this.saveState()
  }

  async startNight(isFirst: boolean) {
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

    const hasCupid = hasAliveRole(this.state, "cupid") && !this.state.cupidActed
    const phase = isFirst && hasCupid ? "first-night" : "night"

    this.addEvent(`Night ${this.state.dayNumber} falls... the village sleeps.`)
    await this.setPhase(phase)

    // Determine first night sub-phase
    if (isFirst && hasCupid) {
      this.state.nightSubPhase = "cupid"
    } else {
      this.state.nightSubPhase = "werewolves"
      // Skip if no werewolves alive
      if (!hasAliveRole(this.state, "werewolf")) {
        await this.advanceNightSubPhaseFrom("werewolves")
        return
      }
    }

    // Set night timer
    await this.room.storage.setAlarm(Date.now() + this.state.settings.nightTime * 1000)
    this.state.phaseEndTime = Date.now() + this.state.settings.nightTime * 1000

    this.broadcastState()
    await this.saveState()
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

  async advanceNightSubPhaseFrom(current: NightSubPhase) {
    if (!this.state) return
    const next = this.getNextNightSubPhase(current)
    this.state.nightSubPhase = next

    if (next === "done") {
      await this.resolveNight()
    } else {
      // Reset timer for each sub-phase
      await this.room.storage.setAlarm(Date.now() + this.state.settings.nightTime * 1000)
      this.state.phaseEndTime = Date.now() + this.state.settings.nightTime * 1000
      this.broadcastState()
      await this.saveState()
    }
  }

  async advanceNightSubPhase() {
    if (!this.state) return
    await this.advanceNightSubPhaseFrom(this.state.nightSubPhase)
  }

  async resolveNight() {
    if (!this.state) return

    const kills: string[] = []
    let savedPlayer: string | null = null

    // 1. Determine werewolf target (majority vote among wolves)
    const wolfVotes = Object.values(this.state.werewolfVotes)
    if (wolfVotes.length > 0) {
      const voteCounts: Record<string, number> = {}
      for (const target of wolfVotes) {
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
      this.state.werewolfTarget = target
    }

    // 2. Doctor save
    if (this.state.doctorTarget && this.state.doctorTarget === this.state.werewolfTarget) {
      savedPlayer = this.state.doctorTarget
    }

    // 3. Witch heal
    if (this.state.witchHealTarget && this.state.witchHealTarget === this.state.werewolfTarget) {
      savedPlayer = this.state.witchHealTarget
    }

    // 4. Werewolf kill (if not saved)
    if (this.state.werewolfTarget && this.state.werewolfTarget !== savedPlayer) {
      kills.push(this.state.werewolfTarget)
    }

    // 5. Witch kill
    if (this.state.witchKillTarget && !kills.includes(this.state.witchKillTarget)) {
      kills.push(this.state.witchKillTarget)
    }

    // 6. Process kills with lover chain
    const allKills = new Set<string>()
    const hunterTriggered: string[] = []

    const processKill = (targetId: string) => {
      if (allKills.has(targetId)) return
      const target = this.state!.players[targetId]
      if (!target || !target.alive) return

      allKills.add(targetId)

      // Check lover chain
      if (this.state!.cupidLovers) {
        const [l1, l2] = this.state!.cupidLovers
        if (targetId === l1 && this.state!.players[l2]?.alive && !allKills.has(l2)) {
          allKills.add(l2)
          // Check if the other lover is a hunter
          if (this.state!.players[l2].role === "hunter") {
            hunterTriggered.push(l2)
          }
        } else if (targetId === l2 && this.state!.players[l1]?.alive && !allKills.has(l1)) {
          allKills.add(l1)
          if (this.state!.players[l1].role === "hunter") {
            hunterTriggered.push(l1)
          }
        }
      }

      // Check if target is hunter
      if (target.role === "hunter" && !hunterTriggered.includes(targetId)) {
        hunterTriggered.push(targetId)
      }
    }

    for (const targetId of kills) {
      processKill(targetId)
    }

    // Apply kills
    for (const id of allKills) {
      this.state.players[id].alive = false
    }

    this.state.nightKills = Array.from(allKills)

    // Dawn phase - reveal who died
    this.addEvent("Dawn breaks over the village...")
    await this.setPhase("dawn", 5)

    if (allKills.size === 0) {
      this.addEvent("The village wakes peacefully. No one was killed last night.")
    } else {
      for (const id of allKills) {
        const p = this.state.players[id]
        this.addEvent(`${p.name} was found dead. They were a ${p.role}.`)
      }
    }

    // Check for hunter revenge (handled after dawn timer)
    // Store first triggered hunter for after dawn
    if (hunterTriggered.length > 0) {
      this.state.hunterPendingKill = true
      this.state.hunterPlayerId = hunterTriggered[0]
    }

    this.broadcastState()
    await this.saveState()
  }

  async startDayDiscussion() {
    if (!this.state) return

    // Check win condition first
    const winner = this.checkWinCondition()
    if (winner) {
      await this.endGame(winner)
      return
    }

    // Handle hunter revenge from night
    if (this.state.hunterPendingKill && this.state.hunterPlayerId) {
      await this.setPhase("hunter-revenge", 15)
      this.addEvent(`${this.state.players[this.state.hunterPlayerId].name} the Hunter takes aim...`)
      this.broadcastState()
      await this.saveState()
      return
    }

    this.state.dayVotes = {}
    this.state.eliminatedToday = null
    this.state.chat = []

    this.addEvent(`Day ${this.state.dayNumber} begins. The village gathers to discuss.`)
    await this.setPhase("day-discussion", this.state.settings.discussionTime)
    this.broadcastState()
    await this.saveState()
  }

  async startDayVoting() {
    if (!this.state) return

    this.state.dayVotes = {}
    this.addEvent("Time to vote! Choose who to eliminate or abstain.")
    await this.setPhase("day-voting", this.state.settings.votingTime)
    this.broadcastState()
    await this.saveState()
  }

  async resolveDayVotes() {
    if (!this.state) return

    const voteCounts: Record<string, number> = {}

    for (const targetId of Object.values(this.state.dayVotes)) {
      if (targetId !== "abstain") {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
      }
    }

    // Find max votes
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

    // Need majority (more than half of alive voters) or at least plurality with no tie
    if (isTie || maxVotes === 0) {
      eliminated = null
    }

    if (eliminated) {
      const player = this.state.players[eliminated]

      // Jester check - instant win
      if (player.role === "jester") {
        this.addEvent(`${player.name} was voted out... they were the Jester! They win!`)
        player.alive = false
        this.state.eliminatedToday = eliminated

        // Lover chain for jester
        if (this.state.cupidLovers) {
          const [l1, l2] = this.state.cupidLovers
          if (eliminated === l1 && this.state.players[l2]?.alive) {
            this.state.players[l2].alive = false
            this.addEvent(`${this.state.players[l2].name} dies of heartbreak (lover).`)
          } else if (eliminated === l2 && this.state.players[l1]?.alive) {
            this.state.players[l1].alive = false
            this.addEvent(`${this.state.players[l1].name} dies of heartbreak (lover).`)
          }
        }

        await this.endGame("jester", [eliminated])
        return
      }

      player.alive = false
      this.state.eliminatedToday = eliminated
      this.addEvent(`${player.name} was voted out. They were a ${player.role}.`)

      // Lover chain
      if (this.state.cupidLovers) {
        const [l1, l2] = this.state.cupidLovers
        if (eliminated === l1 && this.state.players[l2]?.alive) {
          this.state.players[l2].alive = false
          this.addEvent(`${this.state.players[l2].name} dies of heartbreak (lover).`)
        } else if (eliminated === l2 && this.state.players[l1]?.alive) {
          this.state.players[l1].alive = false
          this.addEvent(`${this.state.players[l1].name} dies of heartbreak (lover).`)
        }
      }

      // Hunter revenge
      if (player.role === "hunter") {
        this.state.hunterPendingKill = true
        this.state.hunterPlayerId = eliminated
        await this.setPhase("day-elimination", 3)
        this.broadcastState()
        await this.saveState()
        return
      }

      await this.setPhase("day-elimination", 3)
    } else {
      this.addEvent("The vote was inconclusive. No one is eliminated.")
      await this.setPhase("day-elimination", 3)
    }

    this.broadcastState()
    await this.saveState()
  }

  async afterElimination() {
    if (!this.state) return

    // Hunter revenge from day elimination
    if (this.state.hunterPendingKill && this.state.hunterPlayerId) {
      await this.setPhase("hunter-revenge", 15)
      this.addEvent(`${this.state.players[this.state.hunterPlayerId].name} the Hunter takes aim...`)
      this.broadcastState()
      await this.saveState()
      return
    }

    await this.checkWinConditionAndProceed()
  }

  async handleHunterKill(hunterId: string, targetId: string) {
    if (!this.state) return
    if (!this.state.hunterPendingKill || this.state.hunterPlayerId !== hunterId) return

    const target = this.state.players[targetId]
    if (!target || !target.alive) return

    target.alive = false
    this.state.hunterPendingKill = false
    this.state.hunterPlayerId = null

    this.addEvent(`${this.state.players[hunterId].name} the Hunter takes down ${target.name}!`)

    // Lover chain from hunter kill
    if (this.state.cupidLovers) {
      const [l1, l2] = this.state.cupidLovers
      if (targetId === l1 && this.state.players[l2]?.alive) {
        this.state.players[l2].alive = false
        this.addEvent(`${this.state.players[l2].name} dies of heartbreak (lover).`)
      } else if (targetId === l2 && this.state.players[l1]?.alive) {
        this.state.players[l1].alive = false
        this.addEvent(`${this.state.players[l1].name} dies of heartbreak (lover).`)
      }
    }

    await this.checkWinConditionAndProceed()
    this.broadcastState()
    await this.saveState()
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

  async checkWinConditionAndProceed() {
    if (!this.state) return

    const winner = this.checkWinCondition()
    if (winner) {
      await this.endGame(winner)
    } else {
      // Continue to next night
      await this.startNight(false)
    }
  }

  async endGame(winner: WinCondition, specificWinners?: string[]) {
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
    this.addEvent(winText[winner!] || "The game is over.")

    await this.setPhase("game-over")
    this.broadcastState()
    await this.saveState()
  }

  // ─── Night Action Handlers ──────────────────────────────────────────────

  async handleWerewolfVote(playerId: string, targetId: string) {
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
      await this.advanceNightSubPhaseFrom("werewolves")
    }

    this.broadcastState()
    await this.saveState()
  }

  async handleSeerInspect(playerId: string, targetId: string) {
    if (!this.state) return
    if (this.state.nightSubPhase !== "seer") return

    const player = this.state.players[playerId]
    if (!player || !player.alive || player.role !== "seer") return

    const target = this.state.players[targetId]
    if (!target || !target.alive || targetId === playerId) return

    this.state.seerTarget = targetId
    this.state.seerResult = target.role === "werewolf"

    await this.advanceNightSubPhaseFrom("seer")
    this.broadcastState()
    await this.saveState()
  }

  async handleDoctorProtect(playerId: string, targetId: string) {
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

    await this.advanceNightSubPhaseFrom("doctor")
    this.broadcastState()
    await this.saveState()
  }

  async handleWitchAction(playerId: string, heal: boolean, killTargetId: string | null) {
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
    await this.advanceNightSubPhaseFrom("witch")
    this.broadcastState()
    await this.saveState()
  }

  async handleCupidAction(playerId: string, lover1: string, lover2: string) {
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

    await this.advanceNightSubPhaseFrom("cupid")
    this.broadcastState()
    await this.saveState()
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

    // Check if all alive players have voted
    const alive = getAlivePlayers(this.state)
    const allVoted = alive.every((p) => this.state!.dayVotes[p.id])

    if (allVoted) {
      // Resolve immediately
      this.resolveDayVotes()
      return
    }

    this.broadcastState()
    this.saveState()
  }

  handleChat(playerId: string, text: string) {
    if (!this.state) return
    if (this.state.phase !== "day-discussion" && this.state.phase !== "day-voting") return

    const player = this.state.players[playerId]
    if (!player || !player.alive) return

    const trimmed = text.trim().slice(0, 200)
    if (!trimmed) return

    // Rate limit: max 1 message per second per player
    const now = Date.now()
    const recentFromPlayer = this.state.chat.filter(
      (m) => m.playerId === playerId && now - m.timestamp < 1000
    )
    if (recentFromPlayer.length > 0) return

    this.state.chat.push({
      id: generateId(),
      playerId,
      playerName: player.name,
      text: trimmed,
      timestamp: now,
    })

    // Keep last 100 messages
    if (this.state.chat.length > 100) {
      this.state.chat = this.state.chat.slice(-100)
    }

    this.broadcastState()
    this.saveState()
  }

  // ─── Connection Handlers ────────────────────────────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const isHost = url.searchParams.get("host") === "true"

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
        hunterPendingKill: false,
        hunterPlayerId: null,
        winner: null,
        winningPlayerIds: [],
        events: [],
        nightKills: [],
        phaseEndTime: null,
      }
      await this.saveState()
    }

    if (this.state) {
      // Reconnect existing player
      const existing = this.state.players[conn.id]
      if (existing) {
        existing.connected = true
        this.broadcastState()
        await this.saveState()
      }
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return

    try {
      const msg: ClientMessage = JSON.parse(message)

      switch (msg.type) {
        case "join": {
          if (this.state.status !== "waiting") {
            this.sendError(sender, "Game already in progress")
            return
          }
          if (Object.keys(this.state.players).length >= 12) {
            this.sendError(sender, "Game is full (max 12 players)")
            return
          }
          if (this.state.players[sender.id]) {
            // Already joined
            this.broadcastState()
            return
          }

          const player: Player = {
            id: sender.id,
            name: msg.name.trim().slice(0, 20) || "Player",
            role: "villager", // placeholder until game starts
            alive: true,
            connected: true,
          }
          this.state.players[sender.id] = player
          this.state.playerOrder.push(sender.id)

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
          break
        }

        case "leave": {
          this.handlePlayerLeave(sender.id)
          break
        }

        case "start-game": {
          if (sender.id !== this.state.hostId) {
            this.sendError(sender, "Only the host can start the game")
            return
          }
          if (Object.keys(this.state.players).length < 5) {
            this.sendError(sender, "Need at least 5 players to start")
            return
          }
          await this.startGame()
          break
        }

        case "night-action": {
          const player = this.state.players[sender.id]
          if (!player || !player.alive) return

          switch (player.role) {
            case "werewolf":
              await this.handleWerewolfVote(sender.id, msg.targetId)
              break
            case "seer":
              await this.handleSeerInspect(sender.id, msg.targetId)
              break
            case "doctor":
              await this.handleDoctorProtect(sender.id, msg.targetId)
              break
          }
          break
        }

        case "witch-action": {
          await this.handleWitchAction(sender.id, msg.heal, msg.killTargetId)
          break
        }

        case "cupid-action": {
          await this.handleCupidAction(sender.id, msg.lover1, msg.lover2)
          break
        }

        case "hunter-kill": {
          await this.handleHunterKill(sender.id, msg.targetId)
          break
        }

        case "day-vote": {
          this.handleDayVote(sender.id, msg.targetId)
          break
        }

        case "chat": {
          this.handleChat(sender.id, msg.text)
          break
        }
      }
    } catch (e) {
      console.error("Failed to process message:", e)
    }
  }

  async handlePlayerLeave(playerId: string) {
    if (!this.state) return

    if (this.state.status === "waiting") {
      delete this.state.players[playerId]
      this.state.playerOrder = this.state.playerOrder.filter((id) => id !== playerId)

      // Transfer host
      if (playerId === this.state.hostId && this.state.playerOrder.length > 0) {
        this.state.hostId = this.state.playerOrder[0]
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
          (id) => id !== playerId && this.state!.players[id]?.connected
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

    const player = this.state.players[conn.id]
    if (player) {
      player.connected = false

      // Transfer host
      if (conn.id === this.state.hostId) {
        const connected = this.state.playerOrder.find(
          (id) => id !== conn.id && this.state!.players[id]?.connected
        )
        if (connected) {
          this.state.hostId = connected
        }
      }

      this.broadcastState()
      await this.saveState()
    }
  }
}

MafiaParty satisfies Party.Worker
