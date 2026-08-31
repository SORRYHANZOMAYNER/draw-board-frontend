export const WORLD_WIDTH = 10000
export const WORLD_HEIGHT = 10000
export const DEFAULT_STICKER_WIDTH = 0.08
export const DEFAULT_STICKER_HEIGHT = 0.08
export const STICKER_COLORS = ['#fef08a', '#bfdbfe', '#fecaca', '#bbf7d0']

export const DEFAULT_STROKE_COLOR = '#111827'
export const DEFAULT_STROKE_WIDTH = 3
export const MIN_SHAPE_SIZE = 0.005

export const DRAW_COLORS = [
  '#111827',
  '#dc2626',
  '#2563eb',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#ffffff',
]

export const DEFAULT_TEXT_FONT_SIZE = 18
export const DEFAULT_TEXT_WIDTH = 0.14

/** Screen px at placement time → world font size (scales with board zoom). */
export function textFontSizeForZoom(screenFontSize, zoom) {
  return screenFontSize / Math.max(zoom, 0.02)
}

export const DEFAULT_IMAGE_SCREEN_WIDTH = 400

/** Pixel size → normalized world size so the image looks consistent on screen at any zoom. */
export function imageDimensionsForZoom(pixelWidth, pixelHeight, zoom, viewportWidth, viewportHeight) {
  const safeZoom = Math.max(zoom, 0.02)
  const maxScreenW = Math.min(Math.max(viewportWidth * 0.45, 240), DEFAULT_IMAGE_SCREEN_WIDTH)
  const maxScreenH = Math.min(Math.max(viewportHeight * 0.45, 180), DEFAULT_IMAGE_SCREEN_WIDTH)

  let screenW = Math.min(pixelWidth, maxScreenW)
  let screenH = (pixelHeight / pixelWidth) * screenW

  if (screenH > maxScreenH) {
    screenH = maxScreenH
    screenW = (pixelWidth / pixelHeight) * screenH
  }

  return {
    imageWidth: screenW / (WORLD_WIDTH * safeZoom),
    imageHeight: screenH / (WORLD_HEIGHT * safeZoom),
  }
}

export const SHAPE_TOOLS = [
  { id: 'line', title: 'Линия' },
  { id: 'rect', title: 'Квадрат' },
  { id: 'triangle', title: 'Треугольник' },
  { id: 'ellipse', title: 'Круг' },
  { id: 'cylinder', title: 'Цилиндр' },
]
