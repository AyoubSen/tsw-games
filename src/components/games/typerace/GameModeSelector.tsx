import { useState } from "react"
import { Users, User, Zap, Trophy, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { GameMode } from "../../../../party/typerace"

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
    description: "First to finish typing wins!",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    mode: "classic",
    label: "Classic",
    description: "Everyone finishes, highest WPM wins.",
    icon: <Trophy className="w-5 h-5" />,
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
      <div className="flex flex-col items-center gap-4 p-4 max-w-md mx-auto">
        <div className="text-center space-y-1 py-2">
          <h1 className="text-2xl font-bold">Type Race</h1>
          <p className="text-sm text-muted-foreground">Choose how you want to play</p>
        </div>

        <div className="grid gap-3 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={onSinglePlayer}
          >
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base">Single Player</CardTitle>
                <CardDescription className="text-sm">Practice your typing speed</CardDescription>
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
                <CardDescription className="text-sm">Race against friends</CardDescription>
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
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Multiplayer Type Race</h1>
          <p className="text-sm text-muted-foreground">Create a new game or join an existing one</p>
        </div>

        <div className="grid gap-3 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("multiplayer-mode")}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-base">Create Game</CardTitle>
              <CardDescription className="text-sm">Start a new game and invite friends</CardDescription>
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
                      <p className="font-medium text-sm">{modeOption.label}</p>
                      <p className="text-xs text-muted-foreground">{modeOption.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

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

  // Step 3b: Join game
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
