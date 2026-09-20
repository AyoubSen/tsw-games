import { useNavigate, useRouterState } from "@tanstack/react-router";
import PartySocket from "partysocket";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type {
	GameNightConnection,
	GameNightGameId,
	GameNightServerMessage,
	PublicGameNightState,
} from "@/lib/gameNight";
import { getGameNightGame } from "@/lib/gameNight";
import {
	clearPersistentPlayerId,
	clearPersistentPlayerToken,
	generateRoomCode,
	getPersistentPlayerId,
	getPersistentPlayerToken,
	leavePartySocket,
	PARTYKIT_HOST,
	rememberGameNightChildConnection,
} from "@/lib/partykit";

interface StoredGameNightSession {
	roomCode: string;
	name: string;
	savedAt: number;
}

interface GameNightContextValue {
	state: PublicGameNightState | null;
	connection: GameNightConnection | null;
	playerId: string | null;
	connectionStatus: "disconnected" | "connecting" | "connected" | "error";
	error: string | null;
	isHost: boolean;
	createRoom: (name: string) => string;
	joinRoom: (roomCode: string, name: string) => void;
	selectGame: (gameId: GameNightGameId) => void;
	markReady: (matchId: string) => boolean;
	completeMatch: (matchId: string) => boolean;
	leaveRoom: () => void;
}

const GameNightContext = createContext<GameNightContextValue | null>(null);
const SESSION_KEY = "game-night:lastSession";
const SESSION_TTL = 6 * 60 * 60 * 1000;

function readSession(): StoredGameNightSession | null {
	if (typeof sessionStorage === "undefined") return null;
	try {
		const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as StoredGameNightSession | null;
		if (!session || Date.now() - session.savedAt > SESSION_TTL) return null;
		return session;
	} catch {
		return null;
	}
}

export function GameNightProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<PublicGameNightState | null>(null);
	const [connection, setConnection] = useState<GameNightConnection | null>(null);
	const [playerId, setPlayerId] = useState<string | null>(null);
	const [connectionStatus, setConnectionStatus] = useState<GameNightContextValue["connectionStatus"]>("disconnected");
	const [error, setError] = useState<string | null>(null);
	const socketRef = useRef<PartySocket | null>(null);
	const roomCodeRef = useRef("");
	const navigatedMatchRef = useRef<string | null>(null);
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

	const connect = (roomCode: string, name: string, host: boolean) => {
		const normalized = roomCode.trim().toUpperCase();
		socketRef.current?.close();
		setState(null);
		setConnection(null);
		navigatedMatchRef.current = null;
		roomCodeRef.current = normalized;
		const id = getPersistentPlayerId("game-night", normalized);
		const socket = new PartySocket({
			host: PARTYKIT_HOST,
			party: "gamenight",
			room: normalized,
			id,
			query: { host: host.toString(), playerToken: getPersistentPlayerToken("game-night", normalized) },
			maxEnqueuedMessages: 0,
		});
		socketRef.current = socket;
		setPlayerId(id);
		setConnectionStatus("connecting");
		setError(null);
		socket.addEventListener("open", () => {
			if (socketRef.current !== socket) return;
			setConnectionStatus("connected");
			socket.send(JSON.stringify({ type: "join", name }));
		});
		socket.addEventListener("message", (event) => {
			if (socketRef.current !== socket) return;
			try {
				const message = JSON.parse(event.data) as GameNightServerMessage;
				if (message.type === "error") setError(message.message);
				else {
					setState(message.state);
					setConnection(message.connection);
					setError(null);
					sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: normalized, name, savedAt: Date.now() }));
					if (message.connection) {
						rememberGameNightChildConnection(message.connection.roomId, {
							roomCode: message.connection.roomCode,
							matchId: message.connection.matchId,
							playerId: message.connection.playerId,
							ticket: message.connection.ticket,
						});
					}
				}
			} catch {
				setError("Could not read the Game Night room");
			}
		});
		const reconnecting = () => {
			if (socketRef.current !== socket) return;
			setConnectionStatus("connecting");
		};
		socket.addEventListener("close", reconnecting);
		socket.addEventListener("error", reconnecting);
		sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: normalized, name, savedAt: Date.now() }));
	};

	useEffect(() => {
		const session = readSession();
		const invite = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("room")?.toUpperCase();
		if (session && !(window.location.pathname === "/game-night" && invite && invite !== session.roomCode)) {
			connect(session.roomCode, session.name, false);
		}
		return () => socketRef.current?.close();
	}, []);

	useEffect(() => {
		if (!connection?.canEnter || state?.activeMatch?.status === "finished" || navigatedMatchRef.current === connection.matchId) return;
		const game = getGameNightGame(connection.gameId);
		if (!game) return;
		if (pathname === game.path) {
			navigatedMatchRef.current = connection.matchId;
			return;
		}
		navigatedMatchRef.current = connection.matchId;
		navigate({ to: game.path, search: { night: connection.roomCode } });
	}, [connection, state?.activeMatch?.status, pathname, navigate]);

	const send = (message: object) => {
		if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
		socketRef.current.send(JSON.stringify(message));
		return true;
	};

	const leaveRoom = () => {
		const roomCode = roomCodeRef.current;
		const socket = socketRef.current;
		socketRef.current = null;
		if (socket) leavePartySocket(socket, { type: "leave" });
		if (roomCode) {
			clearPersistentPlayerId("game-night", roomCode);
			clearPersistentPlayerToken("game-night", roomCode);
		}
		sessionStorage.removeItem(SESSION_KEY);
		roomCodeRef.current = "";
		setState(null);
		setConnection(null);
		setPlayerId(null);
		setConnectionStatus("disconnected");
		setError(null);
		navigatedMatchRef.current = null;
	};

	const value: GameNightContextValue = {
		state,
		connection,
		playerId,
		connectionStatus,
		error,
		isHost: Boolean(state && playerId && state.hostId === playerId),
		createRoom: (name) => {
			const roomCode = generateRoomCode();
			connect(roomCode, name, true);
			return roomCode;
		},
		joinRoom: (roomCode, name) => connect(roomCode, name, false),
		selectGame: (gameId) => send({ type: "select-game", gameId }),
		markReady: (matchId) => send({ type: "match-ready", matchId }),
		completeMatch: (matchId) => send({ type: "complete-match", matchId }),
		leaveRoom,
	};

	return <GameNightContext.Provider value={value}>{children}</GameNightContext.Provider>;
}

export function useGameNight() {
	const context = useContext(GameNightContext);
	if (!context) throw new Error("useGameNight must be used inside GameNightProvider");
	return context;
}
