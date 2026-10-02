import { UNO_COLORS, type UnoCard, type UnoColor, type UnoValue } from "@/lib/uno"
import { cn } from "@/lib/utils"

export const COLOR_HEX: Record<UnoColor, { base: string; deep: string }> = {
  red: { base: "#ef3b33", deep: "#a8150f" },
  yellow: { base: "#ffcf2e", deep: "#d99200" },
  green: { base: "#22b14c", deep: "#0b6a2a" },
  blue: { base: "#2b7be4", deep: "#123f99" },
}
export const COLOR_NAME: Record<UnoColor, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" }
const VALUE_NAME: Partial<Record<UnoValue, string>> = { skip: "Skip", reverse: "Reverse", "draw-two": "+2", wild: "Wild", "wild-draw-four": "Wild +4" }

export function valueLabel(value: UnoValue) {
  return VALUE_NAME[value] ?? value
}

export function cardLabel(card: UnoCard) {
  return card.color ? `${COLOR_NAME[card.color]} ${valueLabel(card.value)}` : valueLabel(card.value)
}

const PAPER = "#fbf8f1"
const INK = "#141416"
const FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif'
const OVAL = "rotate(30 50 75)"

/** Shared gradients and clip paths; render once per page that shows cards. */
export function UnoCardDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <defs>
        {UNO_COLORS.map((color) => (
          <linearGradient key={color} id={`uno-fill-${color}`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={COLOR_HEX[color].base} />
            <stop offset="1" stopColor={COLOR_HEX[color].deep} />
          </linearGradient>
        ))}
        <linearGradient id="uno-fill-wild" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#2c2c31" />
          <stop offset="1" stopColor="#0b0b0d" />
        </linearGradient>
        <linearGradient id="uno-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
        <clipPath id="uno-oval">
          <ellipse cx="50" cy="75" rx="31" ry="50" transform={OVAL} />
        </clipPath>
      </defs>
    </svg>
  )
}

function Quadrants({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <rect x={x} y={y} width={w / 2} height={h / 2} fill={COLOR_HEX.red.base} />
      <rect x={x + w / 2} y={y} width={w / 2} height={h / 2} fill={COLOR_HEX.blue.base} />
      <rect x={x} y={y + h / 2} width={w / 2} height={h / 2} fill={COLOR_HEX.yellow.base} />
      <rect x={x + w / 2} y={y + h / 2} width={w / 2} height={h / 2} fill={COLOR_HEX.green.base} />
    </>
  )
}

const ARROW = "-14,-3.5 3,-3.5 3,-9.5 14,0 3,9.5 3,3.5 -14,3.5"

/** Card symbol centred on (x, y); `s` scales it (1 = centre size). */
function Glyph({ value, x, y, s, fill }: { value: UnoValue; x: number; y: number; s: number; fill: string }) {
  const outline = { stroke: INK, strokeLinejoin: "round" as const, paintOrder: "stroke" as const }
  if (value === "skip") {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" strokeLinecap="round">
        <circle r="16" stroke={INK} strokeWidth="12" />
        <line x1="-11" y1="11" x2="11" y2="-11" stroke={INK} strokeWidth="12" />
        <circle r="16" stroke={fill} strokeWidth="6.5" />
        <line x1="-11" y1="11" x2="11" y2="-11" stroke={fill} strokeWidth="6.5" />
      </g>
    )
  }
  if (value === "reverse") {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill} strokeWidth="4" {...outline}>
        <polygon points={ARROW} transform="translate(-4 -5) rotate(-45)" />
        <polygon points={ARROW} transform="translate(4 5) rotate(135)" />
      </g>
    )
  }
  if (value === "wild") {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <g transform="translate(-50 -75)" clipPath="url(#uno-oval)">
          <Quadrants x={0} y={0} w={100} h={150} />
        </g>
        <ellipse cx="0" cy="0" rx="31" ry="50" transform="rotate(30)" fill="none" stroke={PAPER} strokeWidth="5" />
      </g>
    )
  }
  const text = value === "draw-two" ? "+2" : value === "wild-draw-four" ? "+4" : value
  const size = (text.length > 1 ? 44 : 60) * s
  return (
    <g>
      <text
        x={x}
        y={y}
        dy="0.36em"
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={900}
        fontStyle="italic"
        fontSize={size}
        fill={fill}
        strokeWidth={5 * s}
        {...outline}
      >
        {text}
      </text>
      {(value === "6" || value === "9") && (
        <rect x={x - 12 * s} y={y + 24 * s} width={22 * s} height={4.5 * s} rx={2 * s} fill={fill} stroke={INK} strokeWidth={2 * s} />
      )}
    </g>
  )
}

export function UnoCardFace({ card }: { card: UnoCard }) {
  const wild = card.color === null
  const ink = wild ? PAPER : COLOR_HEX[card.color!].base
  return (
    <svg viewBox="0 0 100 150" className="block size-full" aria-hidden="true">
      <rect width="100" height="150" rx="10" fill={PAPER} />
      <rect x="5.5" y="5.5" width="89" height="139" rx="7" fill={`url(#uno-fill-${card.color ?? "wild"})`} />
      {wild ? (
        <>
          <g clipPath="url(#uno-oval)">
            <Quadrants x={0} y={0} w={100} h={150} />
          </g>
          <ellipse cx="50" cy="75" rx="31" ry="50" transform={OVAL} fill="none" stroke={PAPER} strokeWidth="4" />
        </>
      ) : (
        <ellipse cx="50" cy="75" rx="31" ry="50" transform={OVAL} fill={PAPER} />
      )}
      {card.value !== "wild" && <Glyph value={card.value} x={50} y={75} s={1} fill={ink} />}
      <Glyph value={card.value} x={17} y={22} s={card.value === "wild" ? 0.26 : 0.36} fill={PAPER} />
      <g transform="rotate(180 50 75)">
        <Glyph value={card.value} x={17} y={22} s={card.value === "wild" ? 0.26 : 0.36} fill={PAPER} />
      </g>
      <rect width="100" height="150" rx="10" fill="url(#uno-sheen)" />
    </svg>
  )
}

export function UnoCardBack() {
  return (
    <svg viewBox="0 0 100 150" className="block size-full" aria-hidden="true">
      <rect width="100" height="150" rx="10" fill={PAPER} />
      <rect x="5.5" y="5.5" width="89" height="139" rx="7" fill="url(#uno-fill-wild)" />
      <ellipse cx="50" cy="75" rx="31" ry="50" transform={OVAL} fill={COLOR_HEX.red.base} />
      <text
        x="50"
        y="75"
        dy="0.36em"
        textAnchor="middle"
        transform="rotate(-24 50 75)"
        fontFamily={FONT}
        fontWeight={900}
        fontStyle="italic"
        fontSize="30"
        fill={COLOR_HEX.yellow.base}
        stroke={INK}
        strokeWidth="4.5"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        UNO
      </text>
      <rect width="100" height="150" rx="10" fill="url(#uno-sheen)" />
    </svg>
  )
}

export function UnoCardView({ card, className }: { card: UnoCard | null; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10%/6.667%] shadow-[0_1px_0_rgb(0_0_0/.3),0_10px_22px_-8px_rgb(0_0_0/.75)]",
        className,
      )}
    >
      {card ? <UnoCardFace card={card} /> : <UnoCardBack />}
    </div>
  )
}
