import { createFileRoute } from "@tanstack/react-router"
import { Clock3, History, Lock, Play, RotateCcw, Trophy, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { TimelineBoard } from "@/components/games/timeline-chaos/TimelineBoard"
import { useMultiplayerTimelineChaos } from "@/components/games/timeline-chaos/useMultiplayerTimelineChaos"
import { GameTopBar, MultiplayerLobby, MultiplayerSetupCard } from "@/components/multiplayer/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import {
  getCorrectTimeline,
  pickTimelineEvents,
  publicTimelineEvents,
  scoreTimelineOrder,
  TIMELINE_PACKS,
  type TimelineEvent,
} from "@/lib/timelineChaos"
import type {
  PublicTimelinePlayer,
  TimelineRoundCount,
  TimelineSeconds,
  TimelineSettings,
} from "../../../party/timeline-chaos"

export const Route = createFileRoute("/games/timeline-chaos")({
  validateSearch: parseInviteSearch,
  component: TimelineChaosPage,
})

type View = "select" | "solo" | "lobby" | "game"
interface SoloState {
  settings: TimelineSettings
  events: TimelineEvent[]
  usedEventIds: string[]
  order: string[]
  round: number
  score: number
  perfectRounds: number
  phase: "ordering" | "reveal" | "finished"
  startedAt: number
  endsAt: number
  revealEndsAt: number | null
  points: number
  correctPositions: number
}

const ROUND_OPTIONS: TimelineRoundCount[] = [5, 8, 10]
const TIME_OPTIONS: TimelineSeconds[] = [15, 20, 30]

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

