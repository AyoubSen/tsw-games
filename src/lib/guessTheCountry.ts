export type Country = Readonly<{
  code: string
  name: string
  aliases?: readonly string[]
}>

export const COUNTRIES: readonly Country[] = [
  { code: "af", name: "Afghanistan" },
  { code: "al", name: "Albania" },
  { code: "dz", name: "Algeria" },
  { code: "ad", name: "Andorra" },
  { code: "ao", name: "Angola" },
  { code: "ag", name: "Antigua and Barbuda" },
  { code: "ar", name: "Argentina" },
  { code: "am", name: "Armenia" },
  { code: "au", name: "Australia" },
  { code: "at", name: "Austria" },
  { code: "az", name: "Azerbaijan" },
  { code: "bs", name: "Bahamas", aliases: ["The Bahamas"] },
  { code: "bh", name: "Bahrain" },
  { code: "bd", name: "Bangladesh" },
  { code: "bb", name: "Barbados" },
  { code: "by", name: "Belarus" },
  { code: "be", name: "Belgium" },
  { code: "bz", name: "Belize" },
  { code: "bj", name: "Benin" },
  { code: "bt", name: "Bhutan" },
  { code: "bo", name: "Bolivia" },
  { code: "ba", name: "Bosnia and Herzegovina" },
  { code: "bw", name: "Botswana" },
  { code: "br", name: "Brazil" },
  { code: "bn", name: "Brunei", aliases: ["Brunei Darussalam"] },
  { code: "bg", name: "Bulgaria" },
  { code: "bf", name: "Burkina Faso" },
  { code: "bi", name: "Burundi" },
  { code: "cv", name: "Cabo Verde", aliases: ["Cape Verde"] },
  { code: "kh", name: "Cambodia" },
  { code: "cm", name: "Cameroon" },
  { code: "ca", name: "Canada" },
  { code: "cf", name: "Central African Republic" },
  { code: "td", name: "Chad" },
  { code: "cl", name: "Chile" },
  { code: "cn", name: "China", aliases: ["People's Republic of China", "PRC"] },
  { code: "co", name: "Colombia" },
  { code: "km", name: "Comoros" },
  {
    code: "cd",
    name: "Democratic Republic of the Congo",
    aliases: ["DR Congo", "DRC", "Congo-Kinshasa"],
  },
  {
    code: "cg",
    name: "Republic of the Congo",
    aliases: ["Congo", "Congo-Brazzaville"],
  },
  { code: "cr", name: "Costa Rica" },
  { code: "ci", name: "C\u00f4te d'Ivoire", aliases: ["Ivory Coast"] },
  { code: "hr", name: "Croatia" },
  { code: "cu", name: "Cuba" },
  { code: "cy", name: "Cyprus" },
  { code: "cz", name: "Czechia", aliases: ["Czech Republic"] },
  { code: "dk", name: "Denmark" },
  { code: "dj", name: "Djibouti" },
  { code: "dm", name: "Dominica" },
  { code: "do", name: "Dominican Republic" },
  { code: "ec", name: "Ecuador" },
  { code: "eg", name: "Egypt" },
  { code: "sv", name: "El Salvador" },
  { code: "gq", name: "Equatorial Guinea" },
  { code: "er", name: "Eritrea" },
  { code: "ee", name: "Estonia" },
  { code: "sz", name: "Eswatini", aliases: ["Swaziland"] },
  { code: "et", name: "Ethiopia" },
  { code: "fj", name: "Fiji" },
  { code: "fi", name: "Finland" },
  { code: "fr", name: "France" },
  { code: "ga", name: "Gabon" },
  { code: "gm", name: "Gambia", aliases: ["The Gambia"] },
  { code: "ge", name: "Georgia" },
  { code: "de", name: "Germany" },
  { code: "gh", name: "Ghana" },
  { code: "gr", name: "Greece" },
  { code: "gd", name: "Grenada" },
  { code: "gt", name: "Guatemala" },
  { code: "gn", name: "Guinea" },
  { code: "gw", name: "Guinea-Bissau" },
  { code: "gy", name: "Guyana" },
  { code: "ht", name: "Haiti" },
  { code: "hn", name: "Honduras" },
  { code: "hu", name: "Hungary" },
  { code: "is", name: "Iceland" },
  { code: "in", name: "India" },
  { code: "id", name: "Indonesia" },
  { code: "ir", name: "Iran" },
  { code: "iq", name: "Iraq" },
  { code: "ie", name: "Ireland" },
  { code: "il", name: "Israel" },
  { code: "it", name: "Italy" },
  { code: "jm", name: "Jamaica" },
  { code: "jp", name: "Japan" },
  { code: "jo", name: "Jordan" },
  { code: "kz", name: "Kazakhstan" },
  { code: "ke", name: "Kenya" },
  { code: "ki", name: "Kiribati" },
  { code: "kw", name: "Kuwait" },
  { code: "kg", name: "Kyrgyzstan" },
  { code: "la", name: "Laos", aliases: ["Lao People's Democratic Republic", "Lao PDR"] },
  { code: "lv", name: "Latvia" },
  { code: "lb", name: "Lebanon" },
  { code: "ls", name: "Lesotho" },
  { code: "lr", name: "Liberia" },
  { code: "ly", name: "Libya" },
  { code: "li", name: "Liechtenstein" },
  { code: "lt", name: "Lithuania" },
  { code: "lu", name: "Luxembourg" },
  { code: "mg", name: "Madagascar" },
  { code: "mw", name: "Malawi" },
  { code: "my", name: "Malaysia" },
  { code: "mv", name: "Maldives" },
  { code: "ml", name: "Mali" },
  { code: "mt", name: "Malta" },
  { code: "mh", name: "Marshall Islands" },
  { code: "mr", name: "Mauritania" },
  { code: "mu", name: "Mauritius" },
  { code: "mx", name: "Mexico" },
  {
    code: "fm",
    name: "Micronesia",
    aliases: ["Federated States of Micronesia"],
  },
  { code: "md", name: "Moldova", aliases: ["Republic of Moldova"] },
  { code: "mc", name: "Monaco" },
  { code: "mn", name: "Mongolia" },
  { code: "me", name: "Montenegro" },
  { code: "ma", name: "Morocco" },
  { code: "mz", name: "Mozambique" },
  { code: "mm", name: "Myanmar", aliases: ["Burma"] },
  { code: "na", name: "Namibia" },
  { code: "nr", name: "Nauru" },
  { code: "np", name: "Nepal" },
  { code: "nl", name: "Netherlands", aliases: ["Holland"] },
  { code: "nz", name: "New Zealand" },
  { code: "ni", name: "Nicaragua" },
  { code: "ne", name: "Niger" },
  { code: "ng", name: "Nigeria" },
  {
    code: "kp",
    name: "North Korea",
    aliases: ["DPRK", "Democratic People's Republic of Korea"],
  },
  { code: "mk", name: "North Macedonia", aliases: ["Macedonia"] },
  { code: "no", name: "Norway" },
  { code: "om", name: "Oman" },
  { code: "pk", name: "Pakistan" },
  { code: "pw", name: "Palau" },
  { code: "ps", name: "Palestine", aliases: ["State of Palestine"] },
  { code: "pa", name: "Panama" },
  { code: "pg", name: "Papua New Guinea" },
  { code: "py", name: "Paraguay" },
  { code: "pe", name: "Peru" },
  { code: "ph", name: "Philippines", aliases: ["The Philippines"] },
  { code: "pl", name: "Poland" },
  { code: "pt", name: "Portugal" },
  { code: "qa", name: "Qatar" },
  { code: "ro", name: "Romania" },
  { code: "ru", name: "Russia", aliases: ["Russian Federation"] },
  { code: "rw", name: "Rwanda" },
  { code: "kn", name: "Saint Kitts and Nevis" },
  { code: "lc", name: "Saint Lucia" },
  { code: "vc", name: "Saint Vincent and the Grenadines" },
  { code: "ws", name: "Samoa" },
  { code: "sm", name: "San Marino" },
  { code: "st", name: "S\u00e3o Tom\u00e9 and Pr\u00edncipe" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "sn", name: "Senegal" },
  { code: "rs", name: "Serbia" },
  { code: "sc", name: "Seychelles" },
  { code: "sl", name: "Sierra Leone" },
  { code: "sg", name: "Singapore" },
  { code: "sk", name: "Slovakia", aliases: ["Slovak Republic"] },
  { code: "si", name: "Slovenia" },
  { code: "sb", name: "Solomon Islands" },
  { code: "so", name: "Somalia" },
  { code: "za", name: "South Africa" },
  {
    code: "kr",
    name: "South Korea",
    aliases: ["Republic of Korea", "ROK"],
  },
  { code: "ss", name: "South Sudan" },
  { code: "es", name: "Spain" },
  { code: "lk", name: "Sri Lanka" },
  { code: "sd", name: "Sudan" },
  { code: "sr", name: "Suriname" },
  { code: "se", name: "Sweden" },
  { code: "ch", name: "Switzerland" },
  { code: "sy", name: "Syria" },
  { code: "tj", name: "Tajikistan" },
  { code: "tz", name: "Tanzania", aliases: ["United Republic of Tanzania"] },
  { code: "th", name: "Thailand" },
  { code: "tl", name: "Timor-Leste", aliases: ["East Timor"] },
  { code: "tg", name: "Togo" },
  { code: "to", name: "Tonga" },
  { code: "tt", name: "Trinidad and Tobago" },
  { code: "tn", name: "Tunisia" },
  { code: "tr", name: "Turkey", aliases: ["Turkiye"] },
  { code: "tm", name: "Turkmenistan" },
  { code: "tv", name: "Tuvalu" },
  { code: "ug", name: "Uganda" },
  { code: "ua", name: "Ukraine" },
  { code: "ae", name: "United Arab Emirates", aliases: ["UAE"] },
  {
    code: "gb",
    name: "United Kingdom",
    aliases: ["UK", "Great Britain", "Britain"],
  },
  {
    code: "us",
    name: "United States",
    aliases: ["USA", "United States of America", "America"],
  },
  { code: "uy", name: "Uruguay" },
  { code: "uz", name: "Uzbekistan" },
  { code: "vu", name: "Vanuatu" },
  { code: "va", name: "Vatican City", aliases: ["Vatican", "Holy See"] },
  { code: "ve", name: "Venezuela" },
  { code: "vn", name: "Vietnam", aliases: ["Viet Nam"] },
  { code: "ye", name: "Yemen" },
  { code: "zm", name: "Zambia" },
  { code: "zw", name: "Zimbabwe" },
] as const

