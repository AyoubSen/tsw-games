import { Link, useRouterState } from "@tanstack/react-router";
import {
	Clock3,
	Gamepad2,
	Home,
	Layers,
	LayoutGrid,
	Menu,
	Moon,
	Settings,
	Sun,
	X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { liveGames, plannedGames } from "@/lib/gameCatalog";
import { useSettings } from "@/lib/useTheme";

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);
	const { theme, layout, setTheme, setLayout, mounted } = useSettings();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	const categoryCounts = liveGames.reduce(
		(counts, game) => {
			counts[game.category] += 1;
			return counts;
		},
		{
			arcade: 0,
			party: 0,
			social: 0,
			strategy: 0,
			word: 0,
		},
	);

	const categorySummary = [
		`${categoryCounts.word} word`,
		`${categoryCounts.party + categoryCounts.social} party`,
		`${categoryCounts.strategy} strategy`,
	].join(" • ");

	return (
		<>
			<header className="p-4 flex items-center justify-between bg-card border-b border-border">
				<div className="flex items-center">
					<button
						type="button"
						onClick={() => setIsOpen(true)}
						className="p-2 hover:bg-accent rounded-lg transition-colors"
						aria-label="Open menu"
					>
						<Menu size={24} />
					</button>
					<Link to="/" className="ml-4 flex items-center gap-2">
						<Gamepad2 className="w-8 h-8 text-primary" />
						<span className="text-xl font-bold">TSW Games</span>
					</Link>
				</div>

				<div className="flex items-center gap-2">
					{mounted && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
							aria-label="Toggle theme"
						>
							{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
						</Button>
					)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="Settings">
								<Settings size={20} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuLabel>Theme</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setTheme("light")}>
								<Sun className="mr-2 h-4 w-4" />
								Light
								{theme === "light" && <span className="ml-auto">✓</span>}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setTheme("dark")}>
								<Moon className="mr-2 h-4 w-4" />
								Dark
								{theme === "dark" && <span className="ml-auto">✓</span>}
							</DropdownMenuItem>

							<DropdownMenuSeparator />

							<DropdownMenuLabel>Home Layout</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => setLayout("cards")}>
								<Layers className="mr-2 h-4 w-4" />
								Cards
								{layout === "cards" && <span className="ml-auto">✓</span>}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setLayout("grid")}>
								<LayoutGrid className="mr-2 h-4 w-4" />
								Compact Grid
								{layout === "grid" && <span className="ml-auto">✓</span>}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			{isOpen && (
				<button
					type="button"
					className="fixed inset-0 z-40 bg-black/50"
					onClick={() => setIsOpen(false)}
					aria-label="Close menu overlay"
				/>
			)}

			<aside
				className={`fixed top-0 left-0 h-full w-72 bg-card border-r border-border z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
					isOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between p-4 border-b border-border">
					<div className="flex items-center gap-2">
						<Gamepad2 className="w-6 h-6 text-primary" />
						<span className="text-lg font-bold">TSW Games</span>
					</div>
					<button
						type="button"
						onClick={() => setIsOpen(false)}
						className="p-2 hover:bg-accent rounded-lg transition-colors"
						aria-label="Close menu"
					>
						<X size={24} />
					</button>
				</div>

				<nav className="flex-1 p-4 overflow-y-auto">
					<Link
						to="/"
						onClick={() => setIsOpen(false)}
						className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-2"
						activeProps={{
							className:
								"flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2",
						}}
						activeOptions={{ exact: true }}
					>
						<Home size={20} />
						<span className="font-medium">Home</span>
					</Link>

					<div className="mt-4 mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
						Library
					</div>

					<div className="mx-3 mb-4 rounded-2xl border border-border/70 bg-accent/40 p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold">Game Night Launcher</p>
								<p className="text-xs text-muted-foreground">
									{liveGames.length} live now
								</p>
							</div>
							<div className="rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary">
								{plannedGames.length} next
							</div>
						</div>
						<p className="mt-3 text-xs leading-5 text-muted-foreground">
							{categorySummary}
						</p>
					</div>

					<div className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
						Play Now
					</div>

					{liveGames.map((game) => (
						<Link
							key={game.id}
							to={game.path}
							onClick={() => setIsOpen(false)}
							className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors mb-1"
							activeProps={{
								className:
									"flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-1",
							}}
						>
							<span
								className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${game.color}`}
							>
								<span className="scale-75">{game.icon}</span>
							</span>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate font-medium">{game.title}</span>
									{game.isNew && (
										<span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
											New
										</span>
									)}
								</div>
								<p className="truncate text-xs opacity-70">{game.players}</p>
							</div>
						</Link>
					))}

					<div className="mt-5 mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
						Coming Next
					</div>

					<div className="space-y-2 px-1">
						{plannedGames.slice(0, 4).map((game) => (
							<div
								key={game.id}
								className="flex items-start gap-3 rounded-xl border border-dashed border-border/80 px-3 py-3"
							>
								<span
									className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${game.color}`}
								>
									<span className="scale-75">{game.icon}</span>
								</span>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-sm font-medium">{game.title}</span>
										<Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
									</div>
									<p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
										{game.description}
									</p>
								</div>
							</div>
						))}
					</div>

					{pathname === "/" && (
						<div className="mx-3 mt-5 rounded-2xl bg-primary px-4 py-4 text-primary-foreground">
							<p className="text-sm font-semibold">Browse All Games</p>
							<p className="mt-1 text-xs text-primary-foreground/80">
								The homepage now pulls from the same catalog, so new games only
								need to be added once.
							</p>
						</div>
					)}
				</nav>

				<div className="p-4 border-t border-border text-center text-sm text-muted-foreground">
					Made for TSW crew
				</div>
			</aside>
		</>
	);
}
