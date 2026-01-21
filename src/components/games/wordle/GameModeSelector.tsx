import { useState } from "react"
import { Users, User, Zap, Clock, Eye, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { GameMode } from "../../../../party/wordle"

interface GameModeSelectorProps {
  onSinglePlayer: () => void
  onCreateMultiplayer: (mode: GameMode, playerName: string) => void
  onJoinMultiplayer: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
}

type Step = "mode" | "multiplayer-type" | "multiplayer-mode" | "join"

const MULTIPLAYER_MODES: { mode: GameMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    mode: "race",
    label: "Race",
    description: "First to guess the word wins! Everyone plays simultaneously.",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    mode: "turns",
    label: "Turn Based",
    description: "Take turns guessing. See each other's progress after each round.",
    icon: <Clock className="w-5 h-5" />,
  },
  {
    mode: "hidden",
    label: "Versus",
    description: "Play simultaneously but results are hidden until everyone finishes.",
    icon: <Eye className="w-5 h-5" />,
  },
]

export function GameModeSelector({
  onSinglePlayer,
  onCreateMultiplayer,
  onJoinMultiplayer,
  isConnecting,
  error,
}: GameModeSelectorProps) {
  const [step, setStep] = useState<Step>("mode")
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [selectedMode, setSelectedMode] = useState<GameMode>("race")

  const handleBack = () => {
    if (step === "multiplayer-type") setStep("mode")
    else if (step === "multiplayer-mode") setStep("multiplayer-type")
    else if (step === "join") setStep("multiplayer-type")
  }

  const handleCreateGame = () => {
    if (!playerName.trim()) return
    onCreateMultiplayer(selectedMode, playerName.trim())
  }

  const handleJoinGame = () => {
    if (!playerName.trim() || roomCode.length < 6) return
    onJoinMultiplayer(roomCode.trim(), playerName.trim())
  }

  // Step 1: Choose single player or multiplayer
  if (step === "mode") {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-lg mx-auto">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Wordle</h1>
          <p className="text-muted-foreground">Choose how you want to play</p>
        </div>

        <div className="grid gap-4 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={onSinglePlayer}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="p-3 rounded-lg bg-primary/10">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Single Player</CardTitle>
                <CardDescription>Classic Wordle - guess the word in 6 tries</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("multiplayer-type")}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Multiplayer</CardTitle>
                <CardDescription>Compete with friends in real-time</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  // Step 2: Create or Join
  if (step === "multiplayer-type") {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-lg mx-auto">
        <Button variant="ghost" className="self-start" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Multiplayer Wordle</h1>
          <p className="text-muted-foreground">Create a new game or join an existing one</p>
        </div>

        <div className="grid gap-4 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("multiplayer-mode")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Create Game</CardTitle>
              <CardDescription>Start a new game and invite friends with a code</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("join")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Join Game</CardTitle>
              <CardDescription>Enter a code to join a friend's game</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  // Step 3a: Choose multiplayer mode and enter name
  if (step === "multiplayer-mode") {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-lg mx-auto">
        <Button variant="ghost" className="self-start" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Create Game</h1>
          <p className="text-muted-foreground">Choose a game mode and enter your name</p>
        </div>

        <Card className="w-full">
          <CardContent className="pt-6 space-y-6">
            {/* Game Mode Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Game Mode</label>
              <div className="grid gap-2">
                {MULTIPLAYER_MODES.map((modeOption) => (
                  <button
                    key={modeOption.mode}
                    onClick={() => setSelectedMode(modeOption.mode)}
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
                      <p className="font-medium">{modeOption.label}</p>
                      <p className="text-sm text-muted-foreground">{modeOption.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Player Name */}
            <div className="space-y-2">
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
              size="lg"
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
      <div className="flex flex-col items-center gap-6 p-6 max-w-lg mx-auto">
        <Button variant="ghost" className="self-start" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Join Game</h1>
          <p className="text-muted-foreground">Enter the invite code and your name</p>
        </div>

        <Card className="w-full">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="roomCode" className="text-sm font-medium">
                Invite Code
              </label>
              <Input
                id="roomCode"
                placeholder="Enter 6-character code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="font-mono text-center text-xl tracking-widest uppercase"
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
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
              size="lg"
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
