/** Arithmetic problems for Quick Math, shared by the solo sprint and the party server. */

export interface QuickMathProblem {
	text: string;
	answer: number;
	level: number;
}

export const QUICK_MATH_LEVELS = ["Warm-up", "Easy", "Medium", "Hard", "Brutal"] as const;
export const MAX_QUICK_MATH_LEVEL = QUICK_MATH_LEVELS.length - 1;

/** Multiplayer pacing: a "3, 2, 1" before the first question, then a beat to show each answer. */
export const QUICK_MATH_MS = { countdown: 3000, reveal: 2600 } as const;
export const QUICK_MATH_ROUND_OPTIONS = [10, 15, 20] as const;
export const QUICK_MATH_TIME_OPTIONS = [8, 12, 20] as const;

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(options: readonly T[]) => options[Math.floor(Math.random() * options.length)]!;

/** Every answer is a non-negative integer, so a numeric keypad is enough. */
function build(level: number): Omit<QuickMathProblem, "level"> {
	switch (level) {
		case 0: {
			const a = rand(2, 12);
			const b = rand(2, 9);
			return pick([true, false])
				? { text: `${a} + ${b}`, answer: a + b }
				: { text: `${Math.max(a, b)} − ${Math.min(a, b)}`, answer: Math.max(a, b) - Math.min(a, b) };
		}
		case 1: {
			const kind = pick(["+", "−", "×"]);
			if (kind === "+") {
				const a = rand(11, 49);
				const b = rand(5, 49);
				return { text: `${a} + ${b}`, answer: a + b };
			}
			if (kind === "−") {
				const a = rand(20, 99);
				const b = rand(5, a);
				return { text: `${a} − ${b}`, answer: a - b };
			}
			const a = rand(2, 9);
			const b = rand(2, 9);
			return { text: `${a} × ${b}`, answer: a * b };
		}
		case 2: {
			const kind = pick(["+", "−", "×", "÷"]);
			if (kind === "+") {
				const a = rand(25, 99);
				const b = rand(25, 99);
				return { text: `${a} + ${b}`, answer: a + b };
			}
			if (kind === "−") {
				const a = rand(60, 150);
				const b = rand(11, a - 10);
				return { text: `${a} − ${b}`, answer: a - b };
			}
			if (kind === "×") {
				const a = rand(3, 12);
				const b = rand(6, 12);
				return { text: `${a} × ${b}`, answer: a * b };
			}
			const divisor = rand(2, 12);
			const quotient = rand(2, 12);
			return { text: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
		}
		case 3: {
			const kind = pick(["×", "÷", "mix", "−"]);
			if (kind === "×") {
				const a = rand(12, 29);
				const b = rand(3, 9);
				return { text: `${a} × ${b}`, answer: a * b };
			}
			if (kind === "÷") {
				const divisor = rand(3, 12);
				const quotient = rand(6, 20);
				return { text: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
			}
			if (kind === "mix") {
				const a = rand(2, 30);
				const b = rand(2, 9);
				const c = rand(2, 9);
				return { text: `${a} + ${b} × ${c}`, answer: a + b * c };
			}
			const a = rand(100, 500);
			const b = rand(40, 99);
			return { text: `${a} − ${b}`, answer: a - b };
		}
		default: {
			const kind = pick(["×", "mix", "²", "÷"]);
			if (kind === "×") {
				const a = rand(11, 25);
				const b = rand(11, 19);
				return { text: `${a} × ${b}`, answer: a * b };
			}
			if (kind === "mix") {
				const a = rand(4, 12);
				const b = rand(4, 12);
				const c = rand(2, a * b);
				return { text: `${a} × ${b} − ${c}`, answer: a * b - c };
			}
			if (kind === "²") {
				const n = rand(11, 25);
				return { text: `${n}²`, answer: n * n };
			}
			const divisor = rand(6, 15);
			const quotient = rand(11, 25);
			return { text: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
		}
	}
}

/** A fresh problem at `level` (clamped), never the same text as `previous`. */
export function generateQuickMathProblem(level: number, previous?: string | null): QuickMathProblem {
	const clamped = Math.max(0, Math.min(MAX_QUICK_MATH_LEVEL, Math.floor(level)));
	let problem = build(clamped);
	for (let tries = 0; tries < 5 && problem.text === previous; tries++) problem = build(clamped);
	return { ...problem, level: clamped };
}

/** Multiplayer ramp: the match climbs from Warm-up to Brutal across its rounds. */
export function levelForRound(roundNumber: number, rounds: number): number {
	return Math.min(MAX_QUICK_MATH_LEVEL, Math.floor(((roundNumber - 1) * QUICK_MATH_LEVELS.length) / Math.max(1, rounds)));
}

/** Solo ramp: a level up every five correct answers. */
export function levelForSolved(solved: number): number {
	return Math.min(MAX_QUICK_MATH_LEVEL, Math.floor(solved / 5));
}

export function parseQuickMathAnswer(input: unknown): number | null {
	if (typeof input !== "string" && typeof input !== "number") return null;
	const text = String(input).trim();
	return /^\d{1,6}$/.test(text) ? Number(text) : null;
}