export type PickNextCountryResult = Readonly<{
  country: Country
  usedCodes: readonly string[]
}>

export function normalizeCountryGuess(guess: string): string {
  return guess
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
}

export function isCorrectCountryGuess(guess: string, country: Country): boolean {
  const normalizedGuess = normalizeCountryGuess(guess)

  return [country.name, ...(country.aliases ?? [])].some(
    (acceptedName) => normalizeCountryGuess(acceptedName) === normalizedGuess,
  )
}

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((country) => country.code === code.toLowerCase())
}

export function buildCountryChoices(
  country: Country,
  random: () => number = Math.random,
): string[] {
  const distractors = COUNTRIES.filter((candidate) => candidate.code !== country.code)

  for (let index = distractors.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = distractors[index]
    distractors[index] = distractors[swapIndex]
    distractors[swapIndex] = current
  }

  const choices = [country.name, ...distractors.slice(0, 3).map((item) => item.name)]
  for (let index = choices.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = choices[index]
    choices[index] = choices[swapIndex]
    choices[swapIndex] = current
  }

  return choices
}

export function pickNextCountry(
  usedCodes: readonly string[],
  random: () => number = Math.random,
): PickNextCountryResult {
  const countryCodes = new Set(COUNTRIES.map((country) => country.code))
  const usedCodeSet = new Set(
    usedCodes
      .map((code) => code.toLowerCase())
      .filter((code) => countryCodes.has(code)),
  )
  let availableCountries = COUNTRIES.filter(
    (country) => !usedCodeSet.has(country.code),
  )
  let nextUsedCodes = [...usedCodeSet]

  if (availableCountries.length === 0) {
    availableCountries = [...COUNTRIES]
    nextUsedCodes = []
  }

  const country =
    availableCountries[Math.floor(random() * availableCountries.length)]!

  return {
    country,
    usedCodes: [...nextUsedCodes, country.code],
  }
}
