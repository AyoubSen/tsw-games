import { useSyncExternalStore } from "react"

/** Table sound effects, synthesized with Web Audio so there are no files to load. */
export type SoundName = "deal" | "flip" | "chip" | "pot" | "dice" | "capture" | "turn" | "win" | "howl" | "dawn" | "toll" | "knock" | "shot" | "clue" | "correct" | "wrong" | "assassin" | "tick" | "lockin" | "whoosh" | "group" | "lonewolf" | "roundEnd" | "merge" | "sync" | "thunk" | "accepted" | "rejected" | "buzzer" | "snip" | "keycap" | "toggle" | "beep" | "chime" | "defuse" | "explode"

const MUTE_KEY = "tsw-games-muted"
const VOLUME = 0.22

let ctx: AudioContext | null = null
let out: GainNode | null = null
let noise: AudioBuffer | null = null
let unlocked = false
let muted = readMuted()
const listeners = new Set<() => void>()

function readMuted() {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(MUTE_KEY) === "1"
  } catch {
    return false
  }
}

// Browsers block audio until the page has been interacted with; stay silent until then.
function unlock() {
  unlocked = true
  for (const type of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(type, unlock, true)
  if (!muted) ensureContext()
}
if (typeof window !== "undefined") {
  for (const type of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(type, unlock, true)
}

function ensureContext() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    out = ctx.createGain()
    out.gain.value = VOLUME
    out.connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  if (ctx.state === "suspended") void ctx.resume()
  return ctx
}

export function isMuted() {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0")
  } catch {}
  if (!value && unlocked) ensureContext()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSoundMuted() {
  return useSyncExternalStore(subscribe, isMuted, () => false)
}

/** Short envelope: quick attack, exponential decay. */
function envelope(c: AudioContext, at: number, peak: number, decay: number) {
  const gain = c.createGain()
  gain.gain.value = 0.0001
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  gain.connect(out!)
  return gain
}

function burst(c: AudioContext, at: number, { type, freq, q = 1, peak, decay, sweepTo }: { type: BiquadFilterType; freq: number; q?: number; peak: number; decay: number; sweepTo?: number }) {
  const source = c.createBufferSource()
  source.buffer = noise
  source.playbackRate.value = 0.8 + Math.random() * 0.4
  const filter = c.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, at)
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + decay)
  filter.Q.value = q
  source.connect(filter).connect(envelope(c, at, peak, decay))
  source.start(at, Math.random() * 0.5, decay + 0.05)
}

function tone(c: AudioContext, at: number, { freq, type = "sine", peak, decay, slideTo }: { freq: number; type?: OscillatorType; peak: number; decay: number; slideTo?: number }) {
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + decay)
  osc.connect(envelope(c, at, peak, decay))
  osc.start(at)
  osc.stop(at + decay + 0.05)
}

function clink(c: AudioContext, at: number, peak = 0.35) {
  const base = 2600 + Math.random() * 900
  tone(c, at, { freq: base, type: "triangle", peak, decay: 0.09 })
  tone(c, at + 0.004, { freq: base * 1.47, peak: peak * 0.6, decay: 0.06 })
  burst(c, at, { type: "highpass", freq: 5000, peak: peak * 0.4, decay: 0.03 })
}

