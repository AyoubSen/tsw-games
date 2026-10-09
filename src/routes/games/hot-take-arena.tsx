import { createFileRoute } from "@tanstack/react-router";
import { GameRouteError } from "@/components/GameErrorBoundary";
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import { Timer, Vote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HotTakeGame } from "@/components/games/hot-take-arena/HotTakeGame";
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge";
import { useMultiplayerHotTakeArena } from "@/components/games/hot-take-arena/useMultiplayerHotTakeArena";
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
import type { HotTakePack } from "@/lib/hotTakePrompts";
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks";
import type { HotTakeSettings } from "../../../party/hot-take-arena";

export const Route = createFileRoute("/games/hot-take-arena")({
	validateSearch: parseInviteSearch,
	component: HotTakeArenaPage,
	errorComponent: GameRouteError,
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

function HotTakeArenaPage() {
	const { room: invitedRoomCode, night } = Route.useSearch();
	const isGameNightMode = Boolean(night);
	const [view, setView] = useState<HotTakeArenaView>("setup");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "");
	const [rounds, setRounds] = useState(5);
	const [roundTimeLimit, setRoundTimeLimit] = useState(30);
	const [promptPack, setPromptPack] = useState<HotTakePack>("mixed");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	useEffect(() => {
		if (invitedRoomCode) setJoinRoomCode(invitedRoomCode);
	}, [invitedRoomCode]);

	const multiplayer = useMultiplayerHotTakeArena();

	// Walk back into the room this tab was in before a reload.
	const session = useMultiplayerSession({
		game: "hot-take-arena",
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
		gameId: "hot-take-arena",
		hasGameState: Boolean(multiplayer.gameState && multiplayer.playerId),
		finished: multiplayer.gameState?.status === "finished",
		connectHost: (roomId, name) => multiplayer.createGame(name, { rounds, roundTimeLimit, promptPack }, roomId),
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

	const playerList = useMemo(
		() =>
			Object.values(multiplayer.gameState?.players ?? {}).sort(
				(left, right) => left.joinedAt - right.joinedAt,
			),
		[multiplayer.gameState],
	);
	const presentPlayerCount = playerList.filter(
		(player) => player.connected !== false,
	).length;

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

		const settings: HotTakeSettings = {
			rounds,
			roundTimeLimit,
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
		if (!multiplayer.gameState) {
			return;
		}

		try {
			await navigator.clipboard.writeText(gameNightBridge.isGameNight
				? getGameNightInviteLink(displayedRoomCode)
				: getInviteLink(multiplayer.gameState.roomCode));
			setCopiedRoomCode(true);
			window.setTimeout(() => setCopiedRoomCode(false), 1600);
		} catch {
			setMessage("Could not copy the invite link.");
		}
	};

	if (isGameNightMode && !multiplayer.gameState) {
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
				subtitle={`Room ${displayedRoomCode}`}
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
				roomCode={displayedRoomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleBack}
				canStart={presentPlayerCount >= 2}
				isHost={multiplayer.isHost}
				message={message}
				startLabel="Start Arena"
			/>
		);
	}

	if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
		return (
			<HotTakeGame
				state={multiplayer.gameState}
				playerId={multiplayer.playerId}
				isHost={multiplayer.isHost}
				roomLabel={displayedRoomCode}
				connected={multiplayer.connectionStatus === "connected"}
				error={multiplayer.error}
				reactions={multiplayer.reactions}
				onReact={multiplayer.react}
				onVote={multiplayer.submitVote}
				onSkipSpotlight={multiplayer.skipSpotlight}
				onNextRound={multiplayer.nextRound}
				onRestart={multiplayer.restartGame}
				onLeave={handleBack}
			/>
		);
	}

	return null;
}
