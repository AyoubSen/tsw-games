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
	GameSettings,
	PublicGameState,
	ServerMessage,
} from "../../../../party/word-scramble";

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
	lastClaimedWord: string | null;
}

export function useMultiplayerWordScramble() {
	const [state, setState] = useState<MultiplayerState>({
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
		isHost: false,
		lastClaimedWord: null,
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

					const nextPlayers = { ...previous.gameState.players };
					delete nextPlayers[message.playerId];

					return {
						...previous,
						gameState: {
							...previous.gameState,
							players: nextPlayers,
						},
					};
				});
				break;

			case "game-started":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					return {
						...previous,
						lastClaimedWord: null,
						gameState: {
							...previous.gameState,
							status: "playing",
							puzzle: message.puzzle,
							claimedWords: {},
							startedAt: message.startTime,
							finishedAt: null,
							winnerId: null,
							winnerIds: [],
							players: Object.fromEntries(
								Object.entries(previous.gameState.players).map(
									([id, player]) => [
										id,
										{
											...player,
											score: 0,
											foundWords: [],
										},
									],
								),
							),
						},
					};
				});
				break;

			case "word-claimed":
				setState((previous) => {
					if (!previous.gameState) {
						return previous;
					}

					const player = previous.gameState.players[message.playerId];
					if (!player) {
						return previous;
					}

					return {
						...previous,
						lastClaimedWord: message.word,
						gameState: {
							...previous.gameState,
							claimedWords: {
								...previous.gameState.claimedWords,
								[message.word]: message.playerId,
							},
							players: {
								...previous.gameState.players,
								[message.playerId]: {
									...player,
									score: message.score,
									foundWords: [...player.foundWords, message.word].sort(),
								},
							},
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
							winnerId: message.winnerId,
							winnerIds: message.winnerIds,
							claimedWords: message.claimedWords,
						},
					};
				});
				break;

			case "game-restarted":
				setState((previous) => ({
					...previous,
					lastClaimedWord: null,
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
			settings?: GameSettings,
		) => {
			const normalizedRoomCode = roomCode.toUpperCase();
			const previousSocket = socketRef.current;
			socketRef.current = null;
			previousSocket?.close();
			roomCodeRef.current = normalizedRoomCode;
			const playerId = getPersistentPlayerId("word-scramble", normalizedRoomCode);

			setState((previous) => ({
				...previous,
				connectionStatus: "connecting",
				error: null,
				playerId,
				lastClaimedWord: null,
			}));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: normalizedRoomCode,
				id: playerId,
				party: "wordscramble",
				query: {
					host: isHost.toString(),
					...(settings && {
						roundTimeLimit: settings.roundTimeLimit.toString(),
						difficulty: settings.difficulty,
						claimVisibility: settings.claimVisibility,
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
					console.error("Failed to parse Word Scramble message:", error);
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
			clearPersistentPlayerId("word-scramble", roomCodeRef.current);
			roomCodeRef.current = "";
		}

		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
			isHost: false,
			lastClaimedWord: null,
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
			lastClaimedWord: null,
		});
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
		if (isHost) sendNow({ type: "start" });
	}, [isHost, sendNow]);

	const submitWord = useCallback((word: string) => {
		sendNow({ type: "submit-word", word: word.toLowerCase().trim() });
	}, [sendNow]);

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
		submitWord,
		restartGame,
		disconnect,
		abandonReconnect,
	};
}
