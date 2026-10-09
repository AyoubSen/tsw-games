import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, Crown, Flag, Gamepad2, LogOut, ScrollText, Sparkles, Trophy, Vote, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { Scoreboard, type ScoreRow } from "@/components/games/party-shell/Scoreboard";
import { ringLayout, Seat, SeatChip, viewerFirst } from "@/components/games/party-shell/SeatRing";
import { GLASS, GlassButton, PartyTable, SidePanel, TableTopBar, TimerRing, useBeat, useElementSize, useNow, useSoundCue } from "@/components/games/party-shell/shell";
import { ProfileBadge } from "@/components/multiplayer/ProfileBadge";
import { GAME_NIGHT_GAMES, type GameNightGameId, type GameNightPlayer, gameNightMisfit, getGameNightGame, RECAP_BEATS, RECAP_MS, SPIN_MS, VOTE_MS } from "@/lib/gameNight";
import { getGameNightInviteLink } from "@/lib/inviteLinks";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { useGameNight } from "./GameNightProvider";
import { Finale, GameTile, gameLook, MatchLog, RecapStage, SpinReveal } from "./stage";

const LOUNGE_BG =
	"radial-gradient(ellipse 60% 45% at 50% 46%, rgb(251 191 36 / .16), transparent 70%), radial-gradient(ellipse at 50% 120%, #3b1442 0%, transparent 60%), radial-gradient(ellipse at 10% -10%, #1e2a5a 0%, transparent 55%), linear-gradient(#120b1f, #0a0712)";
const PICK_LIMIT = 4;
const FLY_MS = 900;

type Phase = "pick" | "vote" | "spin" | "match" | "recap" | "finale";

