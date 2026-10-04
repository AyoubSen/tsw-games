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
	normalizeSyncUpAnswer,
	pickSyncUpPrompt,
	type SyncUpPrompt,
	type SyncUpPromptPack,
} from "../src/lib/syncUpPrompts";
import {
	getGameNightResultMatch,
	validateGameNightConnection,
	type GameNightMember,
} from "./shared/gameNight";
import {
	isReaction,
	takeReactionSlot,
	type Reaction,
	type ReactionMessage,
} from "../src/lib/reactions";

export interface SyncUpPlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
	/** False while their socket is away; they are not removed from the game. */
	connected?: boolean;
}

export interface SyncUpSettings {
	rounds: number;
	roundTimeLimit: number;
	promptPack: SyncUpPromptPack;
}

interface StoredAnswer {
	playerId: string;
	text: string;
	normalized: string;
	submittedAt: number;
}

export interface PublicAnswer {
	playerId: string;
	text: string;
	normalized: string;
}

export interface AnswerGroup {
	/** The normalized answer the group started from; stays put through merges. */
	id: string;
	answers: PublicAnswer[];
	/** Zero until the score beat. */
	points: number;
	/** Groups the host merged into this one. */
	merged: string[];
}

/**
 * Server-paced reveal beats, advanced by the storage alarm so every client sees
 * the same timeline. Client animations inside a beat must fit these durations.
 */
export const REVEAL_MS = {
	tension: 1800,
	/** Gap between one seat's card taking off and the next. */
	flipStep: 520,
	/** Landing + flip time after the last card takes off. */
	flipLand: 1100,
	cluster: 2200,
	merge: 20000,
	score: 3400,
	/** Score beat when the whole room matched. */
	perfect: 5200,
} as const;

export type RevealStage = "tension" | "flip" | "cluster" | "merge" | "score" | "done";

export interface RevealPace {
	seq: number;
	stage: RevealStage;
	endsAt: number | null;
	/** The latest merge in the merge beat; `n` counts merges this round. */
	merge: { n: number; from: string; into: string } | null;
}

export interface RoundSummary {
	roundNumber: number;
	prompt: SyncUpPrompt;
	groups: AnswerGroup[];
	/** Players in the round who did not answer. */
	missingIds: string[];
}

export function flipDuration(answerCount: number): number {
	return answerCount ? (answerCount - 1) * REVEAL_MS.flipStep + REVEAL_MS.flipLand : 0;
}

/** Everyone in the room landed in one group. */
export function isPerfectSync(groups: AnswerGroup[], playerCount: number): boolean {
	return groups.length === 1 && playerCount >= 2 && groups[0]!.answers.length >= playerCount;
}

export interface SyncUpGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, SyncUpPlayer>;
	status: "waiting" | "submitting" | "reveal" | "finished";
	maxPlayers: number;
	settings: SyncUpSettings;
	roundNumber: number;
	prompt: SyncUpPrompt | null;
	usedPromptIds: string[];
	answers: Record<string, StoredAnswer>;
	answerGroups: AnswerGroup[];
	reveal: RevealPace | null;
	paceSeq: number;
	history: RoundSummary[];
	startedAt: number | null;
	roundStartedAt: number | null;
	finishedAt: number | null;
}

export interface PublicSyncUpGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, SyncUpPlayer>;
	status: SyncUpGameState["status"];
	maxPlayers: number;
	settings: SyncUpSettings;
	roundNumber: number;
	prompt: SyncUpPrompt | null;
	usedPromptIds: string[];
	submittedPlayerIds: string[];
	/** From the flip beat on, in seat (join) order. */
	revealedAnswers: PublicAnswer[];
	/** From the cluster beat on; points from the score beat on. */
	answerGroups: AnswerGroup[];
	reveal: RevealPace | null;
	/** Finished rounds; the current one joins once it has scored. */
	history: RoundSummary[];
	startedAt: number | null;
	roundStartedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string }
	| { type: "start" }
	| { type: "submit-answer"; answer: string }
	| { type: "merge-groups"; from: string; into: string }
	| { type: "skip-merge" }
	| { type: "react"; reaction: Reaction }
	| { type: "next-round" }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicSyncUpGameState }
	| { type: "player-joined"; player: SyncUpPlayer }
	| { type: "player-left"; playerId: string }
	| { type: "round-started"; prompt: SyncUpPrompt; roundNumber: number }
	/** Only to its author: their own answer this round. */
	| { type: "your-answer"; roundNumber: number; text: string }
	| { type: "game-over" }
	| { type: "game-restarted" }
	| ReactionMessage
	| { type: "error"; message: string };

