import type * as Party from "partykit/server";
import { withRoomCleanup } from "./shared/cleanup";
import {
	markConnected,
	markDisconnected,
	presentCount,
	nextHost,
	canControlGame,
} from "./shared/presence";
import {
	pickPressurePrompt,
	type PressurePrompt,
	type PressurePromptPack,
} from "../src/lib/pressurePrompts";
import {
	getGameNightResultMatch,
	validateGameNightConnection,
	type GameNightMember,
} from "./shared/gameNight";
import { JoinVerifier, reportDirectResult } from "./shared/account";
import {
	isReaction,
	takeReactionSlot,
	type Reaction,
	type ReactionMessage,
} from "../src/lib/reactions";

export const PASSES_PER_GAME = 2;

/** Points for each way a turn can end. */
export const POINTS = {
	/** Answered your own prompt and the room accepted it. */
	selfAccepted: 2,
	/** Answered your own prompt and the room rejected it (or the clock ran out). */
	selfFailed: -1,
	/** Pressured into answering and the room accepted it. */
	pressuredAccepted: 3,
	/** The pressured player was rejected or ran out of time: the pressurer scores. */
	pressureLanded: 2,
} as const;

/**
 * Server-paced beats, advanced by the storage alarm so every client sees the
 * same timeline. Client animations inside a beat must fit these durations.
 */
export const PACE_MS = {
	/** The hot potato's flight to its target; the answer clock starts after it lands. */
	potato: 900,
	/** The answer card (or "said it out loud" stamp) turning over. */
	flip: 1500,
	/** The room's vote; ends early once everyone has voted. */
	verdict: 12000,
	/** Before the first thumb turns over in the tally. */
	tallyLead: 400,
	/** Gap between one thumb turning over and the next. */
	tallyStep: 280,
	/** After the last thumb, while the count settles. */
	tallyHold: 900,
	/** Result stamp and points flying to the seats. */
	result: 2800,
	/** Scores land and the hot seat sweeps to the next player. */
	handoff: 2000,
} as const;

export function tallyDuration(voterCount: number): number {
	return PACE_MS.tallyLead + Math.max(0, voterCount - 1) * PACE_MS.tallyStep + PACE_MS.tallyHold;
}

export interface PressureButtonPlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
	passesLeft: number;
	/** False while their socket is away; they are not removed from the game. */
	connected?: boolean;
}

export interface PressureButtonSettings {
	turns: number;
	answerTimeLimit: number;
	promptPack: PressurePromptPack;
}

export interface TurnAnswer {
	/** Null when they said it out loud instead of typing. */
	text: string | null;
	spoken: boolean;
}

export type TurnOutcome = "accepted" | "rejected" | "timed-out" | "passed";

export interface TurnSummary {
	turnNumber: number;
	prompt: PressurePrompt;
	activePlayerId: string;
	mode: "answer" | "pass" | "pressure";
	responderId: string | null;
	/** The player who pressured, on pressure turns. */
	pressuredById: string | null;
	answer: TurnAnswer | null;
	outcome: TurnOutcome;
	/** Votes by voter id: true = accept. Missing voters counted as accept. */
	votes: Record<string, boolean>;
	voterIds: string[];
	scoreChanges: Record<string, number>;
}

export type RevealStage = "flip" | "verdict" | "tally" | "result" | "handoff";

export interface RevealPace {
	seq: number;
	stage: RevealStage;
	endsAt: number | null;
	/** Handoff only: who takes the hot seat next (null after the last turn). */
	nextPlayerId: string | null;
}

