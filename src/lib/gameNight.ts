export const GAME_NIGHT_GAMES = [
	{ id: "timeline-chaos", title: "Timeline Chaos", path: "/games/timeline-chaos", party: "timelinechaos", minPlayers: 2, maxPlayers: 12 },
	{ id: "trivia-quiz", title: "Trivia Quiz", path: "/games/trivia-quiz", party: "triviaquiz", minPlayers: 2, maxPlayers: 12 },
	{ id: "memory-match", title: "Memory Match", path: "/games/memory-match", party: "memorymatch", minPlayers: 2, maxPlayers: 8 },
	{ id: "code-breaker", title: "Code Breaker", path: "/games/code-breaker", party: "codebreaker", minPlayers: 2, maxPlayers: 8 },
	{ id: "guess-the-country", title: "Guess the Country", path: "/games/guess-the-country", party: "guessthecountry", minPlayers: 2, maxPlayers: 8 },
	{ id: "wordle", title: "Wordle", path: "/games/wordle", party: "wordle", minPlayers: 2, maxPlayers: 8 },
	{ id: "typerace", title: "Type Race", path: "/games/typerace", party: "typerace", minPlayers: 2, maxPlayers: 8 },
	{ id: "drawing", title: "Drawing", path: "/games/drawing", party: "drawing", minPlayers: 2, maxPlayers: 8 },
	{ id: "word-scramble", title: "Word Scramble", path: "/games/word-scramble", party: "wordscramble", minPlayers: 2, maxPlayers: 8 },
	{ id: "sync-up", title: "Sync Up", path: "/games/sync-up", party: "syncup", minPlayers: 2, maxPlayers: 12 },
	{ id: "hot-take-arena", title: "Hot Take Arena", path: "/games/hot-take-arena", party: "hottakearena", minPlayers: 2, maxPlayers: 12 },
	{ id: "pressure-button", title: "Pressure Button", path: "/games/pressure-button", party: "pressurebutton", minPlayers: 2, maxPlayers: 10 },
	{ id: "wordchain", title: "Word Chain", path: "/games/wordchain", party: "wordchain", minPlayers: 2, maxPlayers: 8 },
	{ id: "codenames", title: "Codenames", path: "/games/codenames", party: "codenames", minPlayers: 4, maxPlayers: 8 },
	{ id: "sudoku", title: "Sudoku", path: "/games/sudoku", party: "sudoku", minPlayers: 2, maxPlayers: 8 },
	{ id: "poker", title: "Texas Hold'em", path: "/games/poker", party: "poker", minPlayers: 2, maxPlayers: 8 },
	{ id: "mafia", title: "Mafia", path: "/games/mafia", party: "mafia", minPlayers: 5, maxPlayers: 12 },
] as const;

export type GameNightGameId = (typeof GAME_NIGHT_GAMES)[number]["id"];

export interface GameNightPlayer {
	id: string;
	name: string;
	wins: number;
	joinedAt: number;
	connected?: boolean;
}

export interface GameNightMatch {
	id: string;
	gameId: GameNightGameId;
	roomId: string;
	status: "launching" | "ready" | "collecting" | "finished";
	startedAt: number;
}

export interface GameNightHistoryEntry {
	matchId: string;
	gameId: GameNightGameId;
	winnerIds: string[];
	winnerNames: string[];
	scored: boolean;
	finishedAt: number;
}

export interface PublicGameNightState {
	roomCode: string;
	hostId: string;
	players: Record<string, GameNightPlayer>;
	activeMatch: GameNightMatch | null;
	history: GameNightHistoryEntry[];
	revision: number;
}

export interface GameNightConnection {
	roomCode: string;
	matchId: string;
	gameId: GameNightGameId;
	roomId: string;
	playerId: string;
	playerName: string;
	ticket: string;
	isHost: boolean;
	canEnter: boolean;
}

export type GameNightClientMessage =
	| { type: "join"; name: string }
	| { type: "select-game"; gameId: GameNightGameId }
	| { type: "match-ready"; matchId: string }
	| { type: "complete-match"; matchId: string }
	| { type: "leave" };

export type GameNightServerMessage =
	| { type: "state"; state: PublicGameNightState; connection: GameNightConnection | null }
	| { type: "error"; message: string };

export interface GameNightResult {
	finished: boolean;
	scored: boolean;
	winnerIds: string[];
}

export function getGameNightGame(gameId: string) {
	return GAME_NIGHT_GAMES.find((game) => game.id === gameId);
}
