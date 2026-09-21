import { createFileRoute } from "@tanstack/react-router"
import {
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
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
  getGameNightInviteLink,
  getInviteLink,
  parseInviteSearch,
} from "@/lib/inviteLinks"
import {
  countTokensHome,
  getTeamOfSeat,
  getTokenCell,
  LUDO_COLORS,
  LUDO_TOKENS_PER_PLAYER,
} from "@/lib/ludo"
import { useMultiplayerSession } from "@/lib/multiplayerSession"

export const Route = createFileRoute("/games/ludo")({
  validateSearch: parseInviteSearch,
  component: LudoPage,
})

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6]

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
  const [tumblingFace, setTumblingFace] = useState(1)
  const [frozenPositions, setFrozenPositions] = useState<number[][] | null>(null)

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
  useEffect(() => {
    if (!rollId) {
      seenRollId.current = null
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

    // A roll that had a single legal move arrives already played, so hold the
    // board on the pre-roll positions until the die settles.
    setFrozenPositions(previousPositions.current)
    setIsRolling(true)
    const tumble = window.setInterval(
      () => setTumblingFace(1 + Math.floor(Math.random() * 6)),
      150,
    )
    const settle = window.setTimeout(() => {
      setIsRolling(false)
      setFrozenPositions(null)
    }, 1200)
    return () => {
      window.clearInterval(tumble)
      window.clearTimeout(settle)
    }
  }, [rollId])

  // Declared after the roll effect so it still holds the pre-roll snapshot
  // on the render where a new roll arrives.
  useEffect(() => {
    previousPositions.current = seatPositions
  }, [seatPositions])

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
        <GameTopBar title="Ludo" subtitle="Race four tokens home" />
        <main className="relative mx-auto grid max-w-5xl gap-6 overflow-hidden px-4 py-8 md:grid-cols-2">
          <div className="pointer-events-none absolute right-10 top-10 -z-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
          <MultiplayerSetupCard
            title="Ludo Table"
            description="Play solo against bots, free-for-all, or 2v2 teams."
            icon={<Users className="h-5 w-5 text-primary" />}
            playerName={playerName}
            roomCode={joinRoomCode}
            createLabel="Create Ludo Room"
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
                Sixes, captures and tokens reaching home all earn another roll.
                Star squares are safe. Add bots in the lobby to fill empty
                seats.
              </p>
            </div>
          </MultiplayerSetupCard>

          <Card>
            <CardHeader>
              <Dices className="h-7 w-7 text-primary" />
              <CardTitle>How it plays</CardTitle>
              <CardDescription>
                Also known as Parcheesi or Pachisi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Roll a six to move a token out of your yard.</p>
              <p>
                Land on an opponent outside a star square and they go back to
                their yard.
              </p>
              <p>
                Reach the centre with an exact roll. First player to bring all
                four tokens home wins.
              </p>
              <p>Three sixes in a row loses the turn.</p>
              <p>
                In 2v2, partners sit opposite, never knock each other out, and
                take over their partner's tokens once their own are home.
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
        title="Ludo"
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
                  ? "Red + Yellow against Green + Blue. Partners never knock each other out, and once your tokens are all home you play your partner's. Needs exactly 4 players."
                  : "Colours are handed out in join order. Turns time out after 45 seconds."}
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
                      {multiplayer.isHost && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => multiplayer.removePlayer(bot.id)}
                        >
                          Remove
                        </Button>
                      )}
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
        startLabel={isTeams ? "Start 2v2" : "Start Ludo"}
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
    const currentSeatPlayer = seatPlayers[game.turnSeat]
    const serverNow =
      game.serverNow + Math.max(0, now - multiplayer.stateReceivedAt)
    const secondsLeft = game.turnDeadline
      ? Math.max(0, Math.ceil((game.turnDeadline - serverNow) / 1000))
      : null

    const rolledValue = game.lastRoll?.value ?? null
    const shownFace = isRolling ? tumblingFace : rolledValue
    const DiceIcon = shownFace ? DICE_ICONS[shownFace - 1] : Dices
    const canRoll = isMyTurn && game.dice === null && !isRolling
    const mustChooseToken =
      isMyTurn && !isRolling && game.dice !== null && game.legalMoves.length > 0

    const shownPositions = frozenPositions ?? seatPositions
    const tokens: LudoTokenView[] = seatPlayers.flatMap((player, seat) =>
      player
        ? player.tokens.map((position, tokenIndex) => ({
            seat,
            tokenIndex,
            position: shownPositions[seat]?.[tokenIndex] ?? position,
            movable:
              mustChooseToken && movableTokens.has(`${seat}-${tokenIndex}`),
          }))
        : [],
    )
    const orderedSeats = seatPlayers
      .map((player, seat) => ({ player, seat }))
      .sort((left, right) =>
        game.mode === "teams"
          ? getTeamOfSeat(left.seat) - getTeamOfSeat(right.seat) ||
            left.seat - right.seat
          : left.seat - right.seat,
      )
    const targets: LudoMoveTarget[] = mustChooseToken
      ? game.legalMoves.map((move) => {
          const [row, col] = getTokenCell(move.seat, move.tokenIndex, move.to)
          return { seat: move.seat, tokenIndex: move.tokenIndex, row, col }
        })
      : []

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Ludo"
          subtitle={
            isFinished
              ? "Game over"
              : isMyTurn
                ? game.dice === null
                  ? "Your turn - roll the dice"
                  : "Pick a token to move"
                : `${currentSeatPlayer?.name ?? "A player"} is playing`
          }
          onBack={leaveMultiplayer}
          rightAction={
            secondsLeft !== null && !isFinished ? (
              <span className="font-mono text-xs font-bold">{secondsLeft}s</span>
            ) : undefined
          }
        />
        <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_340px]">
          <section className="space-y-4">
            {isFinished && (
              <Card className="text-center">
                <CardHeader>
                  <Trophy className="mx-auto h-14 w-14 text-amber-500" />
                  <CardTitle className="text-3xl">
                    {game.winner?.ids.includes(multiplayer.playerId)
                      ? game.mode === "teams"
                        ? "Your team won!"
                        : "You won!"
                      : `${game.winner?.name ?? "A player"} wins!`}
                  </CardTitle>
                  <CardDescription>
                    {game.mode === "teams"
                      ? "Both partners brought every token home."
                      : "All four tokens made it home."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {multiplayer.isHost ? (
                    <Button onClick={multiplayer.restartGame}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Play Again
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Waiting for the host to start another game.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {/* Reserve room for the prompt without clipping wrapped mobile text. */}
            <div className="min-h-16">
              <div
                className={`flex min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-2 transition-opacity duration-300 ${
                  mustChooseToken
                    ? "border-amber-400 bg-amber-50 text-amber-900 opacity-100 dark:bg-amber-950/60 dark:text-amber-100"
                    : "border-transparent opacity-0"
                }`}
              >
                <MousePointerClick className="h-6 w-6 shrink-0" />
                <p className="text-sm font-semibold">
                  You rolled {game.dice ?? rolledValue}. Tap a pulsing token, or
                  the dashed circle where it would land.
                </p>
              </div>
            </div>
            {canRoll && (
              <Button
                className="h-11 w-full lg:hidden"
                disabled={multiplayer.connectionStatus !== "connected"}
                onClick={() => multiplayer.rollDice(game.roundId)}
              >
                <Dices className="mr-2 h-4 w-4" />
                Roll Dice
              </Button>
            )}
            <LudoBoard
              tokens={tokens}
              targets={targets}
              activeSeats={seatPlayers
                .map((player, seat) => (player ? seat : -1))
                .filter((seat) => seat !== -1)}
              onSelectToken={(seat, tokenIndex) => {
                if (multiplayer.connectionStatus === "connected") multiplayer.moveToken(seat, tokenIndex, game.roundId)
              }}
            />
            {mustChooseToken && (
              <div className="grid grid-cols-2 gap-2 lg:hidden">
                {game.legalMoves.map((move) => (
                  <Button
                    key={`${move.seat}-${move.tokenIndex}`}
                    className="h-11 min-w-0"
                    variant="outline"
                    disabled={multiplayer.connectionStatus !== "connected"}
                    onClick={() =>
                      multiplayer.moveToken(
                        move.seat,
                        move.tokenIndex,
                        game.roundId,
                      )
                    }
                  >
                    <span className="truncate">
                      {seatPlayers[move.seat]?.name ??
                        LUDO_COLORS[move.seat].label}
                      : token {move.tokenIndex + 1}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isFinished
                    ? "Final board"
                    : isMyTurn
                      ? "Your move"
                      : `${currentSeatPlayer?.name ?? "Waiting"}'s turn`}
                </CardTitle>
                <CardDescription>
                  {game.lastEvent ?? "Roll a six to release a token."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  className={`flex items-center gap-4 rounded-2xl p-4 transition-colors ${
                    mustChooseToken
                      ? "bg-amber-100 dark:bg-amber-950/60"
                      : "bg-accent/40"
                  }`}
                >
                  <div
                    className={`shrink-0 ${isRolling ? "animate-spin" : ""}`}
                    style={isRolling ? { animationDuration: "900ms" } : undefined}
                  >
                    <DiceIcon className="h-14 w-14 text-primary" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isRolling
                      ? "Rolling..."
                      : rolledValue === null
                        ? "No roll yet"
                        : mustChooseToken
                          ? `Rolled ${rolledValue} - choose a token`
                          : `${
                              game.lastRoll?.seat === mySeat ? "You" : "Last"
                            } rolled ${rolledValue}`}
                  </div>
                </div>
                <Button
                  className="hidden w-full lg:inline-flex"
                  disabled={
                    !canRoll || multiplayer.connectionStatus !== "connected"
                  }
                  onClick={() => multiplayer.rollDice(game.roundId)}
                >
                  <Dices className="mr-2 h-4 w-4" />
                  {canRoll ? "Roll Dice" : "Waiting..."}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {game.mode === "teams" ? "Teams" : "Players"}
                </CardTitle>
                <CardDescription>
                  {game.mode === "teams"
                    ? "Partners sit opposite. Eight tokens home wins it."
                    : "Tokens home out of four."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {orderedSeats.map(({ player, seat }) =>
                  player ? (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between rounded-2xl px-3 py-3 ${
                        seat === game.turnSeat && !isFinished
                          ? "bg-primary/10"
                          : "bg-accent/40"
                      } ${player.connected === false ? "opacity-60" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ background: LUDO_COLORS[seat].hex }}
                        />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 truncate text-sm font-medium">
                            {player.isBot && (
                              <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            {player.name}
                            {player.id === multiplayer.playerId ? " (you)" : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {player.connected === false && !player.isBot
                              ? "Reconnecting..."
                              : game.mode === "teams"
                                ? `${LUDO_COLORS[seat].label} · Team ${
                                    getTeamOfSeat(seat) + 1
                                  }`
                                : LUDO_COLORS[seat].label}
                          </p>
                        </div>
                      </div>
                      <span className="text-lg font-black">
                        {countTokensHome(player.tokens)}/
                        {LUDO_TOKENS_PER_PLAYER}
                      </span>
                    </div>
                  ) : null,
                )}
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
