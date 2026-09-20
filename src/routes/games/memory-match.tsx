import { createFileRoute } from "@tanstack/react-router"
import {
  Brain,
  Clock3,
  Grid2X2,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import {
  MemoryBoard,
  type MemoryCardView,
} from "@/components/games/memory-match/MemoryBoard"
import { useMultiplayerMemoryMatch } from "@/components/games/memory-match/useMultiplayerMemoryMatch"
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
  formatMemoryTime,
  generateMemoryBoard,
  MEMORY_BOARD_SIZE,
  MEMORY_MISMATCH_MS,
  MEMORY_PAIR_COUNT,
  type MemorySymbol,
} from "@/lib/memoryMatch"
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"

export const Route = createFileRoute("/games/memory-match")({
  validateSearch: parseInviteSearch,
  component: MemoryMatchPage,
})

type GameView = "select" | "solo" | "multiplayer-lobby" | "multiplayer-game"

function MemoryMatchPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>(
    invitedRoomCode ? "multiplayer-lobby" : "select",
  )
  const [now, setNow] = useState(Date.now())
  const [soloBoard, setSoloBoard] = useState<MemorySymbol[]>([])
  const [soloMatched, setSoloMatched] = useState<number[]>([])
  const [soloFirstFlip, setSoloFirstFlip] = useState<number | null>(null)
  const [soloMismatch, setSoloMismatch] = useState<
    [number, number] | null
  >(null)
  const [soloMoves, setSoloMoves] = useState(0)
  const [soloStartedAt, setSoloStartedAt] = useState<number | null>(null)
  const [soloFinishedAt, setSoloFinishedAt] = useState<number | null>(null)
  const mismatchTimeoutRef = useRef<number | null>(null)

  const [playerName, setPlayerName] = useState("")
  const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copiedRoomCode, setCopiedRoomCode] = useState(false)

  const multiplayer = useMultiplayerMemoryMatch()
  const gameNight = useGameNight()
  const hasGameState = Boolean(
    multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.players[multiplayer.playerId],
  )
  const isGameNightConnection = gameNight.connection?.gameId === "memory-match"
  const session = useMultiplayerSession({
    game: "memory-match",
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
    gameId: "memory-match",
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
  }, [multiplayer.connectionStatus, multiplayer.gameState?.status])

  useEffect(() => {
    if (session.isSuppressingErrors()) return
    if (multiplayer.error) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const soloActive = view === "solo" && !soloFinishedAt
  const multiplayerActive =
    view === "multiplayer-game" &&
    multiplayer.gameState?.status === "playing"
  useEffect(() => {
    if (!soloActive && !multiplayerActive) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [soloActive, multiplayerActive])

  useEffect(() => {
    return () => {
      if (mismatchTimeoutRef.current) {
        window.clearTimeout(mismatchTimeoutRef.current)
      }
    }
  }, [])

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
        if (left.completedAt && right.completedAt) {
          return left.completedAt - right.completedAt
        }
        if (left.completedAt) return -1
        if (right.completedAt) return 1
        if (right.pairs !== left.pairs) return right.pairs - left.pairs
        if (left.moves !== right.moves) return left.moves - right.moves
        return left.joinedAt - right.joinedAt
      }),
    [lobbyPlayers],
  )

  const soloCards = useMemo<MemoryCardView[]>(() => {
    const matched = new Set(soloMatched)
    const temporarilyVisible = new Set(soloMismatch ?? [])
    if (soloFirstFlip !== null) temporarilyVisible.add(soloFirstFlip)
    return Array.from({ length: MEMORY_BOARD_SIZE }, (_, index) => {
      const state = matched.has(index)
        ? "matched"
        : temporarilyVisible.has(index)
          ? "visible"
          : "hidden"
      return {
        state,
        symbol: state === "hidden" ? undefined : soloBoard[index],
      }
    })
  }, [soloBoard, soloFirstFlip, soloMatched, soloMismatch])

  const startSolo = () => {
    if (mismatchTimeoutRef.current) {
      window.clearTimeout(mismatchTimeoutRef.current)
    }
    const startedAt = Date.now()
    setSoloBoard(generateMemoryBoard())
    setSoloMatched([])
    setSoloFirstFlip(null)
    setSoloMismatch(null)
    setSoloMoves(0)
    setSoloStartedAt(startedAt)
    setSoloFinishedAt(null)
    setNow(startedAt)
    setView("solo")
  }

  const flipSoloCard = (index: number) => {
    if (
      soloFinishedAt ||
      soloMismatch ||
      soloMatched.includes(index) ||
      soloFirstFlip === index
    ) {
      return
    }
    if (soloFirstFlip === null) {
      setSoloFirstFlip(index)
      return
    }

    const firstIndex = soloFirstFlip
    const nextMoves = soloMoves + 1
    setSoloMoves(nextMoves)
    setSoloFirstFlip(null)
    if (soloBoard[firstIndex] === soloBoard[index]) {
      const nextMatched = [...soloMatched, firstIndex, index]
      setSoloMatched(nextMatched)
      if (nextMatched.length === MEMORY_BOARD_SIZE) {
        setSoloFinishedAt(Date.now())
      }
      return
    }

    setSoloMismatch([firstIndex, index])
    mismatchTimeoutRef.current = window.setTimeout(() => {
      setSoloMismatch(null)
      mismatchTimeoutRef.current = null
    }, MEMORY_MISMATCH_MS)
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
    setMessage(null)
    setView("select")
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
          title="Memory Match"
          subtitle="Find every pair before your friends"
        />
        <main className="relative mx-auto grid max-w-5xl gap-6 overflow-hidden px-4 py-8 md:grid-cols-2">
          <div className="pointer-events-none absolute right-10 top-10 -z-10 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <MultiplayerSetupCard
            title="Multiplayer Race"
            description="Everyone gets the same shuffled board. Your flips stay private."
            icon={<Users className="h-5 w-5 text-primary" />}
            playerName={playerName}
            roomCode={joinRoomCode}
            createLabel="Create Memory Room"
            onPlayerNameChange={setPlayerName}
            onRoomCodeChange={setJoinRoomCode}
            onJoin={joinMultiplayer}
            onCreate={createMultiplayer}
            message={message}
          >
            <div className="rounded-2xl bg-accent/40 p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Same puzzle, private progress
              </p>
              <p className="mt-2">
                Match all eight pairs first. Opponents see your pair count and
                moves, never your revealed cards.
              </p>
            </div>
          </MultiplayerSetupCard>

          <Card>
            <CardHeader>
              <Brain className="h-7 w-7 text-primary" />
              <CardTitle>Solo Memory</CardTitle>
              <CardDescription>
                Clear the 4×4 board in as few moves as possible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 rounded-3xl bg-slate-950 p-5 text-sm text-slate-200">
                <p className="flex items-center gap-2">
                  <Grid2X2 className="h-4 w-4 text-cyan-300" />
                  8 symbol pairs
                </p>
                <p className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-violet-300" />
                  Live timer
                </p>
                <p className="col-span-2 text-slate-400">
                  Wrong pairs stay visible briefly, then turn back over.
                </p>
              </div>
              <Button className="w-full" variant="outline" onClick={startSolo}>
                <Play className="mr-2 h-4 w-4" />
                Start Solo Board
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (view === "solo") {
    const elapsed =
      soloStartedAt === null
        ? 0
        : (soloFinishedAt ?? now) - soloStartedAt
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Memory Match"
          subtitle={`${soloMatched.length / 2} of ${MEMORY_PAIR_COUNT} pairs`}
          onBack={() => setView("select")}
          rightAction={
            <span className="font-mono text-xs font-bold">
              {formatMemoryTime(elapsed)}
            </span>
          }
        />
        <main className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_320px]">
          <MemoryBoard
            cards={soloCards}
            disabled={Boolean(soloFinishedAt || soloMismatch)}
            onFlip={flipSoloCard}
          />
          <aside className="space-y-4">
            {soloFinishedAt ? (
              <Card className="text-center">
                <CardHeader>
                  <Trophy className="mx-auto h-12 w-12 text-amber-500" />
                  <CardTitle>Board cleared!</CardTitle>
                  <CardDescription>
                    {soloMoves} moves in {formatMemoryTime(elapsed)}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={startSolo}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    New Board
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Your run</CardTitle>
                  <CardDescription>
                    Build a mental map and avoid repeat misses.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-accent/40 p-4 text-center">
                    <p className="text-2xl font-black">{soloMoves}</p>
                    <p className="text-xs text-muted-foreground">Moves</p>
                  </div>
                  <div className="rounded-2xl bg-accent/40 p-4 text-center">
                    <p className="text-2xl font-black">
                      {soloMatched.length / 2}
                    </p>
                    <p className="text-xs text-muted-foreground">Pairs</p>
                  </div>
                </CardContent>
              </Card>
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
        title="Memory Match"
        subtitle="One layout, private boards"
        onBack={leaveMultiplayer}
        players={lobbyPlayers}
        hostId={multiplayer.gameState.hostId}
        currentPlayerId={multiplayer.playerId}
        playerDescription={`${lobbyPlayers.length} of ${multiplayer.gameState.maxPlayers} players`}
        settings={
          <div className="rounded-2xl border bg-accent/30 p-4 text-sm">
            <p className="font-semibold">4×4 Memory Race</p>
            <p className="mt-1 text-muted-foreground">
              Eight pairs. Three-second countdown. First clear wins.
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
        startLabel="Start Memory Race"
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
    const serverNow =
      game.serverNow + Math.max(0, now - multiplayer.stateReceivedAt)
    const countdown = game.startsAt
      ? Math.max(0, Math.ceil((game.startsAt - serverNow) / 1000))
      : 0
    const mismatchLocked = Boolean(
      game.myLockedUntil && game.myLockedUntil > serverNow,
    )
    const matched = new Set(game.myMatchedIndices)
    const cards: MemoryCardView[] = Array.from(
      { length: MEMORY_BOARD_SIZE },
      (_, index) => {
        if (isFinished && game.revealedBoard) {
          return { state: "visible", symbol: game.revealedBoard[index] }
        }
        const symbol = game.myVisibleCards[index]
        const isMatched = matched.has(index)
        const visible =
          isMatched ||
          (Boolean(symbol) &&
            (!game.myLockedUntil || game.myLockedUntil > serverNow))
        return {
          state: isMatched ? "matched" : visible ? "visible" : "hidden",
          symbol: isMatched || visible ? symbol : undefined,
        }
      },
    )
    const currentPlayer = game.players[multiplayer.playerId]
    const elapsed = game.startsAt
      ? (game.finishedAt ?? serverNow) - game.startsAt
      : 0

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Memory Match"
          subtitle={
            isFinished
              ? "Race complete"
              : countdown > 0
                ? "Board unlocks after the countdown"
                : "Find all eight pairs first"
          }
          onBack={leaveMultiplayer}
          rightAction={
            countdown > 0 ? (
              <span className="text-2xl font-black text-primary">{countdown}</span>
            ) : (
              <span className="font-mono text-xs font-bold">
                {formatMemoryTime(elapsed)}
              </span>
            )
          }
        />
        <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-4">
            {isFinished && (
              <Card className="text-center">
                <CardHeader>
                  <Trophy className="mx-auto h-14 w-14 text-amber-500" />
                  <CardTitle className="text-3xl">
                    {game.winner?.id === multiplayer.playerId
                      ? "You won the race!"
                      : `${game.winner?.name ?? "A player"} wins!`}
                  </CardTitle>
                  <CardDescription>
                    {game.winner
                      ? `${game.winner.moves} moves in ${formatMemoryTime(
                          game.startsAt
                            ? game.winner.completedAt - game.startsAt
                            : 0,
                        )}.`
                      : "The board is complete."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
            )}
            <div className="relative">
              <MemoryBoard
                cards={cards}
                disabled={
                  isFinished ||
                  countdown > 0 ||
                  mismatchLocked ||
                  multiplayer.connectionStatus !== "connected"
                }
                onFlip={(index) => multiplayer.flipCard(index, game.roundId)}
              />
              {countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[2rem] bg-slate-950/65 backdrop-blur-sm">
                  <div className="text-center text-white">
                    <p className="text-6xl font-black">{countdown}</p>
                    <p className="mt-2 text-sm uppercase tracking-[0.25em] text-cyan-200">
                      Get ready
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your board</CardTitle>
                <CardDescription>
                  {currentPlayer?.pairs ?? 0} pairs in {currentPlayer?.moves ?? 0}{" "}
                  moves
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-accent/40 p-4 text-center">
                  <p className="text-2xl font-black">
                    {currentPlayer?.pairs ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Pairs</p>
                </div>
                <div className="rounded-2xl bg-accent/40 p-4 text-center">
                  <p className="text-2xl font-black">
                    {currentPlayer?.moves ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Moves</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Race progress</CardTitle>
                <CardDescription>
                  Pair counts are public. Card positions stay private.
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
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {index + 1}. {player.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {player.connected === false
                          ? "Reconnecting..."
                          : `${player.pairs}/${MEMORY_PAIR_COUNT} pairs · ${player.moves} moves`}
                      </p>
                    </div>
                    <span className="text-lg font-black">{player.pairs}</span>
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
