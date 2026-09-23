export const BOMB_TIME_OPTIONS = [180, 240, 300] as const
export const BOMB_STRIKE_LIMIT = 3
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
export type ModuleKind = "wires" | "symbols" | "switches"
export const MODULE_LABELS: Record<ModuleKind, string> = {
  wires: "Wire panel", symbols: "Symbol keypad", switches: "Switch bank",
}

export type BombDevice =
  | { kind: "wires"; serial: string; colors: WireColor[] }
  | { kind: "symbols"; symbols: BombSymbol[] }
  | { kind: "switches"; channel: number; signal: "steady" | "pulsing" }

export type BombManual =
  | { kind: "wires"; repeatedColor: WireColor; evenPosition: number; oddPosition: number }
  | { kind: "symbols"; order: BombSymbol[] }
  | { kind: "switches"; rows: { channel: number; signal: "steady" | "pulsing"; positions: boolean[] }[] }

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
  device: BombDevice | null
  manual: BombManual | null
}

export interface BombRoundResult {
  round: number
  operatorName: string
  defused: boolean
  solvedModules: number
  strikes: number
  secondsLeft: number
}

export interface PublicBombState {
  roomCode: string
  hostId: string
  canControl: boolean
  players: Record<string, BombPlayer>
  status: "waiting" | "playing" | "round-end" | "finished"
  timeLimit: number
  round: number
  totalRounds: number
  missionId: string | null
  operatorId: string | null
  nextOperatorId: string | null
  deadline: number | null
  serverTime: number
  strikes: number
  modules: PublicBombModule[]
  outcome: "defused" | "time" | "strikes" | "crew-left" | null
  lastAction: { kind: ModuleKind; correct: boolean } | null
  history: BombRoundResult[]
}

export type BombSubmission =
  | { kind: "wires"; position: number }
  | { kind: "symbols"; sequence: BombSymbol[] }
  | { kind: "switches"; positions: boolean[] }

export type BombClientMessage =
  | { type: "join"; name: string }
  | { type: "start" }
  | { type: "next"; missionId: string }
  | { type: "attempt"; missionId: string; revision: number; submission: BombSubmission }
  | { type: "restart" }
  | { type: "leave" }

export type BombServerMessage =
  | { type: "state"; state: PublicBombState }
  | { type: "error"; message: string }
