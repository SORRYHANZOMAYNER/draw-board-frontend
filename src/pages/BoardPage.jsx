import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Canvas from '../components/Canvas.jsx'
import StickerLayer from '../components/StickerLayer.jsx'
import Toolbar from '../components/Toolbar.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import {
  DEFAULT_STICKER_HEIGHT,
  DEFAULT_STICKER_WIDTH,
  STICKER_COLORS,
} from '../constants/board.js'
import '../styles/BoardPage.css'

function buildStickerMap(events) {
  const stickers = new Map()

  for (const event of events) {
    if (event.type === 'STICKER_ADD') {
      stickers.set(event.stickerId, {
        stickerId: event.stickerId,
        x: event.x,
        y: event.y,
        width: event.width ?? DEFAULT_STICKER_WIDTH,
        height: event.height ?? DEFAULT_STICKER_HEIGHT,
        text: event.text ?? '',
        color: event.color ?? STICKER_COLORS[0],
      })
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
  }

  return stickers
}

export default function BoardPage() {
  const { roomId } = useParams()
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)

  const [mode, setMode] = useState('draw')
  const [snapshotEvents, setSnapshotEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const [stickers, setStickers] = useState(() => new Map())
  const [selectedStickerId, setSelectedStickerId] = useState(null)
  const [focusStickerId, setFocusStickerId] = useState(null)

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
    if (event.type === 'STICKER_ADD') {
      setStickers((prev) => {
        const next = new Map(prev)
        next.set(event.stickerId, {
          stickerId: event.stickerId,
          x: event.x,
          y: event.y,
          width: event.width ?? DEFAULT_STICKER_WIDTH,
          height: event.height ?? DEFAULT_STICKER_HEIGHT,
          text: event.text ?? '',
          color: event.color ?? STICKER_COLORS[0],
        })
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
        updated.x = event.x
        updated.y = event.y
      }

      if (event.type === 'STICKER_TEXT') {
        updated.text = event.text ?? ''
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

  const { sendDraw, connected } = useWebSocket(roomId, onMessage)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch(`http://localhost:8080/room/${roomId}/snapshot`)
      .then((response) => response.json())
      .then((events) => {
        if (cancelled) return

        setSnapshotEvents(events)

        setStickers((prev) => {
          const fromSnapshot = buildStickerMap(events)
          if (prev.size === 0) return fromSnapshot

          const merged = new Map(fromSnapshot)
          prev.forEach((sticker, id) => merged.set(id, sticker))
          return merged
        })
      })
      .catch((error) => console.error('Snapshot error', error))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [roomId])

  useEffect(() => {
    return () => {
      textTimerRef.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const persistStickerEvent = useCallback((event) => {
    sendDraw(event)
  }, [sendDraw])

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
  }, [mode, applyStickerEvent, persistStickerEvent])

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
    if (nextMode !== 'select') {
      setSelectedStickerId(null)
      setFocusStickerId(null)
    }
  }

  return (
    <div className="board-page">
      <header className="board-header">
        <div className="board-header-top">
          <h2 className="board-title">Комната #{roomId}</h2>
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

        {!connected && (
          <p className="board-warning">Подождите подключения перед рисованием</p>
        )}
        {loading && <p className="board-loading">Загрузка доски...</p>}
      </header>

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
          />

          <StickerLayer
            stickers={stickers}
            camera={camera}
            mode={mode}
            selectedStickerId={selectedStickerId}
            focusStickerId={focusStickerId}
            onSelectSticker={setSelectedStickerId}
            onStickerTextChange={handleStickerTextChange}
            onStickerTextCommit={handleStickerTextCommit}
            onStickerMoveStart={handleStickerMoveStart}
            onStickerMove={handleStickerMove}
            onStickerMoveEnd={handleStickerMoveEnd}
          />
        </div>
      </div>

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
