import type * as Party from "partykit/server";
import { JoinVerifier, reportResult } from "./shared/account";
import { withRoomCleanup } from "./shared/cleanup";
import {
	computeAwards,
	GAME_NIGHT_GAMES,
	gameNightMisfit,
	getGameNightGame,
	RECAP_MS,
	RECAP_WAIT_MS,
	SPIN_MS,
	VOTE_MS,
	type GameNightClientMessage,
	type GameNightConnection,
	type GameNightGameId,
	type GameNightHistoryEntry,
	type GameNightMatch,
	type GameNightPlayer,
	type GameNightResult,
	type GameNightServerMessage,
	type PublicGameNightState,
} from "../src/lib/gameNight";
import { isReaction, takeReactionSlot } from "../src/lib/reactions";
import { markConnected, markDisconnected, nextHost } from "./shared/presence";

interface GameNightState extends PublicGameNightState {
	playerTokens: Record<string, string>;
	matchTickets: Record<string, string>;
	/** Clerk user ids of signed-in players, by player id. Never sent to clients. */
	accounts?: Record<string, string>;
	/** The night's result has been sent to Convex; a resumed night is not counted twice. */
	reported?: boolean;
}

interface ValidationRequest {
	matchId: string;
	gameId: GameNightGameId;
	roomId: string;
	playerId: string;
	ticket: string;
}

const MAX_PLAYERS = 12;

