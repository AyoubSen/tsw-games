import { useState } from "react"
import { Users, ArrowLeft, Loader2, Clock, Coins, TrendingUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { PokerSettings } from "../useMultiplayerPoker"

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

// Chip-styled toggle button for settings
function ChipToggle({ selected, onClick, label, disabled }: {
  selected: boolean
  onClick: () => void
  label: string
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "py-2.5 px-2 rounded-xl text-xs font-bold transition-all relative overflow-hidden",
        "border-2",
        selected
          ? "border-yellow-500 bg-gradient-to-b from-yellow-500/20 to-yellow-600/10 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.2)]"
          : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {selected && (
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-400/5 to-transparent pointer-events-none" />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  )
}

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
      <div className="flex flex-col items-center gap-5 p-4 max-w-md mx-auto">
        {/* Header with suit fan */}
        <div className="text-center space-y-2 py-3">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-2xl text-red-500" style={{ transform: "rotate(-20deg)" }}>{"\u2665"}</span>
            <span className="text-2xl text-zinc-300" style={{ transform: "rotate(-7deg)" }}>{"\u2660"}</span>
            <span className="text-2xl text-red-500" style={{ transform: "rotate(7deg)" }}>{"\u2666"}</span>
            <span className="text-2xl text-zinc-300" style={{ transform: "rotate(20deg)" }}>{"\u2663"}</span>
          </div>
          <h1
            className="text-2xl font-extrabold"
            style={{
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Texas Hold'em
          </h1>
          <p className="text-sm text-zinc-500">Play poker with friends! Bet, bluff, and win chips.</p>
        </div>

        <div className="grid gap-3 w-full">
          {/* Create Game card */}
          <button
            onClick={() => setStep("create")}
            className="w-full text-left p-4 rounded-xl transition-all relative overflow-hidden group"
            style={{
              background: "linear-gradient(135deg, rgba(30,30,45,0.9), rgba(25,25,40,0.95))",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Watermark suit */}
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-5xl text-white/[0.03] group-hover:text-white/[0.06] transition-colors">{"\u2660"}</span>
            <div className="flex items-center gap-3 relative z-10">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-600/20 to-emerald-700/10 border border-emerald-600/20">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-base font-bold text-white">Create Game</div>
                <div className="text-sm text-zinc-500">Start a new table and invite friends</div>
              </div>
            </div>
          </button>

          {/* Join Game card */}
          <button
            onClick={() => setStep("join")}
            className="w-full text-left p-4 rounded-xl transition-all relative overflow-hidden group"
            style={{
              background: "linear-gradient(135deg, rgba(30,30,45,0.9), rgba(25,25,40,0.95))",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-5xl text-white/[0.03] group-hover:text-white/[0.06] transition-colors">{"\u2665"}</span>
            <div className="flex items-center gap-3 relative z-10">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-sky-600/20 to-sky-700/10 border border-sky-600/20">
                <Users className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <div className="text-base font-bold text-white">Join Game</div>
                <div className="text-sm text-zinc-500">Enter a code to join a friend's table</div>
              </div>
            </div>
          </button>
        </div>

        <p className="text-xs text-zinc-600 text-center mt-1">
          2-8 players. Standard Texas Hold'em rules.
        </p>
      </div>
    )
  }

  if (step === "create") {
    return (
      <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
        <button
          onClick={handleBack}
          className="self-start flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors -ml-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-white">Create Table</h1>
          <p className="text-sm text-zinc-500">Configure your poker game</p>
        </div>

        <div
          className="rounded-xl p-5 space-y-5"
          style={{
            background: "linear-gradient(180deg, rgba(25,25,40,0.95), rgba(20,20,35,0.98))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="playerNameV2" className="text-sm font-medium text-zinc-300">Your Name</label>
            <Input
              id="playerNameV2"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              disabled={isConnecting}
              autoFocus
              className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              Starting Chips
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CHIP_OPTIONS.map((opt) => (
                <ChipToggle
                  key={opt.value}
                  selected={startingChips === opt.value}
                  onClick={() => setStartingChips(opt.value)}
                  label={opt.label}
                  disabled={isConnecting}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              Blinds (SB/BB)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {BLIND_OPTIONS.map((opt) => (
                <ChipToggle
                  key={opt.value}
                  selected={smallBlind === opt.value}
                  onClick={() => setSmallBlind(opt.value)}
                  label={opt.label}
                  disabled={isConnecting}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Blind Increase
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {BLIND_INCREASE_OPTIONS.map((opt) => (
                <ChipToggle
                  key={opt.value}
                  selected={blindIncrease === opt.value}
                  onClick={() => setBlindIncrease(opt.value)}
                  label={opt.label}
                  disabled={isConnecting}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              Turn Time Limit
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIMER_OPTIONS.map((opt) => (
                <ChipToggle
                  key={opt.value}
                  selected={turnTimeLimit === opt.value}
                  onClick={() => setTurnTimeLimit(opt.value)}
                  label={opt.label}
                  disabled={isConnecting}
                />
              ))}
            </div>
          </div>

          {/* Settings summary */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs rounded-full border border-zinc-700">
              {startingChips.toLocaleString()} chips
            </span>
            <span className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs rounded-full border border-zinc-700">
              {smallBlind}/{smallBlind * 2} blinds
            </span>
            {blindIncrease > 0 && (
              <span className="px-2 py-1 bg-amber-900/30 text-amber-400 text-xs rounded-full border border-amber-800/30 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Every {blindIncrease} hands
              </span>
            )}
            {turnTimeLimit > 0 && (
              <span className="px-2 py-1 bg-sky-900/30 text-sky-400 text-xs rounded-full border border-sky-800/30 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {turnTimeLimit}s timer
              </span>
            )}
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            onClick={handleCreateGame}
            disabled={isConnecting || !playerName.trim()}
            className={cn(
              "w-full py-3 rounded-lg font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2",
              isConnecting || !playerName.trim()
                ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white"
            )}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Table...
              </>
            ) : (
              "Create Table"
            )}
          </button>
        </div>
      </div>
    )
  }

  // Join step
  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto">
      <button
        onClick={handleBack}
        className="self-start flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors -ml-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-white">Join Table</h1>
        <p className="text-sm text-zinc-500">Enter the invite code and your name</p>
      </div>

      <div
        className="rounded-xl p-5 space-y-4"
        style={{
          background: "linear-gradient(180deg, rgba(25,25,40,0.95), rgba(20,20,35,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="roomCodeV2" className="text-sm font-medium text-zinc-300">Invite Code</label>
          <Input
            id="roomCodeV2"
            placeholder="Enter 6-character code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="font-mono text-center text-lg tracking-widest uppercase bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
            disabled={isConnecting}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="joinPlayerNameV2" className="text-sm font-medium text-zinc-300">Your Name</label>
          <Input
            id="joinPlayerNameV2"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            disabled={isConnecting}
            className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600"
          />
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          onClick={handleJoinGame}
          disabled={isConnecting || !playerName.trim() || roomCode.length < 6}
          className={cn(
            "w-full py-3 rounded-lg font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2",
            isConnecting || !playerName.trim() || roomCode.length < 6
              ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              : "bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white"
          )}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Joining...
            </>
          ) : (
            "Join Table"
          )}
        </button>
      </div>
    </div>
  )
}
