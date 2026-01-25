// Dictionary service for validating English words
// Uses the Free Dictionary API (https://dictionaryapi.dev/)

// Cache validated words to avoid repeated API calls
const validatedWords = new Map<string, boolean>()

// Common short words that are definitely valid (to avoid API calls for obvious words)
const COMMON_WORDS = new Set([
  // 2-letter words
  "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is", "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we",
  // 3-letter words
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "its", "let", "may", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "end", "few", "got", "man", "own", "say", "she", "too", "use", "act", "add", "age", "ago", "air", "ask", "bad", "bag", "bar", "bed", "big", "bit", "box", "bus", "buy", "car", "cat", "cup", "cut", "dog", "dry", "eat", "egg", "eye", "far", "fat", "fit", "fly", "fun", "gas", "gun", "hat", "hit", "hot", "ice", "job", "key", "kid", "lay", "leg", "lie", "lot", "low", "map", "mix", "mud", "net", "nor", "odd", "oil", "pay", "pen", "pet", "pie", "pig", "pin", "pop", "pot", "put", "ran", "raw", "red", "rid", "row", "run", "sad", "sat", "sea", "set", "sit", "six", "sky", "son", "sun", "tax", "tea", "ten", "tie", "tip", "top", "try", "van", "war", "wet", "win", "won", "yes", "yet", "arm", "art", "bed", "bit", "bow", "cap", "cow", "cry", "die", "due", "ear", "era", "fan", "fee", "fix", "gap", "god", "hay", "hen", "hip", "hug", "ink", "inn", "jam", "jar", "jaw", "jet", "joy", "lab", "lap", "law", "lid", "lip", "log", "mad", "mat", "mom", "nap", "nut", "oak", "oat", "pad", "pan", "paw", "pea", "per", "pit", "ray", "rib", "rob", "rod", "rot", "rub", "rug", "sad", "sin", "sip", "ski", "sob", "soy", "spy", "sum", "tab", "tag", "tan", "tap", "tar", "tin", "toe", "tom", "ton", "toy", "tub", "vet", "via", "vow", "web", "wig", "wit", "woe", "wow", "yam", "zip", "zoo",
])

export async function isValidEnglishWord(word: string): Promise<boolean> {
  const normalizedWord = word.toLowerCase().trim()

  // Basic validation
  if (!normalizedWord || normalizedWord.length < 2) {
    return false
  }

  // Only alphabetic characters allowed
  if (!/^[a-z]+$/.test(normalizedWord)) {
    return false
  }

  // Check cache first
  if (validatedWords.has(normalizedWord)) {
    return validatedWords.get(normalizedWord)!
  }

  // Check common words
  if (COMMON_WORDS.has(normalizedWord)) {
    validatedWords.set(normalizedWord, true)
    return true
  }

  // Query the dictionary API
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${normalizedWord}`
    )

    const isValid = response.ok
    validatedWords.set(normalizedWord, isValid)
    return isValid
  } catch (error) {
    console.error('Dictionary API error:', error)
    // On error, be permissive - let the game continue
    return true
  }
}

// Synchronous check for cached words only (for UI feedback)
export function isWordInCache(word: string): boolean | null {
  const normalizedWord = word.toLowerCase().trim()

  if (COMMON_WORDS.has(normalizedWord)) {
    return true
  }

  if (validatedWords.has(normalizedWord)) {
    return validatedWords.get(normalizedWord)!
  }

  return null // Not in cache, need to validate async
}

// Pre-validate a word (call this to warm up the cache)
export function prevalidateWord(word: string): void {
  isValidEnglishWord(word) // Fire and forget
}

// Clear the cache (useful for testing)
export function clearWordCache(): void {
  validatedWords.clear()
}
