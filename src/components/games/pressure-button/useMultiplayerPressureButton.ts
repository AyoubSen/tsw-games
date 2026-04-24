import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateRoomCode, PARTYKIT_HOST } from "@/lib/partykit";
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
	isHost: boolean;
}

export function useMultiplayerPressureButton() {
	const [state, setState] = useState<MultiplayerPressureButtonState>({
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
		isHost: false,
	});

	const socketRef = useRef<PartySocket | null>(null);

	const handleMessage = useCallback((message: ServerMessage) => {
		switch (message.type) {
			case "state":
				setState((previous) => ({
					...previous,
					gameState: message.state,
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
			if (socketRef.current) {
				socketRef.current.close();
			}

			setState((previous) => ({
				...previous,
				connectionStatus: "connecting",
				error: null,
				isHost,
			}));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: roomCode,
				party: "pressurebutton",
				query: {
					host: isHost.toString(),
					...(settings && {
						turns: settings.turns.toString(),
						answerTimeLimit: settings.answerTimeLimit.toString(),
						promptPack: settings.promptPack,
					}),
				},
			});

			socket.addEventListener("open", () => {
				setState((previous) => ({
					...previous,
					connectionStatus: "connected",
					playerId: socket.id,
				}));

				socket.send(JSON.stringify({ type: "join", name: playerName }));
			});

			socket.addEventListener("message", (event) => {
				try {
					handleMessage(JSON.parse(event.data) as ServerMessage);
				} catch (error) {
					console.error("Failed to parse Pressure Button message:", error);
				}
			});

			socket.addEventListener("close", () => {
				setState((previous) => ({
					...previous,
					connectionStatus: "disconnected",
				}));
			});

			socket.addEventListener("error", () => {
				setState((previous) => ({
					...previous,
					connectionStatus: "error",
					error: "Connection failed",
				}));
			});

			socketRef.current = socket;
		},
		[handleMessage],
	);

	const disconnect = useCallback(() => {
		if (socketRef.current) {
			socketRef.current.send(JSON.stringify({ type: "leave" }));
			socketRef.current.close();
			socketRef.current = null;
		}

		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
			isHost: false,
		});
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: PressureButtonSettings) => {
			const roomCode = generateRoomCode();
			connect(roomCode, true, playerName, settings);
			return roomCode;
		},
		[connect],
	);

	const joinGame = useCallback(
		(roomCode: string, playerName: string) => {
			connect(roomCode.toUpperCase(), false, playerName);
		},
		[connect],
	);

	const send = useCallback((payload: object) => {
		if (socketRef.current) {
			socketRef.current.send(JSON.stringify(payload));
		}
	}, []);

	const startGame = useCallback(() => {
		if (state.isHost) {
			send({ type: "start" });
		}
	}, [send, state.isHost]);

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
		if (state.isHost) {
			send({ type: "next-turn" });
		}
	}, [send, state.isHost]);

	const restartGame = useCallback(() => {
		if (state.isHost) {
			send({ type: "restart" });
		}
	}, [send, state.isHost]);

	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.close();
			}
		};
	}, []);

	return {
		...state,
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
	};
}
