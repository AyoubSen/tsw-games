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
	pickHotTakePrompt,
	type HotTakePack,
	type HotTakePrompt,
} from "../src/lib/hotTakePrompts";
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

export type HotTakePosition = 1 | 2 | 3 | 4 | 5;

export interface HotTakePlayer {
	id: string;
	name: string;
	score: number;
	joinedAt: number;
	/** False while their socket is away; they are not removed from the game. */
	connected?: boolean;
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

/**
 * Server-paced reveal beats, advanced by the storage alarm so every client sees
 * the same timeline. Client animations inside a beat must fit these durations.
 */
export const REVEAL_MS = {
	tension: 1800,
	/** Gap between one spectrum position's avatars taking off and the next. */
	flyStep: 750,
	/** Landing time after the last position takes off. */
	flyLand: 900,
	score: 2600,
	spotlight: 15000,
} as const;

export type RevealStage = "tension" | "fly" | "score" | "spotlight" | "done";

export interface RevealPace {
	seq: number;
	stage: RevealStage;
	endsAt: number | null;
	/** Who defends their take in the spotlight beat, if anyone. */
	spotlightId: string | null;
	spotlightReason: "lone-wolf" | "extreme" | null;
}

export interface RoundSummary {
	roundNumber: number;
	prompt: HotTakePrompt;
	votes: RevealedVote[];
	voteGroups: VoteGroup[];
	/** Players in the round who did not vote. */
	abstainedIds: string[];
}

/** Occupied positions in landing order: one at a time from the edges inward. */
export function flyOrder(groups: VoteGroup[]): HotTakePosition[] {
	const order: HotTakePosition[] = [1, 5, 2, 4, 3];
	return order.filter((position) =>
		groups.some((group) => group.position === position),
	);
}

export function flyDuration(groups: VoteGroup[]): number {
	const steps = flyOrder(groups).length;
	return steps ? (steps - 1) * REVEAL_MS.flyStep + REVEAL_MS.flyLand : 0;
}

export interface HotTakeGameState {
	roomCode: string;
	/** Server-only: player id -> verified account. Kept off HotTakePlayer, which is sent to clients as is. */
	accounts?: Record<string, string>;
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
	reveal: RevealPace | null;
	paceSeq: number;
	history: RoundSummary[];
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
	reveal: RevealPace | null;
	/** Finished rounds; the current one joins once its split has been shown. */
	history: RoundSummary[];
	startedAt: number | null;
	roundStartedAt: number | null;
	finishedAt: number | null;
}

export type ClientMessage =
	| { type: "join"; name: string; authToken?: unknown }
	| { type: "start" }
	| { type: "submit-vote"; position: HotTakePosition }
	| { type: "skip-spotlight" }
	| { type: "react"; reaction: Reaction }
	| { type: "next-round" }
	| { type: "restart" }
	| { type: "leave" };

export type ServerMessage =
	| { type: "state"; state: PublicHotTakeGameState }
	| { type: "player-joined"; player: HotTakePlayer }
	| { type: "player-left"; playerId: string }
	| { type: "round-started"; prompt: HotTakePrompt; roundNumber: number }
	| { type: "game-over" }
	| { type: "game-restarted" }
	| ReactionMessage
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

/**
 * The lone wolf furthest from the room (or, with nobody alone, the vote
 * furthest from the average) gets the spotlight. Ties go to the earlier vote.
 */
function pickSpotlight(
	votes: Record<string, StoredVote>,
	groups: VoteGroup[],
): Pick<RevealPace, "spotlightId" | "spotlightReason"> {
	const all = Object.values(votes);
	if (all.length < 2) return { spotlightId: null, spotlightReason: null };
	const mean = all.reduce((sum, vote) => sum + vote.position, 0) / all.length;
	const lone = new Set(
		groups
			.filter((group) => group.playerIds.length === 1)
			.flatMap((group) => group.playerIds),
	);
	const pool = lone.size ? all.filter((vote) => lone.has(vote.playerId)) : all;
	const best = [...pool].sort(
		(left, right) =>
			Math.abs(right.position - mean) - Math.abs(left.position - mean) ||
			left.submittedAt - right.submittedAt,
	)[0];
	if (!best || (!lone.size && Math.abs(best.position - mean) < 0.01)) {
		return { spotlightId: null, spotlightReason: null };
	}
	return {
		spotlightId: best.playerId,
		spotlightReason: lone.size ? "lone-wolf" : "extreme",
	};
}

class HotTakeArenaParty implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.joins = new JoinVerifier(room);
	}
	joins: JoinVerifier;

	state: HotTakeGameState | null = null;
	reactedAt = new Map<string, number>();
	gameNightMembers = new WeakMap<Party.Connection, GameNightMember>();

	async onStart() {
		const stored = await this.room.storage.get<HotTakeGameState>("state");
		if (stored) {
			stored.reveal ??= null;
			stored.paceSeq ??= 0;
			stored.history ??= [];
			this.state = stored;
			for (const player of Object.values(this.state.players)) {
				player.connected = false;
			}
			await this.saveState();
			await this.scheduleAlarm();
		}
	}

	/** The alarm drives the vote timer and the reveal beats. */
	async scheduleAlarm() {
		const s = this.state;
		const at =
			s?.status === "voting" && s.roundStartedAt
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

	getPublicState(): PublicHotTakeGameState {
		if (!this.state) {
			throw new Error("No game state");
		}

		const stage = this.state.reveal?.stage;
		// Nothing about the split leaves the server during the tension hold.
		const shouldReveal =
			(this.state.status === "reveal" && stage !== "tension") ||
			this.state.status === "finished";
		const currentShown =
			this.state.status !== "reveal" || stage === "spotlight" || stage === "done";
		const roundNumber = this.state.roundNumber;
		const history = currentShown
			? this.state.history
			: this.state.history.filter((entry) => entry.roundNumber !== roundNumber);

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
			// Who gets the spotlight would give the split away early.
			reveal:
				this.state.reveal && !currentShown
					? { ...this.state.reveal, spotlightId: null, spotlightReason: null }
					: this.state.reveal,
			history,
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
		if (!s || s.status !== "voting" || !s.prompt) {
			return;
		}

		const voteGroups = buildVoteGroups(s.votes);
		s.status = "reveal";
		s.voteGroups = voteGroups;
		s.reveal = {
			seq: ++s.paceSeq,
			stage: "tension",
			endsAt: Date.now() + REVEAL_MS.tension,
			...pickSpotlight(s.votes, voteGroups),
		};
		s.history = [
			...s.history.filter((entry) => entry.roundNumber !== s.roundNumber),
			{
				roundNumber: s.roundNumber,
				prompt: s.prompt,
				votes: Object.values(s.votes).map((vote) => ({
					playerId: vote.playerId,
					position: vote.position,
				})),
				voteGroups,
				abstainedIds: Object.keys(s.players).filter((playerId) => !s.votes[playerId]),
			},
		];
		await this.commit();
	}

	/** Moves the reveal on one beat. Points land only once the reveal is over. */
	advanceReveal() {
		const s = this.state;
		const reveal = s?.reveal;
		if (!s || s.status !== "reveal" || !reveal) return;
		const next = (stage: RevealStage, ms: number) => {
			s.reveal = { ...reveal, seq: ++s.paceSeq, stage, endsAt: Date.now() + ms };
		};

		if (reveal.stage === "tension") {
			if (s.voteGroups.length) next("fly", flyDuration(s.voteGroups));
			else this.finishReveal();
		} else if (reveal.stage === "fly") {
			next("score", REVEAL_MS.score);
		} else if (
			reveal.stage === "score" &&
			reveal.spotlightId &&
			s.players[reveal.spotlightId]
		) {
			next("spotlight", REVEAL_MS.spotlight);
		} else if (reveal.stage === "score" || reveal.stage === "spotlight") {
			this.finishReveal();
		}
	}

	finishReveal() {
		const s = this.state;
		if (!s?.reveal || s.reveal.stage === "done") return;
		for (const group of s.voteGroups) {
			for (const playerId of group.playerIds) {
				const player = s.players[playerId];
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
			resultId: `hot-take-arena:${this.state.roomCode}:${this.state.startedAt}`,
			game: "hot-take-arena",
			vsBot: false,
			players: players.map((player) => ({ userId: accounts[player.id], won: player.score === highestScore })),
		});
	}

	async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
		const url = new URL(context.request.url);
		const isHost = url.searchParams.get("host") === "true";
		const gameNight = await validateGameNightConnection(this.room, connection, context, "hot-take-arena");
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
				votes: {},
				voteGroups: [],
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
			if (data.type !== "join") await this.joins.settled(sender);
			if (!this.state) return;

			switch (data.type) {
				case "join": {
					const member = this.gameNightMembers.get(sender);
					const account = await this.joins.verify(sender, data.authToken);
					if (!this.state) return;
					const playerName = member?.name ?? account?.displayName ?? data.name;
					const wasVerified = Boolean(this.state.accounts?.[sender.id]);
					if (account) this.state.accounts = { ...this.state.accounts, [sender.id]: account.userId };
					const returning = markConnected(this.state.players, sender.id);
					if (returning) {
						// A reconnect, not a new player - never rejected mid-game.
						// A verified player keeps their profile name even if a later join comes without a token.
						if (member || account || !wasVerified) returning.name = playerName || returning.name;
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

					const player: HotTakePlayer = {
						id: sender.id,
						name: playerName.slice(0, 20),
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

				case "submit-vote": {
					if (this.state.status !== "voting") {
						return;
					}

					const player = this.state.players[sender.id];
					if (!player || this.state.votes[sender.id]) {
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

				case "skip-spotlight": {
					if (!canControlGame(this.state.players, this.state.hostId, sender.id)) return;
					if (this.state.status !== "reveal" || this.state.reveal?.stage !== "spotlight") return;
					this.finishReveal();
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
					this.state.votes = {};
					this.state.voteGroups = [];
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
					delete this.state.accounts?.[sender.id];
					delete this.state.votes[sender.id];
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
			console.error("Error processing Hot Take Arena message:", error);
		}
	}

	async onAlarm() {
		const s = this.state;
		if (!s) return;
		const now = Date.now();
		if (s.status === "voting") {
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
		await this.maybeRevealRound();
		this.broadcast({ type: "state", state: this.getPublicState() });
	}

	async onRequest(request: Party.Request) {
		const match = await getGameNightResultMatch(this.room, request, "hot-take-arena");
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

export default withRoomCleanup(HotTakeArenaParty, "hottakearena");
