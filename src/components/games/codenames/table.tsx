import { Check, Eye, Minus, Plus, Send, Skull, X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import { playSound, type SoundName } from "@/lib/sounds"
import { cn } from "@/lib/utils"
import { PACE_MS, type CardType, type LoggedGuess, type Pending, type Team } from "../../../../party/codenames"
import type { PublicSpectator } from "../../../../party/shared/spectators"

/** Shared pieces of the Codenames table: word cards, paced overlays, clue log. */

export const GLASS = "rounded-2xl border border-white/10 bg-black/45 shadow-2xl backdrop-blur-md"
export const TABLE_BG = "radial-gradient(ellipse at 50% 38%, #1d2b3b 0%, #101923 55%, #070b11 100%)"
/** The card turn inside a server flip beat (PACE_MS.flip and up). */
export const FLIP_MS = 650
export const KEY_FLIP_STAGGER = 45
/** Game over: every hidden card turns, then the result panel shows. */
export const KEY_FLIP_TOTAL = 24 * KEY_FLIP_STAGGER + FLIP_MS + 400

export const TEAM = {
  red: { name: "Red", hex: "#f0505a" },
  blue: { name: "Blue", hex: "#3f8cff" },
} as const
export const DUET_HEX = "#35c97b"
export const NEUTRAL_HEX = "#d6c194"
export const ASSASSIN_HEX = "#141416"

export type CardFace = CardType | "green"

export const otherTeam = (team: Team): Team => (team === "red" ? "blue" : "red")

const FACE: Record<CardFace, { bg: string; pattern?: string; ink: string; label: string; hex: string }> = {
  red: {
    bg: "linear-gradient(160deg,#ea5a62 0%,#b72d37 55%,#7c1820 100%)",
    pattern: "repeating-linear-gradient(135deg,rgba(255,255,255,.1) 0 5px,transparent 5px 11px)",
    ink: "rgba(45,6,10,.6)", label: "Red agent", hex: TEAM.red.hex,
  },
  blue: {
    bg: "linear-gradient(160deg,#559bff 0%,#2762c6 55%,#14377f 100%)",
    pattern: "radial-gradient(rgba(255,255,255,.16) 1.4px,transparent 1.7px) 0 0/9px 9px",
    ink: "rgba(6,18,50,.6)", label: "Blue agent", hex: TEAM.blue.hex,
  },
  green: {
    bg: "linear-gradient(160deg,#4cd58a 0%,#25985c 55%,#13603a 100%)",
    pattern: "repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 3px,transparent 3px 9px)",
    ink: "rgba(4,40,20,.55)", label: "Agent", hex: DUET_HEX,
  },
  neutral: {
    bg: "linear-gradient(160deg,#ecdfbf 0%,#cfba8d 60%,#a99262 100%)",
    ink: "rgba(80,60,24,.45)", label: "Bystander", hex: NEUTRAL_HEX,
  },
  assassin: {
    bg: "radial-gradient(circle at 50% 35%,#3c3c43 0%,#17171a 60%,#050506 100%)",
    ink: "rgba(255,255,255,.88)", label: "Assassin", hex: ASSASSIN_HEX,
  },
}

export const faceLabel = (face: CardFace) => FACE[face].label
export const faceHex = (face: CardFace) => FACE[face].hex

// ─── Hooks ────────────────────────────────────────────────────────────────

export function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(timer)
  }, [active, every])
  return now
}

/**
 * Milliseconds since this client first rendered `key`, re-rendering once at
 * `until`. Lets the table freeze what it shows while an animation plays,
 * computed during render so the frame that brings new state is already right.
 */
