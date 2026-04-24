import { createFileRoute } from "@tanstack/react-router";
import {
	Loader2,
	RotateCcw,
	Send,
	Timer,
	TriangleAlert,
	Trophy,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMultiplayerPressureButton } from "@/components/games/pressure-button/useMultiplayerPressureButton";
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
import type { PressurePromptPack } from "@/lib/pressurePrompts";
import type { PressureButtonSettings } from "../../../party/pressure-button";

export const Route = createFileRoute("/games/pressure-button")({
	component: PressureButtonPage,
});

type PressureButtonView = "setup" | "lobby" | "game";

const TURN_OPTIONS = [4, 6, 8, 10, 12];
const ANSWER_TIME_OPTIONS = [15, 20, 30, 45];
const PROMPT_PACK_OPTIONS: Array<{
	value: PressurePromptPack;
	label: string;
	description: string;
}> = [
	{
		value: "mixed",
		label: "Mixed",
		description: "Best overall mix of awkward pressure",
	},
	{
		value: "awkward",
		label: "Awkward",
		description: "Excuses, bad catches, instant embarrassment",
	},
	{
		value: "exposed",
		label: "Exposed",
		description: "Suspicious, guilty-looking, risky messages",
	},
	{
		value: "panic",
		label: "Panic",
		description: "Bad answers under maximum pressure",
	},
	{
		value: "dating",
		label: "Dating",
		description: "Flirty disasters and red-flag admissions",
	},
	{
		value: "chaos",
		label: "Chaos",
		description: "Petty, cursed, unserious nonsense",
	},
];

