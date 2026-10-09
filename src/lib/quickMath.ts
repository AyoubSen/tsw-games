/** Arithmetic problems for Quick Math, shared by the solo sprint and the party server. */

/**
 * - `solve`: type the result. `missing`: type the hidden number.
 * - `compare`: pick < or > between two expressions. `operator`: pick + − × ÷.
 * - `estimate`: pick the closest of four rounded values.
 */
export type QuickMathKind = "solve" | "missing" | "compare" | "operator" | "estimate";

export interface QuickMathProblem {
	kind: QuickMathKind;
	/** One instruction line, e.g. "Pick the operator". */
	prompt: string;
	/** The expression with exactly one "?" where the answer goes. */
	text: string;
	/** Choices for compare/operator/estimate; null when the answer is typed. */
	options: string[] | null;
	/** The typed value, or the index of the right option. */
	answer: number;
	/** Shown once the answer is revealed, e.g. "102 vs 104". */
	note: string | null;
	level: number;
}

export const QUICK_MATH_LEVELS = ["Warm-up", "Easy", "Medium", "Hard", "Brutal"] as const;
export const MAX_QUICK_MATH_LEVEL = QUICK_MATH_LEVELS.length - 1;

/** Multiplayer pacing: a "3, 2, 1" before the first question, then a beat to show everyone's answers. */
export const QUICK_MATH_MS = { countdown: 3000, reveal: 3400 } as const;
export const QUICK_MATH_ROUND_OPTIONS = [10, 15, 20] as const;
export const QUICK_MATH_TIME_OPTIONS = [8, 12, 20] as const;
/** Points for the fastest, second fastest and every later correct answer; the final question doubles them. */
export const QUICK_MATH_POINTS = [3, 2, 1] as const;

export const quickMathPoints = (rank: number, double: boolean) =>
	(QUICK_MATH_POINTS[Math.min(rank, QUICK_MATH_POINTS.length - 1)] ?? 1) * (double ? 2 : 1);

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(options: readonly T[]) => options[Math.floor(Math.random() * options.length)]!;
const format = (n: number) => n.toLocaleString("en-US");

interface Expression {
	text: string;
	value: number;
}

/** An expression whose value is a non-negative integer, harder at each level. */
function expression(level: number): Expression {
	switch (level) {
		case 0: {
			const a = rand(2, 12);
			const b = rand(2, 9);
			return pick([true, false])
				? { text: `${a} + ${b}`, value: a + b }
				: { text: `${Math.max(a, b)} − ${Math.min(a, b)}`, value: Math.max(a, b) - Math.min(a, b) };
		}
		case 1: {
			const kind = pick(["+", "−", "×"]);
			if (kind === "+") {
				const a = rand(11, 49);
				const b = rand(5, 49);
				return { text: `${a} + ${b}`, value: a + b };
			}
			if (kind === "−") {
				const a = rand(20, 99);
				const b = rand(5, a);
				return { text: `${a} − ${b}`, value: a - b };
			}
			const a = rand(2, 9);
			const b = rand(2, 9);
			return { text: `${a} × ${b}`, value: a * b };
		}
		case 2: {
			const kind = pick(["+", "−", "×", "÷"]);
			if (kind === "+") {
				const a = rand(25, 99);
				const b = rand(25, 99);
				return { text: `${a} + ${b}`, value: a + b };
			}
			if (kind === "−") {
				const a = rand(60, 150);
				const b = rand(11, a - 10);
				return { text: `${a} − ${b}`, value: a - b };
			}
			if (kind === "×") {
				const a = rand(3, 12);
				const b = rand(6, 12);
				return { text: `${a} × ${b}`, value: a * b };
			}
			const divisor = rand(2, 12);
			const quotient = rand(2, 12);
			return { text: `${divisor * quotient} ÷ ${divisor}`, value: quotient };
		}
		case 3: {
			const kind = pick(["×", "÷", "mix", "−"]);
			if (kind === "×") {
				const a = rand(12, 29);
				const b = rand(3, 9);
				return { text: `${a} × ${b}`, value: a * b };
			}
			if (kind === "÷") {
				const divisor = rand(3, 12);
				const quotient = rand(6, 20);
				return { text: `${divisor * quotient} ÷ ${divisor}`, value: quotient };
			}
			if (kind === "mix") {
				const a = rand(2, 30);
				const b = rand(2, 9);
				const c = rand(2, 9);
				return { text: `${a} + ${b} × ${c}`, value: a + b * c };
			}
			const a = rand(100, 500);
			const b = rand(40, 99);
			return { text: `${a} − ${b}`, value: a - b };
		}
		default: {
			const kind = pick(["×", "mix", "²", "÷"]);
			if (kind === "×") {
				const a = rand(11, 25);
				const b = rand(11, 19);
				return { text: `${a} × ${b}`, value: a * b };
			}
			if (kind === "mix") {
				const a = rand(4, 12);
				const b = rand(4, 12);
				const c = rand(2, a * b);
				return { text: `${a} × ${b} − ${c}`, value: a * b - c };
			}
			if (kind === "²") {
				const n = rand(11, 25);
				return { text: `${n}²`, value: n * n };
			}
			const divisor = rand(6, 15);
			const quotient = rand(11, 25);
			return { text: `${divisor * quotient} ÷ ${divisor}`, value: quotient };
		}
	}
}

