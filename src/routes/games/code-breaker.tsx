import { createFileRoute } from "@tanstack/react-router"
import {
  Binary,
  CheckCircle2,
  Eraser,
  LockKeyhole,
  Play,
  RotateCcw,
  Send,
  Trophy,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { useMultiplayerCodeBreaker } from "@/components/games/code-breaker/useMultiplayerCodeBreaker"
import {
  GameTopBar,
  MultiplayerLobby,
  MultiplayerSetupCard,
} from "@/components/multiplayer/shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CODE_COLORS,
  CODE_LENGTH,
  evaluateCodeGuess,
  generateSecretCode,
  isValidCodeGuess,
  MAX_ATTEMPTS,
  type CodeColor,
  type GuessResult,
} from "@/lib/codeBreaker"
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"

export const Route = createFileRoute("/games/code-breaker")({
  validateSearch: parseInviteSearch,
  component: CodeBreakerPage,
})

type GameView = "select" | "solo" | "multiplayer-lobby" | "multiplayer-game"

const COLOR_STYLES: Record<
  CodeColor,
  { label: string; peg: string; ring: string }
> = {
  ruby: {
    label: "Ruby",
    peg: "bg-rose-500 shadow-rose-500/35",
    ring: "ring-rose-500",
  },
  amber: {
    label: "Amber",
    peg: "bg-amber-400 shadow-amber-400/35",
    ring: "ring-amber-400",
  },
  lime: {
    label: "Lime",
    peg: "bg-lime-500 shadow-lime-500/35",
    ring: "ring-lime-500",
  },
  cyan: {
    label: "Cyan",
    peg: "bg-cyan-500 shadow-cyan-500/35",
    ring: "ring-cyan-500",
  },
  indigo: {
    label: "Indigo",
    peg: "bg-indigo-500 shadow-indigo-500/35",
    ring: "ring-indigo-500",
  },
  violet: {
    label: "Violet",
    peg: "bg-violet-500 shadow-violet-500/35",
    ring: "ring-violet-500",
  },
}

