import { SignInButton, useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check, Trophy, UserRound } from "lucide-react";
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
	cleanDisplayName,
	MAX_DISPLAY_NAME,
	PROFILE_COLORS,
} from "../../convex/profileColors";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const gameTitle = (game: string) =>
	game === "game-night"
		? "Game Night"
		: (liveGames.find((entry) => entry.id === game)?.title ?? game);

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
							No games yet - finish a game of Pool or a Game Night to see it
							here.
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
										<td className="py-2 font-medium">{gameTitle(stat.game)}</td>
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
		</main>
	);
}
