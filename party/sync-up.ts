import type * as Party from "partykit/server";
import {
	normalizeSyncUpAnswer,
	pickSyncUpPrompt,
	type SyncUpPrompt,
	type SyncUpPromptPack,
} from "../src/lib/syncUpPrompts";

export interface SyncUpPlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
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
	normalized: string;
	answers: PublicAnswer[];
	points: number;
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
	revealedAnswers: PublicAnswer[];
	answerGroups: AnswerGroup[];
	startedAt: number | null;
	roundStartedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string }
	| { type: "start" }
	| { type: "submit-answer"; answer: string }
	| { type: "next-round" }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicSyncUpGameState }
	| { type: "player-joined"; player: SyncUpPlayer }
	| { type: "player-left"; playerId: string }
	| { type: "round-started"; prompt: SyncUpPrompt; roundNumber: number }
	| { type: "round-revealed"; answerGroups: AnswerGroup[] }
	| { type: "game-over" }
	| { type: "game-restarted" }
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

	return [...grouped.entries()]
		.map(([normalized, groupAnswers]) => ({
			normalized,
			answers: groupAnswers.sort((left, right) =>
				left.text.localeCompare(right.text),
			),
			points: groupAnswers.length > 1 ? groupAnswers.length : 0,
		}))
		.sort((left, right) => {
			if (right.answers.length !== left.answers.length) {
				return right.answers.length - left.answers.length;
			}

			return left.normalized.localeCompare(right.normalized);
		});
}

export default class SyncUpParty implements Party.Server {
	constructor(readonly room: Party.Room) {}

	state: SyncUpGameState | null = null;

	async onStart() {
		const stored = await this.room.storage.get<SyncUpGameState>("state");
		if (stored) {
			this.state = stored;
		}
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

		const shouldReveal =
			this.state.status === "reveal" || this.state.status === "finished";

		return {
			roomCode: this.state.roomCode,
			hostId: this.state.hostId,
			players: this.state.players,
			status: this.state.status,
			maxPlayers: this.state.maxPlayers,
			settings: this.state.settings,
			roundNumber: this.state.roundNumber,
			prompt: this.state.prompt,
			usedPromptIds: this.state.usedPromptIds,
			submittedPlayerIds: Object.keys(this.state.answers),
			revealedAnswers: shouldReveal
				? Object.values(this.state.answers).map((answer) => ({
						playerId: answer.playerId,
						text: answer.text,
						normalized: answer.normalized,
					}))
				: [],
			answerGroups: shouldReveal ? this.state.answerGroups : [],
			startedAt: this.state.startedAt,
			roundStartedAt: this.state.roundStartedAt,
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
		this.state.roundStartedAt = Date.now();

		await this.saveState();
		this.room.storage.setAlarm(
			Date.now() + this.state.settings.roundTimeLimit * 1000,
		);
		this.broadcast({
			type: "round-started",
			prompt,
			roundNumber: this.state.roundNumber,
		});
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async revealRound() {
		if (!this.state || this.state.status !== "submitting") {
			return;
		}

		const answerGroups = buildAnswerGroups(this.state.answers);

		for (const group of answerGroups) {
			if (group.points === 0) {
				continue;
			}

			for (const answer of group.answers) {
				const player = this.state.players[answer.playerId];
				if (player) {
					player.score += group.points;
				}
			}
		}

		this.state.status = "reveal";
		this.state.answerGroups = answerGroups;
		await this.room.storage.deleteAlarm();
		await this.saveState();

		this.broadcast({ type: "round-revealed", answerGroups });
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async finishGame() {
		if (!this.state) {
			return;
		}

		this.state.status = "finished";
		this.state.finishedAt = Date.now();
		await this.room.storage.deleteAlarm();
		await this.saveState();
		this.broadcast({ type: "game-over" });
		this.broadcast({ type: "state", state: this.getPublicState() });
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
				startedAt: null,
				roundStartedAt: null,
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

					const player: SyncUpPlayer = {
						id: sender.id,
						name: data.name.slice(0, 20),
						score: 0,
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

					this.state.startedAt = Date.now();
					this.state.roundNumber = 1;
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
					if (!player) {
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

					this.state.answers[sender.id] = {
						playerId: sender.id,
						text,
						normalized,
						submittedAt: Date.now(),
					};

					await this.saveState();

					if (
						Object.keys(this.state.answers).length ===
						Object.keys(this.state.players).length
					) {
						await this.revealRound();
						return;
					}

					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}

				case "next-round": {
					if (sender.id !== this.state.hostId) {
						this.send(sender, {
							type: "error",
							message: "Only host can advance rounds",
						});
						return;
					}

					if (this.state.status !== "reveal") {
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
					if (sender.id !== this.state.hostId) {
						this.send(sender, { type: "error", message: "Only host can restart" });
						return;
					}

					this.state.status = "waiting";
					this.state.roundNumber = 0;
					this.state.prompt = null;
					this.state.usedPromptIds = [];
					this.state.answers = {};
					this.state.answerGroups = [];
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
					delete this.state.answers[sender.id];

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
			}
		} catch (error) {
			console.error("Error processing Sync Up message:", error);
		}
	}

	async onAlarm() {
		await this.revealRound();
	}

	async onClose(connection: Party.Connection) {
		if (!this.state || !this.state.players[connection.id]) {
			return;
		}

		delete this.state.players[connection.id];
		delete this.state.answers[connection.id];

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

