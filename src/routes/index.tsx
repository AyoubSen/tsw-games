import * as Dialog from "@radix-ui/react-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	GAME_COMPLEXITIES,
	GAME_COMPLEXITY_LABELS,
	GAME_DURATION_OPTIONS,
	GAME_MOODS,
	GAME_MOOD_LABELS,
	GAME_PLAYER_OPTIONS,
	GAME_TAG_LABELS,
	GAME_TAGS,
	type GameComplexity,
	type GameMood,
	type GameTag,
	type LiveGameCatalogEntry,
	liveGames,
	plannedGames,
} from "@/lib/gameCatalog";

export const Route = createFileRoute("/")({ component: HomePage });

const GENRES = [
	{ id: "word", label: "Word" },
	{ id: "party", label: "Party" },
	{ id: "social", label: "Social" },
	{ id: "strategy", label: "Strategy" },
	{ id: "arcade", label: "Arcade" },
] as const;

type Genre = (typeof GENRES)[number]["id"];

function matchesQuery(game: LiveGameCatalogEntry, query: string) {
	if (!query) return true;
	const haystack = [
		game.title,
		game.description,
		game.category,
		game.players,
		GAME_COMPLEXITY_LABELS[game.complexity],
		`${game.durationMinutes[0]}-${game.durationMinutes[1]} minutes`,
		...game.moods.map((mood) => GAME_MOOD_LABELS[mood]),
		...game.tags.map((tag) => GAME_TAG_LABELS[tag]),
	]
		.join(" ")
		.toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((term) => haystack.includes(term));
}

function Pill({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
				active
					? "bg-foreground text-background"
					: "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
			}`}
		>
			{label}
		</button>
	);
}

function GameCard({ game }: { game: LiveGameCatalogEntry }) {
	return (
		<Link
			to={game.path}
			className="group relative flex flex-col gap-3 rounded-xl bg-card/60 p-4 ring-1 ring-border/60 transition-all hover:bg-card hover:ring-primary/40"
		>
			<div className="flex items-center gap-3">
				<div
					className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${game.color} text-white`}
				>
					<span className="scale-[0.55]">{game.icon}</span>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate font-semibold leading-tight">
							{game.title}
						</h3>
						{game.isNew && (
							<span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">
								New
							</span>
						)}
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">{game.players}</p>
				</div>
			</div>

			<p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
				{game.description}
			</p>

			<p className="mt-auto truncate text-[11px] text-muted-foreground/70">
				{game.durationMinutes[0]}-{game.durationMinutes[1]} min ·{" "}
				{GAME_COMPLEXITY_LABELS[game.complexity]} ·{" "}
				{GAME_MOOD_LABELS[game.moods[0]]}
			</p>
		</Link>
	);
}

