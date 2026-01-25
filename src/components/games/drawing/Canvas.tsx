import { useRef, useEffect, useCallback, useState } from "react"
import type { Stroke } from "../../../../party/drawing"

interface CanvasProps {
  strokes: Stroke[]
  isDrawer: boolean
  onStroke: (stroke: Stroke) => void
  color: string
  size: number
  disabled?: boolean
}

export function Canvas({
  strokes,
  isDrawer,
  onStroke,
  color,
  size,
  disabled = false,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([])
  const lastRenderedStrokesRef = useRef<number>(0)

  // Get canvas context
  const getContext = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext("2d")
  }, [])

  // Convert screen coordinates to canvas coordinates
  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }, [])

  // Draw a single stroke
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return

    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.size
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1]
      const curr = stroke.points[i]

      // Use quadratic curve for smoother lines
      const midX = (prev.x + curr.x) / 2
      const midY = (prev.y + curr.y) / 2
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY)
    }

    // Draw to the last point
    const lastPoint = stroke.points[stroke.points.length - 1]
    ctx.lineTo(lastPoint.x, lastPoint.y)
    ctx.stroke()
  }, [])

  // Redraw all strokes
  const redrawCanvas = useCallback(() => {
    const ctx = getContext()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (const stroke of strokes) {
      drawStroke(ctx, stroke)
    }

    lastRenderedStrokesRef.current = strokes.length
  }, [strokes, getContext, drawStroke])

  // Incremental drawing - only draw new strokes
  useEffect(() => {
    const ctx = getContext()
    if (!ctx) return

    // If we have fewer strokes than before (canvas was cleared), redraw everything
    if (strokes.length < lastRenderedStrokesRef.current) {
      redrawCanvas()
      return
    }

    // Only draw new strokes
    for (let i = lastRenderedStrokesRef.current; i < strokes.length; i++) {
      drawStroke(ctx, strokes[i])
    }

    lastRenderedStrokesRef.current = strokes.length
  }, [strokes, getContext, drawStroke, redrawCanvas])

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Set canvas size
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect()
      const size = Math.min(rect.width, 400)
      canvas.width = size
      canvas.height = size
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      redrawCanvas()
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    return () => window.removeEventListener("resize", resizeCanvas)
  }, [redrawCanvas])

  // Drawing handlers
  const startDrawing = useCallback((clientX: number, clientY: number) => {
    if (!isDrawer || disabled) return

    const coords = getCanvasCoords(clientX, clientY)
    setIsDrawing(true)
    currentStrokeRef.current = [coords]
  }, [isDrawer, disabled, getCanvasCoords])

  const continueDrawing = useCallback((clientX: number, clientY: number) => {
    if (!isDrawing || !isDrawer || disabled) return

    const ctx = getContext()
    if (!ctx) return

    const coords = getCanvasCoords(clientX, clientY)
    currentStrokeRef.current.push(coords)

    // Draw current stroke in progress
    if (currentStrokeRef.current.length >= 2) {
      const points = currentStrokeRef.current
      const prev = points[points.length - 2]
      const curr = points[points.length - 1]

      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = size
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(curr.x, curr.y)
      ctx.stroke()
    }
  }, [isDrawing, isDrawer, disabled, getContext, getCanvasCoords, color, size])

  const endDrawing = useCallback(() => {
    if (!isDrawing || !isDrawer) return

    setIsDrawing(false)

    if (currentStrokeRef.current.length >= 2) {
      const stroke: Stroke = {
        points: [...currentStrokeRef.current],
        color,
        size,
      }
      onStroke(stroke)
    }

    currentStrokeRef.current = []
  }, [isDrawing, isDrawer, color, size, onStroke])

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    startDrawing(e.clientX, e.clientY)
  }, [startDrawing])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    continueDrawing(e.clientX, e.clientY)
  }, [continueDrawing])

  const handleMouseUp = useCallback(() => {
    endDrawing()
  }, [endDrawing])

  const handleMouseLeave = useCallback(() => {
    endDrawing()
  }, [endDrawing])

  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    startDrawing(touch.clientX, touch.clientY)
  }, [startDrawing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    continueDrawing(touch.clientX, touch.clientY)
  }, [continueDrawing])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    endDrawing()
  }, [endDrawing])

  return (
    <div
      ref={containerRef}
      className="w-full flex justify-center"
    >
      <canvas
        ref={canvasRef}
        className={`border-2 rounded-lg bg-white ${
          isDrawer && !disabled
            ? "cursor-crosshair border-primary"
            : "border-border"
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  )
}
