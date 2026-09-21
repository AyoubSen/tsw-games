import type * as Party from "partykit/server"
import type { GameNightGameId } from "../src/lib/gameNight"
import {
  canPlayUnoCard,
  createUnoDeck,
  isUnoColor,
  isUnoNumberCard,
  parseUnoCardId,
  shuffleUnoCards,
  type UnoCard,
  type UnoColor,
} from "../src/lib/uno"
import { canControlGame, markConnected, markDisconnected, nextHost, presentCount } from "./shared/presence"
import { getGameNightResultMatch, validateGameNightConnection, type GameNightMember } from "./shared/gameNight"

const UNO_GAME_ID = "uno" as GameNightGameId
const PLAYER_TTL_MS = 30 * 60 * 1000
const DISCONNECT_GRACE_MS = 15_000

export interface UnoPlayer {
  id: string
  name: string
  hand: UnoCard[]
  joinedAt: number
  connected?: boolean
  disconnectedAt?: number | null
}

export interface PublicUnoPlayer {
  id: string
  name: string
  cardCount: number
  joinedAt: number
  connected?: boolean
}

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
}

type ClientAction =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "draw" }
  | { type: "play"; cardId: string; color?: UnoColor }
  | { type: "pass" }
  | { type: "restart" }
  | { type: "leave" }

export type ServerMessage = { type: "state"; state: PublicUnoGameState } | { type: "error"; message: string }

function parseAction(message: string): ClientAction | null {
  let value: unknown
  try { value = JSON.parse(message) } catch { return null }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (data.type === "join") return typeof data.name === "string" ? { type: "join", name: data.name } : null
  if (data.type === "start" || data.type === "draw" || data.type === "pass" || data.type === "restart" || data.type === "leave") return { type: data.type }
  if (data.type !== "play" || typeof data.cardId !== "string" || !parseUnoCardId(data.cardId)) return null
  if (data.color !== undefined && !isUnoColor(data.color)) return null
  return { type: "play", cardId: data.cardId, ...(data.color ? { color: data.color } : {}) }
}

export default class UnoParty implements Party.Server {
  constructor(readonly room: Party.Room) {}
  state: UnoGameState | null = null
  connectionTokens = new WeakMap<Party.Connection, string>()
  gameNightMembers = new WeakMap<Party.Connection, GameNightMember>()

  async onStart() {
    this.state = await this.room.storage.get<UnoGameState>("state") ?? null
    if (!this.state) return
    for (const player of Object.values(this.state.players)) {
      player.connected = false
      player.disconnectedAt ??= Date.now()
    }
    if (this.state.status === "playing" && this.state.currentPlayerId) {
      this.state.disconnectedTurnPlayerId = this.state.currentPlayerId
      this.state.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS
      await this.room.storage.setAlarm(this.state.disconnectDeadline)
    }
    await this.save()
  }

  async save() { if (this.state) await this.room.storage.put("state", this.state) }

