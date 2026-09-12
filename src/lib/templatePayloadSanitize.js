import { MIN_SHAPE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from '../constants/board.js'

const MIN_NORM = MIN_SHAPE_SIZE
const MAX_NORM = 1
/** Бэкенд не принимает bbox, упирающийся в край доски (width ≈ 1). */
const MAX_BBOX_EXTENT = 0.99

function roundNorm(value) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** Clip axis-aligned box in template space (0..1) to unit square. */
export function sanitizeNormalizedBox(box) {
  let { x, y, width, height } = box

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  if (width < 0) {
    x += width
    width = Math.abs(width)
  }
  if (height < 0) {
    y += height
    height = Math.abs(height)
  }

  if (x < 0) {
    width += x
    x = 0
  }
  if (y < 0) {
    height += y
    y = 0
  }

  width = Math.min(width, MAX_NORM - x)
  height = Math.min(height, MAX_NORM - y)

  if (width < MIN_NORM || height < MIN_NORM) {
    return null
  }

  return {
    x: roundNorm(x),
    y: roundNorm(y),
    width: roundNorm(width),
    height: roundNorm(height),
  }
}

function sanitizeLineShape(shape) {
  const x1 = clamp(shape.x, 0, MAX_NORM)
  const y1 = clamp(shape.y, 0, MAX_NORM)
  const x2 = clamp(shape.x + shape.width, 0, MAX_NORM)
  const y2 = clamp(shape.y + shape.height, 0, MAX_NORM)

  const width = x2 - x1
  const height = y2 - y1
  if (Math.hypot(width, height) < MIN_NORM) {
    return null
  }

  return {
    ...shape,
    x: roundNorm(x1),
    y: roundNorm(y1),
    width: roundNorm(width),
    height: roundNorm(height),
  }
}

export function sanitizeTemplatePayload(payload) {
  const shapes = []
  for (const shape of payload.shapes ?? []) {
    const next = shape.shapeType === 'line'
      ? sanitizeLineShape(shape)
      : sanitizeNormalizedBox({
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        })
    if (!next) continue
    shapes.push({
      ...shape,
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
    })
  }

  const images = []
  for (const img of payload.images ?? []) {
    if (!img.data) continue
    const box = sanitizeNormalizedBox({
      x: img.x,
      y: img.y,
      width: img.imageWidth,
      height: img.imageHeight,
    })
    if (!box) continue
    images.push({
      ...img,
      data: img.data,
      x: box.x,
      y: box.y,
      imageWidth: box.width,
      imageHeight: box.height,
    })
  }

  const stickers = []
  for (const sticker of payload.stickers ?? []) {
    const box = sanitizeNormalizedBox({
      x: sticker.x,
      y: sticker.y,
      width: sticker.width,
      height: sticker.height,
    })
    if (!box) continue
    stickers.push({
      ...sticker,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    })
  }

  const texts = []
  for (const text of payload.texts ?? []) {
    const box = sanitizeNormalizedBox({
      x: text.x,
      y: text.y,
      width: text.width,
      height: Math.max(text.fontSize ?? 0.02, 0.02),
    })
    if (!box) continue
    texts.push({
      ...text,
      x: box.x,
      y: box.y,
      width: box.width,
      fontSize: clamp(text.fontSize ?? 0.02, MIN_NORM / 4, MAX_NORM),
    })
  }

  return {
    ...payload,
    shapes,
    images,
    stickers,
    texts,
    strokeRaster: payload.strokeRaster?.data ? payload.strokeRaster : null,
  }
}

/** Capture rect may be normalized (0..1) or legacy world pixels (0..10000). */
export function normalizeCaptureRect(rect) {
  if (!rect || rect.width == null || rect.height == null) {
    return null
  }

  let { x = 0, y = 0, width, height } = rect

  if (!Number.isFinite(x)) x = 0
  if (!Number.isFinite(y)) y = 0
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  // Только явные world pixels (0..10000). Не делить на 10000 значения 1..1.5 — это доли доски.
  const looksLikeWorldSpace =
    width > 2
    || height > 2
    || x > 2
    || y > 2

  if (looksLikeWorldSpace) {
    return {
      x: x / WORLD_WIDTH,
      y: y / WORLD_HEIGHT,
      width: width / WORLD_WIDTH,
      height: height / WORLD_HEIGHT,
    }
  }

  return { x, y, width, height }
}

export function buildSourceBboxForApi(rect) {
  const norm = normalizeCaptureRect(rect)
  if (!norm) return null

  let x = clamp(norm.x, 0, MAX_NORM)
  let y = clamp(norm.y, 0, MAX_NORM)
  let width = norm.width
  let height = norm.height

  if (width < 0) {
    x += width
    width = Math.abs(width)
  }
  if (height < 0) {
    y += height
    height = Math.abs(height)
  }

  x = clamp(x, 0, MAX_NORM)
  y = clamp(y, 0, MAX_NORM)
  width = Math.min(width, MAX_BBOX_EXTENT - x, MAX_NORM - x)
  height = Math.min(height, MAX_BBOX_EXTENT - y, MAX_NORM - y)

  if (width < MIN_NORM || height < MIN_NORM) {
    return null
  }

  return {
    x: roundNorm(x),
    y: roundNorm(y),
    width: roundNorm(width),
    height: roundNorm(height),
  }
}

export function isPayloadEmpty(payload) {
  return (
    !payload.strokeRaster?.data
    && (payload.shapes?.length ?? 0) === 0
    && (payload.images?.length ?? 0) === 0
    && (payload.stickers?.length ?? 0) === 0
    && (payload.texts?.length ?? 0) === 0
  )
}
