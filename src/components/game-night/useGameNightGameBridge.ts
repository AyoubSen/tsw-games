import { useEffect, useRef } from "react";
import type { GameNightGameId } from "@/lib/gameNight";
import { useGameNight } from "./GameNightProvider";

interface GameNightGameBridgeOptions {
	gameId: GameNightGameId;
	hasGameState: boolean;
	finished: boolean;
	connectHost: (roomId: string, playerName: string) => void;
	connectPlayer: (roomId: string, playerName: string) => void;
}

export function useGameNightGameBridge({
	gameId,
	hasGameState,
	finished,
	connectHost,
	connectPlayer,
}: GameNightGameBridgeOptions) {
	const gameNight = useGameNight();
	const connectedMatchRef = useRef<string | null>(null);
	const readyMatchRef = useRef<string | null>(null);
	const connectHostRef = useRef(connectHost);
	const connectPlayerRef = useRef(connectPlayer);
	connectHostRef.current = connectHost;
	connectPlayerRef.current = connectPlayer;
	const connection = gameNight.connection?.gameId === gameId ? gameNight.connection : null;

	useEffect(() => {
		if (!connection?.canEnter || connectedMatchRef.current === connection.matchId) return;
		connectedMatchRef.current = connection.matchId;
		if (connection.isHost) connectHostRef.current(connection.roomId, connection.playerName);
		else connectPlayerRef.current(connection.roomId, connection.playerName);
	}, [connection]);

	useEffect(() => {
		if (!connection?.isHost || !hasGameState || gameNight.state?.activeMatch?.status !== "launching" || readyMatchRef.current === connection.matchId) return;
		if (gameNight.markReady(connection.matchId)) readyMatchRef.current = connection.matchId;
	}, [connection, hasGameState, gameNight]);

	useEffect(() => {
		if (!connection || !finished || gameNight.state?.activeMatch?.status === "finished") return;
		const complete = () => gameNight.completeMatch(connection.matchId);
		complete();
		const retry = window.setInterval(complete, 1500);
		return () => window.clearInterval(retry);
	}, [connection, finished, gameNight]);

	return {
		isGameNight: Boolean(connection),
		isConnecting: Boolean(connection && !hasGameState),
		publicRoomCode: gameNight.state?.roomCode ?? "",
		gameNight,
	};
}
