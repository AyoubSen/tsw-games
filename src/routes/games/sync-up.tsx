import { createFileRoute } from "@tanstack/react-router";
import { useMultiplayerSession } from "@/lib/multiplayerSession"
import { Loader2, Sparkles, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge";
import { SyncUpGame } from "@/components/games/sync-up/SyncUpGame";
import { useMultiplayerSyncUp } from "@/components/games/sync-up/useMultiplayerSyncUp";
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
import type { SyncUpPromptPack } from "@/lib/syncUpPrompts";
import type { SyncUpSettings } from "../../../party/sync-up";

export const Route = createFileRoute("/games/sync-up")({
	validateSearch: parseInviteSearch,
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
	const { room: invitedRoomCode, night } = Route.useSearch();
	const isGameNightMode = Boolean(night);
	const [view, setView] = useState<SyncUpView>("setup");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "");
	const [rounds, setRounds] = useState(5);
	const [roundTimeLimit, setRoundTimeLimit] = useState(45);
	const [promptPack, setPromptPack] = useState<SyncUpPromptPack>("mixed");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	useEffect(() => {
		if (invitedRoomCode) setJoinRoomCode(invitedRoomCode);
	}, [invitedRoomCode]);

	const multiplayer = useMultiplayerSyncUp();

	// Walk back into the room this tab was in before a reload.
	const session = useMultiplayerSession({
		game: "sync-up",
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
		gameId: "sync-up",
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

		const settings: SyncUpSettings = {
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
									Lock in an answer only you can see. Change it until time runs out or everyone is in.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">3. Reveal</p>
								<p className="mt-1">
									Matching answers pile up and bigger piles score more. The host can merge close calls before points land.
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
				subtitle={`Room ${displayedRoomCode}`}
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
				roomCode={displayedRoomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleBack}
				canStart={presentPlayerCount >= 2}
				isHost={multiplayer.isHost}
				message={message}
			/>
		);
	}

	if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
		return (
			<SyncUpGame
				state={multiplayer.gameState}
				playerId={multiplayer.playerId}
				isHost={multiplayer.isHost}
				roomLabel={displayedRoomCode}
				connected={multiplayer.connectionStatus === "connected"}
				error={multiplayer.error}
				myAnswer={multiplayer.myAnswer}
				reactions={multiplayer.reactions}
				onReact={multiplayer.react}
				onSubmit={multiplayer.submitAnswer}
				onMerge={multiplayer.mergeGroups}
				onSkipMerge={multiplayer.skipMerge}
				onNextRound={multiplayer.nextRound}
				onRestart={multiplayer.restartGame}
				onLeave={handleBack}
			/>
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
