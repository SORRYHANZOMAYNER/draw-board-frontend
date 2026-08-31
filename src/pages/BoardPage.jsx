import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Pencil, Check, X } from 'lucide-react'
import Canvas from '../components/Canvas.jsx'
import StickerLayer from '../components/StickerLayer.jsx'
import TextLayer from '../components/TextLayer.jsx'
import Toolbar from '../components/Toolbar.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import { useWebSocket } from '../hooks/useWebSocket.js'
import { apiJson } from '../api/client.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DEFAULT_STICKER_HEIGHT,
  DEFAULT_STICKER_WIDTH,
  DEFAULT_STROKE_COLOR,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_WIDTH,
  textFontSizeForZoom,
  STICKER_COLORS,
} from '../constants/board.js'
import { collectStickerIdsInRegion, collectTextIdsInRegion, stickerIntersectsRect, textIntersectsRect } from '../lib/canvasClear.js'
import {
  arrayToMap,
  loadIncognitoData,
  mapToArray,
  saveIncognitoData,
} from '../lib/incognitoStorage.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

function normalizeTextFields(event, previous = null) {
  return {
    textId: event.textId,
    x: event.x != null ? event.x : (previous?.x ?? 0),
    y: event.y != null ? event.y : (previous?.y ?? 0),
    width: event.width > 0.01 ? event.width : (previous?.width ?? DEFAULT_TEXT_WIDTH),
    text: event.text != null ? event.text : (previous?.text ?? ''),
    color: event.color ?? previous?.color ?? DEFAULT_STROKE_COLOR,
    fontSize: event.fontSize > 0 ? event.fontSize : (previous?.fontSize ?? DEFAULT_TEXT_FONT_SIZE),
    locked: event.locked === true || previous?.locked === true,
  }
}

function buildTextMap(events) {
  const texts = new Map()

  for (const event of events) {
    if (event.type === 'BOARD_CLEAR') {
      texts.clear()
      continue
    }

    if (event.type === 'REGION_CLEAR') {
      const rect = {
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
      }
      for (const [id, item] of [...texts.entries()]) {
        if (textIntersectsRect(item, rect)) {
          texts.delete(id)
        }
      }
      continue
    }

    if (event.type === 'TEXT_ADD') {
      texts.set(event.textId, normalizeTextFields(event))
      continue
    }

    const item = texts.get(event.textId)
    if (!item) continue

    if (event.type === 'TEXT_MOVE') {
      item.x = event.x
      item.y = event.y
    }

    if (event.type === 'TEXT_TEXT') {
      item.text = event.text ?? ''
    }

    if (event.type === 'TEXT_LOCK') {
      if (event.text != null) item.text = event.text
      item.locked = true
    }

    if (event.type === 'TEXT_DELETE') {
      texts.delete(event.textId)
    }
  }

  return texts
}