  send(connection: Party.Connection, message: ServerMessage) { connection.send(JSON.stringify(message)) }

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
        id: item.id, name: item.name, cardCount: item.hand.length, joinedAt: item.joinedAt, connected: item.connected,
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
    void this.room.storage.deleteAlarm()
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
        drawnCardId: null, winnerId: null, startedAt: null, finishedAt: null,
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
          await this.room.storage.deleteAlarm()
        } else if (this.state.status === "playing" && this.state.currentPlayerId && this.state.players[this.state.currentPlayerId]?.connected === false) {
          this.state.currentPlayerId = sender.id
          this.state.drawnCardId = null
        }
        await this.save(); this.broadcast(); return
      }
      if (this.state.status !== "waiting") return this.error(sender, "Game already started")
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
      const card = this.drawCards(player, 1)[0]
      const top = this.state.discardPile.at(-1)!
      if (card && canPlayUnoCard(card, top, this.state.activeColor!, player.hand)) this.state.drawnCardId = card.id
      else this.advance()
      await this.save(); this.broadcast(); return
    }

    if (action.type === "pass") {
      if (this.state.status !== "playing" || this.state.currentPlayerId !== sender.id || !this.state.drawnCardId) return this.error(sender, "Cannot pass now")
      this.advance(); await this.save(); this.broadcast(); return
    }

    if (action.type === "play") {
      if (this.state.status !== "playing" || this.state.currentPlayerId !== sender.id) return this.error(sender, "Not your turn")
      const player = this.state.players[sender.id]!
      const index = player.hand.findIndex((card) => card.id === action.cardId)
      if (index < 0 || (this.state.drawnCardId && this.state.drawnCardId !== action.cardId)) return this.error(sender, "Card is not playable")
      const card = player.hand[index]!
      const canonical = parseUnoCardId(action.cardId)
      const top = this.state.discardPile.at(-1)
      if (!canonical || canonical.color !== card.color || canonical.value !== card.value || !top || !this.state.activeColor || !canPlayUnoCard(card, top, this.state.activeColor, player.hand)) return this.error(sender, "Card is not playable")
      if ((card.color === null) !== Boolean(action.color)) return this.error(sender, card.color === null ? "Choose a color" : "Color is only valid for wild cards")
      player.hand.splice(index, 1)
      this.state.discardPile.push(card)
      this.state.activeColor = card.color ?? action.color!
      this.state.drawnCardId = null
      if (player.hand.length === 0) this.finish(player.id)
      else if (card.value === "reverse") {
        if (this.state.seatOrder.length === 2) this.advance(2)
        else { this.state.direction = this.state.direction === 1 ? -1 : 1; this.advance() }
      } else if (card.value === "skip") this.advance(2)
      else if (card.value === "draw-two" || card.value === "wild-draw-four") {
        const victimId = this.nextPlayer(player.id)
        if (victimId) this.drawCards(this.state.players[victimId]!, card.value === "draw-two" ? 2 : 4)
        this.advance(2)
      } else this.advance()
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
      Object.assign(this.state, { status: "waiting", deck: [], discardPile: [], activeColor: null, currentPlayerId: null, direction: 1, drawnCardId: null, winnerId: null, startedAt: null, finishedAt: null })
      await this.save(); this.broadcast(); return
    }

    if (action.type === "leave") {
      const wasCurrent = this.state.currentPlayerId === sender.id
      const leavingIndex = this.state.seatOrder.indexOf(sender.id)
      const leaving = this.state.players[sender.id]
      if (leaving) this.state.deck = shuffleUnoCards([...this.state.deck, ...leaving.hand])
      delete this.state.players[sender.id]; delete this.state.playerTokens[sender.id]
      this.state.seatOrder = this.state.seatOrder.filter((id) => id !== sender.id)
      if (this.state.disconnectedTurnPlayerId === sender.id) {
        this.state.disconnectedTurnPlayerId = null
        this.state.disconnectDeadline = null
        await this.room.storage.deleteAlarm()
      }
      if (sender.id === this.state.hostId) this.state.hostId = nextHost(this.state.players, sender.id) ?? ""
      if (this.state.seatOrder.length === 0) { this.state = null; await this.room.storage.delete("state"); return }
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
    return Response.json({ finished, scored: true, winnerIds: finished && this.state?.winnerId ? [this.state.winnerId] : [] })
  }

  async onClose(connection: Party.Connection) {
    if (!this.state?.players[connection.id]) return
    if (Array.from(this.room.getConnections()).some((candidate) => candidate.id === connection.id && candidate !== connection)) return
    markDisconnected(this.state.players, connection.id)
    this.state.players[connection.id]!.disconnectedAt = Date.now()
    if (this.state.status === "playing" && this.state.currentPlayerId === connection.id) {
      this.state.disconnectedTurnPlayerId = connection.id
      this.state.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS
      await this.room.storage.setAlarm(this.state.disconnectDeadline)
    }
    await this.save(); this.broadcast()
  }

  async onAlarm() {
    if (!this.state?.disconnectDeadline || Date.now() < this.state.disconnectDeadline) {
      if (this.state?.disconnectDeadline) await this.room.storage.setAlarm(this.state.disconnectDeadline)
      return
    }
    const playerId = this.state.disconnectedTurnPlayerId
    this.state.disconnectedTurnPlayerId = null
    this.state.disconnectDeadline = null
    if (playerId && this.state.status === "playing" && this.state.currentPlayerId === playerId && this.state.players[playerId]?.connected === false) {
      const hasConnectedPlayer = this.state.seatOrder.some((id) => this.state!.players[id]?.connected !== false)
      if (hasConnectedPlayer) this.advance()
    }
    await this.save(); this.broadcast()
  }
}
