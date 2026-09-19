import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Remembering which room this tab was in, so a reload walks back into the game
 * instead of dumping the player on the menu.
 *
 * Stored in sessionStorage rather than localStorage on purpose: it is per-tab,
 * matching `getPersistentPlayerId`, so two tabs in one browser stay two
 * independent players. The trade-off is that closing the tab ends the session,
 * which is the honest reading of "I'm done" anyway.
 */
export interface StoredSession {
  roomCode: string
  name: string
  savedAt: number
}

const TTL_MS = 6 * 60 * 60 * 1000

const storageKey = (game: string) => `${game}:lastSession`

export function rememberSession(game: string, roomCode: string, name: string): void {
  if (typeof sessionStorage === "undefined") return
  const record: StoredSession = { roomCode, name, savedAt: Date.now() }
  sessionStorage.setItem(storageKey(game), JSON.stringify(record))
}

export function readSession(game: string): StoredSession | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(storageKey(game))
    if (!raw) return null
    const record = JSON.parse(raw) as StoredSession
    if (!record?.roomCode || !record?.name) return null
    if (Date.now() - record.savedAt > TTL_MS) {
      sessionStorage.removeItem(storageKey(game))
      return null
    }
    return record
  } catch {
    return null
  }
}

export function forgetSession(game: string): void {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.removeItem(storageKey(game))
}

interface UseMultiplayerSessionOptions {
  /** Storage namespace - use the same key as getPersistentPlayerId. */
  game: string
  joinGame: (roomCode: string, playerName: string) => void
  /** True once the server confirms this player is a member of the room. */
  hasGameState: boolean
  error: string | null
  connectionStatus: string
  /** An explicit invite takes priority unless it points to the saved room. */
  inviteRoomCode?: string
  /**
   * Called when a resume fails - the room is gone or unreachable. Wire this to
   * the hook's `disconnect` so the stale error never reaches the menu.
   */
  onAbandon?: () => void
}

/**
 * Attempts, exactly once per mount, to rejoin the room this tab was last in.
 *
 * A failed resume is deliberately silent: the player never asked to rejoin, so
 * surfacing "Game not found" would be noise. We drop the record and fall back
 * to the menu as though nothing happened.
 */
export function useMultiplayerSession({
  game,
  joinGame,
  hasGameState,
  error,
  connectionStatus,
  inviteRoomCode,
  onAbandon,
}: UseMultiplayerSessionOptions) {
  const [isResuming, setIsResuming] = useState(false)
  const attemptedRef = useRef(false)
  /**
   * Synchronous, deliberately not state.
   *
   * Routes mirror `error` into their own message state from an effect, and
   * that effect runs in the same flush as the one below - so by the time we
   * clear the error, the route has already copied it. A ref is readable
   * during that flush, letting the route skip an error it never asked for.
   */
  const suppressRef = useRef(false)

  const remember = useCallback((roomCode: string, name: string) => {
    rememberSession(game, roomCode, name)
  }, [game])

  const forget = useCallback(() => {
    forgetSession(game)
  }, [game])

  // Keep the callbacks out of the mount effect's deps so it truly runs once.
  const joinRef = useRef(joinGame)
  joinRef.current = joinGame
  const abandonRef = useRef(onAbandon)
  abandonRef.current = onAbandon

  useEffect(() => {
    if (attemptedRef.current) return
    attemptedRef.current = true

    const record = readSession(game)
    if (!record) return
    if (inviteRoomCode && record.roomCode !== inviteRoomCode) return

    suppressRef.current = true
    setIsResuming(true)
    joinRef.current(record.roomCode, record.name)
  }, [game, inviteRoomCode])

  useEffect(() => {
    if (!isResuming) return

    if (hasGameState) {
      suppressRef.current = false
      setIsResuming(false)
      return
    }

    if (error && connectionStatus !== "connecting") {
      forgetSession(game)
      abandonRef.current?.()
      setIsResuming(false)
      // Stay suppressed for the rest of this flush so the route's own
      // error-mirroring effect skips the message too; release afterwards.
      setTimeout(() => {
        suppressRef.current = false
      }, 0)
    }
  }, [isResuming, hasGameState, error, connectionStatus, game])

  useEffect(() => {
    if (!isResuming) return
    const timeout = setTimeout(() => {
      forgetSession(game)
      abandonRef.current?.()
      setIsResuming(false)
      suppressRef.current = false
    }, 15_000)
    return () => clearTimeout(timeout)
  }, [isResuming, game])

  /** True while an unrequested resume is in flight or being abandoned. */
  const isSuppressingErrors = useCallback(() => suppressRef.current, [])

  return { isResuming, remember, forget, isSuppressingErrors }
}
