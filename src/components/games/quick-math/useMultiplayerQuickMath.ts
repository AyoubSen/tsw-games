import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearPersistentPlayerId,
	clearPersistentPlayerToken,
	generateRoomCode,
	getGameNightSocketQuery,
	getPersistentPlayerId,
	getPersistentPlayerToken,
	leavePartySocket,
	PARTYKIT_HOST,
} from "@/lib/partykit";
import { useAuthTokenRef } from "@/lib/account";
import type { Reaction } from "@/lib/reactions";
import { useReactionBubbles } from "@/components/multiplayer/Reactions";
import type {
	PublicQuickMathState,
	QuickMathSettings,
	ServerMessage,
} from "../../../../party/quick-math";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MultiplayerQuickMathState {
	connectionStatus: ConnectionStatus;
	gameState: PublicQuickMathState | null;
	/** Local-clock time the current phase ends, re-anchored from the server's `msLeft`. */
	phaseEndsAt: number | null;
	playerId: string | null;
	error: string | null;
}

const EMPTY: MultiplayerQuickMathState = {
	connectionStatus: "disconnected",
	gameState: null,
	phaseEndsAt: null,
	playerId: null,
	error: null,
};

export function useMultiplayerQuickMath() {
	const [state, setState] = useState<MultiplayerQuickMathState>(EMPTY);
	const { bubbles: reactions, receive: receiveReaction, clear: clearReactions } = useReactionBubbles();
	const socketRef = useRef<PartySocket | null>(null);
	const authTokenRef = useAuthTokenRef();
	const roomCodeRef = useRef("");
	const isHost = Boolean(state.gameState && state.playerId && state.gameState.hostId === state.playerId);

	const handleMessage = useCallback((message: ServerMessage) => {
		switch (message.type) {
			case "state":
				setState((previous) => ({
					...previous,
					connectionStatus: "connected",
					gameState: message.state,
					phaseEndsAt: message.state.msLeft === null ? null : Date.now() + message.state.msLeft,
					error: null,
				}));
				break;

			case "reaction":
				receiveReaction(message);
				break;

			case "error":
				setState((previous) => ({ ...previous, error: message.message }));
				break;
		}
	}, [receiveReaction]);

	const connect = useCallback(
		(roomCode: string, isHost: boolean, playerName: string, settings?: QuickMathSettings) => {
			const gameNightQuery = getGameNightSocketQuery(roomCode);
			const normalizedRoomCode = Object.keys(gameNightQuery).length ? roomCode : roomCode.toUpperCase();
			const previousSocket = socketRef.current;
			socketRef.current = null;
			previousSocket?.close();
			roomCodeRef.current = normalizedRoomCode;
			const playerId = getPersistentPlayerId("quick-math", normalizedRoomCode);

			setState({ ...EMPTY, connectionStatus: "connecting", playerId });

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: normalizedRoomCode,
				id: playerId,
				party: "quickmath",
				query: {
					host: isHost.toString(),
					...gameNightQuery,
					playerToken: getPersistentPlayerToken("quick-math", normalizedRoomCode),
					...(settings && {
						rounds: settings.rounds.toString(),
						questionTime: settings.questionTime.toString(),
					}),
				},
				maxEnqueuedMessages: 0,
			});
			socketRef.current = socket;

			socket.addEventListener("open", async () => {
				if (socketRef.current !== socket) return;
				setState((previous) => ({ ...previous, connectionStatus: "connected", playerId: socket.id }));
				const authToken = await authTokenRef.current();
				if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
				socket.send(JSON.stringify({ type: "join", name: playerName, authToken }));
			});

			socket.addEventListener("message", (event) => {
				if (socketRef.current !== socket) return;
				try {
					handleMessage(JSON.parse(event.data) as ServerMessage);
				} catch (error) {
					console.error("Failed to parse Quick Math message:", error);
				}
			});

			const lost = () => {
				if (socketRef.current !== socket) return;
				setState((previous) => ({
					...previous,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
				}));
			};
			socket.addEventListener("close", lost);
			socket.addEventListener("error", lost);
		},
		[handleMessage, authTokenRef],
	);

	const sendNow = useCallback((message: object) => {
		const socket = socketRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) return false;
		socket.send(JSON.stringify(message));
		return true;
	}, []);

	const disconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		if (socket) leavePartySocket(socket, { type: "leave" });
		if (roomCodeRef.current) {
			clearPersistentPlayerId("quick-math", roomCodeRef.current);
			clearPersistentPlayerToken("quick-math", roomCodeRef.current);
			roomCodeRef.current = "";
		}
		clearReactions();
		setState(EMPTY);
	}, [clearReactions]);

	const abandonReconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		socket?.close();
		roomCodeRef.current = "";
		setState(EMPTY);
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: QuickMathSettings, suppliedRoomId?: string) => {
			const roomCode = suppliedRoomId ?? generateRoomCode();
			connect(roomCode, true, playerName, settings);
			return roomCode;
		},
		[connect],
	);

	const joinGame = useCallback(
		(roomCode: string, playerName: string) => {
			connect(roomCode, false, playerName);
		},
		[connect],
	);

	const startGame = useCallback(() => {
		if (isHost) sendNow({ type: "start" });
	}, [isHost, sendNow]);

	const submitAnswer = useCallback((value: string) => sendNow({ type: "answer", value }), [sendNow]);

	const react = useCallback((reaction: Reaction) => {
		sendNow({ type: "react", reaction });
	}, [sendNow]);

	const restartGame = useCallback(() => {
		if (isHost) sendNow({ type: "restart" });
	}, [isHost, sendNow]);

	useEffect(() => {
		return () => {
			socketRef.current?.close();
		};
	}, []);

	return {
		...state,
		isHost,
		reactions,
		react,
		createGame,
		joinGame,
		startGame,
		submitAnswer,
		restartGame,
		disconnect,
		abandonReconnect,
	};
}
