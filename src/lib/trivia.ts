export type TriviaPack = "mixed" | "world" | "science" | "history" | "culture"
export type TriviaCategory = Exclude<TriviaPack, "mixed">
export type TriviaFormat = "direct" | "inverse" | "category" | "pair" | "comparison"

export interface TriviaChoice {
  id: string
  label: string
}

export interface TriviaQuestion {
  id: string
  pack: TriviaCategory
  categoryLabel: string
  format: TriviaFormat
  prompt: string
  choices: TriviaChoice[]
  correctChoiceId: string
  explanation: string
}

interface TriviaRecord {
  id: string
  pack: TriviaCategory
  name: string
  group: string
  groupLabel: string
  factLabel: string
  factValue: string
  number?: number
  comparisonPrompt?: string
  comparisonExplanation?: string
}

export const TRIVIA_PACKS: ReadonlyArray<{
  id: TriviaPack
  label: string
  description: string
}> = [
  { id: "mixed", label: "Mixed", description: "A little of every category." },
  { id: "world", label: "World", description: "Countries, capitals, and continents." },
  { id: "science", label: "Science", description: "Elements, symbols, and scientific groups." },
  { id: "history", label: "History", description: "Landmark events and chronology." },
  { id: "culture", label: "Culture", description: "Books, art, music, and their creators." },
]

