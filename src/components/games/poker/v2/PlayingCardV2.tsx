import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

const RANK_LABEL = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
const RED = "#c8102e"
const INK = "#16161d"

/** Clubs, diamonds, hearts, spades — the server's suit order. */
const SUIT_PATHS: string[] = [
  "M50 6c11 0 20 9 20 20 0 4-1 8-3 11 2-1 5-1 7-1 11 0 20 9 20 20s-9 20-20 20c-8 0-15-5-18-11 1 11 5 19 12 25H32c7-6 11-14 12-25-3 6-10 11-18 11C15 76 6 67 6 56s9-20 20-20c2 0 5 0 7 1-2-3-3-7-3-11 0-11 9-20 20-20Z",
  "M50 3c8 16 22 33 38 47-16 14-30 31-38 47-8-16-22-33-38-47C28 36 42 19 50 3Z",
  "M50 92C24 72 5 55 5 33 5 18 16 7 30 7c9 0 16 5 20 12 4-7 11-12 20-12 14 0 25 11 25 26 0 22-19 39-45 59Z",
  "M50 5c13 19 45 33 45 56 0 13-10 22-22 22-8 0-15-4-19-10 1 10 5 17 12 23H34c7-6 11-13 12-23-4 6-11 10-19 10C15 83 5 74 5 61 5 38 37 24 50 5Z",
]

export function SuitIcon({ suit, className, style }: { suit: number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <path d={SUIT_PATHS[suit]} fill="currentColor" />
    </svg>
  )
}

export const cardRankLabel = (card: number) => RANK_LABEL[card % 13]
export const cardSuitOf = (card: number) => Math.floor(card / 13)
export const isRedCard = (card: number) => cardSuitOf(card) === 1 || cardSuitOf(card) === 2

type CardSize = "xs" | "sm" | "md" | "lg"
const SIZE_WIDTH: Record<CardSize, number> = { xs: 28, sm: 36, md: 48, lg: 68 }

interface PlayingCardProps {
  card: number | null
  faceDown?: boolean
  size?: CardSize
  /** Exact width in px; overrides `size`. Height follows at 7:5. */
  width?: number
  highlighted?: boolean
  dimmed?: boolean
  className?: string
  style?: CSSProperties
}

export function PlayingCard({ card, faceDown = false, size = "md", width, highlighted = false, dimmed = false, className, style }: PlayingCardProps) {
  const w = width ?? SIZE_WIDTH[size]
  const box: CSSProperties = { width: w, height: w * 1.4, fontSize: w / 10, ...style }
  const down = card === null || card === undefined || faceDown
  return (
    <div
      className={cn(
        "relative shrink-0 select-none transition-[opacity,filter,box-shadow,transform] duration-300",
        highlighted && "ring-[0.22em] ring-amber-300 shadow-[0_0_1.6em_rgba(252,211,77,0.65)]",
        dimmed && "opacity-40 saturate-50",
        className,
      )}
      style={{ ...box, borderRadius: "0.75em" }}
    >
      {down ? <CardBack /> : <CardFace card={card} small={w < 44} />}
    </div>
  )
}

export function CardBack() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        borderRadius: "0.75em",
        background: "linear-gradient(160deg, #a3192d, #6d0f1f)",
        boxShadow: "0 0.15em 0.5em rgba(0,0,0,0.45), inset 0 0 0 0.1em rgba(0,0,0,0.35)",
      }}
    >
      <div
        className="absolute"
        style={{
          inset: "0.45em",
          borderRadius: "0.45em",
          border: "0.12em solid rgba(255,236,200,0.75)",
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,236,200,0.16) 0 0.12em, transparent 0.12em 0.7em), repeating-linear-gradient(-45deg, rgba(255,236,200,0.16) 0 0.12em, transparent 0.12em 0.7em)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: "3.6em", height: "3.6em", background: "#6d0f1f", border: "0.14em solid rgba(255,236,200,0.8)" }}
        >
          <SuitIcon suit={3} style={{ width: "1.9em", height: "1.9em", color: "#f6d98b" }} />
        </div>
      </div>
      <div className="absolute inset-0" style={{ borderRadius: "0.75em", background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent 40%)" }} />
    </div>
  )
}

