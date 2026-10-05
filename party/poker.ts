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
import { isBotLevel, type BotLevel } from "../src/lib/botLevel"
import { isReaction, pickReaction, takeReactionSlot, type Reaction, type ReactionMessage } from "../src/lib/reactions"
import {
  getGameNightResultMatch,
  validateGameNightConnection,
  type GameNightMember,
} from "./shared/gameNight"
import { JoinVerifier, reportDirectResult } from "./shared/account"
import { clearSpectators, dropSpectator, MAX_SPECTATORS, publicSpectators, type PublicSpectator, type Spectator } from "./shared/spectators"

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
  kind: "hand" | "blinds-up" | "rebuy" | "sit-out" | "sit-in" | "sb" | "bb" | "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "street" | "show" | "muck" | "win" | "timeout"
  playerId?: string
  name?: string
  amount?: number
  allIn?: boolean
  round?: BettingRound
  cards?: number[]
  hand?: string
}

const LOG_LIMIT = 40
const HISTORY_LIMIT = 20
/** Log kinds that belong to a hand's history. */
const HAND_EVENT_KINDS = new Set<PokerLogEntry["kind"]>(["sb", "bb", "fold", "check", "call", "bet", "raise", "all-in", "street", "show", "muck", "win", "timeout"])
const DEAL_MS = 1500
const ROUND_PAUSE_MS = 1100
const RUNOUT_PAUSE_MS = 1800
const SHOWDOWN_PAUSE_MS = 2400
const FOLD_WIN_PAUSE_MS = 900
/** Showdown pause when a beaten player still has to choose between showing and mucking. */
const SHOWDOWN_DECIDE_MS = 5000
/** How long a fold winner may choose to show their cards. */
const SHOW_WINDOW_MS = 5000
/** Time to read the result before the next hand deals itself. */
const NEXT_HAND_MS = 6000
const DISCONNECT_FOLD_MS = 10000
/** Bots take a human-looking beat to think. */
const BOT_THINK_MS = 1300
const BOT_THINK_JITTER_MS = 1100
/** A short beat before dealing once a rebuy or sit-in makes a hand possible again. */
const RESUME_DEAL_MS = 2000
/** Bots react once a hand's winnings have swept to the winner. */
const BOT_REACT_MS = 1100
/** A pot of at least this many big blinds gets a reaction. */
const BIG_POT_BLINDS = 20
const BOT_NAMES = ["Ace", "Maverick", "Lucky", "Duchess", "Slim", "Rosie", "Tex", "Vegas"]

export interface PokerSettings {
  startingChips: number
  smallBlind: number
  blindIncrease: number
  turnTimeLimit: number
  rebuys: boolean
  /** Rebuys allowed per player; 0 means unlimited. */
  rebuyCap: number
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
  botLevel?: BotLevel
  rebuys: number
  sittingOut: boolean
  /** Server-only: the verified account behind this seat. */
  userId?: string
}

export interface WinnerInfo {
  playerId: string
  playerName: string
  amount: number
  handResult: HandResult | null
  potIndex: number
}

/** A hand as the server remembers it. Hole cards stay private until shown. */
export interface HandRecord {
  handNumber: number
  done: boolean
  players: { id: string; name: string; startChips: number; isDealer: boolean; holeCards: number[]; shown: number[] }[]
  board: number[]
  events: PokerLogEntry[]
  winners: { playerId: string; playerName: string; amount: number; potIndex: number; hand?: string }[]
}

export interface PublicHandRecord {
  handNumber: number
  /** Hole cards by position; null for a card the viewer never saw. */
  players: { id: string; name: string; startChips: number; isDealer: boolean; cards: (number | null)[] }[]
  board: number[]
  /** Street events carry the pot at the start of that street in `amount`. */
  events: PokerLogEntry[]
  winners: HandRecord["winners"]
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
  /** Hole card indices a fold winner chose to show. */
  shownCards: Record<string, number[]>
  /** The fold winner's window to show their cards. */
  showOffer: { playerId: string; until: number } | null
  /** Beaten players at showdown who may still muck instead of showing. */
  muckable: string[]
  /** The last hands, oldest first; the newest may still be in play. */
  history: HandRecord[]
  /** People who joined mid-game; the host can seat them between hands. */
  spectators?: Record<string, Spectator>
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
  botLevel?: BotLevel
  rebuys: number
  sittingOut: boolean
  /** Cards shown voluntarily, by hole card position; null for a card kept hidden. */
  shownCards: (number | null)[] | null
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
  showOffer: { playerId: string; until: number } | null
  muckable: string[]
  spectators: PublicSpectator[]
}

