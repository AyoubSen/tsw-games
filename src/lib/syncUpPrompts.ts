export type SyncUpPromptPack =
	| "mixed"
	| "chaos"
	| "cozy"
	| "food"
	| "travel"
	| "social";

export interface SyncUpPrompt {
	id: string;
	text: string;
	pack: SyncUpPromptPack;
}

type PromptTemplate = {
	pack: Exclude<SyncUpPromptPack, "mixed">;
	template: string;
	variables: Record<string, string[]>;
};

const PROMPT_TEMPLATES: PromptTemplate[] = [
	{
		pack: "cozy",
		template: "Name something you would bring to {place}.",
		variables: {
			place: [
				"a sleepover",
				"a rainy day at home",
				"a movie night",
				"a picnic",
				"a quiet cabin weekend",
				"a beach day",
			],
		},
	},
	{
		pack: "cozy",
		template: "Name something that instantly makes {thing} better.",
		variables: {
			thing: ["coffee", "a long drive", "a bad day", "a party", "a room"],
		},
	},
	{
		pack: "chaos",
		template: "Name something you would hate to find in {place}.",
		variables: {
			place: [
				"your backpack",
				"your bed",
				"an elevator",
				"a public pool",
				"your fridge",
				"a wedding cake",
			],
		},
	},
	{
		pack: "chaos",
		template: "Name an object that screams {vibe}.",
		variables: {
			vibe: [
				"rich person",
				"main character",
				"villain",
				"bad roommate",
				"airport panic",
				"secretly cursed",
			],
		},
	},
	{
		pack: "food",
		template: "Name a food that fits the vibe: {vibe}.",
		variables: {
			vibe: [
				"midnight snack",
				"childhood comfort",
				"overpriced but worth it",
				"party table",
				"lazy dinner",
				"first date",
			],
		},
	},
	{
		pack: "food",
		template: "Name a drink people order when they want to seem {vibe}.",
		variables: {
			vibe: ["fancy", "healthy", "mysterious", "tired", "cool"],
		},
	},
	{
		pack: "travel",
		template: "Name something people always forget before {event}.",
		variables: {
			event: [
				"a flight",
				"a road trip",
				"a hotel checkout",
				"a beach vacation",
				"a camping trip",
			],
		},
	},
	{
		pack: "travel",
		template: "Name a place where {feeling} feels awkward.",
		variables: {
			feeling: ["silence", "laughing", "running", "being early", "being lost"],
		},
	},
	{
		pack: "social",
		template: "Name a bad excuse for being late to {event}.",
		variables: {
			event: ["dinner", "school", "work", "a date", "a wedding", "game night"],
		},
	},
	{
		pack: "social",
		template: "Name something people pretend to like at {event}.",
		variables: {
			event: [
				"a party",
				"a family dinner",
				"a work meeting",
				"a wedding",
				"a group trip",
			],
		},
	},
];

function expandTemplate(template: PromptTemplate): SyncUpPrompt[] {
	const [variableName] = Object.keys(template.variables);
	const values = template.variables[variableName] ?? [];

	return values.map((value) => ({
		id: `${template.pack}:${template.template}:${value}`,
		text: template.template.replace(`{${variableName}}`, value),
		pack: template.pack,
	}));
}

/**
 * Folds simple plurals onto their singular ("boxes" → "box", "cookies" and
 * "cookie" → "cooky"). Deliberately conservative: short words and endings
 * like -ss/-us/-is are left alone.
 */
function singularize(word: string): string {
	if (word.length <= 3 || /(?:ss|us|is)$/.test(word)) return word;
	if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
	if (word.endsWith("ie")) return `${word.slice(0, -2)}y`;
	if (/(?:sses|xes|ches|shes)$/.test(word)) return word.slice(0, -2);
	if (word.endsWith("s")) return word.slice(0, -1);
	return word;
}

export function normalizeSyncUpAnswer(answer: string): string {
	return answer
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9 ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^(?:a|an|the) (?=\S)/, "")
		.split(" ")
		.map(singularize)
		.join(" ");
}

export function getSyncUpPromptPool(pack: SyncUpPromptPack): SyncUpPrompt[] {
	const prompts = PROMPT_TEMPLATES.flatMap(expandTemplate);

	if (pack === "mixed") {
		return prompts;
	}

	return prompts.filter((prompt) => prompt.pack === pack);
}

export function pickSyncUpPrompt(
	pack: SyncUpPromptPack,
	usedPromptIds: string[] = [],
): SyncUpPrompt {
	const pool = getSyncUpPromptPool(pack);
	const freshPool = pool.filter((prompt) => !usedPromptIds.includes(prompt.id));
	const candidates = freshPool.length > 0 ? freshPool : pool;

	return candidates[Math.floor(Math.random() * candidates.length)];
}
