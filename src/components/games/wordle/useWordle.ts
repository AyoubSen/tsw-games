import { useState, useCallback, useEffect, useRef } from 'react'
import {
  loadWords,
  getRandomWord,
  isValidWord,
  isWordsLoaded,
  getAnswerCount,
  getValidCount,
} from '@/lib/wordService'

export type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'tbd'

export interface Letter {
  char: string
  state: LetterState
}

export type GameStatus = 'loading' | 'playing' | 'won' | 'lost'
export type SinglePlayerMode = 'classic' | 'hard' | 'one-lie'

const MAX_GUESSES = 6
const WORD_LENGTH = 5

export function buildKnownPattern(guesses: Letter[][], wordLength: number): Letter[] | null {
  const pattern: Letter[] = Array.from({ length: wordLength }, () => ({ char: 'X', state: 'tbd' }))
  let hasCorrectLetter = false

  for (const guess of guesses) {
    guess.forEach((letter, index) => {
      if (letter.state === 'correct') {
        pattern[index] = letter
        hasCorrectLetter = true
      }
    })
  }

  return hasCorrectLetter ? pattern : null
}

export function buildShareText(
  guesses: Letter[][],
  won: boolean,
  attempts: number,
  label = 'Wordle',
  colorblind = false,
): string {
  const symbols = colorblind
    ? { correct: '🟦', present: '🟧', absent: '⬛' }
    : { correct: '🟩', present: '🟨', absent: '⬛' }
  const grid = guesses
    .filter(guess => guess.length > 0)
    .map(guess => guess.map(letter => symbols[letter.state as keyof typeof symbols] ?? '⬛').join(''))
    .join('\n')
  return `${label} ${won ? attempts : 'X'}/${MAX_GUESSES}\n${grid}`
}

function evaluateGuess(guess: string, target: string): Letter[] {
  const result: Letter[] = []
  const targetChars = target.split('')
  const guessChars = guess.split('')
  const used: boolean[] = new Array(WORD_LENGTH).fill(false)

  // First pass: mark correct letters
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessChars[i] === targetChars[i]) {
      result[i] = { char: guessChars[i], state: 'correct' }
      used[i] = true
    }
  }

  // Second pass: mark present letters
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i]) continue

    const char = guessChars[i]
    let found = false

    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && targetChars[j] === char) {
        found = true
        used[j] = true
        break
      }
    }

    result[i] = { char, state: found ? 'present' : 'absent' }
  }

  return result
}

function applyOneLie(result: Letter[], seed: string): Letter[] {
  const candidates = result
    .map((letter, index) => letter.state === 'correct' ? -1 : index)
    .filter(index => index >= 0)
  if (candidates.length === 0) return result

  let hash = 0
  for (const char of seed) hash = Math.imul(31, hash) + char.charCodeAt(0) | 0
  const lieIndex = candidates[Math.abs(hash) % candidates.length]
  return result.map((letter, index) => {
    if (index !== lieIndex) return letter
    const state: LetterState = letter.state === 'present' ? 'absent' : 'present'
    return { ...letter, state }
  })
}

function updateUsedLetters(
  current: Record<string, LetterState>,
  guess: Letter[]
): Record<string, LetterState> {
  const updated = { ...current }

  for (const letter of guess) {
    const existing = updated[letter.char]
    if (letter.state === 'correct') {
      updated[letter.char] = 'correct'
    } else if (letter.state === 'present' && existing !== 'correct') {
      updated[letter.char] = 'present'
    } else if (!existing) {
      updated[letter.char] = letter.state
    }
  }

  return updated
}

function getHardModeError(word: string, guesses: Letter[][]): string | null {
  const requiredCounts = new Map<string, number>()

  for (const guess of guesses) {
    const rowCounts = new Map<string, number>()
    for (let index = 0; index < guess.length; index++) {
      const letter = guess[index]
      if (letter.state === 'correct' && word[index] !== letter.char) {
        return `${letter.char} must stay in position ${index + 1}`
      }
      if (letter.state === 'present' && word[index] === letter.char) {
        return `${letter.char} cannot be used in position ${index + 1}`
      }
      if (letter.state === 'correct' || letter.state === 'present') {
        rowCounts.set(letter.char, (rowCounts.get(letter.char) ?? 0) + 1)
      }
    }
    for (const [char, count] of rowCounts) {
      requiredCounts.set(char, Math.max(requiredCounts.get(char) ?? 0, count))
    }
  }

  for (const [char, count] of requiredCounts) {
    if (word.split(char).length - 1 < count) return `Guess must contain ${char}`
  }
  return null
}