export type ClientMessage =
  | { type: "join"; name: string; authToken?: unknown }
  | { type: "leave" }
  | { type: "start-game" }
  | { type: "add-bot" }
  | { type: "remove-bot"; playerId: string }
  | { type: "set-bot-level"; playerId: string; level: BotLevel }
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "all-in" }
  | { type: "next-hand" }
  | { type: "toggle-auto-deal" }
  | { type: "set-rebuys"; enabled: boolean; cap: number }
  | { type: "rebuy" }
  | { type: "toggle-sit-out" }
  | { type: "end-game" }
  | { type: "show-cards"; cards: number[] }
  | { type: "muck" }
  | { type: "react"; reaction: Reaction }
  | { type: "seat-spectator"; playerId: string }

export type ServerMessage =
  | { type: "state"; state: PublicGameState }
  | { type: "player-joined"; player: PublicPlayer }
  | { type: "player-left"; playerId: string }
  | { type: "player-action"; playerId: string; action: string; amount?: number }
  | { type: "community-cards"; cards: number[]; round: BettingRound }
  | { type: "showdown"; players: { id: string; holeCards: number[]; handResult: HandResult }[] }
  | { type: "hand-over"; winners: WinnerInfo[] }
  | { type: "history"; hands: PublicHandRecord[] }
  | { type: "error"; message: string }
  | ReactionMessage

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

/** Can be dealt into the next hand. */
function isDealable(p: Player): boolean {
  return p.chips > 0 && !p.sittingOut
}

function canRebuy(settings: PokerSettings, p: { chips: number; rebuys: number }): boolean {
  return settings.rebuys && p.chips <= 0 && (settings.rebuyCap === 0 || p.rebuys < settings.rebuyCap)
}

/** Chips won or lost against everything the player bought in for. */
function netResult(settings: PokerSettings, p: { chips: number; rebuys: number }): number {
  return p.chips - settings.startingChips * (1 + p.rebuys)
}

// ─── Server ──────────────────────────────────────────────────────────────────

class PokerParty implements Party.Server {
  constructor(readonly room: Party.Room) {
    this.joins = new JoinVerifier(room)
  }
  joins: JoinVerifier

