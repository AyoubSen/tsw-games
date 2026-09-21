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

export interface PressureButtonPlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
	/** False while their socket is away; they are not removed from the game. */
	connected?: boolean;
}

export interface PressureButtonSettings {
	turns: number;
	answerTimeLimit: number;
	promptPack: PressurePromptPack;
}

interface SubmittedAnswer {
	playerId: string;
	text: string;
	submittedAt: number;
}

export interface PressureRoundResult {
	mode: "answer" | "pass" | "pressure";
	activePlayerId: string;
	responderId: string | null;
	pressuredPlayerId: string | null;
	answerText: string | null;
	outcome: "answered" | "passed" | "timed-out";
	scoreChanges: Record<string, number>;
}

export interface PressureButtonGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, PressureButtonPlayer>;
	status: "waiting" | "decision" | "answering" | "reveal" | "finished";
	maxPlayers: number;
	settings: PressureButtonSettings;
	turnNumber: number;
	activePlayerId: string | null;
	responderId: string | null;
	pressuredByPlayerId: string | null;
	prompt: PressurePrompt | null;
	usedPromptIds: string[];
	currentAnswer: SubmittedAnswer | null;
	roundResult: PressureRoundResult | null;
	startedAt: number | null;
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
	prompt: PressurePrompt | null;
	usedPromptIds: string[];
	currentAnswerText: string | null;
	roundResult: PressureRoundResult | null;
	startedAt: number | null;
	turnStartedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string }
	| { type: "start" }
	| { type: "choose-answer" }
	| { type: "choose-pass" }
	| { type: "choose-pressure"; targetPlayerId: string }
	| { type: "submit-answer"; answer: string }
	| { type: "next-turn" }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicPressureButtonGameState }
	| { type: "player-joined"; player: PressureButtonPlayer }
	| { type: "player-left"; playerId: string }
	| { type: "turn-started"; prompt: PressurePrompt; turnNumber: number; activePlayerId: string }
	| { type: "decision-made"; responderId: string | null; pressuredByPlayerId: string | null; mode: "answer" | "pass" | "pressure" }
	| { type: "turn-revealed"; result: PressureRoundResult }
	| { type: "game-over" }
	| { type: "game-restarted" }
	| { type: "error"; message: string };

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
	constructor(readonly room: Party.Room) {}

	state: PressureButtonGameState | null = null;
	gameNightMembers = new WeakMap<Party.Connection, GameNightMember>();

	async onStart() {
		const stored = await this.room.storage.get<PressureButtonGameState>("state");
		if (stored) {
			stored.playerOrder ??= Object.values(stored.players)
				.sort((left, right) => left.joinedAt - right.joinedAt)
				.map((player) => player.id);
			this.state = stored;
			for (const player of Object.values(this.state.players)) {
				player.connected = false;
			}
			await this.saveState();
		}
	}

	async saveState() {
		if (this.state) {
			await this.room.storage.put("state", this.state);
		}
	}

	getOrderedPlayerIds() {
		if (!this.state) {
			return [];
		}

		return this.state.playerOrder.filter((playerId) => this.state?.players[playerId]);
	}

	getPublicState(): PublicPressureButtonGameState {
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
			turnNumber: this.state.turnNumber,
			activePlayerId: this.state.activePlayerId,
			responderId: this.state.responderId,
			pressuredByPlayerId: this.state.pressuredByPlayerId,
			prompt: this.state.prompt,
			usedPromptIds: this.state.usedPromptIds,
			currentAnswerText: shouldReveal ? this.state.currentAnswer?.text ?? null : null,
			roundResult: shouldReveal ? this.state.roundResult : null,
			startedAt: this.state.startedAt,
			turnStartedAt: this.state.turnStartedAt,
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

	async startTurn() {
		if (!this.state) {
			return;
		}

		const orderedPlayers = this.getOrderedPlayerIds();
		if (orderedPlayers.length < 2) {
			return;
		}

		const startingIndex = (this.state.turnNumber - 1) % orderedPlayers.length;
		let activePlayerId: string | null = null;
		for (let offset = 0; offset < orderedPlayers.length; offset++) {
			const candidateId = orderedPlayers[(startingIndex + offset) % orderedPlayers.length];
			if (this.state.players[candidateId]?.connected !== false) {
				activePlayerId = candidateId;
				break;
			}
		}
		if (!activePlayerId) {
			return;
		}

		const prompt = pickPressurePrompt(
			this.state.settings.promptPack,
			this.state.usedPromptIds,
			{
				activePlayerName: this.state.players[activePlayerId]?.name ?? null,
				playerNames: orderedPlayers
					.map((playerId) => this.state?.players[playerId]?.name ?? "")
					.filter(Boolean),
			},
		);

		this.state.status = "decision";
		this.state.activePlayerId = activePlayerId;
		this.state.responderId = null;
		this.state.pressuredByPlayerId = null;
		this.state.prompt = prompt;
		this.state.usedPromptIds = [...this.state.usedPromptIds, prompt.id];
		this.state.currentAnswer = null;
		this.state.roundResult = null;
		this.state.turnStartedAt = null;

		await this.room.storage.deleteAlarm();
		await this.saveState();
		this.broadcast({
			type: "turn-started",
			prompt,
			turnNumber: this.state.turnNumber,
			activePlayerId,
		});
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async moveToAnswering(responderId: string, pressuredByPlayerId: string | null) {
		if (!this.state) {
			return;
		}

		this.state.status = "answering";
		this.state.responderId = responderId;
		this.state.pressuredByPlayerId = pressuredByPlayerId;
		this.state.currentAnswer = null;
		this.state.roundResult = null;
		this.state.turnStartedAt = Date.now();

		await this.saveState();
		this.room.storage.setAlarm(
			Date.now() + this.state.settings.answerTimeLimit * 1000,
		);
		this.broadcast({
			type: "decision-made",
			responderId,
			pressuredByPlayerId,
			mode: pressuredByPlayerId ? "pressure" : "answer",
		});
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async revealResult(result: PressureRoundResult) {
		if (!this.state) {
			return;
		}

		for (const [playerId, delta] of Object.entries(result.scoreChanges)) {
			const player = this.state.players[playerId];
			if (player) {
				player.score += delta;
			}
		}

		this.state.status = "reveal";
		this.state.roundResult = result;
		await this.room.storage.deleteAlarm();
		await this.saveState();
		this.broadcast({ type: "turn-revealed", result });
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async revealPass() {
		if (!this.state || !this.state.activePlayerId) {
			return;
		}

		await this.revealResult({
			mode: "pass",
			activePlayerId: this.state.activePlayerId,
			responderId: null,
			pressuredPlayerId: null,
			answerText: null,
			outcome: "passed",
			scoreChanges: {},
		});
	}

	async revealTimedOut() {
		if (!this.state || !this.state.activePlayerId) {
			return;
		}

		const scoreChanges: Record<string, number> = {};
		if (this.state.pressuredByPlayerId) {
			scoreChanges[this.state.pressuredByPlayerId] = 2;
		}

		await this.revealResult({
			mode: this.state.pressuredByPlayerId ? "pressure" : "answer",
			activePlayerId: this.state.activePlayerId,
			responderId: this.state.responderId,
			pressuredPlayerId: this.state.pressuredByPlayerId
				? this.state.responderId
				: null,
			answerText: null,
			outcome: "timed-out",
			scoreChanges,
		});
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
				prompt: null,
				usedPromptIds: [],
				currentAnswer: null,
				roundResult: null,
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

					const player: PressureButtonPlayer = {
						id: sender.id,
						name: member?.name ?? data.name.slice(0, 20),
						score: 0,
						joinedAt: Date.now(),
						connected: true,
					};

					this.state.players[sender.id] = player;
					this.state.playerOrder.push(sender.id);
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
					this.state.finishedAt = null;
					this.state.turnNumber = 1;
					this.state.playerOrder = this.state.playerOrder.filter(
						(playerId) => this.state?.players[playerId]?.connected !== false,
					);
					for (const player of Object.values(this.state.players)) {
						player.score = 0;
					}
					await this.startTurn();
					break;
				}

				case "choose-answer": {
					if (
						this.state.status !== "decision" ||
						sender.id !== this.state.activePlayerId ||
						!this.state.activePlayerId
					) {
						return;
					}

					await this.moveToAnswering(this.state.activePlayerId, null);
					break;
				}

				case "choose-pass": {
					if (
						this.state.status !== "decision" ||
						sender.id !== this.state.activePlayerId
					) {
						return;
					}

					this.broadcast({
						type: "decision-made",
						responderId: null,
						pressuredByPlayerId: null,
						mode: "pass",
					});
					await this.revealPass();
					break;
				}

				case "choose-pressure": {
					if (
						this.state.status !== "decision" ||
						sender.id !== this.state.activePlayerId ||
						!this.state.activePlayerId
					) {
						return;
					}

					if (
						!this.state.players[data.targetPlayerId] ||
						this.state.players[data.targetPlayerId].connected === false ||
						data.targetPlayerId === this.state.activePlayerId
					) {
						this.send(sender, {
							type: "error",
							message: "Pick another player to pressure",
						});
						return;
					}

					await this.moveToAnswering(data.targetPlayerId, this.state.activePlayerId);
					break;
				}

				case "submit-answer": {
					if (
						this.state.status !== "answering" ||
						!this.state.responderId ||
						sender.id !== this.state.responderId
					) {
						return;
					}

					const text = data.answer.trim().replace(/\s+/g, " ").slice(0, 120);
					if (text.length < 2) {
						this.send(sender, {
							type: "error",
							message: "Answer needs at least 2 characters",
						});
						return;
					}

					this.state.currentAnswer = {
						playerId: sender.id,
						text,
						submittedAt: Date.now(),
					};

					const scoreChanges: Record<string, number> = {};
					scoreChanges[sender.id] = this.state.pressuredByPlayerId ? 3 : 2;

					await this.revealResult({
						mode: this.state.pressuredByPlayerId ? "pressure" : "answer",
						activePlayerId: this.state.activePlayerId ?? sender.id,
						responderId: sender.id,
						pressuredPlayerId: this.state.pressuredByPlayerId ? sender.id : null,
						answerText: text,
						outcome: "answered",
						scoreChanges,
					});
					break;
				}

				case "next-turn": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
						this.send(sender, {
							type: "error",
							message: "Only host can advance turns",
						});
						return;
					}

					if (this.state.status !== "reveal") {
						return;
					}

					if (this.state.turnNumber >= this.state.settings.turns) {
						await this.finishGame();
						return;
					}

					this.state.turnNumber += 1;
					await this.startTurn();
					break;
				}

				case "restart": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
						this.send(sender, { type: "error", message: "Only host can restart" });
						return;
					}

					this.state.status = "waiting";
					this.state.turnNumber = 0;
					this.state.activePlayerId = null;
					this.state.responderId = null;
					this.state.pressuredByPlayerId = null;
					this.state.prompt = null;
					this.state.usedPromptIds = [];
					this.state.currentAnswer = null;
					this.state.roundResult = null;
					this.state.startedAt = null;
					this.state.turnStartedAt = null;
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
					if (
						this.state.status === "answering" &&
						this.state.responderId === sender.id
					) {
						await this.revealTimedOut();
					} else if (
						this.state.status === "decision" &&
						this.state.activePlayerId === sender.id
					) {
						await this.revealPass();
					}
					delete this.state.players[sender.id];
					this.state.playerOrder = this.state.playerOrder.filter(
						(playerId) => playerId !== sender.id,
					);
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
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}
			}
		} catch (error) {
			console.error("Error processing Pressure Button message:", error);
		}
	}

	async onAlarm() {
		await this.revealTimedOut();
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
		const highestScore = Math.max(...players.map((player) => player.score), 0);
		return Response.json({
			finished: true,
			scored: true,
			winnerIds: players.filter((player) => player.score === highestScore).map((player) => player.id),
		});
	}
}

export default withRoomCleanup(PressureButtonParty, "pressurebutton");
