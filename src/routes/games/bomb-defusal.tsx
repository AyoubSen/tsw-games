import { createFileRoute } from "@tanstack/react-router"
import { Bomb, BookOpen, Radio, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { BombDefusalGame } from "@/components/games/bomb-defusal/BombDefusalGame"
import { useMultiplayerBombDefusal } from "@/components/games/bomb-defusal/useMultiplayerBombDefusal"
import { GameTopBar, MultiplayerLobby, MultiplayerSetupCard } from "@/components/multiplayer/shared"
import { BOMB_TIME_OPTIONS } from "@/lib/bombDefusal"
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"

export const Route = createFileRoute("/games/bomb-defusal")({
  validateSearch: parseInviteSearch,
  component: BombDefusalPage,
})

function BombDefusalPage() {
  const { room: invitedRoom, night } = Route.useSearch()
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState(invitedRoom ?? "")
  const [timeLimit, setTimeLimit] = useState(240)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const multiplayer = useMultiplayerBombDefusal()
  const game = multiplayer.gameState
  const hasGameState = Boolean(game && multiplayer.playerId && game.players[multiplayer.playerId])
  const connectHost = useCallback((roomId: string, playerName: string) => {
    multiplayer.createGame(playerName, timeLimit, roomId)
  }, [multiplayer.createGame, timeLimit])
  const bridge = useGameNightGameBridge({
    gameId: "bomb-defusal", hasGameState, finished: game?.status === "finished",
    connectHost, connectPlayer: multiplayer.joinGame,
  })
  const session = useMultiplayerSession({
    game: "bomb-defusal", joinGame: multiplayer.joinGame, hasGameState,
    error: multiplayer.error, connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoom, onAbandon: multiplayer.abandonReconnect,
    disabled: Boolean(night) || bridge.isGameNight,
  })

  useEffect(() => { if (invitedRoom) setRoomCode(invitedRoom) }, [invitedRoom])
  useEffect(() => {
    if (!session.isSuppressingErrors()) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const create = () => {
    if (!name.trim()) return setMessage("Enter your name first.")
    const code = multiplayer.createGame(name.trim(), timeLimit)
    session.remember(code, name.trim())
    setMessage(null)
  }
  const join = () => {
    if (!name.trim() || roomCode.trim().length !== 6) return setMessage("Enter your name and a six-character room code.")
    multiplayer.joinGame(roomCode.trim(), name.trim())
    session.remember(roomCode.trim(), name.trim())
    setMessage(null)
  }
  const leave = () => {
    session.forget()
    multiplayer.disconnect()
    setMessage(null)
  }
  const copyInvite = async () => {
    if (!game) return
    try {
      await navigator.clipboard.writeText(bridge.isGameNight ? getGameNightInviteLink(bridge.publicRoomCode) : getInviteLink(game.roomCode))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { setMessage("Could not copy the invite link.") }
  }

  if ((session.isResuming || bridge.isConnecting) && !hasGameState) {
    return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">{bridge.isConnecting ? "Connecting to Game Night…" : "Rejoining your crew…"}</div>
  }

  if (!game || !multiplayer.playerId) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar title="Bomb Defusal" subtitle="One device. Separate screens. Shared fate." />
        <main className="mx-auto grid max-w-5xl items-start gap-6 px-4 py-8 md:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-blue-800 bg-blue-950 p-6 text-blue-50 sm:p-8">
            <div className="flex items-center justify-between border-b border-blue-800 pb-4"><Bomb className="h-7 w-7 text-orange-300" /><p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-300">Co-op / 2–4 players</p></div>
            <h2 className="mt-6 text-4xl font-black leading-tight tracking-tight">Talk it through.<br /><span className="text-orange-300">Then cut the wire.</span></h2>
            <p className="mt-4 text-sm leading-7 text-blue-200">You can see the device or the instructions. Never both. Work together to defuse three modules before the timer runs out.</p>
            <ol className="mt-7 space-y-5">
              <li className="flex gap-3"><Radio className="mt-1 h-5 w-5 shrink-0 text-orange-300" /><div><h3 className="font-bold">Describe the device</h3><p className="mt-1 text-sm text-blue-200">The operator reads wire colors, symbols, and signals.</p></div></li>
              <li className="flex gap-3"><BookOpen className="mt-1 h-5 w-5 shrink-0 text-orange-300" /><div><h3 className="font-bold">Decode the manual</h3><p className="mt-1 text-sm text-blue-200">Experts receive separate sections. Compare clues and tell the operator what to do.</p></div></li>
              <li className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-orange-300" /><div><h3 className="font-bold">Win as a crew</h3><p className="mt-1 text-sm text-blue-200">Three mistakes lose the mission. Defuse a device, rotate roles, and get everyone through one turn as operator.</p></div></li>
            </ol>
            <p className="mt-7 border-t border-blue-800 pt-4 font-mono text-xs leading-6 text-blue-300">Play in the same room or on a voice call. Voice chat is not built in. Keep your screens private.</p>
          </section>
          <MultiplayerSetupCard title="Assemble your crew" description="New device and manual combinations every round." icon={<Bomb className="h-5 w-5 text-primary" />}
            playerName={name} roomCode={roomCode} createLabel="Create defusal room" onPlayerNameChange={setName} onRoomCodeChange={setRoomCode}
            onJoin={join} onCreate={create} message={message ?? (multiplayer.connectionStatus === "connecting" ? "Connecting…" : null)}>
            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Time per device</legend><div className="grid grid-cols-3 gap-2">
              {BOMB_TIME_OPTIONS.map((seconds) => <button key={seconds} type="button" aria-pressed={timeLimit === seconds} onClick={() => setTimeLimit(seconds)}
                className={`rounded-lg border p-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${timeLimit === seconds ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>{seconds / 60} min</button>)}
            </div></fieldset>
            <p className="text-xs leading-5 text-muted-foreground">Three modules per device. One device per player. The host starts each round after everyone is ready.</p>
          </MultiplayerSetupCard>
        </main>
      </div>
    )
  }

  const players = Object.values(game.players).sort((a, b) => a.joinedAt - b.joinedAt)
  const connected = multiplayer.connectionStatus === "connected"
  if (game.status === "waiting") {
    const activePlayers = players.filter((player) => player.connected !== false)
    return <MultiplayerLobby title="Bomb Defusal" subtitle="Check your voice call before starting" onBack={leave}
      players={players} hostId={game.hostId} currentPlayerId={multiplayer.playerId}
      playerDescription={`${players.length}/4 players. Need at least 2 connected crew members.`}
      settings={<div className="space-y-2 rounded-xl border bg-card p-4 text-sm"><p className="font-bold">{game.timeLimit / 60} minutes · 3 modules · 3 strikes</p>
        <p className="text-muted-foreground">First operator: <strong className="text-foreground">{activePlayers[0]?.name ?? "Waiting…"}</strong>. Everyone else reads the manuals.</p>
        <p className="text-muted-foreground">Each crew member operates one device. Every device must be defused to win together.</p>
        <p className="text-xs text-muted-foreground">Reconnects keep your role and the timer running. Leaving an active mission ends it for the crew.</p></div>}
      roomCode={bridge.isGameNight ? bridge.publicRoomCode : game.roomCode} copiedRoomCode={copied} onCopyRoomCode={copyInvite}
      onStart={multiplayer.startGame} onLeave={leave} canStart={connected && activePlayers.length >= 2} isHost={game.canControl} message={message} startLabel="Start the countdown" />
  }

  return <div className="min-h-[calc(100vh-73px)] bg-background">
    <GameTopBar title="Bomb Defusal" subtitle={`Room ${bridge.isGameNight ? bridge.publicRoomCode : game.roomCode}`} onBack={leave} />
    <BombDefusalGame game={game} playerId={multiplayer.playerId} connected={connected} error={multiplayer.error}
      onSubmit={multiplayer.submit} onNext={multiplayer.nextRound} onRestart={multiplayer.restartGame} onLeave={leave} />
  </div>
}
