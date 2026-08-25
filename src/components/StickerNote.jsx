import { useEffect, useRef } from 'react'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants/board.js'
import '../styles/StickerNote.css'

export default function StickerNote({
  sticker,
  camera,
  isSelected,
  autoFocus,
  draggable,
  onSelect,
  onTextChange,
  onTextCommit,
  onMoveStart,
  onMove,
  onMoveEnd,
  onContextMenu,
}) {
  const textareaRef = useRef(null)
  const dragRef = useRef(null)

  const zoom = camera.zoom > 0 ? camera.zoom : 0.01
  const left = (sticker.x * WORLD_WIDTH - camera.x) * zoom
  const top = (sticker.y * WORLD_HEIGHT - camera.y) * zoom
  const width = sticker.width * WORLD_WIDTH * zoom
  const height = sticker.height * WORLD_HEIGHT * zoom
  const fontSize = Math.max(11, Math.min(20, width * 0.14))

  if (!Number.isFinite(left) || !Number.isFinite(top) || width < 4 || height < 4) {
    return null
  }

  useEffect(() => {
    if (!autoFocus) return
    const timer = setTimeout(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 50)
    return () => clearTimeout(timer)
  }, [autoFocus])

  const handleDragPointerDown = (e) => {
    if (!draggable) return
    if (e.target.closest('textarea')) return
    if (e.button !== 0 && e.pointerType === 'mouse') return

    e.stopPropagation()
    e.preventDefault()
    textareaRef.current?.blur()
    onSelect?.()

    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
    onMoveStart?.()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleDragPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    const dx = (e.clientX - drag.startClientX) / zoom / WORLD_WIDTH
    const dy = (e.clientY - drag.startClientY) / zoom / WORLD_HEIGHT

    if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) {
      drag.moved = true
    }

    onMove?.(dx, dy)
    drag.startClientX = e.clientX
    drag.startClientY = e.clientY
  }

  const handleDragPointerUp = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)

    if (drag.moved) {
      onMoveEnd?.()
    }
  }

  const handleTextareaPointerDown = (e) => {
    e.stopPropagation()
    onSelect?.()
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect?.()
    onContextMenu?.(e.clientX, e.clientY)
  }

  return (
    <div
      className={`sticker-note${isSelected ? ' selected' : ''}${draggable ? ' draggable' : ''}`}
      style={{
        left,
        top,
        width,
        height,
        backgroundColor: sticker.color,
      }}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      onPointerCancel={handleDragPointerUp}
      onContextMenu={handleContextMenu}
    >
      <div className="sticker-drag-handle" aria-hidden="true">
        <span className="sticker-grip">⠿</span>
      </div>

      <textarea
        ref={textareaRef}
        className="sticker-text"
        value={sticker.text}
        placeholder="Напишите заметку..."
        inputMode="text"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="on"
        spellCheck
        style={{ fontSize }}
        onChange={(e) => onTextChange?.(e.target.value)}
        onBlur={() => onTextCommit?.()}
        onPointerDown={handleTextareaPointerDown}
        onFocus={() => onSelect?.()}
      />
    </div>
  )
}