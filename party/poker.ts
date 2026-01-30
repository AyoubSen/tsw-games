import type * as Party from "partykit/server"
import {
  createDeck,
  shuffleDeck,
  evaluateBestHand,
  compareHands,
  type HandResult,
} from "../src/lib/poker/handEvaluator"
import { calculatePots, type PotContribution } from "../src/lib/poker/potCalculator"

// ─── Types ───────────────────────────────────────────────────────────────────

export type GamePhase = "waiting" | "playing" | "finished"
export type BettingRound = "pre-flop" | "flop" | "turn" | "river" | "showdown"

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
}

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "leave" }
  | { type: "start-game" }
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "all-in" }
  | { type: "next-hand" }

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

export default class PokerParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  state: GameState | null = null

  async onStart() {
    const stored = await this.room.storage.get<string>("state")
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        parsed.actedThisRound = new Set(parsed.actedThisRound || [])
        this.state = parsed
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
    }
  }

  broadcastState() {
    if (!this.state) return
    for (const conn of this.room.getConnections()) {
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
      s.settings.smallBlind = Math.min(s.settings.smallBlind * 2, Math.floor(s.settings.startingChips / 2))
    }

    s.handNumber++
    s.winners = []
    s.showdownPlayers = []
    s.communityCards = []
    s.bettingRound = "pre-flop"
    s.pot = 0
    s.handInProgress = true
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

    // Post blinds
    this.postBlind(s.seatOrder[s.smallBlindIndex], s.settings.smallBlind)
    this.postBlind(s.seatOrder[s.bigBlindIndex], s.settings.smallBlind * 2)

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

    // Set first to act: left of big blind for pre-flop
    s.currentPlayerIndex = nextCanActSeatIndex(s, s.bigBlindIndex)
    if (s.currentPlayerIndex === -1) {
      // Everyone is all-in, run out the board
      this.runOutBoard()
      return
    }

    // Set turn timer
    if (s.settings.turnTimeLimit > 0) {
      this.room.storage.setAlarm(Date.now() + s.settings.turnTimeLimit * 1000)
    }
  }

  postBlind(playerId: string, amount: number) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    const actualAmount = Math.min(amount, p.chips)
    p.chips -= actualAmount
    p.currentBet += actualAmount      // accumulate (handles SB then BB on same player in heads-up edge cases)
    p.totalBetThisHand += actualAmount // accumulate
    this.state.pot += actualAmount

    if (p.chips === 0) {
      p.allIn = true
    }
  }

  handleFold(playerId: string) {
    if (!this.state) return
    const p = this.state.players[playerId]
    if (!p) return

    p.folded = true
    this.state.actedThisRound.add(playerId)

    this.broadcast({ type: "player-action", playerId, action: "fold" })

    const active = getActivePlayers(this.state)
    if (active.length === 1) {
      this.winByFold(active[0])
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
    this.broadcast({ type: "player-action", playerId, action: "call", amount: callAmount })

    const active = getActivePlayers(this.state)
    if (active.length === 1) {
      this.winByFold(active[0])
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

    this.broadcast({ type: "player-action", playerId, action: "all-in", amount: allInAmount })

    const active = getActivePlayers(this.state)
    if (active.length === 1) {
      this.winByFold(active[0])
      return
    }

    this.advanceAction()
  }

  advanceAction() {
    if (!this.state) return
    const s = this.state

    const activeNotAllIn = getActiveNotAllInPlayers(s)
    const highestBet = getHighestBet(s)

    // If nobody or only 1 player can still act, advance or run out
    if (activeNotAllIn.length === 0) {
      // Everyone is all-in or folded
      if (getActivePlayers(s).length > 1) {
        this.runOutBoard()
      } else {
        this.advanceBettingRound()
      }
      return
    }

    if (activeNotAllIn.length === 1) {
      const sole = activeNotAllIn[0]
      // If this sole player's bet matches the highest, the round is over
      if (sole.currentBet >= highestBet && s.actedThisRound.has(sole.id)) {
        if (getActivePlayers(s).length > 1 && getActivePlayers(s).some((p) => p.allIn)) {
          // Others are all-in - check if bets match, then advance
          this.advanceBettingRound()
        } else {
          this.advanceBettingRound()
        }
        return
      }
    }

    // Check if all active non-all-in players have acted and bets match
    const allActed = activeNotAllIn.every((p) => s.actedThisRound.has(p.id))
    const allMatched = activeNotAllIn.every((p) => p.currentBet === highestBet)

    if (allActed && allMatched) {
      this.advanceBettingRound()
      return
    }

    // Find next player to act (who hasn't acted or whose bet doesn't match)
    const startIdx = s.currentPlayerIndex
    let nextIdx = nextCanActSeatIndex(s, startIdx)

    if (nextIdx === -1) {
      this.advanceBettingRound()
      return
    }

    // If the next player already acted and bet matches, the round is over
    const nextPlayer = s.players[s.seatOrder[nextIdx]]
    if (nextPlayer && s.actedThisRound.has(nextPlayer.id) && nextPlayer.currentBet === highestBet) {
      // Check if ALL active non-all-in have matching bets and acted
      if (allMatched && allActed) {
        this.advanceBettingRound()
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
        this.advanceBettingRound()
        return
      }
    }

    s.currentPlayerIndex = nextIdx

    // Reset turn timer
    this.room.storage.deleteAlarm()
    if (s.settings.turnTimeLimit > 0) {
      this.room.storage.setAlarm(Date.now() + s.settings.turnTimeLimit * 1000)
    }

    this.broadcastState()
  }

  advanceBettingRound() {
    if (!this.state) return
    const s = this.state

    // Reset bets for new round
    for (const id of s.seatOrder) {
      const p = s.players[id]
      if (p) p.currentBet = 0
    }
    s.actedThisRound = new Set()
    s.lastAggressorIndex = -1
    s.minRaise = s.settings.smallBlind * 2

    const active = getActivePlayers(s)
    if (active.length <= 1) {
      if (active.length === 1) {
        this.winByFold(active[0])
      }
      return
    }

    switch (s.bettingRound) {
      case "pre-flop":
        s.bettingRound = "flop"
        s.communityCards = [s.deck[0], s.deck[1], s.deck[2]]
        s.deck = s.deck.slice(3)
        break
      case "flop":
        s.bettingRound = "turn"
        s.communityCards.push(s.deck[0])
        s.deck = s.deck.slice(1)
        break
      case "turn":
        s.bettingRound = "river"
        s.communityCards.push(s.deck[0])
        s.deck = s.deck.slice(1)
        break
      case "river":
        this.goToShowdown()
        return
      default:
        return
    }

    this.broadcast({
      type: "community-cards",
      cards: s.communityCards,
      round: s.bettingRound,
    })

    // First to act is left of dealer (post-flop)
    const nextIdx = nextCanActSeatIndex(s, s.dealerIndex)
    if (nextIdx === -1) {
      this.runOutBoard()
      return
    }
    s.currentPlayerIndex = nextIdx

    this.room.storage.deleteAlarm()
    if (s.settings.turnTimeLimit > 0) {
      this.room.storage.setAlarm(Date.now() + s.settings.turnTimeLimit * 1000)
    }

    this.broadcastState()
  }

  runOutBoard() {
    if (!this.state) return
    const s = this.state

    while (s.communityCards.length < 5 && s.deck.length > 0) {
      s.communityCards.push(s.deck[0])
      s.deck = s.deck.slice(1)
    }

    s.bettingRound = "showdown"
    this.goToShowdown()
  }

  goToShowdown() {
    if (!this.state) return
    const s = this.state

    this.room.storage.deleteAlarm()
    s.bettingRound = "showdown"
    s.handInProgress = false

    const active = getActivePlayers(s)

    // Deal remaining community cards if needed
    while (s.communityCards.length < 5 && s.deck.length > 0) {
      s.communityCards.push(s.deck[0])
      s.deck = s.deck.slice(1)
    }

    // Evaluate hands
    const handResults: { playerId: string; result: HandResult }[] = []
    for (const p of active) {
      if (p.holeCards.length === 2 && s.communityCards.length >= 5) {
        const result = evaluateBestHand(p.holeCards, s.communityCards)
        handResults.push({ playerId: p.id, result })
      }
    }

    // Show all active players' cards
    s.showdownPlayers = active.map((p) => p.id)

    this.broadcast({
      type: "showdown",
      players: handResults.map((h) => ({
        id: h.playerId,
        holeCards: s.players[h.playerId].holeCards,
        handResult: h.result,
      })),
    })

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
        if (pot.eligiblePlayerIds.length > 0) {
          const winnerId = pot.eligiblePlayerIds[0]
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

    s.winners = winners
    s.pot = 0

    this.broadcast({ type: "hand-over", winners })
    this.broadcastState()

    const playersWithChips = s.seatOrder.filter((id) => s.players[id]?.chips > 0)
    if (playersWithChips.length <= 1) {
      s.status = "finished"
    }
  }

  winByFold(winner: Player) {
    if (!this.state) return
    const s = this.state

    this.room.storage.deleteAlarm()
    s.handInProgress = false
    s.bettingRound = "showdown"

    winner.chips += s.pot
    s.winners = [{
      playerId: winner.id,
      playerName: winner.name,
      amount: s.pot,
      handResult: null,
      potIndex: 0,
    }]
    s.pot = 0

    this.broadcast({ type: "hand-over", winners: s.winners })
    this.broadcastState()

    const playersWithChips = s.seatOrder.filter((id) => s.players[id]?.chips > 0)
    if (playersWithChips.length <= 1) {
      s.status = "finished"
    }
  }

  // ─── Party.Server Methods ───────────────────────────────────────────────

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const isHost = url.searchParams.get("host") === "true"

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
      }
      await this.saveState()
    }

    // Handle reconnection
    if (this.state && this.state.players[conn.id]) {
      this.state.players[conn.id].connected = true
      await this.saveState()
    }

    if (this.state) {
      this.send(conn, { type: "state", state: this.getPublicState(conn.id) })
    } else {
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

      switch (data.type) {
        case "join": {
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
            this.state.players[sender.id].connected = true
            this.state.players[sender.id].name = data.name
            await this.saveState()
            this.broadcastState()
            return
          }

          const seatIndex = this.state.seatOrder.length
          const player: Player = {
            id: sender.id,
            name: data.name,
            chips: this.state.settings.startingChips,
            holeCards: [],
            currentBet: 0,
            totalBetThisHand: 0,
            folded: false,
            allIn: false,
            connected: true,
            seatIndex,
            isDealer: false,
          }

          this.state.players[sender.id] = player
          this.state.seatOrder.push(sender.id)

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

        case "leave": {
          const leavingPlayer = this.state.players[sender.id]

          if (leavingPlayer && this.state.handInProgress && !leavingPlayer.folded && leavingPlayer.holeCards.length > 0) {
            leavingPlayer.folded = true
            const active = getActivePlayers(this.state)
            if (active.length === 1) {
              this.winByFold(active[0])
            } else if (this.state.seatOrder[this.state.currentPlayerIndex] === sender.id) {
              // It was their turn, advance
              this.advanceAction()
            }
          }

          delete this.state.players[sender.id]
          this.state.seatOrder = this.state.seatOrder.filter((id) => id !== sender.id)

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
            const remaining = this.state.seatOrder
            if (remaining.length > 0) {
              this.state.hostId = remaining[0]
            }
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

    const player = this.state.players[conn.id]
    if (!player) return

    player.connected = false

    // If it's their turn, set a timeout to auto-fold
    if (
      this.state.handInProgress &&
      this.state.seatOrder[this.state.currentPlayerIndex] === conn.id
    ) {
      this.room.storage.setAlarm(Date.now() + 10000)
    }

    // Transfer host
    if (conn.id === this.state.hostId) {
      const connected = this.state.seatOrder.filter(
        (id) => this.state!.players[id]?.connected
      )
      if (connected.length > 0) {
        this.state.hostId = connected[0]
      }
    }

    await this.saveState()
    this.broadcastState()
  }

  async onAlarm() {
    if (!this.state || !this.state.handInProgress) return

    const currentId = this.state.seatOrder[this.state.currentPlayerIndex]
    if (!currentId) return

    const player = this.state.players[currentId]
    if (!player) return

    if (!player.connected || this.state.settings.turnTimeLimit > 0) {
      this.handleFold(currentId)
      await this.saveState()
    }
  }
}
