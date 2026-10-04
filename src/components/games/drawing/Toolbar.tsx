import { Brush, Eraser, PaintBucket, Trash2, Undo2 } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { DrawTool } from "./Canvas"

const PAINTS = [
  { hex: "#111111", name: "Black" },
  { hex: "#6b7280", name: "Grey" },
  { hex: "#ffffff", name: "White" },
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#facc15", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#15803d", name: "Forest" },
  { hex: "#38bdf8", name: "Sky" },
  { hex: "#2563eb", name: "Blue" },
  { hex: "#8b5cf6", name: "Purple" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#92400e", name: "Brown" },
  { hex: "#f5c9a5", name: "Peach" },
]

const SIZES = [4, 8, 16, 28]

/** Irregular blob outlines so the paints look dabbed on rather than stamped. */
const BLOBS = [
  "58% 42% 52% 48% / 46% 58% 42% 54%",
  "44% 56% 47% 53% / 55% 45% 55% 45%",
  "52% 48% 60% 40% / 42% 52% 48% 58%",
  "47% 53% 42% 58% / 58% 46% 54% 42%",
]

const WOOD =
  "repeating-linear-gradient(97deg, rgb(255 255 255 / .05) 0 2px, transparent 2px 11px), repeating-linear-gradient(83deg, rgb(80 40 10 / .12) 0 1px, transparent 1px 17px), linear-gradient(160deg, #d6a46a 0%, #b9824a 48%, #9a6532 100%)"

interface ToolbarProps {
  selectedColor: string
  selectedSize: number
  tool: DrawTool
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onToolChange: (tool: DrawTool) => void
  onClear: () => void
  onUndo: () => void
  canUndo: boolean
  disabled?: boolean
  compact?: boolean
}

/** The drawer's wooden palette: paint blobs, brush-size dots and tools. */
export function Toolbar({
  selectedColor,
  selectedSize,
  tool,
  onColorChange,
  onSizeChange,
  onToolChange,
  onClear,
  onUndo,
  canUndo,
  disabled = false,
  compact = false,
}: ToolbarProps) {
  const blob = compact ? 24 : 30
  const shownColor = tool === "eraser" ? "#ffffff" : selectedColor
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className={cn(
        "uno-rise relative flex max-w-full shrink-0 items-center gap-x-3 gap-y-2 text-[#3b2410] shadow-[0_14px_30px_rgb(0_0_0/.45),inset_0_2px_0_rgb(255_255_255/.35),inset_0_-3px_6px_rgb(60_30_5/.35)]",
        // On phones it stays one row and scrolls sideways, so the paper keeps its size.
        compact ? "flex-nowrap justify-start overflow-x-auto rounded-2xl px-3 py-2 [scrollbar-width:none]" : "flex-wrap justify-center rounded-[30px] px-4 py-2.5",
        disabled && "pointer-events-none opacity-60 saturate-50",
      )}
      style={{ background: WOOD }}
    >
      <div className={cn("flex items-center gap-1.5", compact ? "shrink-0 flex-nowrap" : "flex-wrap justify-center")} role="radiogroup" aria-label="Paint colour">
        {PAINTS.map((paint, index) => {
          const selected = tool !== "eraser" && selectedColor === paint.hex
          return (
            <button
              key={paint.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={paint.name}
              title={paint.name}
              disabled={disabled}
              onClick={() => {
                onColorChange(paint.hex)
                if (tool === "eraser") onToolChange("pen")
              }}
              className={cn(
                "shrink-0 transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                selected && "-translate-y-1 scale-110",
              )}
              style={{
                width: blob,
                height: blob * 0.86,
                borderRadius: BLOBS[index % BLOBS.length],
                background: `radial-gradient(circle at 32% 28%, rgb(255 255 255 / .55) 0 12%, transparent 30%), ${paint.hex}`,
                boxShadow: selected
                  ? "0 0 0 2px #fff, 0 0 0 4px #3b2410, 0 6px 10px rgb(0 0 0 / .35)"
                  : "inset 0 -3px 4px rgb(0 0 0 / .25), 0 2px 3px rgb(60 30 5 / .45)",
              }}
            />
          )
        })}
      </div>

      <span aria-hidden="true" className="hidden h-8 w-px bg-[#3b2410]/25 sm:block" />

      <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#f7efe4]/90 px-2 py-1 shadow-inner" role="radiogroup" aria-label="Brush size">
        {SIZES.map((size) => {
          const selected = selectedSize === size
          const dot = Math.max(4, Math.min(22, size * 0.75 + 2))
          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Brush size ${size}`}
              disabled={disabled}
              onClick={() => onSizeChange(size)}
              className={cn("grid size-8 place-items-center rounded-full transition", selected ? "bg-[#3b2410]/15 ring-2 ring-[#3b2410]/60" : "hover:bg-[#3b2410]/10")}
            >
              <span className="rounded-full" style={{ width: dot, height: dot, background: tool === "fill" ? "#3b2410" : shownColor, boxShadow: "0 0 0 1px rgb(59 36 16 / .45)" }} />
            </button>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ToolButton label="Brush" pressed={tool === "pen"} disabled={disabled} onClick={() => onToolChange("pen")}>
          <Brush className="size-4" />
        </ToolButton>
        <ToolButton label="Eraser" pressed={tool === "eraser"} disabled={disabled} onClick={() => onToolChange("eraser")}>
          <Eraser className="size-4" />
        </ToolButton>
        <ToolButton label="Fill bucket" pressed={tool === "fill"} disabled={disabled} onClick={() => onToolChange("fill")}>
          <PaintBucket className="size-4" />
        </ToolButton>
        <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-[#3b2410]/25" />
        <ToolButton label="Undo" disabled={disabled || !canUndo} onClick={onUndo}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="Clear" danger disabled={disabled || !canUndo} onClick={onClear}>
          <Trash2 className="size-4" />
        </ToolButton>
      </div>
    </div>
  )
}

function ToolButton({ label, pressed, danger, disabled, onClick, children }: {
  label: string
  pressed?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-xl border border-[#3b2410]/20 bg-[#f7efe4] shadow-[0_2px_0_rgb(60_30_5/.45)] transition active:translate-y-px active:shadow-none disabled:opacity-40",
        pressed && "bg-[#3b2410] text-[#f7efe4] shadow-[inset_0_2px_4px_rgb(0_0_0/.4)]",
        danger && "text-rose-700",
      )}
    >
      {children}
    </button>
  )
}