export interface PressureButtonGameState {
	roomCode: string;
	/** Server-only: player id -> verified account. Kept off PressureButtonPlayer, which is sent to clients as is. */
	accounts?: Record<string, string>;
	hostId: string;
	players: Record<string, PressureButtonPlayer>;
	status: "waiting" | "decision" | "answering" | "reveal" | "finished";
	maxPlayers: number;
	settings: PressureButtonSettings;
	turnNumber: number;
	activePlayerId: string | null;
	responderId: string | null;
	pressuredByPlayerId: string | null;
	mode: "answer" | "pass" | "pressure" | null;
	prompt: PressurePrompt | null;
	usedPromptIds: string[];
	answer: TurnAnswer | null;
	voterIds: string[];
	votes: Record<string, boolean>;
	outcome: TurnOutcome | null;
	scoreChanges: Record<string, number>;
	reveal: RevealPace | null;
	paceSeq: number;
	history: TurnSummary[];
	startedAt: number | null;
	/** When the answer clock started (after the potato lands on pressure turns). */
	turnStartedAt: number | null;
	finishedAt: number | null;
	playerOrder: string[];
}

export interface PublicPressureButtonGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, PressureButtonPlayer>;
	status: PressureButtonGameState["status"];
	maxPlayers: number;
	settings: PressureButtonSettings;
	turnNumber: number;
	activePlayerId: string | null;
	responderId: string | null;
	pressuredByPlayerId: string | null;
	mode: PressureButtonGameState["mode"];
	prompt: PressurePrompt | null;
	usedPromptIds: string[];
	/** From the flip beat on. */
	answer: TurnAnswer | null;
	/** Who judges this answer (from the verdict beat on). */
	voterIds: string[];
	/** Who has voted so far; how they voted stays hidden until the tally. */
	votedIds: string[];
	/** From the tally beat on. */
	votes: Record<string, boolean>;
	/** From the result beat on. */
	outcome: TurnOutcome | null;
	scoreChanges: Record<string, number>;
	reveal: RevealPace | null;
	/** Finished turns; the current one joins once its points land. */
	history: TurnSummary[];
	/** Seat order: the hot seat moves around it. */
	playerOrder: string[];
	startedAt: number | null;
	turnStartedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string; authToken?: unknown }
	| { type: "start" }
	| { type: "choose-answer" }
	| { type: "choose-pass" }
	| { type: "choose-pressure"; targetPlayerId: string }
	| { type: "submit-answer"; answer?: string; spoken?: boolean }
	| { type: "vote"; accept: boolean }
	| { type: "react"; reaction: Reaction }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicPressureButtonGameState }
	| { type: "player-joined"; player: PressureButtonPlayer }
	| { type: "player-left"; playerId: string }
	| { type: "game-over" }
	| { type: "game-restarted" }
	| ReactionMessage
	| { type: "error"; message: string };

/** No vote counts as accept, and a tie is accepted. */
export function verdictOf(voterIds: string[], votes: Record<string, boolean>): boolean {
	const rejects = voterIds.filter((id) => votes[id] === false).length;
	return rejects * 2 <= voterIds.length;
}

function clampAnswerTime(value: string | null): number {
	return Math.max(15, Math.min(60, Number.parseInt(value || "25", 10)));
}

function clampTurns(value: string | null): number {
	return Math.max(4, Math.min(16, Number.parseInt(value || "8", 10)));
}

function parsePromptPack(value: string | null): PressurePromptPack {
	if (
		value === "mixed" ||
		value === "awkward" ||
		value === "exposed" ||
		value === "panic" ||
		value === "dating" ||
		value === "chaos"
	) {
		return value;
	}

	return "mixed";
}

