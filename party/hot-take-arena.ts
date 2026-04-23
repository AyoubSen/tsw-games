import type * as Party from "partykit/server";
import {
	pickHotTakePrompt,
	type HotTakePack,
	type HotTakePrompt,
} from "../src/lib/hotTakePrompts";

export type HotTakePosition = 1 | 2 | 3 | 4 | 5;

export interface HotTakePlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
}

export interface HotTakeSettings {
	rounds: number;
	roundTimeLimit: number;
	promptPack: HotTakePack;
}

interface StoredVote {
	playerId: string;
	position: HotTakePosition;
	submittedAt: number;
}

export interface RevealedVote {
	playerId: string;
	position: HotTakePosition;
}

export interface VoteGroup {
	position: HotTakePosition;
	playerIds: string[];
	points: number;
}

export interface HotTakeGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, HotTakePlayer>;
	status: "waiting" | "voting" | "reveal" | "finished";
	maxPlayers: number;
	settings: HotTakeSettings;
	roundNumber: number;
	prompt: HotTakePrompt | null;
	usedPromptIds: string[];
	votes: Record<string, StoredVote>;
	voteGroups: VoteGroup[];
	startedAt: number | null;
	roundStartedAt: number | null;
	finishedAt: number | null;
}

export interface PublicHotTakeGameState {
	roomCode: string;
	hostId: string;
	players: Record<string, HotTakePlayer>;
	status: HotTakeGameState["status"];
	maxPlayers: number;
	settings: HotTakeSettings;
	roundNumber: number;
	prompt: HotTakePrompt | null;
	usedPromptIds: string[];
	submittedPlayerIds: string[];
	revealedVotes: RevealedVote[];
	voteGroups: VoteGroup[];
	startedAt: number | null;
	roundStartedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string }
	| { type: "start" }
	| { type: "submit-vote"; position: HotTakePosition }
	| { type: "next-round" }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicHotTakeGameState }
	| { type: "player-joined"; player: HotTakePlayer }
	| { type: "player-left"; playerId: string }
	| { type: "round-started"; prompt: HotTakePrompt; roundNumber: number }
	| { type: "round-revealed"; voteGroups: VoteGroup[] }
	| { type: "game-over" }
	| { type: "game-restarted" }
	| { type: "error"; message: string };

function clampRoundTime(value: string | null): number {
	return Math.max(20, Math.min(90, Number.parseInt(value || "30", 10)));
}

function clampRounds(value: string | null): number {
	return Math.max(3, Math.min(10, Number.parseInt(value || "5", 10)));
}

function parsePromptPack(value: string | null): HotTakePack {
	if (
		value === "mixed" ||
		value === "food" ||
		value === "social" ||
		value === "dating" ||
		value === "internet" ||
		value === "travel" ||
		value === "chaos"
	) {
		return value;
	}

	return "mixed";
}

function isValidPosition(value: number): value is HotTakePosition {
	return value >= 1 && value <= 5;
}

function buildVoteGroups(votes: Record<string, StoredVote>): VoteGroup[] {
	const grouped = new Map<HotTakePosition, string[]>();

	for (const vote of Object.values(votes)) {
		grouped.set(vote.position, [...(grouped.get(vote.position) ?? []), vote.playerId]);
	}

	return [...grouped.entries()]
		.map(([position, playerIds]) => ({
			position,
			playerIds,
			points: playerIds.length > 1 ? playerIds.length : 0,
		}))
		.sort((left, right) => left.position - right.position);
}

export default class HotTakeArenaParty implements Party.Server {
	constructor(readonly room: Party.Room) {}

	state: HotTakeGameState | null = null;

	async onStart() {
		const stored = await this.room.storage.get<HotTakeGameState>("state");
		if (stored) {
			this.state = stored;
		}
	}

	async saveState() {
		if (this.state) {
			await this.room.storage.put("state", this.state);
		}
	}

	getPublicState(): PublicHotTakeGameState {
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
			submittedPlayerIds: Object.keys(this.state.votes),
			revealedVotes: shouldReveal
				? Object.values(this.state.votes).map((vote) => ({
						playerId: vote.playerId,
						position: vote.position,
					}))
				: [],
			voteGroups: shouldReveal ? this.state.voteGroups : [],
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

	async maybeRevealRound() {
		if (!this.state || this.state.status !== "voting") {
			return;
		}

		if (
			Object.keys(this.state.players).length > 0 &&
			Object.keys(this.state.votes).length === Object.keys(this.state.players).length
		) {
			await this.revealRound();
		}
	}

	async startRound() {
		if (!this.state) {
			return;
		}

		const prompt = pickHotTakePrompt(
			this.state.settings.promptPack,
			this.state.usedPromptIds,
		);

		this.state.status = "voting";
		this.state.prompt = prompt;
		this.state.usedPromptIds = [...this.state.usedPromptIds, prompt.id];
		this.state.votes = {};
		this.state.voteGroups = [];
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
		if (!this.state || this.state.status !== "voting") {
			return;
		}

		const voteGroups = buildVoteGroups(this.state.votes);

		for (const group of voteGroups) {
			if (group.points === 0) {
				continue;
			}

			for (const playerId of group.playerIds) {
				const player = this.state.players[playerId];
				if (player) {
					player.score += group.points;
				}
			}
		}

		this.state.status = "reveal";
		this.state.voteGroups = voteGroups;
		await this.room.storage.deleteAlarm();
		await this.saveState();

		this.broadcast({ type: "round-revealed", voteGroups });
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
				votes: {},
				voteGroups: [],
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

					const player: HotTakePlayer = {
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
					this.state.finishedAt = null;
					for (const player of Object.values(this.state.players)) {
						player.score = 0;
					}
					await this.startRound();
					break;
				}

				case "submit-vote": {
					if (this.state.status !== "voting") {
						return;
					}

					const player = this.state.players[sender.id];
					if (!player) {
						return;
					}

					if (!isValidPosition(data.position)) {
						this.send(sender, {
							type: "error",
							message: "Invalid vote position",
						});
						return;
					}

					this.state.votes[sender.id] = {
						playerId: sender.id,
						position: data.position,
						submittedAt: Date.now(),
					};

					await this.saveState();
					await this.maybeRevealRound();
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
					this.state.votes = {};
					this.state.voteGroups = [];
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
					delete this.state.votes[sender.id];

					if (sender.id === this.state.hostId) {
						const remaining = Object.keys(this.state.players);
						if (remaining.length > 0) {
							this.state.hostId = remaining[0];
						}
					}

					await this.saveState();
					this.broadcast({ type: "player-left", playerId: sender.id });
					await this.maybeRevealRound();
					this.broadcast({ type: "state", state: this.getPublicState() });
					break;
				}
			}
		} catch (error) {
			console.error("Error processing Hot Take Arena message:", error);
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
		delete this.state.votes[connection.id];

		if (connection.id === this.state.hostId) {
			const remaining = Object.keys(this.state.players);
			if (remaining.length > 0) {
				this.state.hostId = remaining[0];
			}
		}

		await this.saveState();
		this.broadcast({ type: "player-left", playerId: connection.id });
		await this.maybeRevealRound();
		this.broadcast({ type: "state", state: this.getPublicState() });
	}
}