function CodePeg({
  color,
  onClick,
  small = false,
}: {
  color?: CodeColor
  onClick?: () => void
  small?: boolean
}) {
  const size = small ? "h-8 w-8" : "h-11 w-11 sm:h-12 sm:w-12"
  if (!color) {
    return (
      <span
        className={`${size} rounded-full border-2 border-dashed border-border/80 bg-background/40`}
      />
    )
  }

  const peg = (
    <span
      className={`${size} block rounded-full border-2 border-white/60 ${COLOR_STYLES[color].peg} shadow-lg`}
    />
  )
  if (!onClick) return peg
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${COLOR_STYLES[color].label}`}
      className="rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {peg}
    </button>
  )
}

function FeedbackPips({ result }: { result?: GuessResult }) {
  const pips = result
    ? [
        ...Array(result.exact).fill("exact"),
        ...Array(result.close).fill("close"),
        ...Array(CODE_LENGTH - result.exact - result.close).fill("miss"),
      ]
    : Array(CODE_LENGTH).fill("empty")

  return (
    <div
      className="grid grid-cols-2 gap-1"
      aria-label={
        result
          ? `${result.exact} exact and ${result.close} close`
          : "No feedback yet"
      }
    >
      {pips.map((pip, index) => (
        <span
          key={`${pip}-${index}`}
          className={`h-2.5 w-2.5 rounded-full ${
            pip === "exact"
              ? "bg-foreground"
              : pip === "close"
                ? "border-2 border-foreground bg-background"
                : pip === "miss"
                  ? "bg-muted-foreground/25"
                  : "border border-border"
          }`}
        />
      ))}
    </div>
  )
}

function CodeBoard({
  guesses,
  currentGuess,
  active,
  onRemove,
}: {
  guesses: GuessResult[]
  currentGuess: CodeColor[]
  active: boolean
  onRemove: (index: number) => void
}) {
  return (
    <div className="rounded-[2rem] border border-slate-800/10 bg-slate-950 p-3 shadow-2xl shadow-slate-950/20 sm:p-5 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
        <span>Sequence</span>
        <span>Exact / Close</span>
      </div>
      <div className="space-y-2">
        {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
          const result = guesses[index]
          const isCurrent = active && index === guesses.length
          const colors = result?.guess ?? (isCurrent ? currentGuess : [])
          return (
            <div
              key={index}
              className={`grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-2xl px-2 py-2.5 sm:grid-cols-[32px_1fr_auto] sm:px-3 ${
                isCurrent
                  ? "bg-white/10 ring-1 ring-white/15"
                  : result
                    ? "bg-white/[0.06]"
                    : "bg-white/[0.025]"
              }`}
            >
              <span className="text-center font-mono text-xs text-slate-500">
                {index + 1}
              </span>
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {Array.from({ length: CODE_LENGTH }, (_, slot) => (
                  <CodePeg
                    key={slot}
                    color={colors[slot]}
                    small
                    onClick={
                      isCurrent && colors[slot]
                        ? () => onRemove(slot)
                        : undefined
                    }
                  />
                ))}
              </div>
              <FeedbackPips result={result} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CodeControls({
  selection,
  disabled,
  onSelect,
  onClear,
  onSubmit,
}: {
  selection: CodeColor[]
  disabled: boolean
  onSelect: (color: CodeColor) => void
  onClear: () => void
  onSubmit: () => void
}) {
  return (
    <div className="space-y-4 rounded-3xl border bg-card p-4 sm:p-5">
      <div>
        <p className="text-sm font-semibold">Build your code</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Each color can be used once.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {CODE_COLORS.map((color) => {
          const selected = selection.includes(color)
          return (
            <button
              key={color}
              type="button"
              disabled={disabled || selected || selection.length >= CODE_LENGTH}
              onClick={() => onSelect(color)}
              aria-label={`Choose ${COLOR_STYLES[color].label}`}
              className={`mx-auto rounded-full p-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 ${
                COLOR_STYLES[color].ring
              } ${selected ? "scale-75 opacity-30" : "hover:scale-110"}`}
            >
              <CodePeg color={color} small />
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={disabled || selection.length === 0}
          aria-label="Clear current code"
        >
          <Eraser className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={disabled || selection.length !== CODE_LENGTH}
        >
          <Send className="mr-2 h-4 w-4" />
          Test Code
        </Button>
      </div>
    </div>
  )
}

function SecretReveal({ code }: { code: CodeColor[] }) {
  return (
    <div className="rounded-3xl border bg-card p-5 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Secret code
      </p>
      <div className="mt-4 flex justify-center gap-3">
        {code.map((color, index) => (
          <CodePeg key={`${color}-${index}`} color={color} />
        ))}
      </div>
    </div>
  )
}

function CodeBreakerPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>(
    invitedRoomCode ? "multiplayer-lobby" : "select",
  )
  const [selection, setSelection] = useState<CodeColor[]>([])
  const [soloSecret, setSoloSecret] = useState<CodeColor[]>([])
  const [soloGuesses, setSoloGuesses] = useState<GuessResult[]>([])
  const [soloFinished, setSoloFinished] = useState(false)
  const [soloSolved, setSoloSolved] = useState(false)
  const [playerName, setPlayerName] = useState("")
  const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copiedRoomCode, setCopiedRoomCode] = useState(false)

  const multiplayer = useMultiplayerCodeBreaker()
  const gameNight = useGameNight()
  const hasGameState = Boolean(
    multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.players[multiplayer.playerId],
  )
  const isGameNightConnection = gameNight.connection?.gameId === "code-breaker"
  const session = useMultiplayerSession({
    game: "code-breaker",
    joinGame: multiplayer.joinGame,
    hasGameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
    disabled: isGameNightConnection,
  })
  const connectGameNightHost = useCallback((roomId: string, name: string) => {
    multiplayer.createGame(name, roomId)
  }, [multiplayer.createGame])
  const bridge = useGameNightGameBridge({
    gameId: "code-breaker",
    hasGameState,
    finished: multiplayer.gameState?.status === "finished",
    connectHost: connectGameNightHost,
    connectPlayer: multiplayer.joinGame,
  })

  useEffect(() => {
    if (invitedRoomCode) setJoinRoomCode(invitedRoomCode)
  }, [invitedRoomCode])

  useEffect(() => {
    if (!multiplayer.gameState || multiplayer.connectionStatus !== "connected") {
      return
    }
    setView(
      multiplayer.gameState.status === "waiting"
        ? "multiplayer-lobby"
        : "multiplayer-game",
    )
    setSelection([])
  }, [multiplayer.connectionStatus, multiplayer.gameState?.status])

  useEffect(() => {
    if (session.isSuppressingErrors()) return
    if (multiplayer.error) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const lobbyPlayers = useMemo(
    () =>
      Object.values(multiplayer.gameState?.players ?? {}).sort(
        (left, right) => left.joinedAt - right.joinedAt,
      ),
    [multiplayer.gameState],
  )
  const racePlayers = useMemo(
    () =>
      [...lobbyPlayers].sort((left, right) => {
        if (left.solvedAt && right.solvedAt) return left.solvedAt - right.solvedAt
        if (left.solvedAt) return -1
        if (right.solvedAt) return 1
        if (right.attempts !== left.attempts) return right.attempts - left.attempts
        return left.joinedAt - right.joinedAt
      }),
    [lobbyPlayers],
  )

  const addColor = (color: CodeColor) => {
    setSelection((current) =>
      current.includes(color) || current.length >= CODE_LENGTH
        ? current
        : [...current, color],
    )
  }

  const removeColor = (index: number) => {
    setSelection((current) => current.filter((_, slot) => slot !== index))
  }

  const startSolo = () => {
    setSoloSecret(generateSecretCode())
    setSoloGuesses([])
    setSoloFinished(false)
    setSoloSolved(false)
    setSelection([])
    setView("solo")
  }

  const submitSoloGuess = () => {
    if (soloFinished || !isValidCodeGuess(selection)) return
    const result = evaluateCodeGuess(soloSecret, selection)
    const nextGuesses = [...soloGuesses, result]
    setSoloGuesses(nextGuesses)
    setSelection([])
    if (result.exact === CODE_LENGTH) {
      setSoloSolved(true)
      setSoloFinished(true)
    } else if (nextGuesses.length >= MAX_ATTEMPTS) {
      setSoloFinished(true)
    }
  }

  const createMultiplayer = () => {
    const name = playerName.trim()
    if (!name) {
      setMessage("Enter your name first.")
      return
    }
    const roomCode = multiplayer.createGame(name)
    session.remember(roomCode, name)
    setMessage(null)
  }

  const joinMultiplayer = () => {
    const name = playerName.trim()
    const roomCode = joinRoomCode.trim().toUpperCase()
    if (!name || !roomCode) {
      setMessage("Enter your name and a room code.")
      return
    }
    multiplayer.joinGame(roomCode, name)
    session.remember(roomCode, name)
    setMessage(null)
  }

  const copyRoomCode = async () => {
    if (!multiplayer.gameState) return
    try {
      await navigator.clipboard.writeText(
        bridge.isGameNight
          ? getGameNightInviteLink(bridge.publicRoomCode)
          : getInviteLink(multiplayer.gameState.roomCode),
      )
      setCopiedRoomCode(true)
      window.setTimeout(() => setCopiedRoomCode(false), 1600)
    } catch {
      setMessage("Could not copy the invite link.")
    }
  }

  const leaveMultiplayer = () => {
    session.forget()
    multiplayer.disconnect()
    setSelection([])
    setMessage(null)
    setView("select")
  }

  const submitMultiplayerGuess = () => {
    if (!isValidCodeGuess(selection)) return
    if (multiplayer.submitGuess(selection)) setSelection([])
  }

  if (bridge.isConnecting) {
    return (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center">
        <p className="text-muted-foreground">Connecting to Game Night...</p>
      </div>
    )
  }

  if (session.isResuming && view === "select") {
    return (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center">
        <p className="text-muted-foreground">Rejoining your game...</p>
      </div>
    )
  }

  if (
    (view === "select" || view === "multiplayer-lobby") &&
    !multiplayer.gameState
  ) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Code Breaker"
          subtitle="Crack the sequence before your friends"
        />
        <main className="relative mx-auto grid max-w-5xl gap-6 overflow-hidden px-4 py-8 md:grid-cols-2">
          <div className="pointer-events-none absolute left-1/2 top-16 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
          <MultiplayerSetupCard
            title="Multiplayer Race"
            description="Everyone gets the same secret. The first player to crack it wins."
            icon={<Users className="h-5 w-5 text-primary" />}
            playerName={playerName}
            roomCode={joinRoomCode}
            createLabel="Create Race Room"
            onPlayerNameChange={setPlayerName}
            onRoomCodeChange={setJoinRoomCode}
            onJoin={joinMultiplayer}
            onCreate={createMultiplayer}
            message={message}
          >
            <div className="rounded-2xl bg-accent/40 p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <LockKeyhole className="h-4 w-4 text-primary" />
                Private boards, shared race
              </p>
              <p className="mt-2">
                Opponents see your progress, never your guesses. The secret stays
                on the server until the race ends.
              </p>
            </div>
          </MultiplayerSetupCard>

          <Card className="overflow-hidden">
            <CardHeader>
              <Binary className="h-7 w-7 text-primary" />
              <CardTitle>Solo Classic</CardTitle>
              <CardDescription>
                Deduce a four-color code in eight attempts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-3xl bg-slate-950 p-5 text-slate-200">
                <div className="flex justify-center gap-3">
                  {CODE_COLORS.slice(0, CODE_LENGTH).map((color) => (
                    <CodePeg key={color} color={color} small />
                  ))}
                </div>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <p className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-white" />
                    Exact color and place
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-white" />
                    Right color, wrong place
                  </p>
                </div>
              </div>
              <Button className="w-full" variant="outline" onClick={startSolo}>
                <Play className="mr-2 h-4 w-4" />
                Start Solo Puzzle
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (view === "solo") {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Code Breaker"
          subtitle={`${soloGuesses.length} of ${MAX_ATTEMPTS} attempts used`}
          onBack={() => setView("select")}
        />
        <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_340px]">
          <CodeBoard
            guesses={soloGuesses}
            currentGuess={selection}
            active={!soloFinished}
            onRemove={removeColor}
          />
          <aside className="space-y-4">
            {soloFinished ? (
              <>
                <Card className="text-center">
                  <CardHeader>
                    {soloSolved ? (
                      <Trophy className="mx-auto h-12 w-12 text-amber-500" />
                    ) : (
                      <LockKeyhole className="mx-auto h-12 w-12 text-violet-500" />
                    )}
                    <CardTitle>
                      {soloSolved ? "Code cracked!" : "The code survived"}
                    </CardTitle>
                    <CardDescription>
                      {soloSolved
                        ? `Solved in ${soloGuesses.length} attempts.`
                        : "Eight attempts used. Study the reveal and try again."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={startSolo}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      New Puzzle
                    </Button>
                  </CardContent>
                </Card>
                <SecretReveal code={soloSecret} />
              </>
            ) : (
              <>
                <CodeControls
                  selection={selection}
                  disabled={false}
                  onSelect={addColor}
                  onClear={() => setSelection([])}
                  onSubmit={submitSoloGuess}
                />
                <div className="rounded-3xl border bg-card p-5 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">Read the clues</p>
                  <p className="mt-2">
                    Filled pips are exact matches. Outlined pips are correct colors
                    in different positions. Their order does not match the pegs.
                  </p>
                </div>
              </>
            )}
          </aside>
        </main>
      </div>
    )
  }

  if (
    view === "multiplayer-lobby" &&
    multiplayer.gameState &&
    multiplayer.playerId
  ) {
    const connectedPlayers = lobbyPlayers.filter(
      (player) => player.connected !== false,
    )
    return (
      <MultiplayerLobby
        title="Code Breaker"
        subtitle="Private boards, one shared secret"
        onBack={leaveMultiplayer}
        players={lobbyPlayers}
        hostId={multiplayer.gameState.hostId}
        currentPlayerId={multiplayer.playerId}
        playerDescription={`${lobbyPlayers.length} of ${multiplayer.gameState.maxPlayers} players`}
        settings={
          <div className="rounded-2xl border bg-accent/30 p-4 text-sm">
            <p className="font-semibold">Classic Race</p>
            <p className="mt-1 text-muted-foreground">
              Four unique colors, eight attempts. First correct code wins.
            </p>
          </div>
        }
        roomCode={bridge.isGameNight ? bridge.publicRoomCode : multiplayer.gameState.roomCode}
        copiedRoomCode={copiedRoomCode}
        onCopyRoomCode={copyRoomCode}
        onStart={multiplayer.startGame}
        onLeave={leaveMultiplayer}
        canStart={connectedPlayers.length >= 2}
        isHost={multiplayer.isHost}
        message={message}
        startLabel="Start Code Race"
      />
    )
  }

  if (
    view === "multiplayer-game" &&
    multiplayer.gameState &&
    multiplayer.playerId
  ) {
    const game = multiplayer.gameState
    const isFinished = game.status === "finished"
    const currentPlayer = game.players[multiplayer.playerId]
    const exhausted = (currentPlayer?.attempts ?? 0) >= MAX_ATTEMPTS
    const winnerName = game.winnerIds[0]
      ? game.players[game.winnerIds[0]]?.name
      : null

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Code Breaker"
          subtitle={isFinished ? "Race complete" : "First correct sequence wins"}
          onBack={leaveMultiplayer}
          rightAction={
            !isFinished ? (
              <span className="font-mono text-xs font-bold">
                {currentPlayer?.attempts ?? 0}/{MAX_ATTEMPTS}
              </span>
            ) : undefined
          }
        />
        <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_340px]">
          <section>
            {isFinished ? (
              <div className="space-y-4">
                <Card className="text-center">
                  <CardHeader>
                    {winnerName ? (
                      <Trophy className="mx-auto h-14 w-14 text-amber-500" />
                    ) : (
                      <LockKeyhole className="mx-auto h-14 w-14 text-violet-500" />
                    )}
                    <CardTitle className="text-3xl">
                      {winnerName ? `${winnerName} cracked it!` : "The code survived"}
                    </CardTitle>
                    <CardDescription>
                      {winnerName
                        ? "The first correct sequence wins the race."
                        : "Every active player used all eight attempts."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {multiplayer.isHost ? (
                      <Button onClick={multiplayer.restartGame}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Race Again
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Waiting for the host to start another race.
                      </p>
                    )}
                  </CardContent>
                </Card>
                {game.revealedCode && <SecretReveal code={game.revealedCode} />}
                <CodeBoard
                  guesses={game.myGuesses}
                  currentGuess={[]}
                  active={false}
                  onRemove={() => {}}
                />
              </div>
            ) : (
              <CodeBoard
                guesses={game.myGuesses}
                currentGuess={selection}
                active={!exhausted}
                onRemove={removeColor}
              />
            )}
          </section>

          <aside className="space-y-4">
            {!isFinished && (
              <CodeControls
                selection={selection}
                disabled={
                  exhausted || multiplayer.connectionStatus !== "connected"
                }
                onSelect={addColor}
                onClear={() => setSelection([])}
                onSubmit={submitMultiplayerGuess}
              />
            )}
            {exhausted && !isFinished && (
              <div className="rounded-3xl border bg-card p-5 text-sm text-muted-foreground">
                Your board is locked. Waiting for the remaining players.
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Race progress</CardTitle>
                <CardDescription>
                  Attempts are public. Guess patterns stay private.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {racePlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between rounded-2xl px-3 py-3 ${
                      player.id === multiplayer.playerId
                        ? "bg-primary/10"
                        : "bg-accent/40"
                    } ${player.connected === false ? "opacity-60" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-5 text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{player.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {player.connected === false
                            ? "Reconnecting..."
                            : player.solvedAt
                              ? "Code cracked"
                              : `${player.attempts}/${MAX_ATTEMPTS} attempts`}
                        </p>
                      </div>
                    </div>
                    {player.solvedAt && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    )}
                  </div>
                ))}
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  onClick={leaveMultiplayer}
                >
                  Leave Room
                </Button>
              </CardContent>
            </Card>
          </aside>
        </main>
      </div>
    )
  }

  return null
}
