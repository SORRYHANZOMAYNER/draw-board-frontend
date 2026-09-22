import { WORLD_HEIGHT } from '../constants/board.js'
import { uuid } from './uuid.js'

export function denormalizeRect(targetRect) {
  return targetRect
}

export function worldPointFromNormalized(nx, ny, rect) {
  return {
    x: rect.x + nx * rect.width,
    y: rect.y + ny * rect.height,
  }
}

export function worldSizeFromNormalized(nw, nh, rect) {
  return {
    width: nw * rect.width,
    height: nh * rect.height,
  }
}

export function createIdRemapper() {
  const map = new Map()
  return {
    id(prefix) {
      const key = prefix
      if (!map.has(key)) {
        map.set(key, uuid())
      }
      return map.get(key)
    },
    idForIndex(prefix, index) {
      const key = `${prefix}:${index}`
      if (!map.has(key)) {
        map.set(key, uuid())
      }
      return map.get(key)
    },
    getAll() {
      return map
    },
  }
}

/**
 * Expand normalized template payload into board events for placement in targetRect.
 */
export function expandPayloadToBoardEvents(payload, targetRect, remapper) {
  const canvasEvents = []
  const stickerEvents = []
  const textEvents = []

  const members = {
    strokeRasterImageId: null,
    shapeIds: [],
    imageIds: [],
    stickerIds: [],
    textIds: [],
  }

  if (payload.strokeRaster?.data) {
    const imageId = remapper.id('strokeRaster')
    members.strokeRasterImageId = imageId
    canvasEvents.push({
      type: 'IMAGE_ADD',
      imageId,
      x: targetRect.x,
      y: targetRect.y,
      imageWidth: targetRect.width,
      imageHeight: targetRect.height,
      data: payload.strokeRaster.data,
    })
  }

  payload.shapes?.forEach((shape, index) => {
    const shapeId = remapper.idForIndex('shape', index)
    members.shapeIds.push(shapeId)
    const pos = worldPointFromNormalized(shape.x, shape.y, targetRect)
    const size = worldSizeFromNormalized(shape.width, shape.height, targetRect)
    canvasEvents.push({
      type: 'SHAPE_ADD',
      shapeId,
      shapeType: shape.shapeType,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      color: shape.color,
      strokeWidth: shape.strokeWidth,
    })
  })

  payload.images?.forEach((img, index) => {
    if (!img.data) return
    const imageId = remapper.idForIndex('image', index)
    members.imageIds.push(imageId)
    const pos = worldPointFromNormalized(img.x, img.y, targetRect)
    const size = worldSizeFromNormalized(img.imageWidth, img.imageHeight, targetRect)
    canvasEvents.push({
      type: 'IMAGE_ADD',
      imageId,
      x: pos.x,
      y: pos.y,
      imageWidth: size.width,
      imageHeight: size.height,
      data: img.data,
    })
  })

  payload.stickers?.forEach((sticker, index) => {
    const stickerId = remapper.idForIndex('sticker', index)
    members.stickerIds.push(stickerId)
    const pos = worldPointFromNormalized(sticker.x, sticker.y, targetRect)
    const size = worldSizeFromNormalized(sticker.width, sticker.height, targetRect)
    stickerEvents.push({
      type: 'STICKER_ADD',
      stickerId,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      text: sticker.text ?? '',
      color: sticker.color,
    })
  })

  payload.texts?.forEach((text, index) => {
    const textId = remapper.idForIndex('text', index)
    members.textIds.push(textId)
    const pos = worldPointFromNormalized(text.x, text.y, targetRect)
    const width = text.width * targetRect.width
    const fontSize = text.fontSize * targetRect.height * WORLD_HEIGHT
    textEvents.push({
      type: 'TEXT_ADD',
      textId,
      x: pos.x,
      y: pos.y,
      width,
      text: text.text ?? '',
      color: text.color,
      fontSize,
      locked: text.locked === true,
    })
  })

  return { canvasEvents, stickerEvents, textEvents, members }
}

/**
 * Build update events when template instance bbox changes from prevRect to nextRect.
 */
export function buildInstanceRectSyncEvents(payload, members, nextRect) {
  const canvasEvents = []
  const stickerEvents = []
  const textEvents = []

  if (payload.strokeRaster?.data && members.strokeRasterImageId) {
    canvasEvents.push({
      type: 'IMAGE_RESIZE',
      imageId: members.strokeRasterImageId,
      x: nextRect.x,
      y: nextRect.y,
      imageWidth: nextRect.width,
      imageHeight: nextRect.height,
    })
  }

  payload.shapes?.forEach((shape, index) => {
    const shapeId = members.shapeIds[index]
    if (!shapeId) return
    const pos = worldPointFromNormalized(shape.x, shape.y, nextRect)
    const size = worldSizeFromNormalized(shape.width, shape.height, nextRect)
    canvasEvents.push({
      type: 'SHAPE_RESIZE',
      shapeId,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    })
  })

  payload.images?.forEach((img, index) => {
    const imageId = members.imageIds[index]
    if (!imageId || !img.data) return
    const pos = worldPointFromNormalized(img.x, img.y, nextRect)
    const size = worldSizeFromNormalized(img.imageWidth, img.imageHeight, nextRect)
    canvasEvents.push({
      type: 'IMAGE_RESIZE',
      imageId,
      x: pos.x,
      y: pos.y,
      imageWidth: size.width,
      imageHeight: size.height,
    })
  })

  payload.stickers?.forEach((sticker, index) => {
    const stickerId = members.stickerIds[index]
    if (!stickerId) return
    const pos = worldPointFromNormalized(sticker.x, sticker.y, nextRect)
    const size = worldSizeFromNormalized(sticker.width, sticker.height, nextRect)
    stickerEvents.push({
      type: 'STICKER_ADD',
      stickerId,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      text: sticker.text ?? '',
      color: sticker.color,
    })
  })

  payload.texts?.forEach((text, index) => {
    const textId = members.textIds[index]
    if (!textId) return
    const pos = worldPointFromNormalized(text.x, text.y, nextRect)
    const width = text.width * nextRect.width
    const fontSize = text.fontSize * nextRect.height * WORLD_HEIGHT
    textEvents.push({
      type: 'TEXT_ADD',
      textId,
      x: pos.x,
      y: pos.y,
      width,
      text: text.text ?? '',
      color: text.color,
      fontSize,
      locked: text.locked === true,
    })
  })

  return { canvasEvents, stickerEvents, textEvents }
}
