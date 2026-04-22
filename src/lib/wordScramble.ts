export interface WordScramblePuzzle {
	signature: string;
	scrambled: string;
	solutions: string[];
}

function getSignature(word: string): string {
	return [...word].sort().join("");
}

function shuffleUntilDifferent(
	source: string,
	blockedWords: Set<string>,
): string {
	const letters = [...source];

	for (let attempt = 0; attempt < 12; attempt += 1) {
		const shuffled = [...letters]
			.sort(() => Math.random() - 0.5)
			.join("")
			.toUpperCase();

		if (!blockedWords.has(shuffled.toLowerCase())) {
			return shuffled;
		}
	}

	return [...letters].reverse().join("").toUpperCase();
}

export function buildWordScramblePuzzles(
	words: string[],
): WordScramblePuzzle[] {
	const grouped = new Map<string, Set<string>>();

	for (const word of words) {
		if (word.length !== 5 || !/^[a-z]+$/.test(word)) {
			continue;
		}

		const signature = getSignature(word);
		const existing = grouped.get(signature) ?? new Set<string>();
		existing.add(word.toLowerCase());
		grouped.set(signature, existing);
	}

	return [...grouped.entries()]
		.map(([signature, solutions]) => {
			const sortedSolutions = [...solutions].sort();

			return {
				signature,
				scrambled: shuffleUntilDifferent(
					sortedSolutions[0],
					new Set(sortedSolutions),
				),
				solutions: sortedSolutions,
			};
		})
		.filter(
			(puzzle) => puzzle.solutions.length >= 2 && puzzle.solutions.length <= 5,
		)
		.sort((left, right) => left.solutions.length - right.solutions.length);
}

export function pickNextWordScramblePuzzle(
	puzzles: WordScramblePuzzle[],
	previousSignature?: string | null,
): WordScramblePuzzle | null {
	if (puzzles.length === 0) {
		return null;
	}

	const eligiblePuzzles =
		puzzles.length > 1
			? puzzles.filter((puzzle) => puzzle.signature !== previousSignature)
			: puzzles;

	const basePuzzle =
		eligiblePuzzles[Math.floor(Math.random() * eligiblePuzzles.length)] ??
		puzzles[0];

	return {
		...basePuzzle,
		scrambled: shuffleUntilDifferent(
			basePuzzle.solutions[0],
			new Set(basePuzzle.solutions),
		),
	};
}

export function usesPuzzleLetters(word: string, signature: string): boolean {
	return getSignature(word.toLowerCase()) === signature;
}
