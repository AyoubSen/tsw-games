import {
	Binary,
	Brain,
	Flag,
	Grid2X2,
	Grid3X3,
	History,
	Keyboard,
	LetterText,
	Link2,
	Moon,
	Palette,
	Shuffle,
	Sparkles,
	Swords,
	Vote,
	Zap,
} from "lucide-react";
import type { ReactNode } from "react";

export const GAME_TAGS = [
	{ id: "solo", label: "Single Player" },
	{ id: "multiplayer", label: "Multiplayer" },
	{ id: "casual", label: "Casual" },
	{ id: "chill", label: "Chill" },
	{ id: "fun", label: "Fun" },
	{ id: "hot", label: "Hot" },
	{ id: "drinking", label: "Drinking" },
	{ id: "brainy", label: "Brainy" },
	{ id: "quick", label: "Quick" },
	{ id: "competitive", label: "Competitive" },
	{ id: "creative", label: "Creative" },
	{ id: "deduction", label: "Deduction" },
] as const;

export type GameTag = (typeof GAME_TAGS)[number]["id"];

export const GAME_TAG_LABELS: Record<GameTag, string> = Object.fromEntries(
	GAME_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<GameTag, string>;

interface GameCatalogBaseEntry {
	id: string;
	title: string;
	description: string;
	icon: ReactNode;
	players: string;
	minPlayers: number;
	maxPlayers: number;
	color: string;
	category: "word" | "arcade" | "party" | "strategy" | "social";
	tags: GameTag[];
	isNew?: boolean;
}

export interface LiveGameCatalogEntry extends GameCatalogBaseEntry {
	path: string;
	status: "live";
}

export interface PlannedGameCatalogEntry extends GameCatalogBaseEntry {
	status: "planned";
}

export type GameCatalogEntry = LiveGameCatalogEntry | PlannedGameCatalogEntry;

export const liveGames: LiveGameCatalogEntry[] = [
	{
		id: "timeline-chaos",
		title: "Timeline Chaos",
		description:
			"Put four events in order from oldest to newest, solo or against friends before time runs out.",
		icon: <History className="w-10 h-10" />,
		path: "/games/timeline-chaos",
		players: "1-12 players",
		minPlayers: 1,
		maxPlayers: 12,
		tags: ["solo", "multiplayer", "brainy", "quick", "competitive"],
		color: "from-amber-500 to-rose-600",
		status: "live",
		category: "strategy",
		isNew: true,
	},
	{
		id: "trivia-quiz",
		title: "Trivia Quiz",
		description:
			"Race through generated world, science, history, and culture questions solo or live with friends.",
		icon: <Brain className="w-10 h-10" />,
		path: "/games/trivia-quiz",
		players: "1-12 players",
		minPlayers: 1,
		maxPlayers: 12,
		tags: ["solo", "multiplayer", "casual", "brainy", "quick", "competitive"],
		color: "from-fuchsia-500 to-pink-600",
		status: "live",
		category: "party",
		isNew: true,
	},
	{
		id: "memory-match",
		title: "Memory Match",
		description:
			"Find eight hidden pairs solo or race friends on private copies of the same board.",
		icon: <Grid2X2 className="w-10 h-10" />,
		path: "/games/memory-match",
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "casual", "brainy", "competitive"],
		color: "from-cyan-500 to-violet-600",
		status: "live",
		category: "strategy",
		isNew: true,
	},
	{
		id: "code-breaker",
		title: "Code Breaker",
		description:
			"Crack a hidden color sequence through pure deduction, solo or in a private-board race.",
		icon: <Binary className="w-10 h-10" />,
		path: "/games/code-breaker",
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "brainy", "competitive", "deduction"],
		color: "from-violet-500 to-fuchsia-600",
		status: "live",
		category: "strategy",
		isNew: true,
	},
	{
		id: "guess-the-country",
		title: "Guess the Country",
		description:
			"Name flags from 195 countries solo, against the clock, or live with friends.",
		icon: <Flag className="w-10 h-10" />,
		path: "/games/guess-the-country",
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "casual", "brainy", "quick", "competitive"],
		color: "from-sky-500 to-indigo-600",
		status: "live",
		category: "party",
		isNew: true,
	},
	{
		id: "wordle",
		title: "Wordle",
		description:
			"Guess the 5-letter word in 6 tries. Green means correct, yellow means wrong position.",
		icon: <LetterText className="w-10 h-10" />,
		path: "/games/wordle",
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "casual", "chill", "brainy", "quick"],
		color: "from-emerald-500 to-green-600",
		status: "live",
		category: "word",
	},
	{
		id: "typerace",
		title: "Type Race",
		description:
			"Race to type the phrase fastest. Test your speed and accuracy solo or with friends.",
		icon: <Keyboard className="w-10 h-10" />,
		path: "/games/typerace",
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "casual", "quick", "competitive"],
		color: "from-blue-500 to-cyan-600",
		status: "live",
		category: "arcade",
	},
	{
		id: "drawing",
		title: "Drawing",
		description:
			"Draw and guess. One player sketches while everyone else tries to beat the clock.",
		icon: <Palette className="w-10 h-10" />,
		path: "/games/drawing",
		players: "2-8 players",
		minPlayers: 2,
		maxPlayers: 8,
		tags: ["multiplayer", "fun", "casual", "creative"],
		color: "from-purple-500 to-pink-600",
		status: "live",
		category: "party",
	},
	{
		id: "word-scramble",
		title: "Word Scramble",
		description:
			"Unscramble a shared set of letters and find every common anagram hiding inside.",
		icon: <Shuffle className="w-10 h-10" />,
		path: "/games/word-scramble",
		players: "2-8 players",
		minPlayers: 2,
		maxPlayers: 8,
		tags: ["multiplayer", "casual", "brainy", "quick"],
		color: "from-yellow-500 to-orange-500",
		status: "live",
		category: "word",
		isNew: true,
	},
	{
		id: "sync-up",
		title: "Sync Up",
		description:
			"Answer secret social prompts and score when your answer matches the group.",
		icon: <Sparkles className="w-10 h-10" />,
		path: "/games/sync-up",
		players: "2-12 players",
		minPlayers: 2,
		maxPlayers: 12,
		tags: ["multiplayer", "fun", "casual", "chill"],
		color: "from-cyan-500 to-amber-500",
		status: "live",
		category: "social",
		isNew: true,
	},
	{
		id: "hot-take-arena",
		title: "Hot Take Arena",
		description:
			"Pick a side on a spicy opinion, reveal the room, and score when people land with you.",
		icon: <Vote className="w-10 h-10" />,
		path: "/games/hot-take-arena",
		players: "2-12 players",
		minPlayers: 2,
		maxPlayers: 12,
		tags: ["multiplayer", "hot", "fun", "drinking"],
		color: "from-rose-500 to-orange-500",
		status: "live",
		category: "social",
		isNew: true,
	},
	{
		id: "pressure-button",
		title: "Pressure Button",
		description:
			"Take the prompt yourself, pass, or pressure someone else into answering before time runs out.",
		icon: <Zap className="w-10 h-10" />,
		path: "/games/pressure-button",
		players: "2-10 players",
		minPlayers: 2,
		maxPlayers: 10,
		tags: ["multiplayer", "hot", "fun", "drinking", "quick"],
		color: "from-red-500 to-orange-600",
		status: "live",
		category: "social",
		isNew: true,
	},
	{
		id: "wordchain",
		title: "Word Chain",
		description:
			"Chain English words together by matching the last letter to the next first letter.",
		icon: <Link2 className="w-10 h-10" />,
		path: "/games/wordchain",
		players: "2-8 players",
		minPlayers: 2,
		maxPlayers: 8,
		tags: ["multiplayer", "casual", "brainy", "quick"],
		color: "from-orange-500 to-amber-600",
		status: "live",
		category: "word",
	},
	{
		id: "codenames",
		title: "Codenames",
		description:
			"Give one-word clues and help your team uncover every secret agent before the other side does.",
		icon: <Grid3X3 className="w-10 h-10" />,
		path: "/games/codenames",
		players: "4-8 players",
		minPlayers: 4,
		maxPlayers: 8,
		tags: ["multiplayer", "brainy", "competitive", "deduction"],
		color: "from-rose-500 to-red-600",
		status: "live",
		category: "strategy",
	},
	{
		id: "sudoku",
		title: "Sudoku",
		description:
			"Classic number puzzle. Fill the grid so every row, column, and box has 1-9.",
		icon: <Grid2X2 className="w-10 h-10" />,
		path: "/games/sudoku",
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "chill", "brainy"],
		color: "from-indigo-500 to-violet-600",
		status: "live",
		category: "strategy",
		isNew: true,
	},
	{
		id: "poker",
		title: "Texas Hold'em",
		description:
			"Play poker with friends. Bet, bluff, and push your stack to the middle at the right time.",
		icon: <span className="text-3xl">♠</span>,
		path: "/games/poker",
		players: "2-8 players",
		minPlayers: 2,
		maxPlayers: 8,
		tags: ["multiplayer", "competitive", "brainy", "drinking"],
		color: "from-emerald-600 to-teal-700",
		status: "live",
		category: "strategy",
		isNew: true,
	},
	{
		id: "mafia",
		title: "Mafia",
		description:
			"Social deduction with hidden roles, day-night turns, accusations, and betrayals.",
		icon: <Moon className="w-10 h-10" />,
		path: "/games/mafia",
		players: "5-12 players",
		minPlayers: 5,
		maxPlayers: 12,
		tags: ["multiplayer", "deduction", "fun", "competitive"],
		color: "from-slate-700 to-zinc-900",
		status: "live",
		category: "social",
		isNew: true,
	},
];

export const plannedGames: PlannedGameCatalogEntry[] = [
	{
		id: "quick-math",
		title: "Quick Math",
		description:
			"Rapid-fire arithmetic where the fastest correct answer steals the point.",
		icon: <Swords className="w-10 h-10" />,
		players: "1-8 players",
		minPlayers: 1,
		maxPlayers: 8,
		tags: ["solo", "multiplayer", "brainy", "quick"],
		color: "from-lime-500 to-green-500",
		status: "planned",
		category: "arcade",
	},
	{
		id: "would-you-rather",
		title: "Would You Rather",
		description:
			"Vote on impossible choices and immediately see who matched the group.",
		icon: <Vote className="w-10 h-10" />,
		players: "3-20 players",
		minPlayers: 3,
		maxPlayers: 20,
		tags: ["multiplayer", "fun", "hot", "drinking", "chill"],
		color: "from-zinc-500 to-slate-600",
		status: "planned",
		category: "social",
	},
];
