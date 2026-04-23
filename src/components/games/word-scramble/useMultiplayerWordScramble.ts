import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateRoomCode, PARTYKIT_HOST } from "@/lib/partykit";
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
			if (socketRef.current) {
				socketRef.current.close();
			}

			setState((previous) => ({
				...previous,
				connectionStatus: "connecting",
				error: null,
				isHost,
				lastClaimedWord: null,
			}));

			const socket = new PartySocket({
				host: PARTYKIT_HOST,
				room: roomCode,
				party: "wordscramble",
				query: {
					host: isHost.toString(),
					...(settings && {
						roundTimeLimit: settings.roundTimeLimit.toString(),
						difficulty: settings.difficulty,
						claimVisibility: settings.claimVisibility,
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
					console.error("Failed to parse Word Scramble message:", error);
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
		if (socketRef.current && state.isHost) {
			socketRef.current.send(JSON.stringify({ type: "start" }));
		}
	}, [state.isHost]);

	const submitWord = useCallback((word: string) => {
		if (socketRef.current) {
			socketRef.current.send(
				JSON.stringify({
					type: "submit-word",
					word: word.toLowerCase().trim(),
				}),
			);
		}
	}, []);

	const restartGame = useCallback(() => {
		if (socketRef.current && state.isHost) {
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
		submitWord,
		restartGame,
		disconnect,
	};
}
