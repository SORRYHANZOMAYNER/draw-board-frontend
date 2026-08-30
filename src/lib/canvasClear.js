import { DEFAULT_STICKER_HEIGHT, DEFAULT_STICKER_WIDTH } from '../constants/board.js'
import { shapeIntersectsRect } from './shapeDraw.js'

export function normalizeRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  return { x: left, y: top, width, height }
}

export function pointInRect(x, y, rect) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  )
}

export function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function strokeIntersectsRect(stroke, rect) {
  const points = stroke.points ?? []
  for (const point of points) {
    if (pointInRect(point.x, point.y, rect)) {
      return true
    }
  }
  return false
}

export function imageIntersectsRect(img, rect) {
  return rectsIntersect(
    {
      x: img.x,
      y: img.y,
      width: img.imageWidth,
      height: img.imageHeight,
    },
    rect
  )
}

export function stickerIntersectsRect(sticker, rect) {
  return rectsIntersect(
    {
      x: sticker.x,
      y: sticker.y,
      width: sticker.width ?? DEFAULT_STICKER_WIDTH,
      height: sticker.height ?? DEFAULT_STICKER_HEIGHT,
    },
    rect
  )
}

export function buildCanvasStateFromEvents(events) {
  const strokePaths = new Map()
  const images = new Map()
  const shapes = new Map()

  for (const event of events) {
    switch (event.type) {
      case 'BOARD_CLEAR':
        strokePaths.clear()
        images.clear()
        shapes.clear()
        break

      case 'REGION_CLEAR': {
        const rect = {
          x: event.x,
          y: event.y,
          width: event.width,
          height: event.height,
        }
        if (rect.width <= 0 || rect.height <= 0) break

        for (const [id, stroke] of [...strokePaths.entries()]) {
          if (strokeIntersectsRect(stroke, rect)) {
            strokePaths.delete(id)
          }
        }

        for (const [id, img] of [...images.entries()]) {
          if (imageIntersectsRect(img, rect)) {
            images.delete(id)
          }
        }

        for (const [id, shape] of [...shapes.entries()]) {
          if (shapeIntersectsRect(shape, rect)) {
            shapes.delete(id)
          }
        }
        break
      }

      case 'SHAPE_ADD':
        shapes.set(event.shapeId, {
          shapeId: event.shapeId,
          shapeType: event.shapeType,
          x: event.x,
          y: event.y,
          width: event.width,
          height: event.height,
          color: event.color || '#111827',
          strokeWidth: event.strokeWidth || 3,
        })
        break

      case 'SHAPE_RESIZE': {
        const shape = shapes.get(event.shapeId)
        if (shape) {
          if (event.x != null) shape.x = event.x
          if (event.y != null) shape.y = event.y
          if (event.width != null) shape.width = event.width
          if (event.height != null) shape.height = event.height
        }
        break
      }

      case 'SHAPE_DELETE':
        shapes.delete(event.shapeId)
        break

      case 'STROKE_START':
        strokePaths.set(event.strokeId, {
          color: event.color || '#000000',
          width: event.width || 3,
          points: [{ x: event.x, y: event.y }],
        })
        break

      case 'STROKE_MOVE': {
        const stroke = strokePaths.get(event.strokeId)
        if (stroke) {
          stroke.points.push({ x: event.x, y: event.y })
        }
        break
      }

      case 'STROKE_END':
        break

      case 'IMAGE_ADD':
        images.set(event.imageId, {
          imageId: event.imageId,
          x: event.x,
          y: event.y,
          imageWidth: event.imageWidth,
          imageHeight: event.imageHeight,
          data: event.data,
          element: null,
        })
        break

      case 'IMAGE_MOVE': {
        const img = images.get(event.imageId)
        if (img) {
          img.x = event.x
          img.y = event.y
        }
        break
      }

      case 'IMAGE_RESIZE': {
        const img = images.get(event.imageId)
        if (img) {
          if (event.x != null) img.x = event.x
          if (event.y != null) img.y = event.y
          if (event.imageWidth != null) img.imageWidth = event.imageWidth
          if (event.imageHeight != null) img.imageHeight = event.imageHeight
        }
        break
      }

      case 'IMAGE_DELETE':
        images.delete(event.imageId)
        break

      default:
        break
    }
  }

  return { strokePaths, images, shapes }
}

export function applyClearEventsToStickers(events) {
  const stickers = new Map()

  for (const event of events) {
    if (event.type === 'BOARD_CLEAR') {
      stickers.clear()
      continue
    }

    if (event.type === 'REGION_CLEAR') {
      const rect = {
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
      }

      for (const [id, sticker] of [...stickers.entries()]) {
        if (stickerIntersectsRect(sticker, rect)) {
          stickers.delete(id)
        }
      }
      continue
    }

    if (event.type === 'SHAPE_DELETE') {
      continue
    }

    if (event.type === 'STICKER_ADD') {
      stickers.set(event.stickerId, {
        stickerId: event.stickerId,
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
        text: event.text ?? '',
        color: event.color,
      })
      continue
    }

    const sticker = stickers.get(event.stickerId)
    if (!sticker) continue

    if (event.type === 'STICKER_MOVE') {
      if (event.x != null) sticker.x = event.x
      if (event.y != null) sticker.y = event.y
    }

    if (event.type === 'STICKER_TEXT') {
      sticker.text = event.text ?? ''
    }

    if (event.type === 'STICKER_DELETE') {
      stickers.delete(event.stickerId)
    }
  }

  return stickers
}
