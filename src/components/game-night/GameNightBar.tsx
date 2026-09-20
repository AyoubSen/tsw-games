import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Crown, LogOut, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameNight } from "./GameNightProvider";

export function GameNightBar() {
	const gameNight = useGameNight();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	if (!gameNight.state || pathname === "/game-night") return null;
	const player = gameNight.playerId ? gameNight.state.players[gameNight.playerId] : null;
	const leave = () => {
		gameNight.leaveRoom();
		navigate({ to: "/" });
	};
	return (
		<div className="border-b border-primary/20 bg-primary/5 px-4 py-2">
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-sm">
				<button type="button" className="flex min-w-0 items-center gap-2 font-semibold" onClick={() => navigate({ to: "/game-night", search: { room: gameNight.state!.roomCode } })}>
					{gameNight.isHost && <Crown className="h-4 w-4 text-amber-500" />}
					<span>Game Night</span>
					<span className="font-mono tracking-widest text-muted-foreground">{gameNight.state.roomCode}</span>
				</button>
				<div className="flex items-center gap-2">
					<span className="flex items-center gap-1 font-semibold"><Trophy className="h-4 w-4 text-amber-500" />{player?.wins ?? 0}</span>
					<Button size="sm" variant="ghost" onClick={leave} aria-label="Leave Game Night"><LogOut className="h-4 w-4" /></Button>
				</div>
			</div>
		</div>
	);
}
