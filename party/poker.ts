import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import {
  createDeck,
  shuffleDeck,
  evaluateBestHand,
  compareHands,
  HandCategory,
  type HandResult,
} from "../src/lib/poker/handEvaluator"
import { calculatePots, type PotContribution } from "../src/lib/poker/potCalculator"
import {
  getGameNightResultMatch,
  validateGameNightConnection,
  type GameNightMember,
} from "./shared/gameNight"

// ─── Types ───────────────────────────────────────────────────────────────────

export type GamePhase = "waiting" | "playing" | "finished"
export type BettingRound = "pre-flop" | "flop" | "turn" | "river" | "showdown"
export type PendingStep = "street" | "award" | "fold-win" | "next-hand"

export interface SeatAction {
  kind: "sb" | "bb" | "check" | "call" | "bet" | "raise" | "all-in" | "fold"
  /** The player's total bet this street after the action. */
  amount?: number
}

export interface PokerLogEntry {
  id: number
  kind: "hand" | "blinds-up" | "sb" | "bb" | "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "street" | "show" | "win" | "timeout"
  playerId?: string
  name?: string
  amount?: number
  allIn?: boolean
  round?: BettingRound
  cards?: number[]
  hand?: string
}

const LOG_LIMIT = 40
const DEAL_MS = 1500
const ROUND_PAUSE_MS = 1100
const RUNOUT_PAUSE_MS = 1800
const SHOWDOWN_PAUSE_MS = 2400
const FOLD_WIN_PAUSE_MS = 900
/** Time to read the result before the next hand deals itself. */
const NEXT_HAND_MS = 6000
const DISCONNECT_FOLD_MS = 10000
/** Bots take a human-looking beat to think. */
const BOT_THINK_MS = 1300
const BOT_THINK_JITTER_MS = 1100
const BOT_NAMES = ["Ace", "Maverick", "Lucky", "Duchess", "Slim", "Rosie", "Tex", "Vegas"]

export interface PokerSettings {
  startingChips: number
  smallBlind: number
  blindIncrease: number
  turnTimeLimit: number
}

export interface Player {
  id: string
  name: string
  chips: number
  holeCards: number[]
  currentBet: number
  totalBetThisHand: number
  folded: boolean
  allIn: boolean
  connected: boolean
  seatIndex: number
  isDealer: boolean
  lastAction: SeatAction | null
  isBot?: boolean
}

export interface WinnerInfo {
  playerId: string
  playerName: string
  amount: number
  handResult: HandResult | null
  potIndex: number
}

export interface GameState {
  roomCode: string
  hostId: string
  players: Record<string, Player>
  seatOrder: string[]
  status: GamePhase
  settings: PokerSettings
  deck: number[]
  communityCards: number[]
  bettingRound: BettingRound
  pot: number
  currentPlayerIndex: number
  dealerIndex: number
  smallBlindIndex: number
  bigBlindIndex: number
  lastRaiseAmount: number
  minRaise: number
  handNumber: number
  lastAggressorIndex: number
  actedThisRound: Set<string>
  winners: WinnerInfo[]
  showdownPlayers: string[]
  handInProgress: boolean
  playerTokens: Record<string, string>
  pending: { step: PendingStep; at: number } | null
  turnDeadline: number | null
  log: PokerLogEntry[]
  logSeq: number
  autoDealPaused: boolean
}

export interface PublicPlayer {
  id: string
  name: string
  chips: number
  currentBet: number
  totalBetThisHand: number
  folded: boolean
  allIn: boolean
  connected: boolean
  seatIndex: number
  isDealer: boolean
  hasCards: boolean
  holeCards: number[] | null
  lastAction: SeatAction | null
  isBot?: boolean
}

