import type * as Party from "partykit/server";
import {
	buildWordScramblePuzzles,
	pickNextWordScramblePuzzle,
	usesPuzzleLetters,
	type WordScramblePuzzle,
} from "../src/lib/wordScramble";

export interface Player {
	id: string;
	name: string;
	score: number;
	foundWords: string[];
	joinedAt: number;
}

export interface GameState {
	roomCode: string;
	hostId: string;
	players: Record<string, Player>;
	status: "waiting" | "playing" | "finished";
	maxPlayers: number;
	puzzle: WordScramblePuzzle | null;
	claimedWords: Record<string, string>;
	winnerId: string | null;
	startedAt: number | null;
	finishedAt: number | null;
}

export interface PublicGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, Player>;
	status: "waiting" | "playing" | "finished";
	maxPlayers: number;
	puzzle: WordScramblePuzzle | null;
	claimedWords: Record<string, string>;
	winnerId: string | null;
	startedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string }
	| { type: "start" }
	| { type: "submit-word"; word: string }
	| { type: "leave" }
	| { type: "restart" };

export type ServerMessage =
	| { type: "state"; state: PublicGameState }
	| { type: "player-joined"; player: Player }
	| { type: "player-left"; playerId: string }
	| { type: "game-started"; puzzle: WordScramblePuzzle; startTime: number }
	| { type: "word-claimed"; playerId: string; word: string; score: number }
	| { type: "game-over"; winnerId: string | null; claimedWords: Record<string, string> }
	| { type: "game-restarted" }
	| { type: "error"; message: string };

const WORDLE_ANSWERS_URL =
	"https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt";

let puzzlePoolPromise: Promise<WordScramblePuzzle[]> | null = null;

