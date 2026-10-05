import { SignInButton, useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	Check,
	History,
	Lock,
	Palette,
	Swords,
	Trophy,
	UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/lib/account";
import { liveGames } from "@/lib/gameCatalog";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import {
	type BallSet,
	ballHex,
	type ClothStyle,
	type Cosmetic,
	type CueStyle,
	isUnlocked,
	POOL_COSMETICS,
	type PoolCosmeticSlot,
	type StatRow,
	unlockProgress,
	unlockText,
} from "../../convex/poolCosmetics";
import {
	cleanDisplayName,
	MAX_DISPLAY_NAME,
	PROFILE_COLORS,
} from "../../convex/profileColors";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const gameTitle = (game: string) =>
	game === "game-night"
		? "Game Night"
		: (liveGames.find((entry) => entry.id === game)?.title ?? game);

const playedWhen = (time: number) => {
	const minutes = Math.round((Date.now() - time) / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return new Date(time).toLocaleDateString();
};

function ProfilePage() {
	const { isLoaded, isSignedIn } = useAuth();
	if (!isLoaded) return null;
	if (!isSignedIn) {
		return (
			<main className="mx-auto max-w-md px-4 py-16 text-center">
				<UserRound className="mx-auto h-10 w-10 text-muted-foreground" />
				<h1 className="mt-4 text-2xl font-bold">Your profile</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Sign in to keep a name, a colour and your game stats. You can still
					play as a guest without an account.
				</p>
				<SignInButton mode="modal">
					<Button className="mt-6">Sign in</Button>
				</SignInButton>
			</main>
		);
	}
	return <SignedInProfile />;
}

function SignedInProfile() {
	const { profile } = useProfile();
	const stats = useQuery(api.profiles.myStats);
	const recentGames = useQuery(api.profiles.myRecentGames);
	const headToHead = useQuery(api.profiles.myHeadToHead);
	const update = useMutation(api.profiles.update);
	const [name, setName] = useState("");
	const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!profile) return;
		setName(profile.displayName);
		setColor(profile.color);
	}, [profile]);

	if (!profile) {
		return (
			<div className="flex min-h-[calc(100vh-73px)] items-center justify-center text-muted-foreground">
				Loading your profile…
			</div>
		);
	}

	const cleaned = cleanDisplayName(name);
	const dirty = cleaned !== profile.displayName || color !== profile.color;

	const save = async () => {
		if (!cleaned) return setMessage("Enter a display name.");
		setSaving(true);
		setMessage(null);
		try {
			await update({ displayName: cleaned, color });
			setMessage("Saved.");
		} catch {
			setMessage("Could not save your profile.");
		} finally {
			setSaving(false);
		}
	};

	const sortedStats = [...(stats ?? [])].sort(
		(a, b) => b.lastPlayedAt - a.lastPlayedAt,
	);

	return (
		<main className="mx-auto grid max-w-4xl items-start gap-6 px-4 py-8 md:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<span
							className="h-4 w-4 rounded-full"
							style={{ backgroundColor: color }}
						/>
						Profile
					</CardTitle>
					<CardDescription>
						This is the name other players see when you're signed in.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Display name"
						maxLength={MAX_DISPLAY_NAME}
					/>
					<div className="flex flex-wrap gap-2">
						{PROFILE_COLORS.map((swatch) => (
							<button
								key={swatch}
								type="button"
								onClick={() => setColor(swatch)}
								aria-label={`Colour ${swatch}`}
								aria-pressed={color === swatch}
								className={cn(
									"grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-primary",
									color === swatch && "ring-2 ring-foreground",
								)}
								style={{ backgroundColor: swatch }}
							>
								{color === swatch && <Check className="h-4 w-4 text-white" />}
							</button>
						))}
					</div>
					<Button
						className="w-full"
						onClick={save}
						disabled={!dirty || saving}
					>
						{saving ? "Saving…" : "Save"}
					</Button>
					{message && (
						<p className="text-sm text-muted-foreground">{message}</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Trophy className="h-5 w-5 text-primary" />
						Stats
					</CardTitle>
					<CardDescription>
						Games you finish while signed in.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{stats === undefined ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : sortedStats.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No games yet - finish a game of Pool or any game in a Game Night
							to see it here.
						</p>
					) : (
						<table className="w-full text-sm">
							<thead className="text-left text-muted-foreground">
								<tr>
									<th className="pb-2 font-medium">Game</th>
									<th className="pb-2 text-right font-medium">Played</th>
									<th className="pb-2 text-right font-medium">Wins</th>
									<th className="pb-2 text-right font-medium">Win %</th>
								</tr>
							</thead>
							<tbody>
								{sortedStats.map((stat) => (
									<tr key={stat._id} className="border-t">
										<td className="py-2 font-medium">
											{gameTitle(stat.game)}
											{(stat.botPlayed ?? 0) > 0 && (
												<span className="block text-xs font-normal text-muted-foreground">
													{stat.botWins ?? 0}/{stat.botPlayed} vs bots
												</span>
											)}
										</td>
										<td className="py-2 text-right tabular-nums">{stat.played}</td>
										<td className="py-2 text-right tabular-nums">{stat.wins}</td>
										<td className="py-2 text-right tabular-nums">
											{Math.round((stat.wins / stat.played) * 100)}%
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			<PoolLooks
				chosen={profile.cosmetics.pool ?? {}}
				stats={stats ?? []}
			/>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<History className="h-5 w-5 text-primary" />
						Recent games
					</CardTitle>
					<CardDescription>Your last 20 finished games.</CardDescription>
				</CardHeader>
				<CardContent>
					{recentGames === undefined ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : recentGames.length === 0 ? (
						<p className="text-sm text-muted-foreground">No games yet.</p>
					) : (
						<ul className="divide-y text-sm">
							{recentGames.map((game) => (
								<li
									key={game._id}
									className="flex items-start justify-between gap-3 py-2"
								>
									<div className="min-w-0">
										<p className="font-medium">{gameTitle(game.game)}</p>
										<p className="truncate text-xs text-muted-foreground">
											{playedWhen(game.playedAt)}
											{game.vsBot && " · with bots"}
											{game.opponents.length > 0 &&
												` · with ${game.opponents.map((opponent) => opponent.displayName).join(", ")}`}
										</p>
									</div>
									<span
										className={cn(
											"shrink-0 font-medium",
											game.won ? "text-primary" : "text-muted-foreground",
										)}
									>
										{game.won ? "Won" : "Played"}
									</span>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Swords className="h-5 w-5 text-primary" />
						Head-to-head
					</CardTitle>
					<CardDescription>
						Signed-in players you've played most. A win counts when you won
						and they didn't.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{headToHead === undefined ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : headToHead.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No games against other signed-in players yet.
						</p>
					) : (
						<table className="w-full text-sm">
							<thead className="text-left text-muted-foreground">
								<tr>
									<th className="pb-2 font-medium">Player</th>
									<th className="pb-2 text-right font-medium">Played</th>
									<th className="pb-2 text-right font-medium">W–L</th>
								</tr>
							</thead>
							<tbody>
								{headToHead.map((record) => (
									<tr key={record._id} className="border-t">
										<td className="py-2 font-medium">
											<span className="flex items-center gap-2">
												<span
													className="h-3 w-3 shrink-0 rounded-full"
													style={{ backgroundColor: record.color }}
												/>
												{record.displayName}
											</span>
										</td>
										<td className="py-2 text-right tabular-nums">
											{record.played}
										</td>
										<td className="py-2 text-right tabular-nums">
											{record.wins}–{record.losses}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</main>
	);
}

const SLOT_TITLES: Record<PoolCosmeticSlot, string> = {
	cue: "Cue",
	cloth: "Cloth",
	ballSet: "Ball set",
};

function CosmeticPreview({
	slot,
	item,
}: {
	slot: PoolCosmeticSlot;
	item: Cosmetic;
}) {
	if (slot === "cue") {
		const cue = item as CueStyle;
		return (
			<span
				className="block h-2.5 w-full rounded-full"
				style={{
					background: `linear-gradient(90deg, ${cue.tip} 0 4%, #f5f2ea 4% 8%, ${cue.shaft[1]} 8% 30%, ${cue.shaft[0]} 30% 62%, ${cue.butt} 62% 72%, ${cue.wrap} 72% 88%, ${cue.butt} 88%)`,
				}}
			/>
		);
	}
	if (slot === "cloth") {
		const cloth = item as ClothStyle;
		return (
			<span
				className="block h-6 w-full rounded"
				style={{
					background: cloth.felt,
					boxShadow: `inset 0 0 0 3px ${cloth.cushion}`,
				}}
			/>
		);
	}
	const set = item as BallSet;
	return (
		<span className="flex justify-center gap-0.5">
			{[1, 9, 2, 10, 3, 11].map((n) => {
				const color = ballHex(set, n);
				return (
					<span
						key={n}
						className="h-3.5 w-3.5 rounded-full"
						style={{
							background:
								n >= 9
									? `linear-gradient(180deg, #f5f1e6 0 24%, ${color} 24% 76%, #f5f1e6 76%)`
									: color,
						}}
					/>
				);
			})}
		</span>
	);
}

function PoolLooks({
	chosen,
	stats,
}: {
	chosen: Partial<Record<PoolCosmeticSlot, string>>;
	stats: StatRow[];
}) {
	const setCosmetic = useMutation(api.profiles.setPoolCosmetic);
	const [error, setError] = useState<string | null>(null);

	const choose = async (slot: PoolCosmeticSlot, id: string) => {
		setError(null);
		try {
			await setCosmetic({ slot, id });
		} catch {
			setError("Could not equip that.");
		}
	};

	return (
		<Card className="md:col-span-2">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Palette className="h-5 w-5 text-primary" />
					Pool looks
				</CardTitle>
				<CardDescription>
					Unlock these by playing. Everyone at the table sees your cue; the
					cloth and ball set are only on your screen.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{(Object.keys(POOL_COSMETICS) as PoolCosmeticSlot[]).map((slot) => {
					const items: Cosmetic[] = POOL_COSMETICS[slot];
					const selected = chosen[slot] ?? items[0].id;
					return (
						<div key={slot}>
							<h3 className="mb-2 text-sm font-medium">{SLOT_TITLES[slot]}</h3>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								{items.map((item) => {
									const unlocked = isUnlocked(item, stats);
									const active = item.id === selected;
									return (
										<button
											key={item.id}
											type="button"
											disabled={!unlocked || active}
											onClick={() => choose(slot, item.id)}
											aria-pressed={active}
											className={cn(
												"flex flex-col gap-2 rounded-lg border p-2 text-left text-sm transition",
												active && "border-primary ring-1 ring-primary",
												unlocked
													? "hover:bg-muted"
													: "cursor-not-allowed opacity-60",
											)}
										>
											<CosmeticPreview slot={slot} item={item} />
											<span className="flex items-center gap-1 font-medium">
												{!unlocked && <Lock className="h-3 w-3" />}
												{item.name}
												{active && (
													<Check className="ml-auto h-4 w-4 text-primary" />
												)}
											</span>
											{item.unlock && !unlocked && (
												<span className="text-xs text-muted-foreground">
													{unlockText(item.unlock)} (
													{Math.min(
														unlockProgress(item.unlock, stats),
														item.unlock.count,
													)}
													/{item.unlock.count})
												</span>
											)}
										</button>
									);
								})}
							</div>
						</div>
					);
				})}
				{error && <p className="text-sm text-muted-foreground">{error}</p>}
			</CardContent>
		</Card>
	);
}
