import { useState, useCallback, useEffect, useRef } from "react"

// Phrases for typing
const PHRASES = [
  "The quick brown fox jumps over the lazy dog.",
  "Pack my box with five dozen liquor jugs.",
  "How vexingly quick daft zebras jump!",
  "The five boxing wizards jump quickly.",
  "Sphinx of black quartz, judge my vow.",
  "Two driven jocks help fax my big quiz.",
  "The jay, pig, fox, zebra and my wolves quack!",
  "Sympathizing would fix Quaker objectives.",
  "A wizard's job is to vex chumps quickly in fog.",
  "Watch Jeopardy, Alex Trebek's fun TV quiz game.",
  "By Jove, my quick study of lexicography won a prize!",
  "Waxy and quivering, jocks fumble the pizza.",
  "When zombies arrive, quickly fax judge Pat.",
  "Heavy boxes perform quick waltzes and jigs.",
  "A quick movement of the enemy will jeopardize six gunboats.",
  "All questions asked by five watched experts amaze the judge.",
  "Jack quietly moved up front and seized the big ball of wax.",
]

function getRandomPhrase(): string {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)]
}

export type GameStatus = "idle" | "playing" | "finished"

export interface TypeRaceState {
  text: string
  typedText: string
  gameStatus: GameStatus
  startTime: number | null
  endTime: number | null
  wpm: number
  accuracy: number
  correctChars: number
  totalTyped: number
}

export function useTypeRace() {
  const [state, setState] = useState<TypeRaceState>({
    text: "",
    typedText: "",
    gameStatus: "idle",
    startTime: null,
    endTime: null,
    wpm: 0,
    accuracy: 100,
    correctChars: 0,
    totalTyped: 0,
  })

  const intervalRef = useRef<number | null>(null)

  // Calculate WPM in real-time
  const calculateWPM = useCallback((correctChars: number, startTime: number) => {
    const elapsedMs = Date.now() - startTime
    if (elapsedMs < 1000) return 0 // Avoid crazy high WPM at start
    const minutes = elapsedMs / 60000
    const words = correctChars / 5 // Standard: 5 chars = 1 word
    return Math.round(words / minutes)
  }, [])

  // Start a new game
  const startGame = useCallback(() => {
    const newText = getRandomPhrase()
    setState({
      text: newText,
      typedText: "",
      gameStatus: "playing",
      startTime: Date.now(),
      endTime: null,
      wpm: 0,
      accuracy: 100,
      correctChars: 0,
      totalTyped: 0,
    })
  }, [])

  // Handle text input
  const handleInput = useCallback((newTypedText: string) => {
    setState((prev) => {
      if (prev.gameStatus !== "playing") return prev

      const { text, startTime } = prev
      if (!startTime) return prev

      // Count correct characters
      let correctChars = 0
      for (let i = 0; i < newTypedText.length && i < text.length; i++) {
        if (newTypedText[i] === text[i]) {
          correctChars++
        }
      }

      const totalTyped = newTypedText.length
      const accuracy = totalTyped > 0 ? Math.round((correctChars / totalTyped) * 100) : 100
      const wpm = calculateWPM(correctChars, startTime)

      // Check if completed
      const isComplete = newTypedText === text
      if (isComplete) {
        return {
          ...prev,
          typedText: newTypedText,
          correctChars,
          totalTyped,
          accuracy,
          wpm,
          gameStatus: "finished",
          endTime: Date.now(),
        }
      }

      return {
        ...prev,
        typedText: newTypedText,
        correctChars,
        totalTyped,
        accuracy,
        wpm,
      }
    })
  }, [calculateWPM])

  // Update WPM periodically while playing
  useEffect(() => {
    if (state.gameStatus === "playing" && state.startTime) {
      intervalRef.current = window.setInterval(() => {
        setState((prev) => {
          if (prev.gameStatus !== "playing" || !prev.startTime) return prev
          const wpm = calculateWPM(prev.correctChars, prev.startTime)
          return { ...prev, wpm }
        })
      }, 500)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    }
  }, [state.gameStatus, state.startTime, calculateWPM])

  // Reset game
  const resetGame = useCallback(() => {
    setState({
      text: "",
      typedText: "",
      gameStatus: "idle",
      startTime: null,
      endTime: null,
      wpm: 0,
      accuracy: 100,
      correctChars: 0,
      totalTyped: 0,
    })
  }, [])

  // Get elapsed time in seconds
  const getElapsedTime = useCallback(() => {
    if (!state.startTime) return 0
    const endTime = state.endTime || Date.now()
    return Math.floor((endTime - state.startTime) / 1000)
  }, [state.startTime, state.endTime])

  // Get progress percentage
  const getProgress = useCallback(() => {
    if (!state.text) return 0
    return Math.round((state.correctChars / state.text.length) * 100)
  }, [state.text, state.correctChars])

  return {
    ...state,
    startGame,
    handleInput,
    resetGame,
    getElapsedTime,
    getProgress,
  }
}
