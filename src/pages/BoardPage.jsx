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
import TemplateSaveDialog from '../components/TemplateSaveDialog.jsx'
import TemplateLibraryPanel from '../components/TemplateLibraryPanel.jsx'
import TemplateGroupOverlay, { clampTemplateRect } from '../components/TemplateGroupOverlay.jsx'
import { extractTemplateForApi } from '../lib/templateExtract.js'
import {
  listTemplates,
  createTemplate,
  deleteTemplate,
  insertTemplate,
  buildCreateTemplateRequest,
  readTemplateBounds,
} from '../api/templates.js'
import { MAX_TEMPLATES_PER_TEACHER, MAX_TEMPLATE_NAME_LENGTH } from '../constants/templates.js'
import { WORLD_WIDTH, WORLD_HEIGHT, MIN_SHAPE_SIZE } from '../constants/board.js'
import { uuid, CLIENT_ID } from '../lib/uuid.js'
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
  const [templatesPanelOpen, setTemplatesPanelOpen] = useState(false)
  const [templateList, setTemplateList] = useState([])
  const [templateTotal, setTemplateTotal] = useState(0)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState('')
  const [templateSaveOpen, setTemplateSaveOpen] = useState(false)
  const [templateSaveName, setTemplateSaveName] = useState('')
  const [templateSaveDraft, setTemplateSaveDraft] = useState(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateSaveError, setTemplateSaveError] = useState('')
  const [templateFeedback, setTemplateFeedback] = useState('')
  const [pendingInsertTemplate, setPendingInsertTemplate] = useState(null)
  const [insertingTemplateId, setInsertingTemplateId] = useState(null)
  const [activeTemplateInstance, setActiveTemplateInstance] = useState(null)

  const selectedImageIdRef = useRef(null)
  const canvasAreaRef = useRef(null)
  const activeTemplateInstanceRef = useRef(null)
  const templateGroupDragRef = useRef(null)
  const templateInstancesRef = useRef(new Map())
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

  useEffect(() => {
    activeTemplateInstanceRef.current = activeTemplateInstance
  }, [activeTemplateInstance])

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

  const rememberTemplateMember = useCallback((event) => {
    const instanceId = event.templateInstanceId
    if (!instanceId) return

    const current = templateInstancesRef.current.get(instanceId) ?? {
      instanceId,
      templateId: event.savedTemplateId,
      rect: { x: 0, y: 0, width: 0.12, height: 0.08 },
      originRect: null,
      snapshots: [],
      members: {
        strokeRasterImageId: null,
        shapeIds: [],
        imageIds: [],
        stickerIds: [],
        textIds: [],
      },
    }

    if (event.type === 'TEMPLATE_GROUP_CREATE') {
      current.rect = {
        x: event.x ?? current.rect.x,
        y: event.y ?? current.rect.y,
        width: event.width ?? current.rect.width,
        height: event.height ?? current.rect.height,
      }
      current.originRect = { ...current.rect }
      current.templateId = event.savedTemplateId ?? current.templateId
    }

    if (event.type === 'IMAGE_ADD' && event.imageId) {
      current.snapshots.push({
        kind: 'image',
        imageId: event.imageId,
        x: event.x,
        y: event.y,
        imageWidth: event.imageWidth,
        imageHeight: event.imageHeight,
      })
    }
    if (event.type === 'SHAPE_ADD' && event.shapeId) {
      current.snapshots.push({
        kind: 'shape',
        shapeId: event.shapeId,
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
      })
    }
    if (event.type === 'STICKER_ADD' && event.stickerId) {
      current.snapshots.push({
        kind: 'sticker',
        stickerId: event.stickerId,
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height,
        text: event.text,
        color: event.color,
      })
    }
    if (event.type === 'TEXT_ADD' && event.textId) {
      current.snapshots.push({
        kind: 'text',
        textId: event.textId,
        x: event.x,
        y: event.y,
        width: event.width,
        text: event.text,
        color: event.color,
        fontSize: event.fontSize,
        locked: event.locked,
      })
    }
    if (event.shapeId && !current.members.shapeIds.includes(event.shapeId)) {
      current.members.shapeIds.push(event.shapeId)
    }
    if (event.imageId && !current.members.imageIds.includes(event.imageId)) {
      current.members.imageIds.push(event.imageId)
    }
    if (event.stickerId && !current.members.stickerIds.includes(event.stickerId)) {
      current.members.stickerIds.push(event.stickerId)
    }
    if (event.textId && !current.members.textIds.includes(event.textId)) {
      current.members.textIds.push(event.textId)
    }

    templateInstancesRef.current.set(instanceId, current)
    return current
  }, [])

  const onMessage = useCallback((event) => {
    if (event.clientId === CLIENT_ID) return

    if (event.templateInstanceId || event.type?.startsWith('TEMPLATE_')) {
      const instance = rememberTemplateMember(event)
      if (event.type === 'TEMPLATE_GROUP_CREATE' && instance) {
        setActiveTemplateInstance({ ...instance, name: 'Шаблон' })
      }
    }

    if (event.type?.startsWith('TEMPLATE_')) {
      return
    }

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
  }, [applyStickerEvent, applyTextEvent, rememberTemplateMember])

  const registerRemoteHandler = useCallback((handler) => {
    remoteHandlerRef.current = handler
    eventQueueRef.current.forEach((event) => handler(event))
    eventQueueRef.current = []
  }, [])

  const { sendDraw, connected, connectionError } = useWebSocket(roomId, onMessage)
  const boardBlocked = accessDenied || Boolean(snapshotError)

  const sendCanvasEvent = useCallback((event) => {
    if (event.type === 'IMAGE_ADD') {
      return apiJson(`/room/${roomId}/events`, {
        method: 'POST',
        body: JSON.stringify({ ...event, clientId: CLIENT_ID }),
      })
        .then(() => true)
        .catch((error) => {
          console.error('Failed to save image event', error)
          return false
        })
    }

    return sendDraw(event)
  }, [roomId, sendDraw])

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

  const refreshTemplates = useCallback(async () => {
    if (!isTeacher) return
    setTemplatesLoading(true)
    setTemplatesError('')
    try {
      const data = await listTemplates()
      setTemplateList(data.items)
      setTemplateTotal(data.total)
    } catch (err) {
      setTemplatesError(err.message || 'Не удалось загрузить шаблоны')
    } finally {
      setTemplatesLoading(false)
    }
  }, [isTeacher])

  useEffect(() => {
    if (isTeacher) {
      refreshTemplates()
    }
  }, [isTeacher, refreshTemplates])

  const getNormFromClient = useCallback((clientX, clientY) => {
    const el = canvasAreaRef.current
    if (!el) return null
    const bounds = el.getBoundingClientRect()
    const zoom = camera.zoom > 0 ? camera.zoom : 0.01
    const sx = clientX - bounds.left
    const sy = clientY - bounds.top
    return {
      x: (camera.x + sx / zoom) / WORLD_WIDTH,
      y: (camera.y + sy / zoom) / WORLD_HEIGHT,
    }
  }, [camera])

  const syncTemplateInstanceToBoard = useCallback(async (instance) => {
    const stored = templateInstancesRef.current.get(instance.instanceId) ?? instance
    const origin = stored.originRect
    if (!origin || origin.width <= 0 || origin.height <= 0) return

    const scaleX = instance.rect.width / origin.width
    const scaleY = instance.rect.height / origin.height
    const canvasEvents = []

    sendDraw({
      type: 'TEMPLATE_GROUP_TRANSLATE',
      templateInstanceId: instance.instanceId,
      savedTemplateId: instance.templateId,
      x: instance.rect.x,
      y: instance.rect.y,
      width: instance.rect.width,
      height: instance.rect.height,
    })

    for (const snap of stored.snapshots ?? []) {
      const x = instance.rect.x + (snap.x - origin.x) * scaleX
      const y = instance.rect.y + (snap.y - origin.y) * scaleY
      if (snap.kind === 'image') {
        canvasEvents.push({
          type: 'IMAGE_RESIZE',
          imageId: snap.imageId,
          x,
          y,
          imageWidth: snap.imageWidth * scaleX,
          imageHeight: snap.imageHeight * scaleY,
        })
      }
      if (snap.kind === 'shape') {
        canvasEvents.push({
          type: 'SHAPE_RESIZE',
          shapeId: snap.shapeId,
          x,
          y,
          width: snap.width * scaleX,
          height: snap.height * scaleY,
        })
      }
      if (snap.kind === 'sticker') {
        commitStickerEvent({
          type: 'STICKER_ADD',
          stickerId: snap.stickerId,
          x,
          y,
          width: snap.width * scaleX,
          height: snap.height * scaleY,
          text: snap.text,
          color: snap.color,
        })
      }
      if (snap.kind === 'text') {
        commitTextEvent({
          type: 'TEXT_ADD',
          textId: snap.textId,
          x,
          y,
          width: snap.width * scaleX,
          text: snap.text,
          color: snap.color,
          fontSize: snap.fontSize * scaleY,
          locked: snap.locked,
        })
      }
    }

    if (canvasEvents.length) {
      await canvasRef.current?.publishPublicEvents?.(canvasEvents)
    }
  }, [commitStickerEvent, commitTextEvent, sendDraw])

  const handleTemplateCaptureComplete = useCallback((rect) => {
    if (!isTeacher) return
    setMode('select')
    const boardEvents = canvasRef.current?.getPublicCanvasEvents?.() ?? []
    const draft = extractTemplateForApi(
      boardEvents,
      stickersRef.current,
      textsRef.current,
      rect
    )
    if (draft.isEmpty) {
      setTemplateFeedback('В выделении нет объектов для сохранения')
      return
    }
    setTemplateSaveDraft(draft)
    setTemplateSaveName('')
    setTemplateSaveError('')
    setTemplateSaveOpen(true)
  }, [isTeacher])

  const closeTemplateSaveDialog = useCallback(() => {
    if (templateSaving) return
    setTemplateSaveOpen(false)
    setTemplateSaveDraft(null)
    setTemplateSaveError('')
  }, [templateSaving])

  const confirmTemplateSave = useCallback(async () => {
    const name = templateSaveName.trim()
    if (!name || !templateSaveDraft) return
    if (templateTotal >= MAX_TEMPLATES_PER_TEACHER) {
      setTemplateSaveError(`Достигнут лимит ${MAX_TEMPLATES_PER_TEACHER} шаблонов`)
      return
    }

    setTemplateSaving(true)
    setTemplateSaveError('')
    try {
      const body = buildCreateTemplateRequest(
        name.slice(0, MAX_TEMPLATE_NAME_LENGTH),
        templateSaveDraft
      )
      const created = await createTemplate(body)
      const listItem = {
        id: created.id,
        name: created.name,
        bounds: created.content?.bounds ?? templateSaveDraft.bounds,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        hasPreview: Boolean(created.previewData),
      }
      setTemplateList((prev) => {
        if (prev.some((item) => item.id === listItem.id)) return prev
        return [listItem, ...prev]
      })
      setTemplateTotal((prev) => prev + 1)
      closeTemplateSaveDialog()
      setTemplateFeedback('Шаблон сохранён')
      await refreshTemplates()
    } catch (err) {
      setTemplateSaveError(err.message || 'Не удалось сохранить шаблон')
    } finally {
      setTemplateSaving(false)
    }
  }, [
    templateSaveName,
    templateSaveDraft,
    templateTotal,
    closeTemplateSaveDialog,
    refreshTemplates,
  ])

  const insertTemplateAt = useCallback(async (templateMeta, norm) => {
    if (!connected) {
      setTemplateFeedback('Дождитесь подключения к доске перед вставкой')
      return
    }

    setInsertingTemplateId(templateMeta.id)
    try {
      const bounds = readTemplateBounds(templateMeta)
      const origin = {
        x: norm.x - bounds.width / 2,
        y: norm.y - bounds.height / 2,
      }
      const response = await insertTemplate(roomId, templateMeta.id, {
        x: origin.x,
        y: origin.y,
        scale: 1,
      })
      const instance = response?.templateInstanceId
        ? templateInstancesRef.current.get(response.templateInstanceId)
        : null
      if (instance) {
        setActiveTemplateInstance({
          ...instance,
          name: templateMeta.name || 'Шаблон',
        })
      }
      setPendingInsertTemplate(null)
      setMode('select')
      setTemplatesPanelOpen(false)
      setTemplateFeedback('Шаблон вставлен. Перетащите рамку, чтобы переместить или изменить размер.')
    } catch (err) {
      setTemplateFeedback(err.message || 'Не удалось вставить шаблон')
    } finally {
      setInsertingTemplateId(null)
    }
  }, [connected, roomId])

  const startTemplateInsert = useCallback((item) => {
    setPendingInsertTemplate(item)
    setMode('template-place')
    setActiveTemplateInstance(null)
    setTemplateFeedback('Нажмите на доску, чтобы вставить шаблон')
  }, [])

  const handleBoardClick = useCallback((norm) => {
    if (loading) return

    if (mode === 'template-place' && pendingInsertTemplate) {
      insertTemplateAt(pendingInsertTemplate, norm)
      return
    }

    if (mode === 'sticker') {
      const stickerId = uuid()
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
      const textId = uuid()
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
    pendingInsertTemplate,
    insertTemplateAt,
    strokeColor,
    camera.zoom,
    commitStickerEvent,
    commitTextEvent,
  ])

  const handleDeleteTemplate = useCallback(async (item) => {
    if (!item?.id) return
    if (!window.confirm(`Удалить шаблон «${item.name || 'Без названия'}»?`)) return
    try {
      await deleteTemplate(item.id)
      await refreshTemplates()
      setTemplateFeedback('Шаблон удалён')
    } catch (err) {
      setTemplateFeedback(err.message || 'Не удалось удалить шаблон')
    }
  }, [refreshTemplates])

  const resizeTemplateRectFromCorner = useCallback((orig, corner, norm) => {
    const origRight = orig.x + orig.width
    const origBottom = orig.y + orig.height

    if (corner === 'br') {
      return clampTemplateRect({
        x: orig.x,
        y: orig.y,
        width: Math.max(MIN_SHAPE_SIZE, norm.x - orig.x),
        height: Math.max(MIN_SHAPE_SIZE, norm.y - orig.y),
      })
    }
    if (corner === 'bl') {
      const newX = Math.min(norm.x, origRight - MIN_SHAPE_SIZE)
      return clampTemplateRect({
        x: newX,
        y: orig.y,
        width: origRight - newX,
        height: Math.max(MIN_SHAPE_SIZE, norm.y - orig.y),
      })
    }
    if (corner === 'tr') {
      const newY = Math.min(norm.y, origBottom - MIN_SHAPE_SIZE)
      return clampTemplateRect({
        x: orig.x,
        y: newY,
        width: Math.max(MIN_SHAPE_SIZE, norm.x - orig.x),
        height: origBottom - newY,
      })
    }
    const newX = Math.min(norm.x, origRight - MIN_SHAPE_SIZE)
    const newY = Math.min(norm.y, origBottom - MIN_SHAPE_SIZE)
    return clampTemplateRect({
      x: newX,
      y: newY,
      width: origRight - newX,
      height: origBottom - newY,
    })
  }, [])

  const handleTemplateGroupMoveStart = useCallback((e) => {
    const norm = getNormFromClient(e.clientX, e.clientY)
    const inst = activeTemplateInstanceRef.current
    if (!norm || !inst) return
    templateGroupDragRef.current = {
      kind: 'move',
      pointerId: e.pointerId,
      startNorm: norm,
      origRect: { ...inst.rect },
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [getNormFromClient])

  const handleTemplateGroupMove = useCallback((e) => {
    const drag = templateGroupDragRef.current
    if (!drag || drag.kind !== 'move' || drag.pointerId !== e.pointerId) return
    const norm = getNormFromClient(e.clientX, e.clientY)
    if (!norm) return
    const dx = norm.x - drag.startNorm.x
    const dy = norm.y - drag.startNorm.y
    setActiveTemplateInstance((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        rect: clampTemplateRect({
          ...drag.origRect,
          x: drag.origRect.x + dx,
          y: drag.origRect.y + dy,
        }),
      }
    })
  }, [getNormFromClient])

  const handleTemplateGroupMoveEnd = useCallback(async (e) => {
    const drag = templateGroupDragRef.current
    if (!drag || drag.kind !== 'move' || drag.pointerId !== e.pointerId) return
    templateGroupDragRef.current = null
    const inst = activeTemplateInstanceRef.current
    if (inst) {
      await syncTemplateInstanceToBoard(inst)
    }
  }, [syncTemplateInstanceToBoard])

  const handleTemplateGroupResizeStart = useCallback((corner, e) => {
    const inst = activeTemplateInstanceRef.current
    if (!inst) return
    templateGroupDragRef.current = {
      kind: 'resize',
      corner,
      pointerId: e.pointerId,
      origRect: { ...inst.rect },
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const handleTemplateGroupResize = useCallback((e) => {
    const drag = templateGroupDragRef.current
    if (!drag || drag.kind !== 'resize' || drag.pointerId !== e.pointerId) return
    const norm = getNormFromClient(e.clientX, e.clientY)
    if (!norm) return
    setActiveTemplateInstance((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        rect: resizeTemplateRectFromCorner(drag.origRect, drag.corner, norm),
      }
    })
  }, [getNormFromClient, resizeTemplateRectFromCorner])

  const handleTemplateGroupResizeEnd = useCallback(async (e) => {
    const drag = templateGroupDragRef.current
    if (!drag || drag.kind !== 'resize' || drag.pointerId !== e.pointerId) return
    templateGroupDragRef.current = null
    const inst = activeTemplateInstanceRef.current
    if (inst) {
      await syncTemplateInstanceToBoard(inst)
    }
  }, [syncTemplateInstanceToBoard])

  const handleModeChange = (nextMode) => {
    setMode(nextMode)
    closeContextMenu()
    if (nextMode === 'template-capture') {
      canvasRef.current?.clearSelection()
      setActiveTemplateInstance(null)
    }
    if (nextMode !== 'select') {
      setSelectedStickerId(null)
      setFocusStickerId(null)
      setSelectedTextId(null)
      setFocusTextId(null)
    }
    if (nextMode !== 'template-place') {
      setPendingInsertTemplate(null)
    }
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      if (e.key === 'Escape') {
        if (mode === 'template-capture' || mode === 'template-place') {
          setMode('select')
          setPendingInsertTemplate(null)
        }
        if (templateSaveOpen && !templateSaving) {
          setTemplateSaveOpen(false)
          setTemplateSaveDraft(null)
          setTemplateSaveError('')
        }
        return
      }

      if (e.key !== 'Delete') return

      e.preventDefault()
      handleDeleteSelected()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDeleteSelected, mode, templateSaveOpen, templateSaving])

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
          {templateFeedback && (
            <Alert>
              <AlertDescription>{templateFeedback}</AlertDescription>
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
          onOpenTemplateLibrary={() => {
            setTemplatesPanelOpen(true)
            refreshTemplates()
          }}
        />

        <div
          className="board-canvas-area"
          ref={canvasAreaRef}
          onClick={(e) => {
            if (!e.target.closest('.template-group-overlay')) {
              setActiveTemplateInstance(null)
            }
          }}
        >
          {incognitoMode && isTeacher && (
            <div className="board-incognito-banner" role="status">
              Режим инкогнито — видно только вам
            </div>
          )}
          {mode === 'template-place' && (
            <div className="board-incognito-banner" role="status">
              Нажмите на доску, чтобы вставить шаблон (Esc — отмена)
            </div>
          )}
          {mode === 'template-capture' && (
            <div className="board-incognito-banner" role="status">
              Выделите область для шаблона (Esc — отмена)
            </div>
          )}
          <Canvas
            ref={canvasRef}
            mode={mode}
            shapeType={shapeType}
            strokeColor={strokeColor}
            incognitoMode={incognitoMode}
            onModeChange={handleModeChange}
            sendDraw={sendCanvasEvent}
            snapshotEvents={snapshotEvents}
            registerRemoteHandler={registerRemoteHandler}
            onCameraChange={setCamera}
            onBoardClick={handleBoardClick}
            onImageSelectionChange={handleImageSelectionChange}
            onImageContextMenu={handleImageContextMenu}
            onClearApplied={handleClearApplied}
            onIncognitoCanvasChange={handleIncognitoCanvasChange}
            onTemplateCaptureComplete={handleTemplateCaptureComplete}
          />

          {isTeacher && activeTemplateInstance && (
            <TemplateGroupOverlay
              instance={activeTemplateInstance}
              camera={camera}
              onMoveStart={handleTemplateGroupMoveStart}
              onMove={handleTemplateGroupMove}
              onMoveEnd={handleTemplateGroupMoveEnd}
              onResizeStart={handleTemplateGroupResizeStart}
              onResize={handleTemplateGroupResize}
              onResizeEnd={handleTemplateGroupResizeEnd}
            />
          )}

          <StickerLayer
            stickers={displayStickers}
            camera={camera}
            mode={mode}
            ignorePointer={mode === 'region-clear' || mode === 'template-capture' || mode === 'template-place'}
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
            ignorePointer={mode === 'region-clear' || mode === 'template-capture' || mode === 'template-place'}
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

          {isTeacher && (
            <TemplateLibraryPanel
              open={templatesPanelOpen}
              items={templateList}
              total={templateTotal}
              loading={templatesLoading}
              error={templatesError}
              insertingId={insertingTemplateId}
              onClose={() => setTemplatesPanelOpen(false)}
              onRefresh={refreshTemplates}
              onInsert={startTemplateInsert}
              onDelete={handleDeleteTemplate}
            />
          )}
        </div>
      </div>
      )}

      <TemplateSaveDialog
        open={templateSaveOpen}
        name={templateSaveName}
        onNameChange={setTemplateSaveName}
        templateCount={templateTotal}
        saving={templateSaving}
        error={templateSaveError}
        onCancel={closeTemplateSaveDialog}
        onSave={confirmTemplateSave}
      />

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
