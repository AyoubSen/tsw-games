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
): string | null {
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

	const permutations = (remaining: string[], prefix = ""): string | null => {
		if (remaining.length === 0) {
			return blockedWords.has(prefix.toLowerCase()) ? null : prefix.toUpperCase();
		}
		for (let index = 0; index < remaining.length; index += 1) {
			const result = permutations(
				remaining.filter((_, candidate) => candidate !== index),
				prefix + remaining[index],
			);
			if (result) return result;
		}
		return null;
	};

	return permutations(letters);
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
			const scrambled = shuffleUntilDifferent(
				sortedSolutions[0],
				new Set(sortedSolutions),
			);
			if (!scrambled) return null;

			return {
				signature,
				scrambled,
				solutions: sortedSolutions,
			};
		})
		.filter((puzzle): puzzle is WordScramblePuzzle => puzzle !== null)
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
		) ?? basePuzzle.scrambled,
	};
}

export function usesPuzzleLetters(word: string, letters: string): boolean {
	return getSignature(word.toLowerCase()) === getSignature(letters.toLowerCase());
}