export function GameNightLounge() {
	const gameNight = useGameNight();
	const state = gameNight.state!;
	const meId = gameNight.playerId ?? "";
	const isHost = gameNight.isHost;
	const navigate = useNavigate();
	const [tableRef, size] = useElementSize<HTMLDivElement>();
	const [logOpen, setLogOpen] = useState(false);
	const [picks, setPicks] = useState<GameNightGameId[]>([]);
	const [copied, setCopied] = useState(false);
	const [confirmEnd, setConfirmEnd] = useState(false);

	const players = useMemo(() => Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt), [state.players]);
	const rosterSize = players.length;
	const connectedCount = players.filter((player) => player.connected !== false).length;
	const misfit = (gameId: GameNightGameId) => gameNightMisfit(gameId, rosterSize, connectedCount);
	const active = state.activeMatch;
	const vote = state.vote;
	const recap = state.recap;
	const phase: Phase = state.finale ? "finale" : recap ? "recap" : active && active.status !== "finished" ? "match" : vote?.stage === "spin" ? "spin" : vote ? "vote" : "pick";

	// Recap beats replay locally from when this client first saw the recap play.
	const recapElapsed = useBeat(recap?.stage === "playing" ? `${recap.matchId}:${recap.startedAt}` : null, RECAP_MS, 100);
	const spinElapsed = useBeat(vote?.stage === "spin" ? `${vote.id}:spin` : null, SPIN_MS, 50);
	const recapEntry = recap ? state.history.find((entry) => entry.matchId === recap.matchId) : undefined;
	const recapNumber = recapEntry ? state.history.indexOf(recapEntry) + 1 : 0;
	// Until the +1 lands, the standings, seats and log stay as they were before the game.
	const masking = Boolean(recapEntry && (recap!.stage === "waiting" || recapElapsed < RECAP_BEATS.land));
	const lastEntry = state.history.at(-1);
	const freshEntry = recapEntry ?? (lastEntry && active?.id === lastEntry.matchId && active.status === "finished" ? lastEntry : undefined);
	const gainedBy = (id: string) => (freshEntry?.scored && freshEntry.winnerIds.includes(id) ? 1 : 0);
	const winsOf = (player: GameNightPlayer) => player.wins - (masking ? gainedBy(player.id) : 0);
	const history = masking ? state.history.filter((entry) => entry !== recapEntry) : state.history;

	const rows: ScoreRow[] = players.map((player) => ({ id: player.id, name: player.name, score: winsOf(player), gained: masking ? 0 : gainedBy(player.id) || undefined }));

	const now = useNow(phase === "vote", 500);
	const voteLeft = vote?.stage === "open" ? Math.max(0, Math.ceil((vote.endsAt - now) / 1000)) : 0;
	const votersFor = (gameId: GameNightGameId) => (vote ? players.filter((player) => vote.votes[player.id] === gameId) : []);
	const myVote = vote?.votes[meId];
	const votedCount = vote ? players.filter((player) => vote.votes[player.id]).length : 0;

	// Sounds
	useSoundCue(vote?.stage === "open" ? vote.id : null, () => playSound("deal"));
	useSoundCue(vote?.stage === "open" ? `${vote.id}:${votedCount}` : null, () => votedCount > 0 && playSound("chip"));
	useSoundCue(active && active.status !== "finished" ? active.id : null, () => playSound("whoosh"));
	useSoundCue(state.finale ? String(state.finale.endedAt) : null, () => playSound("win"));
	useSoundCue(String(rosterSize), () => playSound("knock"));
	const recapKey = recap?.stage === "playing" ? recap.matchId : null;
	useEffect(() => {
		if (!recapKey || !recapEntry) return;
		playSound("whoosh");
		if (recapEntry.scored && recapEntry.winnerIds.length) {
			playSound("win", RECAP_BEATS.winners);
			playSound("chip", RECAP_BEATS.land);
		}
	}, [recapKey]);

	useEffect(() => {
		if (phase !== "pick") setPicks([]);
	}, [phase]);
	useEffect(() => {
		if (!confirmEnd) return;
		const timer = window.setTimeout(() => setConfirmEnd(false), 3000);
		return () => window.clearTimeout(timer);
	}, [confirmEnd]);

	// Layout
	const wide = size.w >= 1024;
	const docked = wide ? 256 : 0;
	const compact = size.w < 640 || size.h < 560;
	const tray = compact ? 118 : 146;
	const order = viewerFirst(players.map((player) => player.id), meId);
	const ring = ringLayout(order, Math.max(size.w, 320), Math.max(size.h, 400), { top: 72, bottomReserve: tray + 8, insetLeft: docked });
	const stageW = Math.max(240, Math.min(2 * ring.rx - ring.seatW + 10, 640));
	const stageH = Math.max(170, 2 * ring.ry - ring.avatar * 2 - 40);

	const copyInvite = async () => {
		try {
			await navigator.clipboard.writeText(getGameNightInviteLink(state.roomCode));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {}
	};
	const leave = () => {
		gameNight.leaveRoom();
		navigate({ to: "/" });
	};
	const enterGame = () => {
		const game = active && getGameNightGame(active.gameId);
		if (game) navigate({ to: game.path, search: { night: state.roomCode } });
	};
	const togglePick = (gameId: GameNightGameId) =>
		setPicks((current) => (current.includes(gameId) ? current.filter((id) => id !== gameId) : current.length >= PICK_LIMIT ? current : [...current, gameId]));

	const statusText = (() => {
		const host = state.players[state.hostId];
		const hostName = state.hostId === meId ? "You" : (host?.name ?? "Host");
		switch (phase) {
			case "finale": return "The night is over";
			case "recap": return recap?.stage === "waiting" ? "Results are in" : `Game ${recapNumber} recap`;
			case "match": return active!.status === "launching" ? `${hostName} ${state.hostId === meId ? "are" : "is"} setting up ${gameLook(active!.gameId).title}` : active!.status === "collecting" ? "Tallying the result…" : `Playing ${gameLook(active!.gameId).title}`;
			case "spin": return "Revealing the next game";
			case "vote": return `${votedCount}/${connectedCount} voted`;
			default: return isHost ? "Pick the next game" : `${hostName} is picking the next game`;
		}
	})();

	// Votes from the tray land on the tile; the host can also force one in.
	const tileAction = (gameId: GameNightGameId) => {
		if (phase === "vote" && vote?.options.includes(gameId) && !misfit(gameId)) return () => gameNight.vote(gameId);
		if (phase === "pick" && isHost && !misfit(gameId)) return () => togglePick(gameId);
		return undefined;
	};
	const hostPickButton = (gameId: GameNightGameId) =>
		isHost && phase === "vote" && !misfit(gameId) ? (
			<button type="button" onClick={() => gameNight.selectGame(gameId)} title="Host pick: skip the vote" className="absolute -bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-950 shadow-lg transition hover:bg-amber-200">
				<Crown className="size-3" />Pick
			</button>
		) : undefined;

	const trayGames: GameNightGameId[] =
		phase === "vote" && vote ? (vote.any ? vote.options : []) : phase === "pick" ? [...GAME_NIGHT_GAMES.map((game) => game.id)].sort((a, b) => Number(Boolean(misfit(a))) - Number(Boolean(misfit(b)))) : [];
	const recapPlaying = phase === "recap" && recap?.stage === "playing" && Boolean(recapEntry?.scored);
	const flying = recapPlaying && recapElapsed >= RECAP_BEATS.fly && recapElapsed < RECAP_BEATS.fly + FLY_MS;
	const landed = recapPlaying && recapElapsed >= RECAP_BEATS.land;

	return (
		<PartyTable tableRef={tableRef} background={LOUNGE_BG}>
			<TableTopBar
				title="Game Night"
				roomLabel={state.roomCode}
				onLeave={leave}
				connected={gameNight.connectionStatus === "connected"}
				onReact={gameNight.react}
				canReact
				status={
					<>
						{phase === "vote" ? <TimerRing left={voteLeft} limit={VOTE_MS / 1000} /> : <Sparkles className="size-4 shrink-0 text-amber-300" />}
						<span className="min-w-0 flex-1 truncate text-sm font-semibold">{statusText}</span>
						<span className="hidden shrink-0 font-mono text-xs text-white/50 sm:inline">{state.history.length} played</span>
					</>
				}
				actions={
					<>
						<span className="hidden sm:contents">
							<GlassButton icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} label={copied ? "Copied" : `Invite · ${state.roomCode}`} onClick={copyInvite} />
						</span>
						<GlassButton icon={wide ? <ScrollText className="size-4" /> : <Trophy className="size-4" />} label={wide ? "Log" : "Standings"} pressed={logOpen} onClick={() => setLogOpen(!logOpen)} />
						{isHost && phase !== "finale" && phase !== "match" && (
							<GlassButton icon={<Flag className="size-4" />} label={confirmEnd ? "Tap to confirm" : "End night"} pressed={confirmEnd} onClick={() => (confirmEnd ? (setConfirmEnd(false), gameNight.endNight()) : setConfirmEnd(true))} />
						)}
					</>
				}
			/>

			{wide && (
				<aside className={cn(GLASS, "absolute left-3 top-[68px] z-20 w-[244px] p-3")}>
					<p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/70"><Trophy className="size-4 text-amber-300" />Night standings</p>
					<Scoreboard rows={rows} meId={meId} />
				</aside>
			)}

			{/* Stage */}
			<div
				className="absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
				style={{ left: ring.cx, top: ring.cy, width: stageW, height: stageH }}
			>
				<div aria-hidden="true" className="pointer-events-none absolute inset-[-8%] rounded-[50%] bg-[radial-gradient(ellipse,rgb(253_230_138/.10),transparent_70%)]" />
				<div className="relative flex max-h-full w-full flex-col items-center justify-center overflow-y-auto overflow-x-hidden px-1 py-2">
					{phase === "pick" && (
						<PickStage
							isHost={isHost}
							picks={picks}
							rosterSize={rosterSize}
							alone={rosterSize < 2}
							roomCode={state.roomCode}
							copied={copied}
							onCopy={copyInvite}
							lastWinnerIds={masking ? [] : (lastEntry?.winnerIds ?? [])}
							onClear={() => setPicks([])}
							onRemove={togglePick}
							onLaunch={() => picks[0] && gameNight.selectGame(picks[0])}
							onVote={() => gameNight.openVote(picks)}
							onVoteAny={() => gameNight.openVote([])}
						/>
					)}
					{phase === "vote" && vote && (
						<div className="flex w-full flex-col items-center gap-3">
							<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">{vote.any ? "Vote for any game below" : "Vote for the next game"}</p>
							<div className="flex max-w-full flex-wrap justify-center gap-3">
								{(vote.any ? vote.options.filter((id) => votersFor(id).length) : vote.options).map((gameId) => (
									<GameTile key={gameId} gameId={gameId} size={compact ? "sm" : "md"} misfit={misfit(gameId)} rosterSize={rosterSize} voters={votersFor(gameId)} mine={myVote === gameId} onClick={tileAction(gameId)} corner={hostPickButton(gameId)} className="uno-pop" />
								))}
								{vote.any && votedCount === 0 && <p className="text-sm text-white/55">No votes yet — tap a game in the tray.</p>}
							</div>
							<p className="text-xs text-white/55">{myVote ? "Tap another game to change your vote" : "Tap a game to vote"} · locks when everyone has voted</p>
							{isHost && (
								<div className="flex gap-2">
									<StageButton onClick={gameNight.lockVote} primary><Vote className="size-4" />Lock now</StageButton>
									<StageButton onClick={gameNight.cancelVote}><X className="size-4" />Cancel</StageButton>
								</div>
							)}
						</div>
					)}
					{phase === "spin" && vote && <SpinReveal vote={vote} elapsed={spinElapsed} rosterSize={rosterSize} voters={votersFor} />}
					{phase === "match" && active && (
						<div className="flex w-full flex-col items-center gap-3 text-center">
							<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">{active.status === "launching" ? "Setting up" : active.status === "collecting" ? "Final whistle" : "Now playing"}</p>
							<GameTile gameId={active.gameId} size="lg" misfit={null} rosterSize={rosterSize} className={cn(active.status !== "ready" && "animate-pulse")} />
							{gameNight.connection?.canEnter && active.status !== "collecting" ? (
								<StageButton onClick={enterGame} primary><Gamepad2 className="size-4" />{active.status === "launching" ? "Open the table" : "Return to game"}</StageButton>
							) : (
								<p className="text-sm text-white/60">{active.status === "launching" ? "You'll be taken in as soon as the table is ready." : "Waiting for the result…"}</p>
							)}
						</div>
					)}
					{phase === "recap" && recapEntry && (recap!.stage === "waiting" ? (
						<div className="flex w-full flex-col items-center gap-3 text-center">
							<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">Results are in</p>
							<p className="text-xl font-black">Waiting for everyone to come back</p>
							<p className="text-sm text-white/60">{players.filter((player) => player.inLounge).length}/{connectedCount} in the lounge</p>
							{isHost && <StageButton onClick={gameNight.skipRecap} primary>Show results now</StageButton>}
						</div>
					) : (
						<>
							<RecapStage entry={recapEntry} number={recapNumber} players={state.players} elapsed={recapElapsed} meId={meId} />
							{isHost && recapElapsed > RECAP_BEATS.land && <button type="button" onClick={gameNight.skipRecap} className="mt-3 text-xs font-semibold text-white/50 underline-offset-2 hover:text-white hover:underline">Skip to the next game</button>}
						</>
					))}
				</div>
			</div>

			{/* Seats */}
			{order.map((id, index) => {
				const player = state.players[id]!;
				const seat = ring.seats[id]!;
				const away = player.connected !== false && !player.inLounge;
				const chip =
					phase === "vote" && vote ? (vote.votes[id] ? <SeatChip tone="done">Voted</SeatChip> : <SeatChip tone="waiting">Thinking</SeatChip>)
					: away && phase !== "finale" ? <SeatChip tone="waiting">{phase === "match" || phase === "recap" ? "In game" : "Away"}</SeatChip>
					: undefined;
				const won = landed && recapEntry!.winnerIds.includes(id);
				return (
					<Seat
						key={id}
						x={seat.x}
						y={seat.y}
						size={ring.avatar}
						width={ring.seatW}
						id={id}
						name={player.name}
						isMe={id === meId}
						isHost={id === state.hostId}
						connected={player.connected !== false}
						chip={chip}
						score={winsOf(player)}
						glow={won ? "#fcd34d" : null}
						bubble={gameNight.reactions[id]}
						bubbleSide={index === 0 ? "top" : seat.y < ring.cy ? "bottom" : "top"}
					>
						{player.verified && <ProfileBadge profileId={player.profileId} color={player.color} className="absolute -right-1 -top-1 size-4 rounded-full bg-black/80 p-0.5" />}
						{won && <span key={`w${recapEntry!.matchId}`} className="poker-float-up absolute bottom-full left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-lg font-black text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">+1</span>}
					</Seat>
				);
			})}

			{/* +1 flying from the stage onto each winner's seat */}
			{flying &&
				recapEntry!.winnerIds.filter((id) => ring.seats[id]).map((id, index) => (
					<div
						key={`${recapEntry!.matchId}${id}`}
						className="poker-fly pointer-events-none absolute left-0 top-0 z-30"
						style={{ ["--fx" as string]: `${ring.cx}px`, ["--fy" as string]: `${ring.cy}px`, ["--tx" as string]: `${ring.seats[id]!.x}px`, ["--ty" as string]: `${ring.seats[id]!.y}px`, animationDuration: `${FLY_MS - 100}ms`, animationDelay: `${index * 60}ms` } as CSSProperties}
					>
						<span className="grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 font-black text-amber-950 shadow-[0_0_24px_rgb(252_211_77/.8)] ring-2 ring-white/70">+1</span>
					</div>
				))}

			{/* Tray: game carousel */}
			{trayGames.length > 0 && (
				<div className="absolute bottom-2 right-3 z-20" style={{ left: 12 + docked, height: tray }}>
					<div className="flex h-full snap-x snap-mandatory items-center gap-2.5 overflow-x-auto overflow-y-visible px-1 pb-1 [scrollbar-width:thin]">
						{trayGames.map((gameId) => (
							<GameTile
								key={gameId}
								gameId={gameId}
								size={compact ? "sm" : "md"}
								misfit={misfit(gameId)}
								rosterSize={rosterSize}
								voters={phase === "vote" ? votersFor(gameId) : undefined}
								mine={myVote === gameId}
								picked={picks.includes(gameId)}
								onClick={tileAction(gameId)}
								corner={hostPickButton(gameId)}
								className="snap-start"
							/>
						))}
					</div>
				</div>
			)}

			{logOpen && (
				<SidePanel title={wide ? "Tonight's games" : "Standings & games"} icon={<ScrollText className="size-4 text-amber-300" />} onClose={() => setLogOpen(false)}>
					{!wide && <Scoreboard rows={rows} meId={meId} className="mb-4" />}
					<MatchLog history={history} players={state.players} meId={meId} />
				</SidePanel>
			)}

			{state.finale && (
				<Finale
					rows={rows}
					awards={state.finale.awards}
					players={state.players}
					gamesPlayed={state.history.length}
					meId={meId}
					actions={
						<>
							{isHost && <StageButton onClick={gameNight.resumeNight} primary><Sparkles className="size-4" />Keep playing</StageButton>}
							<StageButton onClick={leave}><LogOut className="size-4" />Leave</StageButton>
						</>
					}
				/>
			)}

			{gameNight.error && <p className={cn(GLASS, "uno-rise absolute left-1/2 top-[68px] z-50 -translate-x-1/2 px-3 py-2 text-sm text-rose-100")}>{gameNight.error}</p>}
		</PartyTable>
	);
}