const RECORDS: readonly TriviaRecord[] = [
  { id: "world:canada", pack: "world", name: "Canada", group: "North America", groupLabel: "continent", factLabel: "capital", factValue: "Ottawa" },
  { id: "world:brazil", pack: "world", name: "Brazil", group: "South America", groupLabel: "continent", factLabel: "capital", factValue: "Brasilia" },
  { id: "world:japan", pack: "world", name: "Japan", group: "Asia", groupLabel: "continent", factLabel: "capital", factValue: "Tokyo" },
  { id: "world:kenya", pack: "world", name: "Kenya", group: "Africa", groupLabel: "continent", factLabel: "capital", factValue: "Nairobi" },
  { id: "world:norway", pack: "world", name: "Norway", group: "Europe", groupLabel: "continent", factLabel: "capital", factValue: "Oslo" },
  { id: "world:australia", pack: "world", name: "Australia", group: "Oceania", groupLabel: "continent", factLabel: "capital", factValue: "Canberra" },
  { id: "world:argentina", pack: "world", name: "Argentina", group: "South America", groupLabel: "continent", factLabel: "capital", factValue: "Buenos Aires" },
  { id: "world:egypt", pack: "world", name: "Egypt", group: "Africa", groupLabel: "continent", factLabel: "capital", factValue: "Cairo" },
  { id: "world:thailand", pack: "world", name: "Thailand", group: "Asia", groupLabel: "continent", factLabel: "capital", factValue: "Bangkok" },
  { id: "world:portugal", pack: "world", name: "Portugal", group: "Europe", groupLabel: "continent", factLabel: "capital", factValue: "Lisbon" },
  { id: "world:mexico", pack: "world", name: "Mexico", group: "North America", groupLabel: "continent", factLabel: "capital", factValue: "Mexico City" },
  { id: "world:new-zealand", pack: "world", name: "New Zealand", group: "Oceania", groupLabel: "continent", factLabel: "capital", factValue: "Wellington" },

  { id: "science:hydrogen", pack: "science", name: "Hydrogen", group: "Nonmetal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "H", number: 1, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Hydrogen has atomic number 1." },
  { id: "science:carbon", pack: "science", name: "Carbon", group: "Nonmetal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "C", number: 6, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Carbon has atomic number 6." },
  { id: "science:oxygen", pack: "science", name: "Oxygen", group: "Nonmetal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "O", number: 8, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Oxygen has atomic number 8." },
  { id: "science:sodium", pack: "science", name: "Sodium", group: "Alkali metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Na", number: 11, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Sodium has atomic number 11." },
  { id: "science:magnesium", pack: "science", name: "Magnesium", group: "Alkaline earth metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Mg", number: 12, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Magnesium has atomic number 12." },
  { id: "science:aluminium", pack: "science", name: "Aluminium", group: "Post-transition metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Al", number: 13, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Aluminium has atomic number 13." },
  { id: "science:chlorine", pack: "science", name: "Chlorine", group: "Halogen", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Cl", number: 17, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Chlorine has atomic number 17." },
  { id: "science:argon", pack: "science", name: "Argon", group: "Noble gas", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Ar", number: 18, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Argon has atomic number 18." },
  { id: "science:iron", pack: "science", name: "Iron", group: "Transition metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Fe", number: 26, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Iron has atomic number 26." },
  { id: "science:copper", pack: "science", name: "Copper", group: "Transition metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Cu", number: 29, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Copper has atomic number 29." },
  { id: "science:silver", pack: "science", name: "Silver", group: "Transition metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Ag", number: 47, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Silver has atomic number 47." },
  { id: "science:gold", pack: "science", name: "Gold", group: "Transition metal", groupLabel: "element family", factLabel: "chemical symbol", factValue: "Au", number: 79, comparisonPrompt: "Which element has the lowest atomic number?", comparisonExplanation: "Gold has atomic number 79." },

  { id: "history:magna-carta", pack: "history", name: "The Magna Carta was sealed", group: "Middle Ages", groupLabel: "historical period", factLabel: "year", factValue: "1215", number: 1215, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The Magna Carta was sealed in 1215." },
  { id: "history:printing-press", pack: "history", name: "Gutenberg developed his printing press", group: "Renaissance", groupLabel: "historical period", factLabel: "year", factValue: "c. 1440", number: 1440, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "Gutenberg's press dates to around 1440." },
  { id: "history:columbus", pack: "history", name: "Columbus reached the Americas", group: "Age of Exploration", groupLabel: "historical period", factLabel: "year", factValue: "1492", number: 1492, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "Columbus reached the Americas in 1492." },
  { id: "history:american-independence", pack: "history", name: "The US Declaration of Independence was adopted", group: "Age of Revolutions", groupLabel: "historical period", factLabel: "year", factValue: "1776", number: 1776, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The Declaration was adopted in 1776." },
  { id: "history:french-revolution", pack: "history", name: "The French Revolution began", group: "Age of Revolutions", groupLabel: "historical period", factLabel: "year", factValue: "1789", number: 1789, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The French Revolution began in 1789." },
  { id: "history:steam-locomotive", pack: "history", name: "The first public steam railway opened", group: "Industrial Revolution", groupLabel: "historical period", factLabel: "year", factValue: "1825", number: 1825, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The Stockton and Darlington Railway opened in 1825." },
  { id: "history:telephone", pack: "history", name: "Bell received a patent for the telephone", group: "Industrial Revolution", groupLabel: "historical period", factLabel: "year", factValue: "1876", number: 1876, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "Alexander Graham Bell received the patent in 1876." },
  { id: "history:first-flight", pack: "history", name: "The Wright brothers made their first powered flight", group: "Modern Era", groupLabel: "historical period", factLabel: "year", factValue: "1903", number: 1903, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The Wright brothers flew at Kitty Hawk in 1903." },
  { id: "history:world-war-one", pack: "history", name: "World War I began", group: "Modern Era", groupLabel: "historical period", factLabel: "year", factValue: "1914", number: 1914, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "World War I began in 1914." },
  { id: "history:united-nations", pack: "history", name: "The United Nations was founded", group: "Postwar Era", groupLabel: "historical period", factLabel: "year", factValue: "1945", number: 1945, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The United Nations was founded in 1945." },
  { id: "history:moon-landing", pack: "history", name: "Apollo 11 landed on the Moon", group: "Space Age", groupLabel: "historical period", factLabel: "year", factValue: "1969", number: 1969, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "Apollo 11 landed on the Moon in 1969." },
  { id: "history:berlin-wall", pack: "history", name: "The Berlin Wall fell", group: "Cold War", groupLabel: "historical period", factLabel: "year", factValue: "1989", number: 1989, comparisonPrompt: "Which event happened earliest?", comparisonExplanation: "The Berlin Wall fell in 1989." },

  { id: "culture:odyssey", pack: "culture", name: "The Odyssey", group: "Epic poem", groupLabel: "art form", factLabel: "creator", factValue: "Homer" },
  { id: "culture:hamlet", pack: "culture", name: "Hamlet", group: "Play", groupLabel: "art form", factLabel: "creator", factValue: "William Shakespeare" },
  { id: "culture:pride-prejudice", pack: "culture", name: "Pride and Prejudice", group: "Novel", groupLabel: "art form", factLabel: "creator", factValue: "Jane Austen" },
  { id: "culture:starry-night", pack: "culture", name: "The Starry Night", group: "Painting", groupLabel: "art form", factLabel: "creator", factValue: "Vincent van Gogh" },
  { id: "culture:four-seasons", pack: "culture", name: "The Four Seasons", group: "Classical music", groupLabel: "art form", factLabel: "creator", factValue: "Antonio Vivaldi" },
  { id: "culture:guernica", pack: "culture", name: "Guernica", group: "Painting", groupLabel: "art form", factLabel: "creator", factValue: "Pablo Picasso" },
  { id: "culture:frankenstein", pack: "culture", name: "Frankenstein", group: "Novel", groupLabel: "art form", factLabel: "creator", factValue: "Mary Shelley" },
  { id: "culture:swan-lake", pack: "culture", name: "Swan Lake", group: "Ballet", groupLabel: "art form", factLabel: "creator", factValue: "Pyotr Ilyich Tchaikovsky" },
  { id: "culture:great-gatsby", pack: "culture", name: "The Great Gatsby", group: "Novel", groupLabel: "art form", factLabel: "creator", factValue: "F. Scott Fitzgerald" },
  { id: "culture:girl-pearl-earring", pack: "culture", name: "Girl with a Pearl Earring", group: "Painting", groupLabel: "art form", factLabel: "creator", factValue: "Johannes Vermeer" },
  { id: "culture:bolero", pack: "culture", name: "Bolero", group: "Classical music", groupLabel: "art form", factLabel: "creator", factValue: "Maurice Ravel" },
  { id: "culture:waiting-godot", pack: "culture", name: "Waiting for Godot", group: "Play", groupLabel: "art form", factLabel: "creator", factValue: "Samuel Beckett" },
]

const CATEGORY_LABELS: Record<TriviaCategory, string> = {
  world: "World",
  science: "Science",
  history: "History",
  culture: "Culture",
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!]
  }
  return result
}

function sampleOtherRecords(
  record: TriviaRecord,
  pool: readonly TriviaRecord[],
  random: () => number,
  predicate: (candidate: TriviaRecord) => boolean = () => true,
): TriviaRecord[] {
  return shuffle(
    pool.filter((candidate) => candidate.id !== record.id && predicate(candidate)),
    random,
  ).slice(0, 3)
}

function buildQuestion(
  record: TriviaRecord,
  format: TriviaFormat,
  pool: readonly TriviaRecord[],
  random: () => number,
): TriviaQuestion | null {
  const compatiblePool = pool.filter((candidate) => candidate.pack === record.pack)
  let choices: TriviaChoice[]
  let prompt: string
  let explanation: string
  let correctChoiceId = record.id

  if (format === "direct" || format === "inverse") {
    const others = sampleOtherRecords(record, compatiblePool, random)
    if (others.length < 3) return null
    choices = shuffle([record, ...others], random).map((candidate) => ({
      id: candidate.id,
      label: format === "direct" ? candidate.factValue : candidate.name,
    }))
    prompt =
      format === "direct"
        ? `What is the ${record.factLabel} of ${record.name}?`
        : `Which answer is matched with ${record.factValue}?`
    explanation = `${record.name} is matched with ${record.factValue}.`
  } else if (format === "category") {
    const others = sampleOtherRecords(
      record,
      compatiblePool,
      random,
      (candidate) => candidate.group !== record.group,
    )
    if (others.length < 3) return null
    choices = shuffle([record, ...others], random).map((candidate) => ({
      id: candidate.id,
      label: candidate.name,
    }))
    prompt = `Which belongs to the ${record.groupLabel} "${record.group}"?`
    explanation = `${record.name} belongs to ${record.group}.`
  } else if (format === "pair") {
    const others = sampleOtherRecords(record, compatiblePool, random)
    if (others.length < 3) return null
    const rotatedValues = [...others.slice(1), others[0]].map(
      (candidate) => candidate?.factValue ?? "",
    )
    choices = shuffle(
      [
        { id: record.id, label: `${record.name} - ${record.factValue}` },
        ...others.map((candidate, index) => ({
          id: candidate.id,
          label: `${candidate.name} - ${rotatedValues[index]}`,
        })),
      ],
      random,
    )
    prompt = `Which ${record.factLabel} pairing is correct?`
    explanation = `${record.name} is correctly paired with ${record.factValue}.`
  } else {
    const numbered = compatiblePool.filter(
      (candidate) =>
        candidate.number !== undefined &&
        candidate.comparisonPrompt === record.comparisonPrompt,
    )
    const others = sampleOtherRecords(record, numbered, random)
    if (
      record.number === undefined ||
      !record.comparisonPrompt ||
      others.length < 3
    ) {
      return null
    }
    const candidates = [record, ...others]
    const correct = candidates.reduce((lowest, candidate) =>
      (candidate.number ?? Number.POSITIVE_INFINITY) <
      (lowest.number ?? Number.POSITIVE_INFINITY)
        ? candidate
        : lowest,
    )
    correctChoiceId = correct.id
    choices = shuffle(candidates, random).map((candidate) => ({
      id: candidate.id,
      label: candidate.name,
    }))
    prompt = record.comparisonPrompt
    explanation =
      correct.comparisonExplanation ??
      `${correct.name} has the lowest value in this group.`
  }

  return {
    id: `${record.id}:${format}`,
    pack: record.pack,
    categoryLabel: CATEGORY_LABELS[record.pack],
    format,
    prompt,
    choices,
    correctChoiceId,
    explanation,
  }
}

export function isTriviaPack(value: unknown): value is TriviaPack {
  return TRIVIA_PACKS.some((pack) => pack.id === value)
}

export function getTriviaQuestionCount(pack: TriviaPack): number {
  const pool = pack === "mixed" ? RECORDS : RECORDS.filter((item) => item.pack === pack)
  return pool.reduce(
    (count, record) => count + 4 + (record.number !== undefined ? 1 : 0),
    0,
  )
}

export function pickTriviaQuestion(
  pack: TriviaPack,
  usedQuestionIds: readonly string[] = [],
  random: () => number = Math.random,
): { question: TriviaQuestion; usedQuestionIds: string[] } {
  const pool = pack === "mixed" ? RECORDS : RECORDS.filter((item) => item.pack === pack)
  const formats: TriviaFormat[] = ["direct", "inverse", "category", "pair", "comparison"]
  const descriptors = pool.flatMap((record) =>
    formats
      .filter((format) => format !== "comparison" || record.number !== undefined)
      .map((format) => ({ id: `${record.id}:${format}`, record, format })),
  )
  const used = new Set(usedQuestionIds)
  const fresh = descriptors.filter((descriptor) => !used.has(descriptor.id))
  const candidates = fresh.length > 0 ? fresh : descriptors

  for (const descriptor of shuffle(candidates, random)) {
    const question = buildQuestion(descriptor.record, descriptor.format, pool, random)
    if (question) {
      return {
        question,
        usedQuestionIds: [
          ...(fresh.length > 0 ? usedQuestionIds : []),
          question.id,
        ],
      }
    }
  }

  throw new Error(`No trivia questions are available for ${pack}`)
}

export function scoreTriviaAnswer(
  submittedAt: number,
  roundStartedAt: number,
  roundEndsAt: number,
): number {
  const duration = Math.max(1, roundEndsAt - roundStartedAt)
  const remaining = Math.max(0, Math.min(duration, roundEndsAt - submittedAt))
  return 1000 + Math.floor((remaining / duration) * 500)
}
