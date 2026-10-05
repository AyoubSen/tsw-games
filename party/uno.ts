import type * as Party from "partykit/server"
import { withRoomCleanup } from "./shared/cleanup"
import type { GameNightGameId } from "../src/lib/gameNight"
import {
  canJumpInUno,
  canPlayUnoTurn,
  createUnoDeck,
  DEFAULT_UNO_RULES,
  isUnoColor,
  isUnoNumberCard,
  isUnoRule,
  parseUnoCardId,
  shuffleUnoCards,
  UNO_COLORS,
  type UnoCard,
  type UnoColor,
  type UnoRules,
} from "../src/lib/uno"
import { isBotLevel, type BotLevel } from "../src/lib/botLevel"
import { isReaction, pickReaction, takeReactionSlot, type Reaction, type ReactionMessage } from "../src/lib/reactions"
import { canControlGame, markConnected, markDisconnected, nextHost, presentCount } from "./shared/presence"
import { getGameNightResultMatch, validateGameNightConnection, type GameNightMember } from "./shared/gameNight"
import { clearSpectators, dropSpectator, MAX_SPECTATORS, publicSpectators, type PublicSpectator, type Spectator } from "./shared/spectators"

const UNO_GAME_ID = "uno" as GameNightGameId
const PLAYER_TTL_MS = 30 * 60 * 1000
const DISCONNECT_GRACE_MS = 15_000
/** Pause after the table finishes replaying the last action, before a bot moves. */
const BOT_THINK_MS = 700
/** Bots jump in a little before the next bot would move. */
const BOT_JUMP_MS = 350
/** Chance a bot challenges a +4 it can't stack on. */
const BOT_CHALLENGE_ODDS = 0.35
/** Chance an easy bot forgets to call UNO. */
const EASY_BOT_FORGETS_UNO = 0.4
const BOT_NAMES = ["Ada", "Baxter", "Cleo", "Dodge", "Echo", "Fern", "Gus"]

export interface UnoPlayer {
  id: string
  name: string
  hand: UnoCard[]
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
  isBot?: boolean
  botLevel?: BotLevel
}

export interface PublicUnoPlayer {
  id: string
  name: string
  cardCount: number
  joinedAt: number
  connected?: boolean
  isBot?: boolean
  botLevel?: BotLevel
}

/** What happened, in order, so clients can replay and explain it. Drawn cards are private to the drawer. */
export type UnoAction =
  | { id: number; type: "deal"; playerId: string; name: string; card: UnoCard }
  | {
      id: number
      type: "play"
      playerId: string
      name: string
      card: UnoCard
      color: UnoColor
      cardsLeft: number
      victimId?: string
      victimName?: string
      drawCount?: number
      skippedId?: string
      skippedName?: string
      reversed?: boolean
      unoCalled?: boolean
      /** Stacking/challenge: the +2/+4 total now facing `facingId`, who must stack, challenge or draw it. */
      stack?: number
      facingId?: string
      facingName?: string
      swapId?: string
      swapName?: string
      rotated?: boolean
      jumpIn?: boolean
    }
  | { id: number; type: "draw"; playerId: string; name: string; card?: UnoCard; playable: boolean }
  | { id: number; type: "pass"; playerId: string; name: string }
  | { id: number; type: "timeout"; playerId: string; name: string }
  | { id: number; type: "leave"; playerId: string; name: string }
  | { id: number; type: "catch"; playerId: string; name: string; victimId: string; victimName: string; drawCount: number }
  | { id: number; type: "penalty"; playerId: string; name: string; drawCount: number }
  | { id: number; type: "challenge"; playerId: string; name: string; targetId: string; targetName: string; guilty: boolean; victimId: string; victimName: string; drawCount: number }

type NewUnoAction = UnoAction extends infer A ? A extends UnoAction ? Omit<A, "id"> : never : never

const LOG_LIMIT = 20

export interface UnoGameState {
  roomCode: string
  hostId: string
  players: Record<string, UnoPlayer>
  playerTokens: Record<string, string>
  seatOrder: string[]
  maxPlayers: number
  status: "waiting" | "playing" | "finished"
  deck: UnoCard[]
  discardPile: UnoCard[]
  activeColor: UnoColor | null
  currentPlayerId: string | null
  direction: 1 | -1
  drawnCardId: string | null
  winnerId: string | null
  startedAt: number | null
  finishedAt: number | null
  disconnectedTurnPlayerId?: string | null
  disconnectDeadline?: number | null
  botDeadline?: number | null
  /** Players down to one card who haven't called UNO yet. Others may catch them from `catchableAt` until their next turn. */
  unoExposed?: { playerId: string; catchableAt: number }[]
  rules: UnoRules
  /** +2/+4 total the current player must stack on or draw. */
  pendingDraw: number
  /** The +4 the current player may challenge, and whether it was played legally. */
  pendingChallenge?: { playerId: string; legal: boolean } | null
  /** Who played the top card; they can't jump in on their own card. */
  topPlayerId?: string | null
  /** A bot jump-in scheduled after the given action; `at` is null once it has been tried. */
  botJump?: { actionId: number; at: number | null } | null
  actionSeq: number
  log: UnoAction[]
  /** People who joined mid-game; the host can seat them between hands. */
  spectators?: Record<string, Spectator>
}

export interface PublicUnoGameState {
  roomCode: string
  hostId: string
  players: Record<string, PublicUnoPlayer>
  seatOrder: string[]
  maxPlayers: number
  status: UnoGameState["status"]
  topCard: UnoCard | null
  activeColor: UnoColor | null
  currentPlayerId: string | null
  direction: 1 | -1
  myHand: UnoCard[]
  drawnCardId: string | null
  winnerId: string | null
  startedAt: number | null
  finishedAt: number | null
  deckCount: number
  unoExposedIds: string[]
  rules: UnoRules
  pendingDraw: number
  pendingChallengeBy: string | null
  topPlayerId: string | null
  log: UnoAction[]
  spectators: PublicSpectator[]
}

