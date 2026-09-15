const DB_NAME = 'tsw-games-db'
const DB_VERSION = 2
const WORDS_STORE = 'words'
const META_STORE = 'meta'

// Cache expiry: 30 days (these lists don't change)
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000

// Curated word lists from the original Wordle
const ANSWERS_URL = 'https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt'
const ALLOWED_URL = 'https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw/wordle-allowed-guesses.txt'

const FALLBACK_WORDS = [
  'about', 'above', 'actor', 'admit', 'adopt', 'after', 'again', 'agent', 'agree', 'ahead',
  'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'alter', 'among',
  'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue', 'arise', 'array',
  'aside', 'asset', 'audio', 'audit', 'avoid', 'award', 'aware', 'basic', 'beach', 'begin',
  'black', 'blank', 'blend', 'blind', 'block', 'board', 'brain', 'brand', 'brave', 'bread',
  'break', 'brick', 'brief', 'bring', 'broad', 'brown', 'build', 'cabin', 'carry', 'catch',
  'chain', 'chair', 'charm', 'chase', 'check', 'chess', 'chest', 'chief', 'child', 'claim',
  'class', 'clean', 'clear', 'click', 'climb', 'clock', 'close', 'cloud', 'coach', 'coast',
  'count', 'court', 'cover', 'craft', 'crash', 'cream', 'crime', 'cross', 'crowd', 'crown',
  'dance', 'death', 'delay', 'doubt', 'draft', 'drama', 'dream', 'drink', 'drive', 'eager',
  'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'entry', 'equal', 'event',
  'every', 'exact', 'exist', 'extra', 'faith', 'false', 'field', 'fight', 'final', 'first',
  'flash', 'float', 'floor', 'focus', 'force', 'found', 'frame', 'fresh', 'front', 'fruit',
  'funny', 'giant', 'given', 'glass', 'globe', 'glory', 'grace', 'grade', 'grain', 'grand',
  'grant', 'grass', 'great', 'green', 'group', 'guard', 'guess', 'guest', 'guide', 'happy',
  'heart', 'heavy', 'hello', 'horse', 'hotel', 'house', 'human', 'ideal', 'image', 'input',
  'issue', 'joint', 'judge', 'juice', 'known', 'label', 'large', 'later', 'laugh', 'learn',
  'least', 'leave', 'lemon', 'level', 'light', 'limit', 'local', 'logic', 'lucky', 'lunch',
  'magic', 'major', 'match', 'maybe', 'media', 'metal', 'might', 'minor', 'model', 'money',
  'month', 'moral', 'motor', 'mount', 'mouse', 'mouth', 'movie', 'music', 'never', 'night',
  'noise', 'north', 'novel', 'nurse', 'ocean', 'offer', 'often', 'opera', 'orbit', 'order',
  'other', 'owner', 'paint', 'panel', 'paper', 'party', 'peace', 'phone', 'photo', 'piece',
  'pilot', 'pitch', 'place', 'plain', 'plane', 'plant', 'plate', 'point', 'power', 'press',
  'price', 'pride', 'prime', 'print', 'prize', 'proof', 'proud', 'queen', 'quest', 'quick',
  'quiet', 'quite', 'radio', 'raise', 'range', 'reach', 'react', 'ready', 'relax', 'reply',
  'right', 'rival', 'river', 'robot', 'rough', 'round', 'route', 'royal', 'salad', 'scale',
  'scene', 'score', 'sense', 'serve', 'seven', 'shade', 'shake', 'shape', 'share', 'sharp',
  'sheep', 'sheet', 'shelf', 'shell', 'shift', 'shine', 'shirt', 'shock', 'shore', 'short',
  'shout', 'sight', 'skill', 'sleep', 'slice', 'slide', 'small', 'smart', 'smell', 'smile',
  'smoke', 'snake', 'solar', 'solid', 'solve', 'sound', 'south', 'space', 'spare', 'spark',
  'speak', 'speed', 'spend', 'spike', 'spirit', 'sport', 'stack', 'staff', 'stage', 'stake',
  'stand', 'start', 'state', 'steam', 'steel', 'stick', 'still', 'stock', 'stone', 'store',
  'storm', 'story', 'strip', 'study', 'style', 'sugar', 'super', 'sweet', 'swing', 'sword',
  'table', 'taste', 'teach', 'teeth', 'thank', 'their', 'theme', 'there', 'these', 'thick',
  'thing', 'think', 'third', 'those', 'three', 'throw', 'tiger', 'tight', 'timer', 'tired',
  'title', 'today', 'token', 'tooth', 'topic', 'total', 'touch', 'tough', 'tower', 'trace',
  'track', 'trade', 'train', 'treat', 'trend', 'trial', 'tribe', 'trick', 'truck', 'truly',
  'trust', 'truth', 'twice', 'uncle', 'under', 'union', 'unity', 'until', 'upper', 'upset',
  'urban', 'usage', 'usual', 'valid', 'value', 'video', 'visit', 'vital', 'vivid', 'vocal',
  'voice', 'waste', 'watch', 'water', 'weird', 'whale', 'wheat', 'wheel', 'where', 'which',
  'while', 'white', 'whole', 'woman', 'world', 'worry', 'worse', 'worth', 'would', 'write',
  'wrong', 'yield', 'young', 'youth', 'zebra',
]

