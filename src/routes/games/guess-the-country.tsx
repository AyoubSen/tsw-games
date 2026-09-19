import { createFileRoute } from "@tanstack/react-router"
import {
  CheckCircle2,
  Clock3,
  Flag,
  Grid2X2,
  Infinity as InfinityIcon,
  Play,
  RotateCcw,
  SkipForward,
  Trophy,
  Users,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useMultiplayerGuessTheCountry } from "@/components/games/guess-the-country/useMultiplayerGuessTheCountry"
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
import { Input } from "@/components/ui/input"
import {
  buildCountryChoices,
  isCorrectCountryGuess,
  pickNextCountry,
  type Country,
} from "@/lib/guessTheCountry"
import { getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import type {
  GameMode,
  GameSettings,
} from "../../../party/guess-the-country"

export const Route = createFileRoute("/games/guess-the-country")({
  validateSearch: parseInviteSearch,
  component: GuessTheCountryPage,
})

type GameView =
  | "select"
  | "solo-setup"
  | "solo-game"
  | "multiplayer-lobby"
  | "multiplayer-game"

type SoloMode = "casual" | "timed" | "multiple-choice"
type TimeLimit = 60 | 120 | 180
type TargetScore = 3 | 5 | 10

const TIME_OPTIONS: Array<{ value: TimeLimit; label: string }> = [
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 180, label: "3 min" },
]

const TARGET_OPTIONS: TargetScore[] = [3, 5, 10]

const MODE_OPTIONS: Array<{
  value: GameMode
  label: string
  description: string
  icon: typeof Trophy
}> = [
  {
    value: "first-to-score",
    label: "First to Score",
    description: "First correct answer takes the point. Reach the target to win.",
    icon: Trophy,
  },
  {
    value: "casual",
    label: "Casual",
    description: "Endless shared flags and a running scoreboard.",
    icon: InfinityIcon,
  },
  {
    value: "timed",
    label: "Timed",
    description: "Claim as many flags as possible before time runs out.",
    icon: Clock3,
  },
  {
    value: "multiple-choice",
    label: "Choice Quiz",
    description: "Everyone locks an answer, then the correct choice is revealed.",
    icon: Grid2X2,
  },
]

function flagUrl(code: string) {
  return `https://flagcdn.com/w640/${code}.png`
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

function FlagCard({ code, round }: { code: string; round: number }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-sky-100 via-background to-amber-100 p-5 shadow-xl dark:from-sky-950/40 dark:to-amber-950/30 sm:p-8">
      <div className="absolute left-5 top-4 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
        Flag {round}
      </div>
      <div className="flex min-h-56 items-center justify-center pt-5 sm:min-h-72">
        <img
          key={code}
          src={flagUrl(code)}
          alt="Country flag to identify"
          className="max-h-60 w-auto max-w-full rounded-md border border-black/10 object-contain shadow-lg sm:max-h-72"
        />
      </div>
    </div>
  )
}

function GuessForm({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  disabled?: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type the country name"
        maxLength={80}
        autoComplete="off"
        autoFocus
        disabled={disabled}
        className="h-12 text-base"
      />
      <Button type="submit" size="lg" disabled={disabled || !value.trim()}>
        Guess
      </Button>
    </form>
  )
}

