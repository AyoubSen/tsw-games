import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowLeft,
  Bot,
  Dices,
  MousePointerClick,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import {
  LudoBoard,
  type LudoMoveTarget,
  type LudoTokenView,
} from "@/components/games/ludo/LudoBoard"
import { useMultiplayerLudo } from "@/components/games/ludo/useMultiplayerLudo"
import { BotLevelPicker } from "@/components/multiplayer/BotLevelPicker"
import { ReactionBubble, ReactionPicker } from "@/components/multiplayer/Reactions"
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
import { BOT_LEVEL_LABELS } from "@/lib/botLevel"
import {
  getGameNightInviteLink,
  getInviteLink,
  parseInviteSearch,
} from "@/lib/inviteLinks"
import {
  countTokensHome,
  getTeamOfSeat,
  getTokenCell,
  LUDO_BASE,
  LUDO_COLORS,
  type LudoMove,
} from "@/lib/ludo"
import { useMultiplayerSession } from "@/lib/multiplayerSession"

export const Route = createFileRoute("/games/ludo")({
  validateSearch: parseInviteSearch,
  component: LudoPage,
})

/** How long the die tumbles, then how long the result stays up before play moves on. */
const ROLL_TUMBLE_MS = 1100
const ROLL_HOLD_MS = 1500

type GameView = "select" | "multiplayer-lobby" | "multiplayer-game"

function LudoPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>(
    invitedRoomCode ? "multiplayer-lobby" : "select",
  )
  const [now, setNow] = useState(Date.now())
  const [playerName, setPlayerName] = useState("")
  const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copiedRoomCode, setCopiedRoomCode] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [tumblingFaces, setTumblingFaces] = useState<[number, number]>([1, 1])
  /** Pawn picked when it has more than one move, to narrow the targets. */
  const [selectedPawn, setSelectedPawn] = useState<string | null>(null)
  /** Board and turn as they were before the latest roll, held while it plays out. */
  const [frozen, setFrozen] = useState<{
    positions: number[][]
    turnSeat: number
  } | null>(null)

  const multiplayer = useMultiplayerLudo()
  const gameNight = useGameNight()
  const hasGameState = Boolean(
    multiplayer.gameState &&
      multiplayer.playerId &&
      multiplayer.gameState.players[multiplayer.playerId],
  )
  const isGameNightConnection = gameNight.connection?.gameId === "ludo"
  const session = useMultiplayerSession({
    game: "ludo",
    joinGame: multiplayer.joinGame,
    hasGameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
    disabled: isGameNightConnection,
  })
  const connectGameNightHost = useCallback(
    (roomId: string, name: string) => {
      multiplayer.createGame(name, roomId)
    },
    [multiplayer.createGame],
  )
  const bridge = useGameNightGameBridge({
    gameId: "ludo",
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

  const seatPositions = useMemo(() => {
    const game = multiplayer.gameState
    if (!game) return []
    return game.seatOrder.map((id) =>
      id ? (game.players[id]?.tokens ?? []) : [],
    )
  }, [multiplayer.gameState])

  // Tumble the die whenever a new roll lands, whoever rolled it.
  const rollId = multiplayer.gameState?.lastRoll?.rollId
  const seenRollId = useRef<number | null>(null)
  const previousPositions = useRef<number[][]>([])
  const previousTurnSeat = useRef(0)
  useEffect(() => {
    if (!rollId) {
      seenRollId.current = null
      setIsRolling(false)
      setFrozen(null)
      return
    }
    // Joining or reconnecting mid-game arrives with a roll already on the
    // table - show it settled rather than replaying someone else's throw.
    if (seenRollId.current === null) {
      seenRollId.current = rollId
      return
    }
    if (seenRollId.current === rollId) return
    seenRollId.current = rollId

    // A roll with no moves (or a third double) has already passed the turn -
    // hold the board and turn on the pre-roll state until the dice have
    // settled and been read.
    setFrozen({
      positions: previousPositions.current,
      turnSeat: previousTurnSeat.current,
    })
    setIsRolling(true)
    const tumble = window.setInterval(
      () =>
        setTumblingFaces([
          1 + Math.floor(Math.random() * 6),
          1 + Math.floor(Math.random() * 6),
        ]),
      150,
    )
    const settle = window.setTimeout(() => {
      window.clearInterval(tumble)
      setIsRolling(false)
    }, ROLL_TUMBLE_MS)
    const release = window.setTimeout(
      () => setFrozen(null),
      ROLL_TUMBLE_MS + ROLL_HOLD_MS,
    )
    return () => {
      window.clearInterval(tumble)
      window.clearTimeout(settle)
      window.clearTimeout(release)
    }
  }, [rollId])

  // Declared after the roll effect so it still holds the pre-roll snapshot
  // on the render where a new roll arrives.
  useEffect(() => {
    previousPositions.current = seatPositions
  }, [seatPositions])
  const liveTurnSeat = multiplayer.gameState?.turnSeat ?? 0
  useEffect(() => {
    previousTurnSeat.current = liveTurnSeat
  }, [liveTurnSeat])

  const isPlaying = multiplayer.gameState?.status === "playing"
  useEffect(() => {
    if (!isPlaying) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [isPlaying])

  const lobbyPlayers = useMemo(
    () =>
      Object.values(multiplayer.gameState?.players ?? {}).sort(
        (left, right) => left.joinedAt - right.joinedAt,
      ),
    [multiplayer.gameState],
  )

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
        <GameTopBar title="Parcheesi" subtitle="Race four pawns home" />
        <main className="relative mx-auto grid max-w-5xl gap-6 overflow-hidden px-4 py-8 md:grid-cols-2">
          <div className="pointer-events-none absolute right-10 top-10 -z-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
          <MultiplayerSetupCard
            title="Parcheesi Table"
            description="Play solo against bots, free-for-all, or 2v2 teams."
            icon={<Users className="h-5 w-5 text-primary" />}
            playerName={playerName}
            roomCode={joinRoomCode}
            createLabel="Create Parcheesi Room"
            onPlayerNameChange={setPlayerName}
            onRoomCodeChange={setJoinRoomCode}
            onJoin={joinMultiplayer}
            onCreate={createMultiplayer}
            message={message}
          >
            <div className="rounded-2xl bg-accent/40 p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Classic rules
              </p>
              <p className="mt-2">
                Two dice, blockades, and big bonus moves for captures and
                pawns reaching home. Add bots in the lobby to fill empty
                seats.
              </p>
            </div>
          </MultiplayerSetupCard>

          <Card>
            <CardHeader>
              <Dices className="h-7 w-7 text-primary" />
              <CardTitle>How it plays</CardTitle>
              <CardDescription>
                US rules - the American take on India's Pachisi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Roll two dice and move one pawn by each, or one pawn by both.
                A 5 - on one die or adding up - brings a pawn out of the nest.
              </p>
              <p>
                Land on an opponent outside a safe square to send them home and
                move any pawn 20 bonus squares. Getting a pawn home earns 10.
              </p>
              <p>
                Two of your pawns on one square form a blockade nobody can
                pass.
              </p>
              <p>
                Doubles roll again, and once all your pawns are out you also use
                the opposite faces. A third double in a row sends your lead pawn
                back to the nest.
              </p>
              <p>
                In 2v2, partners sit opposite, never capture each other, and
                take over their partner's pawns once their own are home.
              </p>
            </CardContent>
          </Card>
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
    const game = multiplayer.gameState
    const isTeams = game.mode === "teams"
    const bots = lobbyPlayers.filter((player) => player.isBot)
    const canAddBot =
      multiplayer.isHost && lobbyPlayers.length < game.maxPlayers
    return (
      <MultiplayerLobby
        title="Parcheesi"
        subtitle="Four colours, one race home"
        onBack={leaveMultiplayer}
        players={lobbyPlayers}
        hostId={multiplayer.gameState.hostId}
        currentPlayerId={multiplayer.playerId}
        playerDescription={`${lobbyPlayers.length} of ${multiplayer.gameState.maxPlayers} players`}
        settings={
          <div className="space-y-3">
            <div className="rounded-2xl border bg-accent/30 p-4 text-sm">
              <p className="font-semibold">Mode</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={isTeams ? "outline" : "default"}
                  disabled={!multiplayer.isHost}
                  onClick={() => multiplayer.setMode("classic")}
                >
                  Free for all
                </Button>
                <Button
                  size="sm"
                  variant={isTeams ? "default" : "outline"}
                  disabled={!multiplayer.isHost}
                  onClick={() => multiplayer.setMode("teams")}
                >
                  <Users className="mr-1 h-3.5 w-3.5" />
                  Teams 2v2
                </Button>
              </div>
              <p className="mt-2 text-muted-foreground">
                {isTeams
                  ? "Red + Yellow against Green + Blue. Partners never capture each other, and once your pawns are all home you play your partner's. Needs exactly 4 players."
                  : "Colours are handed out in join order. Turns time out after 45 seconds."}
              </p>
            </div>

            <div className="rounded-2xl border bg-accent/30 p-4 text-sm">
              <p className="font-semibold">Game length</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={game.quick ? "outline" : "default"}
                  disabled={!multiplayer.isHost}
                  onClick={() => multiplayer.setQuick(false)}
                >
                  Classic
                </Button>
                <Button
                  size="sm"
                  variant={game.quick ? "default" : "outline"}
                  disabled={!multiplayer.isHost}
                  onClick={() => multiplayer.setQuick(true)}
                >
                  Quick game
                </Button>
              </div>
              <p className="mt-2 text-muted-foreground">
                {game.quick
                  ? "Two pawns each, and a 5 or a 6 on either die brings a pawn out."
                  : "Four pawns each, and a 5 brings a pawn out."}
              </p>
            </div>

            <div className="rounded-2xl border bg-accent/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Bots</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canAddBot}
                  onClick={multiplayer.addBot}
                >
                  <Bot className="mr-1 h-3.5 w-3.5" />
                  Add bot
                </Button>
              </div>
              {bots.length === 0 ? (
                <p className="mt-2 text-muted-foreground">
                  Fill empty seats with bots to start without a full table.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {bots.map((bot) => (
                    <li
                      key={bot.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                        {bot.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <BotLevelPicker
                          name={bot.name}
                          level={bot.botLevel}
                          disabled={!multiplayer.isHost}
                          onChange={(level) => multiplayer.setBotLevel(bot.id, level)}
                        />
                        {multiplayer.isHost && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => multiplayer.removePlayer(bot.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        }
        roomCode={
          bridge.isGameNight
            ? bridge.publicRoomCode
            : multiplayer.gameState.roomCode
        }
        copiedRoomCode={copiedRoomCode}
        onCopyRoomCode={copyRoomCode}
        onStart={multiplayer.startGame}
        onLeave={leaveMultiplayer}
        canStart={
          isTeams ? connectedPlayers.length === 4 : connectedPlayers.length >= 2
        }
        isHost={multiplayer.isHost}
        message={message}
        startLabel={isTeams ? "Start 2v2" : "Start Parcheesi"}
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
    const mySeat = game.players[multiplayer.playerId]?.seat ?? null
    const isMyTurn = !isFinished && mySeat !== null && mySeat === game.turnSeat
    const movableTokens = new Set(
      isMyTurn
        ? game.legalMoves.map((move) => `${move.seat}-${move.tokenIndex}`)
        : [],
    )
    const seatPlayers = game.seatOrder.map((id) =>
      id ? (game.players[id] ?? null) : null,
    )
    const serverNow =
      game.serverNow + Math.max(0, now - multiplayer.stateReceivedAt)
    const secondsLeft = game.turnDeadline
      ? Math.max(0, Math.ceil((game.turnDeadline - serverNow) / 1000))
      : null

    // The roll effect only freezes the board after this render commits, so on
    // the render a new roll arrives, hold the pre-roll view here instead -
    // otherwise pawns start moving (then snap back) before the die has rolled.
    const rollJustArrived =
      rollId != null &&
      seenRollId.current !== null &&
      seenRollId.current !== rollId
    const heldView = rollJustArrived
      ? {
          positions: previousPositions.current,
          turnSeat: previousTurnSeat.current,
        }
      : frozen
    const rolling = isRolling || rollJustArrived
    const rolledValues = game.lastRoll?.values ?? null
    const shownFaces = rolling ? tumblingFaces : rolledValues
    const isHolding = heldView !== null
    // Shown turn lags the server while a roll plays out on screen.
    const turnSeat = heldView?.turnSeat ?? game.turnSeat
    const canRoll = isMyTurn && game.dice === null && !isHolding
    const mustChoose =
      isMyTurn && !rolling && game.dice !== null && game.legalMoves.length > 0
    const choosableMoves = mustChoose ? game.legalMoves : []
    const pawnMoves = (seat: number, tokenIndex: number) =>
      choosableMoves.filter(
        (move) => move.seat === seat && move.tokenIndex === tokenIndex,
      )
    // Landing spots only show once a pawn is picked.
    const activePawn =
      selectedPawn &&
      choosableMoves.some(
        (move) => `${move.seat}-${move.tokenIndex}` === selectedPawn,
      )
        ? selectedPawn
        : null
    const pickedMoves = activePawn
      ? choosableMoves.filter(
          (move) => `${move.seat}-${move.tokenIndex}` === activePawn,
        )
      : []

    const shownPositions = heldView?.positions ?? seatPositions
    const tokens: LudoTokenView[] = seatPlayers.flatMap((player, seat) =>
      player
        ? player.tokens.map((position, tokenIndex) => ({
            seat,
            tokenIndex,
            position: shownPositions[seat]?.[tokenIndex] ?? position,
            movable: mustChoose && movableTokens.has(`${seat}-${tokenIndex}`),
          }))
        : [],
    )
    const orderedSeats = seatPlayers
      .map((player, seat) => ({ player, seat }))
      .filter(
        (entry): entry is { player: NonNullable<typeof entry.player>; seat: number } =>
          entry.player !== null,
      )
      .sort((left, right) =>
        game.mode === "teams"
          ? getTeamOfSeat(left.seat) - getTeamOfSeat(right.seat) ||
            left.seat - right.seat
          : left.seat - right.seat,
      )
    const moveLabel = (move: LudoMove) =>
      move.from === LUDO_BASE
        ? "Out"
        : `${move.finishes ? "Home " : ""}+${move.to - move.from}`
    const targets: LudoMoveTarget[] = pickedMoves.map((move) => {
      const [row, col] = getTokenCell(move.seat, move.tokenIndex, move.to)
      return {
        id: move.id,
        seat: move.seat,
        tokenIndex: move.tokenIndex,
        row,
        col,
        label: moveLabel(move),
      }
    })

    const turnPlayer = seatPlayers[turnSeat]
    const turnColor = isFinished ? "#f59e0b" : LUDO_COLORS[turnSeat].hex
    const mySeatColor = mySeat !== null ? LUDO_COLORS[mySeat].hex : undefined
    const rollerSeat = game.lastRoll?.seat ?? null
    const rollerName =
      rollerSeat === mySeat
        ? "You"
        : rollerSeat !== null
          ? (seatPlayers[rollerSeat]?.name ?? "Someone")
          : "Someone"
    const rollText = rolledValues
      ? rolledValues[0] === rolledValues[1]
        ? `double ${rolledValues[0]}s`
        : `${rolledValues[0]} and ${rolledValues[1]}`
      : ""
    const statusText = isFinished
      ? "Game over"
      : rolling
        ? rollerSeat === mySeat
          ? "Rolling..."
          : `${rollerName} is rolling...`
        : mustChoose
          ? activePawn
            ? "Pick where that pawn goes"
            : "Tap a glowing pawn to see where it can go"
          : isHolding && rolledValues
            ? `${rollerName} rolled ${rollText}`
            : canRoll
              ? rolledValues &&
                game.lastRoll?.seat === mySeat &&
                rolledValues[0] === rolledValues[1]
                ? "Doubles - roll again!"
                : "Your turn - roll the dice"
              : `${turnPlayer?.name ?? "A player"}'s turn`
    const showTimer = secondsLeft !== null && !isFinished && !isHolding
    // Newest first; hold back whatever the current roll caused until it has been shown.
    const log = game.log
      .filter((entry) => !isHolding || entry.rollId !== game.lastRoll?.rollId)
      .slice(-8)
      .reverse()
    const glass =
      "pointer-events-auto rounded-2xl border border-white/10 bg-black/40 shadow-2xl backdrop-blur-md"
    const sendMove = (moveId: string) => {
      if (multiplayer.connectionStatus !== "connected") return
      multiplayer.moveToken(moveId, game.roundId)
      setSelectedPawn(null)
    }
    const selectPawn = (seat: number, tokenIndex: number) => {
      if (pawnMoves(seat, tokenIndex).length === 0) return
      const key = `${seat}-${tokenIndex}`
      setSelectedPawn((current) => (current === key ? null : key))
    }

    return (
      <div
        className="relative h-[calc(100dvh-73px)] min-h-[560px] w-full overflow-hidden text-white"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 42%, #2f6b57 0%, #174034 48%, #07170f 100%)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-radial-gradient(circle at 30% 20%, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-[background] duration-700"
          style={{
            background: `radial-gradient(55% 55% at 50% 50%, ${turnColor}2e, transparent 75%)`,
          }}
        />

        {/* Board - leaves room for the panels on small screens, fills the table on large ones. */}
        <div className="absolute inset-x-0 top-[124px] bottom-[176px] lg:inset-x-0 lg:top-14 lg:bottom-0">
          <LudoBoard
            tokens={tokens}
            targets={targets}
            activeSeats={seatPlayers
              .map((player, seat) => (player ? seat : -1))
              .filter((seat) => seat !== -1)}
            viewSeat={mySeat}
            turnSeat={isFinished ? null : turnSeat}
            dice={{ values: shownFaces, rolling }}
            selectedPawn={activePawn}
            lastMove={
              game.lastMove
                ? { ...game.lastMove, key: String(game.lastMove.moveId) }
                : null
            }
            onSelectPawn={selectPawn}
            onSelectTarget={sendMove}
          />
        </div>

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center gap-2 lg:inset-x-6 lg:top-5">
          <button
            type="button"
            onClick={leaveMultiplayer}
            className={`${glass} flex h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition hover:bg-black/60`}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
          <div className="hidden pl-2 lg:block">
            <p className="text-lg font-black leading-none tracking-tight">Parcheesi</p>
            <p className="text-xs text-white/60">
              {game.mode === "teams" ? "Teams 2v2" : "Free for all"}
              {game.quick ? " · Quick game" : ""}
            </p>
          </div>
          <div
            className={`${glass} flex h-11 min-w-0 flex-1 items-center gap-3 px-4 transition-colors duration-500 lg:absolute lg:left-1/2 lg:min-w-[340px] lg:max-w-[560px] lg:flex-none lg:-translate-x-1/2 ${
              mustChoose ? "border-amber-300/70 bg-amber-500/25" : ""
            }`}
          >
            {mustChoose ? (
              <MousePointerClick className="h-4 w-4 shrink-0 text-amber-200" />
            ) : (
              <span
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 rounded-full ${isFinished ? "" : "animate-pulse"}`}
                style={{ background: turnColor, boxShadow: `0 0 14px ${turnColor}` }}
              />
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {statusText}
            </p>
            {showTimer && (
              <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 font-mono text-xs font-bold tabular-nums">
                {secondsLeft}s
              </span>
            )}
          </div>
          <div className="ml-auto shrink-0">
            <ReactionPicker
              onReact={multiplayer.react}
              disabled={multiplayer.connectionStatus !== "connected"}
              side="bottom"
              align="end"
            />
          </div>
        </div>

        {/* Players - chips on small screens */}
        <div className="pointer-events-none absolute inset-x-3 top-[64px] flex gap-2 overflow-x-auto pb-14 lg:hidden">
          {orderedSeats.map(({ player, seat }) => {
            const color = LUDO_COLORS[seat].hex
            const isTurn = seat === turnSeat && !isFinished
            const home = countTokensHome(player.tokens)
            return (
              <div
                key={player.id}
                className={`${glass} relative flex h-12 shrink-0 items-center gap-2 px-2.5 transition-all ${
                  player.connected === false ? "opacity-60" : ""
                }`}
                style={isTurn ? { borderColor: color, boxShadow: `0 0 18px ${color}66` } : undefined}
              >
                <ReactionBubble bubble={multiplayer.reactions[player.id]} side="bottom" />
                <PlayerAvatar name={player.name} isBot={player.isBot} color={color} small />
                <div className="min-w-0">
                  <p className="flex max-w-[88px] items-center gap-1 text-xs font-semibold">
                    <span className="truncate">{player.id === multiplayer.playerId ? "You" : player.name}</span>
                    {player.isBot && player.botLevel && (
                      <span
                        title={`${BOT_LEVEL_LABELS[player.botLevel]} bot`}
                        className="shrink-0 rounded-full bg-white/15 px-1 text-[9px] font-black uppercase text-white/70"
                      >
                        {BOT_LEVEL_LABELS[player.botLevel][0]}
                      </span>
                    )}
                  </p>
                  <HomePips home={home} total={player.tokens.length} color={color} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Players - side panel on large screens */}
        <div className={`${glass} absolute left-6 top-24 hidden w-72 p-3 lg:block`}>
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
            {game.mode === "teams" ? "Teams" : "Players"}
          </p>
          <div className="space-y-2">
            {orderedSeats.map(({ player, seat }) => {
              const color = LUDO_COLORS[seat].hex
              const isTurn = seat === turnSeat && !isFinished
              const home = countTokensHome(player.tokens)
              return (
                <div
                  key={player.id}
                  className={`relative flex items-center gap-3 rounded-xl border py-2.5 pl-3.5 pr-3 transition-all duration-300 ${
                    isTurn ? "" : "border-transparent bg-white/5"
                  } ${player.connected === false ? "opacity-60" : ""}`}
                  style={
                    isTurn
                      ? {
                          borderColor: color,
                          background: `${color}26`,
                          boxShadow: `0 0 22px ${color}40`,
                        }
                      : undefined
                  }
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
                    style={{ background: color }}
                  />
                  <ReactionBubble bubble={multiplayer.reactions[player.id]} side="right" className="ml-6" />
                  <PlayerAvatar name={player.name} isBot={player.isBot} color={color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {player.name}
                      {player.id === multiplayer.playerId ? " (you)" : ""}
                    </p>
                    <p className="text-[11px] text-white/55">
                      {player.connected === false && !player.isBot
                        ? "Reconnecting..."
                        : game.mode === "teams"
                          ? `${LUDO_COLORS[seat].label} · Team ${getTeamOfSeat(seat) + 1}`
                          : LUDO_COLORS[seat].label}
                      {player.isBot && player.botLevel && ` · ${BOT_LEVEL_LABELS[player.botLevel]} bot`}
                    </p>
                  </div>
                  <HomePips home={home} total={player.tokens.length} color={color} />
                </div>
              )
            })}
          </div>
          {log.length > 0 && (
            <>
              <p className="px-1 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-white/50">
                Recent
              </p>
              <ol className="max-h-56 space-y-1.5 overflow-y-auto px-1">
                {log.map((entry, index) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: log is append-only and capped
                    key={`${entry.rollId}-${index}`}
                    className={`text-xs leading-snug ${
                      index === 0 ? "text-white" : "text-white/55"
                    }`}
                  >
                    {entry.text}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {/* Dice tray */}
        <div
          className={`${glass} absolute inset-x-3 bottom-3 overflow-hidden lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-80`}
        >
          <div
            className="h-1 w-full transition-colors duration-500"
            style={{ background: turnColor }}
          />
          <div className="flex items-center gap-3 p-3 lg:p-4">
            <DieFace value={shownFaces?.[0] ?? null} rolling={rolling} />
            <DieFace value={shownFaces?.[1] ?? null} rolling={rolling} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {rolling
                  ? "Rolling..."
                  : rolledValues === null
                    ? "No roll yet"
                    : `${rollerName} rolled ${rollText}`}
              </p>
              <p className="line-clamp-2 text-xs text-white/60">
                {isHolding
                  ? " "
                  : (game.lastEvent ??
                    (game.quick
                      ? "Roll a 5 or a 6 to bring a pawn out."
                      : "Roll a 5 to bring a pawn out."))}
              </p>
            </div>
          </div>
          {!isFinished && (
            <div className="space-y-2 px-3 pb-3 lg:px-4 lg:pb-4">
              {game.dice && game.dice.length > 0 && !rolling && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    To use
                  </span>
                  {game.dice.map((die, index) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: dice keep their slot order
                      key={index}
                      className={`rounded-lg px-2 py-0.5 text-xs font-black tabular-nums ${
                        die.bonus
                          ? "bg-amber-400 text-amber-950"
                          : "bg-white text-slate-900"
                      }`}
                    >
                      {die.bonus ? `+${die.value}` : die.value}
                    </span>
                  ))}
                </div>
              )}
              {mustChoose ? (
                <div className="grid max-h-28 grid-cols-2 gap-2 overflow-y-auto">
                  {(activePawn ? pickedMoves : choosableMoves).map((move) => (
                    <button
                      key={move.id}
                      type="button"
                      disabled={multiplayer.connectionStatus !== "connected"}
                      onClick={() => sendMove(move.id)}
                      className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold transition hover:bg-white/20 disabled:opacity-50"
                    >
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: LUDO_COLORS[move.seat].hex }}
                      />
                      <span className="truncate">
                        {move.seat === mySeat
                          ? "Pawn"
                          : `${seatPlayers[move.seat]?.name ?? LUDO_COLORS[move.seat].label}`}{" "}
                        {move.tokenIndex + 1} · {moveLabel(move)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={
                    !canRoll || multiplayer.connectionStatus !== "connected"
                  }
                  onClick={() => multiplayer.rollDice(game.roundId)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-black tracking-wide text-white shadow-lg transition enabled:hover:scale-[1.02] enabled:active:scale-95 disabled:cursor-default disabled:bg-white/10 disabled:text-white/50 disabled:shadow-none"
                  style={
                    canRoll
                      ? {
                          background: `linear-gradient(135deg, ${mySeatColor}, ${mySeatColor}cc)`,
                          boxShadow: `0 8px 24px ${mySeatColor}66`,
                        }
                      : undefined
                  }
                >
                  <Dices className="h-5 w-5" />
                  {canRoll
                    ? "Roll Dice"
                    : `Waiting for ${turnPlayer?.name ?? "players"}...`}
                </button>
              )}
            </div>
          )}
        </div>

        {isFinished && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
            <div className={`${glass} w-full max-w-sm p-6 text-center`}>
              <Trophy className="mx-auto h-16 w-16 text-amber-400 drop-shadow-[0_0_18px_rgba(251,191,36,0.6)]" />
              <h2 className="mt-3 text-3xl font-black tracking-tight">
                {game.winner?.ids.includes(multiplayer.playerId)
                  ? game.mode === "teams"
                    ? "Your team won!"
                    : "You won!"
                  : `${game.winner?.name ?? "A player"} wins!`}
              </h2>
              <p className="mt-1 text-sm text-white/65">
                {game.mode === "teams"
                  ? "Both partners brought every pawn home."
                  : game.quick
                    ? "Both pawns made it home."
                    : "All four pawns made it home."}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {multiplayer.isHost ? (
                  <Button onClick={multiplayer.restartGame}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Play Again
                  </Button>
                ) : (
                  <p className="text-sm text-white/65">
                    Waiting for the host to start another game.
                  </p>
                )}
                <Button
                  variant="outline"
                  className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={leaveMultiplayer}
                >
                  Leave
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}

const PIP_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DieFace({ value, rolling }: { value: number | null; rolling: boolean }) {
  const pips = value ? PIP_LAYOUT[value] : []
  return (
    <div
      className={`grid h-14 w-14 shrink-0 grid-cols-3 grid-rows-3 rounded-xl border border-black/10 bg-gradient-to-br from-white to-stone-200 p-2 shadow-[inset_0_-3px_0_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.18)] ${
        rolling ? "animate-bounce" : ""
      }`}
    >
      {PIP_CELLS.map((cell) => (
        <span
          key={cell}
          className={`m-auto rounded-full ${
            pips.includes(cell)
              ? value === 1
                ? "h-3.5 w-3.5 bg-red-600"
                : "h-2.5 w-2.5 bg-slate-900"
              : ""
          }`}
        />
      ))}
    </div>
  )
}

function PlayerAvatar({
  name,
  isBot,
  color,
  small = false,
}: {
  name: string
  isBot?: boolean
  color: string
  small?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-black text-white ${
        small ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"
      }`}
      style={{
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color} 60%)`,
      }}
    >
      {isBot ? <Bot className="h-4 w-4" /> : name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function HomePips({ home, total, color }: { home: number; total: number; color: string }) {
  return (
    <div className="flex shrink-0 gap-1" title={`${home}/${total} home`}>
      {Array.from({ length: total }, (_, slot) => (
        <span
          key={slot}
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full border-2 transition-colors"
          style={{ borderColor: color, background: slot < home ? color : "transparent" }}
        />
      ))}
      <span className="sr-only">
        {home} of {total} tokens home
      </span>
    </div>
  )
}