function clampRoundTime(value: string | null): number {
	return Math.max(20, Math.min(90, Number.parseInt(value || "45", 10)));
}

function clampRounds(value: string | null): number {
	return Math.max(3, Math.min(10, Number.parseInt(value || "5", 10)));
}

function parsePromptPack(value: string | null): SyncUpPromptPack {
	if (
		value === "mixed" ||
		value === "chaos" ||
		value === "cozy" ||
		value === "food" ||
		value === "travel" ||
		value === "social"
	) {
		return value;
	}

	return "mixed";
}

/** Biggest group first. */
function sortGroups(groups: AnswerGroup[]): AnswerGroup[] {
	return groups.sort((left, right) => {
		if (right.answers.length !== left.answers.length) {
			return right.answers.length - left.answers.length;
		}

		return left.id.localeCompare(right.id);
	});
}

function buildAnswerGroups(answers: Record<string, StoredAnswer>): AnswerGroup[] {
	const grouped = new Map<string, PublicAnswer[]>();

	for (const answer of Object.values(answers)) {
		const publicAnswer: PublicAnswer = {
			playerId: answer.playerId,
			text: answer.text,
			normalized: answer.normalized,
		};
		grouped.set(answer.normalized, [
			...(grouped.get(answer.normalized) ?? []),
			publicAnswer,
		]);
	}

	return sortGroups(
		[...grouped.entries()].map(([normalized, groupAnswers]) => ({
			id: normalized,
			answers: groupAnswers.sort((left, right) =>
				left.text.localeCompare(right.text),
			),
			points: 0,
			merged: [],
		})),
	);
}

class SyncUpParty implements Party.Server {
	constructor(readonly room: Party.Room) {}

	state: SyncUpGameState | null = null;
	reactedAt = new Map<string, number>();
	gameNightMembers = new WeakMap<Party.Connection, GameNightMember>();

	async onStart() {
		const stored = await this.room.storage.get<SyncUpGameState>("state");
		if (stored) {
			stored.paceSeq ??= 0;
			stored.history ??= [];
			stored.answerGroups = (stored.answerGroups ?? []).map((group) => ({
				...group,
				id: group.id ?? (group as unknown as { normalized: string }).normalized,
				merged: group.merged ?? [],
			}));
			// A reveal saved before reveals were paced just waits for the host.
			stored.reveal ??= stored.status === "reveal"
				? { seq: ++stored.paceSeq, stage: "done", endsAt: null, merge: null }
				: null;
			this.state = stored;
			for (const player of Object.values(this.state.players)) {
				player.connected = false;
			}
			await this.saveState();
			await this.scheduleAlarm();
		}
	}

