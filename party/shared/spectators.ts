/**
 * Spectators: people who joined a game already in progress.
 *
 * They are kept apart from `players`, so no game logic ever deals them in or
 * waits on them, and they only ever receive the public view of the table. Their
 * token lives in the game's `playerTokens` like everyone else's, so a host can
 * seat them later without a reconnect. They are dropped as soon as their socket
 * closes; a reconnect simply joins as a spectator again.
 */
export interface Spectator {
  id: string
  name: string
  joinedAt: number
  /** Clerk user id, when the spectator signed in - carried over if they are seated. */
  userId?: string
  color?: string
}

export interface PublicSpectator {
  id: string
  name: string
}

export const MAX_SPECTATORS = 20

export function publicSpectators(spectators: Record<string, Spectator> | undefined): PublicSpectator[] {
  return Object.values(spectators ?? {})
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ id, name }) => ({ id, name }))
}

/** Remove a spectator and their token. Returns whether they were watching. */
export function dropSpectator(state: { spectators?: Record<string, Spectator>; playerTokens: Record<string, string> }, id: string): boolean {
  if (!state.spectators?.[id]) return false
  delete state.spectators[id]
  delete state.playerTokens[id]
  return true
}

/** Forget every spectator, e.g. after a server restart when all sockets are gone. */
export function clearSpectators(state: { spectators?: Record<string, Spectator>; playerTokens: Record<string, string> }) {
  for (const id of Object.keys(state.spectators ?? {})) delete state.playerTokens[id]
  state.spectators = {}
}
