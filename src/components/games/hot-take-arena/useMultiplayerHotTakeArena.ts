import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateRoomCode, PARTYKIT_HOST } from "@/lib/partykit";
import type {
	HotTakePosition,
	HotTakeSettings,
	PublicHotTakeGameState,
	ServerMessage,
} from "../../../../party/hot-take-arena";

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export interface MultiplayerHotTakeArenaState {
	connectionStatus: ConnectionStatus;
	gameState: PublicHotTakeGameState | null;
	playerId: string | null;
	error: string | null;
	isHost: boolean;
}

export function useMultiplayerHotTakeArena() {
	const [state, setState] = useState<MultiplayerHotTakeArenaState>({
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
							status: "voting",
							prompt: message.prompt,
							roundNumber: message.roundNumber,
							submittedPlayerIds: [],
							revealedVotes: [],
							voteGroups: [],
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
							voteGroups: message.voteGroups,
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
			settings?: HotTakeSettings,
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
				party: "hottakearena",
				query: {
					host: isHost.toString(),
					...(settings && {
						rounds: settings.rounds.toString(),
						roundTimeLimit: settings.roundTimeLimit.toString(),
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
					console.error("Failed to parse Hot Take Arena message:", error);
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
		(playerName: string, settings: HotTakeSettings) => {
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

	const submitVote = useCallback((position: HotTakePosition) => {
		if (socketRef.current) {
			socketRef.current.send(
				JSON.stringify({
					type: "submit-vote",
					position,
				}),
			);
		}
	}, []);

	const nextRound = useCallback(() => {
		if (socketRef.current && state.isHost) {
			socketRef.current.send(JSON.stringify({ type: "next-round" }));
		}
	}, [state.isHost]);

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
		submitVote,
		nextRound,
		restartGame,
		disconnect,
	};
}
