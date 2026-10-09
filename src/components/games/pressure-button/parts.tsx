import { Crosshair, Flame, Megaphone, MessageSquareText, SkipForward, ThumbsDown, ThumbsUp, X } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { PartyAvatar } from "../party-shell/SeatRing"
import { POINTS, type PressureButtonPlayer, type TurnOutcome, type TurnSummary } from "../../../../party/pressure-button"

/** Pieces of the Pressure Button table: the button cluster, countdown, answer card, thumbs, potato, sweep. */

export const HOT = "#f97316"
export const DANGER = "#ef4444"

function nameOf(players: Record<string, PressureButtonPlayer>, id: string | null, meId: string) {
  if (!id) return "Someone"
  return id === meId ? "You" : players[id]?.name ?? "Someone who left"
}

// ─── Button cluster ──────────────────────────────────────────────────────────

type ClusterKey = "answer" | "pass" | "pressure"

const CLUSTER: Record<ClusterKey, { label: string; icon: ReactNode; face: string; rim: string; text: string }> = {
  answer: { label: "Answer", icon: <MessageSquareText />, face: "from-emerald-300 to-emerald-500", rim: "#065f46", text: "text-emerald-950" },
  pass: { label: "Pass", icon: <SkipForward />, face: "from-slate-200 to-slate-400", rim: "#334155", text: "text-slate-900" },
  pressure: { label: "Pressure", icon: <Flame />, face: "from-amber-300 via-orange-500 to-red-600", rim: "#7f1d1d", text: "text-white" },
}

/** One chunky arcade button: a coloured cap on a dark rim that sinks when pressed. */
function BigButton({ kind, size, sub, armed, disabled, onClick }: { kind: ClusterKey; size: number; sub: string; armed?: boolean; disabled?: boolean; onClick?: () => void }) {
  const look = CLUSTER[kind]
  const depth = Math.round(size * 0.09)
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size + 16 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={armed}
        aria-label={`${look.label}: ${sub}`}
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:cursor-not-allowed"
        style={{ width: size, height: size + depth }}
      >
        {/* Rim. */}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: size, background: look.rim, boxShadow: "0 12px 26px rgb(0 0 0 / .6), inset 0 -4px 8px rgb(0 0 0 / .45)" }} />
        {/* Cap. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 top-0 grid place-items-center rounded-full bg-gradient-to-b font-black uppercase tracking-wider transition-transform duration-100",
            look.face,
            look.text,
            !disabled && "group-hover:brightness-110 group-active:translate-y-[var(--depth)]",
            armed && "translate-y-[var(--depth)] ring-4 ring-white/80",
            disabled && "saturate-[.35] brightness-75",
          )}
          style={{ height: size, ["--depth" as string]: `${depth}px`, boxShadow: "inset 0 6px 10px rgb(255 255 255 / .45), inset 0 -8px 14px rgb(0 0 0 / .25)" }}
        >
          <span className="flex flex-col items-center gap-0.5 [&_svg]:drop-shadow" style={{ fontSize: Math.max(10, size * 0.13) }}>
            <span className="[&_svg]:size-[1.9em]">{look.icon}</span>
            {look.label}
          </span>
        </span>
        {armed && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 animate-ping rounded-full border-4 border-amber-300/70" style={{ height: size }} />}
      </button>
      <span className={cn("text-center text-[11px] font-semibold leading-tight", disabled ? "text-white/40" : "text-white/75")}>{sub}</span>
    </div>
  )
}

export function ButtonCluster({ compact, passesLeft, targeting, watching, onAnswer, onPass, onPressure, onCancel }: {
  compact: boolean
  passesLeft: number
  targeting: boolean
  /** Someone else's turn: the cluster is shown dimmed for the room. */
  watching: boolean
  onAnswer: () => void
  onPass: () => void
  onPressure: () => void
  onCancel: () => void
}) {
  const size = compact ? 64 : watching ? 78 : 100
  return (
    <div className={cn("flex flex-col items-center", watching && "pointer-events-none opacity-60")}>
      <div className="flex items-end justify-center gap-1 sm:gap-4">
        <BigButton kind="answer" size={size} sub={`+${POINTS.selfAccepted} · ${POINTS.selfFailed} if rejected`} disabled={watching || targeting} onClick={onAnswer} />
        <BigButton kind="pressure" size={Math.round(size * 1.14)} sub={targeting ? "Tap a seat" : `They +${POINTS.pressuredAccepted} · you +${POINTS.pressureLanded}`} armed={targeting} disabled={watching} onClick={targeting ? onCancel : onPressure} />
        <BigButton kind="pass" size={size} sub={passesLeft > 0 ? `${passesLeft} left · 0 pts` : "No passes left"} disabled={watching || targeting || passesLeft <= 0} onClick={onPass} />
      </div>
      {targeting && (
        <button type="button" onClick={onCancel} className="uno-rise mt-2 flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white/80 hover:bg-black/75">
          <X className="size-3.5" /> Cancel pressure
        </button>
      )}
    </div>
  )
}

