import { createFileRoute } from "@tanstack/react-router";
import {
	Clock3,
	Database,
	Eye,
	EyeOff,
	Lightbulb,
	Loader2,
	Play,
	RotateCcw,
	Shuffle,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMultiplayerWordScramble } from "@/components/games/word-scramble/useMultiplayerWordScramble";
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
import {
	buildWordScramblePuzzles,
	pickNextWordScramblePuzzle,
	usesPuzzleLetters,
	type WordScramblePuzzle,
} from "@/lib/wordScramble";
import {
	getAnswerCount,
	getAnswerWords,
	getValidCount,
	getValidWordsSet,
	isWordsLoaded,
	loadWords,
} from "@/lib/wordService";
import type {
	ClaimVisibility,
	GameSettings,
	ScrambleDifficulty,
} from "../../../party/word-scramble";

export const Route = createFileRoute("/games/word-scramble")({
	component: WordScramblePage,
});

type GameView = "select" | "single" | "multiplayer-lobby" | "multiplayer-game";

const ROUND_TIME_OPTIONS = [
	{ value: 45, label: "45s" },
	{ value: 60, label: "60s" },
	{ value: 90, label: "90s" },
	{ value: 120, label: "120s" },
];

const DIFFICULTY_OPTIONS: Array<{
	value: ScrambleDifficulty;
	label: string;
	description: string;
}> = [
	{ value: "easy", label: "Easy", description: "2-3 answers" },
	{ value: "normal", label: "Normal", description: "3-4 answers" },
	{ value: "hard", label: "Hard", description: "4-5 answers" },
];

const CLAIM_VISIBILITY_OPTIONS: Array<{
	value: ClaimVisibility;
	label: string;
	description: string;
	icon: typeof Eye;
}> = [
	{
		value: "hidden",
		label: "Hidden",
		description: "Only show your own words until the round ends",
		icon: EyeOff,
	},
	{
		value: "public",
		label: "Public",
		description: "Show the claim feed as words are found",
		icon: Eye,
	},
];

function getScrambledTiles(
	scrambled: string,
): Array<{ id: string; letter: string }> {
	const seenCounts = new Map<string, number>();

	return [...scrambled].map((letter) => {
		const nextCount = (seenCounts.get(letter) ?? 0) + 1;
		seenCounts.set(letter, nextCount);

		return {
			id: `${letter}-${nextCount}`,
			letter,
		};
	});
}

