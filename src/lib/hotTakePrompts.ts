export type HotTakePack =
	| "mixed"
	| "food"
	| "social"
	| "dating"
	| "internet"
	| "travel"
	| "chaos";

export interface HotTakePrompt {
	id: string;
	text: string;
	pack: HotTakePack;
}

type PromptTemplate = {
	pack: Exclude<HotTakePack, "mixed">;
	template: string;
	variables: Record<string, string[]>;
};

const PROMPT_TEMPLATES: PromptTemplate[] = [
	{
		pack: "food",
		template: "{food} is overrated.",
		variables: {
			food: [
				"sushi",
				"burgers",
				"cereal",
				"bubble tea",
				"brunch",
				"matcha",
				"fries with truffle oil",
			],
		},
	},
	{
		pack: "food",
		template: "{food} is only good in one situation.",
		variables: {
			food: [
				"pizza",
				"ice cream",
				"instant noodles",
				"salads",
				"croissants",
				"tacos",
			],
		},
	},
	{
		pack: "social",
		template: "{thing} should be illegal at parties.",
		variables: {
			thing: [
				"voice notes on speaker",
				"glitter",
				"bringing a guitar",
				"talking about crypto",
				"showing everyone a 5-minute video",
				"taking group photos every 10 minutes",
			],
		},
	},
	{
		pack: "social",
		template: "{habit} is a red flag.",
		variables: {
			habit: [
				"texting super late",
				"always being too early",
				"replying with one word",
				"oversharing on the first hangout",
				"sending reels instead of answering",
				"talking over songs in the car",
			],
		},
	},
	{
		pack: "dating",
		template: "{place} is a bad first date spot.",
		variables: {
			place: [
				"the cinema",
				"the gym",
				"a wedding",
				"a family dinner",
				"an amusement park",
				"IKEA",
			],
		},
	},
	{
		pack: "dating",
		template: "{move} is secretly romantic.",
		variables: {
			move: [
				"sharing fries",
				"remembering a weird detail",
				"making a playlist",
				"walking someone home",
				"bringing extra snacks",
				"charging their phone for them",
			],
		},
	},
	{
		pack: "internet",
		template: "{platform} was better before everyone got there.",
		variables: {
			platform: [
				"TikTok",
				"Instagram",
				"YouTube",
				"Twitter",
				"Discord",
				"Reddit",
			],
		},
	},
	{
		pack: "internet",
		template: "{thing} ruins the internet.",
		variables: {
			thing: [
				"reaction videos",
				"forced personal branding",
				"podcast clips",
				"rage bait",
				"motivational carousel posts",
				"people filming in public",
			],
		},
	},
	{
		pack: "travel",
		template: "{place} is not worth the hype.",
		variables: {
			place: [
				"airports",
				"all-inclusive resorts",
				"road trips",
				"camping",
				"cruises",
				"weekend city breaks",
			],
		},
	},
	{
		pack: "travel",
		template: "{travel_habit} is the correct way to travel.",
		variables: {
			travel_habit: [
				"arriving 3 hours early",
				"only taking hand luggage",
				"booking nothing in advance",
				"sleeping on every flight",
				"buying souvenirs for nobody",
				"walking instead of using taxis",
			],
		},
	},
	{
		pack: "chaos",
		template: "{job} has way too much confidence.",
		variables: {
			job: [
				"life coaches",
				"wedding DJs",
				"real estate agents",
				"influencers",
				"barbers",
				"club promoters",
			],
		},
	},
	{
		pack: "chaos",
		template: "{thing} is low-key embarrassing for adults.",
		variables: {
			thing: [
				"matching pajamas",
				"fake plant collections",
				"ring lights",
				"gaming chairs",
				"posting gym mirror selfies",
				"using speakerphone in public",
			],
		},
	},
];

function expandTemplate(template: PromptTemplate): HotTakePrompt[] {
	const [variableName] = Object.keys(template.variables);
	const values = template.variables[variableName] ?? [];

	return values.map((value) => ({
		id: `${template.pack}:${template.template}:${value}`,
		text: template.template.replace(`{${variableName}}`, value),
		pack: template.pack,
	}));
}

export function getHotTakePromptPool(pack: HotTakePack): HotTakePrompt[] {
	const prompts = PROMPT_TEMPLATES.flatMap(expandTemplate);

	if (pack === "mixed") {
		return prompts;
	}

	return prompts.filter((prompt) => prompt.pack === pack);
}

export function pickHotTakePrompt(
	pack: HotTakePack,
	usedPromptIds: string[] = [],
): HotTakePrompt {
	const pool = getHotTakePromptPool(pack);
	const freshPool = pool.filter((prompt) => !usedPromptIds.includes(prompt.id));
	const candidates = freshPool.length > 0 ? freshPool : pool;

	return candidates[Math.floor(Math.random() * candidates.length)];
}