const SOUNDS: Record<SoundName, (c: AudioContext, at: number) => void> = {
  deal: (c, at) => burst(c, at, { type: "bandpass", freq: 3200, sweepTo: 1600, q: 0.8, peak: 0.45, decay: 0.08 }),
  flip: (c, at) => {
    burst(c, at, { type: "highpass", freq: 2200, peak: 0.4, decay: 0.05 })
    burst(c, at + 0.045, { type: "bandpass", freq: 1400, q: 1.2, peak: 0.3, decay: 0.04 })
  },
  chip: (c, at) => {
    clink(c, at)
    clink(c, at + 0.05 + Math.random() * 0.03, 0.25)
  },
  pot: (c, at) => {
    burst(c, at, { type: "bandpass", freq: 700, sweepTo: 2200, q: 0.7, peak: 0.35, decay: 0.38 })
    for (let i = 0; i < 4; i++) clink(c, at + 0.28 + i * 0.045 + Math.random() * 0.02, 0.22 - i * 0.03)
  },
  dice: (c, at) => {
    let t = at
    for (let i = 0; i < 7; i++) {
      burst(c, t, { type: "bandpass", freq: 1400 + Math.random() * 1200, q: 2, peak: 0.5 - i * 0.05, decay: 0.035 })
      t += 0.05 + Math.random() * 0.06 + i * 0.012
    }
  },
  capture: (c, at) => {
    tone(c, at, { freq: 260, type: "triangle", peak: 0.55, decay: 0.22, slideTo: 70 })
    burst(c, at, { type: "lowpass", freq: 900, peak: 0.4, decay: 0.12 })
  },
  turn: (c, at) => {
    tone(c, at, { freq: 880, peak: 0.28, decay: 0.45 })
    tone(c, at + 0.13, { freq: 1318.5, peak: 0.28, decay: 0.6 })
  },
  win: (c, at) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, i) => {
      const last = i === 3
      tone(c, at + i * 0.11, { freq, type: "triangle", peak: last ? 0.4 : 0.3, decay: last ? 0.9 : 0.25 })
      if (last) tone(c, at + i * 0.11, { freq: freq * 2, peak: 0.08, decay: 0.7 })
    })
  },
  howl: (c, at) => {
    tone(c, at, { freq: 330, type: "triangle", peak: 0.16, decay: 0.7, slideTo: 560 })
    tone(c, at + 0.55, { freq: 560, type: "triangle", peak: 0.18, decay: 1.3, slideTo: 290 })
    tone(c, at + 0.55, { freq: 1120, peak: 0.03, decay: 1.1, slideTo: 580 })
  },
  dawn: (c, at) => {
    ;[392, 523.25, 659.25, 783.99].forEach((freq, i) => tone(c, at + i * 0.16, { freq, peak: 0.16, decay: 0.9 }))
  },
  toll: (c, at) => {
    tone(c, at, { freq: 146.8, type: "triangle", peak: 0.5, decay: 2.2 })
    tone(c, at, { freq: 293.7 * 1.19, peak: 0.12, decay: 1.6 })
    tone(c, at, { freq: 587.3 * 1.5, peak: 0.05, decay: 0.9 })
    burst(c, at, { type: "bandpass", freq: 900, q: 2, peak: 0.12, decay: 0.05 })
  },
  knock: (c, at) => {
    tone(c, at, { freq: 190, type: "triangle", peak: 0.4, decay: 0.09, slideTo: 120 })
    burst(c, at, { type: "lowpass", freq: 700, peak: 0.35, decay: 0.05 })
  },
  shot: (c, at) => {
    burst(c, at, { type: "lowpass", freq: 2400, sweepTo: 300, peak: 0.8, decay: 0.35 })
    tone(c, at, { freq: 130, type: "triangle", peak: 0.5, decay: 0.3, slideTo: 40 })
  },
  clue: (c, at) => {
    burst(c, at, { type: "bandpass", freq: 2600, q: 3, peak: 0.25, decay: 0.03 })
    tone(c, at + 0.02, { freq: 587.33, type: "triangle", peak: 0.26, decay: 0.35 })
    tone(c, at + 0.16, { freq: 880, type: "triangle", peak: 0.3, decay: 0.7 })
    tone(c, at + 0.16, { freq: 1760, peak: 0.05, decay: 0.5 })
  },
  correct: (c, at) => {
    tone(c, at, { freq: 783.99, type: "triangle", peak: 0.28, decay: 0.22 })
    tone(c, at + 0.09, { freq: 1174.66, type: "triangle", peak: 0.3, decay: 0.5 })
  },
  wrong: (c, at) => {
    tone(c, at, { freq: 220, type: "sawtooth", peak: 0.12, decay: 0.32, slideTo: 150 })
    tone(c, at + 0.02, { freq: 233, type: "square", peak: 0.06, decay: 0.3, slideTo: 155 })
  },
  assassin: (c, at) => {
    tone(c, at, { freq: 98, type: "sawtooth", peak: 0.22, decay: 1.8, slideTo: 41 })
    tone(c, at, { freq: 103.8, type: "triangle", peak: 0.3, decay: 1.6, slideTo: 44 })
    burst(c, at + 0.05, { type: "lowpass", freq: 2000, sweepTo: 200, peak: 0.7, decay: 0.6 })
    tone(c, at + 0.5, { freq: 1244.5, peak: 0.06, decay: 1.4, slideTo: 1174.7 })
  },
  tick: (c, at) => {
    tone(c, at, { freq: 1500, type: "square", peak: 0.08, decay: 0.05 })
    burst(c, at, { type: "highpass", freq: 4000, peak: 0.15, decay: 0.02 })
  },
  lockin: (c, at) => {
    burst(c, at, { type: "bandpass", freq: 1800, q: 2, peak: 0.3, decay: 0.03 })
    tone(c, at + 0.015, { freq: 660, type: "triangle", peak: 0.22, decay: 0.16 })
    tone(c, at + 0.07, { freq: 990, type: "triangle", peak: 0.18, decay: 0.22 })
  },
  whoosh: (c, at) => {
    burst(c, at, { type: "bandpass", freq: 400, sweepTo: 3200, q: 0.9, peak: 0.45, decay: 0.55 })
    tone(c, at + 0.1, { freq: 220, type: "triangle", peak: 0.08, decay: 0.5, slideTo: 440 })
  },
  group: (c, at) => {
    ;[659.25, 830.61, 987.77].forEach((freq, i) => tone(c, at + i * 0.07, { freq, type: "triangle", peak: 0.22, decay: 0.4 }))
    clink(c, at + 0.22, 0.18)
  },
  lonewolf: (c, at) => {
    tone(c, at, { freq: 392, type: "triangle", peak: 0.2, decay: 0.5, slideTo: 523.25 })
    tone(c, at + 0.42, { freq: 523.25, type: "triangle", peak: 0.22, decay: 1.1, slideTo: 349.23 })
    tone(c, at + 0.42, { freq: 1046.5, peak: 0.04, decay: 0.9, slideTo: 698.46 })
  },
  roundEnd: (c, at) => {
    tone(c, at, { freq: 523.25, type: "triangle", peak: 0.24, decay: 0.3 })
    tone(c, at + 0.12, { freq: 783.99, type: "triangle", peak: 0.26, decay: 0.6 })
    burst(c, at + 0.12, { type: "highpass", freq: 5000, peak: 0.12, decay: 0.08 })
  },
  merge: (c, at) => {
    burst(c, at, { type: "lowpass", freq: 900, sweepTo: 2400, peak: 0.3, decay: 0.12 })
    tone(c, at + 0.04, { freq: 440, type: "triangle", peak: 0.2, decay: 0.18, slideTo: 660 })
    tone(c, at + 0.14, { freq: 880, type: "triangle", peak: 0.22, decay: 0.4 })
  },
  sync: (c, at) => {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => tone(c, at + i * 0.09, { freq, type: "triangle", peak: 0.22, decay: 0.9 }))
    tone(c, at + 0.45, { freq: 2093, peak: 0.05, decay: 1.4 })
    clink(c, at + 0.5, 0.25)
  },
  thunk: (c, at) => {
    tone(c, at, { freq: 150, type: "triangle", peak: 0.5, decay: 0.12, slideTo: 80 })
    burst(c, at, { type: "lowpass", freq: 600, peak: 0.45, decay: 0.07 })
  },
  accepted: (c, at) => {
    burst(c, at, { type: "lowpass", freq: 500, peak: 0.4, decay: 0.08 })
    ;[587.33, 739.99, 880, 1174.66].forEach((freq, i) => tone(c, at + 0.08 + i * 0.08, { freq, type: "triangle", peak: 0.24, decay: i === 3 ? 0.8 : 0.3 }))
  },
  rejected: (c, at) => {
    burst(c, at, { type: "lowpass", freq: 500, peak: 0.45, decay: 0.08 })
    tone(c, at + 0.06, { freq: 311.13, type: "sawtooth", peak: 0.12, decay: 0.3, slideTo: 277.18 })
    tone(c, at + 0.34, { freq: 233.08, type: "sawtooth", peak: 0.14, decay: 0.6, slideTo: 174.61 })
  },
  buzzer: (c, at) => {
    tone(c, at, { freq: 110, type: "square", peak: 0.16, decay: 0.75 })
    tone(c, at, { freq: 116.5, type: "sawtooth", peak: 0.12, decay: 0.75 })
  },
  snip: (c, at) => {
    burst(c, at, { type: "highpass", freq: 3800, peak: 0.55, decay: 0.035 })
    tone(c, at, { freq: 2400, type: "triangle", peak: 0.18, decay: 0.05, slideTo: 1400 })
    burst(c, at + 0.03, { type: "bandpass", freq: 1200, q: 2, peak: 0.25, decay: 0.06 })
  },
  keycap: (c, at) => {
    burst(c, at, { type: "bandpass", freq: 2200, q: 2.5, peak: 0.35, decay: 0.025 })
    tone(c, at + 0.01, { freq: 340, type: "triangle", peak: 0.2, decay: 0.06, slideTo: 260 })
  },
  toggle: (c, at) => {
    burst(c, at, { type: "highpass", freq: 3000, peak: 0.4, decay: 0.02 })
    tone(c, at + 0.012, { freq: 900, type: "square", peak: 0.06, decay: 0.03 })
    burst(c, at + 0.03, { type: "bandpass", freq: 1600, q: 3, peak: 0.25, decay: 0.03 })
  },
  beep: (c, at) => {
    tone(c, at, { freq: 1975.5, type: "square", peak: 0.035, decay: 0.07 })
  },
  chime: (c, at) => {
    tone(c, at, { freq: 1046.5, type: "triangle", peak: 0.22, decay: 0.5 })
    tone(c, at + 0.1, { freq: 1568, type: "triangle", peak: 0.22, decay: 0.8 })
    tone(c, at + 0.1, { freq: 3136, peak: 0.04, decay: 0.6 })
  },
  defuse: (c, at) => {
    tone(c, at, { freq: 880, type: "square", peak: 0.05, decay: 0.12 })
    tone(c, at + 0.18, { freq: 440, type: "triangle", peak: 0.18, decay: 0.5, slideTo: 330 })
    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(c, at + 0.6 + i * 0.12, { freq, type: "triangle", peak: 0.22, decay: i === 3 ? 1.2 : 0.4 }))
  },
  explode: (c, at) => {
    burst(c, at, { type: "lowpass", freq: 3000, sweepTo: 120, peak: 0.95, decay: 1.6 })
    burst(c, at + 0.02, { type: "bandpass", freq: 300, q: 0.6, peak: 0.6, decay: 2.2 })
    tone(c, at, { freq: 90, type: "triangle", peak: 0.7, decay: 1.4, slideTo: 28 })
    tone(c, at, { freq: 60, type: "sine", peak: 0.6, decay: 2, slideTo: 24 })
  },
}

/** Plays a sound after `delayMs`; silent while muted or before the first user interaction. */
export function playSound(name: SoundName, delayMs = 0) {
  if (muted || !unlocked || typeof window === "undefined") return
  const c = ensureContext()
  if (!c || !out || !noise) return
  SOUNDS[name](c, c.currentTime + 0.01 + Math.max(0, delayMs) / 1000)
}