type Problem = Omit<QuickMathProblem, "level">;

function solve(level: number): Problem {
	const { text, value } = expression(level);
	return { kind: "solve", prompt: "Solve it", text: `${text} = ?`, options: null, answer: value, note: null };
}

/** Number ranges per level for missing-number and operator problems: [addend max, factor max]. */
const RANGES = [[12, 5], [49, 9], [99, 12], [250, 15], [500, 20]] as const;

function missing(level: number): Problem {
	const [addMax, factorMax] = RANGES[level]!;
	const op = pick(level === 0 ? ["+", "−"] : ["+", "−", "×", "÷"]);
	const left = pick([true, false]);
	const build = (a: number, b: number, c: number, symbol: string): Problem => ({
		kind: "missing",
		prompt: "Find the missing number",
		text: left ? `? ${symbol} ${b} = ${c}` : `${a} ${symbol} ? = ${c}`,
		options: null,
		answer: left ? a : b,
		note: null,
	});
	if (op === "+") {
		const a = rand(2, addMax);
		const b = rand(2, addMax);
		return build(a, b, a + b, "+");
	}
	if (op === "−") {
		const a = rand(5, addMax + 10);
		const b = rand(1, a - 1);
		return build(a, b, a - b, "−");
	}
	if (op === "×") {
		const a = rand(2, factorMax);
		const b = rand(2, factorMax);
		return build(a, b, a * b, "×");
	}
	const b = rand(2, factorMax);
	const quotient = rand(2, factorMax);
	return build(b * quotient, b, quotient, "÷");
}

function compare(level: number): Problem {
	const left = expression(level);
	let right: Expression | null = null;
	for (let tries = 0; tries < 40 && !right; tries++) {
		const candidate = expression(level);
		const gap = Math.abs(candidate.value - left.value);
		if (gap > 0 && gap <= Math.max(4, Math.max(candidate.value, left.value) * 0.12)) right = candidate;
	}
	if (!right) {
		const value = left.value + (left.value > 4 ? pick([-1, 1]) : 1) * rand(1, 4);
		right = { text: String(value), value };
	}
	return {
		kind: "compare",
		prompt: "Which side is bigger?",
		text: `${left.text} ? ${right.text}`,
		options: ["<", ">"],
		answer: left.value < right.value ? 0 : 1,
		note: `${format(left.value)} vs ${format(right.value)}`,
	};
}

const OPERATORS = ["+", "−", "×", "÷"] as const;

