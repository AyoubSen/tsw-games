import { createFileRoute, Link } from "@tanstack/react-router";
import { GameRouteError } from "@/components/GameErrorBoundary";
import { Gamepad2, Trophy, Users, Vote } from "lucide-react";
import { useEffect, useState } from "react";
import { GameNightLounge } from "@/components/game-night/GameNightLounge";
import { useGameNight } from "@/components/game-night/GameNightProvider";
import { GameIcon } from "@/components/game-night/stage";
import { GLASS } from "@/components/games/party-shell/shell";
import { useProfileName } from "@/components/multiplayer/shared";
import { GAME_NIGHT_GAMES } from "@/lib/gameNight";
import { parseInviteSearch } from "@/lib/inviteLinks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/game-night")({
	validateSearch: parseInviteSearch,
	component: GameNightPage,
	errorComponent: GameRouteError,
});

function GameNightPage() {
	const { room: invitedRoom } = Route.useSearch();
	const gameNight = useGameNight();
	const [name, setName] = useState("");
	const profile = useProfileName(name, setName);
	const [roomCode, setRoomCode] = useState(invitedRoom ?? "");
	const [message, setMessage] = useState<string | null>(null);
	const joined = Boolean(gameNight.state);

	useEffect(() => {
		if (gameNight.error) setMessage(gameNight.error);
	}, [gameNight.error]);

	// The room knows who is back in the lounge (the recap waits for them).
	const { setInLounge } = gameNight;
	useEffect(() => {
		if (!joined) return;
		setInLounge(true);
		return () => setInLounge(false);
	}, [joined]);

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

	if (joined) return <GameNightLounge />;

	const input = "h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/30";
	return (
		<main
			className="relative min-h-[calc(100dvh-73px)] overflow-hidden px-4 py-10 text-white"
			style={{ background: "radial-gradient(ellipse 60% 45% at 70% 50%, rgb(251 191 36 / .14), transparent 70%), radial-gradient(ellipse at 50% 120%, #3b1442 0%, transparent 60%), linear-gradient(#120b1f, #0a0712)" }}
		>
			<div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-3 opacity-25 blur-[1px]">
				{GAME_NIGHT_GAMES.slice(0, 12).map((game, index) => (
					<span key={game.id} className="uno-bob" style={{ animationDelay: `${index * 120}ms` }}>
						<GameIcon gameId={game.id} size={54} />
					</span>
				))}
			</div>
			<div className="relative mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
				<section>
					<p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-300">One room, every game</p>
					<h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Keep the crew. Change the game.</h1>
					<p className="mt-5 max-w-xl text-lg leading-8 text-white/65">Create one lounge, carry the same players through the whole night, vote on what's next and crown a champion at the end.</p>
					<ul className="mt-6 flex flex-wrap gap-2 text-sm text-white/75">
						<li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><Users className="size-4 text-sky-300" />Up to 12 players</li>
						<li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><Vote className="size-4 text-amber-300" />Vote on the next game</li>
						<li className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><Trophy className="size-4 text-amber-300" />Night standings & awards</li>
					</ul>
				</section>
				<div className={cn(GLASS, "space-y-4 p-6")}>
					<div>
						<p className="flex items-center gap-2 text-lg font-black"><Gamepad2 className="size-5 text-amber-300" />Start Game Night</p>
						<p className="text-sm text-white/60">Share one code and pick each game together.</p>
					</div>
					{profile ? (
						<div className={cn(input, "flex items-center gap-2")}>
							<span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: profile.color }} />
							<span className="text-white/60">Playing as</span>
							<span className="truncate font-bold">{profile.displayName}</span>
							<Link to="/profile" className="ml-auto text-xs text-amber-300 hover:underline">Edit</Link>
						</div>
					) : (
						<input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" maxLength={20} />
					)}
					<div className="grid grid-cols-[1fr_auto] gap-2">
						<input className={cn(input, "font-mono uppercase tracking-[0.3em]")} value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="CODE" maxLength={6} />
						<button type="button" onClick={joinRoom} className="h-11 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-bold transition hover:bg-white/20">Join</button>
					</div>
					<button type="button" onClick={createRoom} className="h-11 w-full rounded-xl bg-amber-300 text-sm font-black text-amber-950 shadow-lg transition hover:bg-amber-200">Create Game Night</button>
					{(message || gameNight.connectionStatus === "connecting") && <p className="rounded-xl bg-white/10 p-3 text-sm">{message ?? "Connecting..."}</p>}
				</div>
			</div>
		</main>
	);
}
