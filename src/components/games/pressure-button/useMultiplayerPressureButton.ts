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
	PressureButtonSettings,
	PublicPressureButtonGameState,
	ServerMessage,
} from "../../../../party/pressure-button";

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export interface MultiplayerPressureButtonState {
	connectionStatus: ConnectionStatus;
	gameState: PublicPressureButtonGameState | null;
	playerId: string | null;
	error: string | null;
}

export function useMultiplayerPressureButton() {
	const [state, setState] = useState<MultiplayerPressureButtonState>({
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
	});

	const socketRef = useRef<PartySocket | null>(null);
	const roomCodeRef = useRef<string | null>(null);

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
						},
					};
				});
				break;

			case "turn-started":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						error: null,
						gameState: {
							...previous.gameState,
							status: "decision",
							prompt: message.prompt,
							turnNumber: message.turnNumber,
							activePlayerId: message.activePlayerId,
							responderId: null,
							pressuredByPlayerId: null,
							currentAnswerText: null,
							roundResult: null,
							turnStartedAt: null,
						},
					};
				});
				break;

			case "decision-made":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						gameState: {
							...previous.gameState,
							status: message.mode === "pass" ? "reveal" : "answering",
							responderId: message.responderId,
							pressuredByPlayerId: message.pressuredByPlayerId,
							turnStartedAt: message.mode === "pass" ? null : Date.now(),
						},
					};
				});
				break;

			case "turn-revealed":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						gameState: {
							...previous.gameState,
							status: "reveal",
							roundResult: message.result,
							currentAnswerText: message.result.answerText,
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
			settings?: PressureButtonSettings,
		) => {
			const gameNightQuery = getGameNightSocketQuery(roomCode);
			const normalizedRoomCode = Object.keys(gameNightQuery).length
				? roomCode
				: roomCode.toUpperCase();
			if (socketRef.current) {
				socketRef.current.close();
			}
			roomCodeRef.current = normalizedRoomCode;

			setState((previous) => ({
				...previous,
				connectionStatus: "connecting",
				gameState: null,
				error: null,
			}));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: normalizedRoomCode,
				id: getPersistentPlayerId("pressure-button", normalizedRoomCode),
				party: "pressurebutton",
				maxEnqueuedMessages: 0,
				query: {
					host: isHost.toString(),
					...gameNightQuery,
					...(settings && {
						turns: settings.turns.toString(),
						answerTimeLimit: settings.answerTimeLimit.toString(),
						promptPack: settings.promptPack,
					}),
				},
			});

			socket.addEventListener("open", () => {
				if (socketRef.current !== socket) return;
				setState((previous) => ({
					...previous,
					connectionStatus: "connected",
					playerId: socket.id,
					error: null,
				}));

				if (socket.readyState === WebSocket.OPEN) {
					socket.send(JSON.stringify({ type: "join", name: playerName }));
				}
			});

			socket.addEventListener("message", (event) => {
				if (socketRef.current !== socket) return;
				try {
					handleMessage(JSON.parse(event.data) as ServerMessage);
				} catch (error) {
					console.error("Failed to parse Pressure Button message:", error);
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

			socketRef.current = socket;
		},
		[handleMessage],
	);

	const disconnect = useCallback(() => {
		const socket = socketRef.current;
		const roomCode = roomCodeRef.current;
		socketRef.current = null;
		roomCodeRef.current = null;
		if (socket) leavePartySocket(socket, { type: "leave" });
		if (roomCode) clearPersistentPlayerId("pressure-button", roomCode);

		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
		});
	}, []);

	const abandonReconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		roomCodeRef.current = null;
		socket?.close();
		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
		});
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: PressureButtonSettings, suppliedRoomId?: string) => {
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

	const send = useCallback((payload: object) => {
		const socket = socketRef.current;
		if (socket?.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(payload));
		}
	}, []);

	const startGame = useCallback(() => {
		if (state.playerId === state.gameState?.hostId) {
			send({ type: "start" });
		}
	}, [send, state.gameState?.hostId, state.playerId]);

	const chooseAnswer = useCallback(() => {
		send({ type: "choose-answer" });
	}, [send]);

	const choosePass = useCallback(() => {
		send({ type: "choose-pass" });
	}, [send]);

	const choosePressure = useCallback(
		(targetPlayerId: string) => {
			send({ type: "choose-pressure", targetPlayerId });
		},
		[send],
	);

	const submitAnswer = useCallback(
		(answer: string) => {
			send({ type: "submit-answer", answer });
		},
		[send],
	);

	const nextTurn = useCallback(() => {
		if (state.playerId === state.gameState?.hostId) {
			send({ type: "next-turn" });
		}
	}, [send, state.gameState?.hostId, state.playerId]);

	const restartGame = useCallback(() => {
		if (state.playerId === state.gameState?.hostId) {
			send({ type: "restart" });
		}
	}, [send, state.gameState?.hostId, state.playerId]);

	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.close();
			}
		};
	}, []);

	return {
		...state,
		isHost: !!state.playerId && state.gameState?.hostId === state.playerId,
		createGame,
		joinGame,
		startGame,
		chooseAnswer,
		choosePass,
		choosePressure,
		submitAnswer,
		nextTurn,
		restartGame,
		disconnect,
		abandonReconnect,
	};
}
