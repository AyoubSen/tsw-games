import { cn } from "@/lib/utils"
import { PartyAvatar } from "../party-shell/SeatRing"
import type { AnswerGroup, RoundSummary } from "../../../../party/sync-up"

/** The answer board in the middle of the table: card spreads, piles, highlights. */

export interface Board {
  left: number
  top: number
  width: number
  height: number
  cx: number
}

export interface CardSize {
  w: number
  h: number
}

/** Top-left corner and scale of a card. */
export interface Spot {
  x: number
  y: number
  k: number
  z: number
}

export interface PileRect {
  x: number
  y: number
  w: number
  h: number
  k: number
}

const GAP = 12
const PILE_HEAD = 22
const PILE_PAD = 6

export function cardSize(compact: boolean): CardSize {
  return compact ? { w: 96, h: 40 } : { w: 136, h: 50 }
}

/** Visible strip of each card under the next one in a pile. */
function cascade(card: CardSize) {
  return card.h < 46 ? 17 : 21
}

/** The pile's most common spelling. */
export function groupLabel(group: AnswerGroup) {
  const counts = new Map<string, number>()
  for (const answer of group.answers) counts.set(answer.text, (counts.get(answer.text) ?? 0) + 1)
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? group.id
}

/** Every distinct spelling in the pile, most common first. */
export function groupSpellings(group: AnswerGroup) {
  const label = groupLabel(group)
  return [label, ...new Set(group.answers.map((answer) => answer.text).filter((text) => text !== label))]
}

/** Face-up cards in flip order, laid out in as large a grid as fits. */
export function spreadLayout(ids: string[], board: Board, card: CardSize): Record<string, Spot> {
  const n = ids.length
  if (!n) return {}
  let best = { k: 0, cols: 1 }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const k = Math.min(1, (board.width - GAP * (cols - 1)) / (cols * card.w), (board.height - GAP * (rows - 1)) / (rows * card.h))
    if (k > best.k) best = { k, cols }
  }
  const k = Math.max(0.45, best.k)
  const { cols } = best
  const rows = Math.ceil(n / cols)
  const cw = card.w * k
  const ch = card.h * k
  const top = board.top + Math.max(0, (board.height - rows * ch - (rows - 1) * GAP) / 2)
  const spots: Record<string, Spot> = {}
  ids.forEach((id, i) => {
    const row = Math.floor(i / cols)
    const inRow = Math.min(cols, n - row * cols)
    const left = board.cx - (inRow * cw + (inRow - 1) * GAP) / 2
    spots[id] = { x: left + (i % cols) * (cw + GAP), y: top + row * (ch + GAP), k, z: i }
  })
  return spots
}

/**
 * Groups as cascaded piles, biggest first and biggest drawn largest, each row
 * built out from its centre. Shrinks to fit the board.
 */
export function pileLayout(groups: AnswerGroup[], board: Board, card: CardSize) {
  const max = Math.max(1, ...groups.map((group) => group.answers.length))
  const dy = cascade(card)
  const sizeOf = (n: number, s: number) => {
    const k = s * (n === max && n > 1 ? 1.12 : n === 1 ? 0.9 : 1)
    return { k, w: card.w * k + 2 * PILE_PAD * s, h: PILE_HEAD * s + card.h * k + (n - 1) * dy * k + PILE_PAD * s }
  }
  const build = (s: number) => {
    const gap = GAP * s
    const rows: Array<{ items: Array<{ group: AnswerGroup; size: ReturnType<typeof sizeOf> }>; w: number; h: number }> = []
    for (const group of groups) {
      const size = sizeOf(group.answers.length, s)
      let row = rows[rows.length - 1]
      if (!row || row.w + gap + size.w > board.width) {
        row = { items: [], w: -gap, h: 0 }
        rows.push(row)
      }
      row.items.push({ group, size })
      row.w += gap + size.w
      row.h = Math.max(row.h, size.h)
    }
    const total = rows.reduce((sum, row) => sum + row.h, 0) + gap * Math.max(0, rows.length - 1)
    return { rows, total, gap, s }
  }
  let out = build(1)
  for (let i = 0; i < 4 && out.total > board.height && out.s > 0.5; i++) {
    out = build(Math.max(0.5, out.s * Math.sqrt(board.height / out.total)))
  }

  const piles: Record<string, PileRect> = {}
  const spots: Record<string, Spot> = {}
  let y = board.top + Math.max(0, (board.height - out.total) / 2)
  for (const row of out.rows) {
    const items: typeof row.items = []
    row.items.forEach((item, i) => (i % 2 ? items.push(item) : items.unshift(item)))
    let x = board.cx - row.w / 2
    for (const { group, size } of items) {
      piles[group.id] = { x, y, w: size.w, h: size.h, k: size.k }
      group.answers.forEach((answer, i) => {
        spots[answer.playerId] = { x: x + PILE_PAD * out.s, y: y + PILE_HEAD * out.s + i * dy * size.k, k: size.k, z: i }
      })
      x += size.w + out.gap
    }
    y += row.h + out.gap
  }
  return { piles, spots }
}

