import { createFileRoute } from "@tanstack/react-router";
import { Clock, Heart, Link2, RotateCcw, Skull } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MultiplayerGame } from "@/components/games/wordchain/MultiplayerGame";
import type { GameSettings } from "@/components/games/wordchain/useMultiplayerWordchain";
import { useMultiplayerWordchain } from "@/components/games/wordchain/useMultiplayerWordchain";
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

export const Route = createFileRoute("/games/wordchain")({
	component: WordChainPage,
});

type GameView = "select" | "multiplayer-lobby" | "multiplayer-game";

const TIME_OPTIONS = [
	{ value: 10, label: "10s" },
	{ value: 15, label: "15s" },
	{ value: 20, label: "20s" },
	{ value: 30, label: "30s" },
];

const HEART_OPTIONS = [
	{ value: 1, label: "1" },
	{ value: 2, label: "2" },
	{ value: 3, label: "3" },
	{ value: 5, label: "5" },
];

function WordChainPage() {
	const [view, setView] = useState<GameView>("select");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [turnTimeLimit, setTurnTimeLimit] = useState(15);
	const [gameMode, setGameMode] = useState<"casual" | "hardcore">("casual");
	const [maxHearts, setMaxHearts] = useState(3);
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	const multiplayer = useMultiplayerWordchain();
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
			turnTimeLimit,
			gameMode,
			maxHearts: gameMode === "casual" ? maxHearts : 1,
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
					title="Word Chain"
					subtitle="Chain words with friends before the timer or your lives run out"
				/>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr]">
					<MultiplayerSetupCard
						title="Multiplayer"
						description="Take turns chaining 5-letter words. Last letter must match the next first letter."
						icon={<Link2 className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Word Chain Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinMultiplayer}
						onCreate={handleCreateMultiplayer}
						message={message}
					>
						<div className="space-y-2">
							<p className="text-sm font-medium">Game Mode</p>
							<div className="grid grid-cols-2 gap-2">
								<button
									type="button"
									onClick={() => setGameMode("casual")}
									className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
										gameMode === "casual"
											? "border-primary bg-primary/10 text-primary"
											: "border-border hover:border-primary/50"
									}`}
								>
									<span className="flex items-center justify-center gap-2">
										<Heart className="h-4 w-4" />
										Casual
									</span>
									<span className="mt-1 block text-[11px] font-normal text-muted-foreground">
										Multiple lives
									</span>
								</button>
								<button
									type="button"
									onClick={() => setGameMode("hardcore")}
									className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
										gameMode === "hardcore"
											? "border-destructive bg-destructive/10 text-destructive"
											: "border-border hover:border-destructive/50"
									}`}
								>
									<span className="flex items-center justify-center gap-2">
										<Skull className="h-4 w-4" />
										Hardcore
									</span>
									<span className="mt-1 block text-[11px] font-normal text-muted-foreground">
										One mistake = out
									</span>
								</button>
							</div>
						</div>

						{gameMode === "casual" && (
							<div className="space-y-2">
								<p className="flex items-center gap-2 text-sm font-medium">
									<Heart className="h-4 w-4 text-red-500" />
									Lives per Player
								</p>
								<div className="grid grid-cols-4 gap-2">
									{HEART_OPTIONS.map((option) => (
										<button
											key={option.value}
											type="button"
											onClick={() => setMaxHearts(option.value)}
											className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
												maxHearts === option.value
													? "border-red-500 bg-red-500/10 text-red-500"
													: "border-border hover:border-red-500/50"
											}`}
										>
											{option.label}
										</button>
									))}
								</div>
							</div>
						)}

						<div className="space-y-2">
							<p className="flex items-center gap-2 text-sm font-medium">
								<Clock className="h-4 w-4" />
								Time per Turn
							</p>
							<div className="grid grid-cols-4 gap-2">
								{TIME_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setTurnTimeLimit(option.value)}
										className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
											turnTimeLimit === option.value
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						</div>
					</MultiplayerSetupCard>

					<Card>
						<CardHeader>
							<CardTitle>How It Plays</CardTitle>
							<CardDescription>
								Stay alive by following the chain and not repeating words.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">
									1. Match letters
								</p>
								<p className="mt-1">
									Your word must start with the last letter of the previous
									word.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">
									2. Beat the timer
								</p>
								<p className="mt-1">
									Every turn is timed, so hesitation costs you.
								</p>
							</div>
							<div className="rounded-2xl border p-4">
								<p className="font-semibold text-foreground">
									3. Survive longer
								</p>
								<p className="mt-1">
									Casual gives lives. Hardcore eliminates you on the first
									mistake.
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
				title="Word Chain Lobby"
				subtitle={`Room ${multiplayer.gameState.roomCode}`}
				onBack={handleBackToSelect}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. Survive longer than everyone else."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Mode:{" "}
							<span className="font-medium capitalize text-foreground">
								{multiplayer.gameState.gameMode}
							</span>
						</p>
						{multiplayer.gameState.gameMode === "casual" && (
							<p className="mt-1">
								Lives:{" "}
								<span className="font-medium text-foreground">
									{multiplayer.gameState.maxHearts}
								</span>
							</p>
						)}
						<p className="mt-1">
							Turn Time:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.turnTimeLimit}s
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
					title="Word Chain"
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
					onSubmitWord={multiplayer.submitWord}
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