function GameTile({ game }: { game: LiveGameCatalogEntry }) {
	return (
		<Link
			to={game.path}
			className="group flex flex-col items-center gap-2.5 rounded-xl p-4 transition-colors hover:bg-muted/60"
		>
			<div
				className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${game.color} text-white transition-transform group-hover:scale-105`}
			>
				<span className="scale-75">{game.icon}</span>
				{game.isNew && (
					<span className="absolute -top-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
						New
					</span>
				)}
			</div>
			<div className="text-center">
				<p className="text-sm font-semibold leading-tight">{game.title}</p>
				<p className="mt-0.5 text-[11px] text-muted-foreground">
					{game.players}
				</p>
			</div>
		</Link>
	);
}

/** Renders the active home layout (cards or compact grid, chosen in settings). */
function GameCollection({ games }: { games: LiveGameCatalogEntry[] }) {
	return (
		<>
			<div className="home-layout home-layout-cards">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{games.map((game) => (
						<GameCard key={game.id} game={game} />
					))}
				</div>
			</div>
			<div className="home-layout home-layout-grid">
				<div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
					{games.map((game) => (
						<GameTile key={game.id} game={game} />
					))}
				</div>
			</div>
		</>
	);
}

function RecommendationPicker() {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const [players, setPlayers] = useState<number | null>(null);
	const [minutes, setMinutes] = useState<number | null>(null);
	const [complexity, setComplexity] = useState<GameComplexity | null>(null);
	const [mood, setMood] = useState<GameMood | null>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);

	useEffect(() => {
		if (!open) return;
		const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
		return () => window.cancelAnimationFrame(frame);
	}, [open, step]);

	const recommendations = useMemo(() => {
		if (players === null || minutes === null || complexity === null || mood === null)
			return [];

		return liveGames
			.map((game, order) => {
				if (
					players < game.minPlayers ||
					players > game.maxPlayers ||
					game.durationMinutes[1] > minutes ||
					game.complexity !== complexity ||
					!game.moods.includes(mood)
				)
					return null;

				const ideal = players >= game.idealPlayers[0] && players <= game.idealPlayers[1];
				const fitsComfortably = game.durationMinutes[1] <= minutes;
				const score =
					(ideal ? 5 : 0) +
					(fitsComfortably ? 3 : 1);
				const reasons = [
					`Matches your ${GAME_MOOD_LABELS[mood].toLowerCase()} mood`,
					`${GAME_COMPLEXITY_LABELS[complexity]} to learn`,
					ideal ? `Great with ${players} ${players === 1 ? "player" : "players"}` : null,
					fitsComfortably ? `Fits comfortably in ${minutes} minutes` : null,
				].filter((reason): reason is string => reason !== null);

				return { game, order, score, reasons };
			})
			.filter((result) => result !== null)
			.sort((a, b) => b.score - a.score || a.order - b.order)
			.slice(0, 3);
	}, [players, minutes, complexity, mood]);

	const choose = <T,>(value: T, setter: (value: T) => void) => {
		setter(value);
		setStep((current) => current + 1);
	};

	const restart = () => {
		setStep(0);
		setPlayers(null);
		setMinutes(null);
		setComplexity(null);
		setMood(null);
	};

	const questions = [
		{
			title: "How many are playing?",
			hint: "Include everyone joining this round.",
			options: GAME_PLAYER_OPTIONS.map((option) => ({
				id: String(option.value),
				label: option.label,
				onClick: () => choose(option.value, setPlayers),
			})),
		},
		{
			title: "How much time do you have?",
			hint: "We'll only suggest games that fit inside your available time.",
			options: GAME_DURATION_OPTIONS.map((option) => ({
				id: String(option.value),
				label: option.label,
				onClick: () => choose(option.value, setMinutes),
			})),
		},
		{
			title: "How much thinking?",
			hint: "Pick the rules and strategy level your group wants.",
			options: GAME_COMPLEXITIES.map((option) => ({
				id: option.id,
				label: option.label,
				onClick: () => choose(option.id, setComplexity),
			})),
		},
		{
			title: "What's the mood?",
			hint: "Choose the energy you want from the room.",
			options: GAME_MOODS.map((option) => ({
				id: option.id,
				label: option.label,
				onClick: () => choose(option.id, setMood),
			})),
		},
	];

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition hover:opacity-90"
				>
					<Sparkles className="h-4 w-4" />
					Pick for us
				</button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
				<Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[calc(100vh-2rem)] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl outline-none sm:p-7">
					<div className="flex items-start justify-between gap-4">
						<div>
							<Dialog.Title ref={titleRef} tabIndex={-1} className="text-xl font-bold tracking-tight outline-none">
								{step < questions.length ? questions[step].title : "Tonight's pick"}
							</Dialog.Title>
							<Dialog.Description className="mt-1 text-sm text-muted-foreground">
								{step < questions.length
									? questions[step].hint
									: "Ranked from the games that fit your group and schedule."}
							</Dialog.Description>
						</div>
						<Dialog.Close asChild>
							<button type="button" aria-label="Close picker" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
								<X className="h-4 w-4" />
							</button>
						</Dialog.Close>
					</div>

					{step < questions.length ? (
						<>
							<div className="mt-5 flex gap-1.5" aria-label={`Step ${step + 1} of ${questions.length}`}>
								{questions.map((question, index) => (
									<span key={question.title} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />
								))}
							</div>
							<div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
								{questions[step].options.map((option) => (
									<button key={option.id} type="button" onClick={option.onClick} className="min-h-12 rounded-xl bg-muted/60 px-3 py-2 text-sm font-semibold ring-1 ring-border/60 transition hover:bg-primary hover:text-primary-foreground hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
										{option.label}
									</button>
								))}
							</div>
							{step > 0 && (
								<button type="button" onClick={() => setStep((current) => current - 1)} className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
									<ArrowLeft className="h-4 w-4" /> Back
								</button>
							)}
						</>
					) : (
						<div className="mt-6 space-y-3">
							{recommendations.map(({ game, reasons }, index) => (
								<Link key={game.id} to={game.path} onClick={() => setOpen(false)} className={`group flex gap-3 rounded-xl p-3 ring-1 transition hover:ring-primary ${index === 0 ? "bg-primary/10 ring-primary/40" : "bg-muted/40 ring-border/60"}`}>
									<div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${game.color} text-white`}><span className="scale-[0.6]">{game.icon}</span></div>
									<div className="min-w-0">
										<p className="font-semibold">{index === 0 ? "Best match: " : "Also try: "}{game.title}</p>
										<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{reasons.slice(0, 3).join(" · ")}</p>
									</div>
								</Link>
							))}
								{recommendations.length === 0 && <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">No game fits all four choices. Try more time, another mood, or a different complexity.</p>}
							<button type="button" onClick={restart} className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
								<ArrowLeft className="h-4 w-4" /> Start over
							</button>
						</div>
					)}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function HomePage() {
	const [query, setQuery] = useState("");
	const [activeTags, setActiveTags] = useState<GameTag[]>([]);
	const [activeGenre, setActiveGenre] = useState<Genre | null>(null);

	const isFiltering =
		query.trim().length > 0 || activeTags.length > 0 || activeGenre !== null;

	const results = useMemo(() => {
		const trimmed = query.trim();
		return liveGames.filter(
			(game) =>
				matchesQuery(game, trimmed) &&
				(activeGenre === null || game.category === activeGenre) &&
				activeTags.every((tag) => game.tags.includes(tag)),
		);
	}, [query, activeTags, activeGenre]);

	// Only offer tags that still lead somewhere, so the bar can't strand the user.
	const reachableTags = useMemo(() => {
		const reachable = new Set<GameTag>();
		for (const game of results) {
			for (const tag of game.tags) reachable.add(tag);
		}
		return reachable;
	}, [results]);

	const sections = useMemo(
		() =>
			GENRES.map((genre) => ({
				...genre,
				games: results.filter((game) => game.category === genre.id),
			})).filter((section) => section.games.length > 0),
		[results],
	);

	const toggleTag = (tag: GameTag) => {
		setActiveTags((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	};

	const clearFilters = () => {
		setQuery("");
		setActiveTags([]);
		setActiveGenre(null);
	};

	return (
		<div className="min-h-[calc(100vh-73px)] bg-background">
			<div className="mx-auto max-w-5xl px-5 pb-20">
				{/* Hero + search */}
				<div className="pt-10 pb-6 md:pt-14">
					<h1 className="text-3xl font-bold tracking-tight md:text-4xl">
						What are we playing?
					</h1>
					<p className="mt-1.5 text-muted-foreground">
						{liveGames.length} games ready to go. Grab a code, share the link,
						start a round.
					</p>
					<div className="mt-5 flex flex-wrap gap-2.5">
						<RecommendationPicker />
						<Link to="/game-night" className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90">
							Start a Game Night
						</Link>
					</div>

					<div className="relative mt-6">
						<Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search games, vibes, player counts..."
							aria-label="Search games"
							className="h-11 w-full rounded-xl bg-muted/60 pl-10 pr-10 text-sm outline-none ring-1 ring-transparent transition-shadow placeholder:text-muted-foreground focus:bg-card focus:ring-border"
						/>
						{query && (
							<button
								type="button"
								onClick={() => setQuery("")}
								aria-label="Clear search"
								className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>

				{/* Filters: one scrollable row, genres then vibes */}
				<div className="sticky top-0 z-20 -mx-5 border-b border-border/60 bg-background/85 px-5 py-3 backdrop-blur">
					<div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<Pill
							label="All"
							active={!isFiltering}
							onClick={clearFilters}
						/>
						<span className="h-5 w-px shrink-0 bg-border" />
						{GENRES.map((genre) => (
							<Pill
								key={genre.id}
								label={genre.label}
								active={activeGenre === genre.id}
								onClick={() =>
									setActiveGenre((prev) => (prev === genre.id ? null : genre.id))
								}
							/>
						))}
						<span className="h-5 w-px shrink-0 bg-border" />
						{GAME_TAGS.filter(
							(tag) => reachableTags.has(tag.id) || activeTags.includes(tag.id),
						).map((tag) => (
							<Pill
								key={tag.id}
								label={tag.label}
								active={activeTags.includes(tag.id)}
								onClick={() => toggleTag(tag.id)}
							/>
						))}
					</div>
				</div>

				{/* Results */}
				<div className="pt-6">
					{results.length === 0 ? (
						<div className="py-24 text-center">
							<p className="font-medium">Nothing matches that.</p>
							<button
								type="button"
								onClick={clearFilters}
								className="mt-2 text-sm text-primary hover:underline"
							>
								Clear filters
							</button>
						</div>
					) : isFiltering ? (
						<>
							<p className="mb-4 text-sm text-muted-foreground">
								{results.length} {results.length === 1 ? "game" : "games"}
							</p>
							<GameCollection games={results} />
						</>
					) : (
						<div className="space-y-10">
							{sections.map((section) => (
								<section key={section.id}>
									<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
										{section.label}
									</h2>
									<GameCollection games={section.games} />
								</section>
							))}
						</div>
					)}
				</div>

				{/* Coming next */}
				{!isFiltering && (
					<section className="mt-14 border-t border-border/60 pt-8">
						<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
							Coming next
						</h2>
						<div className="flex flex-wrap gap-2">
							{plannedGames.map((game) => (
								<div
									key={game.id}
									className="flex items-center gap-2.5 rounded-lg bg-muted/40 py-2 pl-2 pr-4"
								>
									<div
										className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${game.color} text-white opacity-60`}
									>
										<span className="scale-[0.4]">{game.icon}</span>
									</div>
									<div>
										<p className="text-sm font-medium leading-tight">
											{game.title}
										</p>
										<p className="text-[11px] text-muted-foreground">
											{game.players}
										</p>
									</div>
								</div>
							))}
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
