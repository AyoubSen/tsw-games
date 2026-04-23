import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Trophy, User, Users, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MultiplayerGame } from "@/components/games/typerace/MultiplayerGame";
import { SinglePlayerGame } from "@/components/games/typerace/SinglePlayerGame";
import { useMultiplayerTypeRace } from "@/components/games/typerace/useMultiplayerTypeRace";
import { useTypeRace } from "@/components/games/typerace/useTypeRace";
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
import type { GameMode } from "../../../party/typerace";

export const Route = createFileRoute("/games/typerace")({
	component: TypeRacePage,
});

type GameView = "select" | "single" | "multiplayer-lobby" | "multiplayer-game";

const MULTIPLAYER_MODES: Array<{
	mode: GameMode;
	label: string;
	description: string;
	icon: typeof Zap;
}> = [
	{
		mode: "race",
		label: "Race",
		description: "First to finish typing wins.",
		icon: Zap,
	},
	{
		mode: "classic",
		label: "Classic",
		description: "Everyone finishes, best result wins.",
		icon: Trophy,
	},
];

function TypeRacePage() {
	const [view, setView] = useState<GameView>("select");
	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [selectedMode, setSelectedMode] = useState<GameMode>("race");
	const [message, setMessage] = useState<string | null>(null);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);

	const singlePlayer = useTypeRace();
	const multiplayer = useMultiplayerTypeRace();
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

	const handleSinglePlayer = () => {
		setView("single");
	};

	const handleCreateMultiplayer = () => {
		if (!playerName.trim()) {
			setMessage("Enter your name first.");
			return;
		}

		multiplayer.createGame(selectedMode, playerName.trim());
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
		singlePlayer.resetGame();
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
					title="Type Race"
					subtitle="Practice solo or race friends with the same typing prompt"
				/>
				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.05fr_0.95fr]">
					<MultiplayerSetupCard
						title="Multiplayer"
						description="Create a room, pick a race mode, and compete on the same phrase."
						icon={<Users className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Type Race Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinMultiplayer}
						onCreate={handleCreateMultiplayer}
						message={message}
					>
						<div className="space-y-2">
							<p className="text-sm font-medium">Race Mode</p>
							<div className="grid gap-2">
								{MULTIPLAYER_MODES.map((modeOption) => {
									const Icon = modeOption.icon;

									return (
										<button
											key={modeOption.mode}
											type="button"
											onClick={() => setSelectedMode(modeOption.mode)}
											className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors ${
												selectedMode === modeOption.mode
													? "border-primary bg-primary/10 text-primary"
													: "border-border hover:border-primary/50"
											}`}
										>
											<span className="flex items-center gap-2">
												<Icon className="h-4 w-4" />
												{modeOption.label}
											</span>
											<span className="mt-1 block text-[11px] font-normal text-muted-foreground">
												{modeOption.description}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					</MultiplayerSetupCard>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<User className="h-5 w-5 text-primary" />
								Single Player
							</CardTitle>
							<CardDescription>
								Practice your typing speed locally before bringing friends in.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="rounded-2xl bg-accent/40 p-4 text-sm text-muted-foreground">
								<p>Race mode ends the moment someone finishes.</p>
								<p className="mt-2">
									Classic mode lets everyone finish before results lock in.
								</p>
							</div>
							<Button
								className="w-full"
								variant="outline"
								onClick={handleSinglePlayer}
							>
								Open Solo Practice
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (view === "single") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Type Race"
					subtitle="Single-player practice"
					onBack={handleBackToSelect}
				/>
				<SinglePlayerGame
					text={singlePlayer.text}
					typedText={singlePlayer.typedText}
					gameStatus={singlePlayer.gameStatus}
					wpm={singlePlayer.wpm}
					accuracy={singlePlayer.accuracy}
					onInput={singlePlayer.handleInput}
					onStart={singlePlayer.startGame}
					onReset={singlePlayer.resetGame}
					onBack={handleBackToSelect}
				/>
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
				title="Type Race Lobby"
				subtitle={`Room ${multiplayer.gameState.roomCode}`}
				onBack={handleBackToSelect}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. Everyone gets the same text."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Mode:{" "}
							<span className="font-medium capitalize text-foreground">
								{multiplayer.gameState.mode}
							</span>
						</p>
						<p className="mt-1">
							Format:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.mode === "race"
									? "First finisher wins"
									: "Everyone finishes"}
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
					title="Type Race"
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
					onProgress={multiplayer.sendProgress}
					onComplete={multiplayer.sendComplete}
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
