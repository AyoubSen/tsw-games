import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { liveGames, plannedGames } from "@/lib/gameCatalog";
import { useSettings } from "@/lib/useTheme";

export const Route = createFileRoute("/")({ component: HomePage });

function CardsLayout() {
	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{liveGames.map((game) => (
				<Card
					key={game.id}
					className="relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
				>
					{game.isNew && (
						<div className="absolute top-3 right-3 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
							NEW
						</div>
					)}
					<CardHeader>
						<div
							className={`mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${game.color} text-white shadow-lg`}
						>
							{game.icon}
						</div>
						<CardTitle>{game.title}</CardTitle>
						<CardDescription>{game.description}</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-muted-foreground">
								{game.players}
							</span>
							<Button asChild>
								<Link to={game.path}>Play</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function GridLayout() {
	return (
		<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{liveGames.map((game) => (
				<Link
					key={game.id}
					to={game.path}
					className="group relative flex flex-col items-center rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-accent/50"
				>
					{game.isNew && (
						<div className="absolute -top-2 -right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
							NEW
						</div>
					)}
					<div
						className={`mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${game.color} text-white shadow-md transition-transform group-hover:scale-110`}
					>
						<span className="scale-75">{game.icon}</span>
					</div>
					<span className="text-center font-semibold">{game.title}</span>
					<span className="mt-1 text-xs text-muted-foreground">
						{game.players}
					</span>
					<div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary/90 opacity-0 transition-opacity group-hover:opacity-100">
						<Play className="h-8 w-8 fill-current text-primary-foreground" />
					</div>
				</Link>
			))}
		</div>
	);
}

function UpcomingSection() {
	return (
		<section className="mt-14">
			<div className="mb-6 flex items-center justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Coming Next</h2>
					<p className="text-sm text-muted-foreground">
						Roadmapped ideas that would fit this multiplayer party setup well.
					</p>
				</div>
				<span className="text-sm text-muted-foreground">
					{plannedGames.length} ideas queued
				</span>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{plannedGames.map((game) => (
					<Card key={game.id} className="border-dashed bg-card/70">
						<CardHeader>
							<div
								className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${game.color} text-white shadow-md`}
							>
								<span className="scale-90">{game.icon}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<CardTitle className="text-base">{game.title}</CardTitle>
								<span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
									Planned
								</span>
							</div>
							<CardDescription>{game.description}</CardDescription>
						</CardHeader>
						<CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
							<span>{game.players}</span>
							<span className="capitalize">{game.category}</span>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}

function HomePage() {
	const { layout } = useSettings();

	return (
		<div className="min-h-[calc(100vh-73px)] bg-background">
			<section className="px-6 py-12 text-center md:py-16">
				<div className="mx-auto max-w-3xl">
					<h1 className="mb-4 bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
						TSW Games
					</h1>
					<p className="mb-6 text-lg text-muted-foreground md:text-xl">
						Fast multiplayer games for the crew, from quick word rounds to full
						social deduction nights.
					</p>
					<div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
						<div className="flex items-center gap-2">
							<Zap className="h-4 w-4 text-yellow-500" />
							<span>Quick to play</span>
						</div>
						<div className="flex items-center gap-2">
							<Users className="h-4 w-4 text-blue-500" />
							<span>Built for groups</span>
						</div>
					</div>
				</div>
			</section>

			<section className="mx-auto max-w-6xl px-6 pb-16">
				<div className="mb-6 flex items-center justify-between">
					<h2 className="text-xl font-semibold">Games</h2>
					<span className="text-sm text-muted-foreground">
						{liveGames.length} available
					</span>
				</div>

				{layout === "cards" ? <CardsLayout /> : <GridLayout />}

				<UpcomingSection />
			</section>
		</div>
	);
}
