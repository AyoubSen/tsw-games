import { useState } from "react"
import { Users, User, Zap, Clock, ArrowLeft, Loader2, BadgeQuestionMark, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { GameMode, RevealMode, SeriesLength } from "../../../../party/wordle"
import type { SinglePlayerMode } from "./useWordle"

interface GameModeSelectorProps {
  onSinglePlayer: (mode: SinglePlayerMode) => void
  onCreateMultiplayer: (
    mode: GameMode,
    revealMode: RevealMode,
    hardMode: boolean,
    seriesLength: SeriesLength,
    playerName: string,
  ) => void
  onJoinMultiplayer: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
  initialRoomCode?: string
}

type Step = "mode" | "single-mode" | "multiplayer-type" | "multiplayer-mode" | "join"

const SINGLE_PLAYER_MODES: { mode: SinglePlayerMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    mode: "classic",
    label: "Classic",
    description: "Standard Wordle with six guesses.",
    icon: <User className="w-5 h-5" />,
  },
  {
    mode: "hard",
    label: "Hard Mode",
    description: "Every revealed hint must be reused in later guesses.",
    icon: <ShieldCheck className="w-5 h-5" />,
  },
  {
    mode: "one-lie",
    label: "One Lie",
    description: "One yellow or gray clue lies in every incorrect row.",
    icon: <BadgeQuestionMark className="w-5 h-5" />,
  },
]

const MULTIPLAYER_MODES: { mode: GameMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    mode: "race",
    label: "Race",
    description: "First to guess the word wins! Everyone plays simultaneously.",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    mode: "classic",
    label: "Classic",
    description: "Everyone gets 6 guesses. Fewest attempts wins.",
    icon: <Clock className="w-5 h-5" />,
  },
  {
    mode: "one-lie",
    label: "One Lie",
    description: "Race with one false yellow or gray clue in every incorrect guess.",
    icon: <BadgeQuestionMark className="w-5 h-5" />,
  },
]

const REVEAL_OPTIONS: { value: RevealMode; label: string; description: string }[] = [
  {
    value: "after-round",
    label: "Reveal after each round",
    description: "See everyone's guesses after each round",
  },
  {
    value: "at-end",
    label: "Reveal at end",
    description: "Results hidden until everyone finishes",
  },
]