function GuessTheCountryPage() {
  const { room: invitedRoomCode } = Route.useSearch()
  const [view, setView] = useState<GameView>(
    invitedRoomCode ? "multiplayer-lobby" : "select",
  )
  const [now, setNow] = useState(Date.now())

  const [soloMode, setSoloMode] = useState<SoloMode>("casual")
  const [soloTimeLimit, setSoloTimeLimit] = useState<TimeLimit>(60)
  const [soloCountry, setSoloCountry] = useState<Country | null>(null)
  const [soloUsedCodes, setSoloUsedCodes] = useState<readonly string[]>([])
  const [soloGuess, setSoloGuess] = useState("")
  const [soloScore, setSoloScore] = useState(0)
  const [soloStreak, setSoloStreak] = useState(0)
  const [soloBestStreak, setSoloBestStreak] = useState(0)
  const [soloRound, setSoloRound] = useState(0)
  const [soloEndsAt, setSoloEndsAt] = useState<number | null>(null)
  const [soloFinished, setSoloFinished] = useState(false)
  const [soloMessage, setSoloMessage] = useState<string | null>(null)
  const [soloChoices, setSoloChoices] = useState<string[]>([])
  const [soloChoice, setSoloChoice] = useState<string | null>(null)
  const [soloChoiceRevealed, setSoloChoiceRevealed] = useState(false)

  const [playerName, setPlayerName] = useState("")
  const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "")
  const [multiplayerMode, setMultiplayerMode] =
    useState<GameMode>("first-to-score")
  const [targetScore, setTargetScore] = useState<TargetScore>(5)
  const [multiplayerTimeLimit, setMultiplayerTimeLimit] =
    useState<TimeLimit>(60)
  const [multiplayerGuess, setMultiplayerGuess] = useState("")
  const [multiplayerMessage, setMultiplayerMessage] = useState<string | null>(
    null,
  )
  const [copiedRoomCode, setCopiedRoomCode] = useState(false)

  const multiplayer = useMultiplayerGuessTheCountry()
  const session = useMultiplayerSession({
    game: "guess-the-country",
    joinGame: multiplayer.joinGame,
    hasGameState: Boolean(
      multiplayer.gameState &&
        multiplayer.playerId &&
        multiplayer.gameState.players[multiplayer.playerId],
    ),
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoomCode,
    onAbandon: multiplayer.abandonReconnect,
  })

  useEffect(() => {
    if (invitedRoomCode) setJoinRoomCode(invitedRoomCode)
  }, [invitedRoomCode])

  useEffect(() => {
    if (multiplayer.connectionStatus !== "connected" || !multiplayer.gameState) {
      return
    }
    setView(
      multiplayer.gameState.status === "waiting"
        ? "multiplayer-lobby"
        : "multiplayer-game",
    )
    if (multiplayer.gameState.status === "waiting") {
      multiplayer.clearGuessMessage()
      setMultiplayerMessage(null)
    }
  }, [
    multiplayer.connectionStatus,
    multiplayer.gameState,
    multiplayer.clearGuessMessage,
  ])

  useEffect(() => {
    if (session.isSuppressingErrors()) return
    if (multiplayer.error) setMultiplayerMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  useEffect(() => {
    if (multiplayer.guessMessage) {
      setMultiplayerMessage(multiplayer.guessMessage)
    }
  }, [multiplayer.guessMessage])

  const multiplayerHasTimer =
    multiplayer.gameState?.status === "playing" &&
    (multiplayer.gameState.settings.mode === "timed" ||
      multiplayer.gameState.settings.mode === "multiple-choice")
  const soloIsTimed =
    view === "solo-game" && soloMode === "timed" && !soloFinished

  useEffect(() => {
    if (!multiplayerHasTimer && !soloIsTimed) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [multiplayerHasTimer, soloIsTimed])

  useEffect(() => {
    if (!soloIsTimed || !soloEndsAt || now < soloEndsAt) return
    setSoloFinished(true)
    setSoloMessage("Time is up.")
  }, [now, soloEndsAt, soloIsTimed])

  const soloTimeRemaining = soloEndsAt
    ? Math.max(0, Math.ceil((soloEndsAt - now) / 1000))
    : 0
  const multiplayerTimeRemaining =
    multiplayer.gameState?.endsAt && multiplayer.gameState.status === "playing"
      ? Math.max(
          0,
          Math.ceil((multiplayer.gameState.endsAt - now) / 1000),
        )
      : 0
  const multiplayerChoiceTimeRemaining =
    multiplayer.gameState?.roundEndsAt &&
    multiplayer.gameState.status === "playing"
      ? Math.max(
          0,
          Math.ceil((multiplayer.gameState.roundEndsAt - now) / 1000),
        )
      : 0

  const sortedPlayers = useMemo(
    () =>
      Object.values(multiplayer.gameState?.players ?? {}).sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return left.joinedAt - right.joinedAt
      }),
    [multiplayer.gameState],
  )

  const winnerNames = useMemo(
    () =>
      (multiplayer.gameState?.winnerIds ?? [])
        .map((id) => multiplayer.gameState?.players[id]?.name)
        .filter((name): name is string => Boolean(name)),
    [multiplayer.gameState],
  )

  const advanceSolo = useCallback((usedCodes: readonly string[]) => {
    const next = pickNextCountry(usedCodes)
    setSoloCountry(next.country)
    setSoloUsedCodes(next.usedCodes)
    setSoloRound((current) => current + 1)
    setSoloGuess("")
  }, [])

  const startSolo = (mode: SoloMode) => {
    const next = pickNextCountry([])
    setSoloMode(mode)
    setSoloCountry(next.country)
    setSoloUsedCodes(next.usedCodes)
    setSoloGuess("")
    setSoloScore(0)
    setSoloStreak(0)
    setSoloBestStreak(0)
    setSoloRound(1)
    setSoloEndsAt(mode === "timed" ? Date.now() + soloTimeLimit * 1000 : null)
    setSoloFinished(false)
    setSoloChoices(
      mode === "multiple-choice" ? buildCountryChoices(next.country) : [],
    )
    setSoloChoice(null)
    setSoloChoiceRevealed(false)
    setSoloMessage(
      mode === "multiple-choice"
        ? "Choose the country shown by the flag."
        : "Name the country shown by the flag.",
    )
    setNow(Date.now())
    setView("solo-game")
  }

  const submitSoloGuess = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!soloCountry || soloFinished || !soloGuess.trim()) return
    if (soloEndsAt && Date.now() >= soloEndsAt) {
      setSoloFinished(true)
      setSoloMessage("Time is up.")
      return
    }

    if (!isCorrectCountryGuess(soloGuess, soloCountry)) {
      setSoloStreak(0)
      setSoloMessage("Not that country. Try again.")
      return
    }

    const nextStreak = soloStreak + 1
    setSoloScore((current) => current + 1)
    setSoloStreak(nextStreak)
    setSoloBestStreak((current) => Math.max(current, nextStreak))
    setSoloMessage(`Correct: ${soloCountry.name}`)
    advanceSolo(soloUsedCodes)
  }

  const skipSolo = () => {
    if (!soloCountry || soloFinished) return
    if (soloEndsAt && Date.now() >= soloEndsAt) {
      setSoloFinished(true)
      setSoloMessage("Time is up.")
      return
    }
    setSoloStreak(0)
    setSoloMessage(`Skipped: ${soloCountry.name}`)
    advanceSolo(soloUsedCodes)
  }

  const selectSoloChoice = (choice: string) => {
    if (!soloCountry || soloFinished || soloChoiceRevealed) return

    const correct = choice === soloCountry.name
    setSoloChoice(choice)
    setSoloChoiceRevealed(true)
    if (correct) {
      const nextStreak = soloStreak + 1
      setSoloScore((current) => current + 1)
      setSoloStreak(nextStreak)
      setSoloBestStreak((current) => Math.max(current, nextStreak))
      setSoloMessage(`Correct: ${soloCountry.name}`)
    } else {
      setSoloStreak(0)
      setSoloMessage(`The answer was ${soloCountry.name}.`)
    }
  }

  const nextSoloChoice = () => {
    if (!soloChoiceRevealed) return
    if (soloRound >= 10) {
      setSoloFinished(true)
      setSoloMessage("Quiz complete.")
      return
    }

    const next = pickNextCountry(soloUsedCodes)
    setSoloCountry(next.country)
    setSoloUsedCodes(next.usedCodes)
    setSoloRound((current) => current + 1)
    setSoloChoices(buildCountryChoices(next.country))
    setSoloChoice(null)
    setSoloChoiceRevealed(false)
    setSoloMessage("Choose the country shown by the flag.")
  }

  const handleCreateMultiplayer = () => {
    if (!playerName.trim()) {
      setMultiplayerMessage("Enter your name first.")
      return
    }

    const settings: GameSettings = {
      mode: multiplayerMode,
      targetScore,
      timeLimit: multiplayerTimeLimit,
    }
    const roomCode = multiplayer.createGame(playerName.trim(), settings)
    session.remember(roomCode, playerName.trim())
    setMultiplayerMessage(null)
  }

  const handleJoinMultiplayer = () => {
    if (!playerName.trim() || !joinRoomCode.trim()) {
      setMultiplayerMessage("Enter your name and a room code.")
      return
    }
    const roomCode = joinRoomCode.trim().toUpperCase()
    multiplayer.joinGame(roomCode, playerName.trim())
    session.remember(roomCode, playerName.trim())
    setMultiplayerMessage(null)
  }

  const handleCopyRoomCode = async () => {
    if (!multiplayer.gameState) return
    try {
      await navigator.clipboard.writeText(
        getInviteLink(multiplayer.gameState.roomCode),
      )
      setCopiedRoomCode(true)
      window.setTimeout(() => setCopiedRoomCode(false), 1600)
    } catch {
      setMultiplayerMessage("Could not copy the invite link.")
    }
  }

  const submitMultiplayerGuess = (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!multiplayerGuess.trim()) return
    multiplayer.submitGuess(multiplayerGuess.trim())
    multiplayer.clearGuessMessage()
    setMultiplayerGuess("")
  }

  const leaveMultiplayer = () => {
    session.forget()
    multiplayer.disconnect()
    setMultiplayerGuess("")
    setMultiplayerMessage(null)
    setView("select")
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
          title="Guess the Country"
          subtitle="Play solo or race live with friends"
        />
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2">
          <MultiplayerSetupCard
            title="Multiplayer"
            description="Everyone sees the same flag. The first correct answer claims it."
            icon={<Users className="h-5 w-5 text-primary" />}
            playerName={playerName}
            roomCode={joinRoomCode}
            createLabel="Create Country Room"
            onPlayerNameChange={setPlayerName}
            onRoomCodeChange={setJoinRoomCode}
            onJoin={handleJoinMultiplayer}
            onCreate={handleCreateMultiplayer}
            message={multiplayerMessage}
          >
            <div className="space-y-2">
              <p className="text-sm font-medium">Game Mode</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODE_OPTIONS.map((mode) => {
                  const Icon = mode.icon
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setMultiplayerMode(mode.value)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors ${
                        multiplayerMode === mode.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {mode.label}
                      </span>
                      <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                        {mode.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            {multiplayerMode === "first-to-score" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Points to Win</p>
                <div className="grid grid-cols-3 gap-2">
                  {TARGET_OPTIONS.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => setTargetScore(target)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        targetScore === target
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {target}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {multiplayerMode === "timed" && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Clock3 className="h-4 w-4" />
                  Match Time
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMultiplayerTimeLimit(option.value)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        multiplayerTimeLimit === option.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </MultiplayerSetupCard>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-primary" />
                Solo Play
              </CardTitle>
              <CardDescription>
                Practice all 195 flags at your own pace or against the clock.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-accent/40 p-4 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <InfinityIcon className="h-4 w-4" />
                  Casual mode keeps going until you leave.
                </p>
                <p className="mt-2 flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  Timed mode tracks how many flags you identify.
                </p>
                <p className="mt-2 flex items-center gap-2">
                  <Grid2X2 className="h-4 w-4" />
                  Choice Quiz gives you four possible answers.
                </p>
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setView("solo-setup")}
              >
                Choose Solo Mode
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  if (view === "solo-setup") {
    return (
      <div className="min-h-[calc(100vh-73px)]">
        <GameTopBar
          title="Solo Challenge"
          subtitle="Choose how you want to play"
          onBack={() => setView("select")}
        />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="grid gap-5 md:grid-cols-3">
            <Card>
              <CardHeader>
                <InfinityIcon className="h-7 w-7 text-primary" />
                <CardTitle>Casual</CardTitle>
                <CardDescription>
                  Keep guessing until you decide to leave.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => startSolo("casual")}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Casual
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Clock3 className="h-7 w-7 text-primary" />
                <CardTitle>Timed</CardTitle>
                <CardDescription>
                  Guess as many flags as possible before time runs out.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {TIME_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        soloTimeLimit === option.value ? "default" : "outline"
                      }
                      onClick={() => setSoloTimeLimit(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <Button className="w-full" onClick={() => startSolo("timed")}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Timed
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Grid2X2 className="h-7 w-7 text-primary" />
                <CardTitle>Choice Quiz</CardTitle>
                <CardDescription>
                  Pick from four countries and see the answer immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => startSolo("multiple-choice")}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start 10 Rounds
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  if (view === "solo-game" && soloCountry) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Guess the Country"
          subtitle={
            soloMode === "timed"
              ? "Timed solo"
              : soloMode === "multiple-choice"
                ? "10-round choice quiz"
                : "Casual solo"
          }
          onBack={() => setView("solo-setup")}
          rightAction={
            soloMode === "timed" ? (
              <span className="font-mono text-sm font-bold">
                {formatTime(soloTimeRemaining)}
              </span>
            ) : undefined
          }
        />
        <main className="mx-auto max-w-4xl px-4 py-6">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              ["Score", soloScore],
              ["Streak", soloStreak],
              ["Best", soloBestStreak],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border bg-card p-3 text-center">
                <div className="text-2xl font-black">{value}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {soloFinished ? (
            <Card className="mx-auto max-w-xl text-center">
              <CardHeader>
                <Trophy className="mx-auto h-12 w-12 text-amber-500" />
                <CardTitle className="text-3xl">
                  {soloMode === "multiple-choice" ? "Quiz complete" : "Time's up"}
                </CardTitle>
                <CardDescription>
                  {soloMode === "multiple-choice"
                    ? `You identified ${soloScore} of 10 countries.`
                    : `You identified ${soloScore} ${soloScore === 1 ? "country" : "countries"}. The last flag was ${soloCountry.name}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={() => startSolo(soloMode)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Play Again
                </Button>
                <Button variant="outline" onClick={() => setView("solo-setup")}>
                  Change Mode
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <FlagCard code={soloCountry.code} round={soloRound} />
              {soloMode === "multiple-choice" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {soloChoices.map((choice) => {
                      const correct =
                        soloChoiceRevealed && choice === soloCountry.name
                      const selectedWrong =
                        soloChoiceRevealed &&
                        choice === soloChoice &&
                        choice !== soloCountry.name
                      const selected =
                        !soloChoiceRevealed && choice === soloChoice
                      return (
                        <button
                          key={choice}
                          type="button"
                          disabled={soloChoiceRevealed}
                          onClick={() => selectSoloChoice(choice)}
                          className={`flex min-h-16 items-center justify-between rounded-2xl border px-4 py-3 text-left font-semibold transition-colors ${
                            correct
                              ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : selectedWrong
                                ? "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300"
                                : selected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : soloChoiceRevealed
                                    ? "opacity-50"
                                    : "hover:border-primary/50 hover:bg-accent/40"
                          }`}
                        >
                          <span>{choice}</span>
                          {correct && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                          {selectedWrong && <XCircle className="h-5 w-5 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex min-h-10 items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{soloMessage}</p>
                    {soloChoiceRevealed && (
                      <Button onClick={nextSoloChoice}>
                        {soloRound >= 10 ? "Finish Quiz" : "Next Flag"}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <GuessForm
                    value={soloGuess}
                    onChange={setSoloGuess}
                    onSubmit={submitSoloGuess}
                  />
                  <div className="flex min-h-10 items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{soloMessage}</p>
                    <Button variant="ghost" size="sm" onClick={skipSolo}>
                      <SkipForward className="mr-2 h-4 w-4" />
                      Skip
                    </Button>
                  </div>
                </>
              )}
            </div>
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
    const settings = multiplayer.gameState.settings
    const modeLabel = MODE_OPTIONS.find((mode) => mode.value === settings.mode)?.label
    return (
      <MultiplayerLobby
        title="Guess the Country"
        subtitle="Get ready to race for every flag"
        onBack={leaveMultiplayer}
        players={sortedPlayers}
        hostId={multiplayer.gameState.hostId}
        currentPlayerId={multiplayer.playerId}
        playerDescription={`${sortedPlayers.length} of ${multiplayer.gameState.maxPlayers} players`}
        settings={
          <div className="rounded-2xl border bg-accent/30 p-4 text-sm">
            <p className="font-semibold">{modeLabel}</p>
            <p className="mt-1 text-muted-foreground">
              {settings.mode === "first-to-score" &&
                `First to ${settings.targetScore} points wins.`}
              {settings.mode === "casual" && "Endless rounds until you leave."}
              {settings.mode === "timed" &&
                `${settings.timeLimit / 60} minute match. Highest score wins.`}
              {settings.mode === "multiple-choice" &&
                "10 rounds. Lock one of four answers before each 10-second timer ends."}
            </p>
          </div>
        }
        roomCode={multiplayer.gameState.roomCode}
        copiedRoomCode={copiedRoomCode}
        onCopyRoomCode={handleCopyRoomCode}
        onStart={multiplayer.startGame}
        onLeave={leaveMultiplayer}
        canStart={sortedPlayers.filter((player) => player.connected !== false).length >= 2}
        isHost={multiplayer.isHost}
        message={multiplayerMessage}
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
    const isChoiceMode = game.settings.mode === "multiple-choice"
    const isChoiceReveal = isChoiceMode && game.choicePhase === "reveal"
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar
          title="Guess the Country"
          subtitle={
            game.settings.mode === "first-to-score"
              ? `First to ${game.settings.targetScore}`
              : game.settings.mode === "timed"
                ? "Timed match"
                : game.settings.mode === "multiple-choice"
                  ? `Choice Quiz · Round ${game.roundNumber} of 10`
                  : "Casual room"
          }
          onBack={leaveMultiplayer}
          rightAction={
            game.settings.mode === "timed" && !isFinished ? (
              <span className="font-mono text-sm font-bold">
                {formatTime(multiplayerTimeRemaining)}
              </span>
            ) : isChoiceMode && !isFinished ? (
              <span className="font-mono text-sm font-bold">
                {isChoiceReveal
                  ? `Reveal ${multiplayerChoiceTimeRemaining}s`
                  : `${multiplayerChoiceTimeRemaining}s`}
              </span>
            ) : undefined
          }
        />
        <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_280px]">
          <section>
            {isFinished ? (
              <Card className="text-center">
                <CardHeader>
                  <Trophy className="mx-auto h-14 w-14 text-amber-500" />
                  <CardTitle className="text-3xl">
                    {winnerNames.length === 1 ? `${winnerNames[0]} wins!` : "It's a tie!"}
                  </CardTitle>
                  <CardDescription>
                    {winnerNames.length > 1 && winnerNames.join(" and ")}
                    {game.revealedCountryName &&
                      ` The final flag was ${game.revealedCountryName}.`}
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
                      Waiting for the host to start another match.
                    </p>
                  )}
                  <div>
                    <Button variant="ghost" onClick={leaveMultiplayer}>
                      Leave Room
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : game.countryCode ? (
              <div className="space-y-4">
                <FlagCard code={game.countryCode} round={game.roundNumber} />
                {isChoiceMode ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {game.choices.map((choice) => {
                        const correct =
                          isChoiceReveal && choice === game.correctCountryName
                        const selectedWrong =
                          isChoiceReveal &&
                          choice === game.myChoice &&
                          choice !== game.correctCountryName
                        const selected =
                          !isChoiceReveal && choice === game.myChoice
                        return (
                          <button
                            key={choice}
                            type="button"
                            disabled={
                              isChoiceReveal ||
                              Boolean(game.myChoice) ||
                              multiplayer.connectionStatus !== "connected"
                            }
                            onClick={() => multiplayer.submitChoice(choice)}
                            className={`flex min-h-16 items-center justify-between rounded-2xl border px-4 py-3 text-left font-semibold transition-colors ${
                              correct
                                ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : selectedWrong
                                  ? "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300"
                                  : selected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : isChoiceReveal
                                      ? "opacity-50"
                                      : "hover:border-primary/50 hover:bg-accent/40"
                            }`}
                          >
                            <span>{choice}</span>
                            {correct && (
                              <CheckCircle2 className="h-5 w-5 shrink-0" />
                            )}
                            {selectedWrong && (
                              <XCircle className="h-5 w-5 shrink-0" />
                            )}
                            {selected && (
                              <CheckCircle2 className="h-5 w-5 shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex min-h-8 items-center justify-between gap-3 text-sm text-muted-foreground">
                      <p>
                        {isChoiceReveal
                          ? `Correct answer: ${game.correctCountryName}`
                          : game.myChoice
                            ? `Answer locked: ${game.myChoice}`
                            : "Choose one answer before time runs out."}
                      </p>
                      <span className="shrink-0">
                        {game.submittedPlayerIds.length}/{sortedPlayers.length}{" "}
                        answered
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <GuessForm
                      value={multiplayerGuess}
                      onChange={setMultiplayerGuess}
                      onSubmit={submitMultiplayerGuess}
                      disabled={multiplayer.connectionStatus !== "connected"}
                    />
                    <p className="min-h-6 text-sm text-muted-foreground">
                      {multiplayerMessage ?? "Be the first to name this country."}
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </section>

          <aside className="rounded-3xl border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Scoreboard</h2>
              <span className="text-xs text-muted-foreground">
                Round {game.roundNumber}{isChoiceMode ? "/10" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {sortedPlayers.map((player, index) => {
                const roundAnswer = game.roundAnswers[player.id]
                const answered = game.submittedPlayerIds.includes(player.id)
                const answeredCorrectly =
                  isChoiceReveal && roundAnswer === game.correctCountryName
                return (
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
                        {isChoiceMode && (
                          <p
                            className={`truncate text-[11px] ${
                              answeredCorrectly
                                ? "text-emerald-600 dark:text-emerald-400"
                                : isChoiceReveal && roundAnswer
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {isChoiceReveal
                              ? roundAnswer ?? "No answer"
                              : answered
                                ? "Answered"
                                : "Choosing..."}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-lg font-black">{player.score}</span>
                  </div>
                )
              })}
            </div>
            <Button className="mt-5 w-full" variant="outline" onClick={leaveMultiplayer}>
              Leave Room
            </Button>
          </aside>
        </main>
      </div>
    )
  }

  return null
}