export type CardTone = "plain" | "match" | "alone" | "perfect"

export function AnswerCard({ card, text, ownerId, ownerName, faceUp, tone = "plain", mine }: {
  card: CardSize
  text: string
  ownerId: string
  ownerName: string
  faceUp: boolean
  tone?: CardTone
  mine?: boolean
}) {
  const small = card.h < 46
  return (
    <div style={{ width: card.w, height: card.h, perspective: 700 }} title={faceUp ? `${ownerName}: ${text}` : undefined}>
      <div
        className="relative size-full transition-transform duration-[450ms] ease-out"
        style={{ transformStyle: "preserve-3d", transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)" }}
      >
        <div
          className={cn(
            "absolute inset-0 flex items-start gap-1.5 rounded-xl border bg-gradient-to-b from-[#fdfcf7] to-[#e3efeb] px-2 text-[#0d1f1d] shadow-[0_8px_22px_rgb(0_0_0/.45)] transition-[box-shadow,filter,border-color] duration-500",
            small ? "py-1" : "py-1.5",
            tone === "plain" && "border-white/40",
            tone === "match" && "border-teal-300 shadow-[0_0_0_2px_#5eead4,0_0_22px_rgb(94_234_212/.55)]",
            tone === "perfect" && "border-amber-300 shadow-[0_0_0_2px_#fcd34d,0_0_26px_rgb(252_211_77/.6)]",
            tone === "alone" && "border-rose-300/70 saturate-50 brightness-90",
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <PartyAvatar id={ownerId} name={ownerName} size={small ? 15 : 18} className={cn("mt-px ring-1", mine && "ring-[#0d1f1d]")} />
          <span className={cn("line-clamp-2 min-w-0 flex-1 break-words font-black leading-tight", small ? "text-[11px]" : "text-[13px]")}>{faceUp ? text : ""}</span>
        </div>
        <div
          className="absolute inset-0 grid place-items-center rounded-xl border border-teal-200/30 shadow-[0_8px_22px_rgb(0_0_0/.45)]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "repeating-linear-gradient(135deg, #0f766e 0 6px, #115e59 6px 12px)",
          }}
        >
          <span className="rounded-full bg-black/30 px-2 font-black tracking-widest text-teal-100/80" style={{ fontSize: small ? 11 : 13 }}>≈</span>
        </div>
      </div>
    </div>
  )
}

/** The two players who landed in the same matching group most often. */
export function soulmates(history: RoundSummary[]) {
  const counts = new Map<string, number>()
  for (const entry of history) {
    for (const group of entry.groups) {
      if (group.answers.length < 2) continue
      const ids = group.answers.map((answer) => answer.playerId).sort()
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = `${ids[i]}|${ids[j]}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  const best = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]
  if (!best) return null
  const [a, b] = best[0].split("|") as [string, string]
  return { a, b, count: best[1] }
}

/** The player whose answers matched nobody most often. */
export function wildcard(history: RoundSummary[]) {
  const counts = new Map<string, number>()
  for (const entry of history) {
    for (const group of entry.groups) {
      if (group.answers.length === 1) counts.set(group.answers[0]!.playerId, (counts.get(group.answers[0]!.playerId) ?? 0) + 1)
    }
  }
  const best = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]
  return best ? { id: best[0], count: best[1] } : null
}