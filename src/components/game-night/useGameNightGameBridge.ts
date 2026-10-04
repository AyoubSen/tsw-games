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

	const connectionRef = useRef(connection);
	connectionRef.current = connection;
	const enterMatchId = connection?.canEnter ? connection.matchId : null;
	// Keyed on the match, not the connection object (it changes on every Game Night broadcast). The cleanup
	// forgets the match so a remount (or StrictMode's double effects, which close the game socket) reconnects.
	useEffect(() => {
		const current = connectionRef.current;
		if (!enterMatchId || !current) return;
		if (connectedMatchRef.current !== enterMatchId) {
			connectedMatchRef.current = enterMatchId;
			if (current.isHost) connectHostRef.current(current.roomId, current.playerName);
			else connectPlayerRef.current(current.roomId, current.playerName);
		}
		return () => {
			connectedMatchRef.current = null;
		};
	}, [enterMatchId]);

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
