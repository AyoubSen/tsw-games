import type * as Party from "partykit/server";
import { withRoomCleanup } from "./shared/cleanup";
import { getGameNightResultMatch, validateGameNightConnection, type GameNightMember } from "./shared/gameNight";
import { JoinVerifier, reportDirectResult } from "./shared/account";
import {
	markConnected,
	markDisconnected,
	presentCount,
	nextHost,
	canControlGame,
} from "./shared/presence";
import {
	generateQuickMathProblem,
	QUICK_MATH_MS,
	QUICK_MATH_ROUND_OPTIONS,
	QUICK_MATH_TIME_OPTIONS,
	levelForRound,
	parseQuickMathAnswer,
} from "../src/lib/quickMath";
import {
	isReaction,
	takeReactionSlot,
	type Reaction,
	type ReactionMessage,
} from "../src/lib/reactions";

export interface QuickMathSettings {
	rounds: number;
	/** Seconds per question. */
	questionTime: number;
}

export interface QuickMathPlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
	/** False while their socket is away; they are not removed from the game. */
	connected?: boolean;
	/** Server-only: the verified account behind this player. */
	userId?: string;
}

export type PublicQuickMathPlayer = Omit<QuickMathPlayer, "userId">;

export interface QuickMathRound {
	number: number;
	level: number;
	text: string;
	answer: number;
	winnerId: string | null;
	/** How long the winner took, from the question appearing. */
	winnerMs: number | null;
	/** Gave a wrong answer; out of this question. */
	lockedOutIds: string[];
}

export type QuickMathPhase = "countdown" | "question" | "reveal";

interface GameState {
	roomCode: string;
	hostId: string;
	players: Record<string, QuickMathPlayer>;
	status: "waiting" | "playing" | "finished";
	phase: QuickMathPhase | null;
	phaseStartedAt: number | null;
	phaseEndsAt: number | null;
	round: QuickMathRound | null;
	history: QuickMathRound[];
	winnerIds: string[];
	startedAt: number | null;
	finishedAt: number | null;
	settings: QuickMathSettings;
	playerTokens: Record<string, string>;
}

export interface PublicQuickMathState {
	roomCode: string;
	hostId: string;
	players: Record<string, PublicQuickMathPlayer>;
	status: GameState["status"];
	phase: QuickMathPhase | null;
	/** Milliseconds left in the phase when this state was sent (clients re-anchor to their own clock). */
	msLeft: number | null;
	/** The answer stays hidden until the question is resolved. */
	round: (Omit<QuickMathRound, "answer"> & { answer: number | null }) | null;
	history: QuickMathRound[];
	winnerIds: string[];
	startedAt: number | null;
	finishedAt: number | null;
	settings: QuickMathSettings;
}

export type ClientMessage =
	| { type: "join"; name: string; authToken?: unknown }
	| { type: "start" }
	| { type: "answer"; value: string }
	| { type: "react"; reaction: Reaction }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicQuickMathState }
	| ReactionMessage
	| { type: "error"; message: string };

function pickOption(value: string | null, options: readonly number[], fallback: number) {
	const parsed = Number.parseInt(value ?? "", 10);
	return options.includes(parsed) ? parsed : fallback;
}