export interface PublicGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicPlayer>
  seatOrder: string[]
  status: GamePhase
  settings: PokerSettings
  communityCards: number[]
  bettingRound: BettingRound
  pot: number
  currentPlayerId: string | null
  dealerPlayerId: string | null
  smallBlindPlayerId: string | null
  bigBlindPlayerId: string | null
  minRaise: number
  currentBetToMatch: number
  handNumber: number
  winners: WinnerInfo[]
  showdownPlayers: string[]
  handInProgress: boolean
  myHoleCards: number[]
  turnDeadline: number | null
  serverNow: number
  log: PokerLogEntry[]
  nextHandAt: number | null
  autoDealPaused: boolean
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "leave" }
  | { type: "start-game" }
  | { type: "add-bot" }
  | { type: "remove-bot"; playerId: string }
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "all-in" }
  | { type: "next-hand" }
  | { type: "toggle-auto-deal" }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: PublicPlayer }
  | { type: "player-left"; playerId: string }
  | { type: "player-action"; playerId: string; action: string; amount?: number }
  | { type: "community-cards"; cards: number[]; round: BettingRound }
  | { type: "showdown"; players: { id: string; holeCards: number[]; handResult: HandResult }[] }
  | { type: "hand-over"; winners: WinnerInfo[] }
  | { type: "error"; message: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Find next alive player (chips > 0, not folded). Used BEFORE dealing.
function nextAliveSeatIndex(state: GameState, fromIndex: number): number {
  const len = state.seatOrder.length
  if (len === 0) return 0
  let idx = (fromIndex + 1) % len
  for (let i = 0; i < len; i++) {
    const p = state.players[state.seatOrder[idx]]
    if (p && p.chips > 0 && !p.folded) {
      return idx
    }
    idx = (idx + 1) % len
  }
  return fromIndex
}

// Find next player who can still bet (in hand, not all-in). Used AFTER dealing.
function nextCanActSeatIndex(state: GameState, fromIndex: number): number {
  const len = state.seatOrder.length
  if (len === 0) return -1
  let idx = (fromIndex + 1) % len
  for (let i = 0; i < len; i++) {
    const p = state.players[state.seatOrder[idx]]
    if (p && !p.folded && !p.allIn && p.holeCards.length > 0) {
      return idx
    }
    idx = (idx + 1) % len
  }
  return -1
}

// Players still in the hand (have cards, not folded)
function getActivePlayers(state: GameState): Player[] {
  return state.seatOrder
    .map((id) => state.players[id])
    .filter((p) => p && !p.folded && p.holeCards.length > 0)
}

// Players who can still bet (active + not all-in)
function getActiveNotAllInPlayers(state: GameState): Player[] {
  return getActivePlayers(state).filter((p) => !p.allIn)
}

function getHighestBet(state: GameState): number {
  let max = 0
  for (const id of state.seatOrder) {
    const p = state.players[id]
    if (p && p.currentBet > max) max = p.currentBet
  }
  return max
}

// ─── Server ──────────────────────────────────────────────────────────────────

class PokerParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    const stored = await this.room.storage.get<string>("state")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        parsed.actedThisRound = new Set(parsed.actedThisRound || [])
        parsed.playerTokens ??= {}
        parsed.pending ??= null
        parsed.turnDeadline ??= null
        parsed.log ??= []
        parsed.logSeq ??= 0
        parsed.autoDealPaused ??= false
        for (const player of Object.values(parsed.players) as Player[]) player.lastAction ??= null
        this.state = parsed
        for (const player of Object.values(this.state!.players) as Player[]) {
          player.connected = Boolean(player.isBot)
        }
        await this.saveState()
      } catch {
        // Corrupted state, reset
        this.state = null
      }
    }
  }

  async saveState() {
    if (this.state) {
      const toStore = {
        ...this.state,
        actedThisRound: Array.from(this.state.actedThisRound),
      }
      await this.room.storage.put("state", JSON.stringify(toStore))
    }
  }

  isAuthenticated(conn: Party.Connection): boolean {
    if (!this.state) return false
    const token = this.connectionTokens.get(conn)
    return Boolean(token && this.state.playerTokens[conn.id] === token)
  }

  getPublicState(playerId: string): PublicGameState {
    if (!this.state) throw new Error("No game state")
    const s = this.state

    const players: Record<string, PublicPlayer> = {}
    for (const [id, p] of Object.entries(s.players)) {
      const showCards =
        s.showdownPlayers.includes(id) ||
        s.status === "finished"

      players[id] = {
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        totalBetThisHand: p.totalBetThisHand,
        folded: p.folded,
        allIn: p.allIn,
        connected: p.connected,
        seatIndex: p.seatIndex,
        isDealer: p.isDealer,
        hasCards: p.holeCards.length > 0,
        holeCards: showCards ? p.holeCards : null,
        lastAction: p.lastAction,
        isBot: p.isBot,
      }
    }

    const currentPlayerId =
      s.handInProgress && s.currentPlayerIndex >= 0 && s.currentPlayerIndex < s.seatOrder.length
        ? s.seatOrder[s.currentPlayerIndex]
        : null

    const highestBet = getHighestBet(s)

    return {
      roomCode: s.roomCode,
      hostId: s.hostId,
      players,
      seatOrder: s.seatOrder,
      status: s.status,
      settings: s.settings,
      communityCards: s.communityCards,
      bettingRound: s.bettingRound,
      pot: s.pot,
      currentPlayerId,
      dealerPlayerId: s.seatOrder[s.dealerIndex] || null,
      smallBlindPlayerId: s.seatOrder[s.smallBlindIndex] || null,
      bigBlindPlayerId: s.seatOrder[s.bigBlindIndex] || null,
      minRaise: s.minRaise,
      currentBetToMatch: highestBet,
      handNumber: s.handNumber,
      winners: s.winners,
      showdownPlayers: s.showdownPlayers,
      handInProgress: s.handInProgress,
      myHoleCards: s.players[playerId]?.holeCards || [],
      turnDeadline: s.turnDeadline,
      serverNow: Date.now(),
      log: s.log,
      nextHandAt: s.pending?.step === "next-hand" ? s.pending.at : null,
      autoDealPaused: s.autoDealPaused,
    }
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
      if (!this.isAuthenticated(conn)) continue
      try {
        this.send(conn, { type: "state", state: this.getPublicState(conn.id) })
      } catch (e) {
        console.error("broadcastState error for", conn.id, e)
      }
    }
  }

  broadcast(message: ServerMessage, exclude?: string) {
    const msg = JSON.stringify(message)
    for (const conn of this.room.getConnections()) {
      if (conn.id !== exclude) {
        try { conn.send(msg) } catch {}
      }
    }
  }

  send(conn: Party.Connection, message: ServerMessage) {
    conn.send(JSON.stringify(message))
  }

  // ─── Game Logic ──────────────────────────────────────────────────────────

  addLog(entry: Omit<PokerLogEntry, "id">) {
    const s = this.state!
    s.logSeq += 1
    s.log = [...s.log, { ...entry, id: s.logSeq }].slice(-LOG_LIMIT)
  }

  /** Queue the dealer's next step. It runs from the alarm, so a restart cannot strand the hand. */
  schedule(step: PendingStep, delay: number) {
    const s = this.state!
    s.currentPlayerIndex = -1
    s.turnDeadline = null
    s.pending = { step, at: Date.now() + delay }
    this.room.storage.setAlarm(s.pending.at)
  }

  startTurn(index: number, extraMs = 0) {
    const s = this.state!
    s.currentPlayerIndex = index
    const player = s.players[s.seatOrder[index]]
    if (player?.isBot) {
      s.turnDeadline = null
      this.room.storage.setAlarm(Date.now() + extraMs + BOT_THINK_MS + Math.random() * BOT_THINK_JITTER_MS)
      return
    }
    s.turnDeadline = s.settings.turnTimeLimit > 0 ? Date.now() + s.settings.turnTimeLimit * 1000 + extraMs : null
    const alarm = s.turnDeadline ?? (player && !player.connected ? Date.now() + DISCONNECT_FOLD_MS : null)
    if (alarm) this.room.storage.setAlarm(alarm)
    else this.room.storage.deleteAlarm()
  }

  startNewHand() {
    if (!this.state) return
    const s = this.state

    // Count alive players (have chips)
    const aliveSeatIndices: number[] = []
    for (let i = 0; i < s.seatOrder.length; i++) {
      const p = s.players[s.seatOrder[i]]
      if (p && p.chips > 0) {
        aliveSeatIndices.push(i)
      }
    }

    if (aliveSeatIndices.length < 2) {
      s.status = "finished"
      s.handInProgress = false
      return
    }

    // Increase blinds if configured
    if (s.settings.blindIncrease > 0 && s.handNumber > 0 && s.handNumber % s.settings.blindIncrease === 0) {
      const raised = Math.min(s.settings.smallBlind * 2, Math.floor(s.settings.startingChips / 2))
      if (raised !== s.settings.smallBlind) {
        s.settings.smallBlind = raised
        this.addLog({ kind: "blinds-up", amount: raised })
      }
    }

    s.handNumber++
    s.winners = []
    s.showdownPlayers = []
    s.communityCards = []
    s.bettingRound = "pre-flop"
    s.pot = 0
    s.handInProgress = true
    s.pending = null
    s.lastRaiseAmount = s.settings.smallBlind * 2
    s.minRaise = s.settings.smallBlind * 2
    s.actedThisRound = new Set()
    s.lastAggressorIndex = -1

    // Reset player hand state
    for (const id of s.seatOrder) {
      const p = s.players[id]
      if (p) {
        p.holeCards = []
        p.currentBet = 0
        p.totalBetThisHand = 0
        p.folded = p.chips <= 0  // auto-fold eliminated players
        p.allIn = false
        p.isDealer = false
        p.lastAction = null
      }
    }

    // Advance dealer using alive-player logic (no holeCards check)
    s.dealerIndex = nextAliveSeatIndex(s, s.dealerIndex)
    const dealer = s.players[s.seatOrder[s.dealerIndex]]
    if (dealer) dealer.isDealer = true

    // Set blinds using alive-player logic
    if (aliveSeatIndices.length === 2) {
      // Heads-up: dealer is small blind
      s.smallBlindIndex = s.dealerIndex
      s.bigBlindIndex = nextAliveSeatIndex(s, s.dealerIndex)
    } else {
      s.smallBlindIndex = nextAliveSeatIndex(s, s.dealerIndex)
      s.bigBlindIndex = nextAliveSeatIndex(s, s.smallBlindIndex)
    }

    this.addLog({ kind: "hand", amount: s.handNumber, playerId: dealer?.id, name: dealer?.name })

    // Post blinds
    this.postBlind(s.seatOrder[s.smallBlindIndex], s.settings.smallBlind, "sb")
    this.postBlind(s.seatOrder[s.bigBlindIndex], s.settings.smallBlind * 2, "bb")

    // Deal hole cards
    s.deck = shuffleDeck(createDeck())
    let cardIdx = 0
    for (const id of s.seatOrder) {
      const p = s.players[id]
      if (p && !p.folded) {
        p.holeCards = [s.deck[cardIdx], s.deck[cardIdx + 1]]
        cardIdx += 2
      }
    }
    s.deck = s.deck.slice(cardIdx)

    // First to act: left of big blind. The clock starts once the cards have landed.
    const firstIdx = nextCanActSeatIndex(s, s.bigBlindIndex)
    if (firstIdx === -1) {
      this.schedule("street", DEAL_MS + ROUND_PAUSE_MS)
      return
    }
    this.startTurn(firstIdx, DEAL_MS)
  }

  postBlind(playerId: string, amount: number, kind: "sb" | "bb") {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    const actualAmount = Math.min(amount, p.chips)
    p.chips -= actualAmount
    p.currentBet += actualAmount      // accumulate (handles SB then BB on same player in heads-up edge cases)
    p.totalBetThisHand += actualAmount // accumulate
    this.state.pot += actualAmount
    p.lastAction = { kind, amount: p.currentBet }
    this.addLog({ kind, playerId, name: p.name, amount: actualAmount })

    if (p.chips === 0) {
      p.allIn = true
    }
  }

  /** One player is left in the hand: let the last fold land, then push them the pot. */
  closeHandByFold() {
    this.schedule("fold-win", FOLD_WIN_PAUSE_MS)
    this.broadcastState()
  }

  /** Betting is over for this street: hold the bets in front of the players for a beat. */
  closeRound() {
    this.schedule("street", ROUND_PAUSE_MS)
    this.broadcastState()
  }

  handleFold(playerId: string) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    p.folded = true
    p.lastAction = { kind: "fold" }
    this.state.actedThisRound.add(playerId)
    this.addLog({ kind: "fold", playerId, name: p.name })

    this.broadcast({ type: "player-action", playerId, action: "fold" })

    const active = getActivePlayers(this.state)
    if (active.length === 1) {
      this.closeHandByFold()
      return
    }
    if (active.length === 0) {
      this.state.handInProgress = false
      this.broadcastState()
      return
    }

    this.advanceAction()
  }

  handleCheck(playerId: string) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    const highestBet = getHighestBet(this.state)
    if (p.currentBet < highestBet) return

    this.state.actedThisRound.add(playerId)
    p.lastAction = { kind: "check" }
    this.addLog({ kind: "check", playerId, name: p.name })
    this.broadcast({ type: "player-action", playerId, action: "check" })
    this.advanceAction()
  }

  handleCall(playerId: string) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    const highestBet = getHighestBet(this.state)
    const callAmount = Math.min(highestBet - p.currentBet, p.chips)

    p.chips -= callAmount
    p.currentBet += callAmount
    p.totalBetThisHand += callAmount
    this.state.pot += callAmount

    if (p.chips === 0) p.allIn = true

    this.state.actedThisRound.add(playerId)
    p.lastAction = { kind: p.allIn ? "all-in" : "call", amount: p.currentBet }
    this.addLog({ kind: "call", playerId, name: p.name, amount: callAmount, allIn: p.allIn })
    this.broadcast({ type: "player-action", playerId, action: "call", amount: callAmount })

    const active = getActivePlayers(this.state)
    if (active.length === 1) {
      this.closeHandByFold()
      return
    }

    this.advanceAction()
  }

  handleRaise(playerId: string, totalBetAmount: number) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    const highestBet = getHighestBet(this.state)
    const raiseBy = totalBetAmount - highestBet
    const amountToAdd = totalBetAmount - p.currentBet

    if (amountToAdd <= 0 || amountToAdd > p.chips) return
    if (raiseBy < this.state.minRaise && amountToAdd < p.chips) return

    p.chips -= amountToAdd
    p.currentBet = totalBetAmount
    p.totalBetThisHand += amountToAdd
    this.state.pot += amountToAdd

    if (p.chips === 0) p.allIn = true

    this.state.lastRaiseAmount = raiseBy
    this.state.minRaise = raiseBy
    this.state.lastAggressorIndex = p.seatIndex

    // Everyone must act again after a raise
    this.state.actedThisRound = new Set([playerId])

    const kind = p.allIn ? "all-in" : highestBet === 0 ? "bet" : "raise"
    p.lastAction = { kind, amount: totalBetAmount }
    this.addLog({ kind, playerId, name: p.name, amount: totalBetAmount })
    this.broadcast({ type: "player-action", playerId, action: "raise", amount: totalBetAmount })
    this.advanceAction()
  }

  handleAllIn(playerId: string) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p || p.chips <= 0) return

    const allInAmount = p.chips
    const newBet = p.currentBet + allInAmount
    const highestBet = getHighestBet(this.state)

    p.chips = 0
    p.totalBetThisHand += allInAmount
    this.state.pot += allInAmount
    p.allIn = true

    if (newBet > highestBet) {
      const raiseBy = newBet - highestBet
      if (raiseBy >= this.state.minRaise) {
        this.state.minRaise = raiseBy
      }
      this.state.lastRaiseAmount = raiseBy
      this.state.lastAggressorIndex = p.seatIndex
      this.state.actedThisRound = new Set([playerId])
    } else {
      this.state.actedThisRound.add(playerId)
    }

    p.currentBet = newBet
    p.lastAction = { kind: "all-in", amount: newBet }
    this.addLog({ kind: "all-in", playerId, name: p.name, amount: newBet })

    this.broadcast({ type: "player-action", playerId, action: "all-in", amount: allInAmount })

    const active = getActivePlayers(this.state)
    if (active.length === 1) {
      this.closeHandByFold()
      return
    }

    this.advanceAction()
  }

  advanceAction() {
    if (!this.state) return
    const s = this.state

    const activeNotAllIn = getActiveNotAllInPlayers(s)
    const highestBet = getHighestBet(s)

    // Everyone is all-in or folded: run the board out street by street
    if (activeNotAllIn.length === 0) {
      this.closeRound()
      return
    }

    if (activeNotAllIn.length === 1) {
      const sole = activeNotAllIn[0]
      // If this sole player's bet matches the highest, the round is over
      if (sole.currentBet >= highestBet && s.actedThisRound.has(sole.id)) {
        this.closeRound()
        return
      }
    }

    // Check if all active non-all-in players have acted and bets match
    const allActed = activeNotAllIn.every((p) => s.actedThisRound.has(p.id))
    const allMatched = activeNotAllIn.every((p) => p.currentBet === highestBet)

    if (allActed && allMatched) {
      this.closeRound()
      return
    }

    // Find next player to act (who hasn't acted or whose bet doesn't match)
    const startIdx = s.currentPlayerIndex
    let nextIdx = nextCanActSeatIndex(s, startIdx)

    if (nextIdx === -1) {
      this.closeRound()
      return
    }

    // If the next player already acted and bet matches, the round is over
    const nextPlayer = s.players[s.seatOrder[nextIdx]]
    if (nextPlayer && s.actedThisRound.has(nextPlayer.id) && nextPlayer.currentBet === highestBet) {
      // Check if ALL active non-all-in have matching bets and acted
      if (allMatched && allActed) {
        this.closeRound()
        return
      }
      // Otherwise keep looking
      let found = false
      let searchIdx = nextIdx
      for (let i = 0; i < s.seatOrder.length; i++) {
        searchIdx = nextCanActSeatIndex(s, searchIdx)
        if (searchIdx === -1 || searchIdx === nextIdx) break
        const sp = s.players[s.seatOrder[searchIdx]]
        if (sp && (!s.actedThisRound.has(sp.id) || sp.currentBet < highestBet)) {
          nextIdx = searchIdx
          found = true
          break
        }
      }
      if (!found) {
        this.closeRound()
        return
      }
    }

    this.startTurn(nextIdx)
    this.broadcastState()
  }

  /** Sweep the bets into the pot and deal the next street (or go to showdown after the river). */
  dealStreet() {
    if (!this.state) return
    const s = this.state

    for (const id of s.seatOrder) {
      const p = s.players[id]
      if (p) {
        p.currentBet = 0
        p.lastAction = null
      }
    }
    s.actedThisRound = new Set()
    s.lastAggressorIndex = -1
    s.minRaise = s.settings.smallBlind * 2

    if (getActivePlayers(s).length <= 1) {
      this.awardFoldWin()
      return
    }
    if (s.bettingRound === "river" || s.bettingRound === "showdown") {
      this.revealShowdown()
      return
    }

    const count = s.bettingRound === "pre-flop" ? 3 : 1
    s.bettingRound = s.bettingRound === "pre-flop" ? "flop" : s.bettingRound === "flop" ? "turn" : "river"
    const cards = s.deck.slice(0, count)
    s.deck = s.deck.slice(count)
    s.communityCards = [...s.communityCards, ...cards]
    this.addLog({ kind: "street", round: s.bettingRound, cards })

    this.broadcast({
      type: "community-cards",
      cards: s.communityCards,
      round: s.bettingRound,
    })

    // First to act is left of dealer (post-flop). Nobody bets when at most one player still can.
    const nextIdx = nextCanActSeatIndex(s, s.dealerIndex)
    if (nextIdx === -1 || getActiveNotAllInPlayers(s).length <= 1) {
      this.schedule("street", RUNOUT_PAUSE_MS)
    } else {
      this.startTurn(nextIdx)
    }
    this.broadcastState()
  }

  /** Turn the remaining hands face up, then pay out after a pause so everyone can read them. */
  revealShowdown() {
    if (!this.state) return
    const s = this.state

    s.bettingRound = "showdown"
    const active = getActivePlayers(s)
    s.showdownPlayers = active.map((p) => p.id)

    const reveals = active
      .filter((p) => p.holeCards.length === 2 && s.communityCards.length >= 5)
      .map((p) => ({ id: p.id, holeCards: p.holeCards, handResult: evaluateBestHand(p.holeCards, s.communityCards) }))
    for (const reveal of reveals) {
      this.addLog({ kind: "show", playerId: reveal.id, name: s.players[reveal.id].name, cards: reveal.holeCards, hand: reveal.handResult.description })
    }
    this.broadcast({ type: "showdown", players: reveals })

    this.schedule("award", SHOWDOWN_PAUSE_MS)
    this.broadcastState()
  }

  awardShowdown() {
    if (!this.state) return
    const s = this.state
    const active = getActivePlayers(s)

    const handResults: { playerId: string; result: HandResult }[] = []
    for (const p of active) {
      if (p.holeCards.length === 2 && s.communityCards.length >= 5) {
        handResults.push({ playerId: p.id, result: evaluateBestHand(p.holeCards, s.communityCards) })
      }
    }

    // Calculate pots
    const contributions: PotContribution[] = s.seatOrder.map((id) => {
      const p = s.players[id]
      return {
        playerId: id,
        amount: p ? p.totalBetThisHand : 0,
        folded: p ? p.folded : true,
        allIn: p ? p.allIn : false,
      }
    })

    const pots = calculatePots(contributions)
    const winners: WinnerInfo[] = []

    for (let pi = 0; pi < pots.length; pi++) {
      const pot = pots[pi]
      const eligibleHands = handResults.filter((h) => pot.eligiblePlayerIds.includes(h.playerId))

      if (eligibleHands.length === 0) {
        // No eligible hand evaluated - give to first eligible player
        const winnerId = pot.eligiblePlayerIds.find((id) => s.players[id])
        if (winnerId) {
          s.players[winnerId].chips += pot.amount
          winners.push({
            playerId: winnerId,
            playerName: s.players[winnerId].name,
            amount: pot.amount,
            handResult: null,
            potIndex: pi,
          })
        }
        continue
      }

      eligibleHands.sort((a, b) => compareHands(b.result, a.result))

      const bestHand = eligibleHands[0]
      const potWinners = eligibleHands.filter((h) => compareHands(h.result, bestHand.result) === 0)

      const share = Math.floor(pot.amount / potWinners.length)
      const remainder = pot.amount - share * potWinners.length

      for (let i = 0; i < potWinners.length; i++) {
        const w = potWinners[i]
        const amount = share + (i === 0 ? remainder : 0)
        s.players[w.playerId].chips += amount
        winners.push({
          playerId: w.playerId,
          playerName: s.players[w.playerId].name,
          amount,
          handResult: w.result,
          potIndex: pi,
        })
      }
    }

    this.finishHand(winners)
  }

  awardFoldWin() {
    if (!this.state) return
    const s = this.state
    const winner = getActivePlayers(s)[0]
    if (!winner) {
      this.finishHand([])
      return
    }
    winner.chips += s.pot
    this.finishHand([{
      playerId: winner.id,
      playerName: winner.name,
      amount: s.pot,
      handResult: null,
      potIndex: 0,
    }])
  }

  finishHand(winners: WinnerInfo[]) {
    if (!this.state) return
    const s = this.state

    this.room.storage.deleteAlarm()
    s.pending = null
    s.turnDeadline = null
    s.currentPlayerIndex = -1
    s.handInProgress = false
    s.bettingRound = "showdown"
    s.winners = winners
    s.pot = 0
    for (const id of s.seatOrder) {
      const p = s.players[id]
      if (p) p.currentBet = 0
    }
    for (const w of winners) {
      this.addLog({ kind: "win", playerId: w.playerId, name: w.playerName, amount: w.amount, hand: w.handResult?.description })
    }

    const playersWithChips = s.seatOrder.filter((id) => s.players[id]?.chips > 0)
    if (playersWithChips.length <= 1) {
      s.status = "finished"
    } else if (!s.autoDealPaused) {
      this.schedule("next-hand", NEXT_HAND_MS)
    }

    this.broadcast({ type: "hand-over", winners })
    this.broadcastState()
  }

  // ─── Bots ────────────────────────────────────────────────────────────────

  /** Rough 0..1 strength of a bot's hand, counting draws while cards are still to come. */
  botStrength(p: Player): number {
    const s = this.state!
    const [a, b] = p.holeCards
    const hi = Math.max(a % 13, b % 13)
    const lo = Math.min(a % 13, b % 13)
    const suited = Math.floor(a / 13) === Math.floor(b / 13)

    if (s.communityCards.length < 3) {
      if (hi === lo) return 0.5 + (hi / 12) * 0.5
      const gap = hi - lo
      return Math.min(0.95, ((hi + lo) / 24) * 0.6 + (suited ? 0.08 : 0) + (gap <= 1 ? 0.06 : gap === 2 ? 0.03 : 0) + (hi === 12 ? 0.1 : 0))
    }

    const result = evaluateBestHand(p.holeCards, s.communityCards)
    const holeRanks = [a % 13, b % 13]
    let strength: number
    switch (result.category) {
      case HandCategory.HighCard:
        strength = 0.08 + (hi / 12) * 0.1
        break
      case HandCategory.OnePair: {
        // A pair that lives only on the board belongs to everyone.
        const pairRank = result.ranks[0]
        if (!holeRanks.includes(pairRank)) strength = 0.12 + (hi / 12) * 0.08
        else {
          const boardTop = Math.max(...s.communityCards.map((card) => card % 13))
          strength = pairRank >= boardTop ? 0.55 + (pairRank / 12) * 0.1 : 0.38 + (pairRank / 12) * 0.08
        }
        break
      }
      case HandCategory.TwoPair:
        strength = holeRanks.some((rank) => result.ranks.slice(0, 2).includes(rank)) ? 0.72 : 0.3
        break
      case HandCategory.ThreeOfAKind:
        strength = holeRanks.includes(result.ranks[0]) ? 0.8 : 0.4
        break
      case HandCategory.Straight:
        strength = 0.84
        break
      case HandCategory.Flush:
        strength = 0.88
        break
      case HandCategory.FullHouse:
        strength = 0.94
        break
      default:
        strength = 0.99
    }

    if (s.communityCards.length < 5 && strength < 0.6) {
      const all = [...p.holeCards, ...s.communityCards]
      const suitCounts = [0, 0, 0, 0]
      for (const card of all) suitCounts[Math.floor(card / 13)]++
      const flushDraw = suitCounts.some((count, suit) => count === 4 && p.holeCards.some((card) => Math.floor(card / 13) === suit))
      const ranks = new Set(all.map((card) => card % 13))
      if (ranks.has(12)) ranks.add(-1)
      let straightDraw = false
      for (let start = -1; start <= 8; start++) {
        let run = 0
        for (let r = start; r < start + 5; r++) if (ranks.has(r)) run++
        if (run === 4) straightDraw = true
      }
      if (flushDraw) strength = Math.max(strength, 0.42)
      if (straightDraw) strength = Math.max(strength, flushDraw ? 0.5 : 0.36)
    }
    return strength
  }

  botAct(p: Player) {
    const s = this.state!
    const highest = getHighestBet(s)
    const toCall = Math.min(highest - p.currentBet, p.chips)
    const bigBlind = s.settings.smallBlind * 2
    const potOdds = toCall > 0 ? toCall / (s.pot + toCall) : 0
    const strength = Math.min(1, this.botStrength(p) + (Math.random() - 0.5) * 0.12)
    const maxTotal = p.currentBet + p.chips

    const raiseTo = (fraction: number) => {
      const target = highest + Math.max(s.minRaise, Math.round(((s.pot + toCall) * fraction) / bigBlind) * bigBlind)
      if (target >= maxTotal || toCall >= p.chips) {
        // Only shove for real when the hand is worth the whole stack.
        if (strength > 0.8 || maxTotal <= highest + s.minRaise) this.handleAllIn(p.id)
        else if (toCall > 0) this.handleCall(p.id)
        else this.handleCheck(p.id)
        return
      }
      this.handleRaise(p.id, target)
    }

    // Monsters raise, sometimes slow-playing with a call.
    if (strength > 0.8) {
      if (toCall > 0 && Math.random() < 0.25) this.handleCall(p.id)
      else raiseTo(0.6 + Math.random() * 0.5)
      return
    }

    if (toCall === 0) {
      const bluff = Math.random() < 0.1
      if ((strength > 0.55 && Math.random() < 0.7) || bluff) raiseTo(0.4 + Math.random() * 0.3)
      else this.handleCheck(p.id)
      return
    }

    // Strong hands push back on small bets; everything else weighs the price.
    if (strength > 0.62 && toCall < p.chips * 0.4 && Math.random() < 0.35) {
      raiseTo(0.5 + Math.random() * 0.4)
      return
    }
    const cheap = toCall <= bigBlind && s.bettingRound === "pre-flop"
    if (strength >= potOdds + 0.12 || (cheap && strength > 0.25) || (strength > 0.45 && toCall <= bigBlind * 2)) {
      if (toCall >= p.chips && strength < 0.6) this.handleFold(p.id)
      else if (toCall >= p.chips) this.handleAllIn(p.id)
      else this.handleCall(p.id)
      return
    }
    this.handleFold(p.id)
  }

  // ─── Party.Server Methods ───────────────────────────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const gameNight = await validateGameNightConnection(this.room, conn, ctx, "poker")
    if (gameNight.mode === "invalid") {
      this.send(conn, { type: "error", message: "Invalid Game Night connection" })
      conn.close(1008, "Invalid Game Night connection")
      return
    }
    if (gameNight.mode === "game-night") this.gameNightMembers.set(conn, gameNight.member)
    const isHost = gameNight.mode === "game-night"
      ? gameNight.member.isHost
      : url.searchParams.get("host") === "true"
    const playerToken = url.searchParams.get("playerToken") || ""
    if (playerToken) this.connectionTokens.set(conn, playerToken)

    const startingChips = parseInt(url.searchParams.get("startingChips") || "1000", 10)
    const smallBlind = parseInt(url.searchParams.get("smallBlind") || "10", 10)
    const blindIncrease = parseInt(url.searchParams.get("blindIncrease") || "0", 10)
    const turnTimeLimit = parseInt(url.searchParams.get("turnTimeLimit") || "0", 10)

    if (isHost && !this.state) {
      this.state = {
        roomCode: this.room.id,
        hostId: conn.id,
        players: {},
        seatOrder: [],
        status: "waiting",
        settings: {
          startingChips: Math.max(100, Math.min(10000, startingChips)),
          smallBlind: Math.max(1, Math.min(500, smallBlind)),
          blindIncrease: Math.max(0, Math.min(50, blindIncrease)),
          turnTimeLimit: Math.max(0, Math.min(120, turnTimeLimit)),
        },
        deck: [],
        communityCards: [],
        bettingRound: "pre-flop",
        pot: 0,
        currentPlayerIndex: 0,
        dealerIndex: 0,
        smallBlindIndex: 0,
        bigBlindIndex: 0,
        lastRaiseAmount: 0,
        minRaise: 0,
        handNumber: 0,
        lastAggressorIndex: -1,
        actedThisRound: new Set(),
        winners: [],
        showdownPlayers: [],
        handInProgress: false,
        playerTokens: {},
        pending: null,
        turnDeadline: null,
        log: [],
        logSeq: 0,
        autoDealPaused: false,
      }
      await this.saveState()
    }

    if (!this.state) {
      this.send(conn, { type: "error", message: "Game not found" })
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) {
      this.send(sender, { type: "error", message: "Game not found. Please try rejoining." })
      return
    }

    try {
      const data: ClientMessage = JSON.parse(message)

      if (data.type !== "join" && !this.isAuthenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }

      switch (data.type) {
        case "join": {
		  const playerToken = this.connectionTokens.get(sender)
		  if (!playerToken) {
			this.send(sender, { type: "error", message: "Invalid player session" })
			return
		  }
		  const name = this.gameNightMembers.get(sender)?.name ?? data.name
		  const returningPlayer = this.state.players[sender.id]
		  const expectedToken = this.state.playerTokens[sender.id]
		  if (returningPlayer && expectedToken !== playerToken) {
			this.send(sender, { type: "error", message: "Invalid player session" })
			return
		  }
          if (this.state.status === "playing" && !this.state.players[sender.id]) {
            this.send(sender, { type: "error", message: "Game already in progress" })
            return
          }

          if (this.state.seatOrder.length >= 8 && !this.state.players[sender.id]) {
            this.send(sender, { type: "error", message: "Game is full (max 8 players)" })
            return
          }

          // Reconnection
          if (this.state.players[sender.id]) {
			this.state.playerTokens[sender.id] = playerToken
            this.state.players[sender.id].connected = true
            this.state.players[sender.id].name = name
            await this.saveState()
            this.broadcastState()
            return
          }

          const seatIndex = this.state.seatOrder.length
          const player: Player = {
            id: sender.id,
            name,
            chips: this.state.settings.startingChips,
            holeCards: [],
            currentBet: 0,
            totalBetThisHand: 0,
            folded: false,
            allIn: false,
            connected: true,
            seatIndex,
            isDealer: false,
            lastAction: null,
          }

          this.state.players[sender.id] = player
          this.state.seatOrder.push(sender.id)
		  this.state.playerTokens[sender.id] = playerToken

          await this.saveState()

          const publicPlayer: PublicPlayer = {
            ...player,
            hasCards: false,
            holeCards: null,
          }
          this.broadcast({ type: "player-joined", player: publicPlayer })
          this.broadcastState()
          break
        }

        case "start-game": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can start the game" })
            return
          }

          for (const player of Object.values(this.state.players)) {
            if (!player.connected) {
              delete this.state.players[player.id]
              delete this.state.playerTokens[player.id]
            }
          }
          this.state.seatOrder = this.state.seatOrder.filter((id) => this.state!.players[id])
          this.state.seatOrder.forEach((id, index) => {
            this.state!.players[id].seatIndex = index
          })

          if (this.state.seatOrder.length < 2) {
            this.send(sender, { type: "error", message: "Need at least 2 players" })
            return
          }

          if (this.state.status === "playing" && this.state.handInProgress) {
            this.send(sender, { type: "error", message: "Hand already in progress" })
            return
          }

          this.state.status = "playing"
          this.state.dealerIndex = this.state.seatOrder.length - 1 // Will advance to 0 in startNewHand
          this.startNewHand()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "add-bot": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only the host can add bots" })
            return
          }
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (this.state.seatOrder.length >= 8) {
            this.send(sender, { type: "error", message: "Game is full (max 8 players)" })
            return
          }
          const taken = new Set(Object.values(this.state.players).map((player) => player.name))
          const id = `bot-${crypto.randomUUID().slice(0, 8)}`
          this.state.players[id] = {
            id,
            name: BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? `Bot ${this.state.seatOrder.length + 1}`,
            chips: this.state.settings.startingChips,
            holeCards: [],
            currentBet: 0,
            totalBetThisHand: 0,
            folded: false,
            allIn: false,
            connected: true,
            seatIndex: this.state.seatOrder.length,
            isDealer: false,
            lastAction: null,
            isBot: true,
          }
          this.state.seatOrder.push(id)
          await this.saveState()
          this.broadcastState()
          break
        }

        case "remove-bot": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only the host can remove bots" })
            return
          }
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          if (!this.state.players[data.playerId]?.isBot) {
            this.send(sender, { type: "error", message: "Only bots can be removed" })
            return
          }
          delete this.state.players[data.playerId]
          this.state.seatOrder = this.state.seatOrder.filter((id) => id !== data.playerId)
          this.state.seatOrder.forEach((id, index) => {
            this.state!.players[id].seatIndex = index
          })
          await this.saveState()
          this.broadcastState()
          break
        }

        case "fold": {
          if (!this.state.handInProgress) return
          const currentId = this.state.seatOrder[this.state.currentPlayerIndex]
          if (sender.id !== currentId) {
            this.send(sender, { type: "error", message: "Not your turn" })
            return
          }
          this.handleFold(sender.id)
          await this.saveState()
          break
        }

        case "check": {
          if (!this.state.handInProgress) return
          const currentId = this.state.seatOrder[this.state.currentPlayerIndex]
          if (sender.id !== currentId) {
            this.send(sender, { type: "error", message: "Not your turn" })
            return
          }
          const highestBet = getHighestBet(this.state)
          const player = this.state.players[sender.id]
          if (player && player.currentBet < highestBet) {
            this.send(sender, { type: "error", message: "Cannot check, must call or fold" })
            return
          }
          this.handleCheck(sender.id)
          await this.saveState()
          break
        }

        case "call": {
          if (!this.state.handInProgress) return
          const currentId = this.state.seatOrder[this.state.currentPlayerIndex]
          if (sender.id !== currentId) {
            this.send(sender, { type: "error", message: "Not your turn" })
            return
          }
          this.handleCall(sender.id)
          await this.saveState()
          break
        }

        case "raise": {
          if (!this.state.handInProgress) return
          const currentId = this.state.seatOrder[this.state.currentPlayerIndex]
          if (sender.id !== currentId) {
            this.send(sender, { type: "error", message: "Not your turn" })
            return
          }
          this.handleRaise(sender.id, data.amount)
          await this.saveState()
          break
        }

        case "all-in": {
          if (!this.state.handInProgress) return
          const currentId = this.state.seatOrder[this.state.currentPlayerIndex]
          if (sender.id !== currentId) {
            this.send(sender, { type: "error", message: "Not your turn" })
            return
          }
          this.handleAllIn(sender.id)
          await this.saveState()
          break
        }

        case "next-hand": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can start next hand" })
            return
          }
          if (this.state.handInProgress) {
            this.send(sender, { type: "error", message: "Hand still in progress" })
            return
          }
          if (this.state.status === "finished") {
            this.state.status = "playing"
            this.state.handNumber = 0
            for (const id of this.state.seatOrder) {
              const p = this.state.players[id]
              if (p) p.chips = this.state.settings.startingChips
            }
            this.state.dealerIndex = this.state.seatOrder.length - 1
          }
          this.startNewHand()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "toggle-auto-deal": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only host can pause dealing" })
            return
          }
          const s = this.state
          s.autoDealPaused = !s.autoDealPaused
          if (s.autoDealPaused && s.pending?.step === "next-hand") {
            s.pending = null
            this.room.storage.deleteAlarm()
          } else if (!s.autoDealPaused && !s.handInProgress && !s.pending && s.status === "playing" && s.handNumber > 0) {
            this.schedule("next-hand", NEXT_HAND_MS)
          }
          await this.saveState()
          this.broadcastState()
          break
        }

        case "leave": {
          const leavingPlayer = this.state.players[sender.id]

          if (leavingPlayer && this.state.handInProgress && !leavingPlayer.folded && leavingPlayer.holeCards.length > 0) {
            leavingPlayer.folded = true
            const active = getActivePlayers(this.state)
            if (active.length === 1) {
              this.closeHandByFold()
            } else if (this.state.seatOrder[this.state.currentPlayerIndex] === sender.id) {
              // It was their turn, advance
              this.advanceAction()
            }
          }

          delete this.state.players[sender.id]
          delete this.state.playerTokens[sender.id]
          this.state.seatOrder = this.state.seatOrder.filter((id) => id !== sender.id)

		  if (!this.state.seatOrder.some((id) => !this.state!.players[id]?.isBot)) {
			this.state = null
			await this.room.storage.delete("state")
			await this.room.storage.deleteAlarm()
			return
		  }

          // Reassign seat indices
          this.state.seatOrder.forEach((id, i) => {
            if (this.state!.players[id]) {
              this.state!.players[id].seatIndex = i
            }
          })

          // Fix indices that might be out of bounds after removal
          if (this.state.seatOrder.length > 0) {
            this.state.dealerIndex = Math.min(this.state.dealerIndex, this.state.seatOrder.length - 1)
            this.state.smallBlindIndex = Math.min(this.state.smallBlindIndex, this.state.seatOrder.length - 1)
            this.state.bigBlindIndex = Math.min(this.state.bigBlindIndex, this.state.seatOrder.length - 1)
            this.state.currentPlayerIndex = Math.min(this.state.currentPlayerIndex, this.state.seatOrder.length - 1)
          }

          // Transfer host
          if (sender.id === this.state.hostId) {
            const nextHost = this.state.seatOrder.find((id) => !this.state!.players[id]?.isBot)
            if (nextHost) this.state.hostId = nextHost
          }

          await this.saveState()
          this.broadcast({ type: "player-left", playerId: sender.id })
          this.broadcastState()
          break
        }
      }
    } catch (e) {
      console.error("Error processing message:", e)
    }
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
    if (!player || !this.isAuthenticated(conn)) return

    player.connected = false

    // If it's their turn, set a timeout to auto-fold
    if (
      this.state.handInProgress &&
      this.state.seatOrder[this.state.currentPlayerIndex] === conn.id
    ) {
      const foldAt = Date.now() + DISCONNECT_FOLD_MS
      this.room.storage.setAlarm(this.state.turnDeadline ? Math.min(this.state.turnDeadline, foldAt) : foldAt)
    }

    await this.saveState()
    this.broadcastState()
	this.connectionTokens.delete(conn)
  }

  async onAlarm() {
    const s = this.state
    if (!s) return

    if (s.pending) {
      if (Date.now() < s.pending.at - 50) {
        await this.room.storage.setAlarm(s.pending.at)
        return
      }
      const { step } = s.pending
      s.pending = null
      if (step === "street") this.dealStreet()
      else if (step === "award") this.awardShowdown()
      else if (step === "fold-win") this.awardFoldWin()
      else {
        this.startNewHand()
        this.broadcastState()
      }
      await this.saveState()
      return
    }

    if (!s.handInProgress) return
    const currentId = s.seatOrder[s.currentPlayerIndex]
    if (!currentId) return
    const player = s.players[currentId]
    if (!player) return

    if (player.isBot) {
      this.botAct(player)
      await this.saveState()
      return
    }

    const timedOut = s.turnDeadline !== null && Date.now() >= s.turnDeadline - 250
    if (timedOut || !player.connected) {
      if (timedOut) this.addLog({ kind: "timeout", playerId: currentId, name: player.name })
      this.handleFold(currentId)
      await this.saveState()
    } else if (s.turnDeadline) {
      await this.room.storage.setAlarm(s.turnDeadline)
    }
  }

  async onRequest(request: Party.Request) {
    try {
      const match = await getGameNightResultMatch(this.room, request, "poker")
      if (!match) return new Response("Not found", { status: 404 })
      const finished = this.state?.status === "finished"
      const remaining = finished ? Object.values(this.state!.players) : []
      const highestChips = remaining.length > 0 ? Math.max(...remaining.map((player) => player.chips)) : null
      const winnerIds = highestChips === null
        ? []
        : remaining.filter((player) => player.chips === highestChips).map((player) => player.id)
      return Response.json({ finished, scored: true, winnerIds })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
}

export default withRoomCleanup(PokerParty, "poker")
