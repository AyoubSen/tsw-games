import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearPersistentPlayerId,
	generateRoomCode,
	leavePartySocket,
	PARTYKIT_HOST,
	getPersistentPlayerId,
} from "@/lib/partykit";
import type {
	GameMode,
	PublicGameState,
	ServerMessage,
} from "../../../../party/typerace";

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export interface MultiplayerState {
	connectionStatus: ConnectionStatus;
	gameState: PublicGameState | null;
	playerId: string | null;
	error: string | null;
}

function initialState(
	overrides: Partial<MultiplayerState> = {},
): MultiplayerState {
	return {
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
		...overrides,
	};
}

export function useMultiplayerTypeRace() {
	const [state, setState] = useState<MultiplayerState>(() => initialState());

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
				setState((prev) => ({
					...prev,
					connectionStatus: "connected",
					gameState: message.state,
					error: null,
				}));
				break;

			case "player-joined":
				setState((prev) => {
					if (!prev.gameState) return prev;
					return {
						...prev,
						gameState: {
							...prev.gameState,
							players: {
								...prev.gameState.players,
								[message.player.id]: message.player,
							},
						},
					};
				});
				break;

			case "player-left":
				setState((prev) => {
					if (!prev.gameState) return prev;
					const newPlayers = { ...prev.gameState.players };
					delete newPlayers[message.playerId];
					return {
						...prev,
						gameState: {
							...prev.gameState,
							players: newPlayers,
						},
					};
				});
				break;

			case "game-started":
				setState((prev) => {
					if (!prev.gameState) return prev;
					return {
						...prev,
						gameState: {
							...prev.gameState,
							status: "playing",
							text: message.text,
							startedAt: message.startTime,
						},
					};
				});
				break;

			case "player-progress":
				setState((prev) => {
					if (!prev.gameState) return prev;
					const player = prev.gameState.players[message.playerId];
					if (!player) return prev;
					return {
						...prev,
						gameState: {
							...prev.gameState,
							players: {
								...prev.gameState.players,
								[message.playerId]: {
									...player,
									progress: Math.max(player.progress, message.progress),
									wpm: message.wpm,
								},
							},
						},
					};
				});
				break;

			case "player-completed":
				setState((prev) => {
					if (!prev.gameState) return prev;
					const player = prev.gameState.players[message.playerId];
					if (!player) return prev;
					return {
						...prev,
						gameState: {
							...prev.gameState,
							players: {
								...prev.gameState.players,
								[message.playerId]: {
									...player,
									completed: true,
									progress: 100,
									wpm: message.wpm,
									accuracy: message.accuracy,
								},
							},
						},
					};
				});
				break;

			case "game-over":
				setState((prev) => {
					if (!prev.gameState) return prev;
					return {
						...prev,
						gameState: {
							...prev.gameState,
							status: "finished",
							winnerId: message.winnerId,
						},
					};
				});
				break;

			case "game-restarted":
				break;

			case "error":
				if (
					message.message === "Game not found" ||
					message.message === "Game already started" ||
					message.message === "Game is full"
				) {
					const socket = socketRef.current;
					socketRef.current = null;
					socket?.close();
					setState(
						initialState({
							connectionStatus: "error",
							error: message.message,
						}),
					);
					break;
				}
				setState((prev) => ({
					...prev,
					error: message.message,
				}));
				break;
		}
	}, []);

	const connect = useCallback(
		(roomCode: string, isHost: boolean, mode: GameMode, playerName: string) => {
			const previousSocket = socketRef.current;
			socketRef.current = null;
			previousSocket?.close();

			roomCodeRef.current = roomCode;
			const playerId = getPersistentPlayerId("typerace", roomCode);
			setState(initialState({ connectionStatus: "connecting", playerId }));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: roomCode,
				id: playerId,
				party: "typerace",
				query: {
					host: isHost.toString(),
					mode,
				},
				maxEnqueuedMessages: 0,
			});
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				if (socketRef.current !== socket) return;
				setState((prev) => ({
					...prev,
					connectionStatus: "connected",
					playerId: socket.id,
					error: null,
				}));

				socket.send(JSON.stringify({ type: "join", name: playerName }));
			});

			socket.addEventListener("message", (event) => {
				if (socketRef.current !== socket) return;
				try {
					const message: ServerMessage = JSON.parse(event.data);
					handleMessage(message);
				} catch (e) {
					console.error("Failed to parse message:", e);
				}
			});

			socket.addEventListener("close", () => {
				if (socketRef.current !== socket) return;
				setState((prev) => ({
					...prev,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
				}));
			});

			socket.addEventListener("error", () => {
				if (socketRef.current !== socket) return;
				setState((prev) => ({
					...prev,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
				}));
			});
		},
		[handleMessage],
	);

	const sendNow = useCallback((message: object) => {
		const socket = socketRef.current;
		if (!socket || socket.readyState !== 1) {
			setState((prev) => ({
				...prev,
				connectionStatus: "connecting",
				error: "Connection lost. Reconnecting...",
			}));
			return false;
		}
		socket.send(JSON.stringify(message));
		return true;
	}, []);

	const disconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		if (socket) leavePartySocket(socket, { type: "leave" });
		if (roomCodeRef.current) {
			clearPersistentPlayerId("typerace", roomCodeRef.current);
			roomCodeRef.current = "";
		}
		setState(initialState());
	}, []);

	const abandonReconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		socket?.close();
		roomCodeRef.current = "";
		setState(initialState());
	}, []);

	const createGame = useCallback(
		(mode: GameMode, playerName: string) => {
			const roomCode = generateRoomCode();
			connect(roomCode, true, mode, playerName);
			return roomCode;
		},
		[connect],
	);

	const joinGame = useCallback(
		(roomCode: string, playerName: string) => {
			connect(roomCode.toUpperCase(), false, "race", playerName);
		},
		[connect],
	);

	const startGame = useCallback(() => {
		if (isHost) sendNow({ type: "start" });
	}, [isHost, sendNow]);

	const sendProgress = useCallback(
		(progress: number, wpm: number, accuracy: number, typedText: string) => {
			if (!sendNow({ type: "progress", progress, wpm, accuracy, typedText })) {
				return;
			}
			setState((prev) => {
				if (!prev.gameState || !prev.playerId) return prev;
				const player = prev.gameState.players[prev.playerId];
				if (!player) return prev;
				return {
					...prev,
					gameState: {
						...prev.gameState,
						players: {
							...prev.gameState.players,
							[prev.playerId]: {
								...player,
								progress: Math.max(player.progress, progress),
								wpm,
								accuracy,
								typedText,
							},
						},
					},
				};
			});
		},
		[sendNow],
	);

	const sendComplete = useCallback((wpm: number, accuracy: number) => {
		sendNow({ type: "complete", wpm, accuracy });
	}, [sendNow]);

	const restartGame = useCallback(() => {
		if (isHost) sendNow({ type: "restart" });
	}, [isHost, sendNow]);

	useEffect(() => {
		return () => {
			const socket = socketRef.current;
			socketRef.current = null;
			socket?.close();
		};
	}, []);

	return {
		...state,
		isHost,
		createGame,
		joinGame,
		startGame,
		sendProgress,
		sendComplete,
		restartGame,
		disconnect,
		abandonReconnect,
	};
}
