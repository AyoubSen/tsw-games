import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, RotateCcw, Timer, Trophy, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMultiplayerHotTakeArena } from "@/components/games/hot-take-arena/useMultiplayerHotTakeArena";
import {
	GameTopBar,
	MultiplayerLobby,
	MultiplayerSetupCard,
} from "@/components/multiplayer/shared";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { HotTakePack } from "@/lib/hotTakePrompts";
import type {
	HotTakePosition,
	HotTakeSettings,
} from "../../../party/hot-take-arena";

export const Route = createFileRoute("/games/hot-take-arena")({
	component: HotTakeArenaPage,
});

type HotTakeArenaView = "setup" | "lobby" | "game";

const ROUND_OPTIONS = [3, 5, 7, 10];
const ROUND_TIME_OPTIONS = [20, 30, 45, 60];
const PROMPT_PACK_OPTIONS: Array<{
	value: HotTakePack;
	label: string;
	description: string;
}> = [
	{ value: "mixed", label: "Mixed", description: "Balanced social chaos" },
	{
		value: "food",
		label: "Food",
		description: "Takes about cravings and meals",
	},
	{
		value: "social",
		label: "Social",
		description: "Parties, habits, group life",
	},
	{
		value: "dating",
		label: "Dating",
		description: "Flirty, awkward, dramatic",
	},
	{
		value: "internet",
		label: "Internet",
		description: "Online culture and annoying trends",
	},
	{
		value: "travel",
		label: "Travel",
		description: "Trips, airports, bad plans",
	},
	{
		value: "chaos",
		label: "Chaos",
		description: "Petty and unserious opinions",
	},
];
const POSITION_OPTIONS: Array<{
	value: HotTakePosition;
	label: string;
	shortLabel: string;
	description: string;
	accentClass: string;
	cardClass: string;
}> = [
	{
		value: 1,
		label: "Strongly Disagree",
		shortLabel: "Strong No",
		description: "Absolutely not",
		accentClass: "text-rose-600",
		cardClass: "border-rose-200 bg-rose-500/5",
	},
	{
		value: 2,
		label: "Disagree",
		shortLabel: "No",
		description: "Mostly against it",
		accentClass: "text-orange-600",
		cardClass: "border-orange-200 bg-orange-500/5",
	},
	{
		value: 3,
		label: "Neutral",
		shortLabel: "Maybe",
		description: "Split or unsure",
		accentClass: "text-zinc-600",
		cardClass: "border-zinc-200 bg-zinc-500/5",
	},
	{
		value: 4,
		label: "Agree",
		shortLabel: "Yes",
		description: "Mostly for it",
		accentClass: "text-emerald-600",
		cardClass: "border-emerald-200 bg-emerald-500/5",
	},
	{
		value: 5,
		label: "Strongly Agree",
		shortLabel: "Strong Yes",
		description: "No hesitation",
		accentClass: "text-teal-600",
		cardClass: "border-teal-200 bg-teal-500/5",
	},
];