type ClientAction =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "draw" }
  | { type: "play"; cardId: string; color?: UnoColor; targetId?: string }
  | { type: "pass" }
  | { type: "restart" }
  | { type: "leave" }
  | { type: "add-bot" }
  | { type: "remove-player"; playerId: string }
  | { type: "set-bot-level"; playerId: string; level: BotLevel }
  | { type: "uno" }
  | { type: "catch"; playerId: string }
  | { type: "challenge" }
  | { type: "set-rule"; rule: keyof UnoRules; enabled: boolean }
  | { type: "react"; reaction: Reaction }
  | { type: "seat-spectator"; playerId: string }

export type ServerMessage = { type: "state"; state: PublicUnoGameState } | { type: "error"; message: string } | ReactionMessage

function parseAction(message: string): ClientAction | null {
  let value: unknown
  try { value = JSON.parse(message) } catch { return null }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (data.type === "join") return typeof data.name === "string" ? { type: "join", name: data.name } : null
  if (data.type === "start" || data.type === "draw" || data.type === "pass" || data.type === "restart" || data.type === "leave" || data.type === "add-bot" || data.type === "uno" || data.type === "challenge") return { type: data.type }
  if (data.type === "set-rule") return isUnoRule(data.rule) && typeof data.enabled === "boolean" ? { type: "set-rule", rule: data.rule, enabled: data.enabled } : null
  if (data.type === "react") return isReaction(data.reaction) ? { type: "react", reaction: data.reaction } : null
  if (data.type === "catch") return typeof data.playerId === "string" ? { type: "catch", playerId: data.playerId } : null
  if (data.type === "set-bot-level") return typeof data.playerId === "string" && isBotLevel(data.level) ? { type: "set-bot-level", playerId: data.playerId, level: data.level } : null
  if (data.type === "remove-player") return typeof data.playerId === "string" ? { type: "remove-player", playerId: data.playerId } : null
  if (data.type === "seat-spectator") return typeof data.playerId === "string" ? { type: "seat-spectator", playerId: data.playerId } : null
  if (data.type !== "play" || typeof data.cardId !== "string" || !parseUnoCardId(data.cardId)) return null
  if (data.color !== undefined && !isUnoColor(data.color)) return null
  if (data.targetId !== undefined && typeof data.targetId !== "string") return null
  return { type: "play", cardId: data.cardId, ...(data.color ? { color: data.color } : {}), ...(data.targetId ? { targetId: data.targetId } : {}) }
}

/** How long clients spend replaying an action (see `timeline` in UnoGame), taking the slowest viewer. */
function revealMs(action: UnoAction | undefined): number {
  if (!action) return 0
  if (action.type === "play") {
    const draws = action.drawCount ?? 0
    const settle = draws ? 540 + 300 + (draws - 1) * 150 + 520 + 150 : 540
    const loud = action.card.color === null || action.card.value === "skip" || action.card.value === "reverse" || action.card.value === "draw-two" || action.cardsLeft <= 1 || Boolean(action.swapId || action.rotated || action.jumpIn)
    const release = settle + (loud ? 1500 : 900)
    // A wild also spins the color wheel before its stamp shows.
    return action.card.color === null ? Math.max(release, 540 + 2200) : release
  }
  if (action.type === "draw") return 580 + (action.playable ? 400 : 1500)
  if (action.type === "pass") return 900
  if (action.type === "catch" || action.type === "penalty" || action.type === "challenge") return (Math.max(action.drawCount, 1) - 1) * 150 + 520 + 150 + 1500
  // The opening deal is shown by the hand's 1.6s deal-in, not a replay.
  if (action.type === "deal") return 1600
  return 1400
}

interface BotSwapInfo {
  /** Opponent with the fewest cards, for a 7. */
  fewestId: string
  fewestCount: number
  /** Size of the hand a 0 would pass to the bot. */
  incomingCount: number
}

/** Who is closest to going out, seen from the bot's seat. */
interface BotThreat {
  /** The opponent with the fewest cards plays right after the bot. */
  nextIsLeader: boolean
  /** ...or right before it, so a reverse would hand them the turn. */
  previousIsLeader: boolean
  fewestCount: number
}

/**
 * Plain-colored cards before wilds, punish a short next hand, and keep the color it holds most of.
 * Easy plays any legal card; hard saves its wilds and aims its action cards at whoever is closest to winning.
 */
function chooseBotPlay(hand: UnoCard[], playable: UnoCard[], nextCount: number, swap: BotSwapInfo | null, level: BotLevel = "normal", threat?: BotThreat): { card: UnoCard; color?: UnoColor; targetId?: string } {
  const counts = new Map<UnoColor, number>()
  for (const card of hand) if (card.color) counts.set(card.color, (counts.get(card.color) ?? 0) + 1)
  if (level === "easy") {
    const card = playable[Math.floor(Math.random() * playable.length)]!
    if (card.color) return { card, ...(swap && card.value === "7" && { targetId: swap.fewestId }) }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return { card, color: best && Math.random() < 0.5 ? best : UNO_COLORS[Math.floor(Math.random() * UNO_COLORS.length)]! }
  }
  const attack = (card: UnoCard) => card.value === "skip" || card.value === "reverse" || card.value === "draw-two" || card.value === "wild-draw-four"
  const hardScore = (card: UnoCard) => {
    if (level !== "hard" || !threat) return 0
    let bonus = 0
    // Wilds always play, so keep them for when nothing else does.
    if (card.color === null && hand.length > 2) bonus -= card.value === "wild-draw-four" ? 30 : 20
    if (attack(card) && threat.nextIsLeader && threat.fewestCount <= 4) bonus += 15 + (5 - threat.fewestCount) * 4
    if (card.value === "reverse" && threat.previousIsLeader && !threat.nextIsLeader) bonus -= 15
    return bonus
  }
  const score = (card: UnoCard) =>
    (card.color === null ? -10 : 0) +
    (card.value === "wild-draw-four" ? -5 : 0) +
    (nextCount <= 2 && attack(card) ? 20 : 0) +
    (card.color ? counts.get(card.color) ?? 0 : 0) +
    hardScore(card) +
    (swap && card.value === "7" ? swapGain(swap.fewestCount) : 0) +
    (swap && card.value === "0" ? swapGain(swap.incomingCount) : 0)
  // Positive when trading the hand left after this card for a smaller one.
  const swapGain = (incoming: number) => {
    const diff = hand.length - 1 - incoming
    return diff > 0 ? diff * 3 : -8
  }
  const card = [...playable].sort((a, b) => score(b) - score(a))[0]!
  if (card.color) return { card, ...(swap && card.value === "7" && { targetId: swap.fewestId }) }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { card, color: best ?? UNO_COLORS[Math.floor(Math.random() * UNO_COLORS.length)]! }
}

