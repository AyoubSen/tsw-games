import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Crown, LogOut, Sparkles, Trophy } from "lucide-react";
import { PartyAvatar } from "@/components/games/party-shell/SeatRing";
import { useGameNight } from "./GameNightProvider";
import { GameIcon } from "./stage";

export function GameNightBar() {
	const gameNight = useGameNight();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	if (!gameNight.state || pathname === "/game-night") return null;
	const state = gameNight.state;
	const player = gameNight.playerId ? state.players[gameNight.playerId] : null;
	const rank = player ? 1 + Object.values(state.players).filter((other) => other.wins > player.wins).length : null;
	const match = state.activeMatch;
	const resultsIn = match?.status === "finished";
	const toLounge = () => navigate({ to: "/game-night", search: { room: state.roomCode } });
	const leave = () => {
		gameNight.leaveRoom();
		navigate({ to: "/" });
	};
	return (
		<div className="border-b border-white/10 bg-[linear-gradient(90deg,#1a0f2b,#120b1f_40%,#2a1433)] px-3 py-1.5 text-white">
			<div className="mx-auto flex max-w-6xl items-center gap-2 text-sm">
				<button type="button" onClick={toLounge} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 font-semibold transition hover:bg-white/10">
					<ArrowLeft className="size-4 shrink-0 text-white/60" />
					{match && <GameIcon gameId={match.gameId} size={22} className="rounded-md" />}
					<span className="hidden sm:inline">Game Night</span>
					<span className="font-mono text-xs tracking-widest text-white/50">{state.roomCode}</span>
				</button>
				{resultsIn && (
					<button type="button" onClick={toLounge} className="uno-tag flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-amber-950 shadow-[0_0_18px_rgb(252_211_77/.45)] transition hover:bg-amber-200">
						<Sparkles className="size-3.5" />
						<span>Results are in<span className="hidden sm:inline"> · back to the lounge</span></span>
					</button>
				)}
				<div className="ml-auto flex items-center gap-2">
					{player && (
						<span className="flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pl-0.5 pr-2.5">
							<PartyAvatar id={player.id} name={player.name} size={22} className="ring-1" />
							{gameNight.isHost && <Crown className="size-3.5 fill-amber-300 text-amber-500" aria-label="Host" />}
							<Trophy className="size-3.5 text-amber-300" />
							<span className="font-mono font-black tabular-nums">{player.wins}</span>
							{rank && <span className="text-xs text-white/50">#{rank}</span>}
						</span>
					)}
					<button type="button" onClick={leave} aria-label="Leave Game Night" className="grid size-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white">
						<LogOut className="size-4" />
					</button>
				</div>
			</div>
		</div>
	);
}