export function GameModeSelector({
  onSinglePlayer,
  onCreateMultiplayer,
  onJoinMultiplayer,
  isConnecting,
  error,
  initialRoomCode = "",
}: GameModeSelectorProps) {
  const [step, setStep] = useState<Step>(initialRoomCode ? "join" : "mode")
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState(initialRoomCode)
  const [selectedMode, setSelectedMode] = useState<GameMode>("race")
  const [revealMode, setRevealMode] = useState<RevealMode>("after-round")
  const [hardMode, setHardMode] = useState(false)
  const [seriesLength, setSeriesLength] = useState<SeriesLength>(1)

  const handleBack = () => {
    if (step === "single-mode" || step === "multiplayer-type") setStep("mode")
    else if (step === "multiplayer-mode") setStep("multiplayer-type")
    else if (step === "join") setStep("multiplayer-type")
  }

  const handleCreateGame = () => {
    if (!playerName.trim()) return
    onCreateMultiplayer(selectedMode, revealMode, hardMode, seriesLength, playerName.trim())
  }

  const handleJoinGame = () => {
    if (!playerName.trim() || roomCode.length < 6) return
    onJoinMultiplayer(roomCode.trim(), playerName.trim())
  }

  // Step 1: Choose single player or multiplayer
  if (step === "mode") {
    return (
      <div className="flex flex-col items-center gap-4 p-4 max-w-md mx-auto">
        <div className="text-center space-y-1 py-2">
          <h1 className="text-2xl font-bold">Wordle</h1>
          <p className="text-sm text-muted-foreground">Choose how you want to play</p>
        </div>

        <div className="grid gap-3 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("single-mode")}
          >
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base">Single Player</CardTitle>
                <CardDescription className="text-sm">Classic, Hard, and twisted solo modes</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("multiplayer-type")}
          >
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base">Multiplayer</CardTitle>
                <CardDescription className="text-sm">Compete with friends in real-time</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  if (step === "single-mode") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Single Player</h1>
          <p className="text-sm text-muted-foreground">Choose how the clues should behave</p>
        </div>

        <div className="grid gap-3 w-full">
          {SINGLE_PLAYER_MODES.map(modeOption => (
            <Card
              key={modeOption.mode}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => onSinglePlayer(modeOption.mode)}
            >
              <CardHeader className="flex flex-row items-center gap-3 p-4">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                  {modeOption.icon}
                </div>
                <div className="space-y-0.5">
                  <CardTitle className="text-base">{modeOption.label}</CardTitle>
                  <CardDescription className="text-sm">{modeOption.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Step 2: Create or Join
  if (step === "multiplayer-type") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Multiplayer Wordle</h1>
          <p className="text-sm text-muted-foreground">Create a new game or join an existing one</p>
        </div>

        <div className="grid gap-3 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("multiplayer-mode")}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-base">Create Game</CardTitle>
              <CardDescription className="text-sm">Start a new game and invite friends with a code</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("join")}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-base">Join Game</CardTitle>
              <CardDescription className="text-sm">Enter a code to join a friend's game</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  // Step 3a: Choose multiplayer mode and enter name
  if (step === "multiplayer-mode") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Create Game</h1>
          <p className="text-sm text-muted-foreground">Choose a game mode and enter your name</p>
        </div>

        <Card className="w-full">
          <CardContent className="p-4 space-y-4">
            {/* Game Mode Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Game Mode</label>
              <div className="grid gap-2">
                {MULTIPLAYER_MODES.map((modeOption) => (
                  <button
                    key={modeOption.mode}
                    onClick={() => {
                      setSelectedMode(modeOption.mode)
                      if (modeOption.mode === "one-lie") setHardMode(false)
                    }}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                      selectedMode === modeOption.mode
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div
                      className={cn(
                        "p-2 rounded-md",
                        selectedMode === modeOption.mode ? "bg-primary/20" : "bg-muted"
                      )}
                    >
                      {modeOption.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{modeOption.label}</p>
                      <p className="text-xs text-muted-foreground">{modeOption.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reveal Mode Toggle - only for Classic mode */}
            {selectedMode === "classic" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">When to reveal guesses</label>
                <div className="grid gap-2">
                  {REVEAL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setRevealMode(option.value)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                        revealMode === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0",
                          revealMode === option.value
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        )}
                      />
                      <div>
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Match Length</label>
              <div className="grid grid-cols-3 gap-2">
                {([1, 3, 5] as SeriesLength[]).map(length => (
                  <Button
                    key={length}
                    type="button"
                    variant={seriesLength === length ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSeriesLength(length)}
                  >
                    {length === 1 ? "Single" : `Best of ${length}`}
                  </Button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => selectedMode !== "one-lie" && setHardMode(current => !current)}
              disabled={selectedMode === "one-lie"}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                hardMode ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                selectedMode === "one-lie" && "cursor-not-allowed opacity-50",
              )}
            >
              <ShieldCheck className="h-5 w-5" />
              <div>
                <p className="text-sm font-medium">Hard Mode {hardMode ? "On" : "Off"}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedMode === "one-lie"
                    ? "Unavailable when clues can lie"
                    : "Future guesses must reuse every revealed hint"}
                </p>
              </div>
            </button>

            {/* Player Name */}
            <div className="space-y-1.5">
              <label htmlFor="playerName" className="text-sm font-medium">
                Your Name
              </label>
              <Input
                id="playerName"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                disabled={isConnecting}
              />
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <Button
              onClick={handleCreateGame}
              className="w-full"
              disabled={isConnecting || !playerName.trim()}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Game...
                </>
              ) : (
                "Create Game"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Step 3b: Join game - enter code and name
  if (step === "join") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Join Game</h1>
          <p className="text-sm text-muted-foreground">Enter the invite code and your name</p>
        </div>

        <Card className="w-full">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="roomCode" className="text-sm font-medium">
                Invite Code
              </label>
              <Input
                id="roomCode"
                placeholder="Enter 6-character code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="font-mono text-center text-lg tracking-widest uppercase"
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="joinPlayerName" className="text-sm font-medium">
                Your Name
              </label>
              <Input
                id="joinPlayerName"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                disabled={isConnecting}
              />
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <Button
              onClick={handleJoinGame}
              className="w-full"
              disabled={isConnecting || !playerName.trim() || roomCode.length < 6}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join Game"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
