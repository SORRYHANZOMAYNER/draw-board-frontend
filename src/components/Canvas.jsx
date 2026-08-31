import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DEFAULT_STROKE_WIDTH,
  MIN_SHAPE_SIZE,
  imageDimensionsForZoom,
} from '../constants/board.js'
import { buildCanvasStateFromEvents, mergeCanvasStates, normalizeRect } from '../lib/canvasClear.js'
import {
  drawShape,
  drawShapeSelection,
  hitTestShapeHandle,
  buildShapeFromDrag,
  isShapeLargeEnough,
} from '../lib/shapeDraw.js'
const MAX_IMAGE_PX = 800
const MIN_IMAGE_SIZE = 0.02
const HANDLE_RADIUS = 14

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_PX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
        })
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const Canvas = forwardRef(function Canvas(
  {
    mode,
    shapeType,
    strokeColor = '#111827',
    onModeChange,
    sendDraw,
    snapshotEvents = [],
    registerRemoteHandler,
    onCameraChange,
    onBoardClick,
    onImageSelectionChange,
    onImageContextMenu,
    incognitoMode = false,
    onClearApplied,
    onIncognitoCanvasChange,
  },
  ref
) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const strokeColorRef = useRef(strokeColor)
  const shapeTypeRef = useRef(shapeType)

  const [, setSelectedImageId] = useState(null)

  const selectedImageIdRef = useRef(null)
  const redrawAllRef = useRef(() => {})

  const isDrawing = useRef(false)
  const isPanning = useRef(false)
  const strokeId = useRef(null)
  const lastPanPoint = useRef(null)
  const lastTouchDistance = useRef(null)

  const strokes = useRef(new Map())
  const imagesRef = useRef(new Map())
  const shapesRef = useRef(new Map())
  const allEventsRef = useRef([])
  const incognitoEventsRef = useRef([])
  const incognitoModeRef = useRef(incognitoMode)
  const incognitoEntitiesRef = useRef(new Set())
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const dragRef = useRef(null)
  const shapeDragRef = useRef(null)
  const pendingShapeRef = useRef(null)
  const shapeResizeDragRef = useRef(null)
  const regionClearDragRef = useRef(null)
  const regionClearPointerIdRef = useRef(null)
  const selectPointerIdRef = useRef(null)

  const [regionClearPreview, setRegionClearPreview] = useState(null)
  const [, forceRender] = useState(0)

  const notifyCameraChange = useCallback(() => {
    onCameraChange?.({ ...cameraRef.current })
  }, [onCameraChange])

  const setSelection = useCallback((imageId) => {
    selectedImageIdRef.current = imageId
    setSelectedImageId(imageId)
    onImageSelectionChange?.(imageId)
  }, [onImageSelectionChange])

  const clearSelection = useCallback(() => {
    selectedImageIdRef.current = null
    setSelectedImageId(null)
    onImageSelectionChange?.(null)
  }, [onImageSelectionChange])

  useEffect(() => {
    strokeColorRef.current = strokeColor
  }, [strokeColor])

  useEffect(() => {
    shapeTypeRef.current = shapeType
  }, [shapeType])

  useEffect(() => {
    incognitoModeRef.current = incognitoMode
  }, [incognitoMode])

  const resolveEventsRef = useCallback((layer = 'auto') => {
    if (layer === 'public') return allEventsRef
    if (layer === 'private') return incognitoEventsRef
    return incognitoModeRef.current ? incognitoEventsRef : allEventsRef
  }, [])

  const entityKeyFromEvent = useCallback((event) => {
    if (event.strokeId) return `stroke:${event.strokeId}`
    if (event.imageId) return `image:${event.imageId}`
    if (event.shapeId) return `shape:${event.shapeId}`
    return null
  }, [])

  const markIncognitoEntity = useCallback((event) => {
    const key = entityKeyFromEvent(event)
    if (key && incognitoModeRef.current) {
      incognitoEntitiesRef.current.add(key)
    }
  }, [entityKeyFromEvent])

  const isPrivateEntity = useCallback((event) => {
    const key = entityKeyFromEvent(event)
    if (key && incognitoEntitiesRef.current.has(key)) return true
    if (!key || !incognitoModeRef.current) return false
    return incognitoEventsRef.current.some((stored) => entityKeyFromEvent(stored) === key)
  }, [entityKeyFromEvent])

  const notifyIncognitoCanvasChange = useCallback(() => {
    onIncognitoCanvasChange?.({
      canvasEvents: [...incognitoEventsRef.current],
      entityKeys: [...incognitoEntitiesRef.current],
    })
  }, [onIncognitoCanvasChange])

  const lockPendingShape = useCallback(() => {
    pendingShapeRef.current = null
    shapeResizeDragRef.current = null
  }, [])

  useEffect(() => {
    if (mode === 'draw') {
      clearSelection()
      dragRef.current = null
      redrawAllRef.current()
    }
    if (mode !== 'shape') {
      lockPendingShape()
      shapeDragRef.current = null
    }
    if (mode !== 'region-clear') {
      regionClearDragRef.current = null
      regionClearPointerIdRef.current = null
      setRegionClearPreview(null)
    }
  }, [mode, clearSelection, lockPendingShape])

  const worldToScreen = useCallback((worldX, worldY) => {
    const cam = cameraRef.current
    return {
      x: (worldX - cam.x) * cam.zoom,
      y: (worldY - cam.y) * cam.zoom,
    }
  }, [])

  const screenToWorld = useCallback((screenX, screenY) => {
    const cam = cameraRef.current
    return {
      x: cam.x + screenX / cam.zoom,
      y: cam.y + screenY / cam.zoom,
    }
  }, [])

  const drawSegmentOnScreen = useCallback((sx1, sy1, sx2, sy2, color, width) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(sx1, sy1)
    ctx.lineTo(sx2, sy2)
    ctx.strokeStyle = color || '#000000'
    ctx.lineWidth = (width || 3) * cameraRef.current.zoom
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [])

  const drawSegmentWorld = useCallback((nx1, ny1, nx2, ny2, color, width) => {
    const s1 = worldToScreen(nx1 * WORLD_WIDTH, ny1 * WORLD_HEIGHT)
    const s2 = worldToScreen(nx2 * WORLD_WIDTH, ny2 * WORLD_HEIGHT)
    drawSegmentOnScreen(s1.x, s1.y, s2.x, s2.y, color, width)
  }, [worldToScreen, drawSegmentOnScreen])

  const getImageScreenRect = useCallback((img) => {
    const tl = worldToScreen(img.x * WORLD_WIDTH, img.y * WORLD_HEIGHT)
    const w = img.imageWidth * WORLD_WIDTH * cameraRef.current.zoom
    const h = img.imageHeight * WORLD_HEIGHT * cameraRef.current.zoom
    return { x: tl.x, y: tl.y, w, h }
  }, [worldToScreen])

  const drawImages = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    imagesRef.current.forEach((imgObj) => {
      if (!imgObj.element) return
      const rect = getImageScreenRect(imgObj)
      ctx.drawImage(imgObj.element, rect.x, rect.y, rect.w, rect.h)
    })
  }, [getImageScreenRect])

  const drawSelection = useCallback(() => {
    const selectedId = selectedImageIdRef.current
    if (!selectedId) return

    const img = imagesRef.current.get(selectedId)
    if (!img) return

    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    const rect = getImageScreenRect(img)

    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
    ctx.setLineDash([])

    const handles = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
    ]

    handles.forEach((h) => {
      const half = HANDLE_RADIUS / 2
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(h.x - half, h.y - half, HANDLE_RADIUS, HANDLE_RADIUS)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(h.x - half, h.y - half, HANDLE_RADIUS, HANDLE_RADIUS)
    })
  }, [getImageScreenRect])

  const loadImageElement = useCallback((imgObj) => {
    return new Promise((resolve) => {
      if (imgObj.element) {
        resolve(imgObj)
        return
      }
      const img = new Image()
      img.onload = () => {
        imgObj.element = img
        resolve(imgObj)
      }
      img.src = imgObj.data
    })
  }, [])

  const drawShapes = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    const zoom = cameraRef.current.zoom
    shapesRef.current.forEach((shape) => {
      drawShape(ctx, shape, worldToScreen, zoom)
    })
  }, [worldToScreen])

  const drawShapeOverlays = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    const zoom = cameraRef.current.zoom

    const drag = shapeDragRef.current
    if (drag && mode === 'shape') {
      const shapeProps = buildShapeFromDrag(
        drag.startX,
        drag.startY,
        drag.currentX,
        drag.currentY,
        shapeTypeRef.current
      )
      drawShape(ctx, {
        shapeType: shapeTypeRef.current,
        ...shapeProps,
        color: strokeColorRef.current,
        strokeWidth: DEFAULT_STROKE_WIDTH,
      }, worldToScreen, zoom)
    }

    const pending = pendingShapeRef.current
    if (pending) {
      const shape = shapesRef.current.get(pending.shapeId)
      if (shape) {
        drawShapeSelection(ctx, shape, worldToScreen, zoom)
      }
    }
  }, [mode, worldToScreen])

  const updateRegionClearPreview = useCallback((drag) => {
    if (!drag) {
      setRegionClearPreview(null)
      return
    }

    const rect = normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY)
    const tl = worldToScreen(rect.x * WORLD_WIDTH, rect.y * WORLD_HEIGHT)
    const w = rect.width * WORLD_WIDTH * cameraRef.current.zoom
    const h = rect.height * WORLD_HEIGHT * cameraRef.current.zoom
    setRegionClearPreview({ left: tl.x, top: tl.y, width: w, height: h })
  }, [worldToScreen])

  const drawImagesOnTop = useCallback(() => {
    drawImages()
    drawShapes()
    drawSelection()
    drawShapeOverlays()
  }, [drawImages, drawShapes, drawSelection, drawShapeOverlays])

  const applyStrokeEvent = useCallback((event, { refreshImages = false } = {}) => {
    const { type, strokeId: id, x, y, color, width } = event

    if (type === 'STROKE_START') {
      strokes.current.set(id, { color: color || '#000000', width: width || 3, lastX: x, lastY: y })
      return
    }

    if (type === 'STROKE_MOVE') {
      const stroke = strokes.current.get(id)
      if (!stroke) return
      drawSegmentWorld(stroke.lastX, stroke.lastY, x, y, stroke.color, stroke.width)
      stroke.lastX = x
      stroke.lastY = y
      if (refreshImages) {
        drawImagesOnTop()
      }
      return
    }

    if (type === 'STROKE_END') {
      strokes.current.delete(id)
    }
  }, [drawSegmentWorld, drawImagesOnTop])

  const applyImageAdd = useCallback(async (event) => {
    const imgObj = {
      imageId: event.imageId,
      x: event.x,
      y: event.y,
      imageWidth: event.imageWidth,
      imageHeight: event.imageHeight,
      data: event.data,
      element: null,
    }
    imagesRef.current.set(event.imageId, imgObj)
    await loadImageElement(imgObj)
  }, [loadImageElement])

  const applyImageMove = useCallback((event) => {
    const img = imagesRef.current.get(event.imageId)
    if (!img) return
    img.x = event.x
    img.y = event.y
  }, [])

  const applyImageResize = useCallback((event) => {
    const img = imagesRef.current.get(event.imageId)
    if (!img) return
    if (event.x != null) img.x = event.x
    if (event.y != null) img.y = event.y
    if (event.imageWidth != null) img.imageWidth = event.imageWidth
    if (event.imageHeight != null) img.imageHeight = event.imageHeight
  }, [])

  const applyImageDelete = useCallback((event) => {
    imagesRef.current.delete(event.imageId)
    if (selectedImageIdRef.current === event.imageId) {
      clearSelection()
    }
  }, [clearSelection])

  const redrawAll = useCallback(async () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const publicState = buildCanvasStateFromEvents(allEventsRef.current)
    const privateState = buildCanvasStateFromEvents(incognitoEventsRef.current)
    const { strokePaths, images: builtImages, shapes } = mergeCanvasStates(publicState, privateState)
    shapesRef.current = shapes

    strokes.current.clear()
    const previousImages = imagesRef.current
    const drag = dragRef.current
    let preservedLive = null
    if (drag && (drag.type === 'move' || drag.type === 'resize')) {
      const live = previousImages.get(drag.imageId)
      if (live) {
        preservedLive = {
          x: live.x,
          y: live.y,
          imageWidth: live.imageWidth,
          imageHeight: live.imageHeight,
        }
      }
    }
    imagesRef.current.clear()

    for (const [, img] of builtImages) {
      const previous = previousImages.get(img.imageId)
      const merged = preservedLive && img.imageId === drag?.imageId
        ? { ...img, ...preservedLive }
        : img
      imagesRef.current.set(img.imageId, {
        ...merged,
        element: previous?.element ?? null,
      })
    }

    for (const [, img] of builtImages) {
      const existing = imagesRef.current.get(img.imageId)
      if (existing && !existing.element && existing.data) {
        await loadImageElement(existing)
      }
    }

    for (const [, stroke] of strokePaths) {
      const points = stroke.points ?? []
      for (let i = 1; i < points.length; i += 1) {
        drawSegmentWorld(
          points[i - 1].x,
          points[i - 1].y,
          points[i].x,
          points[i].y,
          stroke.color,
          stroke.width
        )
      }
    }

    drawImagesOnTop()
  }, [drawSegmentWorld, drawImagesOnTop, loadImageElement])

  useEffect(() => {
    redrawAllRef.current = redrawAll
  }, [redrawAll])

  const initCamera = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const zoomX = canvas.width / WORLD_WIDTH
    const zoomY = canvas.height / WORLD_HEIGHT
    const zoom = Math.min(zoomX, zoomY) * 0.95

    cameraRef.current = {
      x: WORLD_WIDTH / 2 - canvas.width / (2 * zoom),
      y: WORLD_HEIGHT / 2 - canvas.height / (2 * zoom),
      zoom,
    }

    redrawAllRef.current()
    notifyCameraChange()
    forceRender((n) => n + 1)
  }, [notifyCameraChange])

  const isNewIncognitoCreation = useCallback((event) => {
    if (!incognitoModeRef.current) return false
    return event.type === 'STROKE_START'
      || event.type === 'SHAPE_ADD'
      || event.type === 'IMAGE_ADD'
  }, [])

  const isPrivateEvent = useCallback((event) => (
    isPrivateEntity(event) || isNewIncognitoCreation(event)
  ), [isPrivateEntity, isNewIncognitoCreation])

  const applyClearEvent = useCallback(async () => {
    shapeDragRef.current = null
    lockPendingShape()
    regionClearDragRef.current = null
    setRegionClearPreview(null)
    await redrawAllRef.current()
  }, [lockPendingShape])

  const notifyClearApplied = useCallback((event) => {
    onClearApplied?.({
      ...event,
      incognito: incognitoModeRef.current,
    })
  }, [onClearApplied])

  const persistAndSend = useCallback((event) => {
    if (event.type === 'BOARD_CLEAR') {
      if (incognitoModeRef.current) {
        incognitoEventsRef.current.push(event)
        incognitoEntitiesRef.current.clear()
        notifyIncognitoCanvasChange()
      } else {
        allEventsRef.current.push(event)
        sendDraw(event)
      }
      return
    }

    if (event.type === 'REGION_CLEAR') {
      if (incognitoModeRef.current) {
        incognitoEventsRef.current.push(event)
        notifyIncognitoCanvasChange()
      } else {
        allEventsRef.current.push(event)
        sendDraw(event)
        incognitoEventsRef.current.push({ ...event })
        notifyIncognitoCanvasChange()
      }
      return
    }

    if (event.type === 'STROKE_START' || event.type === 'SHAPE_ADD' || event.type === 'IMAGE_ADD') {
      markIncognitoEntity(event)
    }

    const isPrivate = isPrivateEvent(event)
    const ref = isPrivate ? incognitoEventsRef : allEventsRef
    ref.current.push(event)
    if (!isPrivate) {
      sendDraw(event)
    } else {
      notifyIncognitoCanvasChange()
    }
  }, [sendDraw, markIncognitoEntity, isPrivateEvent, notifyIncognitoCanvasChange])

  const handleEvent = useCallback(async (event, { persist = true, layer = 'auto' } = {}) => {
    const eventsRef = resolveEventsRef(layer)

    if (event.type === 'BOARD_CLEAR' || event.type === 'REGION_CLEAR') {
      if (persist) eventsRef.current.push(event)
      if (event.type === 'BOARD_CLEAR' && layer !== 'public' && incognitoModeRef.current) {
        incognitoEntitiesRef.current.clear()
      }
      shapeDragRef.current = null
      lockPendingShape()
      await redrawAllRef.current()
      return
    }

    if (event.type === 'SHAPE_ADD' || event.type === 'SHAPE_RESIZE' || event.type === 'SHAPE_DELETE') {
      if (persist) {
        const ref = isPrivateEvent(event) ? incognitoEventsRef : allEventsRef
        ref.current.push(event)
      }
      await redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_ADD') {
      if (persist) {
        const ref = isPrivateEvent(event) ? incognitoEventsRef : allEventsRef
        ref.current.push(event)
      }
      await applyImageAdd(event)
      redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_MOVE') {
      if (persist) {
        const ref = isPrivateEntity(event) ? incognitoEventsRef : allEventsRef
        ref.current.push(event)
      }
      applyImageMove(event)
      redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_RESIZE') {
      if (persist) {
        const ref = isPrivateEntity(event) ? incognitoEventsRef : allEventsRef
        ref.current.push(event)
      }
      applyImageResize(event)
      redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_DELETE') {
      if (persist) {
        const ref = isPrivateEntity(event) ? incognitoEventsRef : allEventsRef
        ref.current.push(event)
        if (isPrivateEntity(event)) {
          incognitoEntitiesRef.current.delete(`image:${event.imageId}`)
        }
      }
      applyImageDelete(event)
      redrawAllRef.current()
      return
    }

    if (persist) {
      const ref = isPrivateEvent(event) ? incognitoEventsRef : allEventsRef
      ref.current.push(event)
    }
    applyStrokeEvent(event, { refreshImages: true })
  }, [
    applyImageAdd,
    applyImageMove,
    applyImageResize,
    applyImageDelete,
    applyStrokeEvent,
    lockPendingShape,
    resolveEventsRef,
    isPrivateEvent,
  ])

  const handleRegionClearMouseUp = useCallback(async () => {
    const drag = regionClearDragRef.current
    regionClearDragRef.current = null
    setRegionClearPreview(null)
    if (!drag) return

    const rect = normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY)
    if (rect.width < MIN_SHAPE_SIZE || rect.height < MIN_SHAPE_SIZE) {
      return
    }

    const event = {
      type: 'REGION_CLEAR',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }

    notifyClearApplied(event)
    persistAndSend(event)
    await applyClearEvent()
  }, [persistAndSend, applyClearEvent, notifyClearApplied])

  const handleRegionClearPointerDown = useCallback((e) => {
    if (mode !== 'region-clear' || e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    const canvas = canvasRef.current
    if (!canvas) return

    canvas.setPointerCapture(e.pointerId)
    regionClearPointerIdRef.current = e.pointerId

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)
    regionClearDragRef.current = {
      startX: norm.x,
      startY: norm.y,
      currentX: norm.x,
      currentY: norm.y,
    }
    updateRegionClearPreview(regionClearDragRef.current)
  }, [mode, updateRegionClearPreview])

  const handleRegionClearPointerMove = useCallback((e) => {
    if (regionClearPointerIdRef.current !== e.pointerId || !regionClearDragRef.current) return

    e.preventDefault()
    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)
    regionClearDragRef.current.currentX = norm.x
    regionClearDragRef.current.currentY = norm.y
    updateRegionClearPreview(regionClearDragRef.current)
  }, [updateRegionClearPreview])

  const handleRegionClearPointerUp = useCallback((e) => {
    if (regionClearPointerIdRef.current !== e.pointerId) return

    e.preventDefault()
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId)
    }
    regionClearPointerIdRef.current = null
    handleRegionClearMouseUp()
  }, [handleRegionClearMouseUp])

  const clearBoard = useCallback(async () => {
    const event = { type: 'BOARD_CLEAR' }
    notifyClearApplied(event)
    persistAndSend(event)
    await applyClearEvent()
  }, [persistAndSend, applyClearEvent, notifyClearApplied])

  const loadIncognitoState = useCallback(async ({ canvasEvents = [], entityKeys = [] }) => {
    incognitoEventsRef.current = [...canvasEvents]
    incognitoEntitiesRef.current = new Set(entityKeys)
    await redrawAllRef.current()
  }, [])

  const getIncognitoState = useCallback(() => ({
    canvasEvents: [...incognitoEventsRef.current],
    entityKeys: [...incognitoEntitiesRef.current],
  }), [])

  const resizeShapeFromCorner = useCallback((shape, corner, norm, orig) => {
    if (shape.shapeType === 'line') {
      if (corner === 'start') {
        const endX = orig.x + orig.width
        const endY = orig.y + orig.height
        shape.x = norm.x
        shape.y = norm.y
        shape.width = endX - norm.x
        shape.height = endY - norm.y
      } else if (corner === 'end') {
        shape.width = norm.x - orig.x
        shape.height = norm.y - orig.y
      }
      return
    }

    const origRight = orig.x + orig.width
    const origBottom = orig.y + orig.height

    if (corner === 'br') {
      shape.width = Math.max(MIN_SHAPE_SIZE, norm.x - orig.x)
      shape.height = Math.max(MIN_SHAPE_SIZE, norm.y - orig.y)
    } else if (corner === 'bl') {
      const newX = Math.min(norm.x, origRight - MIN_SHAPE_SIZE)
      shape.width = origRight - newX
      shape.x = newX
      shape.height = Math.max(MIN_SHAPE_SIZE, norm.y - orig.y)
    } else if (corner === 'tr') {
      const newY = Math.min(norm.y, origBottom - MIN_SHAPE_SIZE)
      shape.height = origBottom - newY
      shape.y = newY
      shape.width = Math.max(MIN_SHAPE_SIZE, norm.x - orig.x)
    } else if (corner === 'tl') {
      const newX = Math.min(norm.x, origRight - MIN_SHAPE_SIZE)
      const newY = Math.min(norm.y, origBottom - MIN_SHAPE_SIZE)
      shape.x = newX
      shape.y = newY
      shape.width = origRight - newX
      shape.height = origBottom - newY
    }
  }, [])

  const handleShapeMouseDown = useCallback((screen, norm) => {
    if (pendingShapeRef.current) {
      const shape = shapesRef.current.get(pendingShapeRef.current.shapeId)
      if (shape) {
        const corner = hitTestShapeHandle(
          screen.x,
          screen.y,
          shape,
          worldToScreen,
          cameraRef.current.zoom
        )
        if (corner) {
          shapeResizeDragRef.current = {
            corner,
            shapeId: shape.shapeId,
            orig: { ...shape },
            moved: false,
          }
          redrawAllRef.current()
          return
        }
      }
      lockPendingShape()
      redrawAllRef.current()
    }

    shapeDragRef.current = {
      startX: norm.x,
      startY: norm.y,
      currentX: norm.x,
      currentY: norm.y,
    }
    redrawAllRef.current()
  }, [worldToScreen, lockPendingShape])

  const handleShapeMouseMove = useCallback((norm) => {
    const resizeDrag = shapeResizeDragRef.current
    if (resizeDrag) {
      const shape = shapesRef.current.get(resizeDrag.shapeId)
      if (shape) {
        resizeDrag.moved = true
        shape.x = resizeDrag.orig.x
        shape.y = resizeDrag.orig.y
        shape.width = resizeDrag.orig.width
        shape.height = resizeDrag.orig.height
        resizeShapeFromCorner(shape, resizeDrag.corner, norm, resizeDrag.orig)
        redrawAllRef.current()
      }
      return
    }

    if (shapeDragRef.current) {
      shapeDragRef.current.currentX = norm.x
      shapeDragRef.current.currentY = norm.y
      redrawAllRef.current()
    }
  }, [resizeShapeFromCorner])

  const handleShapeMouseUp = useCallback(() => {
    const resizeDrag = shapeResizeDragRef.current
    if (resizeDrag) {
      const shape = shapesRef.current.get(resizeDrag.shapeId)
      shapeResizeDragRef.current = null

      if (shape && resizeDrag.moved) {
        persistAndSend({
          type: 'SHAPE_RESIZE',
          shapeId: resizeDrag.shapeId,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        })
      }

      lockPendingShape()
      redrawAllRef.current()
      return
    }

    const drag = shapeDragRef.current
    if (!drag) return

    shapeDragRef.current = null
    const shapeProps = buildShapeFromDrag(
      drag.startX,
      drag.startY,
      drag.currentX,
      drag.currentY,
      shapeTypeRef.current
    )

    if (isShapeLargeEnough(shapeProps, shapeTypeRef.current) && shapeTypeRef.current) {
      const event = {
        type: 'SHAPE_ADD',
        shapeId: crypto.randomUUID(),
        shapeType: shapeTypeRef.current,
        ...shapeProps,
        color: strokeColorRef.current,
        strokeWidth: DEFAULT_STROKE_WIDTH,
      }
      persistAndSend(event)
      pendingShapeRef.current = { shapeId: event.shapeId }
    }

    redrawAllRef.current()
  }, [lockPendingShape, persistAndSend])

  useEffect(() => {
    registerRemoteHandler?.((event) => handleEvent(event, { layer: 'public' }))
  }, [handleEvent, registerRemoteHandler])

  useEffect(() => {
    if (!snapshotEvents.length) return

    const loadSnapshot = async () => {
      allEventsRef.current = [...snapshotEvents]
      imagesRef.current.clear()
      strokes.current.clear()
      shapesRef.current.clear()
      clearSelection()
      lockPendingShape()
      shapeDragRef.current = null

      for (const event of snapshotEvents) {
        if (event.type === 'IMAGE_ADD') {
          await applyImageAdd(event)
        }
      }
      await redrawAllRef.current()
    }

    loadSnapshot()
  }, [snapshotEvents, applyImageAdd, clearSelection, lockPendingShape])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      initCamera()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [initCamera])

  const getScreenCoords = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    let clientX, clientY
    if (e.touches?.length > 0) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else if (e.changedTouches?.length > 0) {
      clientX = e.changedTouches[0].clientX
      clientY = e.changedTouches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const getWorldNormalized = (screen) => {
    const world = screenToWorld(screen.x, screen.y)
    return { x: world.x / WORLD_WIDTH, y: world.y / WORLD_HEIGHT }
  }

  const hitTestImage = (normX, normY) => {
    for (const [id, img] of [...imagesRef.current.entries()].reverse()) {
      if (
        normX >= img.x &&
        normX <= img.x + img.imageWidth &&
        normY >= img.y &&
        normY <= img.y + img.imageHeight
      ) {
        return id
      }
    }
    return null
  }

  const hitTestHandle = (screenX, screenY, img) => {
    const rect = getImageScreenRect(img)
    const handles = [
      { corner: 'tl', x: rect.x, y: rect.y },
      { corner: 'tr', x: rect.x + rect.w, y: rect.y },
      { corner: 'bl', x: rect.x, y: rect.y + rect.h },
      { corner: 'br', x: rect.x + rect.w, y: rect.y + rect.h },
    ]

    for (const h of handles) {
      if (Math.hypot(screenX - h.x, screenY - h.y) <= HANDLE_RADIUS) {
        return h.corner
      }
    }
    return null
  }

  const addImageToBoard = useCallback(async (dataUrl, pixelWidth, pixelHeight) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const centerWorld = screenToWorld(canvas.width / 2, canvas.height / 2)
    const { imageWidth, imageHeight } = imageDimensionsForZoom(
      pixelWidth,
      pixelHeight,
      cameraRef.current.zoom,
      canvas.width,
      canvas.height
    )

    const event = {
      type: 'IMAGE_ADD',
      imageId: crypto.randomUUID(),
      x: centerWorld.x / WORLD_WIDTH - imageWidth / 2,
      y: centerWorld.y / WORLD_HEIGHT - imageHeight / 2,
      imageWidth,
      imageHeight,
      data: dataUrl,
    }

    await handleEvent(event, { persist: false })
    persistAndSend(event)
    setSelection(event.imageId)
    onModeChange?.('select')
  }, [screenToWorld, handleEvent, persistAndSend, setSelection, onModeChange])

  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        try {
          const compressed = await compressImage(file)
          await addImageToBoard(compressed.dataUrl, compressed.pixelWidth, compressed.pixelHeight)
        } catch (err) {
          console.error(err)
          alert('Не удалось вставить картинку')
        }
        break
      }
    }
  }, [addImageToBoard])

  const importImageFile = useCallback(async (file) => {
    if (!file) return
    try {
      const compressed = await compressImage(file)
      await addImageToBoard(compressed.dataUrl, compressed.pixelWidth, compressed.pixelHeight)
    } catch (err) {
      console.error(err)
      alert('Не удалось загрузить картинку')
    }
  }, [addImageToBoard])

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  const handleWheel = (e) => {
    e.preventDefault()
    const screen = getScreenCoords(e)
    const cam = cameraRef.current
    const worldX = cam.x + screen.x / cam.zoom
    const worldY = cam.y + screen.y / cam.zoom
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    cam.zoom = Math.min(5, Math.max(0.02, cam.zoom * factor))
    cam.x = worldX - screen.x / cam.zoom
    cam.y = worldY - screen.y / cam.zoom
    redrawAllRef.current()
    notifyCameraChange()
  }

  const startPan = (e) => {
    isPanning.current = true
    lastPanPoint.current = { x: e.clientX, y: e.clientY }
  }

  const movePan = (e) => {
    if (!isPanning.current || !lastPanPoint.current) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const dx = (e.clientX - lastPanPoint.current.x) * scaleX
    const dy = (e.clientY - lastPanPoint.current.y) * scaleY
    cameraRef.current.x -= dx / cameraRef.current.zoom
    cameraRef.current.y -= dy / cameraRef.current.zoom
    lastPanPoint.current = { x: e.clientX, y: e.clientY }
    redrawAllRef.current()
    notifyCameraChange()
  }

  const endPan = () => {
    isPanning.current = false
    lastPanPoint.current = null
  }

  const handleSelectMouseDown = (screen, norm) => {
    const startResizeDrag = (id, img, corner) => {
      setSelection(id)
      dragRef.current = {
        type: 'resize',
        corner,
        imageId: id,
        orig: {
          x: img.x,
          y: img.y,
          imageWidth: img.imageWidth,
          imageHeight: img.imageHeight,
        },
        moved: false,
      }
      redrawAllRef.current()
    }

    const selectedId = selectedImageIdRef.current
    if (selectedId) {
      const selected = imagesRef.current.get(selectedId)
      if (selected) {
        const corner = hitTestHandle(screen.x, screen.y, selected)
        if (corner) {
          startResizeDrag(selectedId, selected, corner)
          return
        }
      }
    }

    for (const [id, img] of [...imagesRef.current.entries()].reverse()) {
      if (id === selectedId) continue
      const corner = hitTestHandle(screen.x, screen.y, img)
      if (corner) {
        startResizeDrag(id, img, corner)
        return
      }
    }

    const hitId = hitTestImage(norm.x, norm.y)

    if (hitId) {
      const img = imagesRef.current.get(hitId)
      setSelection(hitId)

      dragRef.current = {
        type: 'move',
        imageId: hitId,
        offsetX: norm.x - img.x,
        offsetY: norm.y - img.y,
        moved: false,
      }
      redrawAllRef.current()
      return
    }

    clearSelection()
    dragRef.current = null
    redrawAllRef.current()
  }

  const handleSelectMouseMove = (norm) => {
    const drag = dragRef.current
    if (!drag) return

    const img = imagesRef.current.get(drag.imageId)
    if (!img) return

    if (drag.type === 'move') {
      drag.moved = true
      img.x = norm.x - drag.offsetX
      img.y = norm.y - drag.offsetY
      redrawAllRef.current()
      return
    }

    if (drag.type === 'resize') {
      drag.moved = true
      const orig = drag.orig
      const origRight = orig.x + orig.imageWidth
      const origBottom = orig.y + orig.imageHeight

      if (drag.corner === 'br') {
        img.imageWidth = Math.max(MIN_IMAGE_SIZE, norm.x - orig.x)
        img.imageHeight = Math.max(MIN_IMAGE_SIZE, norm.y - orig.y)
      } else if (drag.corner === 'bl') {
        const newX = Math.min(norm.x, origRight - MIN_IMAGE_SIZE)
        img.imageWidth = origRight - newX
        img.x = newX
        img.imageHeight = Math.max(MIN_IMAGE_SIZE, norm.y - orig.y)
      } else if (drag.corner === 'tr') {
        const newY = Math.min(norm.y, origBottom - MIN_IMAGE_SIZE)
        img.imageHeight = origBottom - newY
        img.y = newY
        img.imageWidth = Math.max(MIN_IMAGE_SIZE, norm.x - orig.x)
      } else if (drag.corner === 'tl') {
        const newX = Math.min(norm.x, origRight - MIN_IMAGE_SIZE)
        const newY = Math.min(norm.y, origBottom - MIN_IMAGE_SIZE)
        img.x = newX
        img.y = newY
        img.imageWidth = origRight - newX
        img.imageHeight = origBottom - newY
      }

      redrawAllRef.current()
    }
  }

  const handleSelectMouseUp = () => {
    const drag = dragRef.current
    if (!drag) return

    const img = imagesRef.current.get(drag.imageId)
    if (!img) {
      dragRef.current = null
      return
    }

    if (drag.moved) {
      if (drag.type === 'move') {
        persistAndSend({
          type: 'IMAGE_MOVE',
          imageId: drag.imageId,
          x: img.x,
          y: img.y,
        })
      }

      if (drag.type === 'resize') {
        persistAndSend({
          type: 'IMAGE_RESIZE',
          imageId: drag.imageId,
          x: img.x,
          y: img.y,
          imageWidth: img.imageWidth,
          imageHeight: img.imageHeight,
        })
      }
    }

    dragRef.current = null
    redrawAllRef.current()
  }

  const releaseSelectPointerCapture = (pointerId) => {
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId)
    }
    if (selectPointerIdRef.current === pointerId) {
      selectPointerIdRef.current = null
    }
  }

  const handleSelectPointerDown = (e) => {
    if (mode !== 'select' || e.button !== 0 || e.shiftKey) return

    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    canvas.setPointerCapture(e.pointerId)
    selectPointerIdRef.current = e.pointerId

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)
    handleSelectMouseDown(screen, norm)
  }

  const handleSelectPointerMove = (e) => {
    if (selectPointerIdRef.current !== e.pointerId || !dragRef.current) return

    e.preventDefault()
    const norm = getWorldNormalized(getScreenCoords(e))
    handleSelectMouseMove(norm)
  }

  const handleSelectPointerUp = (e) => {
    if (selectPointerIdRef.current !== e.pointerId) return

    e.preventDefault()
    releaseSelectPointerCapture(e.pointerId)
    handleSelectMouseUp()
  }

  const deleteImageById = useCallback((imageId) => {
    if (!imageId || !imagesRef.current.has(imageId)) return false

    const event = { type: 'IMAGE_DELETE', imageId }
    applyImageDelete(event)
    persistAndSend(event)
    redrawAllRef.current()
    return true
  }, [applyImageDelete, persistAndSend])

  const handleCanvasContextMenu = (e) => {
    e.preventDefault()
    if (mode !== 'select') return

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)
    const hitId = hitTestImage(norm.x, norm.y) || selectedImageIdRef.current

    if (!hitId) return

    setSelection(hitId)
    onImageContextMenu?.({ imageId: hitId, x: e.clientX, y: e.clientY })
  }

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault()
      startPan(e)
      return
    }
    if (e.button !== 0) return
    if (mode === 'region-clear') return
    e.preventDefault()

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)

    if (mode === 'select') {
      return
    }

    if (mode === 'sticker' || mode === 'text') {
      onBoardClick?.(norm)
      return
    }

    if (mode === 'shape') {
      handleShapeMouseDown(screen, norm)
      return
    }

    isDrawing.current = true
    strokeId.current = crypto.randomUUID()

    const event = {
      type: 'STROKE_START',
      strokeId: strokeId.current,
      x: norm.x,
      y: norm.y,
      color: strokeColorRef.current,
      width: DEFAULT_STROKE_WIDTH,
    }

    handleEvent(event, { persist: false })
    persistAndSend(event)
  }

  const handleMouseMove = (e) => {
    if (isPanning.current) {
      movePan(e)
      return
    }

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)

    if (mode === 'select' && dragRef.current && selectPointerIdRef.current == null) {
      handleSelectMouseMove(norm)
      return
    }

    if (mode === 'shape') {
      handleShapeMouseMove(norm)
      return
    }

    if (mode === 'region-clear') {
      return
    }

    if (!isDrawing.current) return

    e.preventDefault()
    const event = {
      type: 'STROKE_MOVE',
      strokeId: strokeId.current,
      x: norm.x,
      y: norm.y,
    }
    handleEvent(event, { persist: false })
    persistAndSend(event)
  }

  const handleMouseLeave = (e) => {
    if (dragRef.current && selectPointerIdRef.current != null) return
    handleMouseUp(e)
  }

  const handleCanvasPointerDown = (e) => {
    handleRegionClearPointerDown(e)
    handleSelectPointerDown(e)
  }

  const handleCanvasPointerMove = (e) => {
    handleRegionClearPointerMove(e)
    handleSelectPointerMove(e)
  }

  const handleCanvasPointerUp = (e) => {
    handleRegionClearPointerUp(e)
    handleSelectPointerUp(e)
  }

  const handleMouseUp = (e) => {
    if (regionClearPointerIdRef.current != null) return

    if (isPanning.current) {
      endPan()
      return
    }

    if (mode === 'select' && selectPointerIdRef.current == null) {
      handleSelectMouseUp()
      return
    }

    if (mode === 'shape') {
      handleShapeMouseUp()
      return
    }

    if (!isDrawing.current) return

    isDrawing.current = false
    persistAndSend({ type: 'STROKE_END', strokeId: strokeId.current })
    strokes.current.delete(strokeId.current)
  }

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      isDrawing.current = false
      dragRef.current = null
      isPanning.current = true
      lastTouchDistance.current = getTouchDistance(e.touches)
      lastPanPoint.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
      return
    }

    if (e.touches.length !== 1) return
    e.preventDefault()

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)

    if (mode === 'select') {
      return
    }

    if (mode === 'sticker' || mode === 'text') {
      onBoardClick?.(norm)
      return
    }

    if (mode === 'shape') {
      handleShapeMouseDown(screen, norm)
      return
    }

    if (mode === 'region-clear') {
      return
    }

    isDrawing.current = true
    strokeId.current = crypto.randomUUID()
    const event = {
      type: 'STROKE_START',
      strokeId: strokeId.current,
      x: norm.x,
      y: norm.y,
      color: strokeColorRef.current,
      width: DEFAULT_STROKE_WIDTH,
    }
    handleEvent(event, { persist: false })
    persistAndSend(event)
  }

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && isPanning.current) {
      e.preventDefault()
      const center = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      }
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      if (lastPanPoint.current) {
        const dx = (center.x - lastPanPoint.current.x) * scaleX
        const dy = (center.y - lastPanPoint.current.y) * scaleY
        cameraRef.current.x -= dx / cameraRef.current.zoom
        cameraRef.current.y -= dy / cameraRef.current.zoom
      }

      const dist = getTouchDistance(e.touches)
      if (lastTouchDistance.current) {
        cameraRef.current.zoom = Math.min(
          5,
          Math.max(0.02, cameraRef.current.zoom * (dist / lastTouchDistance.current))
        )
      }

      lastPanPoint.current = center
      lastTouchDistance.current = dist
      redrawAllRef.current()
      notifyCameraChange()
      return
    }

    if (e.touches.length !== 1) return

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)

    if (mode === 'select' && dragRef.current && selectPointerIdRef.current == null) {
      e.preventDefault()
      handleSelectMouseMove(norm)
      return
    }

    if (mode === 'shape') {
      e.preventDefault()
      handleShapeMouseMove(norm)
      return
    }

    if (mode === 'region-clear') {
      return
    }

    if (!isDrawing.current) return

    e.preventDefault()
    const event = { type: 'STROKE_MOVE', strokeId: strokeId.current, x: norm.x, y: norm.y }
    handleEvent(event, { persist: false })
    persistAndSend(event)
  }

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      isPanning.current = false
      lastTouchDistance.current = null
      lastPanPoint.current = null
    }

    if (mode === 'select' && selectPointerIdRef.current == null) {
      handleSelectMouseUp()
      return
    }

    if (mode === 'shape') {
      handleShapeMouseUp()
      return
    }

    if (isDrawing.current && e.touches.length === 0) {
      isDrawing.current = false
      persistAndSend({ type: 'STROKE_END', strokeId: strokeId.current })
      strokes.current.delete(strokeId.current)
    }
  }

  const resetView = () => initCamera()

  const zoomIn = () => {
    const cam = cameraRef.current
    const canvas = canvasRef.current
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const wx = cam.x + cx / cam.zoom
    const wy = cam.y + cy / cam.zoom
    cam.zoom = Math.min(5, cam.zoom * 1.2)
    cam.x = wx - cx / cam.zoom
    cam.y = wy - cy / cam.zoom
    redrawAllRef.current()
    notifyCameraChange()
  }

  const zoomOut = () => {
    const cam = cameraRef.current
    const canvas = canvasRef.current
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const wx = cam.x + cx / cam.zoom
    const wy = cam.y + cy / cam.zoom
    cam.zoom = Math.max(0.02, cam.zoom / 1.2)
    cam.x = wx - cx / cam.zoom
    cam.y = wy - cy / cam.zoom
    redrawAllRef.current()
    notifyCameraChange()
  }

  useImperativeHandle(ref, () => ({
    zoomIn,
    zoomOut,
    resetView,
    importImageFile,
    clearBoard,
    loadIncognitoState,
    getIncognitoState,
    getSelectedImageId: () => selectedImageIdRef.current,
    clearSelection,
    deleteSelectedImage: () => {
      const imageId = selectedImageIdRef.current
      return imageId ? deleteImageById(imageId) : false
    },
    deleteImageById,
  }), [
    importImageFile,
    clearBoard,
    loadIncognitoState,
    getIncognitoState,
    clearSelection,
    deleteImageById,
  ])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        width: '100%',
        height: '100%',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: mode === 'select'
            ? 'default'
            : mode === 'sticker'
              ? 'cell'
              : mode === 'text'
                ? 'text'
              : mode === 'shape' || mode === 'region-clear'
                ? 'crosshair'
                : 'crosshair',
          touchAction: 'none',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onContextMenu={handleCanvasContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {regionClearPreview && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: regionClearPreview.left,
            top: regionClearPreview.top,
            width: regionClearPreview.width,
            height: regionClearPreview.height,
            border: '2px dashed #2563eb',
            background: 'rgba(37, 99, 235, 0.12)',
            pointerEvents: 'none',
            zIndex: 15,
          }}
        />
      )}
    </div>
  )
})

export default Canvas
