import type { Stroke } from "../../../../party/drawing"

/** Drawings are stored in this coordinate space; every canvas renders it scaled. */
export const CANVAS_WIDTH = 1200
export const CANVAS_HEIGHT = 800
export const PAPER = "#ffffff"

/** Replay cost of a stroke: pen strokes by point count, a fill as a short pause. */
const FILL_WEIGHT = 40
export function strokeWeight(stroke: Stroke) {
  return stroke.tool === "fill" ? FILL_WEIGHT : stroke.points.length
}

export function clearPaper(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

function scaleOf(ctx: CanvasRenderingContext2D) {
  return ctx.canvas.width / CANVAS_WIDTH
}

function penStyle(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const scale = scaleOf(ctx)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

/** A whole pen stroke, smoothed through the midpoints. */
export function drawPen(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const points = stroke.points
  if (points.length < 2) return
  penStyle(ctx, stroke)
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2)
  }
  const last = points[points.length - 1]!
  ctx.lineTo(last.x, last.y)
  ctx.stroke()
}

/** Straight segments from point `from` to point `to` (used while drawing live and in replays). */
export function drawPenSegments(ctx: CanvasRenderingContext2D, stroke: Stroke, from: number, to: number) {
  const points = stroke.points
  if (to <= from || points.length < 2) return
  penStyle(ctx, stroke)
  ctx.beginPath()
  const start = points[Math.max(0, from)]!
  ctx.moveTo(start.x, start.y)
  if (from === 0 && to === 0) ctx.lineTo(start.x + 0.01, start.y)
  for (let i = Math.max(1, from + 1); i <= Math.min(to, points.length - 1); i++) ctx.lineTo(points[i]!.x, points[i]!.y)
  ctx.stroke()
}

function hexToRgb(hex: string) {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const
}

/**
 * Scanline flood fill from (x, y) in drawing space. Pixels close to the seed
 * colour are filled, so anti-aliased edges don't leave a halo; the region then
 * grows one pixel to tuck under the line it stopped at.
 */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const { width, height } = ctx.canvas
  const scale = scaleOf(ctx)
  const sx = Math.min(width - 1, Math.max(0, Math.floor(x * scale)))
  const sy = Math.min(height - 1, Math.max(0, Math.floor(y * scale)))
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const seed = (sy * width + sx) * 4
  const [r0, g0, b0] = [data[seed]!, data[seed + 1]!, data[seed + 2]!]
  const [r1, g1, b1] = hexToRgb(color)
  if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) < 8) return

  const TOLERANCE = 120
  const match = (offset: number) =>
    Math.abs(data[offset]! - r0) + Math.abs(data[offset + 1]! - g0) + Math.abs(data[offset + 2]! - b0) <= TOLERANCE
  const filled = new Uint8Array(width * height)
  const stack = [sx, sy]
  while (stack.length) {
    const py = stack.pop()!
    let px = stack.pop()!
    let index = py * width + px
    while (px > 0 && !filled[index - 1] && match((index - 1) * 4)) {
      px--
      index--
    }
    let spanUp = false
    let spanDown = false
    while (px < width && !filled[index] && match(index * 4)) {
      filled[index] = 1
      if (py > 0) {
        const up = index - width
        const open = !filled[up] && match(up * 4)
        if (open && !spanUp) stack.push(px, py - 1)
        spanUp = open
      }
      if (py < height - 1) {
        const down = index + width
        const open = !filled[down] && match(down * 4)
        if (open && !spanDown) stack.push(px, py + 1)
        spanDown = open
      }
      px++
      index++
    }
  }

  const paint = (index: number) => {
    const offset = index * 4
    data[offset] = r1
    data[offset + 1] = g1
    data[offset + 2] = b1
    data[offset + 3] = 255
  }
  for (let index = 0; index < filled.length; index++) {
    if (!filled[index]) continue
    paint(index)
    const px = index % width
    if (px > 0 && !filled[index - 1]) paint(index - 1)
    if (px < width - 1 && !filled[index + 1]) paint(index + 1)
    if (index >= width && !filled[index - width]) paint(index - width)
    if (index < filled.length - width && !filled[index + width]) paint(index + width)
  }
  ctx.putImageData(image, 0, 0)
}

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.tool === "fill") {
    const point = stroke.points[0]
    if (point) floodFill(ctx, point.x, point.y, stroke.color)
  } else {
    drawPen(ctx, stroke)
  }
}

export function paintAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  clearPaper(ctx)
  for (const stroke of strokes) paintStroke(ctx, stroke)
}

/** Cheap identity check for two strokes from different messages. */
export function sameStroke(left: Stroke, right: Stroke) {
  const a = left.points
  const b = right.points
  return (
    left.color === right.color &&
    left.size === right.size &&
    (left.tool ?? "pen") === (right.tool ?? "pen") &&
    a.length === b.length &&
    a[0]?.x === b[0]?.x &&
    a[0]?.y === b[0]?.y &&
    a[a.length - 1]?.x === b[b.length - 1]?.x &&
    a[a.length - 1]?.y === b[b.length - 1]?.y
  )
}
