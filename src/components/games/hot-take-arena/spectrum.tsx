import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HotTakePlayer, HotTakePosition, RoundSummary, VoteGroup } from "../../../../party/hot-take-arena"

/**
 * The 1–5 scale as a physical strip across the stage. The ramp is orange →
 * grey → purple (safe for the common colour-vision deficiencies), and every
 * spot also carries a glyph and a label so colour is never the only cue.
 */
export const POSITIONS: Record<HotTakePosition, { label: string; short: string; glyph: string; hex: string; ink: string }> = {
  1: { label: "Strongly disagree", short: "Hard no", glyph: "−−", hex: "#e66101", ink: "#1f0b00" },
  2: { label: "Disagree", short: "No", glyph: "−", hex: "#fdb863", ink: "#2a1800" },
  3: { label: "Neutral", short: "Meh", glyph: "○", hex: "#cfd2d6", ink: "#16181b" },
  4: { label: "Agree", short: "Yes", glyph: "+", hex: "#b2abd2", ink: "#17122b" },
  5: { label: "Strongly agree", short: "Hard yes", glyph: "++", hex: "#6c4cb8", ink: "#ffffff" },
}
export const POSITION_LIST: HotTakePosition[] = [1, 2, 3, 4, 5]

export interface SpectrumGeometry {
  left: number
  width: number
  /** Centre line of the bar. */
  y: number
  barH: number
  /** Landed avatar size. */
  tok: number
  /** Room above the bar for avatar stacks. */
  stackH: number
}

/** Where the `index`th of `count` avatars on `position` lands: centred rows growing up from the bar, squeezed to fit. */
export function slotOf(geometry: SpectrumGeometry, position: HotTakePosition, index: number, count: number) {
  const { left, width, y, barH, tok, stackH } = geometry
  const segW = width / 5
  const usable = Math.max(tok, segW - 8)
  const perRow = Math.max(1, Math.floor((usable - tok) / (tok * 0.62)) + 1)
  const rows = Math.ceil(count / perRow)
  const row = Math.floor(index / perRow)
  const inRow = Math.min(perRow, count - row * perRow)
  const stepX = inRow > 1 ? Math.min(tok + 4, (usable - tok) / (inRow - 1)) : 0
  const stepY = rows > 1 ? Math.min(tok + 4, Math.max(tok * 0.5, (stackH - tok) / (rows - 1))) : 0
  return {
    x: left + (position - 0.5) * segW + ((index % perRow) - (inRow - 1) / 2) * stepX,
    y: y - barH / 2 - 8 - tok / 2 - row * stepY,
  }
}

export interface SegmentMark {
  count: number
  points: number
  lone: boolean
  /** Order this spot lights up in during the score beat. */
  litOrder: number
}

