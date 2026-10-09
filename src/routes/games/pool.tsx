import { createFileRoute } from "@tanstack/react-router"
import { GameRouteError } from "@/components/GameErrorBoundary"
import { Bot, Circle, Crosshair, Target } from "lucide-react"
import { useEffect, useState } from "react"
import { PoolGame } from "@/components/games/pool/PoolGame"
import { useMultiplayerPool } from "@/components/games/pool/useMultiplayerPool"
import { BotLevelPicker } from "@/components/multiplayer/BotLevelPicker"
import { GameTopBar, MultiplayerLobby, MultiplayerSetupCard } from "@/components/multiplayer/shared"
import { Button } from "@/components/ui/button"
import { BOT_LEVEL_LABELS, BOT_LEVELS, type BotLevel } from "@/lib/botLevel"
import { getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/games/pool")({
  validateSearch: parseInviteSearch,
  component: PoolPage,
  errorComponent: GameRouteError,
})

function PoolPage() {
  const { room: invitedRoom } = Route.useSearch()
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState(invitedRoom ?? "")
  const [botLevel, setBotLevel] = useState<BotLevel>("normal")
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const multiplayer = useMultiplayerPool()
  const game = multiplayer.gameState
  const playerId = multiplayer.playerId
  const inRoom = Boolean(game && playerId && (game.players[playerId] || game.spectators.some((spectator) => spectator.id === playerId)))
  const session = useMultiplayerSession({
    game: "pool", joinGame: multiplayer.joinGame, hasGameState: inRoom,
    error: multiplayer.error, connectionStatus: multiplayer.connectionStatus,
    inviteRoomCode: invitedRoom, onAbandon: multiplayer.abandonReconnect,
  })

  useEffect(() => { if (invitedRoom) setRoomCode(invitedRoom) }, [invitedRoom])
  useEffect(() => {
    if (!session.isSuppressingErrors()) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const create = (vsBot?: BotLevel) => {
    if (!name.trim()) return setMessage("Enter your name first.")
    const code = multiplayer.createGame(name.trim(), vsBot)
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
      await navigator.clipboard.writeText(getInviteLink(game.roomCode))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { setMessage("Could not copy the invite link.") }
  }

  if (session.isResuming && !inRoom) {
    return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Rejoining your table…</div>
  }

  if (!game || !playerId || !inRoom) {
    return (
      <div className="min-h-[calc(100vh-73px)] bg-background">
        <GameTopBar title="Pool" subtitle="8-ball on a 3D table" />
        <main className="mx-auto grid max-w-5xl items-start gap-6 px-4 py-8 md:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-emerald-900 bg-[#0d2a1d] p-6 text-emerald-50 sm:p-8">
            <div className="flex items-center justify-between border-b border-emerald-800/70 pb-4">
              <Circle className="h-7 w-7 fill-emerald-50 text-emerald-50" />
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">8-ball · 2 players</p>
            </div>
            <h2 className="mt-6 text-4xl font-black leading-tight tracking-tight">Chalk up.<br /><span className="text-amber-300">Call the 8.</span></h2>
            <p className="mt-4 text-sm leading-7 text-emerald-200">Real ball physics: cut angles, follow, draw, side spin off the cushions. Every shot is played out on the server and replayed for everyone at the table.</p>
            <ol className="mt-7 space-y-5">
              <li className="flex gap-3"><Crosshair className="mt-1 h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="font-bold">Aim and pull</h3><p className="mt-1 text-sm text-emerald-200">Drag on the cloth to aim, set spin on the cue ball, then pull the power bar down and let go.</p></div></li>
              <li className="flex gap-3"><Target className="mt-1 h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="font-bold">Solids or stripes</h3><p className="mt-1 text-sm text-emerald-200">The first ball you pot after the break picks your group. Clear it, then sink the 8 in the pocket you call.</p></div></li>
              <li className="flex gap-3"><Bot className="mt-1 h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="font-bold">Fouls give ball in hand</h3><p className="mt-1 text-sm text-emerald-200">Scratch, hit the wrong ball first, or touch no cushion and your opponent places the cue ball anywhere.</p></div></li>
            </ol>
          </section>
          <MultiplayerSetupCard title="Rack 'em up" description="Play a friend with a room code, or take on a bot." icon={<Circle className="h-5 w-5 text-primary" />}
            playerName={name} roomCode={roomCode} createLabel="Create table for a friend" onPlayerNameChange={setName} onRoomCodeChange={setRoomCode}
            onJoin={join} onCreate={() => create()} message={message ?? (multiplayer.connectionStatus === "connecting" ? "Connecting…" : null)}>
            <div className="rounded-xl border bg-accent/30 p-3">
              <p className="mb-2 text-sm font-medium">Play a bot</p>
              <div className="grid grid-cols-3 gap-2">
                {BOT_LEVELS.map((level) => (
                  <button key={level} type="button" aria-pressed={botLevel === level} onClick={() => setBotLevel(level)}
                    className={cn("rounded-lg border p-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary", botLevel === level ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
                    {BOT_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
              <Button className="mt-3 w-full" variant="secondary" onClick={() => create(botLevel)}>
                <Bot className="mr-2 h-4 w-4" />
                Play the bot now
              </Button>
            </div>
          </MultiplayerSetupCard>
        </main>
      </div>
    )
  }

  const players = Object.values(game.players).sort((a, b) => a.joinedAt - b.joinedAt)
  const connected = multiplayer.connectionStatus === "connected"
  if (game.status === "waiting") {
    const present = players.filter((player) => player.connected !== false)
    const bots = players.filter((player) => player.isBot)
    return (
      <MultiplayerLobby title="Pool" subtitle="8-ball · first to sink the 8" onBack={leave}
        players={players} hostId={game.hostId} currentPlayerId={playerId}
        playerDescription={`${players.length}/2 players. Anyone else who joins watches.`}
        getPlayerStatus={(player) => (bots.some((bot) => bot.id === player.id) ? "Bot" : player.id === playerId ? "You" : "Ready")}
        settings={
          <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Opponent</p>
              <Button size="sm" variant="outline" disabled={!multiplayer.isHost || players.length >= 2} onClick={multiplayer.addBot}>
                <Bot className="mr-1 h-3.5 w-3.5" />
                Add bot
              </Button>
            </div>
            {bots.length === 0 ? (
              <p className="text-muted-foreground">Share the room code with a friend, or add a bot to play solo.</p>
            ) : (
              <ul className="space-y-1">
                {bots.map((bot) => (
                  <li key={bot.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-muted-foreground" />{bot.name}</span>
                    <span className="flex items-center gap-1">
                      <BotLevelPicker name={bot.name} level={bot.botLevel} disabled={!multiplayer.isHost} onChange={(level) => multiplayer.setBotLevel(bot.id, level)} />
                      {multiplayer.isHost && <Button size="sm" variant="ghost" onClick={() => multiplayer.removePlayer(bot.id)}>Remove</Button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">The host breaks first; rematches alternate the break. Shots time out after 60 seconds.</p>
          </div>
        }
        roomCode={game.roomCode} copiedRoomCode={copied} onCopyRoomCode={copyInvite}
        onStart={multiplayer.startGame} onLeave={leave} canStart={connected && present.length === 2} isHost={multiplayer.isHost} message={message} startLabel="Break" />
    )
  }

  return (
    <PoolGame game={game} playerId={playerId} roomLabel={game.roomCode} connected={connected} error={multiplayer.error}
      clockOffset={multiplayer.clockOffset} remoteAim={multiplayer.remoteAim} reactions={multiplayer.reactions} isHost={multiplayer.isHost}
      onReact={multiplayer.react} onAim={multiplayer.sendAim} onShoot={multiplayer.shoot} onRestart={multiplayer.restartGame} onLeave={leave} />
  )
}