class PressureButtonParty implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.joins = new JoinVerifier(room);
	}
	joins: JoinVerifier;

	state: PressureButtonGameState | null = null;
	reactedAt = new Map<string, number>();
	gameNightMembers = new WeakMap<Party.Connection, GameNightMember>();

	async onStart() {
		const stored = await this.room.storage.get<PressureButtonGameState>("state");
		if (stored) {
			stored.playerOrder ??= Object.values(stored.players)
				.sort((left, right) => left.joinedAt - right.joinedAt)
				.map((player) => player.id);
			stored.paceSeq ??= 0;
			stored.history ??= [];
			stored.voterIds ??= [];
			stored.votes ??= {};
			stored.scoreChanges ??= {};
			stored.answer ??= null;
			stored.outcome ??= null;
			stored.mode ??= stored.pressuredByPlayerId ? "pressure" : stored.responderId ? "answer" : null;
			for (const player of Object.values(stored.players)) {
				player.passesLeft ??= PASSES_PER_GAME;
			}
			// A reveal saved before reveals were paced (its points already landed) just hands off.
			stored.reveal ??= stored.status === "reveal"
				? { seq: ++stored.paceSeq, stage: "handoff", endsAt: Date.now() + PACE_MS.handoff, nextPlayerId: null }
				: null;
			this.state = stored;
			for (const player of Object.values(this.state.players)) {
				player.connected = false;
			}
			await this.saveState();
			await this.scheduleAlarm();
		}
	}

	/** The alarm drives the answer clock and the reveal beats. */
	async scheduleAlarm() {
		const s = this.state;
		const at =
			s?.status === "answering" && s.turnStartedAt
				? s.turnStartedAt + s.settings.answerTimeLimit * 1000
				: s?.status === "reveal"
					? (s.reveal?.endsAt ?? null)
					: null;
		if (at) await this.room.storage.setAlarm(Math.max(Date.now() + 10, at));
		else await this.room.storage.deleteAlarm();
	}

	async saveState() {
		if (this.state) {
			await this.room.storage.put("state", this.state);
		}
	}

	async commit() {
		await this.saveState();
		await this.scheduleAlarm();
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	getOrderedPlayerIds() {
		if (!this.state) {
			return [];
		}

		return this.state.playerOrder.filter((playerId) => this.state?.players[playerId]);
	}

	/** Whose hot seat turn `turnNumber` is: rotates through the seats, skipping anyone away. */
	pickActive(turnNumber: number): string | null {
		const s = this.state;
		const ordered = this.getOrderedPlayerIds();
		if (!s || ordered.length < 2) return null;
		const startingIndex = (turnNumber - 1) % ordered.length;
		for (let offset = 0; offset < ordered.length; offset++) {
			const candidateId = ordered[(startingIndex + offset) % ordered.length]!;
			if (s.players[candidateId]?.connected !== false) return candidateId;
		}
		return null;
	}

	getPublicState(): PublicPressureButtonGameState {
		if (!this.state) {
			throw new Error("No game state");
		}

		const s = this.state;
		const stage = s.status === "reveal" ? (s.reveal?.stage ?? null) : null;
		const finished = s.status === "finished";
		// Each part of the turn leaves the server only once its beat starts.
		const tallied = finished || stage === "tally" || stage === "result" || stage === "handoff";
		const resulted = finished || stage === "result" || stage === "handoff";

		return {
			roomCode: s.roomCode,
			hostId: s.hostId,
			players: s.players,
			status: s.status,
			maxPlayers: s.maxPlayers,
			settings: s.settings,
			turnNumber: s.turnNumber,
			activePlayerId: s.activePlayerId,
			responderId: s.responderId,
			pressuredByPlayerId: s.pressuredByPlayerId,
			mode: s.mode,
			prompt: s.prompt,
			usedPromptIds: s.usedPromptIds,
			answer: stage || finished ? s.answer : null,
			voterIds: s.voterIds,
			votedIds: Object.keys(s.votes),
			votes: tallied ? s.votes : {},
			outcome: resulted ? s.outcome : null,
			scoreChanges: resulted ? s.scoreChanges : {},
			reveal: s.reveal,
			history: s.history,
			playerOrder: this.getOrderedPlayerIds(),
			startedAt: s.startedAt,
			turnStartedAt: s.turnStartedAt,
			finishedAt: s.finishedAt,
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

	async startTurn() {
		const s = this.state;
		if (!s) {
			return;
		}

		const activePlayerId = this.pickActive(s.turnNumber);
		if (!activePlayerId) {
			// Fewer than two players left: nothing to play.
			if (this.getOrderedPlayerIds().length < 2) await this.finishGame();
			return;
		}

		const orderedPlayers = this.getOrderedPlayerIds();
		const prompt = pickPressurePrompt(s.settings.promptPack, s.usedPromptIds, {
			activePlayerName: s.players[activePlayerId]?.name ?? null,
			playerNames: orderedPlayers
				.map((playerId) => s.players[playerId]?.name ?? "")
				.filter(Boolean),
		});

		s.status = "decision";
		s.activePlayerId = activePlayerId;
		s.responderId = null;
		s.pressuredByPlayerId = null;
		s.mode = null;
		s.prompt = prompt;
		s.usedPromptIds = [...s.usedPromptIds, prompt.id];
		this.clearTurn();
		await this.commit();
	}

	clearTurn() {
		const s = this.state;
		if (!s) return;
		s.answer = null;
		s.voterIds = [];
		s.votes = {};
		s.outcome = null;
		s.scoreChanges = {};
		s.reveal = null;
		s.turnStartedAt = null;
	}

	async moveToAnswering(responderId: string, pressuredByPlayerId: string | null) {
		const s = this.state;
		if (!s) {
			return;
		}

		s.status = "answering";
		s.mode = pressuredByPlayerId ? "pressure" : "answer";
		s.responderId = responderId;
		s.pressuredByPlayerId = pressuredByPlayerId;
		this.clearTurn();
		s.turnStartedAt = Date.now() + (pressuredByPlayerId ? PACE_MS.potato : 0);
		await this.commit();
	}

	beat(stage: RevealStage, ms: number | null, nextPlayerId: string | null = null) {
		const s = this.state;
		if (!s) return;
		s.status = "reveal";
		s.reveal = {
			seq: ++s.paceSeq,
			stage,
			endsAt: ms === null ? null : Date.now() + ms,
			nextPlayerId,
		};
	}

	/** Works out the points; they only land at the handoff. */
	settle(outcome: TurnOutcome) {
		const s = this.state;
		if (!s) return;
		const scoreChanges: Record<string, number> = {};
		if (outcome !== "passed" && s.responderId) {
			const success = outcome === "accepted";
			if (s.pressuredByPlayerId) {
				if (success) scoreChanges[s.responderId] = POINTS.pressuredAccepted;
				else scoreChanges[s.pressuredByPlayerId] = POINTS.pressureLanded;
			} else {
				scoreChanges[s.responderId] = success ? POINTS.selfAccepted : POINTS.selfFailed;
			}
		}
		s.outcome = outcome;
		s.scoreChanges = scoreChanges;
		this.beat("result", PACE_MS.result);
	}

	/** Opens the room's vote on the answer, or accepts it outright with nobody to judge. */
	openVerdict() {
		const s = this.state;
		if (!s) return;
		s.voterIds = this.getOrderedPlayerIds().filter(
			(id) => id !== s.responderId && s.players[id]?.connected !== false,
		);
		s.votes = {};
		if (s.voterIds.length) this.beat("verdict", PACE_MS.verdict);
		else this.settle("accepted");
	}

	closeVerdict() {
		const s = this.state;
		if (!s || s.reveal?.stage !== "verdict") return;
		this.beat("tally", tallyDuration(s.voterIds.length));
	}

	/** Points land, the turn joins the log and the hot seat moves on. */
	landPoints() {
		const s = this.state;
		if (!s || !s.prompt || !s.activePlayerId || !s.outcome) return;
		for (const [playerId, delta] of Object.entries(s.scoreChanges)) {
			const player = s.players[playerId];
			if (player) player.score += delta;
		}
		s.history = [
			...s.history.filter((entry) => entry.turnNumber !== s.turnNumber),
			{
				turnNumber: s.turnNumber,
				prompt: s.prompt,
				activePlayerId: s.activePlayerId,
				mode: s.mode ?? "pass",
				responderId: s.responderId,
				pressuredById: s.pressuredByPlayerId,
				answer: s.answer,
				outcome: s.outcome,
				votes: s.votes,
				voterIds: s.voterIds,
				scoreChanges: s.scoreChanges,
			},
		];
		const last = s.turnNumber >= s.settings.turns;
		this.beat("handoff", PACE_MS.handoff, last ? null : this.pickActive(s.turnNumber + 1));
	}

	async advanceReveal() {
		const s = this.state;
		const stage = s?.status === "reveal" ? s.reveal?.stage : null;
		if (!s || !stage) return;
		if (stage === "flip") {
			this.openVerdict();
		} else if (stage === "verdict") {
			this.closeVerdict();
		} else if (stage === "tally") {
			this.settle(verdictOf(s.voterIds, s.votes) ? "accepted" : "rejected");
		} else if (stage === "result") {
			this.landPoints();
		} else if (stage === "handoff") {
			if (s.turnNumber >= s.settings.turns) {
				await this.finishGame();
			} else {
				s.turnNumber += 1;
				await this.startTurn();
			}
			return;
		}
		await this.commit();
	}

	async timeOut() {
		const s = this.state;
		if (!s || s.status !== "answering") return;
		this.settle("timed-out");
		await this.commit();
	}

	async pass() {
		const s = this.state;
		if (!s || s.status !== "decision") return;
		s.mode = "pass";
		this.settle("passed");
		await this.commit();
	}

	async finishGame() {
		const s = this.state;
		if (!s) {
			return;
		}

		s.status = "finished";
		s.finishedAt = Date.now();
		s.reveal = null;
		await this.room.storage.deleteAlarm();
		await this.saveState();
		this.reportFinish();
		this.broadcast({ type: "game-over" });
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	/** Same winners as the Game Night result: everyone on the top score. */
	reportFinish() {
		if (!this.state) return;
		const players = Object.values(this.state.players);
		const highestScore = Math.max(...players.map((player) => player.score), 0);
		const accounts = this.state.accounts ?? {};
		void reportDirectResult(this.room, {
			resultId: `pressure-button:${this.state.roomCode}:${this.state.startedAt}`,
			game: "pressure-button",
			vsBot: false,
			players: players.map((player) => ({ userId: accounts[player.id], won: player.score === highestScore })),
		});
	}

	async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
		const url = new URL(context.request.url);
		const isHost = url.searchParams.get("host") === "true";
		const gameNight = await validateGameNightConnection(this.room, connection, context, "pressure-button");
		if (gameNight.mode === "invalid") {
			connection.close(1008, "Invalid Game Night connection");
			return;
		}
		if (gameNight.mode === "game-night") this.gameNightMembers.set(connection, gameNight.member);

		if (!this.state && (gameNight.mode === "game-night" ? gameNight.member.isHost : isHost)) {
			this.state = {
				roomCode: this.room.id,
				hostId: connection.id,
				players: {},
				status: "waiting",
				maxPlayers: 10,
				settings: {
					turns: clampTurns(url.searchParams.get("turns")),
					answerTimeLimit: clampAnswerTime(url.searchParams.get("answerTimeLimit")),
					promptPack: parsePromptPack(url.searchParams.get("promptPack")),
				},
				turnNumber: 0,
				activePlayerId: null,
				responderId: null,
				pressuredByPlayerId: null,
				mode: null,
				prompt: null,
				usedPromptIds: [],
				answer: null,
				voterIds: [],
				votes: {},
				outcome: null,
				scoreChanges: {},
				reveal: null,
				paceSeq: 0,
				history: [],
				startedAt: null,
				turnStartedAt: null,
				finishedAt: null,
				playerOrder: [],
			};
			await this.saveState();
		}

		if (!this.state) {
			this.send(connection, { type: "error", message: "Game not found" });
		}
	}

	async onMessage(message: string, sender: Party.Connection) {
		if (!this.state) {
			return;
		}

		try {
			const data: ClientMessage = JSON.parse(message);
			if (data.type !== "join") await this.joins.settled(sender);
			if (!this.state) return;
			const s = this.state;

			switch (data.type) {
				case "join": {
					const member = this.gameNightMembers.get(sender);
					const account = await this.joins.verify(sender, data.authToken);
					if (this.state !== s) return;
					const playerName = member?.name ?? account?.displayName ?? data.name;
					const wasVerified = Boolean(s.accounts?.[sender.id]);
					if (account) s.accounts = { ...s.accounts, [sender.id]: account.userId };
					const returning = markConnected(s.players, sender.id);
					if (returning) {
						// A reconnect, not a new player - never rejected mid-game.
						// A verified player keeps their profile name even if a later join comes without a token.
						if (member || account || !wasVerified) returning.name = playerName || returning.name;
						await this.saveState();
						this.broadcast({ type: "player-joined", player: returning });
						this.broadcast({ type: "state", state: this.getPublicState() });
						break;
					}

					if (s.status !== "waiting") {
						this.send(sender, { type: "error", message: "Game already started" });
						return;
					}

					if (Object.keys(s.players).length >= s.maxPlayers) {
						this.send(sender, { type: "error", message: "Game is full" });
						return;
					}

					const player: PressureButtonPlayer = {
						id: sender.id,
						name: playerName.slice(0, 20),
						score: 0,
						joinedAt: Date.now(),
						passesLeft: PASSES_PER_GAME,
						connected: true,
					};

					s.players[sender.id] = player;
					s.playerOrder.push(sender.id);
					await this.saveState();
					this.broadcast({ type: "player-joined", player });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "start": {
					if (!canControlGame(s.players, s.hostId, sender.id)) {
						this.send(sender, { type: "error", message: "Only host can start" });
						return;
					}

					if (s.status !== "waiting") return;

					if (presentCount(s.players) < 2) {
						this.send(sender, { type: "error", message: "Need at least 2 players" });
						return;
					}

					for (const player of Object.values(s.players)) {
						if (player.connected === false) delete s.players[player.id];
					}

					s.startedAt = Date.now();
					s.finishedAt = null;
					s.turnNumber = 1;
					s.history = [];
					s.playerOrder = s.playerOrder.filter((playerId) => s.players[playerId]);
					for (const player of Object.values(s.players)) {
						player.score = 0;
						player.passesLeft = PASSES_PER_GAME;
					}
					await this.startTurn();
					break;
				}

				case "choose-answer": {
					if (s.status !== "decision" || sender.id !== s.activePlayerId) return;
					await this.moveToAnswering(s.activePlayerId, null);
					break;
				}

				case "choose-pass": {
					if (s.status !== "decision" || sender.id !== s.activePlayerId) return;
					const player = s.players[sender.id];
					if (!player || player.passesLeft <= 0) {
						this.send(sender, { type: "error", message: "No passes left" });
						return;
					}
					player.passesLeft -= 1;
					await this.pass();
					break;
				}

				case "choose-pressure": {
					if (s.status !== "decision" || sender.id !== s.activePlayerId || !s.activePlayerId) return;

					const target = s.players[data.targetPlayerId];
					if (!target || target.connected === false || target.id === s.activePlayerId) {
						this.send(sender, { type: "error", message: "Pick another player to pressure" });
						return;
					}

					await this.moveToAnswering(target.id, s.activePlayerId);
					break;
				}

				case "submit-answer": {
					if (s.status !== "answering" || !s.responderId || sender.id !== s.responderId) return;

					const text = typeof data.answer === "string"
						? data.answer.trim().replace(/\s+/g, " ").slice(0, 120)
						: "";
					if (!data.spoken && text.length < 2) {
						this.send(sender, { type: "error", message: "Type an answer, or tap “Said it out loud”" });
						return;
					}

					s.answer = data.spoken && text.length < 2
						? { text: null, spoken: true }
						: { text, spoken: Boolean(data.spoken) };
					this.beat("flip", PACE_MS.flip);
					await this.commit();
					break;
				}

				case "vote": {
					if (s.status !== "reveal" || s.reveal?.stage !== "verdict") return;
					if (!s.voterIds.includes(sender.id) || sender.id in s.votes) return;
					s.votes = { ...s.votes, [sender.id]: Boolean(data.accept) };
					// Everyone's in: straight to the tally.
					if (s.voterIds.every((id) => id in s.votes)) this.closeVerdict();
					await this.commit();
					break;
				}

				case "react": {
					if (!s.players[sender.id] || !isReaction(data.reaction)) return;
					if (!takeReactionSlot(this.reactedAt, sender.id)) return;
					this.broadcast({ type: "reaction", playerId: sender.id, reaction: data.reaction });
					break;
				}

				case "restart": {
					if (!canControlGame(s.players, s.hostId, sender.id)) {
						this.send(sender, { type: "error", message: "Only host can restart" });
						return;
					}

					s.status = "waiting";
					s.turnNumber = 0;
					s.activePlayerId = null;
					s.responderId = null;
					s.pressuredByPlayerId = null;
					s.mode = null;
					s.prompt = null;
					s.usedPromptIds = [];
					s.history = [];
					s.startedAt = null;
					s.finishedAt = null;
					this.clearTurn();
					await this.room.storage.deleteAlarm();

					for (const player of Object.values(s.players)) {
						player.score = 0;
						player.passesLeft = PASSES_PER_GAME;
					}

					await this.saveState();
					this.broadcast({ type: "game-restarted" });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "leave": {
					if (s.status === "answering" && s.responderId === sender.id) {
						this.settle("timed-out");
					} else if (s.status === "decision" && s.activePlayerId === sender.id) {
						s.mode = "pass";
						this.settle("passed");
					} else if (s.status === "reveal" && s.reveal?.stage === "verdict" && s.voterIds.includes(sender.id)) {
						s.voterIds = s.voterIds.filter((id) => id !== sender.id);
						delete s.votes[sender.id];
						if (s.voterIds.every((id) => id in s.votes)) this.closeVerdict();
					}
					delete s.players[sender.id];
					delete s.accounts?.[sender.id];
					s.playerOrder = s.playerOrder.filter((playerId) => playerId !== sender.id);
					if (Object.keys(s.players).length === 0) {
						this.state = null;
						await this.room.storage.delete("state");
						await this.room.storage.deleteAlarm();
						return;
					}
					if (sender.id === s.hostId) {
						const next = nextHost(s.players, sender.id);
						if (next) s.hostId = next;
					}

					this.broadcast({ type: "player-left", playerId: sender.id });
					await this.commit();
					break;
				}
			}
		} catch (error) {
			console.error("Error processing Pressure Button message:", error);
		}
	}

	async onAlarm() {
		const s = this.state;
		if (!s) return;
		const now = Date.now();
		if (s.status === "answering") {
			const deadline = (s.turnStartedAt ?? 0) + s.settings.answerTimeLimit * 1000;
			if (now < deadline - 300) return this.scheduleAlarm();
			await this.timeOut();
		} else if (s.status === "reveal" && s.reveal?.endsAt) {
			if (now < s.reveal.endsAt - 50) return this.scheduleAlarm();
			await this.advanceReveal();
		}
	}

	async onClose(connection: Party.Connection) {
		this.gameNightMembers.delete(connection);
		if (!this.state || !this.state.players[connection.id]) {
			return;
		}
		const replacementIsOpen = Array.from(this.room.getConnections()).some(
			(candidate) => candidate.id === connection.id && candidate !== connection,
		);
		if (replacementIsOpen) return;

		markDisconnected(this.state.players, connection.id);

		await this.saveState();
		// No "player-left" here: they may be back in a moment, and the client
		// removes players on that message.
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async onRequest(request: Party.Request) {
		const match = await getGameNightResultMatch(this.room, request, "pressure-button");
		if (!match) return new Response("Not found", { status: 404 });
		if (!this.state || this.state.status !== "finished" || this.state.finishedAt === null) {
			return Response.json({ finished: false, scored: false, winnerIds: [] });
		}
		const players = Object.values(this.state.players);
		// Scores can go negative now, so the top score is not floored at zero.
		const highestScore = Math.max(...players.map((player) => player.score));
		return Response.json({
			finished: true,
			scored: players.length > 0,
			winnerIds: players.filter((player) => player.score === highestScore).map((player) => player.id),
		});
	}
}

export default withRoomCleanup(PressureButtonParty, "pressurebutton");
