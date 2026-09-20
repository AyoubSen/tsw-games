import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Crown, Gamepad2, LogOut, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useGameNight } from "@/components/game-night/GameNightProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { liveGames } from "@/lib/gameCatalog";
import { GAME_NIGHT_GAMES, getGameNightGame } from "@/lib/gameNight";
import { getGameNightInviteLink, parseInviteSearch } from "@/lib/inviteLinks";

export const Route = createFileRoute("/game-night")({
	validateSearch: parseInviteSearch,
	component: GameNightPage,
});

function GameNightPage() {
	const { room: invitedRoom } = Route.useSearch();
	const gameNight = useGameNight();
	const [name, setName] = useState("");
	const [roomCode, setRoomCode] = useState(invitedRoom ?? "");
	const [message, setMessage] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const players = useMemo(
		() => Object.values(gameNight.state?.players ?? {}).sort((left, right) => right.wins - left.wins || left.joinedAt - right.joinedAt),
		[gameNight.state?.players],
	);
	const connectedCount = players.filter((player) => player.connected !== false).length;

	useEffect(() => {
		if (gameNight.error) setMessage(gameNight.error);
	}, [gameNight.error]);

	const createRoom = () => {
		if (!name.trim()) return setMessage("Enter your name first.");
		gameNight.createRoom(name.trim());
		setMessage(null);
	};
	const joinRoom = () => {
		if (!name.trim() || roomCode.length !== 6) return setMessage("Enter your name and a six-character room code.");
		gameNight.joinRoom(roomCode, name.trim());
		setMessage(null);
	};
	const copyInvite = async () => {
		if (!gameNight.state) return;
		try {
			await navigator.clipboard.writeText(getGameNightInviteLink(gameNight.state.roomCode));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setMessage("Could not copy the invite link.");
		}
	};

	if (!gameNight.state) {
		return (
			<main className="min-h-[calc(100vh-73px)] bg-gradient-to-b from-primary/5 to-background px-4 py-10">
				<div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
					<section>
						<p className="text-sm font-bold uppercase tracking-[0.25em] text-primary">One room, every game</p>
						<h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Keep the crew. Change the game.</h1>
						<p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">Create one room, carry the same players through the whole night, and settle the final winner on a shared scoreboard.</p>
					</section>
					<Card className="border-primary/30 shadow-xl">
						<CardHeader><CardTitle className="flex items-center gap-2"><Gamepad2 className="h-5 w-5 text-primary" />Start Game Night</CardTitle><CardDescription>Share one code and let the host choose each game.</CardDescription></CardHeader>
						<CardContent className="space-y-4">
							<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" maxLength={20} />
							<div className="grid grid-cols-[1fr_auto] gap-2">
								<Input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="Room code" maxLength={6} />
								<Button variant="outline" onClick={joinRoom}>Join</Button>
							</div>
							<Button className="w-full" onClick={createRoom}>Create Game Night</Button>
							{(message || gameNight.connectionStatus === "connecting") && <p className="rounded-xl bg-muted p-3 text-sm">{message ?? "Connecting..."}</p>}
						</CardContent>
					</Card>
				</div>
			</main>
		);
	}

	const active = gameNight.state.activeMatch;
	const canChoose = gameNight.isHost && (!active || active.status === "finished");
	return (
		<main className="min-h-[calc(100vh-73px)] bg-background px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<header className="flex flex-col gap-4 rounded-3xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
					<div><p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Game Night</p><h1 className="mt-1 font-mono text-4xl font-black tracking-[0.25em]">{gameNight.state.roomCode}</h1><p className="mt-2 text-sm text-muted-foreground">{connectedCount} of {players.length} players connected</p></div>
					<div className="flex gap-2"><Button variant="outline" onClick={copyInvite}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? "Copied" : "Copy Invite"}</Button><Button variant="ghost" onClick={gameNight.leaveRoom}><LogOut className="mr-2 h-4 w-4" />Leave</Button></div>
				</header>

				<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
					<div className="space-y-6">
						<Card><CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" />Night Standings</CardTitle></CardHeader><CardContent className="space-y-2">{players.map((player, index) => <div key={player.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${player.id === gameNight.playerId ? "bg-primary/10" : "bg-muted/60"} ${player.connected === false ? "opacity-50" : ""}`}><div className="flex min-w-0 items-center gap-2"><span className="w-5 text-xs text-muted-foreground">{index + 1}</span><span className="truncate font-semibold">{player.name}</span>{player.id === gameNight.state?.hostId && <Crown className="h-4 w-4 text-amber-500" />}</div><span className="font-mono font-black">{player.wins}</span></div>)}</CardContent></Card>
						{gameNight.state.history.length > 0 && <Card><CardHeader><CardTitle className="text-base">Games Played</CardTitle></CardHeader><CardContent className="space-y-3">{[...gameNight.state.history].reverse().map((entry) => <div key={entry.matchId} className="border-l-2 border-primary/40 pl-3"><p className="text-sm font-semibold">{getGameNightGame(entry.gameId)?.title}</p><p className="text-xs text-muted-foreground">{entry.scored ? (entry.winnerNames.length ? `${entry.winnerNames.join(", ")} +1` : "No winner") : "Unscored game"}</p></div>)}</CardContent></Card>}
					</div>

					<section>
						<div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-black">{canChoose ? "Choose the next game" : active?.status === "finished" ? "Waiting for the host" : "Game selected"}</h2><p className="text-sm text-muted-foreground">Players stay in this room between every match.</p></div>{active && active.status !== "finished" && <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{active.status === "launching" ? "Host is preparing" : "Ready to play"}</span>}</div>
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							{GAME_NIGHT_GAMES.map((game) => {
								const catalog = liveGames.find((entry) => entry.id === game.id);
								const unavailable = players.length > game.maxPlayers || connectedCount < game.minPlayers;
								const selected = active?.gameId === game.id && active.status !== "finished";
								return <button key={game.id} type="button" disabled={!canChoose || unavailable} onClick={() => gameNight.selectGame(game.id)} className={`rounded-2xl border p-4 text-left transition ${selected ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50"} disabled:cursor-not-allowed disabled:opacity-45`}><div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white ${catalog?.color ?? "from-slate-500 to-slate-700"}`}>{catalog?.icon}</div><h3 className="font-bold">{game.title}</h3><p className="mt-1 text-xs text-muted-foreground">{game.minPlayers}-{game.maxPlayers} players</p>{unavailable && <p className="mt-2 text-xs font-semibold text-destructive">Does not fit this roster</p>}</button>;
							})}
						</div>
						{message && <p className="mt-4 rounded-xl border bg-muted p-3 text-sm">{message}</p>}
					</section>
				</div>
			</div>
		</main>
	);
}
