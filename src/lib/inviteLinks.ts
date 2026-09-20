const ROOM_CODE_LENGTH = 6;

function normalizeRoomCode(value: string): string {
	return value
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, ROOM_CODE_LENGTH);
}

export interface InviteSearch {
	room?: string;
	night?: string;
}

export function parseInviteSearch(
	search: Record<string, unknown>,
): InviteSearch {
	const roomCode = normalizeRoomCode(
		typeof search.room === "string" ? search.room : "",
	);
	const nightCode = normalizeRoomCode(
		typeof search.night === "string" ? search.night : "",
	);

	return {
		...(roomCode.length === ROOM_CODE_LENGTH && { room: roomCode }),
		...(nightCode.length === ROOM_CODE_LENGTH && { night: nightCode }),
	};
}

export function getGameNightInviteLink(roomCode: string): string {
	const normalizedRoomCode = normalizeRoomCode(roomCode);
	if (typeof window === "undefined") return `/game-night?room=${normalizedRoomCode}`;
	const url = new URL("/game-night", window.location.origin);
	url.searchParams.set("room", normalizedRoomCode);
	return url.toString();
}

export function getInviteLink(roomCode: string): string {
	const normalizedRoomCode = normalizeRoomCode(roomCode);
	if (typeof window === "undefined") return `?room=${normalizedRoomCode}`;

	const url = new URL(window.location.href);
	url.searchParams.set("room", normalizedRoomCode);
	url.hash = "";
	return url.toString();
}