function StageButton({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-bold shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
				primary ? "bg-amber-300 text-amber-950 hover:bg-amber-200" : "border border-white/15 bg-white/10 text-white hover:bg-white/20",
			)}
		>
			{children}
		</button>
	);
}

function PickStage({ isHost, picks, rosterSize, alone, roomCode, copied, onCopy, lastWinnerIds, onClear, onRemove, onLaunch, onVote, onVoteAny }: {
	isHost: boolean;
	picks: GameNightGameId[];
	rosterSize: number;
	alone: boolean;
	roomCode: string;
	copied: boolean;
	onCopy: () => void;
	lastWinnerIds: string[];
	onClear: () => void;
	onRemove: (gameId: GameNightGameId) => void;
	onLaunch: () => void;
	onVote: () => void;
	onVoteAny: () => void;
}) {
	if (alone) {
		return (
			<div className="flex flex-col items-center gap-2 text-center">
				<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">Invite your crew</p>
				<p className="font-mono text-4xl font-black tracking-[0.3em]">{roomCode}</p>
				<p className="max-w-xs text-sm text-white/60">Share the code or the invite link. Everyone stays in this lounge between games.</p>
				<StageButton onClick={onCopy} primary>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy invite link"}</StageButton>
			</div>
		);
	}
	if (!isHost) {
		return (
			<div className="flex flex-col items-center gap-2 text-center">
				<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">{lastWinnerIds.length ? "Up next" : "Welcome to the lounge"}</p>
				<p className="text-xl font-black">The host is choosing what's next</p>
				<p className="max-w-xs text-sm text-white/60">Browse the games below — you'll get a vote if the host opens one.</p>
			</div>
		);
	}
	return (
		<div className="flex w-full flex-col items-center gap-3 text-center">
			<p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-200/80">{picks.length ? "Your shortlist" : "What's next?"}</p>
			{picks.length ? (
				<div className="flex flex-wrap justify-center gap-2">
					{picks.map((gameId) => (
						<GameTile key={gameId} gameId={gameId} size="sm" misfit={null} rosterSize={rosterSize} picked onClick={() => onRemove(gameId)} className="uno-pop" />
					))}
				</div>
			) : (
				<p className="max-w-sm text-sm text-white/65">Tap one game below to launch it, or shortlist 2–4 for the room to vote on.</p>
			)}
			<div className="flex flex-wrap justify-center gap-2">
				{picks.length === 1 && <StageButton onClick={onLaunch} primary><Gamepad2 className="size-4" />Launch {gameLook(picks[0]!).title}</StageButton>}
				{picks.length >= 2 && <StageButton onClick={onVote} primary><Vote className="size-4" />Vote on {picks.length}</StageButton>}
				{picks.length === 0 && <StageButton onClick={onVoteAny} primary><Vote className="size-4" />Let everyone vote</StageButton>}
				{picks.length > 0 && <StageButton onClick={onClear}>Clear</StageButton>}
			</div>
		</div>
	);
}
