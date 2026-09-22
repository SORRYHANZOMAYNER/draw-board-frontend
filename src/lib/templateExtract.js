import {
  buildCanvasStateFromEvents,
  strokeIntersectsRect,
  imageIntersectsRect,
  stickerIntersectsRect,
  textIntersectsRect,
  rectsIntersect,
} from './canvasClear.js'
import { shapeIntersectsRect } from './shapeDraw.js'
import { rasterizeStrokesInRect } from './templateRasterize.js'
import { uuid } from './uuid.js'
import { MIN_SHAPE_SIZE } from '../constants/board.js'

function relX(value, rect) {
  return value - rect.x
}

function relY(value, rect) {
  return value - rect.y
}

function strokeTouchesRect(stroke, rect) {
  if (strokeIntersectsRect(stroke, rect)) return true
  const points = stroke.points ?? []
  if (points.length === 0) return false
  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return rectsIntersect(
    { x: minX, y: minY, width: Math.max(maxX - minX, 0.0001), height: Math.max(maxY - minY, 0.0001) },
    rect
  )
}

/**
 * Собирает шаблон в формате бэкенда:
 * bounds = { width, height } в тех же 0..1 единицах, что и доска;
 * events — обычные DrawingEvent, координаты относительно левого верхнего угла выделения
 * (x' = x - rect.x). При вставке бэкенд делает anchor + value * scale.
 */
export function extractTemplateForApi(publicCanvasEvents, stickersMap, textsMap, rect) {
  if (!rect || rect.width < MIN_SHAPE_SIZE || rect.height < MIN_SHAPE_SIZE) {
    return { bounds: null, events: [], previewData: null, isEmpty: true }
  }

  const state = buildCanvasStateFromEvents(publicCanvasEvents)
  const events = []
  const strokesInRect = []

  for (const [, stroke] of state.strokePaths) {
    if (strokeTouchesRect(stroke, rect)) {
      strokesInRect.push(stroke)
    }
  }

  const strokeRaster = rasterizeStrokesInRect(strokesInRect, rect)
  if (strokeRaster) {
    events.unshift({
      type: 'IMAGE_ADD',
      imageId: uuid(),
      x: 0,
      y: 0,
      imageWidth: rect.width,
      imageHeight: rect.height,
      data: strokeRaster,
    })
  }

  for (const [, shape] of state.shapes) {
    if (!shapeIntersectsRect(shape, rect)) continue
    events.push({
      type: 'SHAPE_ADD',
      shapeId: uuid(),
      shapeType: shape.shapeType,
      x: relX(shape.x, rect),
      y: relY(shape.y, rect),
      width: shape.width,
      height: shape.height,
      color: shape.color || '#111827',
      strokeWidth: shape.strokeWidth || 3,
    })
  }

  for (const [, img] of state.images) {
    if (!imageIntersectsRect(img, rect) || !img.data) continue
    events.push({
      type: 'IMAGE_ADD',
      imageId: uuid(),
      x: relX(img.x, rect),
      y: relY(img.y, rect),
      imageWidth: img.imageWidth,
      imageHeight: img.imageHeight,
      data: img.data,
    })
  }

  for (const [, sticker] of stickersMap) {
    if (!stickerIntersectsRect(sticker, rect)) continue
    events.push({
      type: 'STICKER_ADD',
      stickerId: uuid(),
      x: relX(sticker.x, rect),
      y: relY(sticker.y, rect),
      width: sticker.width,
      height: sticker.height,
      text: sticker.text ?? '',
      color: sticker.color,
    })
  }

  for (const [, text] of textsMap) {
    if (!textIntersectsRect(text, rect)) continue
    events.push({
      type: 'TEXT_ADD',
      textId: uuid(),
      x: relX(text.x, rect),
      y: relY(text.y, rect),
      width: text.width,
      text: text.text ?? '',
      color: text.color,
      fontSize: text.fontSize > 0 ? text.fontSize : 18,
      locked: text.locked === true,
    })
  }

  const previewData = strokeRaster

  return {
    bounds: { width: rect.width, height: rect.height },
    events,
    previewData,
    isEmpty: events.length === 0,
  }
}