function WordScramblePage() {
	const [view, setView] = useState<GameView>("select");
	const [loadingWords, setLoadingWords] = useState(!isWordsLoaded());
	const [globalMessage, setGlobalMessage] = useState<string | null>(null);

	const [singleGuess, setSingleGuess] = useState("");
	const [singlePuzzle, setSinglePuzzle] = useState<WordScramblePuzzle | null>(
		null,
	);
	const [singleFoundWords, setSingleFoundWords] = useState<string[]>([]);
	const [singleRoundsCleared, setSingleRoundsCleared] = useState(0);
	const [singleTotalFound, setSingleTotalFound] = useState(0);
	const [singleHintWord, setSingleHintWord] = useState<string | null>(null);

	const [playerName, setPlayerName] = useState("");
	const [joinRoomCode, setJoinRoomCode] = useState("");
	const [roundTimeLimit, setRoundTimeLimit] = useState(60);
	const [difficulty, setDifficulty] = useState<ScrambleDifficulty>("normal");
	const [claimVisibility, setClaimVisibility] =
		useState<ClaimVisibility>("hidden");
	const [multiplayerGuess, setMultiplayerGuess] = useState("");
	const [multiplayerMessage, setMultiplayerMessage] = useState<string | null>(
		null,
	);
	const [copiedRoomCode, setCopiedRoomCode] = useState(false);
	const [now, setNow] = useState(Date.now());

	const multiplayer = useMultiplayerWordScramble();

	useEffect(() => {
		if (!isWordsLoaded()) {
			loadWords()
				.catch((error) => {
					console.error("Failed to load words for Word Scramble:", error);
					setGlobalMessage("Could not load the local dictionary.");
				})
				.finally(() => {
					setLoadingWords(false);
				});
			return;
		}

		setLoadingWords(false);
	}, []);

	const singlePuzzles = useMemo(
		() =>
			loadingWords || !isWordsLoaded()
				? []
				: buildWordScramblePuzzles(getAnswerWords()),
		[loadingWords],
	);

	const validWords = useMemo(() => getValidWordsSet(), []);

	const startSingleRound = useCallback(
		(previousSignature?: string | null) => {
			const nextPuzzle = pickNextWordScramblePuzzle(
				singlePuzzles,
				previousSignature,
			);
			setSinglePuzzle(nextPuzzle);
			setSingleFoundWords([]);
			setSingleGuess("");
			setSingleHintWord(null);
			setGlobalMessage(
				nextPuzzle ? "New practice round ready." : "No puzzles available yet.",
			);
		},
		[singlePuzzles],
	);

	useEffect(() => {
		if (
			!loadingWords &&
			view === "single" &&
			singlePuzzles.length > 0 &&
			!singlePuzzle
		) {
			startSingleRound();
		}
	}, [loadingWords, singlePuzzle, singlePuzzles, startSingleRound, view]);

	useEffect(() => {
		if (multiplayer.connectionStatus === "connected" && multiplayer.gameState) {
			if (multiplayer.gameState.status === "waiting") {
				setView("multiplayer-lobby");
			} else {
				setView("multiplayer-game");
			}
		}
	}, [multiplayer.connectionStatus, multiplayer.gameState]);

	useEffect(() => {
		if (multiplayer.error) {
			setMultiplayerMessage(multiplayer.error);
		}
	}, [multiplayer.error]);

	useEffect(() => {
		if (multiplayer.gameState?.status !== "playing") {
			return;
		}

		setNow(Date.now());
		const timer = window.setInterval(() => {
			setNow(Date.now());
		}, 250);

		return () => window.clearInterval(timer);
	}, [multiplayer.gameState?.status]);

	const singleRemainingSolutions = useMemo(() => {
		if (!singlePuzzle) {
			return [];
		}

		return singlePuzzle.solutions.filter(
			(word) => !singleFoundWords.includes(word),
		);
	}, [singleFoundWords, singlePuzzle]);

	const singleRoundComplete =
		singlePuzzle !== null && singleRemainingSolutions.length === 0;

	const multiplayerPuzzle = multiplayer.gameState?.puzzle ?? null;
	const multiplayerSettings = multiplayer.gameState?.settings ?? null;
	const timeRemaining =
		multiplayer.gameState?.status === "playing" &&
		multiplayer.gameState.startedAt &&
		multiplayerSettings
			? Math.max(
					0,
					multiplayerSettings.roundTimeLimit -
						Math.floor((now - multiplayer.gameState.startedAt) / 1000),
				)
			: 0;
	const multiplayerRemainingSolutions = useMemo(() => {
		if (!multiplayerPuzzle || !multiplayer.gameState) {
			return [];
		}

		return multiplayerPuzzle.solutions.filter(
			(word) => !multiplayer.gameState?.claimedWords[word],
		);
	}, [multiplayer.gameState, multiplayerPuzzle]);

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

	const winnerNames = useMemo(() => {
		if (!multiplayer.gameState) {
			return [];
		}

		return multiplayer.gameState.winnerIds
			.map((winnerId) => multiplayer.gameState?.players[winnerId]?.name)
			.filter((name): name is string => Boolean(name));
	}, [multiplayer.gameState]);

	const handleBackToSelect = () => {
		if (multiplayer.connectionStatus !== "disconnected") {
			multiplayer.disconnect();
		}

		setView("select");
		setSingleGuess("");
		setSingleHintWord(null);
		setMultiplayerGuess("");
		setMultiplayerMessage(null);
	};

	const handleSingleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!singlePuzzle) {
			return;
		}

		const normalizedGuess = singleGuess.trim().toLowerCase();

		if (normalizedGuess.length !== 5) {
			setGlobalMessage("Use all five letters.");
			return;
		}

		if (!validWords.has(normalizedGuess)) {
			setGlobalMessage(`"${normalizedGuess}" is not in the local dictionary.`);
			return;
		}

		if (!usesPuzzleLetters(normalizedGuess, singlePuzzle.signature)) {
			setGlobalMessage("That word does not use exactly these letters.");
			return;
		}

		if (!singlePuzzle.solutions.includes(normalizedGuess)) {
			setGlobalMessage(
				"Real word, but not one of this round's common answers.",
			);
			return;
		}

		if (singleFoundWords.includes(normalizedGuess)) {
			setGlobalMessage("You already found that one.");
			return;
		}

		const nextFoundWords = [...singleFoundWords, normalizedGuess].sort();
		setSingleFoundWords(nextFoundWords);
		setSingleTotalFound((current) => current + 1);
		setSingleGuess("");
		setSingleHintWord(null);

		if (nextFoundWords.length === singlePuzzle.solutions.length) {
			setSingleRoundsCleared((current) => current + 1);
			setGlobalMessage("Practice round cleared.");
			return;
		}

		setGlobalMessage(
			`Nice. ${singlePuzzle.solutions.length - nextFoundWords.length} answer(s) left.`,
		);
	};

	const handleCreateMultiplayer = () => {
		if (!playerName.trim()) {
			setMultiplayerMessage("Enter your name first.");
			return;
		}

		const settings: GameSettings = {
			roundTimeLimit,
			difficulty,
			claimVisibility,
		};

		multiplayer.createGame(playerName.trim(), settings);
		setMultiplayerMessage(null);
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
			setMultiplayerMessage("Could not copy the room code.");
		}
	};

	const handleJoinMultiplayer = () => {
		if (!playerName.trim() || !joinRoomCode.trim()) {
			setMultiplayerMessage("Enter your name and a room code.");
			return;
		}

		multiplayer.joinGame(joinRoomCode.trim(), playerName.trim());
		setMultiplayerMessage(null);
	};

	const handleMultiplayerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!multiplayerPuzzle) {
			return;
		}

		const normalizedGuess = multiplayerGuess.trim().toLowerCase();

		if (normalizedGuess.length !== 5) {
			setMultiplayerMessage("Use all five letters.");
			return;
		}

		if (!usesPuzzleLetters(normalizedGuess, multiplayerPuzzle.signature)) {
			setMultiplayerMessage("That word does not match this letter set.");
			return;
		}

		multiplayer.submitWord(normalizedGuess);
		setMultiplayerGuess("");
		setMultiplayerMessage(null);
	};

	const handleSingleHint = () => {
		if (singleRemainingSolutions.length === 0) {
			return;
		}

		const nextHint = singleRemainingSolutions[0];
		setSingleHintWord(`${nextHint[0].toUpperCase()} _ _ _ _`);
		setGlobalMessage("Hint used. First letter revealed.");
	};

	const handleSingleReshuffle = () => {
		if (!singlePuzzle) {
			return;
		}

		const reshuffled = pickNextWordScramblePuzzle([singlePuzzle], null);
		if (!reshuffled) {
			return;
		}

		setSinglePuzzle(reshuffled);
		setGlobalMessage("Letters reshuffled.");
	};

	if (loadingWords) {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background flex flex-col items-center justify-center gap-4">
				<Loader2 className="w-10 h-10 animate-spin text-primary" />
				<p className="text-muted-foreground">Loading local word list...</p>
				<p className="text-xs text-muted-foreground">
					Word Scramble uses the same local dictionary as Wordle.
				</p>
			</div>
		);
	}

	if (view === "select") {
		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Word Scramble"
					subtitle="Practice solo or race live with friends"
				/>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2">
					<MultiplayerSetupCard
						title="Multiplayer"
						description="Shared scramble, live scoreboard, and first-claim pressure."
						icon={<Users className="h-5 w-5 text-primary" />}
						playerName={playerName}
						roomCode={joinRoomCode}
						createLabel="Create Multiplayer Room"
						onPlayerNameChange={setPlayerName}
						onRoomCodeChange={setJoinRoomCode}
						onJoin={handleJoinMultiplayer}
						onCreate={handleCreateMultiplayer}
						message={multiplayerMessage}
					>
						<div className="space-y-2">
							<p className="text-sm font-medium flex items-center gap-2">
								<Clock3 className="w-4 h-4" />
								Round Time
							</p>
							<div className="grid grid-cols-4 gap-2">
								{ROUND_TIME_OPTIONS.map((option) => (
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
							<p className="text-sm font-medium">Difficulty</p>
							<div className="grid grid-cols-3 gap-2">
								{DIFFICULTY_OPTIONS.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setDifficulty(option.value)}
										className={`rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
											difficulty === option.value
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:border-primary/50"
										}`}
									>
										<div>{option.label}</div>
										<div className="mt-1 text-[11px] font-normal text-muted-foreground">
											{option.description}
										</div>
									</button>
								))}
							</div>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Claim Visibility</p>
							<div className="grid gap-2 sm:grid-cols-2">
								{CLAIM_VISIBILITY_OPTIONS.map((option) => {
									const Icon = option.icon;

									return (
										<button
											key={option.value}
											type="button"
											onClick={() => setClaimVisibility(option.value)}
											className={`rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors ${
												claimVisibility === option.value
													? "border-primary bg-primary/10 text-primary"
													: "border-border hover:border-primary/50"
											}`}
										>
											<span className="flex items-center gap-2">
												<Icon className="h-4 w-4" />
												{option.label}
											</span>
											<span className="mt-1 block text-[11px] font-normal text-muted-foreground">
												{option.description}
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
								<Play className="h-5 w-5 text-primary" />
								Practice Mode
							</CardTitle>
							<CardDescription>
								Use the same scramble pool locally while we keep refining the
								multiplayer presentation.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="rounded-2xl bg-accent/40 p-4 text-sm text-muted-foreground">
								<p className="flex items-center gap-2">
									<Database className="h-4 w-4" />
									{getAnswerCount().toLocaleString()} answer words
								</p>
								<p className="mt-2">
									{singlePuzzles.length.toLocaleString()} reusable scramble
									groups available
								</p>
								<p className="mt-2">
									{getValidCount().toLocaleString()} valid inputs loaded
								</p>
							</div>
							<Button
								className="w-full"
								variant="outline"
								onClick={() => setView("single")}
							>
								Open Practice Board
							</Button>
							{globalMessage && (
								<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
									{globalMessage}
								</div>
							)}
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
					title="Word Scramble Practice"
					subtitle="Find every common 5-letter anagram"
					onBack={handleBackToSelect}
					rightAction={
						<Button
							variant="ghost"
							size="sm"
							onClick={() => startSingleRound(singlePuzzle?.signature ?? null)}
							disabled={singlePuzzles.length === 0}
						>
							<RotateCcw className="w-4 h-4 mr-1" />
							New
						</Button>
					}
				/>

				<div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.5fr_1fr]">
					<Card className="overflow-hidden">
						<CardHeader className="border-b">
							<div className="flex items-start justify-between gap-4">
								<div>
									<CardTitle>Practice Board</CardTitle>
									<CardDescription>
										Unscramble the letters and find all the common words hidden
										in this set.
									</CardDescription>
								</div>
								<div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
									{singlePuzzle?.solutions.length ?? 0} answers
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6 pt-6">
							<div className="flex flex-wrap items-center justify-center gap-3">
								{getScrambledTiles(singlePuzzle?.scrambled ?? "").map(
									(tile) => (
										<div
											key={tile.id}
											className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 text-xl font-black text-white shadow-md"
										>
											{tile.letter}
										</div>
									),
								)}
							</div>

							<form className="space-y-3" onSubmit={handleSingleSubmit}>
								<Input
									value={singleGuess}
									onChange={(event) =>
										setSingleGuess(
											event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 5),
										)
									}
									placeholder="Type a 5-letter word"
									className="h-12 text-center text-lg font-semibold uppercase tracking-[0.3em]"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									disabled={!singlePuzzle || singleRoundComplete}
								/>
								<div className="flex flex-wrap gap-3">
									<Button
										type="submit"
										disabled={!singlePuzzle || singleRoundComplete}
									>
										Submit Word
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={handleSingleReshuffle}
										disabled={!singlePuzzle}
									>
										<Shuffle className="w-4 h-4 mr-2" />
										Reshuffle
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={handleSingleHint}
										disabled={
											!singlePuzzle ||
											singleRoundComplete ||
											singleRemainingSolutions.length === 0
										}
									>
										<Lightbulb className="w-4 h-4 mr-2" />
										Hint
									</Button>
								</div>
							</form>

							{globalMessage && (
								<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
									{globalMessage}
								</div>
							)}

							{singleHintWord && (
								<div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
									Hint: {singleHintWord}
								</div>
							)}

							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-2xl border p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Found
									</p>
									<div className="mt-3 flex min-h-16 flex-wrap gap-2">
										{singleFoundWords.length > 0 ? (
											singleFoundWords.map((word) => (
												<span
													key={word}
													className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
												>
													{word.toUpperCase()}
												</span>
											))
										) : (
											<p className="text-sm text-muted-foreground">
												No answers found yet.
											</p>
										)}
									</div>
								</div>
								<div className="rounded-2xl border p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Remaining
									</p>
									<div className="mt-3 flex min-h-16 flex-wrap gap-2">
										{singleRemainingSolutions.map((word) => (
											<span
												key={word}
												className="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground"
											>
												?????
											</span>
										))}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Practice Stats</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
								<div className="rounded-2xl bg-accent/40 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Rounds Cleared
									</p>
									<p className="mt-2 text-3xl font-black">
										{singleRoundsCleared}
									</p>
								</div>
								<div className="rounded-2xl bg-accent/40 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Words Found
									</p>
									<p className="mt-2 text-3xl font-black">{singleTotalFound}</p>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		);
	}

	if (
		view === "multiplayer-lobby" &&
		multiplayer.gameState &&
		multiplayer.playerId
	) {
		const playerList = Object.values(multiplayer.gameState.players);

		return (
			<MultiplayerLobby
				title="Word Scramble Lobby"
				subtitle={`Room ${multiplayer.gameState.roomCode}`}
				onBack={handleBackToSelect}
				players={playerList}
				hostId={multiplayer.gameState.hostId}
				currentPlayerId={multiplayer.playerId}
				playerDescription="Need at least 2 players. First to claim the most words wins the round."
				settings={
					<div className="rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
						<p>
							Time:{" "}
							<span className="font-medium text-foreground">
								{multiplayer.gameState.settings.roundTimeLimit}s
							</span>
						</p>
						<p className="mt-1">
							Difficulty:{" "}
							<span className="font-medium capitalize text-foreground">
								{multiplayer.gameState.settings.difficulty}
							</span>
						</p>
						<p className="mt-1">
							Claims:{" "}
							<span className="font-medium capitalize text-foreground">
								{multiplayer.gameState.settings.claimVisibility}
							</span>
						</p>
					</div>
				}
				roomCode={multiplayer.gameState.roomCode}
				copiedRoomCode={copiedRoomCode}
				onCopyRoomCode={handleCopyRoomCode}
				onStart={multiplayer.startGame}
				onLeave={handleBackToSelect}
				canStart={playerList.length >= 2}
				isHost={multiplayer.isHost}
				message={multiplayerMessage}
			/>
		);
	}

	if (
		view === "multiplayer-game" &&
		multiplayer.gameState &&
		multiplayer.playerId &&
		multiplayerPuzzle
	) {
		const currentPlayer = multiplayer.gameState.players[multiplayer.playerId];
		const claimsArePublic =
			multiplayer.gameState.settings.claimVisibility === "public";
		const shouldRevealAllClaims =
			claimsArePublic || multiplayer.gameState.status === "finished";
		const lastClaimOwnerId = multiplayer.lastClaimedWord
			? multiplayer.gameState.claimedWords[multiplayer.lastClaimedWord]
			: null;
		const lastClaimOwner = lastClaimOwnerId
			? multiplayer.gameState.players[lastClaimOwnerId]
			: null;
		const getClaimLabel = (word: string, playerId: string) => {
			if (shouldRevealAllClaims || playerId === multiplayer.playerId) {
				return word.toUpperCase();
			}

			return "CLAIMED";
		};

		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<GameTopBar
					title="Multiplayer Word Scramble"
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

				<div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.45fr_0.9fr]">
					<Card className="overflow-hidden">
						<CardHeader className="border-b">
							<div className="flex items-start justify-between gap-4">
								<div>
									<CardTitle>Shared Board</CardTitle>
									<CardDescription>
										Everyone sees the same letters. First claim gets the point.
									</CardDescription>
								</div>
								<div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
									{multiplayerPuzzle.solutions.length} answers
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6 pt-6">
							{multiplayer.gameState.status === "finished" && (
								<div className="rounded-2xl border bg-primary/8 px-4 py-4">
									<p className="text-sm font-semibold">
										{winnerNames.length > 1
											? `Tie between ${winnerNames.join(", ")}.`
											: winnerNames[0]
												? `${winnerNames[0]} wins the round.`
												: "Round finished."}
									</p>
								</div>
							)}

							<div className="grid gap-3 sm:grid-cols-3">
								<div className="rounded-2xl border bg-card px-4 py-3">
									<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<Clock3 className="h-4 w-4" />
										Time Left
									</p>
									<p className="mt-2 text-3xl font-black tabular-nums">
										{multiplayer.gameState.status === "playing"
											? `${timeRemaining}s`
											: "0s"}
									</p>
								</div>
								<div className="rounded-2xl border bg-card px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Claim Mode
									</p>
									<p className="mt-2 text-lg font-black capitalize">
										{multiplayer.gameState.settings.claimVisibility}
									</p>
								</div>
								<div className="rounded-2xl border bg-card px-4 py-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Difficulty
									</p>
									<p className="mt-2 text-lg font-black capitalize">
										{multiplayer.gameState.settings.difficulty}
									</p>
								</div>
							</div>

							<div className="flex flex-wrap items-center justify-center gap-3">
								{getScrambledTiles(multiplayerPuzzle.scrambled).map((tile) => (
									<div
										key={tile.id}
										className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 text-xl font-black text-white shadow-md"
									>
										{tile.letter}
									</div>
								))}
							</div>

							<form className="space-y-3" onSubmit={handleMultiplayerSubmit}>
								<Input
									value={multiplayerGuess}
									onChange={(event) =>
										setMultiplayerGuess(
											event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 5),
										)
									}
									placeholder="Type a 5-letter word"
									className="h-12 text-center text-lg font-semibold uppercase tracking-[0.3em]"
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									disabled={multiplayer.gameState.status !== "playing"}
								/>
								<div className="flex flex-wrap gap-3">
									<Button
										type="submit"
										disabled={multiplayer.gameState.status !== "playing"}
									>
										Claim Word
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={() => setMultiplayerGuess("")}
										disabled={!multiplayerGuess}
									>
										Clear
									</Button>
								</div>
							</form>

							{multiplayerMessage && (
								<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
									{multiplayerMessage}
								</div>
							)}

							{multiplayer.lastClaimedWord && (
								<div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
									{shouldRevealAllClaims ||
									lastClaimOwnerId === multiplayer.playerId ? (
										<>
											Last claimed: {multiplayer.lastClaimedWord.toUpperCase()}
											{lastClaimOwner ? ` by ${lastClaimOwner.name}` : ""}
										</>
									) : (
										<>
											{lastClaimOwner?.name ?? "Someone"} claimed a word.
											<span className="ml-1">
												Words are hidden in this room.
											</span>
										</>
									)}
								</div>
							)}

							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-2xl border p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Claimed Words
									</p>
									<div className="mt-3 flex min-h-16 flex-wrap gap-2">
										{Object.keys(multiplayer.gameState.claimedWords).length >
										0 ? (
											Object.entries(multiplayer.gameState.claimedWords)
												.sort(([left], [right]) => left.localeCompare(right))
												.map(([word, playerId]) => (
													<span
														key={word}
														className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
													>
														{getClaimLabel(word, playerId)} ·{" "}
														{multiplayer.gameState?.players[playerId]?.name ??
															"?"}
													</span>
												))
										) : (
											<p className="text-sm text-muted-foreground">
												No words claimed yet.
											</p>
										)}
									</div>
								</div>
								<div className="rounded-2xl border p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Remaining
									</p>
									<div className="mt-3 flex min-h-16 flex-wrap gap-2">
										{multiplayerRemainingSolutions.map((word) => (
											<span
												key={word}
												className="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground"
											>
												?????
											</span>
										))}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Your Score</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="mb-3 rounded-2xl border px-4 py-3 text-sm text-muted-foreground">
									<p>
										Time:{" "}
										<span className="font-medium text-foreground">
											{multiplayer.gameState.settings.roundTimeLimit}s
										</span>
									</p>
									<p className="mt-1">
										Difficulty:{" "}
										<span className="font-medium capitalize text-foreground">
											{multiplayer.gameState.settings.difficulty}
										</span>
									</p>
									<p className="mt-1">
										Claims:{" "}
										<span className="font-medium capitalize text-foreground">
											{multiplayer.gameState.settings.claimVisibility}
										</span>
									</p>
								</div>
								<div className="rounded-2xl bg-accent/40 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										Current
									</p>
									<p className="mt-2 text-3xl font-black">
										{currentPlayer?.score ?? 0}
									</p>
									<p className="mt-2 text-sm text-muted-foreground">
										{currentPlayer?.foundWords.length ?? 0} words claimed
									</p>
								</div>
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
											<div>
												<p className="font-medium">{player.name}</p>
												<p className="text-xs text-muted-foreground">
													{player.foundWords.length} words
												</p>
											</div>
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
				<p className="text-muted-foreground">Something went wrong.</p>
				<Button variant="outline" onClick={handleBackToSelect} className="mt-4">
					Go Back
				</Button>
			</div>
		</div>
	);
}
