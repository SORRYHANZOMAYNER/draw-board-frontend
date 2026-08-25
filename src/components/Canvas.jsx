import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants/board.js'
const MAX_IMAGE_PX = 800
const MIN_IMAGE_SIZE = 0.02
const HANDLE_RADIUS = 10

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
    onModeChange,
    sendDraw,
    snapshotEvents = [],
    registerRemoteHandler,
    onCameraChange,
    onBoardClick,
    onImageSelectionChange,
    onImageContextMenu,
  },
  ref
) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

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
  const allEventsRef = useRef([])
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const dragRef = useRef(null)

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
    if (mode === 'draw') {
      clearSelection()
      dragRef.current = null
      redrawAllRef.current()
    }
  }, [mode, clearSelection])

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
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(h.x - 5, h.y - 5, 10, 10)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.strokeRect(h.x - 5, h.y - 5, 10, 10)
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

  const drawImagesOnTop = useCallback(() => {
    drawImages()
    drawSelection()
  }, [drawImages, drawSelection])

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

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    strokes.current.clear()

    allEventsRef.current.forEach((event) => {
      if (event.type.startsWith('IMAGE_')) return
      applyStrokeEvent(event)
    })

    drawImagesOnTop()
  }, [applyStrokeEvent, drawImagesOnTop])

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

  const persistAndSend = useCallback((event) => {
    allEventsRef.current.push(event)
    sendDraw(event)
  }, [sendDraw])

  const handleEvent = useCallback(async (event, { persist = true } = {}) => {
    if (event.type === 'IMAGE_ADD') {
      if (persist) allEventsRef.current.push(event)
      await applyImageAdd(event)
      redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_MOVE') {
      if (persist) allEventsRef.current.push(event)
      applyImageMove(event)
      redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_RESIZE') {
      if (persist) allEventsRef.current.push(event)
      applyImageResize(event)
      redrawAllRef.current()
      return
    }

    if (event.type === 'IMAGE_DELETE') {
      if (persist) allEventsRef.current.push(event)
      applyImageDelete(event)
      redrawAllRef.current()
      return
    }

    if (persist) allEventsRef.current.push(event)
    applyStrokeEvent(event, { refreshImages: true })
  }, [applyImageAdd, applyImageMove, applyImageResize, applyImageDelete, applyStrokeEvent])

  useEffect(() => {
    registerRemoteHandler?.((event) => handleEvent(event))
  }, [handleEvent, registerRemoteHandler])

  useEffect(() => {
    if (!snapshotEvents.length) return

    const loadSnapshot = async () => {
      allEventsRef.current = []
      imagesRef.current.clear()
      strokes.current.clear()
      clearSelection()

      for (const event of snapshotEvents) {
        if (event.type === 'IMAGE_ADD') {
          allEventsRef.current.push(event)
          await applyImageAdd(event)
        } else if (event.type === 'IMAGE_MOVE') {
          allEventsRef.current.push(event)
          applyImageMove(event)
        } else if (event.type === 'IMAGE_RESIZE') {
          allEventsRef.current.push(event)
          applyImageResize(event)
        } else if (event.type === 'IMAGE_DELETE') {
          allEventsRef.current.push(event)
          applyImageDelete(event)
        } else {
          allEventsRef.current.push(event)
        }
      }
      redrawAllRef.current()
    }

    loadSnapshot()
  }, [snapshotEvents, applyImageAdd, applyImageMove, applyImageResize, applyImageDelete, clearSelection])

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
    const imageWidth = (pixelWidth / WORLD_WIDTH) * 0.5
    const imageHeight = (pixelHeight / WORLD_HEIGHT) * 0.5

    const event = {
      type: 'IMAGE_ADD',
      imageId: crypto.randomUUID(),
      x: centerWorld.x / WORLD_WIDTH - imageWidth / 2,
      y: centerWorld.y / WORLD_HEIGHT - imageHeight / 2,
      imageWidth,
      imageHeight,
      data: dataUrl,
    }

    await handleEvent(event)
    sendDraw(event)
    setSelection(event.imageId)
    onModeChange?.('select')
  }, [screenToWorld, handleEvent, sendDraw, setSelection, onModeChange])

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
    const hitId = hitTestImage(norm.x, norm.y)

    if (hitId) {
      const img = imagesRef.current.get(hitId)
      setSelection(hitId)

      const corner = hitTestHandle(screen.x, screen.y, img)
      if (corner) {
        dragRef.current = {
          type: 'resize',
          corner,
          imageId: hitId,
          orig: { ...img },
          moved: false,
        }
        redrawAllRef.current()
        return
      }

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

  const deleteImageById = useCallback((imageId) => {
    if (!imageId || !imagesRef.current.has(imageId)) return false

    applyImageDelete({ imageId })
    allEventsRef.current.push({ type: 'IMAGE_DELETE', imageId })
    sendDraw({ type: 'IMAGE_DELETE', imageId })
    redrawAllRef.current()
    return true
  }, [applyImageDelete, sendDraw])

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
    e.preventDefault()

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)

    if (mode === 'select') {
      handleSelectMouseDown(screen, norm)
      return
    }

    if (mode === 'sticker') {
      onBoardClick?.(norm)
      return
    }

    isDrawing.current = true
    strokeId.current = crypto.randomUUID()

    const event = {
      type: 'STROKE_START',
      strokeId: strokeId.current,
      x: norm.x,
      y: norm.y,
      color: '#000000',
      width: 3,
    }

    handleEvent(event)
    sendDraw(event)
  }

  const handleMouseMove = (e) => {
    if (isPanning.current) {
      movePan(e)
      return
    }

    const screen = getScreenCoords(e)
    const norm = getWorldNormalized(screen)

    if (mode === 'select' && dragRef.current) {
      handleSelectMouseMove(norm)
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
    handleEvent(event)
    sendDraw(event)
  }

  const handleMouseUp = (e) => {
    if (isPanning.current) {
      endPan()
      return
    }

    if (mode === 'select') {
      handleSelectMouseUp()
      return
    }

    if (!isDrawing.current) return

    isDrawing.current = false
    sendDraw({ type: 'STROKE_END', strokeId: strokeId.current })
    allEventsRef.current.push({ type: 'STROKE_END', strokeId: strokeId.current })
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
      handleSelectMouseDown(screen, norm)
      return
    }

    if (mode === 'sticker') {
      onBoardClick?.(norm)
      return
    }

    isDrawing.current = true
    strokeId.current = crypto.randomUUID()
    const event = {
      type: 'STROKE_START',
      strokeId: strokeId.current,
      x: norm.x,
      y: norm.y,
      color: '#000000',
      width: 3,
    }
    handleEvent(event)
    sendDraw(event)
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

    if (mode === 'select' && dragRef.current) {
      e.preventDefault()
      handleSelectMouseMove(norm)
      return
    }

    if (!isDrawing.current) return

    e.preventDefault()
    const event = { type: 'STROKE_MOVE', strokeId: strokeId.current, x: norm.x, y: norm.y }
    handleEvent(event)
    sendDraw(event)
  }

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      isPanning.current = false
      lastTouchDistance.current = null
      lastPanPoint.current = null
    }

    if (mode === 'select') {
      handleSelectMouseUp()
      return
    }

    if (isDrawing.current && e.touches.length === 0) {
      isDrawing.current = false
      sendDraw({ type: 'STROKE_END', strokeId: strokeId.current })
      allEventsRef.current.push({ type: 'STROKE_END', strokeId: strokeId.current })
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
    getSelectedImageId: () => selectedImageIdRef.current,
    clearSelection,
    deleteSelectedImage: () => {
      const imageId = selectedImageIdRef.current
      return imageId ? deleteImageById(imageId) : false
    },
    deleteImageById,
  }), [importImageFile, clearSelection, deleteImageById])

  return (
    <div
      ref={containerRef}
      style={{
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
          cursor: mode === 'select' ? 'default' : mode === 'sticker' ? 'cell' : 'crosshair',
          touchAction: 'none',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleCanvasContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  )
})

export default Canvas