  state: GameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  /** Bumped whenever a finished hand's record changes; each connection gets it once per version. */
  historyVersion = 0
  historySent = new WeakMap<Party.Connection, number>()
  reactedAt = new Map<string, number>()

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
        parsed.shownCards ??= {}
        parsed.showOffer ??= null
        parsed.muckable ??= []
        parsed.history ??= []
        clearSpectators(parsed)
        parsed.settings.rebuys ??= false
        parsed.settings.rebuyCap ??= 0
        for (const player of Object.values(parsed.players) as Player[]) {
          player.lastAction ??= null
          player.rebuys ??= 0
          player.sittingOut ??= false
        }
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
      const shown = s.shownCards[id]

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
        botLevel: p.isBot ? p.botLevel ?? "normal" : undefined,
        rebuys: p.rebuys,
        sittingOut: p.sittingOut,
        shownCards: shown?.length ? [0, 1].map((index) => (shown.includes(index) ? p.holeCards[index] ?? null : null)) : null,
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
      showOffer: s.showOffer,
      muckable: s.muckable,
      spectators: publicSpectators(s.spectators),
    }
  }

  getPublicHistory(playerId: string): PublicHandRecord[] {
    return this.state!.history.filter((hand) => hand.done).map((hand) => ({
      handNumber: hand.handNumber,
      players: hand.players.map(({ holeCards, shown, ...rest }) => ({
        ...rest,
        cards: holeCards.map((card, index) => (rest.id === playerId || shown.includes(index) ? card : null)),
      })),
      board: hand.board,
      events: hand.events,
      winners: hand.winners,
    }))
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
      if (!this.isAuthenticated(conn)) continue
      try {
        if (this.historySent.get(conn) !== this.historyVersion) {
          this.historySent.set(conn, this.historyVersion)
          this.send(conn, { type: "history", hands: this.getPublicHistory(conn.id) })
        }
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

  react(playerId: string, reaction: Reaction, delayMs?: number) {
    if (!takeReactionSlot(this.reactedAt, playerId)) return
    this.broadcast({ type: "reaction", playerId, reaction, ...(delayMs ? { delayMs } : {}) })
  }

  /** Bots now and then react to a big pot: the winner gloats, a beaten (or watching) bot tips its hat or groans. */
  botReactToPot(winners: WinnerInfo[], showdown: boolean) {
    const s = this.state!
    const pot = winners.reduce((sum, w) => sum + w.amount, 0)
    if (pot < BIG_POT_BLINDS * s.settings.smallBlind * 2) return
    if (!Object.values(s.players).some((p) => !p.isBot && p.connected)) return
    const winnerIds = new Set(winners.map((w) => w.playerId))
    const botWinner = winners.map((w) => s.players[w.playerId]).find((p) => p?.isBot)
    if (botWinner && Math.random() < 0.6) this.react(botWinner.id, pickReaction(["🔥", "😂"]), BOT_REACT_MS)
    const bots = s.seatOrder.map((id) => s.players[id]).filter((p): p is Player => Boolean(p?.isBot) && !winnerIds.has(p!.id))
    const beaten = showdown ? bots.filter((p) => !p.folded && p.holeCards.length === 2) : []
    const loser = beaten[Math.floor(Math.random() * beaten.length)]
    if (loser && Math.random() < 0.6) {
      this.react(loser.id, pickReaction(loser.chips <= 0 ? ["GG", "😤"] : ["😤", "😱", "Nice hand"]), BOT_REACT_MS + 500)
    } else if (!botWinner && bots.length && Math.random() < 0.4) {
      this.react(bots[Math.floor(Math.random() * bots.length)]!.id, pickReaction(["Nice hand", "👏", "😱"]), BOT_REACT_MS + 500)
    }
  }

  // ─── Game Logic ──────────────────────────────────────────────────────────

  addLog(entry: Omit<PokerLogEntry, "id">) {
    const s = this.state!
    s.logSeq += 1
    s.log = [...s.log, { ...entry, id: s.logSeq }].slice(-LOG_LIMIT)
    const hand = this.currentHandRecord()
    if (hand && HAND_EVENT_KINDS.has(entry.kind)) hand.events.push({ ...entry, id: s.logSeq })
  }

  /** The record of the hand being played or just played, if any. */
  currentHandRecord(): HandRecord | null {
    const s = this.state!
    const hand = s.history.at(-1)
    return hand && hand.handNumber === s.handNumber ? hand : null
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

    // Busted bots buy back in on their own when the table allows it
    for (const id of s.seatOrder) {
      const p = s.players[id]
      if (p?.isBot && canRebuy(s.settings, p)) this.rebuy(p)
    }

    // Count players who can be dealt in (have chips, not sitting out)
    const aliveSeatIndices: number[] = []
    for (let i = 0; i < s.seatOrder.length; i++) {
      const p = s.players[s.seatOrder[i]]
      if (p && isDealable(p)) {
        aliveSeatIndices.push(i)
      }
    }

    if (aliveSeatIndices.length < 2) {
      // Nobody left who could still play ends the game; otherwise wait for a rebuy or a sit-in.
      if (this.isGameOver()) this.finishGame()
      s.handInProgress = false
      s.pending = null
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
    s.shownCards = {}
    s.showOffer = null
    s.muckable = []
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
        p.folded = !isDealable(p)  // deal out busted and sitting-out players
        p.allIn = false
        p.isDealer = false
        p.lastAction = null
      }
    }

    // Advance dealer using alive-player logic (no holeCards check)
    s.dealerIndex = nextAliveSeatIndex(s, s.dealerIndex)
    const dealer = s.players[s.seatOrder[s.dealerIndex]]
    if (dealer) dealer.isDealer = true

    s.history = [...s.history, {
      handNumber: s.handNumber,
      done: false,
      players: s.seatOrder
        .map((id) => s.players[id])
        .filter((p) => p && !p.folded)
        .map((p) => ({ id: p.id, name: p.name, startChips: p.chips, isDealer: p.isDealer, holeCards: [], shown: [] })),
      board: [],
      events: [],
      winners: [],
    }].slice(-HISTORY_LIMIT)

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
    for (const seat of this.currentHandRecord()!.players) seat.holeCards = s.players[seat.id].holeCards

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

  /** Ends the game; the best net result wins, so rebuys don't count as winnings. */
  finishGame() {
    const s = this.state
    if (!s || s.status === "finished") return
    s.status = "finished"
    const players = Object.values(s.players)
    const net = (player: Player) => netResult(s.settings, player)
    const best = Math.max(...players.map(net))
    void reportDirectResult(this.room, {
      resultId: `poker:${s.roomCode}:${Date.now()}`,
      game: "poker",
      vsBot: players.some((player) => player.isBot),
      players: players.map((player) => ({ userId: player.userId, won: net(player) === best })),
    })
  }

  /** The game ends once fewer than two players have chips or could still buy back in. */
  isGameOver(): boolean {
    const s = this.state!
    const live = s.seatOrder.filter((id) => {
      const p = s.players[id]
      return p && (p.chips > 0 || canRebuy(s.settings, p))
    })
    return live.length < 2
  }

  rebuy(p: Player) {
    const s = this.state!
    p.chips = s.settings.startingChips
    p.rebuys += 1
    this.addLog({ kind: "rebuy", playerId: p.id, name: p.name, amount: p.chips })
  }

  /** At least two players would be dealt in (busted bots rebuy at the deal). */
  readyToDeal(): boolean {
    const s = this.state!
    return s.seatOrder.filter((id) => {
      const p = s.players[id]
      return p && (isDealable(p) || (p.isBot && canRebuy(s.settings, p)))
    }).length >= 2
  }

  /** Between hands with enough players again: deal soon, unless the host paused dealing. */
  resumeDealing() {
    const s = this.state!
    if (s.status !== "playing" || s.handInProgress || s.pending || s.autoDealPaused || s.handNumber === 0) return
    if (this.readyToDeal()) this.schedule("next-hand", RESUME_DEAL_MS)
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
    // The history notes the pot each street starts with; the live log doesn't need it.
    const streetEvent = this.currentHandRecord()?.events.at(-1)
    if (streetEvent?.kind === "street") streetEvent.amount = s.pot

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

  /**
   * Turn the winning hands face up. Beaten players may muck instead: bots decide on the spot,
   * people get a few seconds and show by default. Pay out after a pause so everyone can read them.
   */
  revealShowdown() {
    if (!this.state) return
    const s = this.state

    s.bettingRound = "showdown"
    s.showdownPlayers = []
    s.muckable = []
    const winnerIds = new Set(this.showdownWinners().map((w) => w.playerId))
    for (const p of getActivePlayers(s)) {
      if (winnerIds.has(p.id) || p.holeCards.length !== 2) this.revealHand(p)
      else if (p.isBot && Math.random() < 0.6) this.muckHand(p)
      else if (p.isBot) this.revealHand(p)
      else s.muckable.push(p.id)
    }

    const deciding = s.muckable.some((id) => s.players[id]?.connected)
    this.schedule("award", deciding ? SHOWDOWN_DECIDE_MS : SHOWDOWN_PAUSE_MS)
    this.broadcastState()
  }

  revealHand(p: Player) {
    const s = this.state!
    s.showdownPlayers.push(p.id)
    s.muckable = s.muckable.filter((id) => id !== p.id)
    const seat = this.currentHandRecord()?.players.find((entry) => entry.id === p.id)
    if (seat) seat.shown = [0, 1]
    if (p.holeCards.length !== 2 || s.communityCards.length < 5) return
    const handResult = evaluateBestHand(p.holeCards, s.communityCards)
    this.addLog({ kind: "show", playerId: p.id, name: p.name, cards: p.holeCards, hand: handResult.description })
    this.broadcast({ type: "showdown", players: [{ id: p.id, holeCards: p.holeCards, handResult }] })
  }

  muckHand(p: Player) {
    const s = this.state!
    s.muckable = s.muckable.filter((id) => id !== p.id)
    this.addLog({ kind: "muck", playerId: p.id, name: p.name })
  }

  awardShowdown() {
    if (!this.state) return
    const s = this.state
    // Anyone who didn't choose shows their hand
    for (const id of [...s.muckable]) {
      const p = s.players[id]
      if (p) this.revealHand(p)
    }
    s.muckable = []
    const winners = this.showdownWinners()
    for (const w of winners) s.players[w.playerId].chips += w.amount
    this.finishHand(winners)
    this.botReactToPot(winners, true)
  }

  /** Who takes each pot at showdown. Doesn't move any chips. */
  showdownWinners(): WinnerInfo[] {
    const s = this.state!
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
        winners.push({
          playerId: w.playerId,
          playerName: s.players[w.playerId].name,
          amount,
          handResult: w.result,
          potIndex: pi,
        })
      }
    }

    return winners
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
    const winners: WinnerInfo[] = [{ playerId: winner.id, playerName: winner.name, amount: s.pot, handResult: null, potIndex: 0 }]
    this.finishHand(winners)
    this.botReactToPot(winners, false)

    // The winner may show their cards; bots now and then show off a bluff.
    if (s.status !== "playing" || winner.holeCards.length !== 2) return
    if (winner.isBot) {
      if (this.botStrength(winner) < 0.3 && Math.random() < 0.35) this.showCards(winner, [0, 1])
    } else {
      s.showOffer = { playerId: winner.id, until: Date.now() + SHOW_WINDOW_MS }
    }
    this.broadcastState()
  }

  /** Turn some of a fold winner's hole cards face up for the table. */
  showCards(p: Player, indices: number[]) {
    const s = this.state!
    const already = s.shownCards[p.id] ?? []
    const fresh = [...new Set(indices)].filter((index) => (index === 0 || index === 1) && !already.includes(index)).sort()
    if (fresh.length === 0) return
    const all = [...already, ...fresh]
    s.shownCards[p.id] = all
    const seat = this.currentHandRecord()?.players.find((entry) => entry.id === p.id)
    if (seat) {
      seat.shown = all
      this.historyVersion += 1
    }
    if (all.length === 2) s.showOffer = null
    const hand = all.length === 2 && s.communityCards.length >= 3 ? evaluateBestHand(p.holeCards, s.communityCards).description : undefined
    this.addLog({ kind: "show", playerId: p.id, name: p.name, cards: fresh.map((index) => p.holeCards[index]), hand })
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
    const hand = this.currentHandRecord()
    if (hand) {
      hand.done = true
      hand.board = s.communityCards
      hand.winners = winners.map((w) => ({ playerId: w.playerId, playerName: w.playerName, amount: w.amount, potIndex: w.potIndex, hand: w.handResult?.description }))
      this.historyVersion += 1
    }

    if (this.isGameOver()) {
      this.finishGame()
    } else if (!s.autoDealPaused && this.readyToDeal()) {
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

  /**
   * Bet up to `amount` on top of the highest bet, in big-blind steps. When that would take the
   * whole stack, only shove for real with a hand stronger than `shoveAt`.
   */
  botRaise(p: Player, strength: number, amount: number, shoveAt: number) {
    const s = this.state!
    const highest = getHighestBet(s)
    const toCall = Math.min(highest - p.currentBet, p.chips)
    const bigBlind = s.settings.smallBlind * 2
    const maxTotal = p.currentBet + p.chips
    const target = highest + Math.max(s.minRaise, Math.round(amount / bigBlind) * bigBlind)
    if (target >= maxTotal || toCall >= p.chips) {
      if (strength > shoveAt || maxTotal <= highest + s.minRaise) this.handleAllIn(p.id)
      else if (toCall > 0) this.handleCall(p.id)
      else this.handleCheck(p.id)
      return
    }
    this.handleRaise(p.id, target)
  }

  /** 0 for the first to act after the dealer, 1 for the button, among players still in the hand. */
  botLateness(p: Player): number {
    const s = this.state!
    const n = s.seatOrder.length
    const live: string[] = []
    for (let i = 1; i <= n; i++) {
      const other = s.players[s.seatOrder[(s.dealerIndex + i) % n]]
      if (other && !other.folded && other.holeCards.length > 0) live.push(other.id)
    }
    return live.length <= 1 ? 1 : Math.max(0, live.indexOf(p.id)) / (live.length - 1)
  }

  botAct(p: Player) {
    if (p.botLevel === "easy") return this.botActEasy(p)
    if (p.botLevel === "hard") return this.botActHard(p)
    const s = this.state!
    const highest = getHighestBet(s)
    const toCall = Math.min(highest - p.currentBet, p.chips)
    const bigBlind = s.settings.smallBlind * 2
    const potOdds = toCall > 0 ? toCall / (s.pot + toCall) : 0
    const strength = Math.min(1, this.botStrength(p) + (Math.random() - 0.5) * 0.12)
    const raiseTo = (fraction: number) => this.botRaise(p, strength, (s.pot + toCall) * fraction, 0.8)

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

  /** A loose calling station: misreads its hand, chases anything, bets random sizes and sometimes folds for free. */
  botActEasy(p: Player) {
    const s = this.state!
    const highest = getHighestBet(s)
    const toCall = Math.min(highest - p.currentBet, p.chips)
    const strength = Math.max(0, Math.min(1, this.botStrength(p) + (Math.random() - 0.5) * 0.4))
    const raiseTo = (fraction: number) => this.botRaise(p, strength, (s.pot + toCall) * fraction, 0.55)

    if (toCall === 0) {
      if (Math.random() < 0.04) this.handleFold(p.id)
      else if (strength > 0.75 || Math.random() < 0.2) raiseTo(0.25 + Math.random() * 1.2)
      else this.handleCheck(p.id)
      return
    }
    if (strength > 0.85 && Math.random() < 0.6) {
      raiseTo(0.3 + Math.random() * 1.2)
      return
    }
    if (toCall >= p.chips) {
      if (strength > 0.45 || Math.random() < 0.2) this.handleAllIn(p.id)
      else this.handleFold(p.id)
      return
    }
    if (strength > 0.2 || Math.random() < 0.5) this.handleCall(p.id)
    else this.handleFold(p.id)
  }

  /**
   * Tight and positional: opens fewer hands up front and more on the button, sizes bets to the
   * pot and the hand, bluffs rarely and only heads-up in position, and lets marginal hands go to big bets.
   */
  botActHard(p: Player) {
    const s = this.state!
    const highest = getHighestBet(s)
    const toCall = Math.min(highest - p.currentBet, p.chips)
    const bigBlind = s.settings.smallBlind * 2
    const pot = s.pot + toCall
    const potOdds = toCall > 0 ? toCall / pot : 0
    const late = this.botLateness(p)
    const opponents = s.seatOrder.filter((id) => id !== p.id && s.players[id] && !s.players[id].folded && s.players[id].holeCards.length > 0).length
    const preflop = s.communityCards.length < 3
    const river = s.communityCards.length === 5
    let strength = Math.min(1, this.botStrength(p) + (Math.random() - 0.5) * 0.05)
    // Medium hands lose value against a crowd.
    if (!preflop && strength < 0.8) strength -= 0.04 * Math.max(0, opponents - 1)
    const stackShare = toCall / Math.max(1, p.chips + p.currentBet)
    const bet = (amount: number) => this.botRaise(p, strength, amount, 0.85)

    if (preflop) {
      const openAt = 0.64 - late * 0.16
      if (highest <= bigBlind) {
        // Unopened or limped: raise to about three big blinds plus one per limper, else see it cheaply from the blinds.
        const limpers = s.seatOrder.filter((id) => id !== p.id && !s.players[id]?.folded && s.players[id]?.currentBet === highest).length
        if (strength >= openAt) bet(bigBlind * (2 + Math.max(0, limpers - 1)))
        else if (toCall === 0) this.handleCheck(p.id)
        else if (p.currentBet > 0 && strength >= openAt - 0.1) this.handleCall(p.id)
        else this.handleFold(p.id)
        return
      }
      // Facing a raise: re-raise the best, call with hands that can stand the price, fold the rest.
      if (strength >= 0.8) {
        bet(highest * 2)
        return
      }
      if (toCall >= p.chips) {
        if (strength >= 0.75) this.handleAllIn(p.id)
        else this.handleFold(p.id)
        return
      }
      if (strength >= 0.58 - late * 0.06 + stackShare * 0.5) this.handleCall(p.id)
      else this.handleFold(p.id)
      return
    }

    if (toCall === 0) {
      if (strength >= 0.7) bet(pot * (0.6 + Math.random() * 0.15))
      else if (strength >= 0.5 && (late >= 0.5 || opponents <= 1) && Math.random() < 0.6) bet(pot * (0.4 + Math.random() * 0.1))
      // Semi-bluff a draw from late position.
      else if (!river && strength >= 0.36 && late >= 0.5 && Math.random() < 0.4) bet(pot * 0.5)
      else if (opponents === 1 && late === 1 && Math.random() < 0.08) bet(pot * 0.5)
      else this.handleCheck(p.id)
      return
    }

    if (strength >= 0.85) {
      if (!river && toCall < p.chips && Math.random() < 0.2) this.handleCall(p.id)
      else bet(toCall * 1.5 + pot * 0.5)
      return
    }
    if (toCall >= p.chips) {
      if (strength >= 0.72) this.handleAllIn(p.id)
      else this.handleFold(p.id)
      return
    }
    if (strength >= 0.7 && stackShare < 0.5 && Math.random() < 0.3) {
      bet(toCall * 1.5 + pot * 0.5)
      return
    }
    const needs = stackShare > 0.5 ? 0.7 : potOdds + 0.05
    // Draws still have cards to come, so they can call a fair price.
    const drawing = !river && strength >= 0.36 && strength < 0.55 && potOdds <= 0.3
    if (strength >= needs || drawing) this.handleCall(p.id)
    else this.handleFold(p.id)
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
          rebuys: false,
          rebuyCap: 0,
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
        shownCards: {},
        showOffer: null,
        muckable: [],
        history: [],
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
      if (data.type !== "join") await this.joins.settled(sender)
      if (!this.state) return

      if (data.type !== "join" && !this.isAuthenticated(sender)) {
        this.send(sender, { type: "error", message: "Invalid player session" })
        return
      }

      // Spectators only watch: the one thing they can do besides joining is leave.
      if (data.type !== "join" && this.state.spectators?.[sender.id]) {
        if (data.type === "leave") {
          dropSpectator(this.state, sender.id)
          await this.saveState()
          this.broadcastState()
        }
        return
      }

      switch (data.type) {
        case "join": {
		  const playerToken = this.connectionTokens.get(sender)
		  if (!playerToken) {
			this.send(sender, { type: "error", message: "Invalid player session" })
			return
		  }
		  const account = await this.joins.verify(sender, data.authToken)
		  if (!this.state) return
		  const name = this.gameNightMembers.get(sender)?.name ?? account?.displayName ?? data.name
		  const returningPlayer = this.state.players[sender.id]
		  const expectedToken = this.state.playerTokens[sender.id]
		  if (returningPlayer && expectedToken !== playerToken) {
			this.send(sender, { type: "error", message: "Invalid player session" })
			return
		  }
          const watching = this.state.spectators?.[sender.id]
          if (watching) {
            if (expectedToken !== playerToken) {
              this.send(sender, { type: "error", message: "Invalid player session" })
              return
            }
            // A verified player keeps their profile name even if a later join comes without a token.
            if (account || !watching.userId) watching.name = name
            if (account) watching.userId = account.userId
            await this.saveState()
            this.broadcastState()
            return
          }
          if (this.state.status === "playing" && !this.state.players[sender.id]) {
            this.state.spectators ??= {}
            if (Object.keys(this.state.spectators).length >= MAX_SPECTATORS) {
              this.send(sender, { type: "error", message: "Too many people are watching" })
              return
            }
            this.state.spectators[sender.id] = { id: sender.id, name, joinedAt: Date.now(), userId: account?.userId }
            this.state.playerTokens[sender.id] = playerToken
            await this.saveState()
            this.broadcastState()
            return
          }

          if (this.state.seatOrder.length >= 8 && !this.state.players[sender.id]) {
            this.send(sender, { type: "error", message: "Game is full (max 8 players)" })
            return
          }

          // Reconnection
          if (this.state.players[sender.id]) {
			this.state.playerTokens[sender.id] = playerToken
            const returning = this.state.players[sender.id]
            returning.connected = true
            if (account || !returning.userId) returning.name = name
            if (account) returning.userId = account.userId
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
            rebuys: 0,
            sittingOut: false,
            userId: account?.userId,
          }

          this.state.players[sender.id] = player
          this.state.seatOrder.push(sender.id)
		  this.state.playerTokens[sender.id] = playerToken

          await this.saveState()

          const publicPlayer: PublicPlayer = {
            ...player,
            hasCards: false,
            holeCards: null,
            shownCards: null,
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

        case "seat-spectator": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only the host can seat spectators" })
            return
          }
          if (this.state.handInProgress) {
            this.send(sender, { type: "error", message: "Seat them once this hand is over" })
            return
          }
          const spectator = this.state.spectators?.[data.playerId]
          if (!spectator) {
            this.send(sender, { type: "error", message: "They're no longer watching" })
            return
          }
          if (this.state.seatOrder.length >= 8) {
            this.send(sender, { type: "error", message: "No empty seats" })
            return
          }
          delete this.state.spectators![spectator.id]
          this.state.players[spectator.id] = {
            id: spectator.id,
            name: spectator.name,
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
            rebuys: 0,
            sittingOut: false,
            userId: spectator.userId,
          }
          this.state.seatOrder.push(spectator.id)
          this.resumeDealing()
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
            botLevel: "normal",
            rebuys: 0,
            sittingOut: false,
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

        case "set-bot-level": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only the host can change bots" })
            return
          }
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          const bot = this.state.players[data.playerId]
          if (!bot?.isBot || !isBotLevel(data.level)) return
          bot.botLevel = data.level
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
            this.state.history = []
            this.historyVersion += 1
            for (const id of this.state.seatOrder) {
              const p = this.state.players[id]
              if (p) {
                p.chips = this.state.settings.startingChips
                p.rebuys = 0
                p.sittingOut = false
              }
            }
            this.state.dealerIndex = this.state.seatOrder.length - 1
          }
          if (!this.readyToDeal() && !this.isGameOver()) {
            this.send(sender, { type: "error", message: "Waiting for players to rebuy or sit back in" })
            return
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
          } else if (!s.autoDealPaused && !s.handInProgress && !s.pending && s.status === "playing" && s.handNumber > 0 && this.readyToDeal()) {
            this.schedule("next-hand", NEXT_HAND_MS)
          }
          await this.saveState()
          this.broadcastState()
          break
        }

        case "set-rebuys": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only the host can change rebuys" })
            return
          }
          if (this.state.status !== "waiting") {
            this.send(sender, { type: "error", message: "Game already started" })
            return
          }
          const cap = Math.floor(Number(data.cap))
          this.state.settings.rebuys = Boolean(data.enabled)
          this.state.settings.rebuyCap = Number.isFinite(cap) ? Math.max(0, Math.min(20, cap)) : 0
          await this.saveState()
          this.broadcastState()
          break
        }

        case "rebuy": {
          const p = this.state.players[sender.id]
          if (!p || this.state.status !== "playing") return
          if (this.state.handInProgress && p.holeCards.length > 0 && !p.folded) {
            this.send(sender, { type: "error", message: "Wait for the hand to finish" })
            return
          }
          if (!canRebuy(this.state.settings, p)) {
            this.send(sender, { type: "error", message: this.state.settings.rebuys && p.chips <= 0 ? "No rebuys left" : "Rebuys aren't available" })
            return
          }
          this.rebuy(p)
          this.resumeDealing()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "toggle-sit-out": {
          const p = this.state.players[sender.id]
          if (!p || this.state.status !== "playing") return
          // Takes effect from the next deal; a hand already dealt to them plays out.
          p.sittingOut = !p.sittingOut
          this.addLog({ kind: p.sittingOut ? "sit-out" : "sit-in", playerId: p.id, name: p.name })
          if (!p.sittingOut) this.resumeDealing()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "end-game": {
          if (sender.id !== this.state.hostId) {
            this.send(sender, { type: "error", message: "Only the host can end the game" })
            return
          }
          if (this.state.status !== "playing" || this.state.handInProgress) {
            this.send(sender, { type: "error", message: "Wait for the hand to finish" })
            return
          }
          this.finishGame()
          this.state.pending = null
          await this.room.storage.deleteAlarm()
          await this.saveState()
          this.broadcastState()
          break
        }

        case "show-cards": {
          const p = this.state.players[sender.id]
          if (!p || !Array.isArray(data.cards)) return
          if (this.state.muckable.includes(sender.id)) {
            this.revealHand(p)
          } else if (this.state.showOffer?.playerId === sender.id && Date.now() <= this.state.showOffer.until && !this.state.handInProgress) {
            this.showCards(p, data.cards)
          } else {
            return
          }
          await this.saveState()
          this.broadcastState()
          break
        }

        case "react": {
          if (!this.state.players[sender.id] || !isReaction(data.reaction)) return
          this.react(sender.id, data.reaction)
          break
        }

        case "muck": {
          const p = this.state.players[sender.id]
          if (!p || !this.state.muckable.includes(sender.id)) return
          this.muckHand(p)
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

    if (this.isAuthenticated(conn) && dropSpectator(this.state, conn.id)) {
      await this.saveState()
      this.broadcastState()
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
      // Rank by net result so rebuys don't count as winnings
      const net = (player: Player) => netResult(this.state!.settings, player)
      const best = remaining.length > 0 ? Math.max(...remaining.map(net)) : null
      const winnerIds = best === null
        ? []
        : remaining.filter((player) => net(player) === best).map((player) => player.id)
      const vsBot = Object.values(this.state?.players ?? {}).some((player) => player.isBot)
      return Response.json({ finished, scored: true, winnerIds, vsBot })
    } catch {
      return new Response("Not found", { status: 404 })
    }
  }
}

export default withRoomCleanup(PokerParty, "poker")
