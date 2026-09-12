import { WORLD_WIDTH } from '../constants/board.js'

const MAX_RASTER_PX = 1024

/**
 * Rasterize freehand strokes within a world-normalized bbox to a JPEG data URL.
 */
export function rasterizeStrokesInRect(strokes, rect) {
  if (!strokes.length || rect.width <= 0 || rect.height <= 0) {
    return null
  }

  const aspect = rect.width / rect.height
  let canvasW = MAX_RASTER_PX
  let canvasH = MAX_RASTER_PX
  if (aspect >= 1) {
    canvasH = Math.max(8, Math.round(canvasW / aspect))
  } else {
    canvasW = Math.max(8, Math.round(canvasH * aspect))
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, canvasW, canvasH)

  const toLocal = (wx, wy) => ({
    x: ((wx - rect.x) / rect.width) * canvasW,
    y: ((wy - rect.y) / rect.height) * canvasH,
  })

  for (const stroke of strokes) {
    const points = stroke.points ?? []
    if (points.length === 0) continue

    const lineWidth = Math.max(1, (stroke.width || 3) * (canvasW / (rect.width * WORLD_WIDTH)))
    ctx.strokeStyle = stroke.color || '#111827'
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    const first = toLocal(points[0].x, points[0].y)
    ctx.moveTo(first.x, first.y)
    if (points.length === 1) {
      ctx.lineTo(first.x + 0.01, first.y)
    } else {
      for (let i = 1; i < points.length; i += 1) {
        const p = toLocal(points[i].x, points[i].y)
        ctx.lineTo(p.x, p.y)
      }
    }
    ctx.stroke()
  }

  return canvas.toDataURL('image/png')
}