function PressureButtonPage() {
	const [view, setView] = useState<PressureButtonView>("setup");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [turns, setTurns] = useState(8);
	const [answerTimeLimit, setAnswerTimeLimit] = useState(20);
	const [promptPack, setPromptPack] = useState<PressurePromptPack>("mixed");
	const [answer, setAnswer] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);
	const [now, setNow] = useState(Date.now());

	const multiplayer = useMultiplayerPressureButton();
	const activeTurnNumber = multiplayer.gameState?.turnNumber;

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
		if (multiplayer.gameState?.status !== "answering") {
			return;
		}

		setNow(Date.now());
		const timer = window.setInterval(() => {
			setNow(Date.now());
		}, 250);

		return () => window.clearInterval(timer);
	}, [multiplayer.gameState?.status]);

	useEffect(() => {
		if (activeTurnNumber === undefined) {
			return;
		}

		setAnswer("");
		setMessage(null);
	}, [activeTurnNumber]);

	const gameState = multiplayer.gameState;
	const playerList = useMemo(
		() =>
			Object.values(gameState?.players ?? {}).sort(
				(left, right) => left.joinedAt - right.joinedAt,
			),
		[gameState],
	);
	const leaderboard = useMemo(
		() =>
			Object.values(gameState?.players ?? {}).sort((left, right) => {
				if (right.score !== left.score) {
					return right.score - left.score;
				}

				return left.joinedAt - right.joinedAt;
			}),
		[gameState],
	);
	const timeRemaining =
		gameState?.status === "answering" && gameState.turnStartedAt
			? Math.max(
					0,
					gameState.settings.answerTimeLimit -
						Math.floor((now - gameState.turnStartedAt) / 1000),
				)
			: 0;
	const activePlayer = gameState?.activePlayerId
		? gameState.players[gameState.activePlayerId]
		: null;
	const responder = gameState?.responderId
		? gameState.players[gameState.responderId]
		: null;
	const pressuredBy = gameState?.pressuredByPlayerId
		? gameState.players[gameState.pressuredByPlayerId]
		: null;
	const currentPlayer = multiplayer.playerId
		? gameState?.players[multiplayer.playerId]
		: null;
	const topScore = Math.max(...leaderboard.map((player) => player.score), 0);
	const winners =
		gameState?.status === "finished"
			? leaderboard.filter((player) => player.score === topScore)
			: [];
	const isCurrentPlayerActive =
		multiplayer.playerId === gameState?.activePlayerId;
	const isCurrentPlayerResponder =
		multiplayer.playerId === gameState?.responderId;

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

		const settings: PressureButtonSettings = {
			turns,
			answerTimeLimit,
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
		if (!gameState) {
			return;
		}

		try {
			await navigator.clipboard.writeText(gameState.roomCode);
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
					title="Pressure Button"
					subtitle="Awkward prompts, exposed answers, and bad decisions under pressure"
				/>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr]">
					<MultiplayerSetupCard
						title="Create Room"
						description="One player is on the clock each turn. They can answer, dodge, or throw an awkward prompt at someone else."
						icon={<Zap className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Pressure Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinGame}
						onCreate={handleCreateGame}
						message={message}
					>
						<div className="space-y-2">
							<p className="text-sm font-medium">Turns</p>
							<div className="grid grid-cols-5 gap-2">
								{TURN_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setTurns(option)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											turns === option
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
								{ANSWER_TIME_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setAnswerTimeLimit(option)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											answerTimeLimit === option
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
								The pressure comes from awkward prompts that are easy to
								understand and annoying to answer well.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">1. Hot Seat</p>
								<p className="mt-1">
									One player gets an awkward, exposing, or panic-heavy prompt.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">2. Choose</p>
								<p className="mt-1">
									Answer for safe points, pass for nothing, or pressure someone
									else into taking it.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">3. Risk</p>
								<p className="mt-1">
									A pressured player scores bigger if they answer. If they panic
									or blank, the pressure move pays off.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (view === "lobby" && gameState && multiplayer.playerId) {
		return (
			<MultiplayerLobby
				title="Pressure Button Lobby"
				subtitle={`Room ${gameState.roomCode}`}
				onBack={handleBack}
				players={playerList}
				hostId={gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. The hot seat rotates through the room."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Turns:{" "}
							<span className="font-medium text-foreground">
								{gameState.settings.turns}
							</span>
						</p>
						<p className="mt-1">
							Time:{" "}
							<span className="font-medium text-foreground">
								{gameState.settings.answerTimeLimit}s
							</span>
						</p>
						<p className="mt-1">
							Pack:{" "}
							<span className="font-medium capitalize text-foreground">
								{gameState.settings.promptPack}
							</span>
						</p>
					</div>
				}
				roomCode={gameState.roomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleBack}
				canStart={playerList.length >= 2}
				isHost={multiplayer.isHost}
				message={message}
				startLabel="Start Pressure"
			/>
		);
	}

	if (view === "game" && gameState && multiplayer.playerId) {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Pressure Button"
					subtitle={`Turn ${gameState.turnNumber} / ${gameState.settings.turns}`}
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
									<CardTitle>Prompt</CardTitle>
									<CardDescription>
										Decide whether to own the turn or make someone else sweat.
									</CardDescription>
								</div>
								<div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
									{gameState.settings.promptPack}
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6 pt-6">
							{gameState.status === "finished" && (
								<div className="rounded-2xl border bg-primary/8 px-4 py-4">
									<p className="flex items-center gap-2 text-sm font-semibold">
										<Trophy className="h-4 w-4" />
										{winners.length > 1
											? `Tie game: ${winners.map((winner) => winner.name).join(", ")}`
											: winners[0]
												? `${winners[0].name} wins under pressure`
												: "Match complete"}
									</p>
								</div>
							)}

							<div className="rounded-3xl border bg-accent/40 px-5 py-6">
								<div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									<span>Hot Seat</span>
									{activePlayer && (
										<span className="rounded-full bg-background px-2 py-1 text-foreground">
											{activePlayer.name}
										</span>
									)}
									{responder && responder.id !== activePlayer?.id && (
										<>
											<span>Responder</span>
											<span className="rounded-full bg-background px-2 py-1 text-foreground">
												{responder.name}
											</span>
										</>
									)}
								</div>
								<p className="mt-4 text-2xl font-semibold leading-snug md:text-3xl">
									{gameState.prompt?.text}
								</p>
							</div>

							{gameState.status === "decision" && (
								<div className="space-y-4">
									<div className="rounded-2xl border px-4 py-4 text-sm text-muted-foreground">
										{isCurrentPlayerActive
											? "This is your turn. Answer it, skip it, or pressure someone else."
											: `${activePlayer?.name ?? "Someone"} is deciding what to do with this prompt.`}
									</div>

									{isCurrentPlayerActive && (
										<div className="grid gap-3 md:grid-cols-[1fr_1fr]">
											<div className="grid gap-3">
												<Button
													className="h-auto justify-start rounded-2xl px-4 py-4"
													onClick={multiplayer.chooseAnswer}
												>
													<div className="text-left">
														<p className="font-semibold">Answer</p>
														<p className="text-xs font-normal opacity-80">
															Take the prompt yourself for +2 if you answer.
														</p>
													</div>
												</Button>
												<Button
													className="h-auto justify-start rounded-2xl px-4 py-4"
													variant="outline"
													onClick={multiplayer.choosePass}
												>
													<div className="text-left">
														<p className="font-semibold">Pass</p>
														<p className="text-xs font-normal opacity-80">
															Skip the turn and give up any points.
														</p>
													</div>
												</Button>
											</div>
											<div className="rounded-2xl border p-4">
												<p className="text-sm font-semibold">
													Pressure Someone
												</p>
												<p className="mt-1 text-xs text-muted-foreground">
													If they answer, they get +3. If they time out, you get
													+2.
												</p>
												<div className="mt-4 grid gap-2 sm:grid-cols-2">
													{playerList
														.filter(
															(player) => player.id !== multiplayer.playerId,
														)
														.map((player) => (
															<Button
																key={player.id}
																variant="outline"
																className="justify-start"
																onClick={() =>
																	multiplayer.choosePressure(player.id)
																}
															>
																<TriangleAlert className="mr-2 h-4 w-4" />
																{player.name}
															</Button>
														))}
												</div>
											</div>
										</div>
									)}
								</div>
							)}

							{gameState.status === "answering" && (
								<div className="space-y-4">
									<div className="flex items-center justify-between rounded-2xl border px-4 py-4 text-sm">
										<div>
											<p className="font-semibold text-foreground">
												{pressuredBy
													? `${pressuredBy.name} pressured ${responder?.name ?? "someone"}`
													: `${responder?.name ?? "Someone"} is answering`}
											</p>
											<p className="mt-1 text-muted-foreground">
												{pressuredBy
													? "The pressured player gets bigger points if they pull it off."
													: "Safe route, but the timer is live."}
											</p>
										</div>
										<div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
											{timeRemaining}s
										</div>
									</div>

									{isCurrentPlayerResponder ? (
										<form className="space-y-3" onSubmit={handleSubmitAnswer}>
											<Input
												value={answer}
												onChange={(event) => setAnswer(event.target.value)}
												placeholder="Type your answer fast"
												maxLength={120}
											/>
											<Button type="submit">
												<Send className="mr-2 h-4 w-4" />
												Lock Answer
											</Button>
										</form>
									) : (
										<div className="rounded-2xl border px-4 py-4 text-sm text-muted-foreground">
											{responder?.name ?? "Someone"} is on the clock. The rest
											of the room just watches the pressure build.
										</div>
									)}
								</div>
							)}

							{(gameState.status === "reveal" ||
								gameState.status === "finished") &&
								gameState.roundResult && (
									<div className="space-y-4">
										<div className="rounded-2xl border bg-accent/30 px-4 py-4">
											<p className="text-sm font-semibold text-foreground">
												Turn Result
											</p>
											<p className="mt-2 text-sm text-muted-foreground">
												{gameState.roundResult.outcome === "passed"
													? `${activePlayer?.name ?? "The active player"} passed and nobody scored.`
													: gameState.roundResult.outcome === "timed-out"
														? pressuredBy && responder
															? `${responder.name} ran out of time, so ${pressuredBy.name} takes +2 for the pressure call.`
															: `${responder?.name ?? "The responder"} ran out of time and the turn died there.`
														: gameState.roundResult.mode === "pressure" &&
																responder
															? `${responder.name} survived the pressure and answered for +3.`
															: `${responder?.name ?? "The responder"} answered cleanly for +2.`}
											</p>
											{gameState.currentAnswerText && (
												<div className="mt-3 rounded-xl bg-background px-4 py-3 text-sm text-foreground">
													{gameState.currentAnswerText}
												</div>
											)}
										</div>

										{multiplayer.isHost && gameState.status !== "finished" && (
											<Button
												className="w-full sm:w-auto"
												onClick={multiplayer.nextTurn}
											>
												{gameState.turnNumber >= gameState.settings.turns
													? "Finish Match"
													: "Next Turn"}
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
									Best pressure calls and clutch answers rise fast.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{leaderboard.map((player, index) => {
									const delta =
										gameState.roundResult?.scoreChanges[player.id] ?? 0;

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
													{delta > 0 ? ` • +${delta} this turn` : ""}
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
								<CardTitle>Status</CardTitle>
								<CardDescription>
									Keep the turn state readable for everyone.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3 text-sm text-muted-foreground">
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">Turn</p>
									<p className="mt-1">
										{gameState.turnNumber} / {gameState.settings.turns}
									</p>
								</div>
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">Current State</p>
									<p className="mt-1 capitalize">{gameState.status}</p>
								</div>
								<div className="rounded-2xl border px-4 py-3">
									<p className="font-medium text-foreground">You</p>
									<p className="mt-1">
										{isCurrentPlayerResponder
											? "On the clock"
											: isCurrentPlayerActive && gameState.status === "decision"
												? "Making the call"
												: (currentPlayer?.name ?? "Watching")}
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