export default function BoardPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { isTeacher } = useAuth()
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const backPath = isTeacher ? '/teacher' : '/'

  const [mode, setMode] = useState('draw')
  const [strokeColor, setStrokeColor] = useState(DEFAULT_STROKE_COLOR)
  const [shapeType, setShapeType] = useState('rect')
  const [snapshotEvents, setSnapshotEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [snapshotError, setSnapshotError] = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const [stickers, setStickers] = useState(() => new Map())
  const [texts, setTexts] = useState(() => new Map())
  const [selectedStickerId, setSelectedStickerId] = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [focusStickerId, setFocusStickerId] = useState(null)
  const [focusTextId, setFocusTextId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [incognitoMode, setIncognitoMode] = useState(false)
  const [incognitoStickers, setIncognitoStickers] = useState(() => new Map())
  const [incognitoTexts, setIncognitoTexts] = useState(() => new Map())
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  const selectedImageIdRef = useRef(null)
  const stickersRef = useRef(stickers)
  const textsRef = useRef(texts)
  const incognitoStickersRef = useRef(incognitoStickers)
  const incognitoTextsRef = useRef(incognitoTexts)
  const incognitoModeRef = useRef(incognitoMode)
  const incognitoStickerIdsRef = useRef(new Set())
  const incognitoTextIdsRef = useRef(new Set())
  const incognitoSaveTimerRef = useRef(null)
  const dragOriginRef = useRef(null)
  const textDraftRef = useRef(new Map())
  const textTimerRef = useRef(new Map())
  const remoteHandlerRef = useRef(null)
  const eventQueueRef = useRef([])

  useEffect(() => {
    stickersRef.current = stickers
  }, [stickers])

  useEffect(() => {
    textsRef.current = texts
  }, [texts])

  useEffect(() => {
    incognitoStickersRef.current = incognitoStickers
  }, [incognitoStickers])

  useEffect(() => {
    incognitoTextsRef.current = incognitoTexts
  }, [incognitoTexts])

  useEffect(() => {
    incognitoModeRef.current = incognitoMode
  }, [incognitoMode])

  const displayStickers = useMemo(() => {
    if (!isTeacher) return stickers
    const merged = new Map(stickers)
    incognitoStickers.forEach((sticker, id) => merged.set(id, sticker))
    return merged
  }, [stickers, incognitoStickers, isTeacher])

  const displayTexts = useMemo(() => {
    if (!isTeacher) return texts
    const merged = new Map(texts)
    incognitoTexts.forEach((item, id) => merged.set(id, item))
    return merged
  }, [texts, incognitoTexts, isTeacher])

  const applyIncognitoStickerEvent = useCallback((event) => {
    if (event.type === 'STICKER_DELETE') {
      if (!event.stickerId) return
      setIncognitoStickers((prev) => {
        if (!prev.has(event.stickerId)) return prev
        const next = new Map(prev)
        next.delete(event.stickerId)
        return next
      })
      return
    }

    if (event.type === 'STICKER_ADD') {
      if (!event.stickerId) return

      setIncognitoStickers((prev) => {
        const next = new Map(prev)
        const previous = prev.get(event.stickerId)
        next.set(event.stickerId, normalizeStickerFields(event, previous))
        return next
      })
      return
    }

    setIncognitoStickers((prev) => {
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

  const applyIncognitoTextEvent = useCallback((event) => {
    if (event.type === 'TEXT_DELETE') {
      if (!event.textId) return
      setIncognitoTexts((prev) => {
        if (!prev.has(event.textId)) return prev
        const next = new Map(prev)
        next.delete(event.textId)
        return next
      })
      return
    }

    if (event.type === 'TEXT_ADD') {
      if (!event.textId) return

      setIncognitoTexts((prev) => {
        const next = new Map(prev)
        const previous = prev.get(event.textId)
        next.set(event.textId, normalizeTextFields(event, previous))
        return next
      })
      return
    }

    setIncognitoTexts((prev) => {
      const item = prev.get(event.textId)
      if (!item) return prev

      const next = new Map(prev)
      const updated = { ...item }

      if (event.type === 'TEXT_MOVE') {
        if (event.x != null) updated.x = event.x
        if (event.y != null) updated.y = event.y
      }

      if (event.type === 'TEXT_TEXT') {
        if (event.text != null) updated.text = event.text
      }

      if (event.type === 'TEXT_LOCK') {
        if (event.text != null) updated.text = event.text
        updated.locked = true
      }

      next.set(event.textId, updated)
      return next
    })
  }, [])

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

  const applyTextEvent = useCallback((event) => {
    if (event.type === 'TEXT_DELETE') {
      if (!event.textId) return
      setTexts((prev) => {
        if (!prev.has(event.textId)) return prev
        const next = new Map(prev)
        next.delete(event.textId)
        return next
      })
      return
    }

    if (event.type === 'TEXT_ADD') {
      if (!event.textId) return

      setTexts((prev) => {
        const next = new Map(prev)
        const previous = prev.get(event.textId)
        next.set(event.textId, normalizeTextFields(event, previous))
        return next
      })
      return
    }

    setTexts((prev) => {
      const item = prev.get(event.textId)
      if (!item) return prev

      const next = new Map(prev)
      const updated = { ...item }

      if (event.type === 'TEXT_MOVE') {
        if (event.x != null) updated.x = event.x
        if (event.y != null) updated.y = event.y
      }

      if (event.type === 'TEXT_TEXT') {
        if (event.text != null) updated.text = event.text
      }

      if (event.type === 'TEXT_LOCK') {
        if (event.text != null) updated.text = event.text
        updated.locked = true
      }

      next.set(event.textId, updated)
      return next
    })
  }, [])

  const onMessage = useCallback((event) => {
    if (event.type?.startsWith('STICKER_')) {
      applyStickerEvent(event)
      return
    }

    if (event.type?.startsWith('TEXT_')) {
      applyTextEvent(event)
      return
    }

    if (event.type === 'BOARD_CLEAR') {
      setStickers(new Map())
      setTexts(new Map())
      setSelectedStickerId(null)
      setSelectedTextId(null)
      setFocusStickerId(null)
      setFocusTextId(null)
    }

    if (event.type === 'REGION_CLEAR') {
      const rect = {
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
      }
      for (const stickerId of collectStickerIdsInRegion(stickersRef.current, rect)) {
        applyStickerEvent({ type: 'STICKER_DELETE', stickerId })
      }
      for (const textId of collectTextIdsInRegion(textsRef.current, rect)) {
        applyTextEvent({ type: 'TEXT_DELETE', textId })
      }
    }

    if (remoteHandlerRef.current) {
      remoteHandlerRef.current(event)
    } else {
      eventQueueRef.current.push(event)
    }
  }, [applyStickerEvent, applyTextEvent])

  const registerRemoteHandler = useCallback((handler) => {
    remoteHandlerRef.current = handler
    eventQueueRef.current.forEach((event) => handler(event))
    eventQueueRef.current = []
  }, [])

  const { sendDraw, connected, connectionError } = useWebSocket(roomId, onMessage)
  const boardBlocked = accessDenied || Boolean(snapshotError)

  const scheduleIncognitoSave = useCallback(() => {
    if (!isTeacher || !roomId) return

    if (incognitoSaveTimerRef.current) {
      clearTimeout(incognitoSaveTimerRef.current)
    }

    incognitoSaveTimerRef.current = setTimeout(() => {
      const canvasState = canvasRef.current?.getIncognitoState?.() ?? {
        canvasEvents: [],
        entityKeys: [],
      }

      saveIncognitoData(roomId, {
        canvasEvents: canvasState.canvasEvents,
        entityKeys: canvasState.entityKeys,
        stickers: mapToArray(incognitoStickersRef.current),
        texts: mapToArray(incognitoTextsRef.current),
        stickerIds: [...incognitoStickerIdsRef.current],
        textIds: [...incognitoTextIdsRef.current],
      })
    }, 400)
  }, [isTeacher, roomId])

  const isIncognitoStickerEvent = useCallback((event) => {
    const id = event.stickerId
    if (!id) return incognitoModeRef.current && event.type === 'STICKER_ADD'

    if (incognitoStickerIdsRef.current.has(id) || incognitoStickersRef.current.has(id)) {
      if (!incognitoStickerIdsRef.current.has(id)) {
        incognitoStickerIdsRef.current.add(id)
      }
      return true
    }

    return incognitoModeRef.current && event.type === 'STICKER_ADD'
  }, [])

  const isIncognitoTextEvent = useCallback((event) => {
    const id = event.textId
    if (!id) return incognitoModeRef.current && event.type === 'TEXT_ADD'

    if (incognitoTextIdsRef.current.has(id) || incognitoTextsRef.current.has(id)) {
      if (!incognitoTextIdsRef.current.has(id)) {
        incognitoTextIdsRef.current.add(id)
      }
      return true
    }

    return incognitoModeRef.current && event.type === 'TEXT_ADD'
  }, [])

  const commitStickerEvent = useCallback((event) => {
    const isIncognito = isIncognitoStickerEvent(event)

    if (event.type === 'STICKER_ADD' && isIncognito) {
      incognitoStickerIdsRef.current.add(event.stickerId)
    }
    if (event.type === 'STICKER_DELETE') {
      incognitoStickerIdsRef.current.delete(event.stickerId)
    }

    if (isIncognito) {
      applyIncognitoStickerEvent(event)
      scheduleIncognitoSave()
      return
    }

    applyStickerEvent(event)
    sendDraw(event)
  }, [applyStickerEvent, applyIncognitoStickerEvent, sendDraw, scheduleIncognitoSave, isIncognitoStickerEvent])

  const commitTextEvent = useCallback((event) => {
    const isIncognito = isIncognitoTextEvent(event)

    if (event.type === 'TEXT_ADD' && isIncognito) {
      incognitoTextIdsRef.current.add(event.textId)
    }
    if (event.type === 'TEXT_DELETE') {
      incognitoTextIdsRef.current.delete(event.textId)
    }

    if (isIncognito) {
      applyIncognitoTextEvent(event)
      scheduleIncognitoSave()
      return
    }

    applyTextEvent(event)
    sendDraw(event)
  }, [applyTextEvent, applyIncognitoTextEvent, sendDraw, scheduleIncognitoSave, isIncognitoTextEvent])

  const handleIncognitoToggle = useCallback(() => {
    setIncognitoMode((current) => !current)
  }, [])

  const handleIncognitoCanvasChange = useCallback(() => {
    scheduleIncognitoSave()
  }, [scheduleIncognitoSave])

  const handleClearApplied = useCallback((event) => {
    if (event.type === 'BOARD_CLEAR') {
      const textIds = event.incognito
        ? [...incognitoTextsRef.current.keys()]
        : [...textsRef.current.keys()]
      const stickerIds = event.incognito
        ? [...incognitoStickersRef.current.keys()]
        : [...stickersRef.current.keys()]

      for (const stickerId of stickerIds) {
        commitStickerEvent({ type: 'STICKER_DELETE', stickerId })
      }
      for (const textId of textIds) {
        commitTextEvent({ type: 'TEXT_DELETE', textId })
      }

      setSelectedStickerId(null)
      setSelectedTextId(null)
      setFocusStickerId(null)
      setFocusTextId(null)
      scheduleIncognitoSave()
      return
    }

    if (event.type === 'REGION_CLEAR') {
      const rect = {
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
      }

      for (const stickerId of collectStickerIdsInRegion(incognitoStickersRef.current, rect)) {
        commitStickerEvent({ type: 'STICKER_DELETE', stickerId })
      }
      for (const textId of collectTextIdsInRegion(incognitoTextsRef.current, rect)) {
        commitTextEvent({ type: 'TEXT_DELETE', textId })
      }

      if (!event.incognito) {
        for (const stickerId of collectStickerIdsInRegion(stickersRef.current, rect)) {
          commitStickerEvent({ type: 'STICKER_DELETE', stickerId })
        }
        for (const textId of collectTextIdsInRegion(textsRef.current, rect)) {
          commitTextEvent({ type: 'TEXT_DELETE', textId })
        }
      }

      scheduleIncognitoSave()
    }
  }, [commitStickerEvent, commitTextEvent, scheduleIncognitoSave])

  const handleClearAllRequest = useCallback(() => {
    setClearDialogOpen(true)
  }, [])

  const confirmClearAll = useCallback(async () => {
    setClearDialogOpen(false)
    await canvasRef.current?.clearBoard()
  }, [])

  useEffect(() => {
    if (!isTeacher || !roomId) return

    const data = loadIncognitoData(roomId)
    if (!data) return

    setIncognitoStickers(arrayToMap(data.stickers))
    setIncognitoTexts(arrayToMap(data.texts))
    incognitoStickerIdsRef.current = new Set(data.stickerIds ?? [])
    incognitoTextIdsRef.current = new Set(data.textIds ?? [])
  }, [isTeacher, roomId])

  useEffect(() => {
    if (!isTeacher || loading || !roomId) return

    const data = loadIncognitoData(roomId)
    if (!data?.canvasEvents?.length && !data?.entityKeys?.length) return

    canvasRef.current?.loadIncognitoState?.({
      canvasEvents: data.canvasEvents ?? [],
      entityKeys: data.entityKeys ?? [],
    })
  }, [isTeacher, loading, roomId, snapshotEvents])

  useEffect(() => {
    return () => {
      if (incognitoSaveTimerRef.current) clearTimeout(incognitoSaveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadRoomMeta() {
      try {
        const room = await apiJson(`/room/${roomId}`)
        if (cancelled) return
        setRoomName(room.name || `Доска #${roomId}`)
      } catch {
        if (!cancelled) setRoomName(`Комната #${roomId}`)
      }
    }

    loadRoomMeta()
    return () => {
      cancelled = true
    }
  }, [roomId])

  const saveRoomName = async (event) => {
    event?.preventDefault()
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setNameError('Название не может быть пустым')
      return
    }

    setNameSaving(true)
    setNameError('')

    try {
      const updated = await apiJson(`/room/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      })
      setRoomName(updated.name || trimmed)
      setEditingName(false)
    } catch (err) {
      setNameError(err.message || 'Не удалось переименовать')
    } finally {
      setNameSaving(false)
    }
  }

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

        // Не затираем стикеры, добавленные до завершения snapshot
        setStickers((prev) => {
          const fromSnapshot = buildStickerMap(events)
          if (prev.size === 0) return fromSnapshot

          const merged = new Map(fromSnapshot)
          prev.forEach((sticker, id) => merged.set(id, sticker))
          return merged
        })

        setTexts((prev) => {
          const fromSnapshot = buildTextMap(events)
          if (prev.size === 0) return fromSnapshot

          const merged = new Map(fromSnapshot)
          prev.forEach((item, id) => merged.set(id, item))
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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const deleteSticker = useCallback((stickerId) => {
    if (!stickerId) return

    const event = { type: 'STICKER_DELETE', stickerId }
    commitStickerEvent(event)
    setSelectedStickerId((current) => (current === stickerId ? null : current))
    setFocusStickerId((current) => (current === stickerId ? null : current))
    closeContextMenu()
  }, [commitStickerEvent, closeContextMenu])

  const deleteText = useCallback((textId) => {
    if (!textId) return

    const event = { type: 'TEXT_DELETE', textId }
    commitTextEvent(event)
    setSelectedTextId((current) => (current === textId ? null : current))
    setFocusTextId((current) => (current === textId ? null : current))
    closeContextMenu()
  }, [commitTextEvent, closeContextMenu])

  const deleteSelectedImage = useCallback(() => {
    const deleted = canvasRef.current?.deleteSelectedImage()
    if (deleted) {
      setSelectedStickerId(null)
      setFocusStickerId(null)
      setSelectedTextId(null)
      setFocusTextId(null)
      closeContextMenu()
    }
    return deleted
  }, [closeContextMenu])

  const handleDeleteSelected = useCallback(() => {
    if (selectedStickerId) {
      deleteSticker(selectedStickerId)
      return
    }
    if (selectedTextId) {
      deleteText(selectedTextId)
      return
    }
    deleteSelectedImage()
  }, [selectedStickerId, selectedTextId, deleteSticker, deleteText, deleteSelectedImage])

  const handleImageSelectionChange = useCallback((imageId) => {
    selectedImageIdRef.current = imageId
    if (imageId) {
      setSelectedStickerId(null)
      setFocusStickerId(null)
      setSelectedTextId(null)
      setFocusTextId(null)
    }
  }, [])

  const handleSelectSticker = useCallback((stickerId) => {
    setSelectedStickerId(stickerId)
    setSelectedTextId(null)
    setFocusTextId(null)
    canvasRef.current?.clearSelection()
  }, [])

  const handleSelectText = useCallback((textId) => {
    setSelectedTextId(textId)
    setSelectedStickerId(null)
    setFocusStickerId(null)
    canvasRef.current?.clearSelection()
  }, [])

  const handleStickerContextMenu = useCallback((stickerId, x, y) => {
    setSelectedStickerId(stickerId)
    setSelectedTextId(null)
    canvasRef.current?.clearSelection()
    setContextMenu({ type: 'sticker', targetId: stickerId, x, y })
  }, [])

  const handleTextContextMenu = useCallback((textId, x, y) => {
    setSelectedTextId(textId)
    setSelectedStickerId(null)
    canvasRef.current?.clearSelection()
    setContextMenu({ type: 'text', targetId: textId, x, y })
  }, [])

  const handleImageContextMenu = useCallback(({ x, y }) => {
    setSelectedStickerId(null)
    setFocusStickerId(null)
    setSelectedTextId(null)
    setFocusTextId(null)
    setContextMenu({ type: 'image', x, y })
  }, [])

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu?.type === 'sticker') {
      deleteSticker(contextMenu.targetId)
      return
    }
    if (contextMenu?.type === 'text') {
      deleteText(contextMenu.targetId)
      return
    }
    deleteSelectedImage()
  }, [contextMenu, deleteSticker, deleteText, deleteSelectedImage])

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
    if (loading) return

    if (mode === 'sticker') {
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

      commitStickerEvent(event)
      setSelectedStickerId(stickerId)
      setFocusStickerId(stickerId)
      setSelectedTextId(null)
      setFocusTextId(null)
      setMode('select')
      return
    }

    if (mode === 'text') {
      const zoom = camera.zoom > 0 ? camera.zoom : 0.01
      const textId = crypto.randomUUID()
      const event = {
        type: 'TEXT_ADD',
        textId,
        x: norm.x,
        y: norm.y,
        width: DEFAULT_TEXT_WIDTH,
        text: '',
        color: strokeColor,
        fontSize: textFontSizeForZoom(DEFAULT_TEXT_FONT_SIZE, zoom),
        locked: false,
      }

      commitTextEvent(event)
      setSelectedTextId(textId)
      setFocusTextId(textId)
      setSelectedStickerId(null)
      setFocusStickerId(null)
      canvasRef.current?.clearSelection()
    }
  }, [
    loading,
    mode,
    strokeColor,
    camera.zoom,
    commitStickerEvent,
    commitTextEvent,
  ])

  const updateStickerText = useCallback((stickerId, text) => {
    const isIncognito = incognitoStickerIdsRef.current.has(stickerId)
    const setter = isIncognito ? setIncognitoStickers : setStickers
    setter((prev) => {
      const sticker = prev.get(stickerId)
      if (!sticker || sticker.text === text) return prev
      const next = new Map(prev)
      next.set(stickerId, { ...sticker, text })
      return next
    })
  }, [])

  const handleStickerTextChange = useCallback((stickerId, text) => {
    updateStickerText(stickerId, text)

    textDraftRef.current.set(stickerId, text)

    const existingTimer = textTimerRef.current.get(stickerId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      commitStickerEvent({ type: 'STICKER_TEXT', stickerId, text })
      textDraftRef.current.delete(stickerId)
    }, 400)

    textTimerRef.current.set(stickerId, timer)
  }, [commitStickerEvent, updateStickerText])

  const handleStickerTextCommit = useCallback((stickerId) => {
    const timer = textTimerRef.current.get(stickerId)
    if (timer) {
      clearTimeout(timer)
      textTimerRef.current.delete(stickerId)
    }

    const text = textDraftRef.current.get(stickerId)
    if (text != null) {
      commitStickerEvent({ type: 'STICKER_TEXT', stickerId, text })
      textDraftRef.current.delete(stickerId)
    }
  }, [commitStickerEvent])

  const handleStickerMoveStart = useCallback((stickerId) => {
    const sticker = incognitoStickerIdsRef.current.has(stickerId)
      ? incognitoStickersRef.current.get(stickerId)
      : stickersRef.current.get(stickerId)
    if (!sticker) return
    dragOriginRef.current = { stickerId, x: sticker.x, y: sticker.y }
    setSelectedStickerId(stickerId)
    setFocusStickerId(null)
  }, [])

  const handleStickerMove = useCallback((stickerId, dx, dy) => {
    const isIncognito = incognitoStickerIdsRef.current.has(stickerId)
    const setter = isIncognito ? setIncognitoStickers : setStickers
    setter((prev) => {
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
    const sticker = incognitoStickerIdsRef.current.has(stickerId)
      ? incognitoStickersRef.current.get(stickerId)
      : stickersRef.current.get(stickerId)
    const origin = dragOriginRef.current
    dragOriginRef.current = null

    if (!sticker || !origin || origin.stickerId !== stickerId) return
    if (sticker.x === origin.x && sticker.y === origin.y) return

    commitStickerEvent({
      type: 'STICKER_MOVE',
      stickerId,
      x: sticker.x,
      y: sticker.y,
    })
  }, [commitStickerEvent])

  const updateTextContent = useCallback((textId, text) => {
    const isIncognito = incognitoTextIdsRef.current.has(textId)
    const setter = isIncognito ? setIncognitoTexts : setTexts
    setter((prev) => {
      const item = prev.get(textId)
      if (!item || item.text === text) return prev
      const next = new Map(prev)
      next.set(textId, { ...item, text })
      return next
    })
  }, [])

  const handleTextChange = useCallback((textId, text) => {
    updateTextContent(textId, text)

    textDraftRef.current.set(textId, text)

    const existingTimer = textTimerRef.current.get(textId)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      commitTextEvent({ type: 'TEXT_TEXT', textId, text })
      textDraftRef.current.delete(textId)
    }, 400)

    textTimerRef.current.set(textId, timer)
  }, [commitTextEvent, updateTextContent])

  const handleTextCommit = useCallback((textId) => {
    const timer = textTimerRef.current.get(textId)
    if (timer) {
      clearTimeout(timer)
      textTimerRef.current.delete(textId)
    }

    const draft = textDraftRef.current.get(textId)
    const item = incognitoTextIdsRef.current.has(textId)
      ? incognitoTextsRef.current.get(textId)
      : textsRef.current.get(textId)
    if (!item || item.locked) return

    const text = (draft != null ? draft : item.text)?.trim()

    if (draft != null) {
      textDraftRef.current.delete(textId)
    }

    if (!text) {
      deleteText(textId)
      setFocusTextId(null)
      return
    }

    setFocusTextId(null)
    commitTextEvent({ type: 'TEXT_LOCK', textId, text, locked: true })
  }, [commitTextEvent, deleteText])

  const handleTextMoveStart = useCallback((textId) => {
    const item = incognitoTextIdsRef.current.has(textId)
      ? incognitoTextsRef.current.get(textId)
      : textsRef.current.get(textId)
    if (!item?.locked) return
    dragOriginRef.current = { textId, x: item.x, y: item.y }
    setSelectedTextId(textId)
    setFocusTextId(null)
  }, [])

  const handleTextMove = useCallback((textId, dx, dy) => {
    const isIncognito = incognitoTextIdsRef.current.has(textId)
    const setter = isIncognito ? setIncognitoTexts : setTexts
    setter((prev) => {
      const item = prev.get(textId)
      if (!item) return prev
      const next = new Map(prev)
      next.set(textId, {
        ...item,
        x: item.x + dx,
        y: item.y + dy,
      })
      return next
    })
  }, [])

  const handleTextMoveEnd = useCallback((textId) => {
    const item = incognitoTextIdsRef.current.has(textId)
      ? incognitoTextsRef.current.get(textId)
      : textsRef.current.get(textId)
    const origin = dragOriginRef.current
    dragOriginRef.current = null

    if (!item || !origin || origin.textId !== textId) return
    if (item.x === origin.x && item.y === origin.y) return

    commitTextEvent({
      type: 'TEXT_MOVE',
      textId,
      x: item.x,
      y: item.y,
    })
  }, [commitTextEvent])

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
      setSelectedTextId(null)
      setFocusTextId(null)
    }
  }

  return (
    <div className="board-page" onClick={closeContextMenu}>
      <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
              <ArrowLeft data-icon="inline-start" />
              Назад
            </Button>
            {editingName ? (
              <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={saveRoomName}>
                <Input
                  className="max-w-xs"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={nameSaving}
                  autoFocus
                  maxLength={100}
                />
                <Button type="submit" size="sm" disabled={nameSaving}>
                  <Check data-icon="inline-start" />
                  {nameSaving ? '...' : 'OK'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={nameSaving}
                  onClick={() => {
                    setEditingName(false)
                    setNameError('')
                  }}
                >
                  <X data-icon="inline-start" />
                </Button>
              </form>
            ) : (
              <>
                <h2 className="truncate text-lg font-semibold sm:text-xl">
                  {roomName || `Комната #${roomId}`}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Переименовать доску"
                  onClick={() => {
                    setNameDraft(roomName || '')
                    setNameError('')
                    setEditingName(true)
                  }}
                >
                  <Pencil />
                </Button>
              </>
            )}
          </div>
          <Badge variant={connected ? 'default' : 'secondary'}>
            {connected ? 'Подключено' : 'Подключение...'}
          </Badge>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={window.location.href} className="font-mono text-xs sm:flex-1" />
          <Button type="button" variant="outline" onClick={copyLink} className="sm:shrink-0">
            <Copy data-icon="inline-start" />
            Копировать
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {nameError && (
            <Alert variant="destructive">
              <AlertDescription>{nameError}</AlertDescription>
            </Alert>
          )}
          {loading && (
            <Alert>
              <AlertDescription>Загрузка доски...</AlertDescription>
            </Alert>
          )}
          {snapshotError && (
            <Alert variant="destructive">
              <AlertDescription>{snapshotError}</AlertDescription>
            </Alert>
          )}
          {connectionError && (
            <Alert variant="destructive">
              <AlertDescription>{connectionError}</AlertDescription>
            </Alert>
          )}
          {!boardBlocked && !connected && !connectionError && (
            <Alert>
              <AlertDescription>Подождите подключения перед рисованием</AlertDescription>
            </Alert>
          )}
        </div>
      </header>

      {boardBlocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-muted-foreground">{snapshotError || 'Доступ к доске запрещён'}</p>
          <Button onClick={() => navigate(backPath)}>
            Вернуться к списку досок
          </Button>
        </div>
      ) : (
      <div className={`board-workspace${incognitoMode ? ' board-workspace--incognito' : ''}`}>
        <Toolbar
          mode={mode}
          strokeColor={strokeColor}
          shapeType={shapeType}
          isTeacher={isTeacher}
          incognitoMode={incognitoMode}
          onIncognitoToggle={handleIncognitoToggle}
          onStrokeColorChange={setStrokeColor}
          onShapeTypeChange={setShapeType}
          onModeChange={handleModeChange}
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onResetView={() => canvasRef.current?.resetView()}
          onImageUpload={handleImageUpload}
          onClearAllRequest={handleClearAllRequest}
        />

        <div className="board-canvas-area">
          {incognitoMode && isTeacher && (
            <div className="board-incognito-banner" role="status">
              Режим инкогнито — видно только вам
            </div>
          )}
          <Canvas
            ref={canvasRef}
            mode={mode}
            shapeType={shapeType}
            strokeColor={strokeColor}
            incognitoMode={incognitoMode}
            onModeChange={handleModeChange}
            sendDraw={sendDraw}
            snapshotEvents={snapshotEvents}
            registerRemoteHandler={registerRemoteHandler}
            onCameraChange={setCamera}
            onBoardClick={handleBoardClick}
            onImageSelectionChange={handleImageSelectionChange}
            onImageContextMenu={handleImageContextMenu}
            onClearApplied={handleClearApplied}
            onIncognitoCanvasChange={handleIncognitoCanvasChange}
          />

          <StickerLayer
            stickers={displayStickers}
            camera={camera}
            mode={mode}
            ignorePointer={mode === 'region-clear'}
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

          <TextLayer
            texts={displayTexts}
            camera={camera}
            mode={mode}
            ignorePointer={mode === 'region-clear'}
            selectedTextId={selectedTextId}
            focusTextId={focusTextId}
            onSelectText={handleSelectText}
            onTextChange={handleTextChange}
            onTextCommit={handleTextCommit}
            onTextMoveStart={handleTextMoveStart}
            onTextMove={handleTextMove}
            onTextMoveEnd={handleTextMoveEnd}
            onTextContextMenu={handleTextContextMenu}
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

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {incognitoMode ? 'Очистить приватный слой?' : 'Очистить доску?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {incognitoMode
                ? 'Будут удалены только ваши инкогнито-объекты. Общая доска останется без изменений.'
                : 'Все рисунки, фигуры, картинки, стикеры и текст будут удалены у всех участников. Это действие нельзя отменить.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmClearAll}>
              Очистить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