function Leaderboard({ players, currentId, submitted }: { players: PublicTimelinePlayer[]; currentId: string; submitted: string[] }) {
  return (
    <aside className="rounded-3xl border bg-card p-4">
      <h2 className="mb-4 flex items-center justify-between font-black">Leaderboard <Trophy className="h-4 w-4 text-amber-500" /></h2>
      <div className="space-y-2">
        {players.map((player, index) => (
          <div key={player.id} className={`flex items-center justify-between rounded-2xl p-3 ${player.id === currentId ? "bg-amber-500/10" : "bg-muted/60"} ${player.connected === false ? "opacity-50" : ""}`}>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{index + 1}. {player.name}</p><p className="text-[11px] text-muted-foreground">{player.connected === false ? "Reconnecting" : submitted.includes(player.id) ? "Locked" : `${player.perfectRounds} perfect`}</p></div>
            <span className="font-mono text-sm font-black">{player.score}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function TimelineChaosPage() {
  const { room: invitedRoom } = Route.useSearch()
  const [view, setView] = useState<View>(invitedRoom ? "lobby" : "select")
  const [settings, setSettings] = useState<TimelineSettings>({ pack: "mixed", rounds: 8, roundSeconds: 20 })
  const [solo, setSolo] = useState<SoloState | null>(null)
  const [now, setNow] = useState(Date.now())
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState(invitedRoom ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [localOrder, setLocalOrder] = useState<string[]>([])
  const multiplayer = useMultiplayerTimelineChaos()
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
  useEffect(() => {
    const game = multiplayer.gameState
    if (!game?.events.length) return
    setLocalOrder(game.events.map((event) => event.id))
  }, [multiplayer.gameState?.roundId])
  useEffect(() => {
    if (multiplayer.gameState?.myOrder) setLocalOrder(multiplayer.gameState.myOrder)
  }, [multiplayer.gameState?.myOrder])

  const timerActive = (view === "solo" && solo?.phase !== "finished") || (view === "game" && multiplayer.gameState?.status === "playing")
  useEffect(() => {
    if (!timerActive) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [timerActive])

  useEffect(() => {
    if (!solo) return
    if (solo.phase === "ordering" && now >= solo.endsAt) {
      const result = scoreTimelineOrder(solo.order, getCorrectTimeline(solo.events), solo.endsAt, solo.startedAt, solo.endsAt)
      setSolo({ ...solo, phase: "reveal", revealEndsAt: Date.now() + 6_000, points: result.points, correctPositions: result.correctPositions, score: solo.score + result.points, perfectRounds: solo.perfectRounds + (result.perfect ? 1 : 0) })
    } else if (solo.phase === "reveal" && solo.revealEndsAt && now >= solo.revealEndsAt) {
      if (solo.round >= solo.settings.rounds) setSolo({ ...solo, phase: "finished" })
      else {
        const picked = pickTimelineEvents(solo.settings.pack, solo.usedEventIds)
        const startedAt = Date.now()
        setSolo({ ...solo, events: picked.events, usedEventIds: picked.usedEventIds, order: picked.events.map((event) => event.id), round: solo.round + 1, phase: "ordering", startedAt, endsAt: startedAt + solo.settings.roundSeconds * 1000, revealEndsAt: null, points: 0, correctPositions: 0 })
      }
    }
  }, [now, solo])

  const sortedPlayers = useMemo(() => Object.values(multiplayer.gameState?.players ?? {}).sort((a, b) => b.score - a.score || b.perfectRounds - a.perfectRounds || a.totalAnswerMs - b.totalAnswerMs), [multiplayer.gameState?.players])
  const connectedPlayers = useMemo(() => sortedPlayers.filter((player) => player.connected !== false), [sortedPlayers])

  const startSolo = () => {
    const picked = pickTimelineEvents(settings.pack)
    const startedAt = Date.now()
    setSolo({ settings, events: picked.events, usedEventIds: picked.usedEventIds, order: picked.events.map((event) => event.id), round: 1, score: 0, perfectRounds: 0, phase: "ordering", startedAt, endsAt: startedAt + settings.roundSeconds * 1000, revealEndsAt: null, points: 0, correctPositions: 0 })
    setView("solo")
  }
  const lockSolo = () => setSolo((current) => {
    if (!current || current.phase !== "ordering") return current
    const submittedAt = Date.now()
    const result = scoreTimelineOrder(current.order, getCorrectTimeline(current.events), submittedAt, current.startedAt, current.endsAt)
    return { ...current, phase: "reveal", revealEndsAt: submittedAt + 6_000, points: result.points, correctPositions: result.correctPositions, score: current.score + result.points, perfectRounds: current.perfectRounds + (result.perfect ? 1 : 0) }
  })
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

  if ((view === "select" || view === "lobby") && !multiplayer.gameState) return (
    <div className="min-h-[calc(100vh-73px)]">
      <GameTopBar title="Timeline Chaos" subtitle="Put history back in order" />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2">
        <MultiplayerSetupCard title="Multiplayer" description="Everyone orders the same four events." icon={<Users className="h-5 w-5 text-amber-500" />} playerName={name} roomCode={roomCode} createLabel="Create Timeline Room" onPlayerNameChange={setName} onRoomCodeChange={setRoomCode} onJoin={join} onCreate={create} message={message}>
          <Settings value={settings} onChange={setSettings} />
        </MultiplayerSetupCard>
        <Card className="overflow-hidden border-amber-500/30">
          <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
          <CardHeader><History className="h-9 w-9 text-amber-500" /><CardTitle>Solo Timeline</CardTitle><CardDescription>Order four events before the clock runs out.</CardDescription></CardHeader>
          <CardContent className="space-y-5"><Settings value={settings} onChange={setSettings} /><Button className="w-full" onClick={startSolo}><Play className="mr-2 h-4 w-4" />Start Solo</Button></CardContent>
        </Card>
      </main>
    </div>
  )

  if (view === "solo" && solo) {
    const revealed = solo.phase === "reveal"
    const seconds = Math.max(0, Math.ceil((((revealed ? solo.revealEndsAt : solo.endsAt) ?? now) - now) / 1000))
    return <div className="min-h-[calc(100vh-73px)]"><GameTopBar title="Timeline Chaos" subtitle={`Round ${solo.round}/${solo.settings.rounds}`} onBack={() => { setSolo(null); setView("select") }} rightAction={<span className="font-mono text-sm font-black">{solo.score}</span>} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {solo.phase === "finished" ? <Card className="text-center"><CardHeader><Trophy className="mx-auto h-14 w-14 text-amber-500" /><CardTitle className="text-3xl">Timeline complete</CardTitle><CardDescription>{solo.perfectRounds} perfect rounds and {solo.score.toLocaleString()} points.</CardDescription></CardHeader><CardContent className="flex justify-center gap-2"><Button onClick={startSolo}><RotateCcw className="mr-2 h-4 w-4" />Play Again</Button><Button variant="outline" onClick={() => { setSolo(null); setView("select") }}>Settings</Button></CardContent></Card> : <>
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Oldest to newest</p><h2 className="text-xl font-black">Arrange the events</h2></div><span className="flex items-center gap-1 font-mono font-black"><Clock3 className="h-4 w-4" />{seconds}s</span></div>
          <TimelineBoard events={publicTimelineEvents(solo.events, revealed)} order={solo.order} correctOrder={revealed ? getCorrectTimeline(solo.events) : []} revealed={revealed} disabled={revealed} onChange={(order) => setSolo({ ...solo, order })} />
          {revealed ? <div className="mt-4 rounded-2xl bg-muted p-4 text-center font-bold">{solo.correctPositions}/4 positions correct <span className="ml-2 text-amber-600">+{solo.points}</span></div> : <Button className="mt-4 w-full" size="lg" onClick={lockSolo}><Lock className="mr-2 h-4 w-4" />Lock Timeline</Button>}
        </>}
      </main></div>
  }

  if (view === "lobby" && multiplayer.gameState && multiplayer.playerId) {
    const game = multiplayer.gameState
    return <MultiplayerLobby title="Timeline Chaos" subtitle="Get ready to reorder history" onBack={leave} players={sortedPlayers} hostId={game.hostId} currentPlayerId={multiplayer.playerId} playerDescription={`${connectedPlayers.length} of ${game.maxPlayers} players`} settings={<div className="rounded-2xl border bg-amber-500/5 p-4 text-sm"><p className="font-bold">{TIMELINE_PACKS.find((pack) => pack.id === game.settings.pack)?.label}</p><p className="text-muted-foreground">{game.settings.rounds} rounds, {game.settings.roundSeconds} seconds each.</p></div>} roomCode={bridge.isGameNight ? bridge.publicRoomCode : game.roomCode} copiedRoomCode={copied} onCopyRoomCode={copyInvite} onStart={multiplayer.startGame} onLeave={leave} canStart={connectedPlayers.length >= 2} isHost={multiplayer.isHost} message={message} startLabel="Start Timeline" />
  }

  if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
    const game = multiplayer.gameState
    const serverNow = game.serverNow + Math.max(0, now - multiplayer.stateReceivedAt)
    const seconds = game.roundEndsAt ? Math.max(0, Math.ceil((game.roundEndsAt - serverNow) / 1000)) : 0
    const revealed = game.phase === "reveal"
    const myResult = game.roundResults[multiplayer.playerId]
    const winners = game.winnerIds.map((id) => game.players[id]?.name).filter((value): value is string => Boolean(value))
    return <div className="min-h-[calc(100vh-73px)]"><GameTopBar title="Timeline Chaos" subtitle={`Round ${game.roundNumber}/${game.settings.rounds}`} onBack={leave} rightAction={<span className="font-mono text-sm font-black">{game.players[multiplayer.playerId]?.score ?? 0}</span>} />
      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <section>{game.status === "finished" ? <Card className="text-center"><CardHeader><Trophy className="mx-auto h-14 w-14 text-amber-500" /><CardTitle className="text-3xl">{winners.length === 1 ? `${winners[0]} wins!` : "Timeline complete"}</CardTitle><CardDescription>Final scores after {game.settings.rounds} rounds.</CardDescription></CardHeader><CardContent>{multiplayer.isHost ? <Button onClick={multiplayer.restartGame}><RotateCcw className="mr-2 h-4 w-4" />Play Again</Button> : <p className="text-sm text-muted-foreground">Waiting for the host.</p>}</CardContent></Card> : <>
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Oldest to newest</p><h2 className="text-xl font-black">{revealed ? "Correct timeline" : "Arrange the events"}</h2></div><span className="flex items-center gap-1 font-mono font-black"><Clock3 className="h-4 w-4" />{seconds}s</span></div>
          <TimelineBoard events={game.events} order={revealed ? (myResult?.order ?? []) : (game.myOrder ?? localOrder)} correctOrder={game.correctOrder} revealed={revealed} disabled={revealed || Boolean(game.myOrder) || multiplayer.connectionStatus !== "connected"} onChange={setLocalOrder} />
          {revealed ? <div className="mt-4 rounded-2xl bg-muted p-4 text-center font-bold">{myResult?.correctPositions ?? 0}/4 positions correct <span className="ml-2 text-amber-600">+{myResult?.points ?? 0}</span></div> : <Button className="mt-4 w-full" size="lg" disabled={seconds === 0 || Boolean(game.myOrder) || multiplayer.connectionStatus !== "connected"} onClick={() => multiplayer.submitOrder(game.roundId, localOrder)}><Lock className="mr-2 h-4 w-4" />{game.myOrder ? "Timeline Locked" : "Lock Timeline"}</Button>}
          <p className="mt-2 text-center text-xs text-muted-foreground">{game.submittedPlayerIds.filter((id) => game.players[id]?.connected !== false).length}/{connectedPlayers.length} locked</p>
        </>}</section>
        <Leaderboard players={sortedPlayers} currentId={multiplayer.playerId} submitted={game.submittedPlayerIds} />
      </main></div>
  }
  return null
}
