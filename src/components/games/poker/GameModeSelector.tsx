import { useState } from "react"
import { Users, ArrowLeft, Loader2, Clock, Coins, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { PokerSettings } from "./useMultiplayerPoker"

interface GameModeSelectorProps {
  onCreateMultiplayer: (playerName: string, settings: PokerSettings) => void
  onJoinMultiplayer: (roomCode: string, playerName: string) => void
  isConnecting: boolean
  error: string | null
}

type Step = "mode" | "create" | "join"

const CHIP_OPTIONS = [
  { value: 500, label: "500" },
  { value: 1000, label: "1,000" },
  { value: 2000, label: "2,000" },
  { value: 5000, label: "5,000" },
]

const BLIND_OPTIONS = [
  { value: 5, label: "5/10" },
  { value: 10, label: "10/20" },
  { value: 25, label: "25/50" },
  { value: 50, label: "50/100" },
]

const BLIND_INCREASE_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 5, label: "5 hands" },
  { value: 10, label: "10 hands" },
  { value: 20, label: "20 hands" },
]

const TIMER_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
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

  const [startingChips, setStartingChips] = useState(1000)
  const [smallBlind, setSmallBlind] = useState(10)
  const [blindIncrease, setBlindIncrease] = useState(0)
  const [turnTimeLimit, setTurnTimeLimit] = useState(0)

  const handleBack = () => {
    if (step === "create" || step === "join") setStep("mode")
  }

  const handleCreateGame = () => {
    if (!playerName.trim()) return
    onCreateMultiplayer(playerName.trim(), {
      startingChips,
      smallBlind,
      blindIncrease,
      turnTimeLimit,
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
            <span className="text-3xl">♠</span>
          </div>
          <h1 className="text-2xl font-bold">Texas Hold'em</h1>
          <p className="text-sm text-muted-foreground">Play poker with friends! Bet, bluff, and win chips.</p>
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
                <CardDescription className="text-sm">Start a new table and invite friends</CardDescription>
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
                <CardDescription className="text-sm">Enter a code to join a friend's table</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          2-8 players. Standard Texas Hold'em rules.
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
          <h1 className="text-xl font-bold">Create Table</h1>
          <p className="text-sm text-muted-foreground">Configure your poker game</p>
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
                <Coins className="w-4 h-4" />
                Starting Chips
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {CHIP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStartingChips(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      startingChips === opt.value
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
                <Coins className="w-4 h-4" />
                Blinds (SB/BB)
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {BLIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSmallBlind(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      smallBlind === opt.value
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
                <TrendingUp className="w-4 h-4" />
                Blind Increase
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {BLIND_INCREASE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBlindIncrease(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      blindIncrease === opt.value
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
                Turn Time Limit
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {TIMER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTurnTimeLimit(opt.value)}
                    disabled={isConnecting}
                    className={cn(
                      "py-2 px-2 rounded-lg border text-xs font-medium transition-colors",
                      turnTimeLimit === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Settings summary */}
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                {startingChips.toLocaleString()} chips
              </span>
              <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full">
                {smallBlind}/{smallBlind * 2} blinds
              </span>
              {blindIncrease > 0 && (
                <span className="px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs rounded-full flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Every {blindIncrease} hands
                </span>
              )}
              {turnTimeLimit > 0 && (
                <span className="px-2 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {turnTimeLimit}s timer
                </span>
              )}
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
                  Creating Table...
                </>
              ) : (
                "Create Table"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Join step
  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
      <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={handleBack}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>

      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold">Join Table</h1>
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
              "Join Table"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