// ─── Countdown ───────────────────────────────────────────────────────────────

export function BigCountdown({ left, limit, size }: { left: number; limit: number; size: number }) {
  const r = 44
  const fraction = limit ? Math.min(1, left / limit) : 0
  const hot = left <= 5
  return (
    <span className={cn("relative grid shrink-0 place-items-center", hot && "animate-pulse")} style={{ width: size, height: size }} aria-label={`${left} seconds left`}>
      <span aria-hidden="true" className="absolute inset-[8%] rounded-full" style={{ background: "radial-gradient(circle, rgb(0 0 0 / .65), rgb(0 0 0 / .25))", boxShadow: hot ? `0 0 40px ${DANGER}aa` : `0 0 30px ${HOT}55` }} />
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={hot ? DANGER : "#fbbf24"}
          strokeDasharray={2 * Math.PI * r}
          strokeDashoffset={2 * Math.PI * r * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 250ms linear, stroke 300ms" }}
        />
      </svg>
      <span className={cn("relative font-mono font-black tabular-nums", hot ? "text-red-300" : "text-white")} style={{ fontSize: size * 0.36 }}>{left}</span>
    </span>
  )
}

// ─── Answer card ─────────────────────────────────────────────────────────────

export function AnswerCard({ width, height, faceUp, text, spoken, ownerId, ownerName, title, missing }: {
  width: number
  height: number
  faceUp: boolean
  text: string | null
  spoken: boolean
  ownerId: string
  ownerName: string
  /** Eyebrow on the face, e.g. "Sam's answer". */
  title: string
  /** Nothing to turn over (timed out or passed): a dashed placeholder instead. */
  missing?: string
}) {
  if (missing) {
    return (
      <div className="grid place-items-center rounded-3xl border-2 border-dashed border-white/25 bg-black/35 text-center backdrop-blur-sm" style={{ width, height }}>
        <div>
          <PartyAvatar id={ownerId} name={ownerName} size={28} className="mx-auto opacity-70" />
          <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-white/55">{missing}</p>
        </div>
      </div>
    )
  }
  return (
    <div style={{ width, height, perspective: 1000 }}>
      <div className="relative size-full transition-transform duration-700 ease-[cubic-bezier(.3,.7,.2,1)]" style={{ transformStyle: "preserve-3d", transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)" }}>
        {/* Front. */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-b from-[#fffaf0] to-[#f3e3c8] px-4 text-center text-[#20140c] shadow-[0_24px_60px_rgb(0_0_0/.55)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-[#20140c]/55">
            <PartyAvatar id={ownerId} name={ownerName} size={18} className="ring-1" />
            {title}
          </p>
          {text ? (
            <p className={cn("mt-1.5 font-black leading-tight tracking-tight text-balance", text.length > 60 ? "text-base" : "text-xl")}>“{text}”</p>
          ) : null}
          {spoken && (
            <span className={cn("inline-flex -rotate-6 items-center gap-1.5 rounded-lg border-[3px] border-orange-600 px-2 py-0.5 font-black uppercase tracking-wider text-orange-600", text ? "mt-1.5 text-[10px]" : "mt-2 text-lg")}>
              <Megaphone className={text ? "size-3" : "size-5"} /> Said it out loud
            </span>
          )}
        </div>
        {/* Back. */}
        <div
          className="absolute inset-0 grid place-items-center overflow-hidden rounded-3xl border border-orange-300/40 shadow-[0_24px_60px_rgb(0_0_0/.55)]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "repeating-linear-gradient(135deg, #b91c1c 0 14px, #9a1515 14px 28px)",
          }}
        >
          <span className="grid size-14 place-items-center rounded-full bg-gradient-to-b from-amber-300 to-orange-600 text-white shadow-[0_0_30px_rgb(251_146_60/.7)]">
            <Flame className="size-7" />
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Thumbs ──────────────────────────────────────────────────────────────────

/** One judge's vote on the card: face down until the tally turns it over. */
export function Thumb({ voterId, voterName, faceUp, accept, auto, size }: { voterId: string; voterName: string; faceUp: boolean; accept: boolean; auto: boolean; size: number }) {
  return (
    <div className="relative" style={{ width: size, height: size, perspective: 400 }} title={`${voterName}${faceUp ? (auto ? ": no vote (accept)" : accept ? ": accept" : ": reject") : ""}`}>
      <div className="relative size-full transition-transform duration-500" style={{ transformStyle: "preserve-3d", transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)" }}>
        <span
          className={cn(
            "absolute inset-0 grid place-items-center rounded-full border-2 shadow-lg",
            accept ? "border-emerald-200 bg-emerald-500 text-white" : "border-rose-200 bg-rose-600 text-white",
            auto && "border-dashed opacity-60",
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          {accept ? <ThumbsUp style={{ width: size * 0.5, height: size * 0.5 }} /> : <ThumbsDown style={{ width: size * 0.5, height: size * 0.5 }} />}
        </span>
        <span className="absolute inset-0 grid place-items-center rounded-full border-2 border-white/30 bg-[#2a0d0a] font-black text-white/60 shadow-lg" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", fontSize: size * 0.45 }}>
          ?
        </span>
      </div>
      <PartyAvatar id={voterId} name={voterName} size={Math.round(size * 0.5)} className="absolute -bottom-1 -right-1 ring-1" />
    </div>
  )
}

// ─── Result stamp ────────────────────────────────────────────────────────────

const STAMP: Record<TurnOutcome, { label: string; className: string }> = {
  accepted: { label: "Accepted", className: "border-emerald-400 bg-emerald-950/85 text-emerald-200 shadow-[0_0_40px_rgb(52_211_153/.45)]" },
  rejected: { label: "Rejected", className: "border-rose-500 bg-rose-950/85 text-rose-200 shadow-[0_0_40px_rgb(244_63_94/.45)]" },
  "timed-out": { label: "Timed out", className: "border-amber-400 bg-amber-950/85 text-amber-200 shadow-[0_0_40px_rgb(251_191_36/.45)]" },
  passed: { label: "Passed", className: "border-slate-300 bg-slate-900/85 text-slate-200" },
}

export function ResultStamp({ outcome, x, y, compact }: { outcome: TurnOutcome; x: number; y: number; compact: boolean }) {
  const look = STAMP[outcome]
  return (
    <span
      role="status"
      className={cn("party-stamp pointer-events-none absolute z-[28] whitespace-nowrap rounded-xl border-4 px-3 py-1 font-black uppercase tracking-[0.18em]", look.className)}
      style={{ left: x, top: y, fontSize: compact ? 20 : 30 }}
    >
      {look.label}
    </span>
  )
}

// ─── Hot potato and handoff sweep ────────────────────────────────────────────

export function HotPotato({ size, resting }: { size: number; resting: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid place-items-center rounded-full text-white", resting && "uno-bob")}
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 30%, #fff7ae 0%, #fbbf24 28%, #f97316 55%, #b91c1c 100%)",
        boxShadow: `0 0 18px 4px ${HOT}cc, 0 0 44px 10px ${DANGER}66`,
      }}
    >
      <Flame className="drop-shadow" style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  )
}

/** A light running clockwise round the ring from one seat to the next. */
export function HandoffSweep({ cx, cy, rx, ry, from, to }: { cx: number; cy: number; rx: number; ry: number; from: number; to: number }) {
  let span = to - from
  while (span <= 0) span += 2 * Math.PI
  const point = (angle: number) => `${cx + rx * Math.cos(angle)} ${cy + ry * Math.sin(angle)}`
  const d = `M ${point(from)} A ${rx} ${ry} 0 ${span > Math.PI ? 1 : 0} 1 ${point(from + span)}`
  const style = { "--sweep": "-100", animationDuration: "1100ms" } as CSSProperties
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[9] size-full overflow-visible">
      <path d={d} pathLength={100} fill="none" stroke={HOT} strokeWidth={2} className="uno-sweep-track" style={{ animationDuration: "1100ms" }} />
      <path d={d} pathLength={100} fill="none" stroke={HOT} strokeWidth={22} strokeOpacity={0.4} strokeLinecap="round" strokeDasharray="16 200" className="uno-sweep blur-[6px]" style={style} />
      <path d={d} pathLength={100} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeDasharray="16 200" className="uno-sweep drop-shadow-[0_0_8px_#fff]" style={style} />
    </svg>
  )
}

/** Clickable halo over a seat while the active player picks who to pressure. */
export function TargetHalo({ x, y, size, name, onPick }: { x: number; y: number; size: number; name: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Pressure ${name}`}
      className="group absolute z-[26] grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-none"
      style={{ left: x, top: y, width: size + 26, height: size + 26 }}
    >
      <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full border-2 border-orange-400/70" />
      <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-dashed border-orange-300 bg-orange-500/15 shadow-[0_0_26px_rgb(249_115_22/.6)] transition group-hover:scale-110 group-hover:bg-orange-500/30 group-focus-visible:scale-110 group-focus-visible:bg-orange-500/30" />
      <Crosshair className="relative size-5 text-orange-200 opacity-0 drop-shadow transition group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  )
}

/** Two dots under a seat: passes still in hand. */
export function PassPips({ left, total }: { left: number; total: number }) {
  return (
    <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-black/70 px-1 py-0.5" aria-label={`${left} passes left`} title={`${left} passes left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i < left ? "bg-sky-300" : "bg-white/20")} />
      ))}
    </span>
  )
}

