import { useEffect, useRef } from "react"
import type { Stroke } from "../../../../party/drawing"
import { cn } from "@/lib/utils"
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clearPaper,
  drawPen,
  drawPenSegments,
  paintAll,
  paintStroke,
  sameStroke,
  strokeWeight,
} from "./paint"

export type DrawTool = "pen" | "eraser" | "fill"

interface CanvasProps {
  strokes: Stroke[]
  isDrawer: boolean
  onStroke: (stroke: Stroke) => void
  color: string
  size: number
  tool?: DrawTool
  disabled?: boolean
  revision?: number
  className?: string
}

/**
 * The paper. Renders `strokes` incrementally when they only grew, and repaints
 * when they changed underneath (undo, clear) or when the server answered after
 * a local preview (`revision` moved while our own pixels were on the sheet).
 */
export function Canvas({
  strokes,
  isDrawer,
  onStroke,
  color,
  size,
  tool = "pen",
  disabled = false,
  revision = 0,
  className,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedRef = useRef<Stroke[]>([])
  const revisionRef = useRef(revision)
  const dirtyRef = useRef(false)
  const liveRef = useRef<{ pointerId: number; points: { x: number; y: number }[] } | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    const rendered = renderedRef.current
    const revisionMoved = revision !== revisionRef.current
    revisionRef.current = revision
    const grew =
      strokes.length >= rendered.length &&
      rendered.every((stroke, index) => sameStroke(stroke, strokes[index]!))
    if (!grew || (revisionMoved && dirtyRef.current) || rendered.length === 0) {
      paintAll(ctx, strokes)
      dirtyRef.current = false
    } else {
      for (let i = rendered.length; i < strokes.length; i++) paintStroke(ctx, strokes[i]!)
    }
    renderedRef.current = strokes
  }, [strokes, revision])

  const active = isDrawer && !disabled
  const ink = tool === "eraser" ? "#ffffff" : color

  const toCanvas = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(CANVAS_WIDTH, Math.max(0, ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH)),
      y: Math.min(CANVAS_HEIGHT, Math.max(0, ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT)),
    }
  }

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active || liveRef.current) return
    event.preventDefault()
    const point = toCanvas(event)
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true })
    if (tool === "fill") {
      const stroke: Stroke = { points: [point], color, size, tool: "fill" }
      if (ctx) paintStroke(ctx, stroke)
      dirtyRef.current = true
      onStroke(stroke)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    liveRef.current = { pointerId: event.pointerId, points: [point] }
    if (ctx) drawPen(ctx, { points: [point, { x: point.x + 0.1, y: point.y }], color: ink, size })
    dirtyRef.current = true
  }

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current
    if (!live || live.pointerId !== event.pointerId) return
    const point = toCanvas(event)
    const last = live.points[live.points.length - 1]!
    if (Math.abs(point.x - last.x) + Math.abs(point.y - last.y) < 1.5) return
    live.points.push(point)
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true })
    if (ctx) drawPenSegments(ctx, { points: live.points, color: ink, size }, live.points.length - 2, live.points.length - 1)
  }

  const handleUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current
    if (!live || live.pointerId !== event.pointerId) return
    liveRef.current = null
    const points = live.points.length === 1 ? [live.points[0]!, { x: live.points[0]!.x + 0.1, y: live.points[0]!.y }] : live.points
    onStroke({ points, color: ink, size })
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className={cn("block h-full w-full touch-none bg-white", active ? (tool === "fill" ? "cursor-cell" : "cursor-crosshair") : "cursor-default", className)}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    />
  )
}

/**
 * A finished drawing. With `replay`, it is drawn stroke by stroke in the
 * stored order, sped to fit `replay.duration`, starting at `replay.startAt`
 * (a local Date.now() timestamp; a start in the past joins mid-replay).
 */
export function DrawingView({
  strokes,
  replay,
  resolution = 1,
  className,
}: {
  strokes: Stroke[]
  replay?: { startAt: number; duration: number } | null
  /** Fraction of the full 1200×800 backing store (thumbnails use less). */
  resolution?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const startAt = replay?.startAt
  const duration = replay?.duration

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true })
    if (!ctx) return
    if (startAt === undefined || !duration || strokes.length === 0) {
      paintAll(ctx, strokes)
      return
    }

    const total = strokes.reduce((sum, stroke) => sum + strokeWeight(stroke), 0)
    let strokeIndex = 0
    let pointIndex = 0
    let budgetSpent = 0
    let frame = 0
    clearPaper(ctx)

    const step = () => {
      const progress = Math.min(1, Math.max(0, (Date.now() - startAt) / duration))
      if (progress >= 1) {
        paintAll(ctx, strokes)
        return
      }
      const target = progress * total
      while (strokeIndex < strokes.length) {
        const stroke = strokes[strokeIndex]!
        const weight = strokeWeight(stroke)
        if (stroke.tool === "fill") {
          if (budgetSpent + weight > target) break
          paintStroke(ctx, stroke)
        } else {
          const reach = Math.min(stroke.points.length - 1, Math.floor(target - budgetSpent))
          if (reach > pointIndex) {
            drawPenSegments(ctx, stroke, pointIndex, reach)
            pointIndex = reach
          }
          if (reach < stroke.points.length - 1) break
        }
        budgetSpent += weight
        strokeIndex++
        pointIndex = 0
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [strokes, startAt, duration])

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(CANVAS_WIDTH * resolution)}
      height={Math.round(CANVAS_HEIGHT * resolution)}
      className={cn("block h-full w-full bg-white", className)}
    />
  )
}