class GameNightParty implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.joins = new JoinVerifier(room);
	}
	state: GameNightState | null = null;
	connectionTokens = new WeakMap<Party.Connection, string>();
	joins: JoinVerifier;
	reactedAt = new Map<string, number>();

	async onStart() {
		const stored = (await this.room.storage.get<GameNightState>("state")) ?? null;
		if (!stored) return;
		stored.vote ??= null;
		stored.recap ??= null;
		stored.finale ??= null;
		this.state = stored;
		for (const player of Object.values(this.state.players)) {
			player.connected = false;
			player.inLounge = false;
		}
		await this.save();
		await this.scheduleAlarm();
	}

	async save() {
		if (this.state) await this.room.storage.put("state", this.state);
	}

	/** The alarm drives the vote timer, the vote reveal and the recap. */
	async scheduleAlarm() {
		const s = this.state;
		const at = s?.vote ? s.vote.endsAt : s?.recap ? (s.recap.stage === "waiting" ? s.recap.waitUntil : s.recap.endsAt) : null;
		if (at) await this.room.storage.setAlarm(Math.max(Date.now() + 10, at));
		else await this.room.storage.deleteAlarm();
	}

	async commit() {
		if (!this.state) return;
		this.state.revision += 1;
		await this.save();
		await this.scheduleAlarm();
		this.broadcast();
	}

	async onAlarm() {
		const s = this.state;
		if (!s) return;
		const now = Date.now();
		if (s.vote && now >= s.vote.endsAt - 20) {
			if (s.vote.stage === "open") this.lockVote();
			else {
				const winner = s.vote.winner!;
				s.vote = null;
				const problem = this.launch(winner);
				if (problem) this.sendTo(s.hostId, { type: "error", message: problem });
			}
		} else if (s.recap?.stage === "waiting" && s.recap.waitUntil && now >= s.recap.waitUntil - 20) {
			this.startRecap();
		} else if (s.recap?.stage === "playing" && s.recap.endsAt && now >= s.recap.endsAt - 20) {
			s.recap = null;
		}
		await this.commit();
	}

	publicState(): PublicGameNightState {
		if (!this.state) throw new Error("No Game Night state");
		return {
			roomCode: this.state.roomCode,
			hostId: this.state.hostId,
			players: this.state.players,
			activeMatch: this.state.activeMatch,
			history: this.state.history,
			revision: this.state.revision,
			vote: this.state.vote,
			recap: this.state.recap,
			finale: this.state.finale,
		};
	}

	authenticated(connection: Party.Connection) {
		const token = this.connectionTokens.get(connection);
		return Boolean(this.state && token && this.state.playerTokens[connection.id] === token);
	}

	connectionFor(playerId: string): GameNightConnection | null {
		if (!this.state?.activeMatch) return null;
		const match = this.state.activeMatch;
		const player = this.state.players[playerId];
		const ticket = this.state.matchTickets[playerId];
		if (!player || !ticket) return null;
		const isHost = playerId === this.state.hostId;
		return {
			roomCode: this.state.roomCode,
			matchId: match.id,
			gameId: match.gameId,
			roomId: match.roomId,
			playerId,
			playerName: player.name,
			ticket,
			isHost,
			canEnter: match.status !== "launching" || isHost,
		};
	}

	send(connection: Party.Connection, message: GameNightServerMessage) {
		connection.send(JSON.stringify(message));
	}

	sendTo(playerId: string, message: GameNightServerMessage) {
		for (const connection of this.room.getConnections()) {
			if (connection.id === playerId && this.authenticated(connection)) this.send(connection, message);
		}
	}

	broadcast() {
		if (!this.state) return;
		const state = this.publicState();
		for (const connection of this.room.getConnections()) {
			if (this.authenticated(connection)) {
				this.send(connection, { type: "state", state, connection: this.connectionFor(connection.id) });
			}
		}
	}

	async onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
		const url = new URL(context.request.url);
		const token = url.searchParams.get("playerToken") ?? "";
		if (token) this.connectionTokens.set(connection, token);
		if (url.searchParams.get("host") === "true" && !this.state) {
			this.state = {
				roomCode: this.room.id,
				hostId: connection.id,
				players: {},
				playerTokens: {},
				matchTickets: {},
				activeMatch: null,
				history: [],
				revision: 1,
				vote: null,
				recap: null,
				finale: null,
			};
			await this.save();
		}
		if (!this.state) this.send(connection, { type: "error", message: "Game Night room not found" });
	}

	roster() {
		const players = Object.values(this.state?.players ?? {});
		return { players, size: players.length, connected: players.filter((player) => player.connected !== false).length };
	}

	misfit(gameId: GameNightGameId) {
		const { size, connected } = this.roster();
		return gameNightMisfit(gameId, size, connected);
	}

	/** Something is already happening that the picker has to wait for. */
	busy() {
		const s = this.state;
		if (!s) return "No Game Night";
		if (s.finale) return "The night has ended";
		if (s.activeMatch && s.activeMatch.status !== "finished") return "Finish the current game before choosing another";
		if (s.recap) return "The recap is still playing";
		return null;
	}

	/** Starts a match of `gameId`; returns why it couldn't. */
	launch(gameId: GameNightGameId) {
		if (!this.state) return "No Game Night";
		const problem = this.misfit(gameId);
		if (problem) return `${getGameNightGame(gameId)?.title ?? "That game"}: ${problem}`;
		const { players } = this.roster();
		const match: GameNightMatch = {
			id: crypto.randomUUID(),
			gameId,
			roomId: crypto.randomUUID(),
			status: "launching",
			startedAt: Date.now(),
			playerIds: players.map((player) => player.id),
		};
		this.state.activeMatch = match;
		this.state.vote = null;
		this.state.matchTickets = Object.fromEntries(players.map((player) => [player.id, crypto.randomUUID()]));
		return null;
	}

	/** Host picks directly: launches now, or overrides an open vote. */
	async selectGame(gameId: GameNightGameId, sender: Party.Connection) {
		if (!this.state || sender.id !== this.state.hostId) return;
		const vote = this.state.vote;
		if (vote) {
			if (vote.stage !== "open") return;
			const problem = this.misfit(gameId);
			if (problem) return this.send(sender, { type: "error", message: problem });
			const voted = [...new Set(Object.values(vote.votes))];
			vote.stage = "spin";
			vote.candidates = voted.includes(gameId) ? voted : [...voted, gameId];
			vote.winner = gameId;
			vote.hostPick = true;
			vote.endsAt = Date.now() + SPIN_MS;
			return this.commit();
		}
		const busy = this.busy();
		if (busy) return this.send(sender, { type: "error", message: busy });
		const problem = this.launch(gameId);
		if (problem) return this.send(sender, { type: "error", message: problem });
		await this.commit();
	}

	async openVote(options: GameNightGameId[], sender: Party.Connection) {
		if (!this.state || sender.id !== this.state.hostId || this.state.vote) return;
		const busy = this.busy();
		if (busy) return this.send(sender, { type: "error", message: busy });
		const picked = [...new Set(Array.isArray(options) ? options : [])].filter((id) => getGameNightGame(id));
		const any = picked.length === 0;
		if (!any && (picked.length < 2 || picked.length > 4)) return this.send(sender, { type: "error", message: "Pick 2–4 games for the vote" });
		const ballot = any ? GAME_NIGHT_GAMES.map((game) => game.id).filter((id) => !this.misfit(id)) : picked;
		const misfit = ballot.find((id) => this.misfit(id));
		if (misfit) return this.send(sender, { type: "error", message: `${getGameNightGame(misfit)!.title} doesn't fit this room` });
		if (ballot.length < 2) return this.send(sender, { type: "error", message: "Not enough games fit this room for a vote" });
		const now = Date.now();
		this.state.vote = { id: crypto.randomUUID(), options: ballot, any, votes: {}, stage: "open", openedAt: now, endsAt: now + VOTE_MS };
		await this.commit();
	}

	/** Tallies the ballot and starts the reveal spin. */
	lockVote() {
		const vote = this.state?.vote;
		if (!vote || vote.stage !== "open") return;
		const counts = new Map<GameNightGameId, number>();
		for (const gameId of Object.values(vote.votes)) {
			if (vote.options.includes(gameId) && !this.misfit(gameId)) counts.set(gameId, (counts.get(gameId) ?? 0) + 1);
		}
		const fitting = vote.options.filter((id) => !this.misfit(id));
		const top = Math.max(0, ...counts.values());
		const leaders = top > 0 ? [...counts].filter(([, count]) => count === top).map(([id]) => id) : fitting.length ? fitting : vote.options;
		vote.stage = "spin";
		vote.candidates = counts.size > 0 ? [...counts.keys()] : leaders.slice(0, 8);
		vote.winner = leaders[Math.floor(Math.random() * leaders.length)]!;
		if (!vote.candidates.includes(vote.winner)) vote.candidates.push(vote.winner);
		vote.endsAt = Date.now() + SPIN_MS;
	}

	maybeLockVote() {
		const vote = this.state?.vote;
		if (!vote || vote.stage !== "open") return;
		const connected = this.roster().players.filter((player) => player.connected !== false);
		if (connected.length > 0 && connected.every((player) => vote.votes[player.id])) this.lockVote();
	}

	startRecap() {
		const recap = this.state?.recap;
		if (!recap || recap.stage !== "waiting") return;
		const now = Date.now();
		recap.stage = "playing";
		recap.startedAt = now;
		recap.endsAt = now + RECAP_MS;
	}

	/** The recap waits until everyone connected is back in the lounge (or the wait runs out). */
	maybeStartRecap() {
		const recap = this.state?.recap;
		if (!recap || recap.stage !== "waiting") return;
		const connected = this.roster().players.filter((player) => player.connected !== false);
		const back = connected.filter((player) => player.inLounge);
		if (back.length > 0 && recap.waitUntil === null) recap.waitUntil = Date.now() + RECAP_WAIT_MS;
		if (back.length > 0 && back.length === connected.length) this.startRecap();
	}

	async completeMatch(matchId: string, sender: Party.Connection) {
		if (!this.state || !this.authenticated(sender)) return;
		const match = this.state.activeMatch;
		if (!match || match.id !== matchId || match.status !== "ready") return;
		const game = getGameNightGame(match.gameId);
		if (!game) return;
		match.status = "collecting";
		this.state.revision += 1;
		await this.save();
		this.broadcast();
		try {
			const response = await this.room.context.parties[game.party]
				.get(match.roomId)
				.fetch("/game-night-result", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ matchId }),
				});
			if (!response.ok) throw new Error(`Result endpoint returned ${response.status}`);
			const result = (await response.json()) as GameNightResult;
			if (typeof result.finished !== "boolean" || typeof result.scored !== "boolean" || !Array.isArray(result.winnerIds) || !result.winnerIds.every((id) => typeof id === "string")) {
				throw new Error("Invalid result payload");
			}
			if (!result.finished) throw new Error("Result is not ready");
			if (!this.state || this.state.activeMatch?.id !== matchId || this.state.activeMatch.status !== "collecting") return;
			const winnerIds = [...new Set(result.winnerIds)].filter((id) => Boolean(this.state?.players[id]));
			if (result.scored) {
				for (const id of winnerIds) this.state.players[id].wins += 1;
			}
			const history: GameNightHistoryEntry = {
				matchId,
				gameId: match.gameId,
				winnerIds,
				winnerNames: winnerIds.map((id) => this.state!.players[id].name),
				scored: result.scored,
				finishedAt: Date.now(),
				playerIds: (match.playerIds ?? Object.keys(this.state.matchTickets)).filter((id) => Boolean(this.state?.players[id])),
			};
			this.state.history.push(history);
			this.reportMatch(history, result.vsBot === true);
			match.status = "finished";
			this.state.recap = { matchId, stage: "waiting", waitUntil: null, startedAt: null, endsAt: null };
			this.maybeStartRecap();
			await this.commit();
		} catch (error) {
			console.error("Could not collect Game Night result", error);
			if (this.state?.activeMatch?.id === matchId && this.state.activeMatch.status === "collecting") {
				this.state.activeMatch.status = "ready";
				this.state.revision += 1;
				await this.save();
				this.broadcast();
			}
		}
	}

	/** Sends one finished match to Convex under its own game, so every Game Night game shows up in profile stats. */
	reportMatch(entry: GameNightHistoryEntry, vsBot: boolean) {
		const s = this.state;
		if (!s) return;
		const accounts = s.accounts ?? {};
		void reportResult(this.room, {
			resultId: `gamenight-match:${s.roomCode}:${entry.matchId}`,
			game: entry.gameId,
			vsBot,
			players: (entry.playerIds ?? []).flatMap((id) =>
				accounts[id] ? [{ userId: accounts[id], won: entry.scored && entry.winnerIds.includes(id) }] : [],
			),
		});
	}

	/** Sends the finished night to Convex: everyone played, the top scorers won. */
	reportNight() {
		const s = this.state;
		if (!s?.finale || s.reported || s.history.length === 0) return;
		s.reported = true;
		const top = Math.max(0, ...Object.values(s.players).map((player) => player.wins));
		void reportResult(this.room, {
			resultId: `gamenight:${this.room.id}:${s.finale.endedAt}`,
			game: "game-night",
			vsBot: false,
			players: Object.entries(s.accounts ?? {})
				.filter(([id]) => s.players[id])
				.map(([id, userId]) => ({ userId, won: top > 0 && s.players[id].wins === top })),
		});
	}

	async onMessage(message: string, sender: Party.Connection) {
		if (!this.state) return;
		try {
			const data = JSON.parse(message) as GameNightClientMessage;
			if (data.type !== "join") await this.joins.settled(sender);
			if (!this.state) return;
			if (data.type === "join") {
				const token = this.connectionTokens.get(sender);
				if (!token) return this.send(sender, { type: "error", message: "Invalid player session" });
				const account = await this.joins.verify(sender, data.authToken);
				if (!this.state) return;
				const name = account?.displayName ?? data.name.trim().slice(0, 20);
				const returning = this.state.players[sender.id];
				if (returning) {
					if (this.state.playerTokens[sender.id] !== token) return this.send(sender, { type: "error", message: "Invalid player session" });
					markConnected(this.state.players, sender.id);
					// A verified player keeps their profile name even if a later join comes without a token.
					if (account || !this.state.accounts?.[sender.id]) returning.name = name || returning.name;
				} else {
					if (Object.keys(this.state.players).length >= MAX_PLAYERS) return this.send(sender, { type: "error", message: "Game Night room is full" });
					if (this.state.activeMatch && this.state.activeMatch.status !== "finished") return this.send(sender, { type: "error", message: "A game is already in progress" });
					if (!name) return this.send(sender, { type: "error", message: "Enter a player name" });
					const player: GameNightPlayer = { id: sender.id, name, wins: 0, joinedAt: Date.now(), connected: true };
					this.state.players[sender.id] = player;
					this.state.playerTokens[sender.id] = token;
				}
				if (account) {
					this.state.accounts = { ...this.state.accounts, [sender.id]: account.userId };
					Object.assign(this.state.players[sender.id], { verified: true, profileId: account.profileId, color: account.color });
				}
				if (!this.state.players[this.state.hostId]) this.state.hostId = sender.id;
				this.state.revision += 1;
				await this.save();
				this.broadcast();
				return;
			}
			if (!this.authenticated(sender)) return this.send(sender, { type: "error", message: "Invalid player session" });
			const isHost = sender.id === this.state.hostId;
			switch (data.type) {
				case "select-game":
					return await this.selectGame(data.gameId, sender);
				case "match-ready":
					if (isHost && this.state.activeMatch?.id === data.matchId && this.state.activeMatch.status === "launching") {
						this.state.activeMatch.status = "ready";
						await this.commit();
					}
					return;
				case "complete-match":
					return await this.completeMatch(data.matchId, sender);
				case "open-vote":
					return await this.openVote(data.options, sender);
				case "vote": {
					const vote = this.state.vote;
					if (!vote || vote.stage !== "open" || !vote.options.includes(data.gameId) || this.misfit(data.gameId)) return;
					vote.votes[sender.id] = data.gameId;
					this.maybeLockVote();
					return await this.commit();
				}
				case "lock-vote":
					if (!isHost || this.state.vote?.stage !== "open") return;
					this.lockVote();
					return await this.commit();
				case "cancel-vote":
					if (!isHost || this.state.vote?.stage !== "open") return;
					this.state.vote = null;
					return await this.commit();
				case "lounge": {
					const player = this.state.players[sender.id];
					if (!player || Boolean(player.inLounge) === Boolean(data.here)) return;
					player.inLounge = Boolean(data.here);
					this.maybeStartRecap();
					return await this.commit();
				}
				case "skip-recap": {
					const recap = this.state.recap;
					if (!isHost || !recap) return;
					if (recap.stage === "waiting") this.startRecap();
					else this.state.recap = null;
					return await this.commit();
				}
				case "end-night": {
					if (!isHost || this.state.finale) return;
					if (this.state.activeMatch && this.state.activeMatch.status !== "finished") return this.send(sender, { type: "error", message: "Finish the current game first" });
					this.state.vote = null;
					this.state.recap = null;
					this.state.finale = { endedAt: Date.now(), awards: computeAwards(this.state.players, this.state.history) };
					this.reportNight();
					return await this.commit();
				}
				case "resume-night":
					if (!isHost || !this.state.finale) return;
					this.state.finale = null;
					return await this.commit();
				case "react": {
					if (!this.state.players[sender.id] || !isReaction(data.reaction)) return;
					if (!takeReactionSlot(this.reactedAt, sender.id)) return;
					const reaction: GameNightServerMessage = { type: "reaction", playerId: sender.id, reaction: data.reaction };
					for (const connection of this.room.getConnections()) {
						if (this.authenticated(connection)) this.send(connection, reaction);
					}
					return;
				}
				case "leave": {
					delete this.state.players[sender.id];
					delete this.state.playerTokens[sender.id];
					delete this.state.matchTickets[sender.id];
					if (this.state.vote) delete this.state.vote.votes[sender.id];
					if (Object.keys(this.state.players).length === 0) {
						this.state = null;
						await this.room.storage.deleteAlarm();
						await this.room.storage.delete("state");
						return;
					}
					if (sender.id === this.state.hostId) this.state.hostId = nextHost(this.state.players, sender.id) ?? "";
					this.maybeLockVote();
					this.maybeStartRecap();
					return await this.commit();
				}
			}
		} catch (error) {
			console.error("Game Night message error", error);
			this.send(sender, { type: "error", message: "Could not process that action" });
		}
	}

	async onRequest(request: Party.Request) {
		if (!this.state) return Response.json({ valid: false }, { status: 404 });
		const url = new URL(request.url);
		if (url.pathname.endsWith("/validate-member") && request.method === "POST") {
			const data = (await request.json()) as ValidationRequest;
			const match = this.state.activeMatch;
			const player = this.state.players[data.playerId];
			const isHost = data.playerId === this.state.hostId;
			const valid = Boolean(
				match &&
				match.id === data.matchId &&
				match.gameId === data.gameId &&
				match.roomId === data.roomId &&
				player &&
				this.state.matchTickets[data.playerId] === data.ticket &&
				(match.status !== "launching" || isHost),
			);
			return Response.json(valid ? { valid: true, name: player!.name, isHost } : { valid: false });
		}
		return new Response("Not found", { status: 404 });
	}

	async onClose(connection: Party.Connection) {
		if (!this.state?.players[connection.id]) return;
		if (Array.from(this.room.getConnections()).some((candidate) => candidate.id === connection.id && candidate !== connection)) return;
		markDisconnected(this.state.players, connection.id);
		this.state.players[connection.id].inLounge = false;
		this.maybeLockVote();
		this.maybeStartRecap();
		await this.commit();
	}
}

export default withRoomCleanup(GameNightParty, "gamenight");
