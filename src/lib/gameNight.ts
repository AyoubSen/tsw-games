import type { Reaction, ReactionMessage } from "./reactions";

export const GAME_NIGHT_GAMES = [
	{ id: "bomb-defusal", title: "Bomb Defusal", path: "/games/bomb-defusal", party: "bombdefusal", minPlayers: 2, maxPlayers: 4 },
	{ id: "uno", title: "Uno", path: "/games/uno", party: "uno", minPlayers: 2, maxPlayers: 8 },
	{ id: "timeline-chaos", title: "Timeline Chaos", path: "/games/timeline-chaos", party: "timelinechaos", minPlayers: 2, maxPlayers: 12 },
	{ id: "trivia-quiz", title: "Trivia Quiz", path: "/games/trivia-quiz", party: "triviaquiz", minPlayers: 2, maxPlayers: 12 },
	{ id: "ludo", title: "Parcheesi", path: "/games/ludo", party: "ludo", minPlayers: 2, maxPlayers: 4 },
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
	{ id: "codenames", title: "Codenames", path: "/games/codenames", party: "codenames", minPlayers: 2, maxPlayers: 8 },
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
	/** On the Game Night page rather than inside a game. */
	inLounge?: boolean;
	/** Signed in: the name is their profile name and can't be spoofed. */
	verified?: boolean;
	color?: string;
}

export interface GameNightMatch {
	id: string;
	gameId: GameNightGameId;
	roomId: string;
	status: "launching" | "ready" | "collecting" | "finished";
	startedAt: number;
	/** Roster at launch. */
	playerIds?: string[];
}

export interface GameNightHistoryEntry {
	matchId: string;
	gameId: GameNightGameId;
	winnerIds: string[];
	winnerNames: string[];
	scored: boolean;
	finishedAt: number;
	playerIds?: string[];
}

/** Next-game vote: open → spin (reveal) → the winner launches. */
export interface GameNightVote {
	id: string;
	/** The games on the ballot; with `any`, every game that fits the room. */
	options: GameNightGameId[];
	any: boolean;
	votes: Record<string, GameNightGameId>;
	stage: "open" | "spin";
	openedAt: number;
	endsAt: number;
	/** Set once the vote locks: the games the reveal spins through and where it lands. */
	candidates?: GameNightGameId[];
	winner?: GameNightGameId;
	hostPick?: boolean;
}

/** Post-game recap on the stage: waits for the room to come back, then plays for RECAP_MS. */
export interface GameNightRecap {
	matchId: string;
	stage: "waiting" | "playing";
	/** When the wait gives up on stragglers (set once someone is back). */
	waitUntil: number | null;
	startedAt: number | null;
	endsAt: number | null;
}

export interface GameNightAward {
	id: "champion" | "regular" | "comeback";
	title: string;
	playerIds: string[];
	detail: string;
}

export interface GameNightFinale {
	endedAt: number;
	awards: GameNightAward[];
}

export const VOTE_MS = 45_000;
export const SPIN_MS = 4_600;
export const RECAP_MS = 8_500;
export const RECAP_WAIT_MS = 20_000;
/** Recap beats (ms into the recap): game card, winners, +1 flight, standings. */
export const RECAP_BEATS = { winners: 1_300, fly: 2_800, land: 3_700 } as const;

export interface PublicGameNightState {
	roomCode: string;
	hostId: string;
	players: Record<string, GameNightPlayer>;
	activeMatch: GameNightMatch | null;
	history: GameNightHistoryEntry[];
	revision: number;
	vote: GameNightVote | null;
	recap: GameNightRecap | null;
	finale: GameNightFinale | null;
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
	| { type: "join"; name: string; authToken?: unknown }
	| { type: "select-game"; gameId: GameNightGameId }
	| { type: "match-ready"; matchId: string }
	| { type: "complete-match"; matchId: string }
	| { type: "open-vote"; options: GameNightGameId[] }
	| { type: "vote"; gameId: GameNightGameId }
	| { type: "lock-vote" }
	| { type: "cancel-vote" }
	| { type: "lounge"; here: boolean }
	| { type: "skip-recap" }
	| { type: "end-night" }
	| { type: "resume-night" }
	| { type: "react"; reaction: Reaction }
	| { type: "leave" };

export type GameNightServerMessage =
	| { type: "state"; state: PublicGameNightState; connection: GameNightConnection | null }
	| { type: "error"; message: string }
	| ReactionMessage;

export interface GameNightResult {
	finished: boolean;
	scored: boolean;
	winnerIds: string[];
}

export function getGameNightGame(gameId: string) {
	return GAME_NIGHT_GAMES.find((game) => game.id === gameId);
}

/** Why `gameId` can't be played by this roster, or null when it fits. */
export function gameNightMisfit(gameId: GameNightGameId, rosterSize: number, connectedCount: number): string | null {
	const game = getGameNightGame(gameId);
	if (!game) return "That game is not available";
	if (gameId === "codenames" && rosterSize > 2 && connectedCount < 4) return "Codenames needs 2 players for Duet, or 4+ for teams";
	if (connectedCount < game.minPlayers) return `Needs ${game.minPlayers}+ players`;
	if (rosterSize > game.maxPlayers) return `Max ${game.maxPlayers} players`;
	return null;
}

/** Wins standings rank (ties share) for every id in `ids`. */
function ranksOf(ids: string[], wins: Record<string, number>) {
	return Object.fromEntries(ids.map((id) => [id, 1 + ids.filter((other) => (wins[other] ?? 0) > (wins[id] ?? 0)).length]));
}

/** End-of-night awards from the match history. */
export function computeAwards(players: Record<string, GameNightPlayer>, history: GameNightHistoryEntry[]): GameNightAward[] {
	const ids = Object.keys(players);
	const awards: GameNightAward[] = [];
	const most = (score: Record<string, number>) => {
		const best = Math.max(0, ...ids.map((id) => score[id] ?? 0));
		return best > 0 ? { best, ids: ids.filter((id) => (score[id] ?? 0) === best) } : null;
	};

	const wins: Record<string, number> = {};
	const played: Record<string, number> = {};
	const worst: Record<string, number> = {};
	for (const entry of history) {
		if (entry.scored) for (const id of entry.winnerIds) wins[id] = (wins[id] ?? 0) + 1;
		for (const id of entry.playerIds ?? []) played[id] = (played[id] ?? 0) + 1;
		const ranks = ranksOf(ids, wins);
		for (const id of ids) worst[id] = Math.max(worst[id] ?? 0, ranks[id]!);
	}

	const champion = most(wins);
	if (champion) awards.push({ id: "champion", title: "Night Champion", playerIds: champion.ids, detail: `${champion.best} win${champion.best === 1 ? "" : "s"}` });
	const regular = most(played);
	if (regular) awards.push({ id: "regular", title: "Ever-Present", playerIds: regular.ids, detail: `${regular.best} game${regular.best === 1 ? "" : "s"} played` });
	const finalRanks = ranksOf(ids, wins);
	const climb = Object.fromEntries(ids.map((id) => [id, (worst[id] ?? 1) - finalRanks[id]!]));
	const comeback = most(climb);
	if (comeback) awards.push({ id: "comeback", title: "Comeback Kid", playerIds: comeback.ids, detail: `Climbed ${comeback.best} place${comeback.best === 1 ? "" : "s"}` });
	return awards;
}
