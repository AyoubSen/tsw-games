import { createFileRoute } from "@tanstack/react-router";
import { Clock, Palette, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MultiplayerGame } from "@/components/games/drawing/MultiplayerGame";
import type { GameSettings } from "@/components/games/drawing/types";
import { useMultiplayerDrawing } from "@/components/games/drawing/useMultiplayerDrawing";
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

export const Route = createFileRoute("/games/drawing")({
	component: DrawingPage,
});

type GameView = "select" | "multiplayer-lobby" | "multiplayer-game";

const TIME_OPTIONS = [
	{ value: 30, label: "30s" },
	{ value: 60, label: "60s" },
	{ value: 90, label: "90s" },
	{ value: 120, label: "2min" },
];

const ROUNDS_OPTIONS = [
	{ value: 1, label: "1" },
	{ value: 2, label: "2" },
	{ value: 3, label: "3" },
];

function DrawingPage() {
	const [view, setView] = useState<GameView>("select");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [roundTimeLimit, setRoundTimeLimit] = useState(60);
	const [roundsPerPlayer, setRoundsPerPlayer] = useState(1);
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	const multiplayer = useMultiplayerDrawing();
	const multiplayerGameState = multiplayer.gameState;

	useEffect(() => {
		if (multiplayer.error) {
			setMessage(multiplayer.error);
		}
	}, [multiplayer.error]);

	useEffect(() => {
		if (multiplayer.connectionStatus === "connected" && multiplayerGameState) {
			if (multiplayerGameState.status === "waiting") {
				setView("multiplayer-lobby");
			} else if (
				multiplayerGameState.status === "playing" ||
				multiplayerGameState.status === "round-end" ||
				multiplayerGameState.status === "finished"
			) {
				setView("multiplayer-game");
			}
		}
	}, [multiplayer.connectionStatus, multiplayerGameState]);

	const playerList = useMemo(
		() =>
			Object.values(multiplayer.gameState?.players ?? {}).sort(
				(left, right) => left.joinedAt - right.joinedAt,
			),
		[multiplayer.gameState],
	);

	const handleCreateMultiplayer = () => {
		if (!playerName.trim()) {
			setMessage("Enter your name first.");
			return;
		}

		const settings: GameSettings = {
			roundTimeLimit,
			roundsPerPlayer,
		};

		multiplayer.createGame(playerName.trim(), settings);
		setMessage(null);
	};

	const handleJoinMultiplayer = () => {
		if (!playerName.trim() || !joinRoomCode.trim()) {
			setMessage("Enter your name and a room code.");
			return;
		}

		multiplayer.joinGame(joinRoomCode.trim(), playerName.trim());
		setMessage(null);
	};

	const handleLeaveMultiplayer = () => {
		multiplayer.disconnect();
		setView("select");
		setMessage(null);
	};

	const handleBackToSelect = () => {
		if (multiplayer.connectionStatus !== "disconnected") {
			multiplayer.disconnect();
		}
		setView("select");
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

	if (view === "select") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Drawing Game"
					subtitle="Draw, guess, and rotate who gets the canvas"
				/>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr]">
					<MultiplayerSetupCard
						title="Multiplayer"
						description="One player draws while everyone else tries to guess the secret word."
						icon={<Palette className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Drawing Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinMultiplayer}
						onCreate={handleCreateMultiplayer}
						message={message}
					>
						<div className="space-y-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<Clock className="h-4 w-4" />
								Time per Round
							</p>
							<div className="grid grid-cols-4 gap-2">
								{TIME_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setRoundTimeLimit(option.value)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											roundTimeLimit === option.value
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						</div>

						<div className="space-y-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<RotateCcw className="h-4 w-4" />
								Rounds per Player
							</p>
							<div className="grid grid-cols-3 gap-2">
								{ROUNDS_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setRoundsPerPlayer(option.value)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											roundsPerPlayer === option.value
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
							<p className="text-xs text-muted-foreground">
								Each player draws {roundsPerPlayer} time
								{roundsPerPlayer > 1 ? "s" : ""}.
							</p>
						</div>
					</MultiplayerSetupCard>

					<Card>
						<CardHeader>
							<CardTitle>How It Plays</CardTitle>
							<CardDescription>
								Quick teamless drawing rounds with rotating drawers.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">
									1. One player draws
								</p>
								<p className="mt-1">
									The active drawer sees the word and sketches it live.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">2. Others guess</p>
								<p className="mt-1">
									Guesses stream in as chat while the timer keeps everyone
									moving.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">3. Rotate roles</p>
								<p className="mt-1">
									Everyone gets turns on the canvas, then scores decide the
									winner.
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (
		view === "multiplayer-lobby" &&
		multiplayer.gameState &&
		multiplayer.playerId
	) {
		return (
			<MultiplayerLobby
				title="Drawing Lobby"
				subtitle={`Room ${multiplayer.gameState.roomCode}`}
				onBack={handleBackToSelect}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. Everyone will rotate through drawing turns."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Time:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.roundTimeLimit}s
							</span>
						</p>
						<p className="mt-1">
							Total Rounds:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.totalRounds}
							</span>
						</p>
						<p className="mt-1">
							Players:{" "}
							<span className="font-medium text-foreground">
								{playerList.length}
							</span>
						</p>
					</div>
				}
				roomCode={multiplayer.gameState.roomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleLeaveMultiplayer}
				canStart={playerList.length >= 2}
				isHost={multiplayer.isHost}
				message={message}
			/>
		);
	}

	if (
		view === "multiplayer-game" &&
		multiplayer.gameState &&
		multiplayer.playerId
	) {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Drawing Game"
					subtitle={`Room ${multiplayer.gameState.roomCode}`}
					onBack={handleBackToSelect}
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
				<MultiplayerGame
					gameState={multiplayer.gameState}
					playerId={multiplayer.playerId}
					isHost={multiplayer.isHost}
					strokes={multiplayer.strokes}
					guesses={multiplayer.guesses}
					onStroke={multiplayer.sendStroke}
					onClear={multiplayer.clearCanvas}
					onGuess={multiplayer.sendGuess}
					onRestart={multiplayer.restartGame}
					onLeave={handleLeaveMultiplayer}
				/>
			</div>
		);
	}

	return (
		<div className="min-h-[calc(100vh-73px)] bg-background flex items-center justify-center">
			<div className="text-center">
				<p className="text-muted-foreground">Something went wrong.</p>
				<Button variant="outline" onClick={handleBackToSelect} className="mt-4">
					Go Back
				</Button>
			</div>
		</div>
	);
}
