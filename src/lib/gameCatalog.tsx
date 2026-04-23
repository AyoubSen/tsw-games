import {
	Brain,
	Grid2X2,
	Grid3X3,
	Keyboard,
	LetterText,
	Link2,
	Moon,
	Palette,
	Shuffle,
	Sparkles,
	Swords,
	TimerReset,
	Vote,
} from "lucide-react";
import type { ReactNode } from "react";

interface GameCatalogBaseEntry {
	id: string;
	title: string;
	description: string;
	icon: ReactNode;
	players: string;
	color: string;
	category: "word" | "arcade" | "party" | "strategy" | "social";
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
		id: "wordle",
		title: "Wordle",
		description:
			"Guess the 5-letter word in 6 tries. Green means correct, yellow means wrong position.",
		icon: <LetterText className="w-10 h-10" />,
		path: "/games/wordle",
		players: "1-8 players",
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
		players: "1 player",
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
		color: "from-cyan-500 to-amber-500",
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
		color: "from-slate-700 to-zinc-900",
		status: "live",
		category: "social",
		isNew: true,
	},
];

export const plannedGames: PlannedGameCatalogEntry[] = [
	{
		id: "trivia-quiz",
		title: "Trivia Quiz",
		description:
			"Timed category-based questions with points for both speed and correct answers.",
		icon: <Brain className="w-10 h-10" />,
		players: "2-12 players",
		color: "from-fuchsia-500 to-pink-600",
		status: "planned",
		category: "party",
	},
	{
		id: "reaction-game",
		title: "Reaction Game",
		description:
			"Wait for the signal and click first. Random delays keep every round tense.",
		icon: <TimerReset className="w-10 h-10" />,
		players: "2-10 players",
		color: "from-sky-500 to-cyan-500",
		status: "planned",
		category: "arcade",
	},
	{
		id: "quick-math",
		title: "Quick Math",
		description:
			"Rapid-fire arithmetic where the fastest correct answer steals the point.",
		icon: <Swords className="w-10 h-10" />,
		players: "1-8 players",
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
		color: "from-zinc-500 to-slate-600",
		status: "planned",
		category: "social",
	},
];
