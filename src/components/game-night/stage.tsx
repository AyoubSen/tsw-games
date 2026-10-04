import { Award, Check, Crown, Gamepad2, Trophy, TrendingUp, Users } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { PartyAvatar } from "@/components/games/party-shell/SeatRing";
import { Podium, type ScoreRow } from "@/components/games/party-shell/Scoreboard";
import { GLASS } from "@/components/games/party-shell/shell";
import { liveGames } from "@/lib/gameCatalog";
import {
	type GameNightAward,
	type GameNightGameId,
	type GameNightHistoryEntry,
	type GameNightPlayer,
	type GameNightVote,
	getGameNightGame,
	RECAP_BEATS,
	SPIN_MS,
} from "@/lib/gameNight";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";

/** Catalog look (colour, icon, blurb) for a Game Night game. */
export function gameLook(gameId: GameNightGameId) {
	const game = getGameNightGame(gameId);
	const catalog = liveGames.find((entry) => entry.id === gameId);
	return {
		title: game?.title ?? gameId,
		color: catalog?.color ?? "from-slate-500 to-slate-700",
		icon: catalog?.icon ?? <Gamepad2 className="size-6" />,
		description: catalog?.description ?? "",
		players: gameId === "codenames" ? "2 or 4–8" : `${game?.minPlayers ?? 2}–${game?.maxPlayers ?? 8}`,
		minutes: catalog?.durationMinutes ? `${catalog.durationMinutes[0]}–${catalog.durationMinutes[1]} min` : null,
	};
}

export function GameIcon({ gameId, size = 40, className }: { gameId: GameNightGameId; size?: number; className?: string }) {
	const look = gameLook(gameId);
	return (
		<span
			aria-hidden="true"
			className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br text-white shadow-[0_6px_18px_rgb(0_0_0/.45)] ring-1 ring-white/25 [&_svg]:size-[55%]", look.color, className)}
			style={{ width: size, height: size, fontSize: size * 0.32 }}
		>
			{look.icon}
		</span>
	);
}

export function AvatarStack({ players, size = 20, max = 6 }: { players: GameNightPlayer[]; size?: number; max?: number }) {
	if (!players.length) return null;
	return (
		<span className="flex items-center">
			{players.slice(0, max).map((player, index) => (
				<PartyAvatar key={player.id} id={player.id} name={player.name} size={size} className="uno-tag ring-1 ring-black/60" style={{ marginLeft: index ? -size * 0.3 : 0 }} />
			))}
			{players.length > max && <span className="ml-1 text-[10px] font-bold text-white/80">+{players.length - max}</span>}
		</span>
	);
}

/** A rich game tile in the catalog colour; dimmed when it doesn't fit the room. */
export function GameTile({ gameId, size = "md", misfit, rosterSize, voters, mine, picked, lit, onClick, corner, className, style }: {
	gameId: GameNightGameId;
	size?: "sm" | "md" | "lg";
	misfit: string | null;
	rosterSize: number;
	voters?: GameNightPlayer[];
	/** The viewer's own vote. */
	mine?: boolean;
	/** On the host's ballot. */
	picked?: boolean;
	/** Highlighted by the reveal spin. */
	lit?: boolean;
	onClick?: () => void;
	corner?: ReactNode;
	className?: string;
	style?: CSSProperties;
}) {
	const look = gameLook(gameId);
	const dims = size === "lg" ? "w-[min(300px,100%)] h-[170px]" : size === "md" ? "w-[150px] h-[124px]" : "w-[124px] h-[104px]";
	return (
		<div className={cn("relative shrink-0", dims, className)} style={style}>
			<button
				type="button"
				onClick={onClick}
				disabled={!onClick}
				aria-pressed={mine || picked}
				className={cn(
					"group relative flex size-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br p-2.5 text-left text-white shadow-[0_10px_28px_rgb(0_0_0/.5)] ring-1 ring-white/20 transition duration-200",
					look.color,
					onClick && "hover:-translate-y-1 hover:ring-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
					!onClick && "cursor-default",
					misfit && "opacity-40 saturate-[.35]",
					(mine || picked) && "ring-[3px] ring-white",
					lit && "scale-105 ring-4 ring-amber-300 shadow-[0_0_40px_rgb(252_211_77/.65)]",
				)}
			>
				<span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
				<span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-white/15 blur-xl" />
				<span className={cn("relative grid place-items-center rounded-xl bg-black/25 ring-1 ring-white/25 backdrop-blur-sm [&_svg]:size-[55%]", size === "lg" ? "size-14 text-xl" : "size-10 text-sm")}>{look.icon}</span>
				<span className="relative mt-auto block">
					<span className={cn("block truncate font-black leading-tight drop-shadow", size === "lg" ? "text-2xl" : "text-sm")}>{look.title}</span>
					<span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-white/80">
						{misfit ? (
							<span className="truncate text-rose-100">{misfit}</span>
						) : (
							<>
								<Check className="size-3 text-emerald-300" />
								<span className="truncate">Fits {rosterSize} · {look.players}</span>
							</>
						)}
					</span>
					{size === "lg" && look.minutes && <span className="block text-[11px] text-white/70">{look.minutes}</span>}
				</span>
				{voters && voters.length > 0 && (
					<span className="absolute right-2 top-2">
						<AvatarStack players={voters} size={size === "sm" ? 18 : 22} max={size === "sm" ? 3 : 5} />
					</span>
				)}
				{picked && !voters?.length && (
					<span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white text-black shadow"><Check className="size-4" /></span>
				)}
			</button>
			{corner}
		</div>
	);
}

