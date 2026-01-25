import { useState } from "react"
import { Users, ArrowLeft, Loader2, Link2, Clock, Heart, Skull } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { GameSettings } from "./useMultiplayerWordchain"

interface GameModeSelectorProps {
  onCreateMultiplayer: (playerName: string, settings: GameSettings) => void
  onJoinMultiplayer: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
}

type Step = "mode" | "create" | "join"

const TIME_OPTIONS = [
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
  { value: 20, label: "20s" },
  { value: 30, label: "30s" },
]

const HEART_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
]

export function GameModeSelector({
  onCreateMultiplayer,
  onJoinMultiplayer,
  isConnecting,
  error,
}: GameModeSelectorProps) {
  const [step, setStep] = useState<Step>("mode")
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [turnTimeLimit, setTurnTimeLimit] = useState(15)
  const [gameMode, setGameMode] = useState<"casual" | "hardcore">("casual")
  const [maxHearts, setMaxHearts] = useState(3)

  const handleBack = () => {
    if (step === "create" || step === "join") setStep("mode")
  }

  const handleCreateGame = () => {
    if (!playerName.trim()) return
    onCreateMultiplayer(playerName.trim(), {
      turnTimeLimit,
      gameMode,
      maxHearts: gameMode === "casual" ? maxHearts : 1,
    })
  }

  const handleJoinGame = () => {
    if (!playerName.trim() || roomCode.length < 6) return
    onJoinMultiplayer(roomCode.trim(), playerName.trim())
  }

  // Step 1: Choose create or join
  if (step === "mode") {
    return (
      <div className="flex flex-col items-center gap-4 p-4 max-w-md mx-auto">
        <div className="text-center space-y-1 py-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Link2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Word Chain</h1>
          <p className="text-sm text-muted-foreground">Chain words with friends</p>
        </div>

        <div className="grid gap-3 w-full">
          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("create")}
          >
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base">Create Game</CardTitle>
                <CardDescription className="text-sm">Start a new game and invite friends</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => setStep("join")}
          >
            <CardHeader className="flex flex-row items-center gap-3 p-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-base">Join Game</CardTitle>
                <CardDescription className="text-sm">Enter a code to join a friend's game</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          Each word must start with the last letter of the previous word.
          <br />
          Any valid English word works. Don't run out of time!
        </p>
      </div>
    )
  }

  // Step 2a: Create game with settings
  if (step === "create") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Create Game</h1>
          <p className="text-sm text-muted-foreground">Configure your game settings</p>
        </div>

        <Card className="w-full">
          <CardContent className="p-4 space-y-4">
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
                autoFocus
              />
            </div>

            {/* Game Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Game Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setGameMode("casual")}
                  disabled={isConnecting}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 px-3 rounded-lg border text-sm font-medium transition-colors",
                    gameMode === "casual"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Heart className="w-5 h-5" />
                  <span>Casual</span>
                  <span className="text-xs font-normal text-muted-foreground">Multiple lives</span>
                </button>
                <button
                  onClick={() => setGameMode("hardcore")}
                  disabled={isConnecting}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 px-3 rounded-lg border text-sm font-medium transition-colors",
                    gameMode === "hardcore"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border hover:border-destructive/50"
                  )}
                >
                  <Skull className="w-5 h-5" />
                  <span>Hardcore</span>
                  <span className="text-xs font-normal text-muted-foreground">One mistake = out</span>
                </button>
              </div>
            </div>

            {/* Hearts (only for casual mode) */}
            {gameMode === "casual" && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  Lives per Player
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {HEART_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setMaxHearts(option.value)}
                      disabled={isConnecting}
                      className={cn(
                        "py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1",
                        maxHearts === option.value
                          ? "border-red-500 bg-red-500/10 text-red-500"
                          : "border-border hover:border-red-500/50"
                      )}
                    >
                      <Heart className="w-3 h-3" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Turn Time Limit */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time per Turn
              </label>
              <div className="grid grid-cols-4 gap-2">
                {TIME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setTurnTimeLimit(option.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-3 rounded-lg border text-sm font-medium transition-colors",
                      turnTimeLimit === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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

  // Step 2b: Join game
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
                autoFocus
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
