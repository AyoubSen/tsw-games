import { createFileRoute } from "@tanstack/react-router"
import { Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useGameNight } from "@/components/game-night/GameNightProvider"
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge"
import { UnoGame } from "@/components/games/uno/UnoGame"
import { useMultiplayerUno } from "@/components/games/uno/useMultiplayerUno"
import { GameTopBar, MultiplayerLobby, MultiplayerSetupCard } from "@/components/multiplayer/shared"
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
  const hasGameState = Boolean(multiplayer.gameState && multiplayer.playerId && multiplayer.gameState.players[multiplayer.playerId])
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
    <main className="mx-auto max-w-xl px-4 py-10"><MultiplayerSetupCard title="Multiplayer Uno" description="Create a private table for 2-8 players." icon={<Users className="h-5 w-5 text-red-500" />} playerName={name} roomCode={roomCode} createLabel="Create Uno Room" onPlayerNameChange={setName} onRoomCodeChange={setRoomCode} onJoin={join} onCreate={create} message={message}>
      <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">Draw one card, play matching colors or values, and empty your hand first. No stacking or challenges.</div>
    </MultiplayerSetupCard></main>
  </div>
  if (view === "lobby" && multiplayer.gameState && multiplayer.playerId) return <MultiplayerLobby title="Uno" subtitle="The first player out of cards wins" onBack={leave} players={players} hostId={multiplayer.gameState.hostId} currentPlayerId={multiplayer.playerId} playerDescription={`${connectedPlayers.length} of 8 players`} settings={<div className="rounded-2xl border bg-red-500/5 p-4 text-sm"><p className="font-bold">Classic deck</p><p className="text-muted-foreground">7-card hands, automatic Uno, no stacking.</p></div>} roomCode={bridge.isGameNight ? bridge.publicRoomCode : multiplayer.gameState.roomCode} copiedRoomCode={copied} onCopyRoomCode={copyInvite} onStart={multiplayer.startGame} onLeave={leave} canStart={connectedPlayers.length >= 2} isHost={multiplayer.isHost} message={message} startLabel="Deal Cards" />
  if (view === "game" && multiplayer.gameState && multiplayer.playerId) return <div className="min-h-[calc(100vh-73px)] bg-zinc-950">
    <GameTopBar title="Uno" subtitle={bridge.isGameNight ? bridge.publicRoomCode : multiplayer.gameState.roomCode} onBack={leave} />
    <main className="mx-auto max-w-6xl p-2 sm:p-4"><UnoGame state={multiplayer.gameState} playerId={multiplayer.playerId} isHost={multiplayer.isHost} onPlayCard={multiplayer.playCard} onDrawCard={multiplayer.drawCard} onPass={multiplayer.pass} onRestart={multiplayer.restartGame} />
      {message && <div className="mx-auto mt-3 max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">{message}</div>}
    </main>
  </div>
  return null
}
