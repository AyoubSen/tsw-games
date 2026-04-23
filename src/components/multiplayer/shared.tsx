import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, Crown, Play, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface MultiplayerPlayer {
	id: string;
	name: string;
	joinedAt?: number;
}

interface GameTopBarProps {
	title: string;
	subtitle: string;
	onBack?: () => void;
	backTo?: string;
	rightAction?: ReactNode;
}

export function GameTopBar({
	title,
	subtitle,
	onBack,
	backTo = "/",
	rightAction,
}: GameTopBarProps) {
	const backContent = (
		<>
			<ArrowLeft className="w-4 h-4 mr-1" />
			Back
		</>
	);

	return (
		<div className="px-4 py-3 flex items-center justify-between border-b border-border">
			{onBack ? (
				<Button variant="ghost" size="sm" onClick={onBack}>
					{backContent}
				</Button>
			) : (
				<Button variant="ghost" size="sm" asChild>
					<Link to={backTo}>{backContent}</Link>
				</Button>
			)}
			<div className="text-center">
				<h1 className="text-lg font-bold">{title}</h1>
				<p className="text-xs text-muted-foreground">{subtitle}</p>
			</div>
			{rightAction ?? <div className="w-[60px]" />}
		</div>
	);
}

interface MultiplayerSetupCardProps {
	title: string;
	description: string;
	icon: ReactNode;
	playerName: string;
	roomCode: string;
	createLabel: string;
	onPlayerNameChange: (value: string) => void;
	onRoomCodeChange: (value: string) => void;
	onJoin: () => void;
	onCreate: () => void;
	children?: ReactNode;
	message?: string | null;
}

export function MultiplayerSetupCard({
	title,
	description,
	icon,
	playerName,
	roomCode,
	createLabel,
	onPlayerNameChange,
	onRoomCodeChange,
	onJoin,
	onCreate,
	children,
	message,
}: MultiplayerSetupCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{icon}
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Input
					value={playerName}
					onChange={(event) => onPlayerNameChange(event.target.value)}
					placeholder="Your name"
					maxLength={20}
				/>
				<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
					<Input
						value={roomCode}
						onChange={(event) =>
							onRoomCodeChange(
								event.target.value
									.toUpperCase()
									.replace(/[^A-Z0-9]/g, "")
									.slice(0, 6),
							)
						}
						placeholder="Room code"
						maxLength={6}
					/>
					<Button variant="outline" onClick={onJoin}>
						Join Room
					</Button>
				</div>
				{children}
				<Button className="w-full" onClick={onCreate}>
					{createLabel}
				</Button>
				{message && (
					<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
						{message}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface PlayerListCardProps {
	players: MultiplayerPlayer[];
	hostId: string;
	currentPlayerId: string;
	description: string;
	getStatus?: (player: MultiplayerPlayer) => string;
}

export function PlayerListCard({
	players,
	hostId,
	currentPlayerId,
	description,
	getStatus,
}: PlayerListCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Users className="h-5 w-5 text-primary" />
					Players
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{players.map((player) => (
					<div
						key={player.id}
						className="flex items-center justify-between rounded-2xl border px-4 py-3"
					>
						<div className="flex items-center gap-2">
							<span className="font-medium">{player.name}</span>
							{player.id === hostId && (
								<Crown className="h-4 w-4 text-yellow-500" />
							)}
						</div>
						<span className="text-xs text-muted-foreground">
							{getStatus?.(player) ??
								(player.id === currentPlayerId ? "You" : "Ready")}
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

interface RoomCodeCardProps {
	roomCode: string;
	copied: boolean;
	onCopy: () => void;
}

export function RoomCodeCard({ roomCode, copied, onCopy }: RoomCodeCardProps) {
	return (
		<div className="rounded-2xl bg-accent/40 p-4 text-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="font-semibold">Room Code</p>
					<p className="mt-2 text-2xl font-black tracking-[0.25em]">
						{roomCode}
					</p>
				</div>
				<Button type="button" variant="outline" size="sm" onClick={onCopy}>
					{copied ? (
						<Check className="h-4 w-4" />
					) : (
						<Copy className="h-4 w-4" />
					)}
				</Button>
			</div>
		</div>
	);
}

interface MultiplayerLobbyProps {
	title: string;
	subtitle: string;
	onBack: () => void;
	players: MultiplayerPlayer[];
	hostId: string;
	currentPlayerId: string;
	playerDescription: string;
	settings: ReactNode;
	roomCode: string;
	copiedRoomCode: boolean;
	onCopyRoomCode: () => void;
	onStart: () => void;
	onLeave: () => void;
	canStart: boolean;
	isHost: boolean;
	message?: string | null;
	startLabel?: string;
	getPlayerStatus?: (player: MultiplayerPlayer) => string;
}

export function MultiplayerLobby({
	title,
	subtitle,
	onBack,
	players,
	hostId,
	currentPlayerId,
	playerDescription,
	settings,
	roomCode,
	copiedRoomCode,
	onCopyRoomCode,
	onStart,
	onLeave,
	canStart,
	isHost,
	message,
	startLabel = "Start Match",
	getPlayerStatus,
}: MultiplayerLobbyProps) {
	return (
		<div className="min-h-[calc(100vh-73px)] bg-background">
			<GameTopBar title={title} subtitle={subtitle} onBack={onBack} />
			<div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
				<PlayerListCard
					players={players}
					hostId={hostId}
					currentPlayerId={currentPlayerId}
					description={playerDescription}
					getStatus={getPlayerStatus}
				/>
				<Card>
					<CardHeader>
						<CardTitle>Match Controls</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{settings}
						<RoomCodeCard
							roomCode={roomCode}
							copied={copiedRoomCode}
							onCopy={onCopyRoomCode}
						/>
						<Button
							className="w-full"
							onClick={onStart}
							disabled={!isHost || !canStart}
						>
							<Play className="mr-2 h-4 w-4" />
							{startLabel}
						</Button>
						<Button className="w-full" variant="outline" onClick={onLeave}>
							Leave Lobby
						</Button>
						{message && (
							<div className="rounded-xl border bg-accent/40 px-4 py-3 text-sm">
								{message}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