function operator(level: number): Problem {
	const [addMax, factorMax] = RANGES[level]!;
	for (let tries = 0; tries < 40; tries++) {
		const index = rand(0, 3);
		const b = index < 2 ? rand(2, addMax) : rand(2, factorMax);
		const a = index < 2 ? rand(b + 1, addMax + b) : index === 3 ? b * rand(2, factorMax) : rand(2, factorMax);
		const results = [a + b, a - b, a * b, a % b === 0 ? a / b : null];
		const target = results[index]!;
		// Only one operator may give the result, so 2 ? 2 = 4 never shows up.
		if (results.filter((result) => result === target).length > 1) continue;
		return {
			kind: "operator",
			prompt: "Pick the operator",
			text: `${a} ? ${b} = ${target}`,
			options: [...OPERATORS],
			answer: index,
			note: null,
		};
	}
	return solve(level);
}

/** Two significant figures, e.g. 11,201 → 11,000. */
const roughly = (n: number) => {
	const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1);
	return Math.round(n / step) * step;
};

function estimate(level: number): Problem {
	const big = level >= 4;
	const a = rand(big ? 210 : 110, big ? 980 : 490);
	const b = rand(big ? 23 : 12, big ? 89 : 39);
	const exact = a * b;
	const right = roughly(exact);
	const options = new Set([right]);
	for (const factor of [0.55, 0.7, 1.35, 1.6, 1.9, 2.4].sort(() => Math.random() - 0.5)) {
		if (options.size === 4) break;
		options.add(roughly(right * factor));
	}
	const values = [...options].sort((x, y) => x - y);
	return {
		kind: "estimate",
		prompt: "Closest estimate",
		text: `${a} × ${b} ≈ ?`,
		options: values.map(format),
		answer: values.indexOf(right),
		note: `exactly ${format(exact)}`,
	};
}

const BUILDERS: Record<QuickMathKind, (level: number) => Problem> = { solve, missing, compare, operator, estimate };

/** How often each kind shows up per level; estimates start at Medium. */
const WEIGHTS: Record<QuickMathKind, number>[] = [
	{ solve: 70, missing: 15, compare: 15, operator: 0, estimate: 0 },
	{ solve: 50, missing: 20, compare: 15, operator: 15, estimate: 0 },
	{ solve: 40, missing: 15, compare: 15, operator: 15, estimate: 15 },
];

function pickKind(level: number): QuickMathKind {
	const weights = WEIGHTS[Math.min(level, WEIGHTS.length - 1)]!;
	let roll = Math.random() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
	for (const [kind, weight] of Object.entries(weights) as [QuickMathKind, number][]) {
		roll -= weight;
		if (roll < 0) return kind;
	}
	return "solve";
}

/** A fresh problem at `level` (clamped), never the same text as `previous`. */
export function generateQuickMathProblem(level: number, previous?: string | null): QuickMathProblem {
	const clamped = Math.max(0, Math.min(MAX_QUICK_MATH_LEVEL, Math.floor(level)));
	const kind = pickKind(clamped);
	let problem = BUILDERS[kind](clamped);
	for (let tries = 0; tries < 5 && problem.text === previous; tries++) problem = BUILDERS[kind](clamped);
	return { ...problem, level: clamped };
}

/** What fills the "?" for this answer: the number, or the chosen option. */
export function quickMathFill(options: readonly string[] | null, answer: number): string {
	return options ? (options[answer] ?? "?") : format(answer);
}

/** Splits the expression around its "?", for rendering the blank. */
export function splitQuickMath(text: string): [string, string] {
	const at = text.indexOf("?");
	return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
}

/** Multiplayer ramp: the match climbs from Warm-up to Brutal across its rounds. */
export function levelForRound(roundNumber: number, rounds: number): number {
	return Math.min(MAX_QUICK_MATH_LEVEL, Math.floor(((roundNumber - 1) * QUICK_MATH_LEVELS.length) / Math.max(1, rounds)));
}

/** Solo ramp: a level up every five correct answers. */
export function levelForSolved(solved: number): number {
	return Math.min(MAX_QUICK_MATH_LEVEL, Math.floor(solved / 5));
}

/** A whole number for typed problems, or an option index for choice problems. */
export function parseQuickMathAnswer(input: unknown, options: readonly string[] | null = null): number | null {
	if (typeof input !== "string" && typeof input !== "number") return null;
	const text = String(input).trim();
	if (!/^\d{1,6}$/.test(text)) return null;
	const value = Number(text);
	return options && value >= options.length ? null : value;
}
