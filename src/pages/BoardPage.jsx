import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Canvas from '../components/Canvas.jsx'
import StickerLayer from '../components/StickerLayer.jsx'
import Toolbar from '../components/Toolbar.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { apiJson } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  DEFAULT_STICKER_HEIGHT,
  DEFAULT_STICKER_WIDTH,
  STICKER_COLORS,
} from '../constants/board.js'
import '../styles/BoardPage.css'

function normalizeStickerFields(event, previous = null) {
  return {
    stickerId: event.stickerId,
    x: event.x != null ? event.x : (previous?.x ?? 0),
    y: event.y != null ? event.y : (previous?.y ?? 0),
    width: event.width > 0.01 ? event.width : (previous?.width ?? DEFAULT_STICKER_WIDTH),
    height: event.height > 0.01 ? event.height : (previous?.height ?? DEFAULT_STICKER_HEIGHT),
    text: event.text != null ? event.text : (previous?.text ?? ''),
    color: event.color ?? previous?.color ?? STICKER_COLORS[0],
  }
}

function buildStickerMap(events) {
  const stickers = new Map()

  for (const event of events) {
    if (event.type === 'STICKER_ADD') {
      stickers.set(event.stickerId, normalizeStickerFields(event))
      continue
    }

    const sticker = stickers.get(event.stickerId)
    if (!sticker) continue

    if (event.type === 'STICKER_MOVE') {
      sticker.x = event.x
      sticker.y = event.y
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

export default function BoardPage() {
  const { roomId } = useParams()
  const { isTeacher } = useAuth()
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const backPath = isTeacher ? '/teacher' : '/'

  const [mode, setMode] = useState('draw')
  const [snapshotEvents, setSnapshotEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [snapshotError, setSnapshotError] = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const [stickers, setStickers] = useState(() => new Map())
  const [selectedStickerId, setSelectedStickerId] = useState(null)
  const [focusStickerId, setFocusStickerId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const selectedImageIdRef = useRef(null)
  const stickersRef = useRef(stickers)
  const dragOriginRef = useRef(null)
  const textDraftRef = useRef(new Map())
  const textTimerRef = useRef(new Map())

  const remoteHandlerRef = useRef(null)
  const eventQueueRef = useRef([])

  useEffect(() => {
    stickersRef.current = stickers
  }, [stickers])

  const applyStickerEvent = useCallback((event) => {
    if (event.type === 'STICKER_DELETE') {
      if (!event.stickerId) return
      setStickers((prev) => {
        if (!prev.has(event.stickerId)) return prev
        const next = new Map(prev)
        next.delete(event.stickerId)
        return next
      })
      return
    }

    if (event.type === 'STICKER_ADD') {
      if (!event.stickerId) return

      setStickers((prev) => {
        const next = new Map(prev)
        const previous = prev.get(event.stickerId)
        next.set(event.stickerId, normalizeStickerFields(event, previous))
        return next
      })
      return
    }

    setStickers((prev) => {
      const sticker = prev.get(event.stickerId)
      if (!sticker) return prev

      const next = new Map(prev)
      const updated = { ...sticker }

      if (event.type === 'STICKER_MOVE') {
        if (event.x != null) updated.x = event.x
        if (event.y != null) updated.y = event.y
      }

      if (event.type === 'STICKER_TEXT') {
        if (event.text != null) updated.text = event.text
      }

      next.set(event.stickerId, updated)
      return next
    })
  }, [])

  const onMessage = useCallback((event) => {
    if (event.type?.startsWith('STICKER_')) {
      applyStickerEvent(event)
      return
    }

    if (remoteHandlerRef.current) {
      remoteHandlerRef.current(event)
    } else {
      eventQueueRef.current.push(event)
    }
  }, [applyStickerEvent])

  const registerRemoteHandler = useCallback((handler) => {
    remoteHandlerRef.current = handler
    eventQueueRef.current.forEach((event) => handler(event))
    eventQueueRef.current = []
  }, [])

  const { sendDraw, connected, connectionError } = useWebSocket(roomId, onMessage)
  const boardBlocked = accessDenied || Boolean(snapshotError)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setSnapshotError(null)
    setAccessDenied(false)

    async function loadSnapshot() {
      try {
        const events = await apiJson(`/room/${roomId}/snapshot`)
        if (cancelled) return

        setSnapshotEvents(events)

        setStickers((prev) => {
          const fromSnapshot = buildStickerMap(events)
          if (prev.size === 0) return fromSnapshot

          const merged = new Map(fromSnapshot)
          prev.forEach((sticker, id) => merged.set(id, sticker))
          return merged
        })
      } catch (error) {
        if (cancelled) return

        if (error.status === 403) {
          setAccessDenied(true)
          setSnapshotError('Нет доступа к этой доске')
        } else {
          setSnapshotError(error.message || 'Не удалось загрузить доску')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSnapshot()

    return () => {
      cancelled = true
    }
  }, [roomId])

  useEffect(() => {
    return () => {
      textTimerRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const persistStickerEvent = useCallback((event) => {
    sendDraw(event)
  }, [sendDraw])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const deleteSticker = useCallback((stickerId) => {
    if (!stickerId) return

    const event = { type: 'STICKER_DELETE', stickerId }
    applyStickerEvent(event)
    persistStickerEvent(event)
    setSelectedStickerId((current) => (current === stickerId ? null : current))
    setFocusStickerId((current) => (current === stickerId ? null : current))
    closeContextMenu()
  }, [applyStickerEvent, persistStickerEvent, closeContextMenu])

  const deleteSelectedImage = useCallback(() => {
    const deleted = canvasRef.current?.deleteSelectedImage()
    if (deleted) {
      setSelectedStickerId(null)
      setFocusStickerId(null)
      closeContextMenu()
    }
    return deleted
  }, [closeContextMenu])

  const handleDeleteSelected = useCallback(() => {
    if (selectedStickerId) {
      deleteSticker(selectedStickerId)
      return
    }
    deleteSelectedImage()
  }, [selectedStickerId, deleteSticker, deleteSelectedImage])

  const handleImageSelectionChange = useCallback((imageId) => {
    selectedImageIdRef.current = imageId
    if (imageId) {
      setSelectedStickerId(null)
      setFocusStickerId(null)
    }
  }, [])

  const handleSelectSticker = useCallback((stickerId) => {
    setSelectedStickerId(stickerId)
    canvasRef.current?.clearSelection()
  }, [])

  const handleStickerContextMenu = useCallback((stickerId, x, y) => {
    setSelectedStickerId(stickerId)
    canvasRef.current?.clearSelection()
    setContextMenu({ type: 'sticker', targetId: stickerId, x, y })
  }, [])

  const handleImageContextMenu = useCallback(({ x, y }) => {
    setSelectedStickerId(null)
    setFocusStickerId(null)
    setContextMenu({ type: 'image', x, y })
  }, [])

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu?.type === 'sticker') {
      deleteSticker(contextMenu.targetId)
      return
    }
    deleteSelectedImage()
  }, [contextMenu, deleteSticker, deleteSelectedImage])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Delete') return

      const tag = e.target?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      e.preventDefault()
      handleDeleteSelected()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDeleteSelected])

  const handleBoardClick = useCallback((norm) => {
    if (loading || mode !== 'sticker') return

    const stickerId = crypto.randomUUID()
    const color = STICKER_COLORS[stickersRef.current.size % STICKER_COLORS.length]
    const event = {
      type: 'STICKER_ADD',
      stickerId,
      x: norm.x - DEFAULT_STICKER_WIDTH / 2,
      y: norm.y - DEFAULT_STICKER_HEIGHT / 2,
      width: DEFAULT_STICKER_WIDTH,
      height: DEFAULT_STICKER_HEIGHT,
      text: '',
      color,
    }

    applyStickerEvent(event)
    persistStickerEvent(event)
    setSelectedStickerId(stickerId)
    setFocusStickerId(stickerId)
    setMode('select')
  }, [loading, mode, applyStickerEvent, persistStickerEvent])

  const handleStickerTextChange = useCallback((stickerId, text) => {
    setStickers((prev) => {
      const sticker = prev.get(stickerId)
      if (!sticker || sticker.text === text) return prev
      const next = new Map(prev)
      next.set(stickerId, { ...sticker, text })
      return next
    })

    textDraftRef.current.set(stickerId, text)

    const existingTimer = textTimerRef.current.get(stickerId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      persistStickerEvent({ type: 'STICKER_TEXT', stickerId, text })
      textDraftRef.current.delete(stickerId)
    }, 400)

    textTimerRef.current.set(stickerId, timer)
  }, [persistStickerEvent])

  const handleStickerTextCommit = useCallback((stickerId) => {
    const timer = textTimerRef.current.get(stickerId)
    if (timer) {
      clearTimeout(timer)
      textTimerRef.current.delete(stickerId)
    }

    const text = textDraftRef.current.get(stickerId)
    if (text != null) {
      persistStickerEvent({ type: 'STICKER_TEXT', stickerId, text })
      textDraftRef.current.delete(stickerId)
    }
  }, [persistStickerEvent])

  const handleStickerMoveStart = useCallback((stickerId) => {
    const sticker = stickersRef.current.get(stickerId)
    if (!sticker) return
    dragOriginRef.current = { stickerId, x: sticker.x, y: sticker.y }
    setSelectedStickerId(stickerId)
    setFocusStickerId(null)
  }, [])

  const handleStickerMove = useCallback((stickerId, dx, dy) => {
    setStickers((prev) => {
      const sticker = prev.get(stickerId)
      if (!sticker) return prev
      const next = new Map(prev)
      next.set(stickerId, {
        ...sticker,
        x: sticker.x + dx,
        y: sticker.y + dy,
      })
      return next
    })
  }, [])

  const handleStickerMoveEnd = useCallback((stickerId) => {
    const sticker = stickersRef.current.get(stickerId)
    const origin = dragOriginRef.current
    dragOriginRef.current = null

    if (!sticker || !origin || origin.stickerId !== stickerId) return
    if (sticker.x === origin.x && sticker.y === origin.y) return

    persistStickerEvent({
      type: 'STICKER_MOVE',
      stickerId,
      x: sticker.x,
      y: sticker.y,
    })
  }, [persistStickerEvent])

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href)
    alert('Ссылка скопирована')
  }

  const handleImageUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      await canvasRef.current?.importImageFile(file)
    }
    e.target.value = ''
  }

  const handleModeChange = (nextMode) => {
    setMode(nextMode)
    closeContextMenu()
    if (nextMode !== 'select') {
      setSelectedStickerId(null)
      setFocusStickerId(null)
    }
  }

  return (
    <div className="board-page" onClick={closeContextMenu}>
      <header className="board-header">
        <div className="board-header-top">
          <div className="board-header-left">
            <Link to={backPath} className="board-back-link">
              ← Назад
            </Link>
            <h2 className="board-title">Комната #{roomId}</h2>
          </div>
          <span className={`board-status${connected ? ' connected' : ''}`}>
            {connected ? '● Подключено' : '○ Подключение...'}
          </span>
        </div>

        <div className="board-link-row">
          <input readOnly value={window.location.href} className="board-link-input" />
          <button type="button" className="board-copy-btn" onClick={copyLink}>
            Копировать
          </button>
        </div>

        {loading && <p className="board-loading">Загрузка доски...</p>}
        {snapshotError && <p className="board-error">{snapshotError}</p>}
        {connectionError && <p className="board-error">{connectionError}</p>}
        {!boardBlocked && !connected && !connectionError && (
          <p className="board-warning">Подождите подключения перед рисованием</p>
        )}
      </header>

      {boardBlocked ? (
        <div className="board-access-denied">
          <p>{snapshotError || 'Доступ к доске запрещён'}</p>
          <Link to={backPath} className="board-back-btn">
            Вернуться к списку досок
          </Link>
        </div>
      ) : (
        <div className="board-workspace">
          <Toolbar
            mode={mode}
            onModeChange={handleModeChange}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onResetView={() => canvasRef.current?.resetView()}
            onImageUpload={handleImageUpload}
          />

          <div className="board-canvas-area">
            <Canvas
              ref={canvasRef}
              mode={mode}
              onModeChange={handleModeChange}
              sendDraw={sendDraw}
              snapshotEvents={snapshotEvents}
              registerRemoteHandler={registerRemoteHandler}
              onCameraChange={setCamera}
              onBoardClick={handleBoardClick}
              onImageSelectionChange={handleImageSelectionChange}
              onImageContextMenu={handleImageContextMenu}
            />

            <StickerLayer
              stickers={stickers}
              camera={camera}
              mode={mode}
              selectedStickerId={selectedStickerId}
              focusStickerId={focusStickerId}
              onSelectSticker={handleSelectSticker}
              onStickerTextChange={handleStickerTextChange}
              onStickerTextCommit={handleStickerTextCommit}
              onStickerMoveStart={handleStickerMoveStart}
              onStickerMove={handleStickerMove}
              onStickerMoveEnd={handleStickerMoveEnd}
              onStickerContextMenu={handleStickerContextMenu}
            />
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleContextMenuDelete}
          onClose={closeContextMenu}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}