	/** The alarm drives the answer timer and the reveal beats. */
	async scheduleAlarm() {
		const s = this.state;
		const at =
			s?.status === "submitting" && s.roundStartedAt
				? s.roundStartedAt + s.settings.roundTimeLimit * 1000
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

	getPublicState(): PublicSyncUpGameState {
		if (!this.state) {
			throw new Error("No game state");
		}

		const s = this.state;
		const stage = s.status === "reveal" ? (s.reveal?.stage ?? null) : null;
		const finished = s.status === "finished";
		// Each part of the round leaves the server only once its beat starts.
		const answersShown = finished || (stage !== null && stage !== "tension");
		const groupsShown = finished || stage === "cluster" || stage === "merge" || stage === "score" || stage === "done";
		const scored = s.status !== "reveal" || stage === "score" || stage === "done";
		const seatOrder = (id: string) => s.players[id]?.joinedAt ?? Number.MAX_SAFE_INTEGER;

		return {
			roomCode: s.roomCode,
			hostId: s.hostId,
			players: s.players,
			status: s.status,
			maxPlayers: s.maxPlayers,
			settings: s.settings,
			roundNumber: s.roundNumber,
			prompt: s.prompt,
			usedPromptIds: s.usedPromptIds,
			submittedPlayerIds: Object.keys(s.answers),
			revealedAnswers: answersShown
				? Object.values(s.answers)
						.sort((left, right) => seatOrder(left.playerId) - seatOrder(right.playerId))
						.map((answer) => ({
							playerId: answer.playerId,
							text: answer.text,
							normalized: answer.normalized,
						}))
				: [],
			answerGroups: groupsShown ? s.answerGroups : [],
			reveal: s.reveal,
			history: scored
				? s.history
				: s.history.filter((entry) => entry.roundNumber !== s.roundNumber),
			startedAt: s.startedAt,
			roundStartedAt: s.roundStartedAt,
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

	sendOwnAnswer(connection: Party.Connection) {
		const s = this.state;
		const answer = s?.status === "submitting" ? s.answers[connection.id] : undefined;
		if (s && answer) {
			this.send(connection, { type: "your-answer", roundNumber: s.roundNumber, text: answer.text });
		}
	}

	async maybeRevealRound() {
		if (!this.state || this.state.status !== "submitting") {
			return;
		}

		if (
			Object.keys(this.state.players).length > 0 &&
			Object.keys(this.state.answers).length === Object.keys(this.state.players).length
		) {
			await this.revealRound();
		}
	}

	async startRound() {
		if (!this.state) {
			return;
		}

		const prompt = pickSyncUpPrompt(
			this.state.settings.promptPack,
			this.state.usedPromptIds,
		);

		this.state.status = "submitting";
		this.state.prompt = prompt;
		this.state.usedPromptIds = [...this.state.usedPromptIds, prompt.id];
		this.state.answers = {};
		this.state.answerGroups = [];
		this.state.reveal = null;
		this.state.roundStartedAt = Date.now();

		await this.saveState();
		await this.scheduleAlarm();
		this.broadcast({
			type: "round-started",
			prompt,
			roundNumber: this.state.roundNumber,
		});
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async revealRound() {
		const s = this.state;
		if (!s || s.status !== "submitting") {
			return;
		}

		s.status = "reveal";
		s.answerGroups = buildAnswerGroups(s.answers);
		s.reveal = {
			seq: ++s.paceSeq,
			stage: "tension",
			endsAt: Date.now() + REVEAL_MS.tension,
			merge: null,
		};
		await this.commit();
	}

	/** Moves the reveal on one beat. Points are worked out after the merge beat and land at done. */
	advanceReveal() {
		const s = this.state;
		const reveal = s?.reveal;
		if (!s || s.status !== "reveal" || !reveal) return;
		const next = (stage: RevealStage, ms: number) => {
			s.reveal = { ...reveal, seq: ++s.paceSeq, stage, endsAt: Date.now() + ms };
		};

		if (reveal.stage === "tension") {
			const count = Object.keys(s.answers).length;
			if (count) next("flip", flipDuration(count));
			else this.scoreRound();
		} else if (reveal.stage === "flip") {
			next("cluster", REVEAL_MS.cluster);
		} else if (reveal.stage === "cluster") {
			if (s.answerGroups.length >= 2) next("merge", REVEAL_MS.merge);
			else this.scoreRound();
		} else if (reveal.stage === "merge") {
			this.scoreRound();
		} else if (reveal.stage === "score") {
			this.finishReveal();
		}
	}

	scoreRound() {
		const s = this.state;
		if (!s?.reveal || !s.prompt) return;
		for (const group of s.answerGroups) {
			group.points = group.answers.length > 1 ? group.answers.length : 0;
		}
		const roundNumber = s.roundNumber;
		s.history = [
			...s.history.filter((entry) => entry.roundNumber !== roundNumber),
			{
				roundNumber,
				prompt: s.prompt,
				groups: s.answerGroups,
				missingIds: Object.keys(s.players).filter((playerId) => !s.answers[playerId]),
			},
		];
		if (!s.answerGroups.length) {
			this.finishReveal();
			return;
		}
		const perfect = isPerfectSync(s.answerGroups, Object.keys(s.players).length);
		s.reveal = {
			...s.reveal,
			seq: ++s.paceSeq,
			stage: "score",
			endsAt: Date.now() + (perfect ? REVEAL_MS.perfect : REVEAL_MS.score),
		};
	}

	finishReveal() {
		const s = this.state;
		if (!s?.reveal || s.reveal.stage === "done") return;
		for (const group of s.answerGroups) {
			for (const answer of group.answers) {
				const player = s.players[answer.playerId];
				if (player) player.score += group.points;
			}
		}
		s.reveal = { ...s.reveal, seq: ++s.paceSeq, stage: "done", endsAt: null };
	}

	async commit() {
		await this.saveState();
		await this.scheduleAlarm();
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async finishGame() {
		if (!this.state) {
			return;
		}

		this.state.status = "finished";
		this.state.finishedAt = Date.now();
		this.state.reveal = null;
		await this.room.storage.deleteAlarm();
		await this.saveState();
		this.broadcast({ type: "game-over" });
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
		const url = new URL(context.request.url);
		const isHost = url.searchParams.get("host") === "true";
		const gameNight = await validateGameNightConnection(this.room, connection, context, "sync-up");
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
				maxPlayers: 12,
				settings: {
					rounds: clampRounds(url.searchParams.get("rounds")),
					roundTimeLimit: clampRoundTime(url.searchParams.get("roundTimeLimit")),
					promptPack: parsePromptPack(url.searchParams.get("promptPack")),
				},
				roundNumber: 0,
				prompt: null,
				usedPromptIds: [],
				answers: {},
				answerGroups: [],
				reveal: null,
				paceSeq: 0,
				history: [],
				startedAt: null,
				roundStartedAt: null,
				finishedAt: null,
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

			switch (data.type) {
				case "join": {
					const member = this.gameNightMembers.get(sender);
					const playerName = member?.name ?? data.name;
					const returning = markConnected(this.state.players, sender.id);
					if (returning) {
						// A reconnect, not a new player - never rejected mid-game.
						returning.name = playerName || returning.name;
						await this.saveState();
						this.broadcast({ type: "player-joined", player: returning });
						this.broadcast({ type: "state", state: this.getPublicState() });
						this.sendOwnAnswer(sender);
						break;
					}

					if (this.state.status !== "waiting") {
						this.send(sender, { type: "error", message: "Game already started" });
						return;
					}

					if (Object.keys(this.state.players).length >= this.state.maxPlayers) {
						this.send(sender, { type: "error", message: "Game is full" });
						return;
					}

					const player: SyncUpPlayer = {
						id: sender.id,
						name: member?.name ?? data.name.slice(0, 20),
						score: 0,
						joinedAt: Date.now(),
						connected: true,
					};

					this.state.players[sender.id] = player;
					await this.saveState();
					this.broadcast({ type: "player-joined", player });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "start": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
						this.send(sender, { type: "error", message: "Only host can start" });
						return;
					}

					if (presentCount(this.state.players) < 2) {
						this.send(sender, { type: "error", message: "Need at least 2 players" });
						return;
					}

					for (const player of Object.values(this.state.players)) {
						if (player.connected === false) delete this.state.players[player.id];
					}

					this.state.startedAt = Date.now();
					this.state.roundNumber = 1;
					this.state.finishedAt = null;
					this.state.history = [];
					for (const player of Object.values(this.state.players)) {
						player.score = 0;
					}
					await this.startRound();
					break;
				}

				case "submit-answer": {
					if (this.state.status !== "submitting") {
						return;
					}

					const player = this.state.players[sender.id];
					if (!player || typeof data.answer !== "string") {
						return;
					}

					const text = data.answer.trim().replace(/\s+/g, " ").slice(0, 40);
					const normalized = normalizeSyncUpAnswer(text);

					if (normalized.length < 2) {
						this.send(sender, {
							type: "error",
							message: "Answer needs at least 2 characters",
						});
						return;
					}

					// Re-sending replaces the answer: it stays editable until the round flips.
					this.state.answers[sender.id] = {
						playerId: sender.id,
						text,
						normalized,
						submittedAt: Date.now(),
					};

					await this.saveState();
					this.sendOwnAnswer(sender);
					await this.maybeRevealRound();
					if (this.state.status === "submitting") {
						this.broadcast({ type: "state", state: this.getPublicState() });
					}
					break;
				}

				case "merge-groups": {
					const s = this.state;
					if (!canControlGame(s.players, s.hostId, sender.id)) return;
					if (s.status !== "reveal" || s.reveal?.stage !== "merge") return;
					const from = s.answerGroups.find((group) => group.id === data.from);
					const into = s.answerGroups.find((group) => group.id === data.into);
					if (!from || !into || from === into) return;
					into.answers = [...into.answers, ...from.answers];
					into.merged = [...into.merged, from.id, ...from.merged];
					s.answerGroups = sortGroups(s.answerGroups.filter((group) => group !== from));
					s.reveal = {
						...s.reveal,
						merge: { n: (s.reveal.merge?.n ?? 0) + 1, from: from.id, into: into.id },
					};
					// Nothing left to merge: straight on to scoring.
					if (s.answerGroups.length < 2) this.scoreRound();
					await this.commit();
					break;
				}

				case "skip-merge": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) return;
					if (this.state.status !== "reveal" || this.state.reveal?.stage !== "merge") return;
					this.scoreRound();
					await this.commit();
					break;
				}

				case "react": {
					if (!this.state.players[sender.id] || !isReaction(data.reaction)) return;
					if (!takeReactionSlot(this.reactedAt, sender.id)) return;
					this.broadcast({ type: "reaction", playerId: sender.id, reaction: data.reaction });
					break;
				}

				case "next-round": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
						this.send(sender, {
							type: "error",
							message: "Only host can advance rounds",
						});
						return;
					}

					if (this.state.status !== "reveal" || this.state.reveal?.stage !== "done") {
						return;
					}

					if (this.state.roundNumber >= this.state.settings.rounds) {
						await this.finishGame();
						return;
					}

					this.state.roundNumber += 1;
					await this.startRound();
					break;
				}

				case "restart": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
						this.send(sender, { type: "error", message: "Only host can restart" });
						return;
					}

					this.state.status = "waiting";
					this.state.roundNumber = 0;
					this.state.prompt = null;
					this.state.usedPromptIds = [];
					this.state.answers = {};
					this.state.answerGroups = [];
					this.state.reveal = null;
					this.state.history = [];
					this.state.startedAt = null;
					this.state.roundStartedAt = null;
					this.state.finishedAt = null;
					await this.room.storage.deleteAlarm();

					for (const player of Object.values(this.state.players)) {
						player.score = 0;
					}

					await this.saveState();
					this.broadcast({ type: "game-restarted" });
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "leave": {
					delete this.state.players[sender.id];
					if (this.state.status === "submitting") delete this.state.answers[sender.id];
					if (Object.keys(this.state.players).length === 0) {
						this.state = null;
						await this.room.storage.delete("state");
						await this.room.storage.deleteAlarm();
						return;
					}

					if (sender.id === this.state.hostId) {
						const next = nextHost(this.state.players, sender.id);
						if (next) this.state.hostId = next;
					}

					await this.saveState();
					this.broadcast({ type: "player-left", playerId: sender.id });
					await this.maybeRevealRound();
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}
			}
		} catch (error) {
			console.error("Error processing Sync Up message:", error);
		}
	}

	async onAlarm() {
		const s = this.state;
		if (!s) return;
		const now = Date.now();
		if (s.status === "submitting") {
			const deadline = (s.roundStartedAt ?? 0) + s.settings.roundTimeLimit * 1000;
			if (now < deadline - 500) return this.scheduleAlarm();
			await this.revealRound();
		} else if (s.status === "reveal" && s.reveal?.endsAt) {
			if (now < s.reveal.endsAt - 50) return this.scheduleAlarm();
			this.advanceReveal();
			await this.commit();
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
		const match = await getGameNightResultMatch(this.room, request, "sync-up");
		if (!match) return new Response("Not found", { status: 404 });
		if (!this.state || this.state.status !== "finished" || this.state.finishedAt === null) {
			return Response.json({ finished: false, scored: false, winnerIds: [] });
		}
		const players = Object.values(this.state.players);
		const highestScore = Math.max(...players.map((player) => player.score), 0);
		return Response.json({
			finished: true,
			scored: true,
			winnerIds: players.filter((player) => player.score === highestScore).map((player) => player.id),
		});
	}
}

export default withRoomCleanup(SyncUpParty, "syncup");