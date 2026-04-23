import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	Loader2,
	RotateCcw,
	Send,
	Sparkles,
	Timer,
	Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMultiplayerSyncUp } from "@/components/games/sync-up/useMultiplayerSyncUp";
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
import { Input } from "@/components/ui/input";
import type { SyncUpPromptPack } from "@/lib/syncUpPrompts";
import type { SyncUpSettings } from "../../../party/sync-up";

export const Route = createFileRoute("/games/sync-up")({
	component: SyncUpPage,
});

type SyncUpView = "setup" | "lobby" | "game";

const ROUND_OPTIONS = [3, 5, 7, 10];
const ROUND_TIME_OPTIONS = [25, 35, 45, 60];
const PROMPT_PACK_OPTIONS: Array<{
	value: SyncUpPromptPack;
	label: string;
	description: string;
}> = [
	{ value: "mixed", label: "Mixed", description: "A little bit of everything" },
	{ value: "chaos", label: "Chaos", description: "Weirder, louder prompts" },
	{ value: "cozy", label: "Cozy", description: "Easy social warmups" },
	{ value: "food", label: "Food", description: "Snacks, drinks, cravings" },
	{ value: "travel", label: "Travel", description: "Trips and awkward places" },
	{
		value: "social",
		label: "Social",
		description: "Parties, excuses, group life",
	},
];

