import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearPersistentPlayerId,
	clearPersistentPlayerToken,
	generateRoomCode,
	getPersistentPlayerId,
	getPersistentPlayerToken,
	leavePartySocket,
	PARTYKIT_HOST,
} from "@/lib/partykit";
import type {
	Guess,
	PublicGameState,
	ServerMessage,
	Stroke,
} from "../../../../party/drawing";
import type { GameSettings } from "./types";

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
	isHost: boolean;
	strokes: Stroke[];
	guesses: Guess[];
	undoPending: boolean;
	canvasRevision: number;
}

function strokesMatch(left: Stroke[], right: Stroke[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((stroke, strokeIndex) => {
		const other = right[strokeIndex];
		return (
			stroke.color === other.color &&
			stroke.size === other.size &&
			stroke.points.length === other.points.length &&
			stroke.points.every(
				(point, pointIndex) =>
					point.x === other.points[pointIndex].x &&
					point.y === other.points[pointIndex].y,
			)
		);
	});
}

export function useMultiplayerDrawing() {
	const [state, setState] = useState<MultiplayerState>({
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
		isHost: false,
		strokes: [],
		guesses: [],
		undoPending: false,
		canvasRevision: 0,
	});

	const socketRef = useRef<PartySocket | null>(null);
	const roomCodeRef = useRef("");
	const playerNameRef = useRef<string>("");
	const undoRequestIdRef = useRef<string | null>(null);

	const handleMessage = useCallback((message: ServerMessage) => {
		switch (message.type) {
			case "state":
				setState((prev) => {
					const canvasChanged = !strokesMatch(
						prev.strokes,
						message.state.strokes,
					);
					return {
						...prev,
						connectionStatus: "connected",
						gameState: message.state,
						isHost: message.state.canControl,
						error: null,
						strokes: message.state.strokes,
						guesses: message.state.guesses,
						canvasRevision:
							prev.canvasRevision + (canvasChanged ? 1 : 0),
					};
				});
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

			case "round-started":
				undoRequestIdRef.current = null;
				setState((prev) => {
					if (!prev.gameState) return prev;
					return {
						...prev,
						strokes: [],
						guesses: [],
						undoPending: false,
						canvasRevision: prev.canvasRevision + 1,
						gameState: {
							...prev.gameState,
							status: "playing",
							currentDrawerId: message.drawerId,
							currentWord: message.word,
							wordLength: message.wordLength,
							strokes: [],
							guesses: [],
							correctGuessers: [],
						},
					};
				});
				break;

			case "draw":
				setState((prev) => {
					const strokes = [...prev.strokes, message.stroke];
					return {
						...prev,
						strokes,
						gameState: prev.gameState
							? { ...prev.gameState, strokes }
							: null,
					};
				});
				break;

			case "canvas-state": {
				const completesUndo =
					message.undoRequestId === undoRequestIdRef.current;
				if (completesUndo) undoRequestIdRef.current = null;
				setState((prev) => ({
					...prev,
					strokes: message.strokes,
					undoPending: completesUndo ? false : prev.undoPending,
					canvasRevision: prev.canvasRevision + 1,
					gameState: prev.gameState
						? { ...prev.gameState, strokes: message.strokes }
						: null,
				}));
				break;
			}

			case "clear":
				undoRequestIdRef.current = null;
				setState((prev) => ({
					...prev,
					strokes: [],
					undoPending: false,
					canvasRevision: prev.canvasRevision + 1,
					gameState: prev.gameState
						? { ...prev.gameState, strokes: [] }
						: null,
				}));
				break;

			case "guess":
				setState((prev) => ({
					...prev,
					guesses: [...prev.guesses, message.guess],
				}));
				break;

			case "correct-guess":
				setState((prev) => {
					if (!prev.gameState) return prev;
					return {
						...prev,
						gameState: {
							...prev.gameState,
							correctGuessers: [
								...prev.gameState.correctGuessers,
								message.playerId,
							],
						},
					};
				});
				break;

			case "round-ended":
				undoRequestIdRef.current = null;
				setState((prev) => {
					if (!prev.gameState) return prev;
					// Update player scores from the scores object
					const updatedPlayers = { ...prev.gameState.players };
					for (const [id, score] of Object.entries(message.scores)) {
						if (updatedPlayers[id]) {
							updatedPlayers[id] = { ...updatedPlayers[id], score };
						}
					}
					return {
						...prev,
						undoPending: false,
						gameState: {
							...prev.gameState,
							status: "round-end",
							currentWord: message.word,
							players: updatedPlayers,
						},
					};
				});
				break;

			case "game-over":
				undoRequestIdRef.current = null;
				setState((prev) => {
					if (!prev.gameState) return prev;
					// Update player scores from results
					const updatedPlayers = { ...prev.gameState.players };
					for (const result of message.results) {
						if (updatedPlayers[result.id]) {
							updatedPlayers[result.id] = {
								...updatedPlayers[result.id],
								score: result.score,
							};
						}
					}
					return {
						...prev,
						undoPending: false,
						gameState: {
							...prev.gameState,
							status: "finished",
							players: updatedPlayers,
						},
					};
				});
				break;

			case "game-restarted":
				undoRequestIdRef.current = null;
				setState((prev) => ({
					...prev,
					strokes: [],
					guesses: [],
					undoPending: false,
					canvasRevision: prev.canvasRevision + 1,
				}));
				break;

			case "error":
				undoRequestIdRef.current = null;
				if (message.message === "Invalid player session" && roomCodeRef.current) {
					clearPersistentPlayerId("drawing", roomCodeRef.current);
					clearPersistentPlayerToken("drawing", roomCodeRef.current);
					roomCodeRef.current = "";
				}
				setState((prev) => ({
					...prev,
					error: message.message,
					undoPending: false,
				}));
				break;
		}
	}, []);

	const connect = useCallback(
		(
			roomCode: string,
			isHost: boolean,
			playerName: string,
			settings?: GameSettings,
		) => {
			const normalizedRoomCode = roomCode.toUpperCase();
			const previousSocket = socketRef.current;
			socketRef.current = null;
			previousSocket?.close();
			roomCodeRef.current = normalizedRoomCode;
			const playerId = getPersistentPlayerId("drawing", normalizedRoomCode);

			playerNameRef.current = playerName;
			undoRequestIdRef.current = null;

			setState((prev) => ({
				...prev,
				connectionStatus: "connecting",
				error: null,
				playerId,
				strokes: [],
				guesses: [],
				undoPending: false,
				canvasRevision: 0,
			}));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: normalizedRoomCode,
				id: playerId,
				party: "drawing",
				query: {
					host: isHost.toString(),
					playerToken: getPersistentPlayerToken("drawing", normalizedRoomCode),
					...(settings && {
						mode: settings.mode,
						roundTimeLimit: settings.roundTimeLimit.toString(),
						roundsPerPlayer: settings.roundsPerPlayer.toString(),
					}),
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
				undoRequestIdRef.current = null;
				setState((prev) => ({
					...prev,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
					undoPending: false,
					canvasRevision: prev.canvasRevision + 1,
				}));
			});

			socket.addEventListener("error", () => {
				if (socketRef.current !== socket) return;
				undoRequestIdRef.current = null;
				setState((prev) => ({
					...prev,
					connectionStatus: "connecting",
					error: "Connection lost. Reconnecting...",
					undoPending: false,
					canvasRevision: prev.canvasRevision + 1,
				}));
			});
		},
		[handleMessage],
	);

	const disconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		if (socket) leavePartySocket(socket, { type: "leave" });
		if (roomCodeRef.current) {
			clearPersistentPlayerId("drawing", roomCodeRef.current);
			clearPersistentPlayerToken("drawing", roomCodeRef.current);
			roomCodeRef.current = "";
		}
		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
			isHost: false,
			strokes: [],
			guesses: [],
			undoPending: false,
			canvasRevision: 0,
		});
		undoRequestIdRef.current = null;
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
			strokes: [],
			guesses: [],
			undoPending: false,
			canvasRevision: 0,
		});
		undoRequestIdRef.current = null;
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: GameSettings) => {
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

	const startGame = useCallback(() => {
		if (socketRef.current?.readyState === WebSocket.OPEN && state.isHost) {
			socketRef.current.send(JSON.stringify({ type: "start" }));
		}
	}, [state.isHost]);

	const sendStroke = useCallback((stroke: Stroke) => {
		if (
			socketRef.current?.readyState === WebSocket.OPEN &&
			!undoRequestIdRef.current
		) {
			socketRef.current.send(JSON.stringify({ type: "draw", stroke }));
		}
	}, []);

	const clearCanvas = useCallback(() => {
		if (
			socketRef.current?.readyState === WebSocket.OPEN &&
			!undoRequestIdRef.current
		) {
			socketRef.current.send(JSON.stringify({ type: "clear" }));
		}
	}, []);

	const undoStroke = useCallback(() => {
		if (
			socketRef.current?.readyState === WebSocket.OPEN &&
			!undoRequestIdRef.current
		) {
			const requestId = crypto.randomUUID();
			undoRequestIdRef.current = requestId;
			setState((prev) => ({ ...prev, undoPending: true }));
			socketRef.current.send(JSON.stringify({ type: "undo", requestId }));
		}
	}, []);

	const sendGuess = useCallback((text: string) => {
		if (socketRef.current?.readyState === WebSocket.OPEN && text.trim()) {
			socketRef.current.send(
				JSON.stringify({ type: "guess", text: text.trim() }),
			);
		}
	}, []);

	const submitTelephoneEntry = useCallback(
		(submission: { text?: string; strokes?: Stroke[] }) => {
			if (socketRef.current?.readyState === WebSocket.OPEN && state.gameState) {
				socketRef.current.send(
					JSON.stringify({
						type: "telephone-submit",
						stage: state.gameState.telephoneStage,
						...submission,
					}),
				);
			}
		},
		[state.gameState],
	);

	const advanceTelephoneReveal = useCallback(() => {
		if (
			socketRef.current?.readyState === WebSocket.OPEN &&
			state.isHost &&
			state.gameState
		) {
			socketRef.current.send(
				JSON.stringify({
					type: "telephone-reveal-next",
					chainIndex: state.gameState.telephoneRevealChainIndex,
					entryIndex: state.gameState.telephoneRevealEntryIndex,
				}),
			);
		}
	}, [state.isHost, state.gameState]);

	const sendTelephoneReaction = useCallback(
		(emoji: string) => {
			if (socketRef.current?.readyState === WebSocket.OPEN && state.gameState) {
				socketRef.current.send(
					JSON.stringify({
						type: "telephone-react",
						chainIndex: state.gameState.telephoneRevealChainIndex,
						entryIndex: state.gameState.telephoneRevealEntryIndex,
						emoji,
					}),
				);
			}
		},
		[state.gameState],
	);

	const restartGame = useCallback(() => {
		if (socketRef.current?.readyState === WebSocket.OPEN && state.isHost) {
			socketRef.current.send(JSON.stringify({ type: "restart" }));
		}
	}, [state.isHost]);

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
		sendStroke,
		clearCanvas,
		undoStroke,
		sendGuess,
		submitTelephoneEntry,
		advanceTelephoneReveal,
		sendTelephoneReaction,
		restartGame,
		disconnect,
		abandonReconnect,
	};
}
