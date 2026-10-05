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
	ClientMessage,
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
	undoPending: boolean;
	canvasRevision: number;
	/** Server clock minus ours, so paced beats line up across devices. */
	clockOffset: number;
}

const EMPTY: MultiplayerState = {
	connectionStatus: "disconnected",
	gameState: null,
	playerId: null,
	error: null,
	isHost: false,
	strokes: [],
	undoPending: false,
	canvasRevision: 0,
	clockOffset: 0,
};

function strokesMatch(left: Stroke[], right: Stroke[]): boolean {
	if (left.length !== right.length) return false;
	return left.every((stroke, strokeIndex) => {
		const other = right[strokeIndex];
		return (
			stroke.color === other.color &&
			stroke.size === other.size &&
			stroke.tool === other.tool &&
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
	const [state, setState] = useState<MultiplayerState>(EMPTY);
	const { bubbles: reactions, receive: receiveReaction, clear: clearReactions } = useReactionBubbles();

	const socketRef = useRef<PartySocket | null>(null);
	const authTokenRef = useAuthTokenRef();
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
						clockOffset: message.state.serverNow - Date.now(),
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

			case "reaction":
				receiveReaction(message);
				break;

			case "game-over":
				undoRequestIdRef.current = null;
				setState((prev) => ({ ...prev, undoPending: false }));
				break;

			case "game-restarted":
				undoRequestIdRef.current = null;
				setState((prev) => ({
					...prev,
					strokes: [],
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
	}, [receiveReaction]);

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
			const playerId = getPersistentPlayerId("drawing", normalizedRoomCode);

			playerNameRef.current = playerName;
			undoRequestIdRef.current = null;

			setState((prev) => ({
				...prev,
				connectionStatus: "connecting",
				gameState: null,
				error: null,
				isHost: false,
				playerId,
				strokes: [],
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
					...gameNightQuery,
					...(settings && {
						mode: settings.mode,
						roundTimeLimit: settings.roundTimeLimit.toString(),
						roundsPerPlayer: settings.roundsPerPlayer.toString(),
					}),
				},
				maxEnqueuedMessages: 0,
			});
			socketRef.current = socket;

			socket.addEventListener("open", async () => {
				if (socketRef.current !== socket) return;
				setState((prev) => ({
					...prev,
					connectionStatus: "connected",
					playerId: socket.id,
				}));

				const authToken = await authTokenRef.current();
				if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
				socket.send(JSON.stringify({ type: "join", name: playerName, authToken }));
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
		[handleMessage, authTokenRef],
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
		clearReactions();
		setState(EMPTY);
		undoRequestIdRef.current = null;
	}, [clearReactions]);

	const abandonReconnect = useCallback(() => {
		const socket = socketRef.current;
		socketRef.current = null;
		socket?.close();
		roomCodeRef.current = "";
		setState(EMPTY);
		undoRequestIdRef.current = null;
	}, []);

	const createGame = useCallback(
		(playerName: string, settings: GameSettings, suppliedRoomId?: string) => {
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

	const send = useCallback((message: ClientMessage) => {
		if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
		socketRef.current.send(JSON.stringify(message));
		return true;
	}, []);

	const startGame = useCallback(() => {
		if (state.isHost) send({ type: "start" });
	}, [state.isHost, send]);

	const chooseWord = useCallback((index: number) => {
		send({ type: "choose-word", index });
	}, [send]);

	const sendStroke = useCallback((stroke: Stroke) => {
		if (!undoRequestIdRef.current) send({ type: "draw", stroke });
	}, [send]);

	const clearCanvas = useCallback(() => {
		if (!undoRequestIdRef.current) send({ type: "clear" });
	}, [send]);

	const undoStroke = useCallback(() => {
		if (socketRef.current?.readyState === WebSocket.OPEN && !undoRequestIdRef.current) {
			const requestId = crypto.randomUUID();
			undoRequestIdRef.current = requestId;
			setState((prev) => ({ ...prev, undoPending: true }));
			send({ type: "undo", requestId });
		}
	}, [send]);

	const sendGuess = useCallback((text: string) => {
		if (text.trim()) send({ type: "guess", text: text.trim() });
	}, [send]);

	const react = useCallback((reaction: Reaction) => {
		send({ type: "react", reaction });
	}, [send]);

	const telephoneStage = state.gameState?.telephoneStage;
	const submitTelephoneEntry = useCallback(
		(submission: { text?: string; strokes?: Stroke[] }) => {
			if (telephoneStage !== undefined) {
				send({ type: "telephone-submit", stage: telephoneStage, ...submission });
			}
		},
		[telephoneStage, send],
	);

	const revealChainIndex = state.gameState?.telephoneRevealChainIndex;
	const revealEntryIndex = state.gameState?.telephoneRevealEntryIndex;
	const advanceTelephoneReveal = useCallback(() => {
		if (state.isHost && revealChainIndex !== undefined && revealEntryIndex !== undefined) {
			send({ type: "telephone-reveal-next", chainIndex: revealChainIndex, entryIndex: revealEntryIndex });
		}
	}, [state.isHost, revealChainIndex, revealEntryIndex, send]);

	const sendTelephoneReaction = useCallback(
		(emoji: string) => {
			if (revealChainIndex !== undefined && revealEntryIndex !== undefined) {
				send({ type: "telephone-react", chainIndex: revealChainIndex, entryIndex: revealEntryIndex, emoji });
			}
		},
		[revealChainIndex, revealEntryIndex, send],
	);

	const restartGame = useCallback(() => {
		if (state.isHost) send({ type: "restart" });
	}, [state.isHost, send]);

	const drawVoteRoundNumber = state.gameState?.roundNumber;
	const sendDrawVoteAction = useCallback((
		action:
			| { type: "draw-vote-edit"; action: "stroke" | "undo" | "clear"; stroke?: Stroke }
			| { type: "draw-vote-submit" }
			| { type: "draw-vote-vote"; entryId: string }
			| { type: "draw-vote-next" },
	) => {
		if (drawVoteRoundNumber !== undefined) {
			send({ ...action, round: drawVoteRoundNumber } as ClientMessage);
		}
	}, [drawVoteRoundNumber, send]);

	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.close();
			}
		};
	}, []);

	return {
		...state,
		reactions,
		createGame,
		joinGame,
		startGame,
		chooseWord,
		sendStroke,
		clearCanvas,
		undoStroke,
		sendGuess,
		react,
		submitTelephoneEntry,
		advanceTelephoneReveal,
		sendTelephoneReaction,
		restartGame,
		sendDrawVoteAction,
		disconnect,
		abandonReconnect,
	};
}
