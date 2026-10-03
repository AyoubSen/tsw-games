import { useSyncExternalStore } from "react"

/** Table sound effects, synthesized with Web Audio so there are no files to load. */
export type SoundName = "deal" | "flip" | "chip" | "pot" | "dice" | "capture" | "turn" | "win"

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
}

/** Plays a sound after `delayMs`; silent while muted or before the first user interaction. */
export function playSound(name: SoundName, delayMs = 0) {
  if (muted || !unlocked || typeof window === "undefined") return
  const c = ensureContext()
  if (!c || !out || !noise) return
  SOUNDS[name](c, c.currentTime + 0.01 + Math.max(0, delayMs) / 1000)
}
