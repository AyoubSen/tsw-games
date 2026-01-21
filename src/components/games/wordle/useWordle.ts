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

const MAX_GUESSES = 6
const WORD_LENGTH = 5

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

    setCurrentGuess((prev) => {
      if (prev.length >= WORD_LENGTH) return prev
      return prev + letter.toUpperCase()
    })
  }, [])

  const removeLetter = useCallback(() => {
    if (isResetting.current) return

    setCurrentGuess((prev) => prev.slice(0, -1))
  }, [])

  const submitGuess = useCallback(() => {
    if (isResetting.current) return
    if (gameStatus !== 'playing') return

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

    const evaluated = evaluateGuess(currentGuess, targetWord)

    setGuesses((prev) => {
      const newGuesses = [...prev]
      newGuesses[currentRow] = evaluated
      return newGuesses
    })

    setUsedLetters((prev) => updateUsedLetters(prev, evaluated))
    setRevealRow(currentRow)

    const won = currentGuess === targetWord
    const lost = !won && currentRow === MAX_GUESSES - 1

    if (won) {
      const messages = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']
      showMessage(messages[currentRow] || 'Nice!', 2000)
      setGameStatus('won')
    } else if (lost) {
      showMessage(targetWord, 3000)
      setGameStatus('lost')
    }

    setCurrentGuess('')
    setCurrentRow((prev) => prev + 1)
  }, [currentGuess, currentRow, gameStatus, targetWord, showMessage])

  const resetGame = useCallback(() => {
    if (!isWordsLoaded()) return

    // Set flag to prevent keyboard input during reset
    isResetting.current = true

    // Reset all state
    setTargetWord(getRandomWord())
    setGuesses(Array(MAX_GUESSES).fill(null).map(() => []))
    setCurrentGuess('')
    setCurrentRow(0)
    setGameStatus('playing')
    setUsedLetters({})
    setShake(false)
    setRevealRow(null)
    setMessage(null)

    // Allow input again after a short delay
    setTimeout(() => {
      isResetting.current = false
    }, 100)
  }, [])

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
    addLetter,
    removeLetter,
    submitGuess,
    resetGame,
    maxGuesses: MAX_GUESSES,
    wordLength: WORD_LENGTH,
  }
}