function HotTakeArenaPage() {
	const [view, setView] = useState<HotTakeArenaView>("setup");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [rounds, setRounds] = useState(5);
	const [roundTimeLimit, setRoundTimeLimit] = useState(30);
	const [promptPack, setPromptPack] = useState<HotTakePack>("mixed");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);
	const [now, setNow] = useState(Date.now());
	const [selectedPosition, setSelectedPosition] =
		useState<HotTakePosition | null>(null);

	const multiplayer = useMultiplayerHotTakeArena();
	const activeRoundNumber = multiplayer.gameState?.roundNumber;

	useEffect(() => {
		if (multiplayer.connectionStatus === "connected" && multiplayer.gameState) {
			setView(multiplayer.gameState.status === "waiting" ? "lobby" : "game");
		}
	}, [multiplayer.connectionStatus, multiplayer.gameState]);

	useEffect(() => {
		if (multiplayer.error) {
			setMessage(multiplayer.error);
		}
	}, [multiplayer.error]);

	useEffect(() => {
		if (multiplayer.gameState?.status !== "voting") {
			return;
		}

		setNow(Date.now());
		const timer = window.setInterval(() => {
			setNow(Date.now());
		}, 250);

		return () => window.clearInterval(timer);
	}, [multiplayer.gameState?.status]);

	useEffect(() => {
		if (activeRoundNumber === undefined) {
			return;
		}

		setSelectedPosition(null);
		setMessage(null);
	}, [activeRoundNumber]);

	const playerList = useMemo(
		() =>
			Object.values(multiplayer.gameState?.players ?? {}).sort(
				(left, right) => left.joinedAt - right.joinedAt,
			),
		[multiplayer.gameState],
	);

	const leaderboard = useMemo(
		() =>
			Object.values(multiplayer.gameState?.players ?? {}).sort(
				(left, right) => {
					if (right.score !== left.score) {
						return right.score - left.score;
					}

					return left.joinedAt - right.joinedAt;
				},
			),
		[multiplayer.gameState],
	);

	const submittedCount = multiplayer.gameState?.submittedPlayerIds.length ?? 0;
	const currentPlayerSubmitted = multiplayer.playerId
		? (multiplayer.gameState?.submittedPlayerIds.includes(
				multiplayer.playerId,
			) ?? false)
		: false;
	const timeRemaining =
		multiplayer.gameState?.status === "voting" &&
		multiplayer.gameState.roundStartedAt
			? Math.max(
					0,
					multiplayer.gameState.settings.roundTimeLimit -
						Math.floor((now - multiplayer.gameState.roundStartedAt) / 1000),
				)
			: 0;
	const topScore = Math.max(...leaderboard.map((player) => player.score), 0);
	const winners =
		multiplayer.gameState?.status === "finished"
			? leaderboard.filter((player) => player.score === topScore)
			: [];

	const handleBack = () => {
		if (multiplayer.connectionStatus !== "disconnected") {
			multiplayer.disconnect();
		}

		setView("setup");
		setSelectedPosition(null);
		setMessage(null);
	};

	const handleCreateGame = () => {
		if (!playerName.trim()) {
			setMessage("Enter your name first.");
			return;
		}

		const settings: HotTakeSettings = {
			rounds,
			roundTimeLimit,
			promptPack,
		};

		multiplayer.createGame(playerName.trim(), settings);
		setMessage(null);
	};

	const handleJoinGame = () => {
		if (!playerName.trim() || !joinRoomCode.trim()) {
			setMessage("Enter your name and a room code.");
			return;
		}

		multiplayer.joinGame(joinRoomCode.trim(), playerName.trim());
		setMessage(null);
	};

	const handleCopyRoomCode = async () => {
		if (!multiplayer.gameState) {
			return;
		}

		try {
			await navigator.clipboard.writeText(multiplayer.gameState.roomCode);
			setCopiedRoomCode(true);
			window.setTimeout(() => setCopiedRoomCode(false), 1600);
		} catch {
			setMessage("Could not copy the room code.");
		}
	};

	const handleSubmitVote = (position: HotTakePosition) => {
		setSelectedPosition(position);
		multiplayer.submitVote(position);
		setMessage(null);
	};

	if (view === "setup") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Hot Take Arena"
					subtitle="Pick a side, reveal the room, score when people land with you"
				/>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr]">
					<MultiplayerSetupCard
						title="Create Room"
						description="Spin up opinion rounds from curated prompt packs, then reveal where everyone landed."
						icon={<Vote className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Hot Take Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinGame}
						onCreate={handleCreateGame}
						message={message}
					>
						<div className="space-y-2">
							<p className="text-sm font-medium">Rounds</p>
							<div className="grid grid-cols-4 gap-2">
								{ROUND_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setRounds(option)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											rounds === option
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										{option}
									</button>
								))}
							</div>
						</div>

						<div className="space-y-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<Timer className="h-4 w-4" />
								Vote Time
							</p>
							<div className="grid grid-cols-4 gap-2">
								{ROUND_TIME_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setRoundTimeLimit(option)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											roundTimeLimit === option
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										{option}s
									</button>
								))}
							</div>
						</div>

						<div className="space-y-2">
							<p className="text-sm font-medium">Prompt Pack</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{PROMPT_PACK_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setPromptPack(option.value)}
										className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors ${
											promptPack === option.value
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										<span>{option.label}</span>
										<span className="mt-1 block text-[11px] font-normal text-muted-foreground">
											{option.description}
										</span>
									</button>
								))}
							</div>
						</div>
					</MultiplayerSetupCard>

					<Card>
						<CardHeader>
							<CardTitle>How It Plays</CardTitle>
							<CardDescription>
								This is about reading the room, not defending the best opinion.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">1. Prompt</p>
								<p className="mt-1">
									Everyone gets the same hot take and secretly picks a side.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">2. Lock In</p>
								<p className="mt-1">
									Votes stay hidden until the room finishes or the timer ends.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">3. Reveal</p>
								<p className="mt-1">
									You score when other players land on the same position as you.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (view === "lobby" && multiplayer.gameState && multiplayer.playerId) {
		return (
			<MultiplayerLobby
				title="Hot Take Arena Lobby"
				subtitle={`Room ${multiplayer.gameState.roomCode}`}
				onBack={handleBack}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. The host starts the debate."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Rounds:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.settings.rounds}
							</span>
						</p>
						<p className="mt-1">
							Time:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.settings.roundTimeLimit}s
							</span>
						</p>
						<p className="mt-1">
							Pack:{" "}
							<span className="font-medium capitalize text-foreground">
								{multiplayer.gameState.settings.promptPack}
							</span>
						</p>
					</div>
				}
				roomCode={multiplayer.gameState.roomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleBack}
				canStart={playerList.length >= 2}
				isHost={multiplayer.isHost}
				message={message}
				startLabel="Start Arena"
			/>
		);
	}

	if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
		const gameState = multiplayer.gameState;
		const isVoting = gameState.status === "voting";
		const isReveal = gameState.status === "reveal";
		const isFinished = gameState.status === "finished";
		const revealedVotesByPlayer = new Map(
			gameState.revealedVotes.map((vote) => [vote.playerId, vote.position]),
		);
		const currentPlayerRevealPosition =
			revealedVotesByPlayer.get(multiplayer.playerId) ?? selectedPosition;
		const currentPlayerOption = POSITION_OPTIONS.find(
			(option) => option.value === currentPlayerRevealPosition,
		);
		const currentPlayerGroup = currentPlayerOption
			? gameState.voteGroups.find(
					(group) => group.position === currentPlayerOption.value,
				)
			: null;
		const largestGroupSize = Math.max(
			...gameState.voteGroups.map((group) => group.playerIds.length),
			0,
		);
		const biggestGroups = gameState.voteGroups.filter(
			(group) =>
				group.playerIds.length === largestGroupSize && largestGroupSize > 0,
		);
		const winningLaneLabel =
			biggestGroups.length === 1
				? (POSITION_OPTIONS.find(
						(option) => option.value === biggestGroups[0]?.position,
					)?.label ?? null)
				: null;

		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Hot Take Arena"
					subtitle={`Round ${gameState.roundNumber} / ${gameState.settings.rounds}`}
					onBack={handleBack}
					rightAction={
						<Button
							variant="ghost"
							size="sm"
							onClick={multiplayer.restartGame}
							disabled={!multiplayer.isHost}
						>
							<RotateCcw className="mr-1 h-4 w-4" />
							Rematch
						</Button>
					}
				/>

				<div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.45fr_0.9fr]">
					<Card className="overflow-hidden">
						<CardHeader className="border-b">
							<div className="flex items-start justify-between gap-4">
								<div>
									<CardTitle>Hot Take</CardTitle>
									<CardDescription>
										Choose the lane you think fits you and the room.
									</CardDescription>
								</div>
								<div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
									{gameState.settings.promptPack}
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6 pt-6">
							{isFinished && (
								<div className="rounded-2xl border bg-primary/8 px-4 py-4">
									<p className="flex items-center gap-2 text-sm font-semibold">
										<Trophy className="h-4 w-4" />
										{winners.length > 1
											? `Tie game: ${winners.map((winner) => winner.name).join(", ")}`
											: winners[0]
												? `${winners[0].name} wins the arena`
												: "Match complete"}
									</p>
								</div>
							)}

							<div className="rounded-3xl border bg-accent/40 px-5 py-6 text-center">
								<p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
									Current Prompt
								</p>
								<p className="mt-3 text-2xl font-semibold leading-snug md:text-3xl">
									{gameState.prompt?.text}
								</p>
								<div className="mt-6 grid gap-2 sm:grid-cols-5">
									{POSITION_OPTIONS.map((option) => {
										const isActive =
											currentPlayerRevealPosition === option.value;
										const clusterSize =
											gameState.voteGroups.find(
												(group) => group.position === option.value,
											)?.playerIds.length ?? 0;

										return (
											<div
												key={option.value}
												className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
													isActive
														? `${option.cardClass} shadow-sm`
														: "border-border bg-background/80"
												}`}
											>
												<p
													className={`text-xs font-semibold ${option.accentClass}`}
												>
													{option.shortLabel}
												</p>
												<p className="mt-1 text-[11px] text-muted-foreground">
													{option.description}
												</p>
												{(isReveal || isFinished) && (
													<p className="mt-2 text-xs font-medium text-foreground">
														{clusterSize} picked
													</p>
												)}
											</div>
										);
									})}
								</div>
							</div>

							{isVoting && (
								<div className="rounded-2xl border px-4 py-4">
									<div className="flex items-center justify-between gap-3 text-sm">
										<p className="font-medium text-foreground">
											{submittedCount} / {playerList.length} locked in
										</p>
										<p className="flex items-center gap-2 text-muted-foreground">
											<Timer className="h-4 w-4" />
											{timeRemaining}s left
										</p>
									</div>
									<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
										{POSITION_OPTIONS.map((option) => {
											const isPicked = selectedPosition === option.value;
											return (
												<button
													key={option.value}
													type="button"
													onClick={() => handleSubmitVote(option.value)}
													disabled={currentPlayerSubmitted}
													className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
														isPicked
															? `${option.cardClass} border-current ${option.accentClass}`
															: "border-border hover:border-primary/50"
													} ${currentPlayerSubmitted ? "cursor-default opacity-80" : ""}`}
												>
													<p
														className={`text-sm font-semibold ${option.accentClass}`}
													>
														{option.label}
													</p>
													<p className="mt-1 text-xs text-muted-foreground">
														{option.description}
													</p>
													<div className="mt-4 h-1.5 rounded-full bg-accent">
														<div
															className={`h-1.5 rounded-full ${
																option.value <= 2
																	? "bg-orange-500"
																	: option.value === 3
																		? "bg-zinc-400"
																		: "bg-emerald-500"
															}`}
															style={{ width: `${option.value * 20}%` }}
														/>
													</div>
												</button>
											);
										})}
									</div>
									<div className="mt-4 rounded-xl bg-accent/60 px-4 py-3 text-sm text-muted-foreground">
										{currentPlayerSubmitted ? (
											<span className="inline-flex items-center gap-2 font-medium text-foreground">
												<Check className="h-4 w-4 text-primary" />
												Vote locked. Waiting for the rest of the room.
											</span>
										) : (
											"Pick one of the five positions. Your vote stays hidden until reveal."
										)}
									</div>
								</div>
							)}

							{(isReveal || isFinished) && (
								<div className="space-y-3">
									<div className="rounded-2xl border bg-accent/30 px-4 py-4">
										<p className="text-sm font-semibold text-foreground">
											Round Outcome
										</p>
										<p className="mt-2 text-sm text-muted-foreground">
											{currentPlayerGroup && currentPlayerGroup.points > 0
												? `You landed on ${currentPlayerOption?.label} with ${currentPlayerGroup.playerIds.length - 1} other ${currentPlayerGroup.playerIds.length === 2 ? "player" : "players"} and earned ${currentPlayerGroup.points} points.`
												: currentPlayerOption
													? `You picked ${currentPlayerOption.label}. Nobody else landed there, so this round scored 0.`
													: "Reveal is in. Check where the room clustered."}
										</p>
										{largestGroupSize > 0 && (
											<p className="mt-2 text-xs font-medium text-foreground">
												{winningLaneLabel
													? `Biggest lane: ${winningLaneLabel} with ${largestGroupSize} players`
													: `The room split across ${biggestGroups.length} equally large lanes`}
											</p>
										)}
									</div>

									<p className="text-sm font-semibold text-foreground">
										Reveal
									</p>
									<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
										{POSITION_OPTIONS.map((option) => {
											const group = gameState.voteGroups.find(
												(entry) => entry.position === option.value,
											);
											const playersInLane = (group?.playerIds ?? [])
												.map((playerId) => ({
													id: playerId,
													name: gameState.players[playerId]?.name,
												}))
												.filter(
													(player): player is { id: string; name: string } =>
														Boolean(player.name),
												);

											const isCurrentPlayersLane =
												currentPlayerOption?.value === option.value;

											return (
												<div
													key={option.value}
													className={`rounded-2xl border px-4 py-4 ${
														isCurrentPlayersLane
															? `${option.cardClass} shadow-sm`
															: ""
													}`}
												>
													<p
														className={`text-sm font-semibold ${option.accentClass}`}
													>
														{option.shortLabel}
													</p>
													<p className="mt-1 text-xs text-muted-foreground">
														{option.label}
													</p>
													<p className="mt-3 text-2xl font-bold">
														{group?.playerIds.length ?? 0}
													</p>
													<p className="mt-1 text-xs text-muted-foreground">
														{group?.points
															? `+${group.points} each in this cluster`
															: "No shared score here"}
													</p>
													{playersInLane.length > 0 && (
														<div className="mt-3 flex flex-wrap gap-2">
															{playersInLane.map((player) => (
																<span
																	key={`${option.value}-${player.id}`}
																	className={`rounded-full px-2.5 py-1 text-xs ${
																		player.id === multiplayer.playerId
																			? "bg-primary text-primary-foreground"
																			: "bg-accent"
																	}`}
																>
																	{player.name}
																</span>
															))}
														</div>
													)}
												</div>
											);
										})}
									</div>

									{multiplayer.isHost && !isFinished && (
										<Button
											className="w-full sm:w-auto"
											onClick={multiplayer.nextRound}
										>
											{gameState.roundNumber >= gameState.settings.rounds
												? "Finish Match"
												: "Next Round"}
										</Button>
									)}
								</div>
							)}
						</CardContent>
					</Card>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Leaderboard</CardTitle>
								<CardDescription>
									Shared opinions score. Solo picks do not.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{leaderboard.map((player, index) => {
									const revealedPosition = revealedVotesByPlayer.get(player.id);
									const positionLabel = POSITION_OPTIONS.find(
										(option) => option.value === revealedPosition,
									)?.shortLabel;

									return (
										<div
											key={player.id}
											className="flex items-center justify-between rounded-2xl border px-4 py-3"
										>
											<div>
												<p className="font-medium">
													{index + 1}. {player.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{player.id === multiplayer.playerId
														? "You"
														: player.id === gameState.hostId
															? "Host"
															: "Player"}
													{positionLabel && (isReveal || isFinished)
														? ` • ${positionLabel}`
														: ""}
												</p>
											</div>
											<div className="text-right">
												<p className="text-lg font-bold">{player.score}</p>
												<p className="text-xs text-muted-foreground">pts</p>
											</div>
										</div>
									);
								})}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Round Status</CardTitle>
								<CardDescription>
									Keep pressure visible while the room decides.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3 text-sm text-muted-foreground">
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">Round</p>
									<p className="mt-1">
										{gameState.roundNumber} / {gameState.settings.rounds}
									</p>
								</div>
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">Timer</p>
									<p className="mt-1">
										{isVoting
											? `${timeRemaining}s left`
											: `${gameState.settings.roundTimeLimit}s per round`}
									</p>
								</div>
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">Prompt Pack</p>
									<p className="mt-1 capitalize">
										{gameState.settings.promptPack}
									</p>
								</div>
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">Submissions</p>
									<p className="mt-1">
										{submittedCount} / {playerList.length}
									</p>
								</div>
								{message && (
									<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm text-foreground">
										{message}
									</div>
								)}
								{multiplayer.connectionStatus === "connecting" && (
									<div className="inline-flex items-center gap-2 text-sm">
										<Loader2 className="h-4 w-4 animate-spin" />
										Connecting...
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		);
	}

	return null;
}
