import type * as Party from "partykit/server";
import type { GameNightGameId } from "../../src/lib/gameNight";

const STORAGE_KEY = "game-night-match";

export interface GameNightMember {
	roomCode: string;
	matchId: string;
	gameId: GameNightGameId;
	name: string;
	isHost: boolean;
}

interface StoredGameNightMatch {
	roomCode: string;
	matchId: string;
	gameId: GameNightGameId;
}

export type GameNightValidation =
	| { mode: "direct" }
	| { mode: "invalid" }
	| { mode: "game-night"; member: GameNightMember };

export async function validateGameNightConnection(
	room: Party.Room,
	connection: Party.Connection,
	context: Party.ConnectionContext,
	gameId: GameNightGameId,
): Promise<GameNightValidation> {
	const invalid = (): GameNightValidation => {
		connection.close(1008, "Invalid Game Night connection");
		return { mode: "invalid" };
	};
	const url = new URL(context.request.url);
	const roomCode = url.searchParams.get("night")?.toUpperCase() ?? "";
	const matchId = url.searchParams.get("nightMatch") ?? "";
	const ticket = url.searchParams.get("nightTicket") ?? "";
	const stored = await room.storage.get<StoredGameNightMatch>(STORAGE_KEY);

	if (!roomCode && !matchId && !ticket) return stored ? invalid() : { mode: "direct" };
	if (!roomCode || !matchId || !ticket) return invalid();

	try {
		const response = await room.context.parties.gamenight.get(roomCode).fetch("/validate-member", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ matchId, gameId, roomId: room.id, playerId: connection.id, ticket }),
		});
		if (!response.ok) return invalid();
		const result = (await response.json()) as { valid: boolean; name?: string; isHost?: boolean };
		if (!result.valid || !result.name) return invalid();
		const match: StoredGameNightMatch = { roomCode, matchId, gameId };
		if (stored && (stored.roomCode !== roomCode || stored.matchId !== matchId || stored.gameId !== gameId)) {
			return invalid();
		}
		if (!stored) await room.storage.put(STORAGE_KEY, match);
		return {
			mode: "game-night",
			member: { ...match, name: result.name, isHost: result.isHost === true },
		};
	} catch {
		return invalid();
	}
}

export async function getGameNightResultMatch(
	room: Party.Room,
	request: Party.Request,
	gameId: GameNightGameId,
): Promise<StoredGameNightMatch | null> {
	if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/game-night-result")) return null;
	const body = (await request.json()) as { matchId?: string };
	const stored = await room.storage.get<StoredGameNightMatch>(STORAGE_KEY);
	if (!stored || stored.gameId !== gameId || stored.matchId !== body.matchId) return null;
	return stored;
}
