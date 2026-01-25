import { Eraser, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const COLORS = [
  "#000000", // Black
  "#ffffff", // White (eraser)
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#78716c", // Brown/Gray
]

const SIZES = [
  { value: 4, label: "S" },
  { value: 8, label: "M" },
  { value: 16, label: "L" },
]

interface ToolbarProps {
  selectedColor: string
  selectedSize: number
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onClear: () => void
  disabled?: boolean
}

export function Toolbar({
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
  onClear,
  disabled = false,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-2 bg-muted rounded-lg">
      {/* Colors */}
      <div className="flex items-center gap-1">
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            disabled={disabled}
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedColor === color
                ? "border-primary ring-2 ring-primary ring-offset-1"
                : "border-border"
            }`}
            style={{ backgroundColor: color }}
            title={color === "#ffffff" ? "Eraser" : color}
          >
            {color === "#ffffff" && (
              <Eraser className="w-4 h-4 mx-auto text-muted-foreground" />
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Sizes */}
      <div className="flex items-center gap-1">
        {SIZES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSizeChange(value)}
            disabled={disabled}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedSize === value
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent"
            }`}
            title={`Brush size ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Clear */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onClear}
        disabled={disabled}
        className="h-8"
      >
        <Trash2 className="w-4 h-4 mr-1" />
        Clear
      </Button>
    </div>
  )
}
