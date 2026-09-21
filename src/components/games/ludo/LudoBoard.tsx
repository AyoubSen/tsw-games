import {
  getTokenCell,
  LUDO_BASE_SLOTS,
  LUDO_COLORS,
  LUDO_ENTRY_INDEX,
  LUDO_HOME_PATH,
  LUDO_SAFE_CELLS,
  LUDO_TRACK,
  ludoCellKey,
} from "@/lib/ludo"

export interface LudoMoveTarget {
  seat: number
  tokenIndex: number
  row: number
  col: number
}

export interface LudoTokenView {
  seat: number
  tokenIndex: number
  position: number
  movable: boolean
}

const BOARD_SIZE = 15

/** Arrow drawn on each colour's entry square, pointing the way round. */
const ENTRY_ARROWS = ["→", "↓", "←", "↑"] as const

/** The four triangles that make up the centre home. */
const CENTRE_TRIANGLES = [
  { seat: 0, clip: "polygon(0 0, 50% 50%, 0 100%)" },
  { seat: 1, clip: "polygon(0 0, 100% 0, 50% 50%)" },
  { seat: 2, clip: "polygon(100% 0, 100% 100%, 50% 50%)" },
  { seat: 3, clip: "polygon(0 100%, 100% 100%, 50% 50%)" },
] as const

/** Where several tokens share a square, fan them out instead of hiding them. */
const STACK_OFFSETS = [
  [0, 0],
  [-22, -22],
  [22, 22],
  [22, -22],
] as const

interface TrackCell {
  row: number
  col: number
  safe: boolean
  entrySeat: number | null
}

const TRACK_CELLS: TrackCell[] = LUDO_TRACK.map(([row, col], index) => {
  const entrySeat = LUDO_ENTRY_INDEX.indexOf(
    index as (typeof LUDO_ENTRY_INDEX)[number],
  )
  return {
    row,
    col,
    safe: LUDO_SAFE_CELLS.has(index),
    entrySeat: entrySeat === -1 ? null : entrySeat,
  }
})

/** Top-left grid square of each colour's 6x6 yard. */
const YARD_ORIGINS = LUDO_BASE_SLOTS.map(
  (slots) => [slots[0][0] - 1, slots[0][1] - 1] as const,
)

function gridArea(row: number, col: number, span = 1) {
  return {
    gridRow: `${row + 1} / span ${span}`,
    gridColumn: `${col + 1} / span ${span}`,
  }
}

function percent(value: number) {
  return `${(value / BOARD_SIZE) * 100}%`
}

const YARD_SPAN = 6
/** Ring diameter, as a share of the yard, sized to nest a token. */
const SLOT_SIZE = (0.88 / YARD_SPAN) * 100

