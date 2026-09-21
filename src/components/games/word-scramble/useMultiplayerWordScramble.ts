import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearPersistentPlayerId,
	clearPersistentPlayerToken,
	generateRoomCode,
	getGameNightSocketQuery,
	leavePartySocket,
	PARTYKIT_HOST,
	getPersistentPlayerId,
	getPersistentPlayerToken,
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
	lastClaimedPlayerId: string | null;
}

export function useMultiplayerWordScramble() {
	const [state, setState] = useState<MultiplayerState>({
		connectionStatus: "disconnected",
		gameState: null,
		playerId: null,
		error: null,
		isHost: false,
		lastClaimedWord: null,
		lastClaimedPlayerId: null,
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
						lastClaimedPlayerId: null,
						gameState: {
							...previous.gameState,
							status: "playing",
							puzzle: message.puzzle,
							claimedWords: {},
							claimedCount: 0,
							ownFoundWords: [],
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
											foundCount: 0,
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

					const claimedWords = message.word
						? {
								...previous.gameState.claimedWords,
								[message.word]: message.playerId,
							}
						: previous.gameState.claimedWords;
					const isOwnClaim = message.playerId === previous.playerId;

					return {
						...previous,
						lastClaimedWord: message.word ?? null,
						lastClaimedPlayerId: message.playerId,
						gameState: {
							...previous.gameState,
							claimedWords,
							claimedCount: previous.gameState.claimedCount + 1,
							ownFoundWords:
								isOwnClaim && message.word
									? [...previous.gameState.ownFoundWords, message.word].sort()
									: previous.gameState.ownFoundWords,
							players: {
								...previous.gameState.players,
								[message.playerId]: {
									...player,
									score: message.score,
									foundCount: message.foundCount,
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
							claimedCount: Object.keys(message.claimedWords).length,
							puzzle: previous.gameState.puzzle
								? {
									...previous.gameState.puzzle,
									solutions: message.solutions,
								}
								: null,
						},
					};
				});
				break;

			case "game-restarted":
				setState((previous) => ({
					...previous,
					lastClaimedWord: null,
					lastClaimedPlayerId: null,
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
			const gameNightQuery = getGameNightSocketQuery(roomCode);
			const normalizedRoomCode = Object.keys(gameNightQuery).length
				? roomCode
				: roomCode.toUpperCase();
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
				lastClaimedPlayerId: null,
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
					...gameNightQuery,
					playerToken: getPersistentPlayerToken("word-scramble", normalizedRoomCode),
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
			clearPersistentPlayerToken("word-scramble", roomCodeRef.current);
			roomCodeRef.current = "";
		}

		setState({
			connectionStatus: "disconnected",
			gameState: null,
			playerId: null,
			error: null,
			isHost: false,
			lastClaimedWord: null,
			lastClaimedPlayerId: null,
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
			lastClaimedPlayerId: null,
		});
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: GameSettings, roomId?: string) => {
			const roomCode = roomId ?? generateRoomCode();
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