/** The vote reveal: a highlight ticks through the candidates, slowing down onto the winner. */
export function SpinReveal({ vote, elapsed, rosterSize, voters }: {
	vote: GameNightVote;
	elapsed: number;
	rosterSize: number;
	voters: (gameId: GameNightGameId) => GameNightPlayer[];
}) {
	const candidates = vote.candidates ?? [vote.winner!];
	const winnerIndex = Math.max(0, candidates.indexOf(vote.winner!));
	const travel = SPIN_MS - 1500;
	const steps = candidates.length > 1 ? candidates.length * 3 + winnerIndex : 0;
	const t = Math.min(1, elapsed / travel);
	const step = Math.floor(steps * (1 - (1 - t) ** 2.4));
	const landed = elapsed >= travel;
	const lit = landed ? winnerIndex : step % candidates.length;
	const lastStep = useRef(step);
	useEffect(() => {
		if (step !== lastStep.current && !landed) playSound("tick");
		lastStep.current = step;
	}, [step, landed]);
	useEffect(() => {
		if (landed) playSound("chime");
	}, [landed]);
	const winner = vote.winner!;
	return (
		<div className="flex w-full flex-col items-center gap-3">
			<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">{vote.hostPick ? "Host's pick" : landed ? "Next up" : "The room has spoken…"}</p>
			{landed ? (
				<>
					<GameTile gameId={winner} size="lg" misfit={null} rosterSize={rosterSize} voters={voters(winner)} lit className="uno-pop" />
					<p className="poker-rise text-sm text-white/70">Launching {gameLook(winner).title}…</p>
				</>
			) : (
				<div className="flex max-w-full flex-wrap justify-center gap-2">
					{candidates.map((gameId, index) => (
						<GameTile key={gameId} gameId={gameId} size="sm" misfit={null} rosterSize={rosterSize} voters={voters(gameId)} lit={index === lit} className={cn("transition-opacity", index !== lit && "opacity-60")} />
					))}
				</div>
			)}
		</div>
	);
}

/** Post-game recap on the stage: the game, then its winners. */
export function RecapStage({ entry, number, players, elapsed, meId }: {
	entry: GameNightHistoryEntry;
	number: number;
	players: Record<string, GameNightPlayer>;
	elapsed: number;
	meId: string;
}) {
	const look = gameLook(entry.gameId);
	const winners = entry.winnerIds.map((id) => players[id]).filter(Boolean) as GameNightPlayer[];
	const showWinners = elapsed >= RECAP_BEATS.winners;
	return (
		<div className="flex w-full flex-col items-center gap-3 text-center">
			<div className="uno-pop flex items-center gap-3">
				<GameIcon gameId={entry.gameId} size={52} />
				<div className="text-left">
					<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">Game {number} · Final</p>
					<p className="text-2xl font-black leading-tight">{look.title}</p>
				</div>
			</div>
			{showWinners && (
				<div className="uno-pop flex flex-col items-center gap-2">
					{!entry.scored ? (
						<p className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/75">Unscored game — no wins this time</p>
					) : winners.length === 0 ? (
						<p className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/75">Nobody took it</p>
					) : (
						<>
							<div className="flex flex-wrap justify-center gap-3">
								{winners.map((player, index) => (
									<div key={player.id} className="poker-pop flex flex-col items-center" style={{ animationDelay: `${index * 140}ms` }}>
										<div className="relative">
											<PartyAvatar id={player.id} name={player.name} size={56} className="poker-win-glow" />
											<Crown className="absolute -top-3 left-1/2 size-5 -translate-x-1/2 fill-amber-300 text-amber-500 drop-shadow" />
										</div>
										<span className="mt-1 max-w-24 truncate text-sm font-bold">{player.id === meId ? "You" : player.name}</span>
									</div>
								))}
							</div>
							<p className="text-sm font-semibold text-amber-200">{winners.length === 1 ? "takes the win" : "share the win"} · +1</p>
						</>
					)}
				</div>
			)}
		</div>
	);
}