class QuickMathParty implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.joins = new JoinVerifier(room);
	}
	joins: JoinVerifier;

	state: GameState | null = null;
	gameNightMembers = new Map<string, GameNightMember>();
	connectionTokens = new WeakMap<Party.Connection, string>();
	reactedAt = new Map<string, number>();

	async onStart() {
		const stored = await this.room.storage.get<GameState>("state");
		if (stored) {
			this.state = stored;
			for (const player of Object.values(this.state.players)) {
				player.connected = false;
			}
			await this.saveState();
		}
	}

	authenticated(connection: Party.Connection) {
		const token = this.connectionTokens.get(connection);
		return Boolean(this.state && token && this.state.playerTokens[connection.id] === token);
	}

	async saveState() {
		if (this.state) {
			await this.room.storage.put("state", this.state);
		}
	}

	getPublicState(): PublicQuickMathState {
		if (!this.state) {
			throw new Error("No game state");
		}
		const { round, phase } = this.state;
		return {
			roomCode: this.state.roomCode,
			hostId: this.state.hostId,
			players: Object.fromEntries(
				Object.entries(this.state.players).map(([id, { userId: _userId, ...player }]) => [id, player]),
			),
			status: this.state.status,
			phase,
			msLeft: this.state.phaseEndsAt === null ? null : Math.max(0, this.state.phaseEndsAt - Date.now()),
			round: round && { ...round, answer: phase === "question" ? null : round.answer },
			history: this.state.history,
			winnerIds: this.state.winnerIds,
			startedAt: this.state.startedAt,
			finishedAt: this.state.finishedAt,
			settings: this.state.settings,
		};
	}

	broadcastState() {
		if (!this.state) return;
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	broadcast(message: ServerMessage) {
		this.room.broadcast(JSON.stringify(message));
	}

	send(connection: Party.Connection, message: ServerMessage) {
		connection.send(JSON.stringify(message));
	}

	setPhase(phase: QuickMathPhase, duration: number) {
		if (!this.state) return;
		const now = Date.now();
		this.state.phase = phase;
		this.state.phaseStartedAt = now;
		this.state.phaseEndsAt = now + duration;
		void this.room.storage.setAlarm(now + duration);
	}

	startQuestion(number: number) {
		if (!this.state) return;
		const problem = generateQuickMathProblem(levelForRound(number, this.state.settings.rounds), this.state.round?.text);
		this.state.round = {
			number,
			level: problem.level,
			text: problem.text,
			answer: problem.answer,
			winnerId: null,
			winnerMs: null,
			lockedOutIds: [],
		};
		this.setPhase("question", this.state.settings.questionTime * 1000);
	}

	resolveQuestion() {
		if (!this.state?.round) return;
		this.state.history.push({ ...this.state.round, lockedOutIds: [...this.state.round.lockedOutIds] });
		this.setPhase("reveal", QUICK_MATH_MS.reveal);
	}

	/** Everyone still at the table has guessed wrong, so nobody can take it. */
	allLockedOut() {
		if (!this.state?.round) return false;
		const present = Object.values(this.state.players).filter((player) => player.connected !== false);
		return present.length > 0 && present.every((player) => this.state!.round!.lockedOutIds.includes(player.id));
	}

	finish() {
		if (!this.state) return;
		const players = Object.values(this.state.players);
		const best = Math.max(...players.map((player) => player.score), 0);
		this.state.status = "finished";
		this.state.phase = null;
		this.state.phaseStartedAt = null;
		this.state.phaseEndsAt = null;
		this.state.finishedAt = Date.now();
		this.state.winnerIds = best > 0 ? players.filter((player) => player.score === best).map((player) => player.id) : [];
		void this.room.storage.deleteAlarm();
		const winnerIds = this.state.winnerIds;
		void reportDirectResult(this.room, {
			resultId: `quick-math:${this.state.roomCode}:${this.state.startedAt}`,
			game: "quick-math",
			vsBot: false,
			players: players.map((player) => ({ userId: player.userId, won: winnerIds.includes(player.id) })),
		});
	}

	async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
		const url = new URL(context.request.url);
		const token = url.searchParams.get("playerToken") ?? "";
		if (token) this.connectionTokens.set(connection, token);
		const gameNight = await validateGameNightConnection(this.room, connection, context, "quick-math");
		if (gameNight.mode === "invalid") return;
		if (gameNight.mode === "game-night") this.gameNightMembers.set(connection.id, gameNight.member);
		const isHost = url.searchParams.get("host") === "true";

		if ((gameNight.mode === "direct" ? isHost : gameNight.member.isHost) && !this.state) {
			this.state = {
				roomCode: this.room.id,
				hostId: connection.id,
				players: {},
				status: "waiting",
				phase: null,
				phaseStartedAt: null,
				phaseEndsAt: null,
				round: null,
				history: [],
				winnerIds: [],
				startedAt: null,
				finishedAt: null,
				settings: {
					rounds: pickOption(url.searchParams.get("rounds"), QUICK_MATH_ROUND_OPTIONS, 10),
					questionTime: pickOption(url.searchParams.get("questionTime"), QUICK_MATH_TIME_OPTIONS, 12),
				},
				playerTokens: {},
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
			if (data.type !== "join" && !this.authenticated(sender)) {
				this.send(sender, { type: "error", message: "Invalid player session" });
				return;
			}

			switch (data.type) {
				case "join": {
					const token = this.connectionTokens.get(sender);
					if (!token) {
						this.send(sender, { type: "error", message: "Invalid player session" });
						return;
					}
					const rosterName = this.gameNightMembers.get(sender.id)?.name;
					const account = await this.joins.verify(sender, data.authToken);
					if (!this.state) return;
					const name = (rosterName ?? account?.displayName ?? String(data.name ?? "")).trim().slice(0, 20);
					const returning = markConnected(this.state.players, sender.id);
					if (returning) {
						const storedToken = this.state.playerTokens[sender.id];
						if (storedToken && storedToken !== token) {
							returning.connected = false;
							this.send(sender, { type: "error", message: "Invalid player session" });
							return;
						}
						this.state.playerTokens[sender.id] = token;
						// A reconnect, not a new player - never rejected mid-game.
						// A verified player keeps their profile name even if a later join comes without a token.
						if (rosterName || account || !returning.userId) returning.name = name || returning.name;
						if (account) returning.userId = account.userId;
						await this.saveState();
						this.broadcastState();
						break;
					}

					if (this.state.status !== "waiting") {
						this.send(sender, { type: "error", message: "Game already started" });
						return;
					}

					if (Object.keys(this.state.players).length >= 8) {
						this.send(sender, { type: "error", message: "Game is full" });
						return;
					}

					this.state.players[sender.id] = {
						id: sender.id,
						name: name || "Player",
						score: 0,
						joinedAt: Date.now(),
						connected: true,
						userId: account?.userId,
					};
					this.state.playerTokens[sender.id] = token;
					await this.saveState();
					this.broadcastState();
					break;
				}

				case "start": {
					if (this.state.status !== "waiting") return;
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
						else player.score = 0;
					}

					this.state.status = "playing";
					this.state.round = null;
					this.state.history = [];
					this.state.winnerIds = [];
					this.state.startedAt = Date.now();
					this.state.finishedAt = null;
					this.setPhase("countdown", QUICK_MATH_MS.countdown);
					await this.saveState();
					this.broadcastState();
					break;
				}

				case "answer": {
					const round = this.state.round;
					const player = this.state.players[sender.id];
					if (this.state.status !== "playing" || this.state.phase !== "question" || !round || !player) return;
					if (round.lockedOutIds.includes(sender.id)) return;
					const value = parseQuickMathAnswer(data.value);
					if (value === null) {
						this.send(sender, { type: "error", message: "Type a whole number" });
						return;
					}

					if (value === round.answer) {
						round.winnerId = sender.id;
						round.winnerMs = Date.now() - (this.state.phaseStartedAt ?? Date.now());
						player.score += 1;
						this.resolveQuestion();
					} else {
						round.lockedOutIds.push(sender.id);
						if (this.allLockedOut()) this.resolveQuestion();
					}
					await this.saveState();
					this.broadcastState();
					break;
				}

				case "react": {
					if (!this.state.players[sender.id] || !isReaction(data.reaction)) return;
					if (!takeReactionSlot(this.reactedAt, sender.id)) return;
					this.broadcast({ type: "reaction", playerId: sender.id, reaction: data.reaction });
					break;
				}

				case "leave": {
					delete this.state.players[sender.id];
					delete this.state.playerTokens[sender.id];
					if (Object.keys(this.state.players).length === 0) {
						this.state = null;
						await this.room.storage.delete("state");
						await this.room.storage.deleteAlarm();
						return;
					}

					if (sender.id === this.state.hostId) {
						const next = nextHost(this.state.players, sender.id);
						const fallback = Object.values(this.state.players).sort(
							(left, right) => left.joinedAt - right.joinedAt,
						)[0]?.id;
						if (next ?? fallback) this.state.hostId = next ?? fallback!;
					}

					if (this.state.phase === "question" && this.allLockedOut()) this.resolveQuestion();
					await this.saveState();
					this.broadcastState();
					break;
				}

				case "restart": {
					if (this.state.status !== "finished") return;
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) {
						this.send(sender, { type: "error", message: "Only host can restart" });
						return;
					}

					this.state.status = "waiting";
					this.state.phase = null;
					this.state.phaseStartedAt = null;
					this.state.phaseEndsAt = null;
					this.state.round = null;
					this.state.history = [];
					this.state.winnerIds = [];
					this.state.startedAt = null;
					this.state.finishedAt = null;
					for (const player of Object.values(this.state.players)) {
						player.score = 0;
					}
					await this.room.storage.deleteAlarm();
					await this.saveState();
					this.broadcastState();
					break;
				}
			}
		} catch (error) {
			console.error("Error processing Quick Math message:", error);
		}
	}

	async onAlarm() {
		if (!this.state || this.state.status !== "playing" || this.state.phaseEndsAt === null) {
			return;
		}
		// A stale alarm from an earlier phase.
		if (Date.now() < this.state.phaseEndsAt - 100) {
			await this.room.storage.setAlarm(this.state.phaseEndsAt);
			return;
		}

		const nextNumber = (this.state.round?.number ?? 0) + 1;
		if (this.state.phase === "question") this.resolveQuestion();
		else if (nextNumber > this.state.settings.rounds) this.finish();
		else this.startQuestion(nextNumber);

		await this.saveState();
		this.broadcastState();
	}

	async onClose(connection: Party.Connection) {
		if (!this.state || !this.state.players[connection.id]) {
			return;
		}
		const replacementIsOpen = Array.from(this.room.getConnections()).some(
			(candidate) => candidate.id === connection.id && candidate !== connection,
		);
		if (replacementIsOpen) return;
		this.gameNightMembers.delete(connection.id);

		markDisconnected(this.state.players, connection.id);
		if (this.state.phase === "question" && this.allLockedOut()) this.resolveQuestion();

		await this.saveState();
		this.broadcastState();
	}

	async onRequest(request: Party.Request) {
		const match = await getGameNightResultMatch(this.room, request, "quick-math");
		if (!match) return new Response("Not found", { status: 404 });
		const finished = this.state?.status === "finished";
		return Response.json({
			finished,
			scored: true,
			winnerIds: finished ? this.state!.winnerIds : [],
		});
	}
}

export default withRoomCleanup(QuickMathParty, "quickmath");
