import { createFileRoute } from "@tanstack/react-router"
import { GameRouteError } from "@/components/GameErrorBoundary"
import { History, Play, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { TimelineGame } from "@/components/games/timeline-chaos/TimelineGame"
import { useMultiplayerTimelineChaos } from "@/components/games/timeline-chaos/useMultiplayerTimelineChaos"
import { SOLO_PLAYER_ID, useSoloTimeline } from "@/components/games/timeline-chaos/useSoloTimeline"
import { GameTopBar, MultiplayerLobby, MultiplayerSetupCard } from "@/components/multiplayer/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import { TIMELINE_PACKS, TIMELINE_PAIR_POINTS, TIMELINE_PERFECT_BONUS, TIMELINE_SPEED_BONUS } from "@/lib/timelineChaos"
import type { TimelineRoundCount, TimelineSeconds, TimelineSettings } from "../../../party/timeline-chaos"

export const Route = createFileRoute("/games/timeline-chaos")({
  validateSearch: parseInviteSearch,
  component: TimelineChaosPage,
  errorComponent: GameRouteError,
})

type View = "select" | "solo" | "lobby" | "game"

const ROUND_OPTIONS: TimelineRoundCount[] = [5, 8, 10]
const TIME_OPTIONS: TimelineSeconds[] = [15, 20, 30]
const NOOP = () => {}

const RULES = [
  { title: "1. Deal", text: "Four events land on the table, each a card with its category." },
  { title: "2. Place", text: "Drag cards onto the rail, oldest to newest, or tap a card and then a slot. Lock in before time runs out; a full rail counts at the buzzer." },
  { title: "3. Date", text: `Every pair in the right order scores +${TIMELINE_PAIR_POINTS} (6 pairs a round). A perfect timeline adds +${TIMELINE_PERFECT_BONUS} and up to +${TIMELINE_SPEED_BONUS} for speed.` },
]

function Settings({ value, onChange }: { value: TimelineSettings; onChange: (settings: TimelineSettings) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Event pack</p>
        <div className="grid grid-cols-4 gap-2">
          {TIMELINE_PACKS.map((pack) => (
            <button key={pack.id} type="button" onClick={() => onChange({ ...value, pack: pack.id })} className={`rounded-xl border px-2 py-2 text-sm font-bold ${value.pack === pack.id ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "hover:border-amber-500/50"}`}>
              {pack.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold">Rounds</p>
          <div className="grid grid-cols-3 gap-2">
            {ROUND_OPTIONS.map((rounds) => <button key={rounds} type="button" onClick={() => onChange({ ...value, rounds })} className={`rounded-lg border py-2 text-sm font-bold ${value.rounds === rounds ? "border-amber-500 bg-amber-500/10" : ""}`}>{rounds}</button>)}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Seconds</p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_OPTIONS.map((roundSeconds) => <button key={roundSeconds} type="button" onClick={() => onChange({ ...value, roundSeconds })} className={`rounded-lg border py-2 text-sm font-bold ${value.roundSeconds === roundSeconds ? "border-amber-500 bg-amber-500/10" : ""}`}>{roundSeconds}</button>)}
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineChaosPage() {
  const { room: invitedRoom } = Route.useSearch()
  const [view, setView] = useState<View>(invitedRoom ? "lobby" : "select")
  const [settings, setSettings] = useState<TimelineSettings>({ pack: "mixed", rounds: 8, roundSeconds: 20 })
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState(invitedRoom ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const multiplayer = useMultiplayerTimelineChaos()
  const solo = useSoloTimeline()
  const gameNight = useGameNight()
  const hasGameState = Boolean(multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.players[multiplayer.playerId])
  const isGameNightConnection = gameNight.connection?.gameId === "timeline-chaos"
  const session = useMultiplayerSession({
    game: "timeline-chaos",
    joinGame: multiplayer.joinGame,
    hasGameState,
    error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoom,
    onAbandon: multiplayer.abandonReconnect,
    disabled: isGameNightConnection,
  })
  const connectGameNightHost = useCallback((roomId: string, playerName: string) => {
    multiplayer.createGame(playerName, settings, roomId)
  }, [multiplayer.createGame, settings])
  const bridge = useGameNightGameBridge({
    gameId: "timeline-chaos",
    hasGameState,
    finished: multiplayer.gameState?.status === "finished",
    connectHost: connectGameNightHost,
    connectPlayer: multiplayer.joinGame,
  })

  useEffect(() => { if (invitedRoom) setRoomCode(invitedRoom) }, [invitedRoom])
  useEffect(() => {
    if (multiplayer.connectionStatus !== "connected" || !multiplayer.gameState) return
    setView(multiplayer.gameState.status === "waiting" ? "lobby" : "game")
    setMessage(null)
  }, [multiplayer.connectionStatus, multiplayer.gameState])
  useEffect(() => {
    if (session.isSuppressingErrors()) return
    if (multiplayer.error) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const sortedPlayers = useMemo(() => Object.values(multiplayer.gameState?.players ?? {}).sort((a, b) => b.score - a.score || b.perfectRounds - a.perfectRounds || a.totalAnswerMs - b.totalAnswerMs), [multiplayer.gameState?.players])
  const connectedPlayers = useMemo(() => sortedPlayers.filter((player) => player.connected !== false), [sortedPlayers])

  const startSolo = () => {
    solo.start(settings)
    setView("solo")
  }
  const leaveSolo = () => {
    solo.stop()
    setView("select")
  }
  const create = () => {
    if (!name.trim()) return setMessage("Enter your name first.")
    const code = multiplayer.createGame(name.trim(), settings); session.remember(code, name.trim()); setMessage(null)
  }
  const join = () => {
    if (!name.trim() || !roomCode.trim()) return setMessage("Enter your name and room code.")
    const code = roomCode.trim().toUpperCase(); multiplayer.joinGame(code, name.trim()); session.remember(code, name.trim()); setMessage(null)
  }
  const leave = () => { session.forget(); multiplayer.disconnect(); setMessage(null); setView("select") }
  const copyInvite = async () => {
    if (!multiplayer.gameState) return
    try { await navigator.clipboard.writeText(bridge.isGameNight ? getGameNightInviteLink(bridge.publicRoomCode) : getInviteLink(multiplayer.gameState.roomCode)); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
    catch { setMessage("Could not copy the invite link.") }
  }

  if (bridge.isConnecting) return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Connecting to Game Night...</div>

  if (session.isResuming && view === "select") return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Rejoining your timeline...</div>

  if (view === "solo" && solo.state) {
    return (
      <TimelineGame
        state={solo.state}
        playerId={SOLO_PLAYER_ID}
        solo
        isHost
        roomLabel=""
        connected
        error={null}
        clockOffset={0}
        reactions={{}}
        onReact={NOOP}
        onArrange={solo.arrange}
        onLock={solo.lock}
        onRestart={() => solo.start(solo.settings ?? settings)}
        onLeave={leaveSolo}
      />
    )
  }

  if ((view === "select" || view === "lobby" || view === "solo") && !multiplayer.gameState) return (
    <div className="min-h-[calc(100vh-73px)]">
      <GameTopBar title="Timeline Chaos" subtitle="Put history back in order" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2">
        <MultiplayerSetupCard title="Multiplayer" description="Everyone orders the same four events against the clock." icon={<Users className="h-5 w-5 text-amber-500" />} playerName={name} roomCode={roomCode} createLabel="Create Timeline Room" onPlayerNameChange={setName} onRoomCodeChange={setRoomCode} onJoin={join} onCreate={create} message={message}>
          <Settings value={settings} onChange={setSettings} />
        </MultiplayerSetupCard>
        <Card className="overflow-hidden border-amber-500/30">
          <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
          <CardHeader><History className="h-9 w-9 text-amber-500" /><CardTitle>Solo Timeline</CardTitle><CardDescription>Place four events on the rail before the clock runs out.</CardDescription></CardHeader>
          <CardContent className="space-y-5"><Settings value={settings} onChange={setSettings} /><Button className="w-full" onClick={startSolo}><Play className="mr-2 h-4 w-4" />Start Solo</Button></CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
          {RULES.map((rule) => (
            <div key={rule.title} className="rounded-2xl border p-4 text-sm">
              <p className="font-semibold">{rule.title}</p>
              <p className="mt-1 text-muted-foreground">{rule.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )

  if (view === "lobby" && multiplayer.gameState && multiplayer.playerId) {
    const game = multiplayer.gameState
    return (
      <MultiplayerLobby
        title="Timeline Chaos"
        subtitle="Get ready to reorder history"
        onBack={leave}
        players={sortedPlayers}
        hostId={game.hostId}
        currentPlayerId={multiplayer.playerId}
        playerDescription={`${connectedPlayers.length} of ${game.maxPlayers} players`}
        settings={
          <div className="space-y-1 rounded-2xl border bg-amber-500/5 p-4 text-sm">
            <p className="font-bold">{TIMELINE_PACKS.find((pack) => pack.id === game.settings.pack)?.label} pack</p>
            <p className="text-muted-foreground">{game.settings.rounds} rounds, {game.settings.roundSeconds} seconds each.</p>
            <p className="text-muted-foreground">+{TIMELINE_PAIR_POINTS} for every pair in the right order; a perfect timeline adds +{TIMELINE_PERFECT_BONUS} plus a speed bonus.</p>
          </div>
        }
        roomCode={bridge.isGameNight ? bridge.publicRoomCode : game.roomCode}
        copiedRoomCode={copied}
        onCopyRoomCode={copyInvite}
        onStart={multiplayer.startGame}
        onLeave={leave}
        canStart={connectedPlayers.length >= 2}
        isHost={multiplayer.isHost}
        message={message}
        startLabel="Start Timeline"
      />
    )
  }

  if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
    return (
      <TimelineGame
        state={multiplayer.gameState}
        playerId={multiplayer.playerId}
        solo={false}
        isHost={multiplayer.isHost}
        roomLabel={bridge.isGameNight ? bridge.publicRoomCode : multiplayer.gameState.roomCode}
        connected={multiplayer.connectionStatus === "connected"}
        error={multiplayer.error}
        clockOffset={multiplayer.clockOffset}
        reactions={multiplayer.reactions}
        onReact={multiplayer.react}
        onArrange={multiplayer.arrange}
        onLock={multiplayer.submitOrder}
        onRestart={multiplayer.restartGame}
        onLeave={leave}
      />
    )
  }
  return null
}