export function Spectrum({ geometry, compact, interactive, choice, myPick, marks, lit, onChoose }: {
  geometry: SpectrumGeometry
  compact: boolean
  interactive: boolean
  /** Unsent local choice. */
  choice: HotTakePosition | null
  /** My locked vote, shown only to me. */
  myPick: HotTakePosition | null
  /** Per-spot results once the split is out. */
  marks: Partial<Record<HotTakePosition, SegmentMark>> | null
  /** Score beat or later: groups glow. */
  lit: boolean
  onChoose: (position: HotTakePosition) => void
}) {
  const { left, width, y, barH } = geometry
  return (
    <div className="absolute z-[6]" style={{ left, top: y - barH / 2, width }}>
      <div role={interactive ? "radiogroup" : undefined} aria-label="Your take" className="flex overflow-visible rounded-2xl shadow-[0_14px_40px_rgb(0_0_0/.5)]" style={{ height: barH }}>
        {POSITION_LIST.map((position) => {
          const meta = POSITIONS[position]
          const mark = marks?.[position]
          const selected = choice === position
          const mine = myPick === position
          const glow = lit && mark && mark.count > 0
          return (
            <button
              key={position}
              type="button"
              role={interactive ? "radio" : undefined}
              aria-checked={interactive ? selected : undefined}
              aria-label={meta.label}
              title={meta.label}
              disabled={!interactive}
              onClick={() => onChoose(position)}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center border-x border-black/15 transition-[transform,filter,box-shadow] duration-200 first:rounded-l-2xl last:rounded-r-2xl focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80",
                interactive && "cursor-pointer hover:z-10 hover:-translate-y-1 hover:brightness-110",
                !interactive && "cursor-default",
                selected && "z-10 -translate-y-1.5 ring-4 ring-white",
                lit && !glow && "brightness-[.55] saturate-50",
                glow && "party-glow z-[1]",
              )}
              style={{
                background: meta.hex,
                color: meta.ink,
                ["--glow" as string]: meta.hex,
                animationDelay: glow ? `${mark.litOrder * 260}ms` : undefined,
              }}
            >
              <span className={cn("font-black leading-none", compact ? "text-base" : "text-xl")} aria-hidden="true">{meta.glyph}</span>
              <span className={cn("mt-0.5 font-bold uppercase leading-none tracking-wide", compact ? "text-[9px]" : "text-[10px]")}>{meta.short}</span>
              {mine && (
                <span className="uno-tag absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-black shadow">
                  <Check className="size-2.5" /> You
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex text-[10px] font-semibold uppercase tracking-wide text-white/65">
        {marks
          ? POSITION_LIST.map((position) => {
            const mark = marks[position]
            return (
              <span key={position} className="flex flex-1 flex-col items-center gap-0.5 text-center">
                <span className="font-mono text-sm font-black text-white tabular-nums">{mark?.count ?? 0}</span>
                {lit && mark && mark.count > 0 && (
                  <span
                    className={cn("poker-tag rounded-full px-1.5 py-px text-[9px] font-black", mark.points ? "bg-emerald-400 text-emerald-950" : "bg-rose-500 text-white")}
                    style={{ animationDelay: `${mark.litOrder * 260 + 200}ms` }}
                  >
                    {mark.points ? `+${mark.points}` : compact ? "Solo" : "Lone wolf"}
                  </span>
                )}
              </span>
            )
          })
          : (
            <>
              <span className="flex-1">← {POSITIONS[1].label}</span>
              <span className="flex-1 text-right">{POSITIONS[5].label} →</span>
            </>
          )}
      </div>
    </div>
  )
}

export function marksOf(groups: VoteGroup[], order: HotTakePosition[]) {
  const marks: Partial<Record<HotTakePosition, SegmentMark>> = {}
  for (const group of groups) {
    marks[group.position] = { count: group.playerIds.length, points: group.points, lone: group.playerIds.length === 1, litOrder: Math.max(0, order.indexOf(group.position)) }
  }
  return marks
}

// ─── Match highlights ────────────────────────────────────────────────────

/** How evenly a round split: normalised entropy, 1 = as even as the votes allow. */
function evenness(entry: RoundSummary) {
  const n = entry.votes.length
  if (n < 2) return -1
  const entropy = entry.voteGroups.reduce((sum, group) => {
    const p = group.playerIds.length / n
    return sum - p * Math.log(p)
  }, 0)
  return entropy / Math.log(Math.min(5, n))
}

export function mostControversial(history: RoundSummary[]) {
  let best: { entry: RoundSummary; score: number } | null = null
  for (const entry of history) {
    const score = evenness(entry)
    if (score > 0 && (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && entry.votes.length > best.entry.votes.length))) {
      best = { entry, score }
    }
  }
  return best?.entry ?? null
}

/** The player who on average shared their spot with the biggest share of the room. */
export function hiveMind(history: RoundSummary[], players: Record<string, HotTakePlayer>) {
  const tally: Record<string, { share: number; rounds: number }> = {}
  for (const entry of history) {
    const n = entry.votes.length
    if (n < 2) continue
    for (const group of entry.voteGroups) {
      for (const id of group.playerIds) {
        const t = (tally[id] ??= { share: 0, rounds: 0 })
        t.share += (group.playerIds.length - 1) / (n - 1)
        t.rounds++
      }
    }
  }
  let best: { id: string; share: number; rounds: number } | null = null
  for (const [id, t] of Object.entries(tally)) {
    if (!players[id]) continue
    const share = t.share / t.rounds
    if (!best || share > best.share + 1e-9 || (Math.abs(share - best.share) < 1e-9 && t.rounds > best.rounds)) best = { id, share, rounds: t.rounds }
  }
  return best && best.share > 0 ? best : null
}

/** Five little columns: how many landed where, in the ramp colours, with the glyphs underneath. */
export function SplitChart({ entry, height = 40 }: { entry: RoundSummary; height?: number }) {
  const max = Math.max(1, ...entry.voteGroups.map((group) => group.playerIds.length))
  return (
    <div className="flex items-end gap-1" style={{ height: height + 30 }}>
      {POSITION_LIST.map((position) => {
        const group = entry.voteGroups.find((candidate) => candidate.position === position)
        const count = group?.playerIds.length ?? 0
        const meta = POSITIONS[position]
        return (
          <div key={position} className="flex flex-1 flex-col items-center" title={`${meta.label}: ${count}`}>
            <span className="font-mono text-[10px] font-bold text-white/80 tabular-nums">{count}</span>
            <span className="w-full rounded-t" style={{ height: Math.max(3, (count / max) * height), background: count ? meta.hex : "rgb(255 255 255 / .12)" }} />
            <span className="mt-0.5 text-[10px] font-black text-white/60" aria-hidden="true">{meta.glyph}</span>
          </div>
        )
      })}
    </div>
  )
}
