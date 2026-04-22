import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Crown,
	Database,
	Lightbulb,
	Loader2,
	Play,
	RotateCcw,
	Shuffle,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMultiplayerWordScramble } from "@/components/games/word-scramble/useMultiplayerWordScramble";
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

export const Route = createFileRoute("/games/word-scramble")({
	component: WordScramblePage,
});

type GameView = "select" | "single" | "multiplayer-lobby" | "multiplayer-game";

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
	const [multiplayerGuess, setMultiplayerGuess] = useState("");
	const [multiplayerMessage, setMultiplayerMessage] = useState<string | null>(
		null,
	);

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

		multiplayer.createGame(playerName.trim());
		setMultiplayerMessage(null);
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
				<div className="px-4 py-3 flex items-center justify-between border-b border-border">
					<Button variant="ghost" size="sm" asChild>
						<Link to="/">
							<ArrowLeft className="w-4 h-4 mr-1" />
							Back
						</Link>
					</Button>
					<div className="text-center">
						<h1 className="text-lg font-bold">Word Scramble</h1>
						<p className="text-xs text-muted-foreground">
							Practice solo or race live with friends
						</p>
					</div>
					<div className="w-[60px]" />
				</div>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Users className="h-5 w-5 text-primary" />
								Multiplayer
							</CardTitle>
							<CardDescription>
								Shared scramble, live scoreboard, and first-claim pressure.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<Input
								value={playerName}
								onChange={(event) => setPlayerName(event.target.value)}
								placeholder="Your name"
								maxLength={20}
							/>
							<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
								<Input
									value={joinRoomCode}
									onChange={(event) =>
										setJoinRoomCode(
											event.target.value
												.toUpperCase()
												.replace(/[^A-Z0-9]/g, "")
												.slice(0, 6),
										)
									}
									placeholder="Room code"
									maxLength={6}
								/>
								<Button onClick={handleJoinMultiplayer} variant="outline">
									Join Room
								</Button>
							</div>
							<Button className="w-full" onClick={handleCreateMultiplayer}>
								Create Multiplayer Room
							</Button>
							{multiplayerMessage && (
								<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
									{multiplayerMessage}
								</div>
							)}
						</CardContent>
					</Card>

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
				<div className="px-4 py-3 flex items-center justify-between border-b border-border">
					<Button variant="ghost" size="sm" onClick={handleBackToSelect}>
						<ArrowLeft className="w-4 h-4 mr-1" />
						Back
					</Button>
					<div className="text-center">
						<h1 className="text-lg font-bold">Word Scramble Practice</h1>
						<p className="text-xs text-muted-foreground">
							Find every common 5-letter anagram
						</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => startSingleRound(singlePuzzle?.signature ?? null)}
						disabled={singlePuzzles.length === 0}
					>
						<RotateCcw className="w-4 h-4 mr-1" />
						New
					</Button>
				</div>

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
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<div className="px-4 py-3 flex items-center justify-between border-b border-border">
					<Button variant="ghost" size="sm" onClick={handleBackToSelect}>
						<ArrowLeft className="w-4 h-4 mr-1" />
						Back
					</Button>
					<div className="text-center">
						<h1 className="text-lg font-bold">Word Scramble Lobby</h1>
						<p className="text-xs text-muted-foreground">
							Room {multiplayer.gameState.roomCode}
						</p>
					</div>
					<div className="w-[60px]" />
				</div>

				<div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
					<Card>
						<CardHeader>
							<CardTitle>Players</CardTitle>
							<CardDescription>
								Need at least 2 players. First to claim the most words wins the
								round.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{playerList.map((player) => (
								<div
									key={player.id}
									className="flex items-center justify-between rounded-2xl border px-4 py-3"
								>
									<div className="flex items-center gap-2">
										<span className="font-medium">{player.name}</span>
										{player.id === multiplayer.gameState.hostId && (
											<Crown className="h-4 w-4 text-yellow-500" />
										)}
									</div>
									<span className="text-xs text-muted-foreground">
										{player.id === multiplayer.playerId ? "You" : "Ready"}
									</span>
								</div>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Match Controls</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="rounded-2xl bg-accent/40 p-4 text-sm">
								<p className="font-semibold">Room Code</p>
								<p className="mt-2 text-2xl font-black tracking-[0.25em]">
									{multiplayer.gameState.roomCode}
								</p>
							</div>
							<Button
								className="w-full"
								onClick={multiplayer.startGame}
								disabled={!multiplayer.isHost || playerList.length < 2}
							>
								Start Match
							</Button>
							<Button
								className="w-full"
								variant="outline"
								onClick={handleBackToSelect}
							>
								Leave Lobby
							</Button>
							{multiplayerMessage && (
								<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
									{multiplayerMessage}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (
		view === "multiplayer-game" &&
		multiplayer.gameState &&
		multiplayer.playerId &&
		multiplayerPuzzle
	) {
		const currentPlayer = multiplayer.gameState.players[multiplayer.playerId];
		const winner =
			(multiplayer.gameState.winnerId &&
				multiplayer.gameState.players[multiplayer.gameState.winnerId]) ||
			null;

		return (
			<div className="min-h-[calc(100vh-73px)] bg-background">
				<div className="px-4 py-3 flex items-center justify-between border-b border-border">
					<Button variant="ghost" size="sm" onClick={handleBackToSelect}>
						<ArrowLeft className="w-4 h-4 mr-1" />
						Back
					</Button>
					<div className="text-center">
						<h1 className="text-lg font-bold">Multiplayer Word Scramble</h1>
						<p className="text-xs text-muted-foreground">
							Room {multiplayer.gameState.roomCode}
						</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={multiplayer.restartGame}
						disabled={!multiplayer.isHost}
					>
						<RotateCcw className="w-4 h-4 mr-1" />
						Rematch
					</Button>
				</div>

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
										{winner
											? `${winner.name} wins the round.`
											: "Round finished."}
									</p>
								</div>
							)}

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
									Last claimed: {multiplayer.lastClaimedWord.toUpperCase()}
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
														{word.toUpperCase()} ·{" "}
														{multiplayer.gameState.players[playerId]?.name ??
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