const AWARD_ICON: Record<GameNightAward["id"], ReactNode> = {
	champion: <Trophy className="size-5 text-amber-300" />,
	regular: <Users className="size-5 text-sky-300" />,
	comeback: <TrendingUp className="size-5 text-emerald-300" />,
};

const CONFETTI = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#f87171", "#a78bfa"];

/** End of the night: podium on wins plus the awards. */
export function Finale({ rows, awards, players, gamesPlayed, meId, actions }: {
	rows: ScoreRow[];
	awards: GameNightAward[];
	players: Record<string, GameNightPlayer>;
	gamesPlayed: number;
	meId: string;
	actions: ReactNode;
}) {
	const name = (id: string) => (id === meId ? "You" : (players[id]?.name ?? "?"));
	return (
		<div className="uno-fade-in absolute inset-0 z-[25] overflow-y-auto bg-[radial-gradient(ellipse_at_50%_20%,rgb(120_53_15/.55),rgb(10_6_20/.94)_65%)] px-4 pb-8 pt-[76px]">
			<div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
				{Array.from({ length: 36 }, (_, i) => (
					<span
						key={i}
						className="uno-confetti absolute top-0 block h-3 w-1.5 rounded-sm"
						style={{
							left: `${(i * 37) % 100}%`,
							background: CONFETTI[i % CONFETTI.length],
							["--fall" as string]: `${2.6 + ((i * 13) % 20) / 10}s`,
							["--delay" as string]: `${((i * 7) % 20) / 10}s`,
							["--drift" as string]: `${((i * 17) % 80) - 40}px`,
							["--spin" as string]: `${360 + ((i * 53) % 360)}deg`,
						}}
					/>
				))}
			</div>
			<div className="relative mx-auto flex max-w-3xl flex-col items-center">
				<p className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-200/80">That's a wrap</p>
				<h2 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">Game Night Champions</h2>
				<p className="mt-1 text-sm text-white/60">{gamesPlayed} game{gamesPlayed === 1 ? "" : "s"} played</p>
				<div className="mt-6">{rows.length > 0 && <Podium rows={rows} meId={meId} unit="wins" />}</div>
				{awards.length > 0 && (
					<div className="mt-6 grid w-full gap-3 sm:grid-cols-3">
						{awards.map((award, index) => (
							<div key={award.id} className={cn(GLASS, "uno-pop flex flex-col items-center gap-2 p-4 text-center")} style={{ animationDelay: `${1100 + index * 220}ms` }}>
								<span className="grid size-10 place-items-center rounded-full bg-white/10">{AWARD_ICON[award.id] ?? <Award className="size-5" />}</span>
								<p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">{award.title}</p>
								<div className="flex items-center gap-1.5">
									<AvatarStack players={award.playerIds.map((id) => players[id]).filter(Boolean) as GameNightPlayer[]} size={26} />
								</div>
								<p className="text-sm font-bold">{award.playerIds.map(name).join(" & ")}</p>
								<p className="text-xs text-white/60">{award.detail}</p>
							</div>
						))}
					</div>
				)}
				<div className="mt-7 flex flex-wrap justify-center gap-2">{actions}</div>
			</div>
		</div>
	);
}

/** The night's match history for the log panel (newest first). */
export function MatchLog({ history, players, meId }: { history: GameNightHistoryEntry[]; players: Record<string, GameNightPlayer>; meId: string }) {
	if (!history.length) return <p className="p-2 text-sm text-white/60">No games finished yet tonight.</p>;
	return (
		<ol className="space-y-2">
			{history.map((entry, index) => ({ entry, number: index + 1 })).reverse().map(({ entry, number }) => {
				const winners = entry.winnerIds.map((id) => players[id] ?? { id, name: entry.winnerNames[entry.winnerIds.indexOf(id)] ?? "?", wins: 0, joinedAt: 0 });
				return (
					<li key={entry.matchId} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
						<GameIcon gameId={entry.gameId} size={38} />
						<div className="min-w-0 flex-1">
							<p className="flex items-baseline gap-2 text-sm font-bold">
								<span className="truncate">{gameLook(entry.gameId).title}</span>
								<span className="ml-auto shrink-0 font-mono text-[10px] font-normal text-white/45">#{number} · {new Date(entry.finishedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
							</p>
							<p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65">
								{!entry.scored ? (
									"Unscored"
								) : winners.length ? (
									<>
										<AvatarStack players={winners} size={16} max={4} />
										<span className="truncate">{winners.map((player) => (player.id === meId ? "You" : player.name)).join(", ")}</span>
										<span className="font-bold text-emerald-300">+1</span>
									</>
								) : (
									"No winner"
								)}
								{entry.playerIds && <span className="ml-auto shrink-0 text-white/40">{entry.playerIds.length}p</span>}
							</p>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
