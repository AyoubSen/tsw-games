/**
 * Shared connection-presence handling for the party servers.
 *
 * Every game originally deleted a player from state inside `onClose`. But a
 * closed socket is not a departure - PartySocket reconnects on any network
 * blip, tab throttle or server hiccup - so a player who blinked was erased
 * mid-game and then refused re-entry by the "game already started" guard.
 *
 * The fix is to treat presence as a flag rather than existence: `onClose`
 * marks a player absent, `onConnect`/`join` marks them present again, and only
 * an explicit "leave" actually removes them.
 *
 * `connected` is optional so that rooms persisted before this existed still
 * deserialize: a missing flag means "present", which is the safe reading for
 * legacy state.
 */
export interface PresencePlayer {
  id: string
  joinedAt: number
  connected?: boolean
}

/** A player is present unless explicitly marked absent (see note on legacy state). */
export function isPresent(player: PresencePlayer | undefined | null): boolean {
  return !!player && player.connected !== false
}

/** Mark a returning player present. Returns the player, or null if unknown. */
export function markConnected<T extends PresencePlayer>(
  players: Record<string, T>,
  id: string,
): T | null {
  const player = players[id]
  if (!player) return null
  player.connected = true
  return player
}

/** Mark a dropped player absent without removing them. Returns null if unknown. */
export function markDisconnected<T extends PresencePlayer>(
  players: Record<string, T>,
  id: string,
): T | null {
  const player = players[id]
  if (!player) return null
  player.connected = false
  return player
}

/** Count players who are actually present - the number that should gate "can we start". */
export function presentCount(players: Record<string, PresencePlayer>): number {
  return Object.values(players).filter(isPresent).length
}

/**
 * Pick the next host when the current one *explicitly* leaves, preferring the
 * earliest joiner who is still present. Returns null if nobody is left.
 */
export function nextHost(
  players: Record<string, PresencePlayer>,
  leavingId: string,
): string | null {
  const candidates = Object.values(players)
    .filter(p => p.id !== leavingId && isPresent(p))
    .sort((a, b) => a.joinedAt - b.joinedAt)

  return candidates.length > 0 ? candidates[0].id : null
}

/**
 * Whether `senderId` may perform host-only actions.
 *
 * A host whose socket merely blipped keeps the role - that is the whole point
 * of not deleting them. But if the recorded host is genuinely gone, someone
 * else must be able to act, otherwise a host closing their tab freezes the
 * room for everyone still in it.
 */
export function canControlGame(
  players: Record<string, PresencePlayer>,
  hostId: string,
  senderId: string,
): boolean {
  if (senderId === hostId) return true
  return !isPresent(players[hostId])
}