class UnoParty implements Party.Server {
  constructor(readonly room: Party.Room) {}
  state: UnoGameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()
  reactedAt = new Map<string, number>()

  async onStart() {
    this.state = await this.room.storage.get<UnoGameState>("state") ?? null
    if (!this.state) return
    this.state.actionSeq ??= 0
    this.state.log ??= []
    this.state.unoExposed ??= []
    this.state.rules = { ...DEFAULT_UNO_RULES, ...this.state.rules }
    this.state.pendingDraw ??= 0
    clearSpectators(this.state)
    for (const player of Object.values(this.state.players)) {
      if (player.isBot) continue
      player.connected = false
      player.disconnectedAt ??= Date.now()
    }
    if (this.state.status === "playing" && this.state.currentPlayerId && !this.state.players[this.state.currentPlayerId]?.isBot) {
      this.state.disconnectedTurnPlayerId = this.state.currentPlayerId
      this.state.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS
    }
    await this.save()
  }

  async save() {
    if (!this.state) return
    this.syncUnoExposed()
    this.syncBotDeadline()
    await this.room.storage.put("state", this.state)
    const deadlines = [this.state.disconnectDeadline, this.state.botDeadline, this.state.botJump?.at].filter((deadline): deadline is number => Boolean(deadline))
    if (deadlines.length) await this.room.storage.setAlarm(Math.min(...deadlines))
    else await this.room.storage.deleteAlarm()
  }

  humansConnected() {
    return Boolean(this.state && Object.values(this.state.players).some((player) => !player.isBot && player.connected !== false))
  }

  /** Exposure ends once the player's next turn starts or they no longer hold exactly one card. */
  syncUnoExposed() {
    if (!this.state) return
    const state = this.state
    state.unoExposed = state.status !== "playing" ? [] : (state.unoExposed ?? []).filter(({ playerId }) =>
      state.currentPlayerId !== playerId && state.players[playerId]?.hand.length === 1)
  }

  catchUno(catcher: UnoPlayer, victimId: string): boolean {
    if (!this.state) return false
    const exposure = this.state.unoExposed?.find((entry) => entry.playerId === victimId)
    const victim = this.state.players[victimId]
    if (!exposure || !victim || victimId === catcher.id || Date.now() < exposure.catchableAt) return false
    this.state.unoExposed = this.state.unoExposed!.filter((entry) => entry !== exposure)
    const drawn = this.drawCards(victim, 2).length
    this.record({ type: "catch", playerId: catcher.id, name: catcher.name, victimId: victim.id, victimName: victim.name, drawCount: drawn })
    this.botReact(victim.id, ["😤", "😱"], 0.5)
    // Let the catch play out before a waiting bot moves.
    this.state.botDeadline = null
    return true
  }

  /** A bot's turn waits for the table to finish showing the last action; it pauses while no human is watching. */
  syncBotDeadline() {
    if (!this.state) return
    const current = this.state.currentPlayerId ? this.state.players[this.state.currentPlayerId] : null
    if (this.state.status === "playing" && current?.isBot && this.humansConnected()) {
      this.state.botDeadline ??= Date.now() + revealMs(this.state.log.at(-1)) + BOT_THINK_MS
    } else this.state.botDeadline = null
    const last = this.state.log.at(-1)
    if (last?.type === "play" && this.botJumper()) {
      if (this.state.botJump?.actionId !== last.id) this.state.botJump = { actionId: last.id, at: Date.now() + revealMs(last) + BOT_JUMP_MS }
    } else this.state.botJump = null
  }

  /** A bot, other than whoever plays next, holding a copy of the top card it may jump in with. */
  botJumper(): { bot: UnoPlayer; card: UnoCard } | null {
    const state = this.state
    const top = state?.discardPile.at(-1)
    if (!state || !top || state.status !== "playing" || !state.rules.jumpIn || state.pendingDraw || !this.humansConnected()) return null
    for (const id of state.seatOrder) {
      const bot = state.players[id]
      if (!bot?.isBot || bot.botLevel === "easy" || id === state.currentPlayerId || id === state.topPlayerId) continue
      const card = bot.hand.find((candidate) => canJumpInUno(candidate, top))
      if (card) return { bot, card }
    }
    return null
  }

  botSwapInfo(bot: UnoPlayer): BotSwapInfo | null {
    if (!this.state?.rules.sevenZero) return null
    const order = this.state.seatOrder.filter((id) => this.state!.players[id])
    const others = order.filter((id) => id !== bot.id).map((id) => this.state!.players[id]!)
    if (!others.length) return null
    const fewest = others.reduce((best, player) => player.hand.length < best.hand.length ? player : best)
    const index = order.indexOf(bot.id)
    const giver = this.state.players[order[(index - this.state.direction + order.length) % order.length]!]!
    return { fewestId: fewest.id, fewestCount: fewest.hand.length, incomingCount: giver.hand.length }
  }

  botThreat(bot: UnoPlayer): BotThreat {
    const order = this.state!.seatOrder.filter((id) => this.state!.players[id])
    const others = order.filter((id) => id !== bot.id).map((id) => this.state!.players[id]!)
    const fewestCount = Math.min(...others.map((player) => player.hand.length))
    const index = order.indexOf(bot.id)
    const isLeader = (id: string | null | undefined) => Boolean(id && id !== bot.id && this.state!.players[id]?.hand.length === fewestCount)
    const previous = order[(index - this.state!.direction + order.length) % order.length]
    return { nextIsLeader: isLeader(this.nextPlayer(bot.id)), previousIsLeader: others.length > 1 && isLeader(previous), fewestCount }
  }

  jumpIn(player: UnoPlayer, card: UnoCard, color?: UnoColor, targetId?: string, callUno = false) {
    if (!this.state) return
    this.state.currentPlayerId = player.id
    this.state.disconnectedTurnPlayerId = null
    this.state.disconnectDeadline = null
    this.state.botDeadline = null
    this.playCard(player, card, color, callUno, targetId, true)
  }