interface CacheMeta {
  id: string
  timestamp: number
  answerCount: number
  validCount: number
}

// In-memory cache
let answerWords: string[] = []
let validWordsSet: Set<string> = new Set()

function useFallbackWords() {
  answerWords = [...FALLBACK_WORDS]
  validWordsSet = new Set(FALLBACK_WORDS)
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Delete old stores if they exist (schema change)
      if (db.objectStoreNames.contains(WORDS_STORE)) {
        db.deleteObjectStore(WORDS_STORE)
      }
      if (db.objectStoreNames.contains(META_STORE)) {
        db.deleteObjectStore(META_STORE)
      }

      db.createObjectStore(WORDS_STORE, { keyPath: 'id' })
      db.createObjectStore(META_STORE, { keyPath: 'id' })
    }
  })
}

async function getCacheMeta(db: IDBDatabase): Promise<CacheMeta | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readonly')
    const store = transaction.objectStore(META_STORE)
    const request = store.get('wordle-words')

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

async function getCachedWords(db: IDBDatabase): Promise<{ answers: string[], valid: string[] } | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WORDS_STORE, 'readonly')
    const store = transaction.objectStore(WORDS_STORE)
    const request = store.get('wordle-words')

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const result = request.result
      if (result) {
        resolve({ answers: result.answers, valid: result.valid })
      } else {
        resolve(null)
      }
    }
  })
}

async function cacheWords(db: IDBDatabase, answers: string[], valid: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WORDS_STORE, META_STORE], 'readwrite')

    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()

    const wordsStore = transaction.objectStore(WORDS_STORE)
    wordsStore.put({ id: 'wordle-words', answers, valid })

    const metaStore = transaction.objectStore(META_STORE)
    metaStore.put({
      id: 'wordle-words',
      timestamp: Date.now(),
      answerCount: answers.length,
      validCount: valid.length,
    })
  })
}

async function fetchWordList(url: string): Promise<string[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`)
  }

  const text = await response.text()
  return text
    .split(/[\n,]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length === 5 && /^[a-z]+$/.test(word))
}

export async function loadWords(forceRefresh = false): Promise<void> {
  // Check if already loaded in memory
  if (!forceRefresh && answerWords.length > 0 && validWordsSet.size > 0) {
    return
  }

  // Check if we're in a browser environment
  if (typeof window === 'undefined' || !window.indexedDB) {
    try {
      const [answers, allowed] = await Promise.all([
        fetchWordList(ANSWERS_URL),
        fetchWordList(ALLOWED_URL),
      ])
      answerWords = answers
      validWordsSet = new Set([...answers, ...allowed])
    } catch (error) {
      console.error('Using bundled Wordle dictionary:', error)
      useFallbackWords()
    }
    return
  }

  try {
    const db = await openDB()

    // Check cache validity
    if (!forceRefresh) {
      const meta = await getCacheMeta(db)

      if (meta && Date.now() - meta.timestamp < CACHE_DURATION) {
        const cached = await getCachedWords(db)
        if (cached && cached.answers.length > 0) {
          console.log(`Loaded ${cached.answers.length} answer words and ${cached.valid.length} valid words from cache`)
          answerWords = cached.answers
          validWordsSet = new Set(cached.valid)
          return
        }
      }
    }

    // Fetch from GitHub
    console.log('Fetching word lists from GitHub...')
    const [answers, allowed] = await Promise.all([
      fetchWordList(ANSWERS_URL),
      fetchWordList(ALLOWED_URL),
    ])

    // Combine: all answers + all allowed guesses = valid words
    const allValid = [...new Set([...answers, ...allowed])]

    console.log(`Fetched ${answers.length} answer words and ${allValid.length} valid words`)

    // Cache
    await cacheWords(db, answers, allValid)

    answerWords = answers
    validWordsSet = new Set(allValid)
  } catch (error) {
    console.error('Error loading words:', error)

    useFallbackWords()
  }
}

export function getRandomWord(): string {
  if (answerWords.length === 0) {
    // Fallback if not loaded
    return 'HELLO'
  }

  const word = answerWords[Math.floor(Math.random() * answerWords.length)]
  return word.toUpperCase()
}

export function isValidWord(word: string): boolean {
  if (validWordsSet.size === 0) {
    // If not loaded yet, be permissive
    return word.length === 5 && /^[a-zA-Z]+$/.test(word)
  }

  return validWordsSet.has(word.toLowerCase())
}

export function getAnswerCount(): number {
  return answerWords.length
}

export function getValidCount(): number {
  return validWordsSet.size
}

export function isWordsLoaded(): boolean {
  return answerWords.length > 0 && validWordsSet.size > 0
}

export function getAnswerWords(): string[] {
  return answerWords
}

export function getValidWordsSet(): Set<string> {
  return validWordsSet
}