async function fetchWordList(url: string): Promise<string[]> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch Word Scramble words: ${response.status}`);
	}

	const text = await response.text();
	return text
		.split(/[\n,]+/)
		.map((word) => word.trim().toLowerCase())
		.filter((word) => word.length === 5 && /^[a-z]+$/.test(word));
}

async function getPuzzlePool(): Promise<WordScramblePuzzle[]> {
	if (!puzzlePoolPromise) {
		puzzlePoolPromise = fetchWordList(WORDLE_ANSWERS_URL)
			.then((words) => buildWordScramblePuzzles(words))
			.catch((error) => {
				console.error("Word Scramble puzzle load error:", error);
				return buildWordScramblePuzzles([
					"alert",
					"alter",
					"later",
					"angel",
					"angle",
					"glean",
					"baker",
					"brake",
					"break",
				]);
			});
	}

	return puzzlePoolPromise;
}

function getWinnerId(players: Record<string, Player>): string | null {
	const ranking = Object.values(players).sort((left, right) => {
		if (right.score !== left.score) {
			return right.score - left.score;
		}

		return left.joinedAt - right.joinedAt;
	});

	return ranking[0]?.id ?? null;
}

export default class WordScrambleParty implements Party.Server {
	constructor(readonly room: Party.Room) {}

	state: GameState | null = null;

	async onStart() {
		const stored = await this.room.storage.get<GameState>("state");
		if (stored) {
			this.state = stored;
		}
	}

	async saveState() {
		if (this.state) {
			await this.room.storage.put("state", this.state);
		}
	}

	getPublicState(): PublicGameState {
		if (!this.state) {
			throw new Error("No game state");
		}

		return {
			roomCode: this.state.roomCode,
			hostId: this.state.hostId,
			players: this.state.players,
			status: this.state.status,
			maxPlayers: this.state.maxPlayers,
			puzzle: this.state.puzzle,
			claimedWords: this.state.claimedWords,
			winnerId: this.state.winnerId,
			startedAt: this.state.startedAt,
			finishedAt: this.state.finishedAt,
		};
	}

	broadcast(message: ServerMessage, exclude?: string) {
		const serialized = JSON.stringify(message);
		for (const connection of this.room.getConnections()) {
			if (connection.id !== exclude) {
				connection.send(serialized);
			}
		}
	}

	send(connection: Party.Connection, message: ServerMessage) {
		connection.send(JSON.stringify(message));
	}

	async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
		const url = new URL(context.request.url);
		const isHost = url.searchParams.get("host") === "true";

		if (isHost && !this.state) {
			this.state = {
				roomCode: this.room.id,
				hostId: connection.id,
				players: {},
				status: "waiting",
				maxPlayers: 8,
				puzzle: null,
				claimedWords: {},
				winnerId: null,
				startedAt: null,
				finishedAt: null,
			};
			await this.saveState();
		}

		if (this.state) {
			this.send(connection, { type: "state", state: this.getPublicState() });
		} else {
			this.send(connection, { type: "error", message: "Game not found" });
		}
	}

	async onMessage(message: string, sender: Party.Connection) {
		if (!this.state) {
			return;
		}

		try {
			const data: ClientMessage = JSON.parse(message);

			switch (data.type) {
				case "join": {
					if (this.state.status !== "waiting") {
						this.send(sender, { type: "error", message: "Game already started" });
						return;
					}

					if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
						this.send(sender, { type: "error", message: "Game is full" });
						return;
					}

					const player: Player = {
						id: sender.id,
						name: data.name,
						score: 0,
						foundWords: [],
						joinedAt: Date.now(),
					};

					this.state.players[sender.id] = player;
					await this.saveState();

					this.broadcast({ type: "player-joined", player });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "start": {
					if (sender.id !== this.state.hostId) {
						this.send(sender, { type: "error", message: "Only host can start" });
						return;
					}

					if (Object.keys(this.state.players).length < 2) {
						this.send(sender, { type: "error", message: "Need at least 2 players" });
						return;
					}

					const puzzlePool = await getPuzzlePool();
					const nextPuzzle = pickNextWordScramblePuzzle(
						puzzlePool,
						this.state.puzzle?.signature ?? null,
					);

					if (!nextPuzzle) {
						this.send(sender, {
							type: "error",
							message: "Could not generate a puzzle",
						});
						return;
					}

					this.state.status = "playing";
					this.state.puzzle = nextPuzzle;
					this.state.claimedWords = {};
					this.state.winnerId = null;
					this.state.startedAt = Date.now();
					this.state.finishedAt = null;

					for (const player of Object.values(this.state.players)) {
						player.score = 0;
						player.foundWords = [];
					}

					await this.saveState();

					this.broadcast({
						type: "game-started",
						puzzle: nextPuzzle,
						startTime: this.state.startedAt,
					});
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "submit-word": {
					if (this.state.status !== "playing" || !this.state.puzzle) {
						return;
					}

					const player = this.state.players[sender.id];
					if (!player) {
						return;
					}

					const word = data.word.toLowerCase().trim();

					if (word.length !== 5 || !/^[a-z]+$/.test(word)) {
						this.send(sender, { type: "error", message: "Use a 5-letter word" });
						return;
					}

					if (!usesPuzzleLetters(word, this.state.puzzle.signature)) {
						this.send(sender, {
							type: "error",
							message: "That word does not match this letter set",
						});
						return;
					}

					if (!this.state.puzzle.solutions.includes(word)) {
						this.send(sender, {
							type: "error",
							message: "That is not one of this round's answers",
						});
						return;
					}

					if (this.state.claimedWords[word]) {
						this.send(sender, {
							type: "error",
							message: "Someone already claimed that word",
						});
						return;
					}

					this.state.claimedWords[word] = sender.id;
					player.score += 1;
					player.foundWords = [...player.foundWords, word].sort();

					await this.saveState();

					this.broadcast({
						type: "word-claimed",
						playerId: sender.id,
						word,
						score: player.score,
					});

					if (
						Object.keys(this.state.claimedWords).length ===
						this.state.puzzle.solutions.length
					) {
						this.state.status = "finished";
						this.state.finishedAt = Date.now();
						this.state.winnerId = getWinnerId(this.state.players);
						await this.saveState();

						this.broadcast({
							type: "game-over",
							winnerId: this.state.winnerId,
							claimedWords: this.state.claimedWords,
						});
					}

					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "leave": {
					delete this.state.players[sender.id];

					if (sender.id === this.state.hostId) {
						const remaining = Object.keys(this.state.players);
						if (remaining.length > 0) {
							this.state.hostId = remaining[0];
						}
					}

					await this.saveState();
					this.broadcast({ type: "player-left", playerId: sender.id });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "restart": {
					if (sender.id !== this.state.hostId) {
						this.send(sender, { type: "error", message: "Only host can restart" });
						return;
					}

					this.state.status = "waiting";
					this.state.claimedWords = {};
					this.state.winnerId = null;
					this.state.startedAt = null;
					this.state.finishedAt = null;
					this.state.puzzle = null;

					for (const player of Object.values(this.state.players)) {
						player.score = 0;
						player.foundWords = [];
					}

					await this.saveState();
					this.broadcast({ type: "game-restarted" });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}
			}
		} catch (error) {
			console.error("Error processing Word Scramble message:", error);
		}
	}

	async onClose(connection: Party.Connection) {
		if (!this.state || !this.state.players[connection.id]) {
			return;
		}

		delete this.state.players[connection.id];

		if (connection.id === this.state.hostId) {
			const remaining = Object.keys(this.state.players);
			if (remaining.length > 0) {
				this.state.hostId = remaining[0];
			}
		}

		await this.saveState();
		this.broadcast({ type: "player-left", playerId: connection.id });
		this.broadcast({ type: "state", state: this.getPublicState() });
	}
}
