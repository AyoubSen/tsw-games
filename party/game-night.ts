import type * as Party from "partykit/server";
import { withRoomCleanup } from "./shared/cleanup";
import {
	getGameNightGame,
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
import { markConnected, markDisconnected, nextHost } from "./shared/presence";

interface GameNightState extends PublicGameNightState {
	playerTokens: Record<string, string>;
	matchTickets: Record<string, string>;
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
	constructor(readonly room: Party.Room) {}
	state: GameNightState | null = null;
	connectionTokens = new WeakMap<Party.Connection, string>();

	async onStart() {
		this.state = (await this.room.storage.get<GameNightState>("state")) ?? null;
		if (!this.state) return;
		for (const player of Object.values(this.state.players)) player.connected = false;
		await this.save();
	}

	async save() {
		if (this.state) await this.room.storage.put("state", this.state);
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
			};
			await this.save();
		}
		if (!this.state) this.send(connection, { type: "error", message: "Game Night room not found" });
	}

	async selectGame(gameId: GameNightGameId, sender: Party.Connection) {
		if (!this.state || sender.id !== this.state.hostId) return;
		if (this.state.activeMatch && this.state.activeMatch.status !== "finished") {
			return this.send(sender, { type: "error", message: "Finish the current game before choosing another" });
		}
		const game = getGameNightGame(gameId);
		if (!game) return this.send(sender, { type: "error", message: "That game is not available" });
		const players = Object.values(this.state.players);
		const connectedCount = players.filter((player) => player.connected !== false).length;
		if (connectedCount < game.minPlayers) {
			return this.send(sender, { type: "error", message: `Need at least ${game.minPlayers} connected players` });
		}
		if (players.length > game.maxPlayers) {
			return this.send(sender, { type: "error", message: `${game.title} supports at most ${game.maxPlayers} players` });
		}
		const match: GameNightMatch = {
			id: crypto.randomUUID(),
			gameId,
			roomId: crypto.randomUUID(),
			status: "launching",
			startedAt: Date.now(),
		};
		this.state.activeMatch = match;
		this.state.matchTickets = Object.fromEntries(players.map((player) => [player.id, crypto.randomUUID()]));
		this.state.revision += 1;
		await this.save();
		this.broadcast();
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
			};
			this.state.history.push(history);
			match.status = "finished";
			this.state.revision += 1;
			await this.save();
			this.broadcast();
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

	async onMessage(message: string, sender: Party.Connection) {
		if (!this.state) return;
		try {
			const data = JSON.parse(message) as GameNightClientMessage;
			if (data.type === "join") {
				const token = this.connectionTokens.get(sender);
				if (!token) return this.send(sender, { type: "error", message: "Invalid player session" });
				const returning = this.state.players[sender.id];
				if (returning) {
					if (this.state.playerTokens[sender.id] !== token) return this.send(sender, { type: "error", message: "Invalid player session" });
					markConnected(this.state.players, sender.id);
					returning.name = data.name.trim().slice(0, 20) || returning.name;
				} else {
					if (Object.keys(this.state.players).length >= MAX_PLAYERS) return this.send(sender, { type: "error", message: "Game Night room is full" });
					if (this.state.activeMatch && this.state.activeMatch.status !== "finished") return this.send(sender, { type: "error", message: "A game is already in progress" });
					const name = data.name.trim().slice(0, 20);
					if (!name) return this.send(sender, { type: "error", message: "Enter a player name" });
					const player: GameNightPlayer = { id: sender.id, name, wins: 0, joinedAt: Date.now(), connected: true };
					this.state.players[sender.id] = player;
					this.state.playerTokens[sender.id] = token;
				}
				if (!this.state.players[this.state.hostId]) this.state.hostId = sender.id;
				this.state.revision += 1;
				await this.save();
				this.broadcast();
				return;
			}
			if (!this.authenticated(sender)) return this.send(sender, { type: "error", message: "Invalid player session" });
			if (data.type === "select-game") await this.selectGame(data.gameId, sender);
			if (data.type === "match-ready" && sender.id === this.state.hostId && this.state.activeMatch?.id === data.matchId && this.state.activeMatch.status === "launching") {
				this.state.activeMatch.status = "ready";
				this.state.revision += 1;
				await this.save();
				this.broadcast();
			}
			if (data.type === "complete-match") await this.completeMatch(data.matchId, sender);
			if (data.type === "leave") {
				delete this.state.players[sender.id];
				delete this.state.playerTokens[sender.id];
				delete this.state.matchTickets[sender.id];
				if (Object.keys(this.state.players).length === 0) {
					this.state = null;
					await this.room.storage.delete("state");
					return;
				}
				if (sender.id === this.state.hostId) this.state.hostId = nextHost(this.state.players, sender.id) ?? "";
				this.state.revision += 1;
				await this.save();
				this.broadcast();
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
		this.state.revision += 1;
		await this.save();
		this.broadcast();
	}
}

export default withRoomCleanup(GameNightParty, "gamenight");