  /** The current player takes the stacked +2/+4 total and loses the turn. */
  takePenalty(player: UnoPlayer) {
    if (!this.state) return
    const drawn = this.drawCards(player, this.state.pendingDraw).length
    this.state.pendingDraw = 0
    this.state.pendingChallenge = null
    this.record({ type: "penalty", playerId: player.id, name: player.name, drawCount: drawn })
    if (drawn >= 4) this.botReact(player.id, ["😱", "😤"], 0.6)
    this.advance()
  }

  /** A bluffer takes the stack and the challenger plays on; otherwise the challenger takes it plus 2 and loses the turn. */
  challenge(challenger: UnoPlayer) {
    if (!this.state?.pendingChallenge) return
    const offender = this.state.players[this.state.pendingChallenge.playerId]
    const guilty = Boolean(offender && !this.state.pendingChallenge.legal)
    const victim = guilty ? offender! : challenger
    const drawn = this.drawCards(victim, this.state.pendingDraw + (guilty ? 0 : 2)).length
    this.state.pendingDraw = 0
    this.state.pendingChallenge = null
    this.record({ type: "challenge", playerId: challenger.id, name: challenger.name, targetId: offender?.id ?? "", targetName: offender?.name ?? "Player", guilty, victimId: victim.id, victimName: victim.name, drawCount: drawn })
    this.botReact(victim.id, ["😤", "😱"], 0.5)
    if (guilty) this.state.botDeadline = null
    else this.advance()
  }

  botTurn() {
    if (!this.state || this.state.status !== "playing" || !this.state.currentPlayerId) return
    const bot = this.state.players[this.state.currentPlayerId]
    const top = this.state.discardPile.at(-1)
    const color = this.state.activeColor
    if (!bot?.isBot || !top || !color) return
    const level = bot.botLevel ?? "normal"
    // Bots open their turn by catching anyone who forgot to call UNO; easy ones don't notice.
    const forgot = level !== "easy" && this.state.unoExposed?.find((entry) => entry.playerId !== bot.id && Date.now() >= entry.catchableAt)
    if (forgot && this.catchUno(bot, forgot.playerId)) return
    const drawnId = this.state.drawnCardId
    const pending = this.state.pendingDraw
    // Bots never bluff a +4.
    const honest = { ...this.state.rules, challenge: false }
    const playable = bot.hand.filter((card) => (!drawnId || card.id === drawnId) && canPlayUnoTurn(card, top, color, bot.hand, honest, pending))
    if (pending && !playable.length) {
      if (this.state.pendingChallenge && Math.random() < (level === "easy" ? 0.5 : BOT_CHALLENGE_ODDS)) this.challenge(bot)
      else this.takePenalty(bot)
    } else if (playable.length) {
      const next = this.state.players[this.nextPlayer(bot.id) ?? ""]
      const threat = this.botThreat(bot)
      // Hard bots draw rather than spend their only playable wild while nobody is close to winning.
      if (level === "hard" && !pending && !drawnId && bot.hand.length > 3 && threat.fewestCount > 2 && playable.every((card) => card.color === null)) {
        this.drawCard(bot)
        return
      }
      const choice = chooseBotPlay(bot.hand, playable, next?.hand.length ?? 7, this.botSwapInfo(bot), level, threat)
      this.playCard(bot, choice.card, choice.color, level !== "easy" || Math.random() >= EASY_BOT_FORGETS_UNO, choice.targetId)
    } else if (drawnId) {
      this.record({ type: "pass", playerId: bot.id, name: bot.name })
      this.advance()
    } else this.drawCard(bot)
  }

  drawCard(player: UnoPlayer) {
    if (!this.state) return
    const card = this.drawCards(player, 1)[0]
    const top = this.state.discardPile.at(-1)!
    const playable = Boolean(card && canPlayUnoTurn(card, top, this.state.activeColor!, player.hand, this.state.rules, 0))
    this.record({ type: "draw", playerId: player.id, name: player.name, ...(card && { card }), playable })
    if (card && playable) this.state.drawnCardId = card.id
    else this.advance()
  }

  playCard(player: UnoPlayer, card: UnoCard, color?: UnoColor, callUno = false, targetId?: string, jumpIn = false) {
    if (!this.state) return
    const rules = this.state.rules
    const previousColor = this.state.activeColor
    player.hand.splice(player.hand.indexOf(card), 1)
    this.state.discardPile.push(card)
    this.state.activeColor = card.color ?? color!
    this.state.drawnCardId = null
    this.state.topPlayerId = player.id
    let handEffect: Partial<Pick<Extract<UnoAction, { type: "play" }>, "swapId" | "swapName" | "rotated">> = {}
    if (player.hand.length > 0 && rules.sevenZero && card.value === "7") {
      const target = targetId ? this.state.players[targetId] : undefined
      if (target && target.id !== player.id) {
        ;[player.hand, target.hand] = [target.hand, player.hand]
        handEffect = { swapId: target.id, swapName: target.name }
      }
    } else if (player.hand.length > 0 && rules.sevenZero && card.value === "0") {
      const order = this.state.seatOrder.filter((id) => this.state!.players[id])
      const hands = order.map((id) => this.state!.players[id]!.hand)
      order.forEach((_, index) => { this.state!.players[order[(index + this.state!.direction + order.length) % order.length]!]!.hand = hands[index]! })
      handEffect = { rotated: true }
    }
    const played: Extract<NewUnoAction, { type: "play" }> = { type: "play", playerId: player.id, name: player.name, card, color: card.color ?? color!, cardsLeft: player.hand.length, ...handEffect, ...(jumpIn && { jumpIn: true }), ...(player.hand.length === 1 && callUno && { unoCalled: true }) }
    const stacks = (card.value === "draw-two" && rules.stacking) || (card.value === "wild-draw-four" && (rules.stacking || rules.challenge))
    if (player.hand.length === 0) {
      this.record(played)
      this.finish(player.id)
      // Before the winner screen covers the table.
      const bots = this.state.seatOrder.filter((id) => id !== player.id && this.state!.players[id]?.isBot)
      if (player.isBot) this.botReact(player.id, ["GG", "🔥"], 0.7, 600)
      else this.botReact(bots[Math.floor(Math.random() * bots.length)], ["GG", "👏"], 0.7, 600)
    }
    else if (stacks) {
      const facing = this.state.players[this.nextPlayer(player.id) ?? ""]
      this.state.pendingDraw += card.value === "draw-two" ? 2 : 4
      this.state.pendingChallenge = card.value === "wild-draw-four" && rules.challenge
        ? { playerId: player.id, legal: !player.hand.some((other) => other.color === previousColor) }
        : null
      this.record({ ...played, stack: this.state.pendingDraw, ...(facing && { facingId: facing.id, facingName: facing.name }) })
      this.advance()
    }
    else if (card.value === "reverse") {
      if (this.state.seatOrder.length === 2) {
        const skipped = this.state.players[this.nextPlayer(player.id) ?? ""]
        this.record({ ...played, ...(skipped && skipped.id !== player.id && { skippedId: skipped.id, skippedName: skipped.name }) })
        this.advance(2)
      } else {
        this.state.direction = this.state.direction === 1 ? -1 : 1
        this.record({ ...played, reversed: true })
        this.advance()
      }
    } else if (card.value === "skip") {
      const skipped = this.state.players[this.nextPlayer(player.id) ?? ""]
      this.record({ ...played, ...(skipped && skipped.id !== player.id && { skippedId: skipped.id, skippedName: skipped.name }) })
      this.advance(2)
    } else if (card.value === "draw-two" || card.value === "wild-draw-four") {
      const victimId = this.nextPlayer(player.id)
      const victim = victimId ? this.state.players[victimId] : undefined
      const drawn = victim ? this.drawCards(victim, card.value === "draw-two" ? 2 : 4).length : 0
      this.record({ ...played, ...(victim && { victimId: victim.id, victimName: victim.name, drawCount: drawn }) })
      if (card.value === "wild-draw-four") this.botReact(victim?.id, ["😱", "😤"], 0.65)
      else this.botReact(victim?.id, ["😤"], 0.25)
      this.botReact(player.id, ["😂"], 0.2)
      this.advance(2)
    } else { this.record(played); this.advance() }
    if (player.hand.length === 1 && !callUno) {
      this.state.unoExposed = [...(this.state.unoExposed ?? []).filter((entry) => entry.playerId !== player.id), { playerId: player.id, catchableAt: Date.now() + revealMs(this.state.log.at(-1)) }]
    }
  }