// ─── Log and highlights ──────────────────────────────────────────────────────

const OUTCOME_TEXT: Record<TurnOutcome, { label: string; className: string }> = {
  accepted: { label: "Accepted", className: "text-emerald-300" },
  rejected: { label: "Rejected", className: "text-rose-300" },
  "timed-out": { label: "Timed out", className: "text-amber-300" },
  passed: { label: "Passed", className: "text-white/55" },
}

export function TurnLogEntry({ entry, players, meId }: { entry: TurnSummary; players: Record<string, PressureButtonPlayer>; meId: string }) {
  const active = nameOf(players, entry.activePlayerId, meId)
  const responder = nameOf(players, entry.responderId, meId)
  const accepts = entry.voterIds.filter((id) => entry.votes[id] !== false).length
  const rejects = entry.voterIds.length - accepts
  const outcome = OUTCOME_TEXT[entry.outcome]
  const deltas = Object.entries(entry.scoreChanges)
  return (
    <li className="rounded-xl border border-white/10 bg-white/[.04] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Turn {entry.turnNumber}</p>
      <p className="mt-1 text-sm font-semibold leading-snug">“{entry.prompt.text}”</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-white/75">
        {entry.mode === "pressure" ? <Flame className="size-3.5 shrink-0 text-orange-300" /> : entry.mode === "pass" ? <SkipForward className="size-3.5 shrink-0 text-white/50" /> : <MessageSquareText className="size-3.5 shrink-0 text-emerald-300" />}
        {entry.mode === "pressure" ? <span><b>{active}</b> pressured <b>{responder}</b></span> : entry.mode === "pass" ? <span><b>{active}</b> passed</span> : <span><b>{active}</b> answered</span>}
      </p>
      {entry.answer && (
        <p className="mt-1.5 rounded-lg bg-black/30 px-2 py-1.5 text-xs text-white/85">
          {entry.answer.text ? `“${entry.answer.text}”` : null}
          {entry.answer.spoken && <span className={cn("inline-flex items-center gap-1 text-orange-200", entry.answer.text && "ml-1.5 text-[10px]")}><Megaphone className="size-3" />said it out loud</span>}
        </p>
      )}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={cn("font-black uppercase tracking-wide", outcome.className)}>{outcome.label}</span>
        {(entry.outcome === "accepted" || entry.outcome === "rejected") && entry.voterIds.length > 0 && (
          <span className="flex items-center gap-1 text-white/55">
            <ThumbsUp className="size-3" />{accepts}
            <ThumbsDown className="ml-1 size-3" />{rejects}
          </span>
        )}
        {deltas.map(([id, delta]) => (
          <span key={id} className={cn("font-bold", delta > 0 ? "text-emerald-300" : "text-rose-300")}>
            {nameOf(players, id, meId)} {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
          </span>
        ))}
      </p>
    </li>
  )
}

/** Most turns won by pressuring someone into a rejection or a timeout. */
export function pressureKing(history: TurnSummary[]) {
  return topCount(history.filter((entry) => entry.mode === "pressure" && entry.pressuredById && entry.outcome !== "accepted").map((entry) => entry.pressuredById!))
}

/** Most answers accepted while under pressure. */
export function clutchPlayer(history: TurnSummary[]) {
  return topCount(history.filter((entry) => entry.mode === "pressure" && entry.responderId && entry.outcome === "accepted").map((entry) => entry.responderId!))
}

function topCount(ids: string[]) {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const best = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]
  return best ? { id: best[0], count: best[1] } : null
}
