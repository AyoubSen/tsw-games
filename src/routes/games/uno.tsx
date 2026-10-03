import { createFileRoute } from "@tanstack/react-router"
import { Bot, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { UnoGame } from "@/components/games/uno/UnoGame"
import { useMultiplayerUno } from "@/components/games/uno/useMultiplayerUno"
import { Button } from "@/components/ui/button"
import { BotLevelPicker } from "@/components/multiplayer/BotLevelPicker"
import { WatchingList, WatchingMenu } from "@/components/multiplayer/Spectators"
import { GameTopBar, MultiplayerLobby, MultiplayerSetupCard } from "@/components/multiplayer/shared"
import { UNO_RULE_INFO } from "@/lib/uno"
import { cn } from "@/lib/utils"
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks"
import { useMultiplayerSession } from "@/lib/multiplayerSession"

export const Route = createFileRoute("/games/uno")({ validateSearch: parseInviteSearch, component: UnoPage })

type View = "select" | "lobby" | "game"

function UnoPage() {
  const { room: invitedRoom } = Route.useSearch()
  const [view, setView] = useState<View>(invitedRoom ? "lobby" : "select")
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState(invitedRoom ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const multiplayer = useMultiplayerUno()
  const gameNight = useGameNight()
  const spectating = Boolean(multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.spectators.some((spectator) => spectator.id === multiplayer.playerId))
  const hasGameState = Boolean(multiplayer.gameState && multiplayer.playerId && (multiplayer.gameState.players[multiplayer.playerId] || spectating))
  const session = useMultiplayerSession({
    game: "uno", joinGame: multiplayer.joinGame, hasGameState, error: multiplayer.error,
    connectionStatus: multiplayer.connectionStatus, inviteRoomCode: invitedRoom,
    onAbandon: multiplayer.abandonReconnect, disabled: gameNight.connection?.gameId === "uno",
  })
  const connectGameNightHost = useCallback((roomId: string, playerName: string) => multiplayer.createGame(playerName, roomId), [multiplayer.createGame])
  const bridge = useGameNightGameBridge({ gameId: "uno", hasGameState, finished: multiplayer.gameState?.status === "finished", connectHost: connectGameNightHost, connectPlayer: multiplayer.joinGame })

  useEffect(() => { if (invitedRoom) setRoomCode(invitedRoom) }, [invitedRoom])
  useEffect(() => {
    if (multiplayer.connectionStatus !== "connected" || !multiplayer.gameState) return
    setView(multiplayer.gameState.status === "waiting" ? "lobby" : "game")
    setMessage(null)
  }, [multiplayer.connectionStatus, multiplayer.gameState])
  useEffect(() => {
    if (!session.isSuppressingErrors() && multiplayer.error) setMessage(multiplayer.error)
  }, [multiplayer.error, session.isSuppressingErrors])

  const players = useMemo(() => multiplayer.gameState?.seatOrder.map((id) => multiplayer.gameState!.players[id]).filter(Boolean) ?? [], [multiplayer.gameState])
  const connectedPlayers = players.filter((player) => player.connected !== false)
  const bots = players.filter((player) => player.isBot)
  const watching = multiplayer.gameState && multiplayer.playerId ? {
    spectators: multiplayer.gameState.spectators,
    playerId: multiplayer.playerId,
    isHost: multiplayer.isHost,
    seatBlocked: multiplayer.gameState.status === "playing" ? "Seat them once this hand is over" : players.length >= multiplayer.gameState.maxPlayers ? "No empty seats" : null,
    onSeat: multiplayer.seatSpectator,
  } : null
  const create = () => {
    if (!name.trim()) return setMessage("Enter your name first.")
    const code = multiplayer.createGame(name.trim())
    session.remember(code, name.trim())
  }
  const join = () => {
    if (!name.trim() || !roomCode.trim()) return setMessage("Enter your name and room code.")
    const code = roomCode.trim().toUpperCase()
    multiplayer.joinGame(code, name.trim())
    session.remember(code, name.trim())
  }
  const leave = () => { session.forget(); multiplayer.disconnect(); setMessage(null); setView("select") }
  const copyInvite = async () => {
    if (!multiplayer.gameState) return
    try {
      await navigator.clipboard.writeText(bridge.isGameNight ? getGameNightInviteLink(bridge.publicRoomCode) : getInviteLink(multiplayer.gameState.roomCode))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { setMessage("Could not copy the invite link.") }
  }

  if (bridge.isConnecting) return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Connecting to Game Night...</div>
  if (session.isResuming && view === "select") return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Rejoining your Uno game...</div>
  if ((view === "select" || view === "lobby") && !multiplayer.gameState) return <div className="min-h-[calc(100vh-73px)] bg-gradient-to-b from-red-500/10 via-background to-background">
    <GameTopBar title="Uno" subtitle="Match colors, numbers, and action cards" />
    <main className="mx-auto max-w-xl px-4 py-10"><MultiplayerSetupCard title="Multiplayer Uno" description="Create a private table for 2-8 players, or fill seats with bots." icon={<Users className="h-5 w-5 text-red-500" />} playerName={name} roomCode={roomCode} createLabel="Create Uno Room" onPlayerNameChange={setName} onRoomCodeChange={setRoomCode} onJoin={join} onCreate={create} message={message}>
      <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">Draw one card, play matching colors or values, and empty your hand first. The host can turn on house rules in the lobby.</div>
    </MultiplayerSetupCard></main>
  </div>
  if (view === "lobby" && multiplayer.gameState && multiplayer.playerId) return <MultiplayerLobby title="Uno" subtitle="The first player out of cards wins" onBack={leave} players={players} hostId={multiplayer.gameState.hostId} currentPlayerId={multiplayer.playerId} playerDescription={`${connectedPlayers.length} of 8 players`} settings={<div className="space-y-3">
    {watching && <WatchingList {...watching} />}
    <div className="rounded-2xl border bg-red-500/5 p-4 text-sm"><p className="font-bold">Classic deck</p><p className="text-muted-foreground">7-card hands, call UNO at one card or get caught for +2.</p></div>
    <div className="rounded-2xl border bg-red-500/5 p-4 text-sm">
      <p className="font-bold">House rules</p>
      <ul className="mt-2 space-y-2">
        {UNO_RULE_INFO.map((rule) => {
          const on = multiplayer.gameState!.rules[rule.key]
          return <li key={rule.key} className="flex items-start justify-between gap-3">
            <span><span className="font-semibold">{rule.label}</span><span className="block text-muted-foreground">{rule.description}</span></span>
            <button type="button" role="switch" aria-checked={on} aria-label={rule.label} disabled={!multiplayer.isHost} onClick={() => multiplayer.setRule(rule.key, !on)} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60", on ? "bg-red-500" : "bg-muted-foreground/30")}>
              <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
            </button>
          </li>
        })}
      </ul>
      {!multiplayer.isHost && <p className="mt-2 text-xs text-muted-foreground">Only the host can change house rules.</p>}
    </div>
    <div className="rounded-2xl border bg-red-500/5 p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">Bots</p>
        <Button size="sm" variant="outline" disabled={!multiplayer.isHost || players.length >= multiplayer.gameState.maxPlayers} onClick={multiplayer.addBot}><Bot className="mr-1 h-3.5 w-3.5" />Add bot</Button>
      </div>
      {bots.length === 0 ? <p className="mt-2 text-muted-foreground">Fill empty seats with bots to start without a full table.</p> : <ul className="mt-2 space-y-1">
        {bots.map((bot) => <li key={bot.id} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-muted-foreground" />{bot.name}</span>
          <span className="flex items-center gap-1">
            <BotLevelPicker name={bot.name} level={bot.botLevel} disabled={!multiplayer.isHost} onChange={(level) => multiplayer.setBotLevel(bot.id, level)} />
            {multiplayer.isHost && <Button size="sm" variant="ghost" onClick={() => multiplayer.removePlayer(bot.id)}>Remove</Button>}
          </span>
        </li>)}
      </ul>}
    </div>
  </div>} roomCode={bridge.isGameNight ? bridge.publicRoomCode : multiplayer.gameState.roomCode} copiedRoomCode={copied} onCopyRoomCode={copyInvite} onStart={multiplayer.startGame} onLeave={leave} canStart={connectedPlayers.length >= 2} isHost={multiplayer.isHost} message={message} startLabel="Deal Cards" />
  if (view === "game" && multiplayer.gameState && multiplayer.playerId) return <UnoGame state={multiplayer.gameState} playerId={multiplayer.playerId} isHost={multiplayer.isHost} spectating={spectating} watching={watching && <WatchingMenu {...watching} />} roomLabel={bridge.isGameNight ? bridge.publicRoomCode : multiplayer.gameState.roomCode} message={message} connected={multiplayer.connectionStatus === "connected"} onPlayCard={multiplayer.playCard} onDrawCard={multiplayer.drawCard} onPass={multiplayer.pass} onCallUno={multiplayer.callUno} onCatch={multiplayer.catchUno} onChallenge={multiplayer.challenge} reactions={multiplayer.reactions} onReact={multiplayer.react} onRestart={multiplayer.restartGame} onLeave={leave} />
  return null
}
