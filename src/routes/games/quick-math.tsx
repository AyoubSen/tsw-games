import { createFileRoute } from "@tanstack/react-router";
import { GameRouteError } from "@/components/GameErrorBoundary";
import { useMultiplayerSession } from "@/lib/multiplayerSession";
import { Clock3, ListOrdered, Play, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QuickMathGame } from "@/components/games/quick-math/QuickMathGame";
import { SPRINT_SECONDS, SoloSprint } from "@/components/games/quick-math/SoloSprint";
import { useMultiplayerQuickMath } from "@/components/games/quick-math/useMultiplayerQuickMath";
import { useGameNightGameBridge } from "@/components/game-night/useGameNightGameBridge";
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
import { getGameNightInviteLink, getInviteLink, parseInviteSearch } from "@/lib/inviteLinks";
import { QUICK_MATH_ROUND_OPTIONS, QUICK_MATH_TIME_OPTIONS } from "@/lib/quickMath";
import type { QuickMathSettings } from "../../../party/quick-math";

export const Route = createFileRoute("/games/quick-math")({
	validateSearch: parseInviteSearch,
	component: QuickMathPage,
	errorComponent: GameRouteError,
});

type QuickMathView = "select" | "solo" | "lobby" | "game";

const DEFAULT_SETTINGS: QuickMathSettings = { rounds: 10, questionTime: 12 };

