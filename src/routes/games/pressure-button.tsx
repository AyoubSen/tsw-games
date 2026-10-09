import { createFileRoute } from "@tanstack/react-router";
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import { Timer, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge";
import { PressureButtonGame } from "@/components/games/pressure-button/PressureButtonGame";
import { useMultiplayerPressureButton } from "@/components/games/pressure-button/useMultiplayerPressureButton";
import {
	GameTopBar,
	MultiplayerLobby,
	MultiplayerSetupCard,
} from "@/components/multiplayer/shared";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks";
import type { PressurePromptPack } from "@/lib/pressurePrompts";
import { PASSES_PER_GAME, POINTS, type PressureButtonSettings } from "../../../party/pressure-button";

export const Route = createFileRoute("/games/pressure-button")({
	validateSearch: parseInviteSearch,
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
	const { room: invitedRoomCode, night } = Route.useSearch();
	const isGameNightMode = Boolean(night);
	const [view, setView] = useState<PressureButtonView>("setup");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "");
	const [turns, setTurns] = useState(8);
	const [answerTimeLimit, setAnswerTimeLimit] = useState(20);
	const [promptPack, setPromptPack] = useState<PressurePromptPack>("mixed");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	useEffect(() => {
		if (invitedRoomCode) setJoinRoomCode(invitedRoomCode);
	}, [invitedRoomCode]);

	const multiplayer = useMultiplayerPressureButton();

	// Walk back into the room this tab was in before a reload.
	const session = useMultiplayerSession({
		game: "pressure-button",
		joinGame: multiplayer.joinGame,
		hasGameState: Boolean(
			multiplayer.gameState &&
				multiplayer.playerId &&
				multiplayer.gameState.players[multiplayer.playerId],
		),
		error: multiplayer.error,
		connectionStatus: multiplayer.connectionStatus,
		inviteRoomCode: invitedRoomCode,
		onAbandon: multiplayer.abandonReconnect,
		disabled: isGameNightMode,
	});
	const gameNightBridge = useGameNightGameBridge({
		gameId: "pressure-button",
		hasGameState: Boolean(multiplayer.gameState && multiplayer.playerId),
		finished: multiplayer.gameState?.status === "finished",
		connectHost: (roomId, name) => multiplayer.createGame(name, { turns, answerTimeLimit, promptPack }, roomId),
		connectPlayer: multiplayer.joinGame,
	});
	const displayedRoomCode = gameNightBridge.isGameNight
		? gameNightBridge.publicRoomCode
		: multiplayer.gameState?.roomCode ?? "";

	useEffect(() => {
		if (multiplayer.connectionStatus === "connected" && multiplayer.gameState) {
			setView(multiplayer.gameState.status === "waiting" ? "lobby" : "game");
		}
	}, [multiplayer.connectionStatus, multiplayer.gameState]);

	useEffect(() => {
		// An unrequested resume that failed is not the player's problem.
		if (session.isSuppressingErrors()) return;
		if (multiplayer.error) {
			setMessage(multiplayer.error);
		}
	}, [multiplayer.error]);

	const gameState = multiplayer.gameState;
	const playerList = useMemo(
		() =>
			Object.values(gameState?.players ?? {}).sort(
				(left, right) => left.joinedAt - right.joinedAt,
			),
		[gameState],
	);
	const handleBack = () => {
		session.forget();
		multiplayer.disconnect();

		setView("setup");
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

		const createdRoom = multiplayer.createGame(playerName.trim(), settings);
		session.remember(createdRoom, playerName.trim());
		setMessage(null);
	};

	const handleJoinGame = () => {
		if (!playerName.trim() || !joinRoomCode.trim()) {
			setMessage("Enter your name and a room code.");
			return;
		}

		multiplayer.joinGame(joinRoomCode.trim(), playerName.trim());
		session.remember((joinRoomCode.trim()).toUpperCase(), playerName.trim());
		setMessage(null);
	};

	const handleCopyRoomCode = async () => {
		if (!gameState) {
			return;
		}

		try {
			await navigator.clipboard.writeText(gameNightBridge.isGameNight
				? getGameNightInviteLink(displayedRoomCode)
				: getInviteLink(gameState.roomCode));
			setCopiedRoomCode(true);
			window.setTimeout(() => setCopiedRoomCode(false), 1600);
		} catch {
			setMessage("Could not copy the invite link.");
		}
	};

	if (isGameNightMode && !gameState) {
		return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Connecting to Game Night...</div>;
	}

	if (session.isResuming && view === "setup") {
		return (
			<div className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background">
				<p className="text-muted-foreground">Rejoining your game…</p>
			</div>
		);
	}

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
						description="One player is in the hot seat each turn. They answer, pass, or throw the prompt at someone else — and the room judges every answer."
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
								Play it in person: answers are said out loud and the room
								decides whether they count.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">1. Hot Seat</p>
								<p className="mt-1">
									The hot seat rotates. Whoever has it gets an awkward prompt
									and three buttons: Answer, Pass or Pressure.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">2. Answer or Pressure</p>
								<p className="mt-1">
									Answer it yourself (+{POINTS.selfAccepted}, or {POINTS.selfFailed} if
									it's rejected or the clock runs out), or pressure another player
									into it. If they get accepted they take +{POINTS.pressuredAccepted};
									if they're rejected or time out, you take +{POINTS.pressureLanded}.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">3. Room Verdict</p>
								<p className="mt-1">
									The responder says it out loud (typing is optional), then everyone
									else votes Accept or Reject. No vote counts as Accept, and a tie is
									accepted.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">4. Pass</p>
								<p className="mt-1">
									Passing scores nothing, and you only get {PASSES_PER_GAME} passes per game.
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
				subtitle={`Room ${displayedRoomCode}`}
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
				roomCode={displayedRoomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleBack}
				canStart={playerList.filter((player) => player.connected !== false).length >= 2}
				isHost={multiplayer.isHost}
				message={message}
				startLabel="Start Pressure"
			/>
		);
	}

	if (view === "game" && gameState && multiplayer.playerId) {
		return (
			<PressureButtonGame
				state={gameState}
				playerId={multiplayer.playerId}
				isHost={multiplayer.isHost}
				roomLabel={displayedRoomCode}
				connected={multiplayer.connectionStatus === "connected"}
				error={multiplayer.error}
				reactions={multiplayer.reactions}
				onReact={multiplayer.react}
				onAnswer={multiplayer.chooseAnswer}
				onPass={multiplayer.choosePass}
				onPressure={multiplayer.choosePressure}
				onSubmit={multiplayer.submitAnswer}
				onVote={multiplayer.vote}
				onRestart={multiplayer.restartGame}
				onLeave={handleBack}
			/>
		);
	}

	return null;
}
