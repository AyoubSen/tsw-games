export type PressurePromptPack =
	| "mixed"
	| "awkward"
	| "exposed"
	| "panic"
	| "dating"
	| "chaos";

export interface PressurePrompt {
	id: string;
	text: string;
	pack: PressurePromptPack;
}

interface PressurePromptContext {
	activePlayerName?: string | null;
	playerNames?: string[];
}

type PromptTemplate = {
	pack: Exclude<PressurePromptPack, "mixed">;
	template: string;
	variables?: Record<string, string[]>;
};

const PROMPT_TEMPLATES: PromptTemplate[] = [
	{
		pack: "awkward",
		template:
			"Who in this room would you trust least with your phone for 10 minutes?",
	},
	{
		pack: "awkward",
		template:
			"What's the meanest first impression you've had of someone in this room?",
	},
	{
		pack: "awkward",
		template:
			"What is one thing about yourself you'd hate for someone here to bring up right now?",
	},
	{
		pack: "awkward",
		template: "Who here would expose your secrets by accident first?",
	},
	{
		pack: "exposed",
		template:
			"Which person here would you least want reading your recent messages?",
	},
	{
		pack: "exposed",
		template:
			"What's one thing on your phone you would absolutely not show this room?",
	},
	{
		pack: "exposed",
		template:
			"Who's the worst possible person here to get drunk-texted by you?",
	},
	{
		pack: "exposed",
		template:
			"What's a lie you've told recently that sounds terrible without context?",
	},
	{
		pack: "panic",
		template: "What is a terrible answer to the question: {question}",
		variables: {
			question: [
				"Why were you awake at 4 AM?",
				"Who's that texting you?",
				"What did you delete?",
				"Why did you suddenly leave?",
				"Can I trust you with this?",
				"What was your first impression of me?",
			],
		},
	},
	{
		pack: "panic",
		template:
			"What's the worst thing your ex could say about you that might be a little true?",
	},
	{
		pack: "panic",
		template:
			"What's a question you pray nobody in this room asks you tonight?",
	},
	{
		pack: "panic",
		template:
			"If your last 5 searches were read out loud right now, which one would be the worst?",
	},
	{
		pack: "dating",
		template:
			"What's the pettiest reason you've ever lost interest in someone?",
	},
	{
		pack: "dating",
		template:
			"What's a red flag you fully ignore when someone's attractive enough?",
	},
	{
		pack: "dating",
		template:
			"What's a dating habit of yours that sounds bad the second you say it out loud?",
	},
	{
		pack: "dating",
		template: "Who here gives the most dangerous relationship advice?",
	},
	{
		pack: "chaos",
		template:
			"Which person here would survive being exposed in the group chat the least?",
	},
	{
		pack: "chaos",
		template: "What's the worst thought to say out loud on a first date?",
	},
	{
		pack: "chaos",
		template:
			"What would be the most humiliating reason to get kicked out of {place}?",
		variables: {
			place: [
				"a wedding",
				"the airport",
				"your ex's birthday",
				"the office",
				"a family dinner",
				"a first date",
			],
		},
	},
	{
		pack: "chaos",
		template:
			"Who here would be the worst person to get stuck with on a bad trip?",
	},
];

function replaceAll(
	text: string,
	replacements: Record<string, string>,
): string {
	let next = text;
	for (const [key, value] of Object.entries(replacements)) {
		next = next.replaceAll(`{${key}}`, value);
	}
	return next;
}

function pickRandomValue<T>(values: T[]): T {
	return values[Math.floor(Math.random() * values.length)];
}

function normalizePlayerNames(context?: PressurePromptContext): string[] {
	return (context?.playerNames ?? [])
		.map((name) => name.trim())
		.filter(Boolean);
}

function buildPromptFromTemplate(
	template: PromptTemplate,
	context?: PressurePromptContext,
): PressurePrompt {
	const replacements: Record<string, string> = {};

	for (const [key, values] of Object.entries(template.variables ?? {})) {
		replacements[key] = pickRandomValue(values);
	}

	const playerNames = normalizePlayerNames(context);
	if (playerNames.length > 0) {
		replacements.activePlayer =
			context?.activePlayerName?.trim() || playerNames[0];
		replacements.otherPlayer = pickRandomValue(playerNames);
	}

	const text = replaceAll(template.template, replacements);
	const idParts = [
		template.pack,
		template.template,
		...Object.values(replacements),
	];

	return {
		id: idParts.join(":"),
		text,
		pack: template.pack,
	};
}

export function getPressurePromptPool(
	pack: PressurePromptPack,
	context?: PressurePromptContext,
): PressurePrompt[] {
	const prompts = PROMPT_TEMPLATES.map((template) =>
		buildPromptFromTemplate(template, context),
	);

	if (pack === "mixed") {
		return prompts;
	}

	return prompts.filter((prompt) => prompt.pack === pack);
}

export function pickPressurePrompt(
	pack: PressurePromptPack,
	usedPromptIds: string[] = [],
	context?: PressurePromptContext,
): PressurePrompt {
	const pool = getPressurePromptPool(pack, context);
	const freshPool = pool.filter((prompt) => !usedPromptIds.includes(prompt.id));
	const candidates = freshPool.length > 0 ? freshPool : pool;

	return pickRandomValue(candidates);
}