function Yard({ seat, active }: { seat: number; active: boolean }) {
  const [originRow, originCol] = YARD_ORIGINS[seat]
  const color = LUDO_COLORS[seat].hex
  return (
    <div
      style={{ ...gridArea(originRow, originCol, YARD_SPAN), background: color }}
      className={`relative rounded-2xl shadow-inner ${
        active ? "" : "opacity-30 saturate-50"
      }`}
    >
      <div className="absolute inset-[12.5%] rounded-xl bg-white shadow-md dark:bg-slate-100" />
      {/* Rings sit on the same slot centres the tokens are placed from. */}
      {LUDO_BASE_SLOTS[seat].map(([row, col]) => (
        <div
          key={`${row}-${col}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
          style={{
            left: `${((col - originCol + 0.5) / YARD_SPAN) * 100}%`,
            top: `${((row - originRow + 0.5) / YARD_SPAN) * 100}%`,
            width: `${SLOT_SIZE}%`,
            aspectRatio: "1 / 1",
            borderColor: color,
          }}
        />
      ))}
    </div>
  )
}

export function LudoBoard({
  tokens,
  targets,
  activeSeats,
  onSelectToken,
}: {
  tokens: LudoTokenView[]
  targets: LudoMoveTarget[]
  activeSeats: number[]
  onSelectToken: (seat: number, tokenIndex: number) => void
}) {
  const cellCounts = new Map<string, number>()
  const placed = tokens.map((token) => {
    const [row, col] = getTokenCell(token.seat, token.tokenIndex, token.position)
    const key = ludoCellKey(row, col)
    const stackIndex = cellCounts.get(key) ?? 0
    cellCounts.set(key, stackIndex + 1)
    return { token, row, col, key, stackIndex }
  })

  return (
    <div className="rounded-[2rem] bg-gradient-to-br from-slate-200 to-slate-300 p-2 shadow-xl sm:p-3 dark:from-slate-800 dark:to-slate-900">
      <div className="relative aspect-square w-full rounded-[1.25rem] bg-white p-[1.5%] shadow-inner dark:bg-slate-950">
        {/* No grid gap: cells stay exactly 1/15 wide so the token overlay lines up. */}
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {LUDO_COLORS.map((color, seat) => (
            <Yard
              key={color.id}
              seat={seat}
              active={activeSeats.includes(seat)}
            />
          ))}

          {TRACK_CELLS.map((cell) => (
            <div
              key={`track-${cell.row}-${cell.col}`}
              style={{
                ...gridArea(cell.row, cell.col),
                background:
                  cell.entrySeat !== null
                    ? LUDO_COLORS[cell.entrySeat].hex
                    : undefined,
              }}
              className={`flex items-center justify-center rounded-[2px] border text-[8px] leading-none sm:text-xs ${
                cell.entrySeat !== null
                  ? `border-white/40 text-white/80 ${
                      activeSeats.includes(cell.entrySeat)
                        ? ""
                        : "opacity-30 saturate-50"
                    }`
                  : "border-slate-300 bg-white text-slate-400 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200"
              }`}
            >
              <span aria-hidden="true">
                {cell.entrySeat !== null
                  ? ENTRY_ARROWS[cell.entrySeat]
                  : cell.safe
                    ? "★"
                    : ""}
              </span>
            </div>
          ))}

          {LUDO_HOME_PATH.map((path, seat) =>
            path.slice(0, 5).map(([row, col]) => (
              <div
                key={`home-${row}-${col}`}
                style={{
                  ...gridArea(row, col),
                  background: LUDO_COLORS[seat].hex,
                }}
                className={`rounded-[2px] border border-white/40 ${
                  activeSeats.includes(seat) ? "" : "opacity-30 saturate-50"
                }`}
              />
            )),
          )}

          <div
            style={gridArea(6, 6, 3)}
            className="relative overflow-hidden rounded-md border border-slate-300 dark:border-slate-700"
          >
            {CENTRE_TRIANGLES.map((triangle) => (
              <div
                key={triangle.seat}
                className="absolute inset-0"
                style={{
                  background: LUDO_COLORS[triangle.seat].hex,
                  clipPath: triangle.clip,
                }}
              />
            ))}
          </div>
        </div>

        {/* Tokens ride above the grid so they glide between squares. */}
        <div className="pointer-events-none absolute inset-0 p-[1.5%]">
          <div className="relative h-full w-full">
            {targets.map((target) => (
              <button
                key={`target-${target.seat}-${target.tokenIndex}`}
                type="button"
                aria-label={`Move token ${target.tokenIndex + 1} here`}
                onClick={() => onSelectToken(target.seat, target.tokenIndex)}
                style={{
                  left: percent(target.col + 0.5),
                  top: percent(target.row + 0.5),
                  width: percent(0.9),
                }}
                className="pointer-events-auto absolute z-[5] aspect-square -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-[3px] border-dashed border-slate-900 bg-slate-900/15 transition hover:bg-slate-900/30 dark:border-white dark:bg-white/20 dark:hover:bg-white/35"
              />
            ))}
            {placed.map(({ token, row, col, key, stackIndex }) => {
              const color = LUDO_COLORS[token.seat]
              const label = `${color.label} token ${token.tokenIndex + 1}`
              const [offsetX, offsetY] = STACK_OFFSETS[stackIndex % 4]
              const shared = (cellCounts.get(key) ?? 1) > 1
              return (
                <button
                  key={`${token.seat}-${token.tokenIndex}`}
                  type="button"
                  disabled={!token.movable}
                  aria-label={token.movable ? `Move ${label}` : label}
                  onClick={() => onSelectToken(token.seat, token.tokenIndex)}
                  style={{
                    left: percent(col + 0.5),
                    top: percent(row + 0.5),
                    width: percent(shared ? 0.62 : 0.76),
                    transform: `translate(calc(-50% + ${offsetX}%), calc(-50% + ${offsetY}%))`,
                    zIndex: 10 + stackIndex,
                    background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.8) 0%, ${color.hex} 58%)`,
                  }}
                  className={`pointer-events-auto absolute aspect-square rounded-full border-2 border-white shadow-[0_2px_5px_rgba(15,23,42,0.45)] transition-all duration-300 ease-out ${
                    token.movable
                      ? "z-20 scale-110 cursor-pointer shadow-[0_0_0_4px_rgba(15,23,42,0.9),0_0_14px_4px_rgba(255,255,255,0.55)] hover:scale-125"
                      : "cursor-default"
                  }`}
                >
                  {token.movable && (
                    <span
                      aria-hidden="true"
                      className="absolute -inset-[30%] animate-ping rounded-full border-4 border-slate-900/60 dark:border-white/80"
                    />
                  )}
                  <span className="sr-only">{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
