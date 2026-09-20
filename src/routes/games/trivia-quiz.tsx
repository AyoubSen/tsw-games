import { createFileRoute } from "@tanstack/react-router"
import {
  Brain,
  Clock3,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { TriviaRoundCard } from "@/components/games/trivia-quiz/TriviaRoundCard"
import { useMultiplayerTrivia } from "@/components/games/trivia-quiz/useMultiplayerTrivia"
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
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import {
  pickTriviaQuestion,
  scoreTriviaAnswer,
  TRIVIA_PACKS,
  type TriviaQuestion,
} from "@/lib/trivia"
import type {
  PublicTriviaPlayer,
  TriviaQuestionSeconds,
  TriviaRoundCount,
  TriviaSettings,
} from "../../../party/trivia-quiz"

export const Route = createFileRoute("/games/trivia-quiz")({
  validateSearch: parseInviteSearch,
  component: TriviaQuizPage,
})

type GameView = "select" | "solo" | "multiplayer-lobby" | "multiplayer-game"

interface SoloState {
  settings: TriviaSettings
  question: TriviaQuestion
  usedQuestionIds: string[]
  round: number
  score: number
  correctAnswers: number
  selectedChoiceId: string | null
  pointsEarned: number | null
  phase: "answering" | "reveal" | "finished"
  roundStartedAt: number
  roundEndsAt: number
  revealEndsAt: number | null
}

const ROUND_OPTIONS: TriviaRoundCount[] = [5, 10, 15]
const TIME_OPTIONS: TriviaQuestionSeconds[] = [10, 15, 20]

function SettingsControls({
  settings,
  onChange,
}: {
  settings: TriviaSettings
  onChange: (settings: TriviaSettings) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold">Category pack</p>
        <div className="grid grid-cols-2 gap-2">
          {TRIVIA_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => onChange({ ...settings, pack: pack.id })}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                settings.pack === pack.id
                  ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
                  : "hover:border-fuchsia-500/50"
              }`}
            >
              <span className="block font-semibold">{pack.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {pack.description}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Rounds</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ROUND_OPTIONS.map((rounds) => (
              <button
                key={rounds}
                type="button"
                onClick={() => onChange({ ...settings, rounds })}
                className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                  settings.rounds === rounds
                    ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
                    : "hover:border-fuchsia-500/50"
                }`}
              >
                {rounds}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Seconds</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TIME_OPTIONS.map((questionSeconds) => (
              <button
                key={questionSeconds}
                type="button"
                onClick={() => onChange({ ...settings, questionSeconds })}
                className={`rounded-lg border px-2 py-2 text-sm font-bold ${
                  settings.questionSeconds === questionSeconds
                    ? "border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300"
                    : "hover:border-fuchsia-500/50"
                }`}
              >
                {questionSeconds}s
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Scoreboard({
  players,
  currentPlayerId,
  submittedPlayerIds,
  revealing,
}: {
  players: PublicTriviaPlayer[]
  currentPlayerId: string
  submittedPlayerIds: string[]
  revealing: boolean
}) {
  return (
    <aside className="rounded-[2rem] border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-black">Leaderboard</h2>
        <Trophy className="h-4 w-4 text-amber-500" />
      </div>
      <div className="space-y-2">
        {players.map((player, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between rounded-2xl px-3 py-3 ${
              player.id === currentPlayerId ? "bg-fuchsia-500/10" : "bg-muted/60"
            } ${player.connected === false ? "opacity-55" : ""}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-5 text-xs font-black text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{player.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {player.connected === false
                    ? "Reconnecting"
                    : revealing
                      ? `${player.correctAnswers} correct`
                      : submittedPlayerIds.includes(player.id)
                        ? "Answer locked"
                        : "Thinking..."}
                </p>
              </div>
            </div>
            <span className="ml-2 font-mono text-sm font-black">{player.score}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function TriviaQuizPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>(
    invitedRoomCode ? "multiplayer-lobby" : "select",
  )
  const [settings, setSettings] = useState<TriviaSettings>({
    pack: "mixed",
    rounds: 10,
    questionSeconds: 15,
  })
  const [now, setNow] = useState(Date.now())
  const [solo, setSolo] = useState<SoloState | null>(null)
  const [playerName, setPlayerName] = useState("")
  const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copiedRoomCode, setCopiedRoomCode] = useState(false)

  const multiplayer = useMultiplayerTrivia()
  const gameNight = useGameNight()
  const hasGameState = Boolean(
    multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.players[multiplayer.playerId],
  )
  const isGameNightConnection = gameNight.connection?.gameId === "trivia-quiz"
  const session = useMultiplayerSession({
    game: "trivia-quiz",
    joinGame: multiplayer.joinGame,
    hasGameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
    disabled: isGameNightConnection,
  })
  const connectGameNightHost = useCallback((roomId: string, name: string) => {
    multiplayer.createGame(name, settings, roomId)
  }, [multiplayer.createGame, settings])
  const bridge = useGameNightGameBridge({
    gameId: "trivia-quiz",
    hasGameState,
    finished: multiplayer.gameState?.status === "finished",
    connectHost: connectGameNightHost,
    connectPlayer: multiplayer.joinGame,
  })

  useEffect(() => {
    if (invitedRoomCode) setJoinRoomCode(invitedRoomCode)
  }, [invitedRoomCode])

  useEffect(() => {
    if (multiplayer.connectionStatus !== "connected" || !multiplayer.gameState) return
    setView(
      multiplayer.gameState.status === "waiting"
        ? "multiplayer-lobby"
        : "multiplayer-game",
    )
    setMessage(null)
  }, [multiplayer.connectionStatus, multiplayer.gameState])

  useEffect(() => {
    if (session.isSuppressingErrors()) return
    if (multiplayer.error) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const timerActive =
    (view === "solo" && solo?.phase !== "finished") ||
    (view === "multiplayer-game" && multiplayer.gameState?.status === "playing")

  useEffect(() => {
    if (!timerActive) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [timerActive])

  useEffect(() => {
    if (!solo) return
    if (solo.phase === "answering" && now >= solo.roundEndsAt) {
      setSolo((current) =>
        current && current.phase === "answering"
          ? {
              ...current,
              phase: "reveal",
              selectedChoiceId: null,
              pointsEarned: 0,
              revealEndsAt: Date.now() + 4_000,
            }
          : current,
      )
      return
    }
    if (
      solo.phase === "reveal" &&
      solo.revealEndsAt &&
      now >= solo.revealEndsAt
    ) {
      if (solo.round >= solo.settings.rounds) {
        setSolo((current) => (current ? { ...current, phase: "finished" } : null))
        return
      }
      const picked = pickTriviaQuestion(solo.settings.pack, solo.usedQuestionIds)
      const startedAt = Date.now()
      setSolo((current) =>
        current
          ? {
              ...current,
              question: picked.question,
              usedQuestionIds: picked.usedQuestionIds,
              round: current.round + 1,
              selectedChoiceId: null,
              pointsEarned: null,
              phase: "answering",
              roundStartedAt: startedAt,
              roundEndsAt:
                startedAt + current.settings.questionSeconds * 1000,
              revealEndsAt: null,
            }
          : null,
      )
    }
  }, [now, solo])

  const sortedPlayers = useMemo(
    () =>
      Object.values(multiplayer.gameState?.players ?? {}).sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        if (right.correctAnswers !== left.correctAnswers) {
          return right.correctAnswers - left.correctAnswers
        }
        return left.totalAnswerMs - right.totalAnswerMs
      }),
    [multiplayer.gameState?.players],
  )
  const connectedPlayers = useMemo(
    () => sortedPlayers.filter((player) => player.connected !== false),
    [sortedPlayers],
  )

  const startSolo = () => {
    const picked = pickTriviaQuestion(settings.pack)
    const startedAt = Date.now()
    setSolo({
      settings,
      question: picked.question,
      usedQuestionIds: picked.usedQuestionIds,
      round: 1,
      score: 0,
      correctAnswers: 0,
      selectedChoiceId: null,
      pointsEarned: null,
      phase: "answering",
      roundStartedAt: startedAt,
      roundEndsAt: startedAt + settings.questionSeconds * 1000,
      revealEndsAt: null,
    })
    setNow(startedAt)
    setView("solo")
  }

  const answerSolo = (choiceId: string) => {
    setSolo((current) => {
      const submittedAt = Date.now()
      if (
        !current ||
        current.phase !== "answering" ||
        submittedAt >= current.roundEndsAt
      ) {
        return current
      }
      const correct = choiceId === current.question.correctChoiceId
      const points = correct
        ? scoreTriviaAnswer(
            submittedAt,
            current.roundStartedAt,
            current.roundEndsAt,
          )
        : 0
      return {
        ...current,
        score: current.score + points,
        correctAnswers: current.correctAnswers + (correct ? 1 : 0),
        selectedChoiceId: choiceId,
        pointsEarned: points,
        phase: "reveal",
        revealEndsAt: submittedAt + 4_000,
      }
    })
  }

  const createMultiplayer = () => {
    if (!playerName.trim()) {
      setMessage("Enter your name first.")
      return
    }
    const roomCode = multiplayer.createGame(playerName.trim(), settings)
    session.remember(roomCode, playerName.trim())
    setMessage(null)
  }

  const joinMultiplayer = () => {
    if (!playerName.trim() || !joinRoomCode.trim()) {
      setMessage("Enter your name and a room code.")
      return
    }
    const roomCode = joinRoomCode.trim().toUpperCase()
    multiplayer.joinGame(roomCode, playerName.trim())
    session.remember(roomCode, playerName.trim())
    setMessage(null)
  }

  const leaveMultiplayer = () => {
    session.forget()
    multiplayer.disconnect()
    setMessage(null)
    setView("select")
  }

  const copyInvite = async () => {
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
        <p className="text-muted-foreground">Rejoining your quiz...</p>
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
          title="Trivia Quiz"
          subtitle="Think fast. Lock it in. Climb the board."
        />
        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2">
          <MultiplayerSetupCard
            title="Live Quiz Room"
            description="Create a server-timed match for 2-12 players."
            icon={<Users className="h-5 w-5 text-fuchsia-500" />}
            playerName={playerName}
            roomCode={joinRoomCode}
            createLabel="Create Quiz Room"
            onPlayerNameChange={setPlayerName}
            onRoomCodeChange={setJoinRoomCode}
            onJoin={joinMultiplayer}
            onCreate={createMultiplayer}
            message={message}
          >
            <SettingsControls settings={settings} onChange={setSettings} />
          </MultiplayerSetupCard>

          <Card className="overflow-hidden border-fuchsia-500/20">
            <div className="h-2 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-amber-400" />
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10">
                <Brain className="h-6 w-6 text-fuchsia-600 dark:text-fuchsia-300" />
              </div>
              <CardTitle className="text-2xl">Solo Sprint</CardTitle>
              <CardDescription>
                Play the same generated packs and chase a faster score.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <SettingsControls settings={settings} onChange={setSettings} />
              <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-fuchsia-500" />
                  Five question styles keep each pack moving.
                </p>
                <p className="mt-2 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-fuchsia-500" />
                  Correct answers score 1,000 plus a speed bonus.
                </p>
              </div>
              <Button className="w-full" onClick={startSolo}>
                <Play className="mr-2 h-4 w-4" />
                Start Solo Quiz
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (view === "solo" && solo) {
    const secondsRemaining =
      solo.phase === "answering"
        ? Math.max(0, Math.ceil((solo.roundEndsAt - now) / 1000))
        : solo.revealEndsAt
          ? Math.max(0, Math.ceil((solo.revealEndsAt - now) / 1000))
          : 0
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Solo Trivia"
          subtitle={`Round ${solo.round} of ${solo.settings.rounds}`}
          onBack={() => {
            setSolo(null)
            setView("select")
          }}
          rightAction={
            <span className="font-mono text-sm font-black">{solo.score}</span>
          }
        />
        <main className="mx-auto max-w-4xl px-4 py-6">
          {solo.phase === "finished" ? (
            <Card className="mx-auto max-w-xl overflow-hidden text-center">
              <div className="h-2 bg-gradient-to-r from-fuchsia-500 to-amber-400" />
              <CardHeader>
                <Trophy className="mx-auto h-14 w-14 text-amber-500" />
                <CardTitle className="text-3xl">Quiz complete</CardTitle>
                <CardDescription>
                  {solo.correctAnswers} of {solo.settings.rounds} correct for {solo.score.toLocaleString()} points.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={startSolo}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Play Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSolo(null)
                    setView("select")
                  }}
                >
                  Change Settings
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border bg-card p-3 text-center">
                  <p className="text-xl font-black">{solo.round}/{solo.settings.rounds}</p>
                  <p className="text-xs uppercase text-muted-foreground">Round</p>
                </div>
                <div className="rounded-2xl border bg-card p-3 text-center">
                  <p className="text-xl font-black">{solo.correctAnswers}</p>
                  <p className="text-xs uppercase text-muted-foreground">Correct</p>
                </div>
                <div className="rounded-2xl border bg-card p-3 text-center">
                  <p className="text-xl font-black">{solo.score.toLocaleString()}</p>
                  <p className="text-xs uppercase text-muted-foreground">Points</p>
                </div>
              </div>
              <TriviaRoundCard
                categoryLabel={solo.question.categoryLabel}
                format={solo.question.format}
                prompt={solo.question.prompt}
                choices={solo.question.choices}
                selectedChoiceId={solo.selectedChoiceId}
                correctChoiceId={
                  solo.phase === "reveal" ? solo.question.correctChoiceId : null
                }
                explanation={
                  solo.phase === "reveal" ? solo.question.explanation : null
                }
                secondsRemaining={secondsRemaining}
                totalSeconds={solo.settings.questionSeconds}
                pointsEarned={solo.pointsEarned}
                onAnswer={answerSolo}
              />
            </>
          )}
        </main>
      </div>
    )
  }

  if (
    view === "multiplayer-lobby" &&
    multiplayer.gameState &&
    multiplayer.playerId
  ) {
    const game = multiplayer.gameState
    const packLabel = TRIVIA_PACKS.find((pack) => pack.id === game.settings.pack)?.label
    return (
      <MultiplayerLobby
        title="Trivia Quiz"
        subtitle="The room is warming up"
        onBack={leaveMultiplayer}
        players={sortedPlayers}
        hostId={game.hostId}
        currentPlayerId={multiplayer.playerId}
        playerDescription={`${connectedPlayers.length} of ${game.maxPlayers} players`}
        settings={
          <div className="rounded-2xl border bg-fuchsia-500/5 p-4 text-sm">
            <p className="font-bold">{packLabel} pack</p>
            <p className="mt-1 text-muted-foreground">
              {game.settings.rounds} rounds, {game.settings.questionSeconds} seconds each.
            </p>
          </div>
        }
        roomCode={bridge.isGameNight ? bridge.publicRoomCode : game.roomCode}
        copiedRoomCode={copiedRoomCode}
        onCopyRoomCode={copyInvite}
        onStart={multiplayer.startGame}
        onLeave={leaveMultiplayer}
        canStart={connectedPlayers.length >= 2}
        isHost={multiplayer.isHost}
        message={message}
        startLabel="Start Quiz"
      />
    )
  }

  if (
    view === "multiplayer-game" &&
    multiplayer.gameState &&
    multiplayer.playerId
  ) {
    const game = multiplayer.gameState
    const estimatedServerNow =
      game.serverNow + Math.max(0, now - multiplayer.stateReceivedAt)
    const secondsRemaining = game.roundEndsAt
      ? Math.max(0, Math.ceil((game.roundEndsAt - estimatedServerNow) / 1000))
      : 0
    const myResult = game.roundResults[multiplayer.playerId]
    const winnerNames = game.winnerIds
      .map((id) => game.players[id]?.name)
      .filter((name): name is string => Boolean(name))

    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Trivia Quiz"
          subtitle={`Round ${game.roundNumber} of ${game.settings.rounds}`}
          onBack={leaveMultiplayer}
          rightAction={
            <span className="font-mono text-sm font-black">
              {game.players[multiplayer.playerId]?.score.toLocaleString() ?? 0}
            </span>
          }
        />
        <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_280px]">
          <section>
            {game.status === "finished" ? (
              <Card className="overflow-hidden text-center">
                <div className="h-2 bg-gradient-to-r from-fuchsia-500 to-amber-400" />
                <CardHeader>
                  <Trophy className="mx-auto h-14 w-14 text-amber-500" />
                  <CardTitle className="text-3xl">
                    {winnerNames.length === 1
                      ? `${winnerNames[0]} wins!`
                      : winnerNames.length > 1
                        ? "It's a tie!"
                        : "Quiz complete"}
                  </CardTitle>
                  <CardDescription>
                    Final scores are locked after {game.settings.rounds} rounds.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {multiplayer.isHost ? (
                    <Button onClick={multiplayer.restartGame}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Play Again
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Waiting for the host to start another quiz.
                    </p>
                  )}
                  <div>
                    <Button variant="ghost" onClick={leaveMultiplayer}>
                      Leave Room
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : game.question ? (
              <TriviaRoundCard
                categoryLabel={game.question.categoryLabel}
                format={game.question.format}
                prompt={game.question.prompt}
                choices={game.question.choices}
                selectedChoiceId={game.myChoiceId}
                correctChoiceId={game.question.correctChoiceId}
                explanation={game.question.explanation}
                secondsRemaining={secondsRemaining}
                totalSeconds={game.settings.questionSeconds}
                disabled={multiplayer.connectionStatus !== "connected"}
                pointsEarned={myResult?.points}
                onAnswer={(choiceId) =>
                  multiplayer.submitAnswer(game.roundId, choiceId)
                }
              />
            ) : null}
            {game.status === "playing" && (
              <div className="mt-3 flex items-center justify-between px-2 text-xs text-muted-foreground">
                <span>
                  {game.phase === "reveal"
                    ? `Next question in ${secondsRemaining}s`
                    : game.myChoiceId
                      ? "Your answer is locked"
                      : "Choose before time runs out"}
                </span>
                <span>
                  {game.submittedPlayerIds.filter((id) => game.players[id]?.connected !== false).length}/
                  {connectedPlayers.length} answered
                </span>
              </div>
            )}
          </section>
          <Scoreboard
            players={sortedPlayers}
            currentPlayerId={multiplayer.playerId}
            submittedPlayerIds={game.submittedPlayerIds}
            revealing={game.phase === "reveal" || game.status === "finished"}
          />
        </main>
      </div>
    )
  }

  return null
}