function SyncUpPage() {
	const [view, setView] = useState<SyncUpView>("setup");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [rounds, setRounds] = useState(5);
	const [roundTimeLimit, setRoundTimeLimit] = useState(45);
	const [promptPack, setPromptPack] = useState<SyncUpPromptPack>("mixed");
	const [answer, setAnswer] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);
	const [now, setNow] = useState(Date.now());

	const multiplayer = useMultiplayerSyncUp();
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
		if (multiplayer.gameState?.status !== "submitting") {
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

		setAnswer("");
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
		multiplayer.gameState?.status === "submitting" &&
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
		setAnswer("");
		setMessage(null);
	};

	const handleCreateGame = () => {
		if (!playerName.trim()) {
			setMessage("Enter your name first.");
			return;
		}

		const settings: SyncUpSettings = {
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

	const handleSubmitAnswer = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!answer.trim()) {
			setMessage("Type an answer first.");
			return;
		}

		multiplayer.submitAnswer(answer.trim());
		setMessage(null);
	};

	if (view === "setup") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Sync Up"
					subtitle="Think like your friends, score when answers match"
				/>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr]">
					<MultiplayerSetupCard
						title="Create Room"
						description="Generate social prompts from reusable packs, then reveal who thought alike."
						icon={<Sparkles className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Sync Up Room"
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
								Answer Time
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
								Every round is about matching the group, not being correct.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">1. Prompt</p>
								<p className="mt-1">
									Everyone sees the same broad social prompt.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">
									2. Secret Answer
								</p>
								<p className="mt-1">
									Answers stay hidden until everyone submits or time runs out.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">3. Reveal</p>
								<p className="mt-1">
									Exact matches group together. Bigger groups score more.
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
				title="Sync Up Lobby"
				subtitle={`Room ${multiplayer.gameState.roomCode}`}
				onBack={handleBack}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. The host controls when the match starts."
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
			/>
		);
	}

	if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
		const isSubmitting = multiplayer.gameState.status === "submitting";
		const isReveal = multiplayer.gameState.status === "reveal";
		const isFinished = multiplayer.gameState.status === "finished";

		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Sync Up"
					subtitle={`Round ${multiplayer.gameState.roundNumber} / ${multiplayer.gameState.settings.rounds}`}
					onBack={handleBack}
					rightAction={
						<Button
							variant="ghost"
							size="sm"
							onClick={multiplayer.restartGame}
							disabled={!multiplayer.isHost}
						>
							<RotateCcw className="w-4 h-4 mr-1" />
							Rematch
						</Button>
					}
				/>

				<div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.45fr_0.9fr]">
					<Card className="overflow-hidden">
						<CardHeader className="border-b">
							<div className="flex items-start justify-between gap-4">
								<div>
									<CardTitle>Prompt</CardTitle>
									<CardDescription>
										Submit what you think the group is most likely to match.
									</CardDescription>
								</div>
								<div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
									{multiplayer.gameState.settings.promptPack}
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6 pt-6">
							{isFinished && (
								<div className="rounded-2xl border bg-primary/8 px-4 py-4">
									<p className="flex items-center gap-2 text-sm font-semibold">
										<Trophy className="h-4 w-4" />
										{winners.length > 1
											? `Tie between ${winners.map((player) => player.name).join(", ")}.`
											: winners[0]
												? `${winners[0].name} wins the match.`
												: "Match finished."}
									</p>
								</div>
							)}

							<div className="rounded-3xl border bg-gradient-to-br from-cyan-500/15 via-primary/10 to-amber-500/15 p-6 text-center">
								<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Think alike
								</p>
								<p className="mt-3 text-2xl font-black md:text-3xl">
									{multiplayer.gameState.prompt?.text ??
										"Waiting for prompt..."}
								</p>
							</div>

							<div className="grid gap-3 sm:grid-cols-3">
								<div className="rounded-2xl border bg-card px-4 py-3">
									<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<Timer className="h-4 w-4" />
										Time Left
									</p>
									<p className="mt-2 text-3xl font-black tabular-nums">
										{isSubmitting ? `${timeRemaining}s` : "0s"}
									</p>
								</div>
								<div className="rounded-2xl border bg-card px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Submitted
									</p>
									<p className="mt-2 text-3xl font-black">
										{submittedCount}/{playerList.length}
									</p>
								</div>
								<div className="rounded-2xl border bg-card px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Scoring
									</p>
									<p className="mt-2 text-sm font-semibold">
										Group size points
									</p>
								</div>
							</div>

							<form className="space-y-3" onSubmit={handleSubmitAnswer}>
								<Input
									value={answer}
									onChange={(event) =>
										setAnswer(event.target.value.slice(0, 40))
									}
									placeholder="Type your answer"
									className="h-12 text-center text-lg font-semibold"
									autoCapitalize="none"
									autoCorrect="off"
									disabled={!isSubmitting || currentPlayerSubmitted}
								/>
								<div className="flex flex-wrap gap-3">
									<Button
										type="submit"
										disabled={!isSubmitting || currentPlayerSubmitted}
									>
										{currentPlayerSubmitted ? (
											<>
												<Check className="mr-2 h-4 w-4" />
												Submitted
											</>
										) : (
											<>
												<Send className="mr-2 h-4 w-4" />
												Submit Answer
											</>
										)}
									</Button>
									{isReveal && (
										<Button
											type="button"
											onClick={multiplayer.nextRound}
											disabled={!multiplayer.isHost}
										>
											{multiplayer.gameState.roundNumber >=
											multiplayer.gameState.settings.rounds
												? "Finish Match"
												: "Next Round"}
										</Button>
									)}
								</div>
							</form>

							{message && (
								<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
									{message}
								</div>
							)}

							{isSubmitting && (
								<div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
									Answers are hidden until everyone submits or the timer ends.
								</div>
							)}

							{(isReveal || isFinished) && (
								<div className="space-y-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Reveal
									</p>
									{multiplayer.gameState.answerGroups.length > 0 ? (
										multiplayer.gameState.answerGroups.map((group) => (
											<div
												key={group.normalized}
												className="rounded-2xl border p-4"
											>
												<div className="flex items-center justify-between gap-3">
													<p className="font-semibold">
														{group.answers.length} matched
													</p>
													<span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
														+{group.points}
													</span>
												</div>
												<div className="mt-3 flex flex-wrap gap-2">
													{group.answers.map((groupAnswer) => (
														<span
															key={groupAnswer.playerId}
															className="rounded-full bg-accent px-3 py-1 text-sm"
														>
															{groupAnswer.text} ·{" "}
															{multiplayer.gameState?.players[
																groupAnswer.playerId
															]?.name ?? "?"}
														</span>
													))}
												</div>
											</div>
										))
									) : (
										<div className="rounded-2xl border p-4 text-sm text-muted-foreground">
											No answers submitted this round.
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Players</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{playerList.map((player) => {
									const submitted =
										multiplayer.gameState?.submittedPlayerIds.includes(
											player.id,
										) ?? false;

									return (
										<div
											key={player.id}
											className="flex items-center justify-between rounded-2xl border px-4 py-3"
										>
											<div>
												<p className="font-medium">{player.name}</p>
												<p className="text-xs text-muted-foreground">
													{isSubmitting
														? submitted
															? "Submitted"
															: "Thinking..."
														: `${player.score} points`}
												</p>
											</div>
											{submitted && isSubmitting && (
												<Check className="h-4 w-4 text-emerald-500" />
											)}
										</div>
									);
								})}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Leaderboard</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{leaderboard.map((player, index) => (
									<div
										key={player.id}
										className="flex items-center justify-between rounded-2xl border px-4 py-3"
									>
										<div className="flex items-center gap-3">
											<span className="text-sm font-semibold text-muted-foreground">
												#{index + 1}
											</span>
											<p className="font-medium">{player.name}</p>
										</div>
										<p className="text-xl font-black">{player.score}</p>
									</div>
								))}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center">
			<div className="text-center">
				<Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
				<p className="mt-3 text-muted-foreground">Loading Sync Up...</p>
			</div>
		</div>
	);
}
