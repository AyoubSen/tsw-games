import { useState } from "react"
import { Users, ArrowLeft, Loader2, Clock, MessageSquare, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { MafiaSettings } from "./useMultiplayerMafia"

interface GameModeSelectorProps {
  onCreateMultiplayer: (playerName: string, settings: MafiaSettings) => void
  onJoinMultiplayer: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
}

type Step = "mode" | "create" | "join"

const DISCUSSION_TIME_OPTIONS = [
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
  { value: 120, label: "120s" },
]

const VOTING_TIME_OPTIONS = [
  { value: 20, label: "20s" },
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
]

const NIGHT_TIME_OPTIONS = [
  { value: 20, label: "20s" },
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
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

  const [discussionTime, setDiscussionTime] = useState(90)
  const [votingTime, setVotingTime] = useState(30)
  const [nightTime, setNightTime] = useState(30)

  const handleBack = () => {
    if (step === "create" || step === "join") setStep("mode")
  }

  const handleCreateGame = () => {
    if (!playerName.trim()) return
    onCreateMultiplayer(playerName.trim(), {
      discussionTime,
      votingTime,
      nightTime,
    })
  }

  const handleJoinGame = () => {
    if (!playerName.trim() || roomCode.length < 6) return
    onJoinMultiplayer(roomCode.trim(), playerName.trim())
  }

  if (step === "mode") {
    return (
      <div className="flex flex-col items-center gap-4 p-4 max-w-md mx-auto">
        <div className="text-center space-y-1 py-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Moon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Mafia</h1>
          <p className="text-sm text-muted-foreground">Social deduction. Find the werewolves before they eliminate the village!</p>
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
                <CardDescription className="text-sm">Start a new village and invite friends</CardDescription>
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
                <CardDescription className="text-sm">Enter a code to join a friend's village</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          5-12 players. Werewolves vs Village.
        </p>
      </div>
    )
  }

  if (step === "create") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Create Village</h1>
          <p className="text-sm text-muted-foreground">Configure your game settings</p>
        </div>

        <Card className="w-full">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="playerName" className="text-sm font-medium">Your Name</label>
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

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Discussion Time
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {DISCUSSION_TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDiscussionTime(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      discussionTime === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Voting Time
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {VOTING_TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setVotingTime(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      votingTime === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Moon className="w-4 h-4" />
                Night Time
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {NIGHT_TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setNightTime(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      nightTime === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                {discussionTime}s discussion
              </span>
              <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                {votingTime}s voting
              </span>
              <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                {nightTime}s night
              </span>
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
                  Creating Village...
                </>
              ) : (
                "Create Village"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
      <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>

      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold">Join Village</h1>
        <p className="text-sm text-muted-foreground">Enter the invite code and your name</p>
      </div>

      <Card className="w-full">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="roomCode" className="text-sm font-medium">Invite Code</label>
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
            <label htmlFor="joinPlayerName" className="text-sm font-medium">Your Name</label>
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
              "Join Village"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