  send(connection: Party.Connection, message: ServerMessage) { connection.send(JSON.stringify(message)) }

  react(playerId: string, reaction: Reaction, delayMs?: number) {
    if (!takeReactionSlot(this.reactedAt, playerId)) return
    const message: ReactionMessage = { type: "reaction", playerId, reaction, ...(delayMs ? { delayMs } : {}) }
    this.room.broadcast(JSON.stringify(message))
  }

  /** Now and then a bot reacts to a big moment, once the table has replayed it. */
  botReact(playerId: string | undefined, options: readonly Reaction[], odds: number, delayMs?: number) {
    if (!playerId || !this.state?.players[playerId]?.isBot || !this.humansConnected() || Math.random() >= odds) return
    this.react(playerId, pickReaction(options), delayMs ?? revealMs(this.state.log.at(-1)) - 400)
  }

  authenticated(connection: Party.Connection) {
    const token = this.connectionTokens.get(connection)
    return Boolean(this.state && token && this.state.playerTokens[connection.id] === token)
  }

  publicState(playerId: string): PublicUnoGameState {
    if (!this.state) throw new Error("No Uno state")
    const player = this.state.players[playerId]
    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      players: Object.fromEntries(Object.entries(this.state.players).map(([id, item]) => [id, {
        id: item.id, name: item.name, cardCount: item.hand.length, joinedAt: item.joinedAt, connected: item.connected, isBot: item.isBot, botLevel: item.isBot ? item.botLevel ?? "normal" : undefined,
      }])),
      seatOrder: [...this.state.seatOrder],
      maxPlayers: this.state.maxPlayers,
      status: this.state.status,
      topCard: this.state.discardPile.at(-1) ?? null,
      activeColor: this.state.activeColor,
      currentPlayerId: this.state.currentPlayerId,
      direction: this.state.direction,
      myHand: player ? [...player.hand] : [],
      drawnCardId: this.state.currentPlayerId === playerId ? this.state.drawnCardId : null,
      winnerId: this.state.winnerId,
      startedAt: this.state.startedAt,
      finishedAt: this.state.finishedAt,
      deckCount: this.state.deck.length,
      unoExposedIds: (this.state.unoExposed ?? []).map((entry) => entry.playerId),
      rules: { ...this.state.rules },
      pendingDraw: this.state.pendingDraw,
      pendingChallengeBy: this.state.pendingChallenge?.playerId ?? null,
      topPlayerId: this.state.topPlayerId ?? null,
      log: this.state.log.map((action) => {
        if (action.type !== "draw" || action.playerId === playerId || !action.card) return { ...action }
        const { card: _hidden, ...rest } = action
        return rest
      }),
      spectators: publicSpectators(this.state.spectators),
    }
  }

  broadcast() {
    for (const connection of this.room.getConnections()) {
      if (this.authenticated(connection)) this.send(connection, { type: "state", state: this.publicState(connection.id) })
    }
  }

  error(connection: Party.Connection, message: string) { this.send(connection, { type: "error", message }) }

  nextPlayer(fromId: string, steps = 1): string | null {
    if (!this.state || this.state.seatOrder.length === 0) return null
    const order = this.state.seatOrder
    let index = order.indexOf(fromId)
    if (index < 0) index = 0
    const connectedExist = order.some((id) => this.state!.players[id]?.connected !== false)
    let remaining = steps
    for (let checked = 0; checked < order.length * Math.max(steps, 1); checked++) {
      index = (index + this.state.direction + order.length) % order.length
      const candidate = this.state.players[order[index]!]
      if (candidate && (!connectedExist || candidate.connected !== false)) {
        remaining--
        if (remaining === 0) return candidate.id
      }
    }
    return fromId
  }

  record(action: NewUnoAction) {
    if (!this.state) return
    this.state.actionSeq += 1
    this.state.log = [...this.state.log, { ...action, id: this.state.actionSeq } as UnoAction].slice(-LOG_LIMIT)
  }

  advance(steps = 1) {
    if (!this.state?.currentPlayerId) return
    this.state.currentPlayerId = this.nextPlayer(this.state.currentPlayerId, steps)
    this.state.drawnCardId = null
  }

  recycleDeck() {
    if (!this.state || this.state.deck.length || this.state.discardPile.length <= 1) return
    const top = this.state.discardPile.pop()!
    this.state.deck = shuffleUnoCards(this.state.discardPile)
    this.state.discardPile = [top]
  }

  drawCards(player: UnoPlayer, count: number): UnoCard[] {
    const drawn: UnoCard[] = []
    while (drawn.length < count) {
      this.recycleDeck()
      const card = this.state?.deck.pop()
      if (!card) break
      player.hand.push(card)
      drawn.push(card)
    }
    return drawn
  }

  startGame() {
    if (!this.state) return
    this.state.deck = shuffleUnoCards(createUnoDeck())
    this.state.discardPile = []
    this.state.direction = 1
    this.state.drawnCardId = null
    this.state.winnerId = null
    this.state.finishedAt = null
    this.state.pendingDraw = 0
    this.state.pendingChallenge = null
    this.state.topPlayerId = null
    this.state.botJump = null
    for (const id of this.state.seatOrder) {
      const player = this.state.players[id]!
      player.hand = []
      this.drawCards(player, 7)
    }
    const numberIndex = this.state.deck.findIndex(isUnoNumberCard)
    const initial = this.state.deck.splice(numberIndex, 1)[0]!
    this.state.discardPile.push(initial)
    this.state.activeColor = initial.color
    this.state.currentPlayerId = this.state.seatOrder[0] ?? null
    this.state.status = "playing"
    this.state.startedAt = Date.now()
    this.state.log = []
    const first = this.state.currentPlayerId ? this.state.players[this.state.currentPlayerId] : null
    if (first) this.record({ type: "deal", playerId: first.id, name: first.name, card: initial })
  }

  finish(winnerId: string) {
    if (!this.state) return
    this.state.status = "finished"
    this.state.winnerId = winnerId
    this.state.currentPlayerId = null
    this.state.drawnCardId = null
    this.state.finishedAt = Date.now()
    this.state.disconnectedTurnPlayerId = null
    this.state.disconnectDeadline = null
  }

  async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    const gameNight = await validateGameNightConnection(this.room, connection, context, UNO_GAME_ID)
    if (gameNight.mode === "invalid") return this.error(connection, "Game not found")
    if (gameNight.mode === "game-night") this.gameNightMembers.set(connection, gameNight.member)
    const url = new URL(context.request.url)
    const token = url.searchParams.get("playerToken") ?? ""
    if (token) this.connectionTokens.set(connection, token)
    const canCreate = gameNight.mode === "game-night" ? gameNight.member.isHost : url.searchParams.get("host") === "true"
    if (canCreate && !this.state) {
      this.state = {
        roomCode: this.room.id, hostId: connection.id, players: {}, playerTokens: {}, seatOrder: [], maxPlayers: 8,
        status: "waiting", deck: [], discardPile: [], activeColor: null, currentPlayerId: null, direction: 1,
        drawnCardId: null, winnerId: null, startedAt: null, finishedAt: null, actionSeq: 0, log: [],
        rules: { ...DEFAULT_UNO_RULES }, pendingDraw: 0,
      }
      await this.save()
    }
    if (!this.state) this.error(connection, "Game not found")
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (!this.state) return
    const action = parseAction(message)
    if (!action) return this.error(sender, "Invalid action")
    if (action.type !== "join" && !this.authenticated(sender)) return this.error(sender, "Invalid player session")
    // Spectators only watch: the one thing they can do besides joining is leave.
    if (action.type !== "join" && this.state.spectators?.[sender.id]) {
      if (action.type === "leave") { dropSpectator(this.state, sender.id); await this.save(); this.broadcast() }
      return
    }

    if (action.type === "join") {
      const token = this.connectionTokens.get(sender)
      if (!token) return this.error(sender, "Invalid player session")
      const member = this.gameNightMembers.get(sender)
      const returning = this.state.players[sender.id]
      if (returning) {
        if (this.state.playerTokens[sender.id] !== token) return this.error(sender, "Invalid player session")
        markConnected(this.state.players, sender.id)
        returning.disconnectedAt = null
        returning.name = member?.name ?? (action.name.trim().slice(0, 20) || returning.name)
        if (this.state.disconnectedTurnPlayerId === sender.id) {
          this.state.disconnectedTurnPlayerId = null
          this.state.disconnectDeadline = null
        } else if (this.state.status === "playing" && this.state.currentPlayerId && this.state.players[this.state.currentPlayerId]?.connected === false && (!this.state.disconnectDeadline || this.state.disconnectDeadline <= Date.now())) {
          this.state.currentPlayerId = sender.id
          this.state.drawnCardId = null
        }
        await this.save(); this.broadcast(); return
      }
      const watching = this.state.spectators?.[sender.id]
      if (watching) {
        if (this.state.playerTokens[sender.id] !== token) return this.error(sender, "Invalid player session")
        watching.name = member?.name ?? (action.name.trim().slice(0, 20) || watching.name)
        await this.save(); this.broadcast(); return
      }
      if (this.state.status !== "waiting") {
        const name = member?.name ?? action.name.trim().slice(0, 20)
        if (!name) return this.error(sender, "Enter a player name")
        this.state.spectators ??= {}
        if (Object.keys(this.state.spectators).length >= MAX_SPECTATORS) return this.error(sender, "Too many people are watching")
        this.state.spectators[sender.id] = { id: sender.id, name, joinedAt: Date.now() }
        this.state.playerTokens[sender.id] = token
        await this.save(); this.broadcast(); return
      }
      const cutoff = Date.now() - PLAYER_TTL_MS
      for (const [id, player] of Object.entries(this.state.players)) {
        if (player.connected === false && player.disconnectedAt && player.disconnectedAt <= cutoff) {
          delete this.state.players[id]; delete this.state.playerTokens[id]
          this.state.seatOrder = this.state.seatOrder.filter((playerId) => playerId !== id)
        }
      }
      if (this.state.seatOrder.length >= this.state.maxPlayers) return this.error(sender, "Game is full")
      const name = member?.name ?? action.name.trim().slice(0, 20)
      if (!name) return this.error(sender, "Enter a player name")
      this.state.players[sender.id] = { id: sender.id, name, hand: [], joinedAt: Date.now(), connected: true, disconnectedAt: null }
      this.state.playerTokens[sender.id] = token
      this.state.seatOrder.push(sender.id)
      if (!this.state.players[this.state.hostId]) this.state.hostId = sender.id
      await this.save(); this.broadcast(); return
    }

    if (action.type === "start") {
      if (this.state.status !== "waiting" || !canControlGame(this.state.players, this.state.hostId, sender.id)) return
      if (presentCount(this.state.players) < 2) return this.error(sender, "Need at least 2 players")
      for (const player of Object.values(this.state.players)) {
        if (player.connected === false) {
          delete this.state.players[player.id]; delete this.state.playerTokens[player.id]
          this.state.seatOrder = this.state.seatOrder.filter((id) => id !== player.id)
        }
      }
      this.startGame(); await this.save(); this.broadcast(); return
    }

    if (action.type === "draw") {
      if (this.state.status !== "playing" || this.state.currentPlayerId !== sender.id || this.state.drawnCardId) return this.error(sender, "Cannot draw now")
      const player = this.state.players[sender.id]!
      if (this.state.pendingDraw) this.takePenalty(player)
      else this.drawCard(player)
      await this.save(); this.broadcast(); return
    }

    if (action.type === "pass") {
      if (this.state.status !== "playing" || this.state.currentPlayerId !== sender.id || !this.state.drawnCardId) return this.error(sender, "Cannot pass now")
      const player = this.state.players[sender.id]!
      this.record({ type: "pass", playerId: player.id, name: player.name })
      this.advance(); await this.save(); this.broadcast(); return
    }

    if (action.type === "play") {
      if (this.state.status !== "playing") return this.error(sender, "Not your turn")
      const rules = this.state.rules
      const player = this.state.players[sender.id]!
      const card = player.hand.find((item) => item.id === action.cardId)
      const canonical = parseUnoCardId(action.cardId)
      const top = this.state.discardPile.at(-1)
      if (!card || !canonical || canonical.color !== card.color || canonical.value !== card.value || !top || !this.state.activeColor) return this.error(sender, "Card is not playable")
      const jumping = this.state.currentPlayerId !== sender.id
      if (jumping) {
        if (!rules.jumpIn) return this.error(sender, "Not your turn")
        if (this.state.pendingDraw || this.state.topPlayerId === sender.id || !canJumpInUno(card, top)) return this.error(sender, "Can't jump in now")
      } else if ((this.state.drawnCardId && this.state.drawnCardId !== action.cardId) || !canPlayUnoTurn(card, top, this.state.activeColor, player.hand, rules, this.state.pendingDraw)) {
        return this.error(sender, "Card is not playable")
      }
      if ((card.color === null) !== Boolean(action.color)) return this.error(sender, card.color === null ? "Choose a color" : "Color is only valid for wild cards")
      if (rules.sevenZero && card.value === "7" && player.hand.length > 1 && (!action.targetId || action.targetId === sender.id || !this.state.players[action.targetId])) return this.error(sender, "Choose a player to swap with")
      if (jumping) this.jumpIn(player, card, action.color, action.targetId)
      else this.playCard(player, card, action.color, false, action.targetId)
      await this.save(); this.broadcast(); return
    }

    if (action.type === "challenge") {
      if (this.state.status !== "playing" || this.state.currentPlayerId !== sender.id || !this.state.pendingChallenge) return this.error(sender, "Nothing to challenge")
      this.challenge(this.state.players[sender.id]!)
      await this.save(); this.broadcast(); return
    }

    if (action.type === "set-rule") {
      if (this.state.status !== "waiting") return this.error(sender, "Game already started")
      if (!canControlGame(this.state.players, this.state.hostId, sender.id)) return this.error(sender, "Only the host can change house rules")
      this.state.rules = { ...this.state.rules, [action.rule]: action.enabled }
      await this.save(); this.broadcast(); return
    }

    if (action.type === "react") {
      if (this.state.players[sender.id]) this.react(sender.id, action.reaction)
      return
    }

    if (action.type === "uno") {
      const exposed = this.state.unoExposed ?? []
      if (this.state.status !== "playing" || !exposed.some((entry) => entry.playerId === sender.id)) return
      this.state.unoExposed = exposed.filter((entry) => entry.playerId !== sender.id)
      await this.save(); this.broadcast(); return
    }

    if (action.type === "catch") {
      if (this.state.status !== "playing") return
      // Silently ignore a late catch: someone else got there first or the player already called.
      if (!this.catchUno(this.state.players[sender.id]!, action.playerId)) return
      await this.save(); this.broadcast(); return
    }

    if (action.type === "set-bot-level") {
      if (this.state.status !== "waiting") return this.error(sender, "Game already started")
      if (!canControlGame(this.state.players, this.state.hostId, sender.id)) return this.error(sender, "Only the host can change bots")
      const bot = this.state.players[action.playerId]
      if (!bot?.isBot) return this.error(sender, "Only bots have a level")
      bot.botLevel = action.level
      await this.save(); this.broadcast(); return
    }

    if (action.type === "add-bot" || action.type === "remove-player") {
      if (this.state.status !== "waiting") return this.error(sender, "Game already started")
      if (!canControlGame(this.state.players, this.state.hostId, sender.id)) return this.error(sender, "Only the host can change bots")
      if (action.type === "remove-player") {
        if (!this.state.players[action.playerId]?.isBot) return this.error(sender, "Only bots can be removed")
        delete this.state.players[action.playerId]
        this.state.seatOrder = this.state.seatOrder.filter((id) => id !== action.playerId)
      } else {
        if (this.state.seatOrder.length >= this.state.maxPlayers) return this.error(sender, "Game is full")
        const taken = new Set(Object.values(this.state.players).map((player) => player.name))
        const id = `bot-${crypto.randomUUID().slice(0, 8)}`
        const name = BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? `Bot ${this.state.seatOrder.length + 1}`
        this.state.players[id] = { id, name, hand: [], joinedAt: Date.now(), connected: true, disconnectedAt: null, isBot: true, botLevel: "normal" }
        this.state.seatOrder.push(id)
      }
      await this.save(); this.broadcast(); return
    }

    if (action.type === "seat-spectator") {
      if (!canControlGame(this.state.players, this.state.hostId, sender.id)) return this.error(sender, "Only the host can seat spectators")
      if (this.state.status === "playing") return this.error(sender, "Seat them once this hand is over")
      const spectator = this.state.spectators?.[action.playerId]
      if (!spectator) return this.error(sender, "They're no longer watching")
      if (this.state.seatOrder.length >= this.state.maxPlayers) return this.error(sender, "No empty seats")
      delete this.state.spectators![spectator.id]
      this.state.players[spectator.id] = { id: spectator.id, name: spectator.name, hand: [], joinedAt: Date.now(), connected: true, disconnectedAt: null }
      this.state.seatOrder.push(spectator.id)
      await this.save(); this.broadcast(); return
    }

    if (action.type === "restart") {
      if (this.state.status !== "finished" || !canControlGame(this.state.players, this.state.hostId, sender.id)) return
      for (const player of Object.values(this.state.players)) {
        if (player.connected === false) {
          delete this.state.players[player.id]; delete this.state.playerTokens[player.id]
          this.state.seatOrder = this.state.seatOrder.filter((id) => id !== player.id)
        } else player.hand = []
      }
      Object.assign(this.state, { status: "waiting", deck: [], discardPile: [], activeColor: null, currentPlayerId: null, direction: 1, drawnCardId: null, winnerId: null, startedAt: null, finishedAt: null, log: [], pendingDraw: 0, pendingChallenge: null, topPlayerId: null, botJump: null })
      await this.save(); this.broadcast(); return
    }

    if (action.type === "leave") {
      const wasCurrent = this.state.currentPlayerId === sender.id
      const leavingIndex = this.state.seatOrder.indexOf(sender.id)
      const leaving = this.state.players[sender.id]
      if (leaving) this.state.deck = shuffleUnoCards([...this.state.deck, ...leaving.hand])
      if (leaving && this.state.status === "playing") this.record({ type: "leave", playerId: leaving.id, name: leaving.name })
      delete this.state.players[sender.id]; delete this.state.playerTokens[sender.id]
      this.state.seatOrder = this.state.seatOrder.filter((id) => id !== sender.id)
      if (this.state.disconnectedTurnPlayerId === sender.id) {
        this.state.disconnectedTurnPlayerId = null
        this.state.disconnectDeadline = null
      }
      // A stack aimed at the leaver is dropped; a +4 they played can no longer be challenged.
      if (wasCurrent) this.state.pendingDraw = 0
      if (wasCurrent || this.state.pendingChallenge?.playerId === sender.id) this.state.pendingChallenge = null
      const humans = Object.fromEntries(Object.entries(this.state.players).filter(([, player]) => !player.isBot))
      if (sender.id === this.state.hostId) this.state.hostId = nextHost(humans, sender.id) ?? ""
      if (Object.keys(humans).length === 0) { this.state = null; await this.room.storage.delete("state"); await this.room.storage.deleteAlarm(); return }
      if (this.state.status === "playing" && this.state.seatOrder.length === 1) this.finish(this.state.seatOrder[0]!)
      else if (wasCurrent) {
        const length = this.state.seatOrder.length
        const firstIndex = this.state.direction === 1 ? leavingIndex % length : (leavingIndex - 1 + length) % length
        let replacement = this.state.seatOrder[firstIndex]!
        for (let offset = 0; offset < length; offset++) {
          const index = (firstIndex + this.state.direction * offset + length) % length
          const candidate = this.state.players[this.state.seatOrder[index]!]
          if (candidate?.connected !== false) { replacement = candidate.id; break }
        }
        this.state.currentPlayerId = replacement
        this.state.drawnCardId = null
      }
      await this.save(); this.broadcast()
    }
  }

  async onRequest(request: Party.Request) {
    const match = await getGameNightResultMatch(this.room, request, UNO_GAME_ID)
    if (!match) return new Response("Not found", { status: 404 })
    const finished = this.state?.status === "finished"
    const winnerId = finished && this.state?.winnerId && !this.state.players[this.state.winnerId]?.isBot ? this.state.winnerId : null
    const vsBot = Object.values(this.state?.players ?? {}).some((player) => player.isBot)
    return Response.json({ finished, scored: true, winnerIds: winnerId ? [winnerId] : [], vsBot })
  }

  async onClose(connection: Party.Connection) {
    if (!this.state) return
    if (Array.from(this.room.getConnections()).some((candidate) => candidate.id === connection.id && candidate !== connection)) return
    if (dropSpectator(this.state, connection.id)) { await this.save(); this.broadcast(); return }
    if (!this.state.players[connection.id]) return
    markDisconnected(this.state.players, connection.id)
    this.state.players[connection.id]!.disconnectedAt = Date.now()
    if (this.state.status === "playing" && this.state.currentPlayerId === connection.id) {
      this.state.disconnectedTurnPlayerId = connection.id
      this.state.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS
    }
    await this.save(); this.broadcast()
  }

  async onAlarm() {
    if (!this.state) return
    const now = Date.now()
    let changed = false
    if (this.state.disconnectDeadline && now >= this.state.disconnectDeadline) {
      const playerId = this.state.disconnectedTurnPlayerId
      this.state.disconnectedTurnPlayerId = null
      this.state.disconnectDeadline = null
      if (playerId && this.state.status === "playing" && this.state.currentPlayerId === playerId && this.state.players[playerId]?.connected === false && this.humansConnected()) {
        if (this.state.pendingDraw) this.takePenalty(this.state.players[playerId]!)
        else {
          this.record({ type: "timeout", playerId, name: this.state.players[playerId]!.name })
          this.advance()
        }
      }
      changed = true
    }
    if (this.state.botJump?.at && now >= this.state.botJump.at) {
      this.state.botJump.at = null
      const jumper = this.botJumper()
      if (jumper) {
        const swap = this.botSwapInfo(jumper.bot)
        this.jumpIn(jumper.bot, jumper.card, undefined, jumper.card.value === "7" ? swap?.fewestId : undefined, true)
      }
      changed = true
    }
    if (this.state.botDeadline && now >= this.state.botDeadline) {
      this.state.botDeadline = null
      this.botTurn()
      changed = true
    }
    await this.save()
    if (changed) this.broadcast()
  }
}

export default withRoomCleanup(UnoParty, "uno")
