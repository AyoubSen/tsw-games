import type { Reaction, ReactionMessage } from "./reactions"

export const BOMB_TIME_OPTIONS = [180, 240, 300] as const
export const BOMB_STRIKE_LIMIT = 3

export const BOMB_DIFFICULTIES = {
  easy: { label: "Easy", modules: 3 },
  normal: { label: "Normal", modules: 4 },
  hard: { label: "Hard", modules: 5 },
} as const
export type BombDifficulty = keyof typeof BOMB_DIFFICULTIES
export function isBombDifficulty(value: unknown): value is BombDifficulty {
  return typeof value === "string" && value in BOMB_DIFFICULTIES
}

/**
 * Server-paced beats, advanced by the storage alarm so every screen sees the
 * same timeline. Client animations inside a beat must fit these durations.
 */
export const BOMB_PACE_MS = {
  /** Strike LED, case shake, red flash (client-only, keyed by the action). */
  strike: 1100,
  /** Module LED turns green with a chime (client-only, keyed by the action). */
  solve: 1000,
  /** Timer frozen, every LED green, relief held before the round ends. */
  defused: 3800,
  /** White flash, shake, then a held "BOOM". */
  exploded: 4000,
  /** Added before the boom when the last strike caused it, so the LED lights first. */
  boomDelay: 700,
  /** The device passes to the next operator before their clock starts. */
  handoff: 3200,
} as const

/** Holding The Button longer than this lights the strip instead of counting as a tap. */
export const BUTTON_HOLD_MS = 550

export function formatBombTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`
}

export const WIRE_COLORS = ["red", "blue", "yellow", "green", "white", "purple"] as const
export type WireColor = (typeof WIRE_COLORS)[number]

export const BOMB_SYMBOLS = {
  star: { glyph: "☆", label: "Star" },
  diamond: { glyph: "◇", label: "Diamond" },
  triangle: { glyph: "△", label: "Triangle" },
  circle: { glyph: "○", label: "Circle" },
  wave: { glyph: "≈", label: "Waves" },
  cross: { glyph: "✚", label: "Cross" },
  moon: { glyph: "☾", label: "Moon" },
  hash: { glyph: "#", label: "Hash" },
} as const
export type BombSymbol = keyof typeof BOMB_SYMBOLS

export const BUTTON_COLORS = ["red", "blue", "yellow", "white"] as const
export type ButtonColor = (typeof BUTTON_COLORS)[number]
export const BUTTON_LABELS = ["ABORT", "DETONATE", "HOLD", "PRESS"] as const
export type ButtonLabel = (typeof BUTTON_LABELS)[number]
export type ButtonAction = "tap" | "hold"
export interface ButtonRule { color?: ButtonColor; label?: ButtonLabel; action: ButtonAction }

export const SIMON_COLORS = ["red", "blue", "green", "yellow"] as const
export type SimonColor = (typeof SIMON_COLORS)[number]

export const MODULE_KINDS = ["wires", "symbols", "switches", "button", "simon"] as const
export type ModuleKind = (typeof MODULE_KINDS)[number]
export const MODULE_LABELS: Record<ModuleKind, string> = {
  wires: "Wire panel", symbols: "Symbol keypad", switches: "Switch bank", button: "The Button", simon: "Simon signals",
}

export type BombDevice =
  | { kind: "wires"; colors: WireColor[] }
  | { kind: "symbols"; symbols: BombSymbol[] }
  | { kind: "switches"; channel: number; signal: "steady" | "pulsing" }
  | { kind: "button"; color: ButtonColor; label: ButtonLabel; strip: ButtonColor }
  | { kind: "simon"; flashes: SimonColor[] }

export type BombManual =
  | { kind: "wires"; repeatedColor: WireColor; evenPosition: number; oddPosition: number }
  | { kind: "symbols"; order: BombSymbol[] }
  | { kind: "switches"; rows: { channel: number; signal: "steady" | "pulsing"; positions: boolean[] }[] }
  | { kind: "button"; rules: ButtonRule[]; fallback: ButtonAction; release: Record<ButtonColor, number> }
  /** `table[strikes][index of the flashed colour]` is the colour to press. */
  | { kind: "simon"; table: SimonColor[][] }

export interface BombPlayer {
  id: string
  name: string
  joinedAt: number
  connected?: boolean
}

export interface PublicBombModule {
  kind: ModuleKind
  expertId: string
  solved: boolean
  revision: number
  /** Wires already cut (positions from 1), so a wrong cut stays cut. */
  cut: number[]
  device: BombDevice | null
  manual: BombManual | null
}

export type BombOutcome = "defused" | "time" | "strikes" | "crew-left"

export interface BombRoundResult {
  round: number
  operatorName: string
  defused: boolean
  outcome?: BombOutcome
  difficulty?: BombDifficulty
  moduleCount?: number
  solvedModules: number
  strikes: number
  secondsLeft: number
}

export interface BombLogEntry {
  seq: number
  secondsLeft: number
  kind: ModuleKind
  text: string
  correct: boolean
  strikes: number
}

export interface BombPace {
  seq: number
  stage: "handoff" | "defused" | "exploded"
  endsAt: number
}

export interface PublicBombState {
  roomCode: string
  hostId: string
  canControl: boolean
  players: Record<string, BombPlayer>
  /** handoff → playing → resolving → round-end (or finished) */
  status: "waiting" | "handoff" | "playing" | "resolving" | "round-end" | "finished"
  timeLimit: number
  difficulty: BombDifficulty
  round: number
  totalRounds: number
  missionId: string | null
  operatorId: string | null
  nextOperatorId: string | null
  deadline: number | null
  serverTime: number
  /** Shown on the case sticker; null for anyone who can't see the device. */
  serial: string | null
  strikes: number
  modules: PublicBombModule[]
  outcome: BombOutcome | null
  lastAction: { seq: number; kind: ModuleKind; correct: boolean } | null
  pace: BombPace | null
  /** The clock as it stopped when the round was decided. */
  frozenSecondsLeft: number | null
  log: BombLogEntry[]
  history: BombRoundResult[]
}

export type BombSubmission =
  | { kind: "wires"; position: number }
  | { kind: "symbols"; sequence: BombSymbol[] }
  | { kind: "switches"; positions: boolean[] }
  | { kind: "button"; action: "tap" }
  /** `secondsLeft` is the countdown as the operator saw it on release. */
  | { kind: "button"; action: "hold"; secondsLeft: number }
  | { kind: "simon"; sequence: SimonColor[] }

export type BombClientMessage =
  | { type: "join"; name: string; authToken?: unknown }
  | { type: "settings"; timeLimit?: number; difficulty?: BombDifficulty }
  | { type: "start" }
  | { type: "next"; missionId: string }
  | { type: "attempt"; missionId: string; revision: number; submission: BombSubmission }
  | { type: "react"; reaction: Reaction }
  | { type: "restart" }
  | { type: "leave" }

export type BombServerMessage =
  | { type: "state"; state: PublicBombState }
  | { type: "error"; message: string }
  | ReactionMessage
