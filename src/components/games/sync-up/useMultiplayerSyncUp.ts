import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearPersistentPlayerId,
	generateRoomCode,
	getGameNightSocketQuery,
	leavePartySocket,
	PARTYKIT_HOST,
	getPersistentPlayerId,
} from "@/lib/partykit";
import type {
	PublicSyncUpGameState,
	ServerMessage,
	SyncUpSettings,
} from "../../../../party/sync-up";

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export interface MultiplayerSyncUpState {
	connectionStatus: ConnectionStatus;
	gameState: PublicSyncUpGameState | null;
	playerId: string | null;
	error: string | null;
	isHost: boolean;
}

export function useMultiplayerSyncUp() {
	const [state, setState] = useState<MultiplayerSyncUpState>({
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
		isHost: false,
	});

	const socketRef = useRef<PartySocket | null>(null);
	const roomCodeRef = useRef("");
	const isHost = Boolean(
		state.gameState &&
			state.playerId &&
			state.gameState.hostId === state.playerId,
	);

	const handleMessage = useCallback((message: ServerMessage) => {
		switch (message.type) {
			case "state":
				setState((previous) => ({
					...previous,
					connectionStatus: "connected",
					gameState: message.state,
					error: null,
				}));
				break;

			case "player-joined":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						gameState: {
							...previous.gameState,
							players: {
								...previous.gameState.players,
								[message.player.id]: message.player,
							},
						},
					};
				});
				break;

			case "player-left":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					const players = { ...previous.gameState.players };
					delete players[message.playerId];

					return {
						...previous,
						gameState: {
							...previous.gameState,
							players,
							submittedPlayerIds: previous.gameState.submittedPlayerIds.filter(
								(playerId) => playerId !== message.playerId,
							),
						},
					};
				});
				break;

			case "round-started":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						error: null,
						gameState: {
							...previous.gameState,
							status: "submitting",
							prompt: message.prompt,
							roundNumber: message.roundNumber,
							submittedPlayerIds: [],
							revealedAnswers: [],
							answerGroups: [],
							roundStartedAt: Date.now(),
						},
					};
				});
				break;

			case "round-revealed":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						gameState: {
							...previous.gameState,
							status: "reveal",
							answerGroups: message.answerGroups,
						},
					};
				});
				break;

			case "game-over":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						gameState: {
							...previous.gameState,
							status: "finished",
						},
					};
				});
				break;

			case "game-restarted":
				setState((previous) => ({
					...previous,
					error: null,
				}));
				break;

			case "error":
				setState((previous) => ({
					...previous,
					error: message.message,
				}));
				break;
		}
	}, []);

	const connect = useCallback(
		(
			roomCode: string,
			isHost: boolean,
			playerName: string,
			settings?: SyncUpSettings,
		) => {
			const gameNightQuery = getGameNightSocketQuery(roomCode);
			const normalizedRoomCode = Object.keys(gameNightQuery).length
				? roomCode
				: roomCode.toUpperCase();
			const previousSocket = socketRef.current;
			socketRef.current = null;
			previousSocket?.close();
			roomCodeRef.current = normalizedRoomCode;
			const playerId = getPersistentPlayerId("sync-up", normalizedRoomCode);

			setState((previous) => ({
				...previous,
				connectionStatus: "connecting",
				gameState: null,
				error: null,
				playerId,
			}));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: normalizedRoomCode,
				id: playerId,
				party: "syncup",
				query: {
					host: isHost.toString(),
					...gameNightQuery,
					...(settings && {
						rounds: settings.rounds.toString(),
						roundTimeLimit: settings.roundTimeLimit.toString(),
						promptPack: settings.promptPack,
					}),
				},
				maxEnqueuedMessages: 0,
			});
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				if (socketRef.current !== socket) return;
				setState((previous) => ({
					...previous,
					connectionStatus: "connected",
					playerId: socket.id,
				}));

				socket.send(JSON.stringify({ type: "join", name: playerName }));
			});

			socket.addEventListener("message", (event) => {
				if (socketRef.current !== socket) return;
				try {
					handleMessage(JSON.parse(event.data) as ServerMessage);
				} catch (error) {
					console.error("Failed to parse Sync Up message:", error);
				}
			});

			socket.addEventListener("close", () => {
				if (socketRef.current !== socket) return;
				setState((previous) => ({
					...previous,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
				}));
			});

			socket.addEventListener("error", () => {
				if (socketRef.current !== socket) return;
				setState((previous) => ({
					...previous,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
				}));
			});
		},
		[handleMessage],
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
			clearPersistentPlayerId("sync-up", roomCodeRef.current);
			roomCodeRef.current = "";
		}

		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
			isHost: false,
		});
	}, []);

	const abandonReconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		socket?.close();
		roomCodeRef.current = "";
		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
			isHost: false,
		});
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: SyncUpSettings, suppliedRoomId?: string) => {
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

	const submitAnswer = useCallback((answer: string) => {
		sendNow({ type: "submit-answer", answer });
	}, [sendNow]);

	const nextRound = useCallback(() => {
		if (isHost) sendNow({ type: "next-round" });
	}, [isHost, sendNow]);

	const restartGame = useCallback(() => {
		if (isHost) sendNow({ type: "restart" });
	}, [isHost, sendNow]);

	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.close();
			}
		};
	}, []);

	return {
		...state,
		isHost,
		createGame,
		joinGame,
		startGame,
		submitAnswer,
		nextRound,
		restartGame,
		disconnect,
		abandonReconnect,
	};
}