function CardFace({ card, small }: { card: number; small: boolean }) {
  const rank = card % 13
  const suit = cardSuitOf(card)
  const color = isRedCard(card) ? RED : INK
  const label = RANK_LABEL[rank]
  const court = rank >= 9 && rank <= 11

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        borderRadius: "0.75em",
        color,
        background: "linear-gradient(165deg, #ffffff, #f4f1ea 70%, #e9e4d8)",
        boxShadow: "0 0.15em 0.5em rgba(0,0,0,0.45), inset 0 0 0 0.08em rgba(0,0,0,0.18)",
      }}
    >
      {small ? (
        // Tiny cards: one big rank and suit, which stays legible where a full face turns to mush.
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: "0.2em" }}>
          <span className="font-black leading-none tracking-tight" style={{ fontSize: label === "10" ? "4.6em" : "5.2em", letterSpacing: label === "10" ? "-0.08em" : undefined }}>
            {label}
          </span>
          <SuitIcon suit={suit} style={{ width: "4.2em", height: "4.2em" }} />
        </div>
      ) : (
        <>
          <Corner label={label} suit={suit} />
          <Corner label={label} suit={suit} flipped />
          {court ? (
            <div
              className="absolute flex flex-col items-center justify-center"
              style={{
                inset: "2.4em 2.8em",
                borderRadius: "0.4em",
                border: `0.12em solid ${color}`,
                background: isRedCard(card)
                  ? "linear-gradient(180deg, rgba(200,16,46,0.10), rgba(246,217,139,0.28))"
                  : "linear-gradient(180deg, rgba(22,22,29,0.08), rgba(246,217,139,0.28))",
              }}
            >
              <span className="font-serif font-black leading-none" style={{ fontSize: "4em" }}>{label}</span>
              <SuitIcon suit={suit} style={{ width: "2.4em", height: "2.4em", marginTop: "0.2em" }} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <SuitIcon
                suit={suit}
                style={{ width: rank === 12 ? "5.6em" : "4.4em", height: rank === 12 ? "5.6em" : "4.4em", filter: "drop-shadow(0 0.06em 0.06em rgba(0,0,0,0.15))" }}
              />
            </div>
          )}
        </>
      )}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.5), transparent 35%)" }} />
    </div>
  )
}

function Corner({ label, suit, flipped }: { label: string; suit: number; flipped?: boolean }) {
  return (
    <div
      className="absolute flex flex-col items-center leading-none"
      style={{ top: "0.45em", left: "0.5em", width: "2.1em", transform: flipped ? "rotate(180deg)" : undefined, ...(flipped ? { top: "auto", left: "auto", bottom: "0.45em", right: "0.5em" } : null) }}
    >
      <span className="font-black tracking-tight" style={{ fontSize: "2.5em", letterSpacing: label === "10" ? "-0.1em" : undefined }}>{label}</span>
      <SuitIcon suit={suit} style={{ width: "1.7em", height: "1.7em", marginTop: "0.15em" }} />
    </div>
  )
}

/** A card that turns over in 3D when `faceUp` changes, or on mount when `flipIn` is set. */
export function FlipCard({ card, faceUp, width, flipIn = false, delay = 0, highlighted, dimmed, className, style }: {
  card: number | null
  faceUp: boolean
  width: number
  flipIn?: boolean
  delay?: number
  highlighted?: boolean
  dimmed?: boolean
  className?: string
  style?: CSSProperties
}) {
  const showFace = faceUp && card !== null
  return (
    <div
      className={cn("relative shrink-0 transition-[opacity,filter,transform] duration-300", dimmed && "opacity-40 saturate-50", className)}
      style={{ width: width, height: width * 1.4, fontSize: width / 10, perspective: "60em", ...style }}
    >
      <div
        className={cn("absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]", flipIn && "poker-flip-in")}
        style={{ transform: showFace ? "rotateY(0deg)" : "rotateY(180deg)", animationDelay: `${delay}ms`, transitionDelay: `${delay}ms` }}
      >
        <div
          className={cn("absolute inset-0 [backface-visibility:hidden]", highlighted && "ring-[0.22em] ring-amber-300 shadow-[0_0_1.6em_rgba(252,211,77,0.7)]")}
          style={{ borderRadius: "0.75em" }}
        >
          {card !== null ? <CardFace card={card} small={width < 44} /> : <CardBack />}
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: "rotateY(180deg)", borderRadius: "0.75em" }}>
          <CardBack />
        </div>
      </div>
    </div>
  )
}