function QuickMathPage() {
	const { room: invitedRoomCode } = Route.useSearch();
	const [view, setView] = useState<QuickMathView>("select");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState(invitedRoomCode ?? "");
	const [rounds, setRounds] = useState(DEFAULT_SETTINGS.rounds);
	const [questionTime, setQuestionTime] = useState(DEFAULT_SETTINGS.questionTime);
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	useEffect(() => {
		if (invitedRoomCode) setJoinRoomCode(invitedRoomCode);
	}, [invitedRoomCode]);

	const multiplayer = useMultiplayerQuickMath();
	const hasGameState = Boolean(
		multiplayer.gameState &&
			multiplayer.playerId &&
			multiplayer.gameState.players[multiplayer.playerId],
	);
	const gameNight = useGameNightGameBridge({
		gameId: "quick-math",
		hasGameState,
		finished: multiplayer.gameState?.status === "finished",
		connectHost: (roomId, name) => { multiplayer.createGame(name, DEFAULT_SETTINGS, roomId); },
		connectPlayer: multiplayer.joinGame,
	});

	// Walk back into the room this tab was in before a reload.
	const session = useMultiplayerSession({
		game: "quick-math",
		joinGame: multiplayer.joinGame,
		hasGameState,
		error: multiplayer.error,
		connectionStatus: multiplayer.connectionStatus,
		inviteRoomCode: invitedRoomCode,
		onAbandon: multiplayer.abandonReconnect,
		disabled: gameNight.isGameNight,
	});
	const displayedRoomCode = gameNight.isGameNight
		? gameNight.publicRoomCode
		: multiplayer.gameState?.roomCode ?? "";

	useEffect(() => {
		if (multiplayer.connectionStatus === "connected" && multiplayer.gameState) {
			setView(multiplayer.gameState.status === "waiting" ? "lobby" : "game");
		}
	}, [multiplayer.connectionStatus, multiplayer.gameState]);

	useEffect(() => {
		// An unrequested resume that failed is not the player's problem.
		if (session.isSuppressingErrors()) return;
		if (multiplayer.error) setMessage(multiplayer.error);
	}, [multiplayer.error]);

	const playerList = useMemo(
		() =>
			Object.values(multiplayer.gameState?.players ?? {}).sort(
				(left, right) => left.joinedAt - right.joinedAt,
			),
		[multiplayer.gameState],
	);

	const handleBack = () => {
		session.forget();
		multiplayer.disconnect();
		setView("select");
		setMessage(null);
	};

	const handleCreateGame = () => {
		if (!playerName.trim()) {
			setMessage("Enter your name first.");
			return;
		}
		const createdRoom = multiplayer.createGame(playerName.trim(), { rounds, questionTime });
		session.remember(createdRoom, playerName.trim());
		setMessage(null);
	};

	const handleJoinGame = () => {
		if (!playerName.trim() || !joinRoomCode.trim()) {
			setMessage("Enter your name and a room code.");
			return;
		}
		multiplayer.joinGame(joinRoomCode.trim(), playerName.trim());
		session.remember(joinRoomCode.trim().toUpperCase(), playerName.trim());
		setMessage(null);
	};

	const handleCopyRoomCode = async () => {
		if (!multiplayer.gameState) return;
		try {
			await navigator.clipboard.writeText(gameNight.isGameNight
				? getGameNightInviteLink(displayedRoomCode)
				: getInviteLink(multiplayer.gameState.roomCode));
			setCopiedRoomCode(true);
			window.setTimeout(() => setCopiedRoomCode(false), 1600);
		} catch {
			setMessage("Could not copy the invite link.");
		}
	};

	if (gameNight.isConnecting) {
		return <div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">Connecting to Game Night...</div>;
	}

	if (session.isResuming && view === "select") {
		return (
			<div className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-background">
				<p className="text-muted-foreground">Rejoining your game…</p>
			</div>
		);
	}

	if (view === "select") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar title="Quick Math" subtitle="Rapid-fire arithmetic: the fastest correct answer takes the point" />

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2">
					<MultiplayerSetupCard
						title="Multiplayer"
						description="Everyone gets the same problem. First correct answer scores, one guess each, and the problems get harder as the match goes on."
						icon={<Users className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Quick Math Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinGame}
						onCreate={handleCreateGame}
						message={message}
					>
						<div className="space-y-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<ListOrdered className="h-4 w-4" />
								Questions
							</p>
							<div className="grid grid-cols-3 gap-2">
								{QUICK_MATH_ROUND_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setRounds(option)}
										className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
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
								<Clock3 className="h-4 w-4" />
								Time per Question
							</p>
							<div className="grid grid-cols-3 gap-2">
								{QUICK_MATH_TIME_OPTIONS.map((option) => (
									<button
										key={option}
										type="button"
										onClick={() => setQuestionTime(option)}
										className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											questionTime === option
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										{option}s
									</button>
								))}
							</div>
						</div>
					</MultiplayerSetupCard>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Play className="h-5 w-5 text-primary" />
								Solo Sprint
							</CardTitle>
							<CardDescription>
								{SPRINT_SECONDS} seconds against the clock. Problems ramp from warm-up sums to brutal mental math.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button className="w-full" variant="outline" onClick={() => setView("solo")}>
								Play Solo
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (view === "solo") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar title="Quick Math Sprint" subtitle="Beat the clock" onBack={() => setView("select")} />
				<div className="px-4 py-8">
					<SoloSprint />
				</div>
			</div>
		);
	}

	if (view === "lobby" && multiplayer.gameState && multiplayer.playerId) {
		return (
			<MultiplayerLobby
				title="Quick Math Lobby"
				subtitle={`Room ${displayedRoomCode}`}
				onBack={handleBack}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. First correct answer takes each point."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Questions:{" "}
							<span className="font-medium text-foreground">{multiplayer.gameState.settings.rounds}</span>
						</p>
						<p className="mt-1">
							Time:{" "}
							<span className="font-medium text-foreground">{multiplayer.gameState.settings.questionTime}s each</span>
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
				startLabel="Start Match"
			/>
		);
	}

	if (view === "game" && multiplayer.gameState && multiplayer.playerId) {
		return (
			<QuickMathGame
				state={multiplayer.gameState}
				phaseEndsAt={multiplayer.phaseEndsAt}
				playerId={multiplayer.playerId}
				isHost={multiplayer.isHost}
				roomLabel={displayedRoomCode}
				connected={multiplayer.connectionStatus === "connected"}
				error={multiplayer.error}
				reactions={multiplayer.reactions}
				onReact={multiplayer.react}
				onAnswer={multiplayer.submitAnswer}
				onRestart={multiplayer.restartGame}
				onLeave={handleBack}
			/>
		);
	}

	return null;
}