export function useWordle() {
  const [targetWord, setTargetWord] = useState('')
  const [guesses, setGuesses] = useState<Letter[][]>(() =>
    Array(MAX_GUESSES).fill(null).map(() => [])
  )
  const [currentGuess, setCurrentGuess] = useState('')
  const [currentRow, setCurrentRow] = useState(0)
  const [gameStatus, setGameStatus] = useState<GameStatus>('loading')
  const [usedLetters, setUsedLetters] = useState<Record<string, LetterState>>({})
  const [shake, setShake] = useState(false)
  const [revealRow, setRevealRow] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [answerCount, setAnswerCount] = useState(0)
  const [validCount, setValidCount] = useState(0)
  const [revealedWord, setRevealedWord] = useState<string | null>(null)
  const [visualization, setVisualization] = useState<Letter[] | null>(null)
  const [hardMode, setHardMode] = useState(false)
  const [oneLieMode, setOneLieMode] = useState(false)

  // Use ref to track if we're in the middle of resetting
  const isResetting = useRef(false)

  const showMessage = useCallback((msg: string, duration = 1500) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), duration)
  }, [])

  // Load words on mount
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        await loadWords()

        if (mounted) {
          setAnswerCount(getAnswerCount())
          setValidCount(getValidCount())
          setTargetWord(getRandomWord())
          setGameStatus('playing')
        }
      } catch (error) {
        console.error('Failed to load words:', error)
        if (mounted) {
          showMessage('Failed to load words. Please refresh.')
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [showMessage])

  const addLetter = useCallback((letter: string) => {
    if (isResetting.current) return

    setVisualization(null)

    setCurrentGuess((prev) => {
      if (prev.length >= WORD_LENGTH) return prev
      return prev + letter.toUpperCase()
    })
  }, [])

  const removeLetter = useCallback(() => {
    if (isResetting.current) return

    if (visualization) {
      setVisualization(null)
      return
    }

    setCurrentGuess((prev) => prev.slice(0, -1))
  }, [visualization])

  const toggleVisualization = useCallback(() => {
    if (isResetting.current || gameStatus !== 'playing' || currentGuess) return
    setVisualization((current) => current ? null : buildKnownPattern(guesses, WORD_LENGTH))
  }, [currentGuess, gameStatus, guesses])

  const toggleHardMode = useCallback(() => {
    if (oneLieMode || gameStatus !== 'playing' || currentRow > 0 || currentGuess) return
    setHardMode(current => !current)
  }, [currentGuess, currentRow, gameStatus, oneLieMode])

  const submitGuess = useCallback(() => {
    if (isResetting.current) return
    if (gameStatus !== 'playing') return
    if (visualization) return

    if (currentGuess.length !== WORD_LENGTH) {
      showMessage('Not enough letters')
      setShake(true)
      return
    }

    if (!isValidWord(currentGuess)) {
      showMessage('Not in word list')
      setShake(true)
      return
    }

    if (hardMode) {
      const hardModeError = getHardModeError(currentGuess, guesses)
      if (hardModeError) {
        showMessage(hardModeError)
        setShake(true)
        return
      }
    }

    const won = currentGuess === targetWord
    const evaluated = evaluateGuess(currentGuess, targetWord)
    const displayedResult = oneLieMode && !won
      ? applyOneLie(evaluated, `${targetWord}:${currentGuess}:${currentRow}`)
      : evaluated

    setGuesses((prev) => {
      const newGuesses = [...prev]
      newGuesses[currentRow] = displayedResult
      return newGuesses
    })

    setUsedLetters((prev) => updateUsedLetters(prev, displayedResult))
    setRevealRow(currentRow)

    const lost = !won && currentRow === MAX_GUESSES - 1

    if (won) {
      const messages = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']
      showMessage(messages[currentRow] || 'Nice!', 2000)
      setGameStatus('won')
    } else if (lost) {
      showMessage(targetWord, 3000)
      setRevealedWord(targetWord)
      setGameStatus('lost')
    }

    setCurrentGuess('')
    setCurrentRow((prev) => prev + 1)
  }, [currentGuess, currentRow, gameStatus, targetWord, showMessage, visualization, hardMode, guesses, oneLieMode])

  const resetGame = useCallback(() => {
    if (!isWordsLoaded()) return

    // Set flag to prevent keyboard input during reset
    isResetting.current = true

    // Reset all state
    setRevealedWord(null)
    setTargetWord(getRandomWord())
    setGuesses(Array(MAX_GUESSES).fill(null).map(() => []))
    setCurrentGuess('')
    setCurrentRow(0)
    setGameStatus('playing')
    setUsedLetters({})
    setShake(false)
    setRevealRow(null)
    setMessage(null)
    setVisualization(null)

    // Allow input again after a short delay
    setTimeout(() => {
      isResetting.current = false
    }, 100)
  }, [])

  const startGame = useCallback((mode: SinglePlayerMode) => {
    setHardMode(mode === 'hard')
    setOneLieMode(mode === 'one-lie')
    resetGame()
  }, [resetGame])

  // Clear shake after animation
  useEffect(() => {
    if (shake) {
      const timer = setTimeout(() => setShake(false), 600)
      return () => clearTimeout(timer)
    }
  }, [shake])

  // Clear reveal row after animation
  useEffect(() => {
    if (revealRow !== null) {
      const timer = setTimeout(() => setRevealRow(null), 1800)
      return () => clearTimeout(timer)
    }
  }, [revealRow])

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if (isResetting.current) return
      if (gameStatus !== 'playing') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'Enter') {
        e.preventDefault()
        submitGuess()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        removeLetter()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault()
        addLetter(e.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addLetter, removeLetter, submitGuess, gameStatus])

  return {
    targetWord,
    guesses,
    currentGuess,
    currentRow,
    gameStatus,
    usedLetters,
    shake,
    revealRow,
    message,
    answerCount,
    validCount,
    revealedWord,
    visualization,
    hardMode,
    oneLieMode,
    canToggleHardMode: !oneLieMode && gameStatus === 'playing' && currentRow === 0 && currentGuess.length === 0,
    canVisualize: gameStatus === 'playing' && currentGuess.length === 0 && buildKnownPattern(guesses, WORD_LENGTH) !== null,
    addLetter,
    removeLetter,
    submitGuess,
    toggleVisualization,
    toggleHardMode,
    startGame,
    resetGame,
    maxGuesses: MAX_GUESSES,
    wordLength: WORD_LENGTH,
  }
}
