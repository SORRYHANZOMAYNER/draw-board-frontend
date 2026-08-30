import { WORLD_WIDTH, WORLD_HEIGHT, MIN_SHAPE_SIZE } from '../constants/board.js'

function normalizeDragRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  return {
    x: left,
    y: top,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export function buildShapeFromDrag(startX, startY, currentX, currentY, shapeType) {
  if (shapeType === 'line') {
    return {
      x: startX,
      y: startY,
      width: currentX - startX,
      height: currentY - startY,
    }
  }

  return normalizeDragRect(startX, startY, currentX, currentY)
}

export function isShapeLargeEnough(shape, shapeType) {
  if (shapeType === 'line') {
    return Math.hypot(shape.width, shape.height) >= MIN_SHAPE_SIZE
  }

  return shape.width >= MIN_SHAPE_SIZE && shape.height >= MIN_SHAPE_SIZE
}

export function getLineEndpoints(shape, worldToScreen) {
  const p1 = worldToScreen(shape.x * WORLD_WIDTH, shape.y * WORLD_HEIGHT)
  const p2 = worldToScreen(
    (shape.x + shape.width) * WORLD_WIDTH,
    (shape.y + shape.height) * WORLD_HEIGHT
  )
  return { p1, p2 }
}

export function getShapeScreenRect(shape, worldToScreen, zoom) {
  if (shape.shapeType === 'line') {
    const { p1, p2 } = getLineEndpoints(shape, worldToScreen)
    const x = Math.min(p1.x, p2.x)
    const y = Math.min(p1.y, p2.y)
    return {
      x,
      y,
      w: Math.max(Math.abs(p2.x - p1.x), 1),
      h: Math.max(Math.abs(p2.y - p1.y), 1),
      p1,
      p2,
    }
  }

  const tl = worldToScreen(shape.x * WORLD_WIDTH, shape.y * WORLD_HEIGHT)
  const w = shape.width * WORLD_WIDTH * zoom
  const h = shape.height * WORLD_HEIGHT * zoom
  return { x: tl.x, y: tl.y, w, h }
}

export function drawShape(ctx, shape, worldToScreen, zoom) {
  const rect = getShapeScreenRect(shape, worldToScreen, zoom)
  const lineWidth = (shape.strokeWidth || 3) * zoom

  ctx.strokeStyle = shape.color || '#111827'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (shape.shapeType) {
    case 'line': {
      const { p1, p2 } = getLineEndpoints(shape, worldToScreen)
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
      break
    }

    case 'rect':
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
      break

    case 'triangle':
      ctx.beginPath()
      ctx.moveTo(rect.x + rect.w / 2, rect.y)
      ctx.lineTo(rect.x + rect.w, rect.y + rect.h)
      ctx.lineTo(rect.x, rect.y + rect.h)
      ctx.closePath()
      ctx.stroke()
      break

    case 'ellipse':
      ctx.beginPath()
      ctx.ellipse(
        rect.x + rect.w / 2,
        rect.y + rect.h / 2,
        Math.abs(rect.w / 2),
        Math.abs(rect.h / 2),
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()
      break

    case 'cylinder': {
      const capH = Math.max(Math.abs(rect.h) * 0.18, 4)
      const left = rect.x
      const right = rect.x + rect.w
      const top = rect.y
      const bottom = rect.y + rect.h
      const cx = rect.x + rect.w / 2
      const rx = Math.abs(rect.w / 2)

      ctx.beginPath()
      ctx.ellipse(cx, top + capH / 2, rx, capH / 2, 0, 0, Math.PI * 2)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(left, top + capH / 2)
      ctx.lineTo(left, bottom - capH / 2)
      ctx.moveTo(right, top + capH / 2)
      ctx.lineTo(right, bottom - capH / 2)
      ctx.stroke()

      ctx.beginPath()
      ctx.ellipse(cx, bottom - capH / 2, rx, capH / 2, 0, 0, Math.PI)
      ctx.stroke()
      break
    }

    default:
      break
  }
}

export function drawShapeSelection(ctx, shape, worldToScreen, zoom) {
  const rect = getShapeScreenRect(shape, worldToScreen, zoom)

  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
  ctx.setLineDash([])

  const handles = shape.shapeType === 'line' && rect.p1 && rect.p2
    ? [
        { x: rect.p1.x, y: rect.p1.y },
        { x: rect.p2.x, y: rect.p2.y },
      ]
    : [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x, y: rect.y + rect.h },
        { x: rect.x + rect.w, y: rect.y + rect.h },
      ]

  handles.forEach((h) => {
    ctx.fillStyle = '#2563eb'
    ctx.fillRect(h.x - 5, h.y - 5, 10, 10)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.strokeRect(h.x - 5, h.y - 5, 10, 10)
  })
}

export function hitTestShapeHandle(screenX, screenY, shape, worldToScreen, zoom, handleRadius = 10) {
  const rect = getShapeScreenRect(shape, worldToScreen, zoom)

  if (shape.shapeType === 'line' && rect.p1 && rect.p2) {
    const endpoints = [
      { corner: 'start', x: rect.p1.x, y: rect.p1.y },
      { corner: 'end', x: rect.p2.x, y: rect.p2.y },
    ]

    for (const h of endpoints) {
      if (Math.hypot(screenX - h.x, screenY - h.y) <= handleRadius) {
        return h.corner
      }
    }
    return null
  }

  const handles = [
    { corner: 'tl', x: rect.x, y: rect.y },
    { corner: 'tr', x: rect.x + rect.w, y: rect.y },
    { corner: 'bl', x: rect.x, y: rect.y + rect.h },
    { corner: 'br', x: rect.x + rect.w, y: rect.y + rect.h },
  ]

  for (const h of handles) {
    if (Math.hypot(screenX - h.x, screenY - h.y) <= handleRadius) {
      return h.corner
    }
  }
  return null
}

export function shapeIntersectsRect(shape, rect) {
  if (shape.shapeType === 'line') {
    const x1 = shape.x
    const y1 = shape.y
    const x2 = shape.x + shape.width
    const y2 = shape.y + shape.height
    const shapeRect = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(shape.width),
      height: Math.abs(shape.height),
    }
    return (
      shapeRect.x < rect.x + rect.width &&
      shapeRect.x + shapeRect.width > rect.x &&
      shapeRect.y < rect.y + rect.height &&
      shapeRect.y + shapeRect.height > rect.y
    )
  }

  const shapeRect = {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
  }
  return (
    shapeRect.x < rect.x + rect.width &&
    shapeRect.x + shapeRect.width > rect.x &&
    shapeRect.y < rect.y + rect.height &&
    shapeRect.y + shapeRect.height > rect.y
  )
}