export function useBeatElapsed(key: string | null, until: number) {
  const seen = useRef<{ key: string | null; at: number }>({ key: null, at: 0 })
  if (seen.current.key !== key) seen.current = { key, at: Date.now() }
  const elapsed = key ? Date.now() - seen.current.at : Infinity
  const [, rerender] = useState(0)
  const done = elapsed >= until
  useEffect(() => {
    if (!key || done) return
    const timer = window.setTimeout(() => rerender((n) => n + 1), Math.max(0, until - elapsed) + 20)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, until, done])
  return elapsed
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setSize({ w: element.clientWidth, h: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/** One sound per paced beat; nothing on first render so a reconnect stays quiet. */
export function usePaceSounds(pending: Pending | null, finaleKey: string | null, finale: SoundName | null) {
  const key = pending ? `${pending.kind}:${pending.seq}:${pending.kind === "guess" ? pending.stage : ""}` : finaleKey
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!key) return
    if (!pending) {
      if (finale) playSound(finale, KEY_FLIP_TOTAL - 500)
      return
    }
    if (pending.kind === "clue") playSound("clue")
    else if (pending.kind === "handoff") playSound("turn")
    else if (pending.stage === "tension") {
      playSound("knock")
      playSound("knock", 420)
    } else {
      playSound("flip")
      playSound(pending.result === "correct" ? "correct" : pending.result === "assassin" ? "assassin" : "wrong", FLIP_MS - 150)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

// ─── Board ────────────────────────────────────────────────────────────────

export function boardMetrics(w: number, h: number) {
  const gap = Math.max(4, Math.min(12, w * 0.011))
  const aspect = w / Math.max(h, 1) < 1.05 ? 1.12 : 1.5
  const cardW = Math.max(40, Math.min((w - 4 * gap) / 5, ((h - 4 * gap) / 5) * aspect))
  return { gap, w: cardW, h: cardW / aspect }
}

function wordFont(word: string, w: number) {
  // Phone-sized cards get a bigger cap for short words and a tighter fit for long ones.
  const [cap, fit] = w < 100 ? [0.16, 1.15] : [0.13, 1.5]
  return Math.max(8, Math.min(w * cap, (w * fit) / Math.max(word.length, 4)))
}

export function hueOf(id: string) {
  let value = 7
  for (const char of id) value = (value * 31 + char.charCodeAt(0)) | 0
  return Math.abs(value) % 360
}

export function Avatar({ id, name, size = 28, className, style }: { id: string; name: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-full font-black text-white shadow", className)}
      style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hueOf(id)} 55% 42%)`, ...style }}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  )
}

/** Shape as well as colour, so the teams read apart for colourblind players: red diamond, blue circle. */
export function TeamMark({ team, className }: { team: Team; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 bg-current", team === "red" ? "rotate-45 rounded-[2px]" : "rounded-full", className)}
    />
  )
}

function FaceSymbol({ face, size }: { face: CardFace; size: number }) {
  if (face === "red" || face === "blue") return <TeamMark team={face} className="bg-white" />
  if (face === "green") return <Check style={{ width: size, height: size }} strokeWidth={3.5} />
  if (face === "assassin") return <Skull style={{ width: size, height: size }} />
  return null
}

function AgentGlyph({ face, size }: { face: CardFace; size: number }) {
  if (face === "assassin") {
    return <Skull style={{ width: size * 0.8, height: size * 0.8 }} className="text-white/90 drop-shadow-[0_0_12px_rgba(255,70,70,.55)]" />
  }
  const hat = face !== "neutral"
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill={FACE[face].ink} aria-hidden="true">
      {hat && <path d="M10 29.5c0-2.6 9.8-4.6 22-4.6s22 2 22 4.6c0 1.6-4.4 2.8-10.4 3.2H20.4C14.4 32.3 10 31.1 10 29.5z" />}
      {hat && <path d="M21.2 27.2c.9-7.8 4.5-12.8 10.8-12.8s9.9 5 10.8 12.8z" />}
      <circle cx="32" cy={hat ? 39.5 : 30} r={hat ? 7.5 : 9.5} />
      <path d={hat ? "M11 63c1.3-9.8 9.4-15.2 21-15.2S51.7 53.2 53 63z" : "M12 63c1.3-11.2 9.4-17.4 20-17.4S50.7 51.8 52 63z"} />
      {hat && <path d="M27 48l5 8 5-8z" fill="rgba(255,255,255,.18)" />}
    </svg>
  )
}

/** Subtle spymaster key: a tinted edge and a corner tab, never a solid fill. */
function KeyMark({ face }: { face: CardFace }) {
  if (face === "neutral") return null
  const hex = FACE[face].hex
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[9px]"
        style={{ boxShadow: `inset 0 0 0 2.5px ${hex}d0`, background: `linear-gradient(to top, ${hex}30, transparent 60%)` }}
      />
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 grid place-items-center rounded-br-[8px] rounded-tl-[9px] text-white"
        style={{ background: hex, width: "max(16px, 15%)", height: "max(16px, 22%)" }}
      >
        <FaceSymbol face={face} size={10} />
      </span>
    </>
  )
}

export interface WordCardProps {
  word: string
  w: number
  h: number
  /** What the other side shows; null keeps the word side up. */
  back: CardFace | null
  flipped: boolean
  flipDelay?: number
  /** Turned during play: stays readable but reads as spent. */
  used?: boolean
  mark?: CardFace | null
  /** The tension beat before a flip. */
  locked?: boolean
  lockedBy?: string
  dim?: boolean
  mine?: string | null
  chips?: { id: string; name: string }[]
  corner?: ReactNode
  disabled: boolean
  label: string
  onClick?: () => void
}

export function WordCard(props: WordCardProps) {
  const { word, w, h, back, flipped, flipDelay = 0, used, mark, locked, dim, mine, chips, corner, disabled, label, onClick } = props
  const font = wordFont(word, w)
  const face = back ? FACE[back] : null
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={mine ? true : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative rounded-[9px] [perspective:900px] transition-[transform,opacity,filter] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-default",
        !disabled && !mine && "cursor-pointer hover:-translate-y-0.5 hover:brightness-105",
        dim && "opacity-40 saturate-50",
        locked && "cn-lock z-10",
      )}
      style={{ width: w, height: h, transform: mine && !locked ? "translateY(-3px)" : undefined }}
    >
      <span
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "none", transition: `transform ${FLIP_MS}ms cubic-bezier(.3,.7,.2,1) ${flipDelay}ms` }}
      >
        {/* Word side */}
        <span
          className="absolute inset-0 overflow-hidden rounded-[9px] [backface-visibility:hidden]"
          style={{
            background: "linear-gradient(170deg,#f7efdb 0%,#e5d4ae 100%)",
            boxShadow: "inset 0 0 0 1px rgba(120,95,50,.35), 0 2px 0 #9a845b, 0 7px 16px rgba(0,0,0,.45)",
          }}
        >
          <span className="absolute inset-[5%] rounded-[6px] border border-[#b39a69]/50" />
          <span
            className="absolute inset-x-[8%] top-[13%] rotate-180 truncate text-center font-bold uppercase tracking-wide text-[#6b5a3a]/35"
            style={{ fontSize: font * 0.62 }}
          >
            {word}
          </span>
          <span className="absolute inset-x-[8%] bottom-[11%] grid h-[40%] place-items-center rounded-[4px] bg-[#fdfaf2] shadow-[inset_0_1px_2px_rgba(0,0,0,.14)]">
            <span className="whitespace-nowrap font-black uppercase leading-none tracking-wide text-[#28221a]" style={{ fontSize: font }}>
              {word}
            </span>
          </span>
          {mark && <KeyMark face={mark} />}
        </span>
        {/* Agent side */}
        {face && back && (
          <span
            className="absolute inset-0 overflow-hidden rounded-[9px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{ background: face.bg, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16), 0 2px 0 rgba(0,0,0,.45), 0 7px 16px rgba(0,0,0,.45)" }}
          >
            {face.pattern && <span className="absolute inset-0" style={{ background: face.pattern }} />}
            <span className="absolute inset-0 grid place-items-center pb-[20%]">
              <AgentGlyph face={back} size={h * 0.56} />
            </span>
            <span className={cn("absolute left-[6%] top-[8%]", back === "neutral" ? "text-[#5c4a26]/60" : "text-white/85")}>
              <FaceSymbol face={back} size={Math.max(10, h * 0.14)} />
            </span>
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 truncate px-1 py-[3%] text-center font-bold uppercase leading-tight tracking-wide",
                back === "neutral" ? "bg-[#5c4a26]/20 text-[#3b2f17]" : "bg-black/35 text-white/90",
              )}
              style={{ fontSize: Math.max(8, font * 0.72) }}
            >
              {word}
            </span>
            {used && <span className="absolute inset-0 bg-black/15" />}
          </span>
        )}
      </span>
      {mine && !flipped && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[3px] rounded-[11px]"
          style={{ boxShadow: `0 0 0 3px ${mine}, 0 0 22px ${mine}` }}
        />
      )}
      {locked && (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-[4px] rounded-[12px] shadow-[0_0_0_3px_#fff,0_0_34px_8px_rgba(255,255,255,.55)]" />
      )}
      {locked && props.lockedBy && (
        <span className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#141416] shadow-lg">
          {props.lockedBy}
        </span>
      )}
      {!flipped && chips && chips.length > 0 && (
        <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex -space-x-1.5">
          {chips.map((chip) => (
            <span key={chip.id} title={`${chip.name} is considering this`}>
              <Avatar id={chip.id} name={chip.name} size={Math.max(16, Math.min(22, h * 0.24))} className="ring-2 ring-[#f3ead3]" />
            </span>
          ))}
        </span>
      )}
      {corner}
    </button>
  )
}

export function BoardGrid({ size, children }: { size: { w: number; h: number }; children: (metrics: ReturnType<typeof boardMetrics>) => ReactNode }) {
  if (!size.w || !size.h) return null
  const metrics = boardMetrics(size.w, size.h)
  return (
    <div className="grid grid-cols-5" style={{ gap: metrics.gap }}>
      {children(metrics)}
    </div>
  )
}

// ─── Overlays ─────────────────────────────────────────────────────────────

export function ClueAnnouncement({ pending, hex, subtitle }: { pending: Extract<Pending, { kind: "clue" }>; hex: string; subtitle: string }) {
  return (
    <div key={pending.seq} role="status" className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-4">
      <div
        className="cn-announce flex max-w-full flex-col items-center gap-3 rounded-3xl border border-white/15 bg-black/75 px-8 py-6 text-center backdrop-blur-md sm:px-12 sm:py-8"
        style={{ boxShadow: `0 0 70px ${hex}66, 0 24px 60px rgba(0,0,0,.6)`, animationDuration: `${PACE_MS.clue}ms` }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[.3em] text-white/60">{subtitle}</p>
        <div className="flex max-w-full items-center gap-4">
          <span className="break-all text-4xl font-black uppercase tracking-wide text-white sm:text-7xl">{pending.word}</span>
          <span
            className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl font-black text-white shadow-lg sm:size-20 sm:text-5xl"
            style={{ background: hex }}
          >
            {pending.count === 0 ? "∞" : pending.count}
          </span>
        </div>
      </div>
    </div>
  )
}

export function HandoffSweep({ seq, hex, toRight, title, subtitle }: { seq: number; hex: string; toRight: boolean; title: string; subtitle: string }) {
  return (
    <div key={seq} role="status" className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <div
        className="cn-sweep absolute inset-y-0 left-0 w-[70%]"
        style={{
          background: `linear-gradient(90deg, transparent, ${hex}40 35%, ${hex}80 50%, ${hex}40 65%, transparent)`,
          ["--from" as string]: toRight ? "-100%" : "150%",
          ["--to" as string]: toRight ? "150%" : "-100%",
          animationDuration: `${Math.round(PACE_MS.handoff * 0.8)}ms`,
        }}
      />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="cn-handoff text-center" style={{ ["--dx" as string]: toRight ? "-40px" : "40px", animationDuration: `${PACE_MS.handoff}ms` }}>
          <p className="text-4xl font-black uppercase tracking-[.14em] sm:text-6xl" style={{ color: hex, textShadow: `0 0 34px ${hex}aa, 0 2px 0 rgba(0,0,0,.5)` }}>
            {title}
          </p>
          <p className="mt-1 text-sm font-semibold text-white/85 drop-shadow">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}

export function AssassinOverlay({ seq, title, subtitle }: { seq: number; title: string; subtitle: string }) {
  return (
    <div
      key={seq}
      role="alert"
      className="cn-assassin pointer-events-none absolute inset-0 z-40 grid place-items-center p-4"
      style={{ animationDelay: `${FLIP_MS - 100}ms`, background: "radial-gradient(circle at 50% 45%, rgba(60,0,0,.35) 0%, rgba(0,0,0,.93) 70%)" }}
    >
      <div className="text-center">
        <Skull className="mafia-pop mx-auto size-24 text-white drop-shadow-[0_0_30px_rgba(255,40,40,.75)] sm:size-32" style={{ ["--d" as string]: `${FLIP_MS + 200}ms` }} />
        <p className="mafia-late mt-4 text-5xl font-black uppercase tracking-[.25em] text-white sm:text-7xl" style={{ ["--d" as string]: `${FLIP_MS + 500}ms` }}>
          {title}
        </p>
        <p className="mafia-late mt-2 text-sm font-semibold uppercase tracking-widest text-red-300" style={{ ["--d" as string]: `${FLIP_MS + 900}ms` }}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}

export function ResultToast({ seq, title, subtitle, hex, good }: { seq: number; title: string; subtitle?: string; hex: string; good: boolean }) {
  return (
    <div key={seq} role="status" className="pointer-events-none absolute inset-x-0 top-1 z-30 flex justify-center px-4">
      <div
        className="mafia-pop rounded-2xl border border-white/15 bg-black/80 px-5 py-2.5 text-center shadow-2xl backdrop-blur-md"
        style={{ ["--d" as string]: `${FLIP_MS - 80}ms`, boxShadow: `0 0 40px ${hex}66` }}
      >
        <p className="flex items-center justify-center gap-2 text-xl font-black uppercase tracking-wide sm:text-2xl" style={{ color: hex === NEUTRAL_HEX ? "#ecdcb4" : hex }}>
          {good ? <Check className="size-6" strokeWidth={3} /> : <X className="size-6" strokeWidth={3} />}
          {title}
        </p>
        {subtitle && <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">{subtitle}</p>}
      </div>
    </div>
  )
}

export function Confetti({ colors }: { colors: string[] }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="uno-confetti absolute top-0 block h-3 w-1.5 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            ["--fall" as string]: `${2.6 + ((i * 13) % 20) / 10}s`,
            ["--delay" as string]: `${((i * 7) % 30) / 10}s`,
            ["--drift" as string]: `${((i * 17) % 80) - 40}px`,
            ["--spin" as string]: `${360 + ((i * 53) % 360)}deg`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Controls ─────────────────────────────────────────────────────────────

export function Countdown({ deadline, limit }: { deadline: number | null; limit: number }) {
  const now = useNow(Boolean(deadline))
  const left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null
  useEffect(() => {
    if (left !== null && left > 0 && left <= 5) playSound("tick")
  }, [left])
  if (left === null || !limit) return null
  const fraction = Math.min(1, left / limit)
  const hot = left <= 5
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center", hot && "animate-pulse")} aria-label={`${left} seconds left`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={hot ? "#f87171" : "#fbbf24"}
          strokeDasharray={2 * Math.PI * 15}
          strokeDashoffset={2 * Math.PI * 15 * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className={cn("font-mono text-sm font-black tabular-nums", hot ? "text-red-300" : "text-white")}>{left}</span>
    </span>
  )
}

export function ClueComposer({ hex, min, max, disabled, validate, hint, onSubmit }: {
  hex: string
  min: number
  max: number
  disabled?: boolean
  validate: (word: string) => boolean
  hint: string
  onSubmit: (word: string, count: number) => void
}) {
  const [word, setWord] = useState("")
  const [count, setCount] = useState(Math.min(Math.max(1, min), max))
  const valid = validate(word.trim()) && count >= min && count <= max
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (disabled || !valid) return
    onSubmit(word.trim(), count)
  }
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-1.5">
      <div className="flex w-full items-center gap-2">
        <input
          aria-label="One-word clue"
          value={word}
          onChange={(event) => setWord(event.target.value.toUpperCase())}
          maxLength={30}
          placeholder="ONE-WORD CLUE"
          autoComplete="off"
          autoFocus
          disabled={disabled}
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 font-black uppercase tracking-wider text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
        />
        <div className="flex h-11 items-center rounded-xl border border-white/15 bg-white/10" role="group" aria-label="Number of cards">
          <button type="button" aria-label="Fewer" disabled={disabled || count <= min} onClick={() => setCount((value) => Math.max(min, value - 1))} className="grid h-full w-8 place-items-center text-white/80 disabled:opacity-30">
            <Minus className="size-4" />
          </button>
          <span className="w-7 text-center font-mono text-lg font-black tabular-nums" aria-live="polite">{count === 0 ? "∞" : count}</span>
          <button type="button" aria-label="More" disabled={disabled || count >= max} onClick={() => setCount((value) => Math.min(max, value + 1))} className="grid h-full w-8 place-items-center text-white/80 disabled:opacity-30">
            <Plus className="size-4" />
          </button>
        </div>
        <button
          type="submit"
          disabled={disabled || !valid}
          className="flex h-11 items-center gap-1.5 rounded-xl px-4 font-black uppercase tracking-wide text-white shadow-lg transition disabled:opacity-40"
          style={{ background: hex }}
        >
          <Send className="size-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
      <p className="text-center text-[11px] text-white/50">{hint}</p>
    </form>
  )
}

export function BarButton({ children, onClick, disabled, hex, className, ariaPressed }: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  hex?: string
  className?: string
  ariaPressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
      className={cn(
        "flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40",
        hex ? "text-white shadow-lg hover:brightness-110" : "border border-white/15 bg-white/10 text-white hover:bg-white/15",
        className,
      )}
      style={hex ? { background: hex } : undefined}
    >
      {children}
    </button>
  )
}

// ─── Clue log ─────────────────────────────────────────────────────────────

export interface LogGroup {
  key: string
  word: string
  count: number
  givenBy: string
  hex: string
  team?: Team
  guesses: LoggedGuess[]
  live: boolean
}

export function ClueLog({ groups, words, faceOf, empty }: {
  groups: LogGroup[]
  words: string[]
  faceOf: (guess: LoggedGuess, group: LogGroup) => CardFace
  empty: string
}) {
  if (groups.length === 0) return <p className="text-xs text-white/45">{empty}</p>
  return (
    <ol className="space-y-2.5">
      {groups.map((group) => (
        <li key={group.key} className="rounded-xl border border-white/10 bg-white/[.04] p-2.5" style={group.live ? { borderColor: `${group.hex}88` } : undefined}>
          <div className="flex items-baseline gap-2">
            {group.team && <TeamMark team={group.team} className="self-center" />}
            <span className="min-w-0 break-all text-sm font-black uppercase tracking-wide" style={{ color: group.hex }}>{group.word}</span>
            <span className="font-mono text-sm font-black text-white/80">{group.count === 0 ? "∞" : group.count}</span>
            <span className="ml-auto truncate text-[10px] text-white/45">{group.givenBy}</span>
          </div>
          {group.guesses.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {group.guesses.map((guess, index) => {
                const face = faceOf(guess, group)
                return (
                  <li
                    key={index}
                    title={`${guess.by}: ${faceLabel(face)}`}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide",
                      face === "neutral" ? "text-[#3b2f17]" : "text-white",
                    )}
                    style={{ background: FACE[face].bg }}
                  >
                    <FaceSymbol face={face} size={10} />
                    {words[guess.index] ?? "?"}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-1 text-[10px] text-white/40">{group.live ? "Guessing…" : "No guesses"}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

// ─── Spectators ───────────────────────────────────────────────────────────

export function SpectatorSeats({ spectators, canSeat, seatsLeft, onSeat, light }: {
  spectators: PublicSpectator[]
  canSeat: boolean
  seatsLeft: number
  onSeat: (id: string) => void
  light?: boolean
}) {
  if (spectators.length === 0) return null
  return (
    <div className={cn("rounded-xl border p-3 text-left", light ? "bg-muted/40" : "border-white/10 bg-white/5")}>
      <p className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest", light ? "text-muted-foreground" : "text-white/60")}>
        <Eye className="size-3.5" /> Watching ({spectators.length})
      </p>
      <ul className="mt-2 space-y-1.5">
        {spectators.map((spectator) => (
          <li key={spectator.id} className="flex items-center gap-2">
            <Avatar id={spectator.id} name={spectator.name} size={24} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{spectator.name}</span>
            {canSeat && (
              <button
                type="button"
                disabled={seatsLeft <= 0}
                onClick={() => onSeat(spectator.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold disabled:opacity-40",
                  light ? "bg-primary text-primary-foreground" : "bg-white/15 text-white hover:bg-white/25",
                )}
              >
                {seatsLeft > 0 ? "Seat" : "Full"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
